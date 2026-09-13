#!/usr/bin/env node
/**
 * `security-check.mjs` — THE THINGS A FILE SOMEBODY SENT US COULD DO TO THIS MACHINE.
 *
 *   node scripts/security-check.mjs
 *
 * ── WHY THIS IS A SCRIPT AND NOT A PARAGRAPH ─────────────────────────────────────────────────────────
 *
 * Every input this plugin touches is somebody else's file. A `.docx` is a zip an author emailed, and the
 * chain unzips it, reads its XML with regular expressions, and writes what it finds into a folder. Each
 * of those steps has a well-known way to go wrong, and a note in a document saying "we checked" goes
 * stale the first time somebody edits a regex.
 *
 * So the checks run. A refusal is a failing check here, not a sentence in a README.
 *
 * Exits non-zero if any probe finds something.
 */
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  writeFileSync,
  existsSync,
  readFileSync,
  readdirSync,
  mkdirSync,
} from "node:fs";
import { join, dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let failed = 0;
const probe = (ok, what, detail) => {
  if (!ok) failed += 1;
  console.log(
    `${ok ? "ok  " : "FAIL"} ${what}${detail ? `\n       ${detail}` : ""}`,
  );
};

const work = mkdtempSync(join(tmpdir(), "seccheck-"));

/*
 * ── 1. CATASTROPHIC BACKTRACKING ────────────────────────────────────────────────────────────────────
 *
 * The maths scanner runs over every byte of an untrusted document, and its inline pattern alternates
 * `\$` with "anything but a dollar". Those two overlap on a backslash, which is the exact shape that
 * makes a regex take exponential time. A document of backslashes must not hang an intake.
 */
{
  const { mathsSpans } = require(join(ROOT, "scripts/intake/maths-spans.js"));
  const timed = (text) => {
    const t = Date.now();
    mathsSpans(text);
    return Date.now() - t;
  };
  const backslashes = timed(
    "$" + "\\".repeat(5000) + " and never a closing delimiter",
  );
  const unclosed = timed("$" + "a".repeat(200000));
  const many = timed(("$" + "x".repeat(399) + " ").repeat(3000));
  const worst = Math.max(backslashes, unclosed, many);
  probe(
    worst < 5000,
    "the maths scanner does not backtrack catastrophically",
    `5,000 backslashes ${backslashes}ms, 200 KB unclosed ${unclosed}ms, 3,000 near-limit spans ${many}ms`,
  );
}

/*
 * ── 2. A DECOMPRESSION BOMB ─────────────────────────────────────────────────────────────────────────
 *
 * A megabyte of zeros expands to a gigabyte, and `unzip` will write every byte of it. The only symptom
 * is a full disk on the operator's own laptop, halfway through somebody's course.
 */
{
  const stage = mkdtempSync(join(tmpdir(), "bomb-"));
  mkdirSync(join(stage, "word"), { recursive: true });
  writeFileSync(
    join(stage, "word", "document.xml"),
    Buffer.alloc(600 * 1024 * 1024),
  );
  const bomb = join(work, "bomb.docx");
  execFileSync("zip", ["-q", "-9", bomb, "word/document.xml"], { cwd: stage });
  const out = mkdtempSync(join(tmpdir(), "bombout-"));
  let refused = false;
  let said = "";
  try {
    execFileSync(
      "node",
      [join(ROOT, "scripts/intake/open-docx.js"), bomb, out],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
  } catch (e) {
    refused = true;
    said = `${e.stdout ?? ""}${e.stderr ?? ""}`.trim().split("\n")[0];
  }
  const wrote = existsSync(join(out, "word"));
  probe(
    refused && !wrote,
    "a decompression bomb is refused before anything is written",
    refused
      ? said.slice(0, 140)
      : "IT UNPACKED. An archive can fill the operator's disk.",
  );
}

/*
 * ── 3. AN ENTRY THAT WALKS OUT OF ITS FOLDER ────────────────────────────────────────────────────────
 *
 * Info-ZIP refuses a traversal, and `unsafeToUnpack` refuses it too, from the central directory. Two
 * locks, because "the tool we shell out to happens to refuse it" is not a property this repo controls.
 */
{
  const { unsafeToUnpack } = require(join(ROOT, "scripts/intake/docx-zip.js"));
  const fake = (name) => {
    // A central directory with one entry carrying `name`. Enough for the check under test to read.
    const n = Buffer.from(name, "latin1");
    const cd = Buffer.alloc(46 + n.length);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt32LE(10, 20);
    cd.writeUInt32LE(10, 24);
    cd.writeUInt16LE(n.length, 28);
    n.copy(cd, 46);
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(1, 10);
    eocd.writeUInt32LE(0, 16);
    return Buffer.concat([cd, eocd]);
  };
  const caught = [
    "../../../etc/passwd",
    "/etc/passwd",
    "word/../../escape.txt",
  ].every((name) => unsafeToUnpack(fake(name)) !== null);
  const allows = unsafeToUnpack(fake("word/document.xml")) === null;
  probe(
    caught && allows,
    "an archive entry pointing outside its folder is refused, and a normal one is not",
  );
}

/*
 * ── 4. NOTHING REACHES A SHELL ──────────────────────────────────────────────────────────────────────
 *
 * `execFileSync` with an argument array means no shell parses a filename, so a document called
 * `; rm -rf ~` is just a bad name. `exec` or `shell: true` would undo that for every script here.
 */
{
  const files = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.(js|mjs)$/.test(e.name)) files.push(full);
    }
  };
  walk(join(ROOT, "scripts"));
  const offenders = [];
  for (const f of files) {
    if (f.endsWith("security-check.mjs")) continue;
    for (const [i, line] of readFileSync(f, "utf8").split("\n").entries()) {
      const code = line.replace(/^\s*[*/].*/, "");
      if (/\bexecSync\s*\(|\bexec\s*\(\s*[`"']|shell\s*:\s*true/.test(code))
        offenders.push(`${f.replace(ROOT + "/", "")}:${i + 1}`);
    }
  }
  probe(
    offenders.length === 0,
    "no script reaches a shell: every external call passes an argument array",
    offenders.length ? offenders.join(", ") : "",
  );
}

/*
 * ── 5. A COURSE NAME CANNOT ESCAPE THE WORKSPACE ────────────────────────────────────────────────────
 *
 * A course name reaches this from an operator, a document title or a model. It becomes a folder, so it
 * has to be a slug and nothing else.
 */
{
  const home = mkdtempSync(join(tmpdir(), "ws-"));
  for (const name of [
    "../../../../tmp/escaped",
    "..",
    "/etc",
    "a/../../b",
    "....//....//evil",
  ]) {
    try {
      execFileSync(
        "node",
        [join(ROOT, "scripts/workspace.mjs"), "init", name],
        {
          stdio: "ignore",
          env: { ...process.env, COMPOSER_HOME: home },
        },
      );
    } catch {
      /* a refusal is also an acceptable answer */
    }
  }
  // Anything created must be a direct child of the workspace: one path segment, no dots.
  const made = readdirSync(home, { withFileTypes: true }).filter((e) =>
    e.isDirectory(),
  );
  const bad = made.filter((e) => !/^[a-z0-9][a-z0-9-]*$/.test(e.name));
  probe(
    bad.length === 0,
    "a course name becomes a slug and cannot climb out of the workspace",
    `created: ${made.map((e) => e.name).join(", ") || "(none)"}`,
  );
}

/*
 * ── 6. A TOKEN NEVER REACHES THE OUTPUT ─────────────────────────────────────────────────────────────
 *
 * Two uploads were lost to an agent hunting for a credential: one posted an unrelated service's secret
 * to this API, and one printed a third into a transcript, where it stayed.
 */
{
  const files = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.(js|mjs)$/.test(e.name)) files.push(full);
    }
  };
  walk(join(ROOT, "scripts"));
  const printing = [];
  for (const f of files) {
    for (const [i, line] of readFileSync(f, "utf8").split("\n").entries()) {
      if (!/console\.(log|error|warn)/.test(line)) continue;
      // The name of the variable is fine to print. Its VALUE is not.
      if (/\$\{[^}]*(token|secret|password|authorization)[^}]*\}/i.test(line))
        printing.push(`${f.replace(ROOT + "/", "")}:${i + 1}`);
    }
  }
  probe(
    printing.length === 0,
    "no script prints a credential",
    printing.length ? printing.join(", ") : "",
  );
}

console.log(
  `\n${failed === 0 ? "every probe clean" : `${failed} probe(s) FAILED`}`,
);
process.exit(failed === 0 ? 0 : 1);
