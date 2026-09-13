#!/usr/bin/env node
/**
 * `corpus-check.mjs` — RUN THE WHOLE INTAKE CHAIN OVER EVERY DOCUMENT IN A FOLDER, AND REPORT.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────────────────────────────
 *
 * Every bug worth finding in this pipeline was found by running a real document through it, and none of
 * them was found by reading the code. A fourth spelling of a bar that turned the sample mean into an
 * estimator, a normalise step that stripped the LaTeX escapes it ran before the check for, a picture
 * scan that saw 32 of 53 images, a dollar sign in a price that swallowed half a chapter: all of them
 * came out of somebody pointing this at a folder of actual summaries.
 *
 * Run it by hand and the last three of those stay hidden, because the fix for one is verified on the one
 * document that showed it and nothing re-runs the rest. That is what happened tonight, twice.
 *
 * ── IT TAKES A FOLDER. IT DOES NOT CARRY ONE. ────────────────────────────────────────────────────────
 *
 * The documents are course material: somebody's work, a university's exam papers, a back catalogue. They
 * do not belong in a public repository and they are not committed here. Point this at wherever they live.
 *
 *   node corpus-check.mjs <folder-of-docx> [--verbose]
 *
 * Exits 1 if any document fails to convert or any equation is refused, so it can gate a change.
 */
import {
  readdirSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  statSync,
} from "node:fs";
import { join, basename, resolve, extname } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const verbose = process.argv.includes("--verbose");
const target =
  process.argv[2] && !process.argv[2].startsWith("--")
    ? resolve(process.argv[2])
    : null;

if (!target || !existsSync(target)) {
  console.error("usage: corpus-check.mjs <folder-of-docx> [--verbose]\n");
  console.error(
    "Points at a folder of real summaries. They are not carried in this repo.",
  );
  process.exit(2);
}

/** Every `.docx` under the folder, at any depth. A course's materials are rarely flat. */
function findDocx(dir, depth = 0) {
  if (depth > 4) return [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.flatMap((e) => {
    if (e.name.startsWith(".") || e.name.startsWith("~$")) return [];
    const full = join(dir, e.name);
    if (e.isDirectory()) return findDocx(full, depth + 1);
    return extname(e.name).toLowerCase() === ".docx" ? [full] : [];
  });
}

function run(script, args) {
  try {
    return {
      ok: true,
      out: execFileSync("node", [join(HERE, script), ...args], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }),
    };
  } catch (err) {
    return { ok: false, out: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}

const files = findDocx(target).sort();
if (files.length === 0) {
  console.error(`No .docx found under ${target}`);
  process.exit(2);
}

console.log(`${files.length} document(s) under ${target}\n`);
console.log(
  `${"document".padEnd(42)} ${"pics".padStart(5)} ${"box".padStart(4)} ${"shp".padStart(4)} ${"eqs".padStart(6)} ${"bad".padStart(4)}  words`,
);
console.log("-".repeat(86));

let totalEqs = 0;
let totalBad = 0;
let failed = 0;

for (const file of files) {
  const name = basename(file, ".docx").slice(0, 42);
  const work = mkdtempSync(join(tmpdir(), "corpus-"));

  const opened = run("intake/open-docx.js", [file, work]);
  if (!opened.ok) {
    // A file that is not really a .docx is a finding about the FOLDER, not a failure of the chain.
    const why = /is a PDF|not an Office file/.test(opened.out)
      ? "NOT A .docx (wrong file)"
      : "open failed";
    console.log(`${name.padEnd(42)} ${why}`);
    failed += 1;
    continue;
  }

  const counts = JSON.parse(
    readFileSync(join(work, "media-inventory.json"), "utf8"),
  ).counts;
  run("intake/docx.js", [
    join(work, "word", "document.xml"),
    join(work, "s.txt"),
  ]);
  run("intake/normalise.js", [join(work, "s.txt"), join(work, "sor.txt")]);
  const katex = run("intake/katex-check.js", [join(work, "sor.txt")]);

  const m = /equations=(\d+) refused=(\d+)/.exec(katex.out);
  const eqs = m ? Number(m[1]) : 0;
  const bad = m ? Number(m[2]) : 0;
  const words = existsSync(join(work, "sor.txt"))
    ? readFileSync(join(work, "sor.txt"), "utf8").split(/\s+/).length
    : 0;

  totalEqs += eqs;
  totalBad += bad;
  if (bad > 0) failed += 1;

  console.log(
    `${name.padEnd(42)} ${String(counts.pictures).padStart(5)} ${String(counts.textboxes).padStart(4)} ${String(counts.shapes).padStart(4)} ${String(eqs).padStart(6)} ${String(bad).padStart(4)}  ${words}`,
  );
  if (bad > 0 && verbose)
    console.log(
      katex.out
        .split("\n")
        .slice(1, 9)
        .map((l) => `      ${l}`)
        .join("\n"),
    );
}

console.log("-".repeat(86));
console.log(
  `${files.length} documents, ${totalEqs} equations, ${totalBad} refused, ${failed} document(s) with a problem`,
);

if (totalBad > 0 || failed > 0) {
  console.error(`\n! Not clean. Run with --verbose to see what was refused.`);
  process.exit(1);
}
