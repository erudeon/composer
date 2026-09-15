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
 * document that showed it and nothing re-runs the rest.
 *
 * ── IT TAKES A FOLDER. IT DOES NOT CARRY ONE. ────────────────────────────────────────────────────────
 *
 * The documents are course material: somebody's work, a university's exam papers, a back catalogue. They
 * do not belong in a public repository and they are not committed here. Point this at wherever they live.
 *
 *   node corpus-check.mjs <folder-of-docx> [--verbose]
 *
 * Exits 1 if any document fails to convert, loses its structure, or has an equation refused, so it can
 * gate a change. EVERY step's exit code is read, including the ones that only print: a step whose
 * findings nobody is forced to look at is a step that stops being looked at.
 */
import { readdirSync, existsSync, mkdtempSync, readFileSync } from "node:fs";
import { join, basename, resolve, extname, dirname } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
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
      code: 0,
      out: execFileSync("node", [join(HERE, script), ...args], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }),
    };
  } catch (err) {
    return {
      code: err.status ?? 1,
      out: `${err.stdout ?? ""}${err.stderr ?? ""}`,
    };
  }
}

const files = findDocx(target).sort();
if (files.length === 0) {
  console.error(`No .docx found under ${target}`);
  process.exit(2);
}

const num = (out, key) =>
  Number(new RegExp(`${key}=(\\d+)`).exec(out)?.[1] ?? 0);

console.log(`${files.length} document(s) under ${target}\n`);
const head = (s, n) => String(s).padStart(n);
console.log(
  `${"document".padEnd(40)} ${head("pic", 4)} ${head("box", 3)} ${head("shp", 3)} ` +
    `${head("h", 4)} ${head("li", 4)} ${head("tbl", 3)} ${head("eqs", 5)} ${head("bad", 3)}  notes`,
);
console.log("-".repeat(96));

const totals = { eqs: 0, bad: 0, headings: 0 };
const problems = [];

for (const file of files) {
  const name = basename(file, ".docx").slice(0, 40);
  const work = mkdtempSync(join(tmpdir(), "corpus-"));

  const opened = run("intake/open-docx.js", [file, work]);
  if (opened.code !== 0) {
    /*
     * A file that is not really a .docx is a finding about the FOLDER, not a failure of the chain, and
     * so is an archive refused for being a bomb. Both already say why in one sentence: print that
     * rather than "open failed", which sends somebody to read the code to find out what happened.
     */
    const why = /is a PDF|not an Office file/.test(opened.out)
      ? "NOT A .docx (wrong file)"
      : (opened.out
          .split("\n")
          .map((l) => l.trim())
          .find(Boolean)
          ?.slice(0, 60) ?? "open failed");
    console.log(`${name.padEnd(40)} ${why}`);
    problems.push([name, why]);
    continue;
  }

  const counts = JSON.parse(
    readFileSync(join(work, "media-inventory.json"), "utf8"),
  ).counts;

  const extract = run("intake/docx.js", [
    join(work, "word", "document.xml"),
    join(work, "s.md"),
  ]);
  const notes = [];
  // Exit 3 is "no headings found", which is the Google Docs shape and the one failure that used to be
  // silent: the document came out flat and nothing downstream could tell that from a flat document.
  if (extract.code === 3) notes.push("NO HEADINGS (try docx2.js)");
  else if (extract.code !== 0) notes.push(`docx.js exit ${extract.code}`);

  const cleaned = run("intake/normalise.js", [
    join(work, "s.md"),
    join(work, "sor.md"),
  ]);
  if (cleaned.code !== 0) {
    for (const line of cleaned.out.split("\n")) {
      const t = line.trim();
      if (t.startsWith("!")) notes.push(t.replace(/^!\s*/, "").split(" — ")[0]);
    }
  }

  const katex = run("intake/katex-check.js", [join(work, "sor.md")]);
  const eqs = num(katex.out, "equations");
  const bad = num(katex.out, "refused");
  const headings = num(extract.out, "headings");

  /*
   * THE TWO HALVES MUST AGREE. `open-docx.js` counts the pictures in the file and `docx.js` counts the
   * markers it wrote for them; a picture with no marker is now a DEFECT rather than a non-event, and it
   * is invisible on its own because the inventory still lists the picture and the markdown still reads
   * fine. Both numbers were already in this scope and nothing compared them.
   */
  const marked = num(extract.out, "figures");
  if (marked < counts.pictures) {
    notes.push(
      `${counts.pictures - marked} picture(s) have no position marker, so they can only be placed by guessing`,
    );
  }

  totals.eqs += eqs;
  totals.bad += bad;
  totals.headings += headings;
  if (bad > 0 || extract.code === 3 || marked < counts.pictures)
    problems.push([name, notes.join("; ")]);

  console.log(
    `${name.padEnd(40)} ${head(counts.pictures, 4)} ${head(counts.textboxes, 3)} ` +
      `${head(counts.shapes, 3)} ${head(headings, 4)} ${head(num(extract.out, "lists"), 4)} ` +
      `${head(num(extract.out, "tables"), 3)} ${head(eqs, 5)} ${head(bad, 3)}  ${notes.join("; ")}`,
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

console.log("-".repeat(96));
console.log(
  `${files.length} documents, ${totals.headings} headings, ${totals.eqs} equations, ` +
    `${totals.bad} refused, ${problems.length} document(s) with a problem`,
);

if (problems.length > 0) {
  console.error(`\n! Not clean:`);
  for (const [name, why] of problems) console.error(`    ${name}  ${why}`);
  console.error(`\nRun with --verbose to see what was refused.`);
  process.exit(1);
}
