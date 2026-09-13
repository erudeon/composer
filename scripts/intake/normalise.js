/**
 * THE FOUR SOURCE ARTEFACTS, FIXED ONCE, IN THE ONE ORDER THAT WORKS.
 *
 *   node tools/content-intake/normalise.js <in.txt|in.md> [out.txt]
 *
 * Every course so far has rediscovered these four and written a throwaway script per unit for them —
 * `clean-problem5.cjs`, `strip-lecture-footers.cjs`, `fix-escapes.cjs` and so on, eleven units deep.
 * They are the same four every time and they are deterministic, so they belong here.
 *
 * THE ORDER IS LOAD-BEARING.
 *
 *  1. ENCODING FIRST, because everything after it reads characters. A source exported on Windows is
 *     often Windows-1252, and read as UTF-8 every ë, ï, é and — becomes U+FFFD. That happened silently
 *     for three units of a live course and was found only by hex-dumping a line.
 *
 *  2. PAGE FURNITURE SECOND, before any matching. `GradeGuru | Personality Psychology Page 38 of 81`
 *     appears inside the paragraph stream, and once it was spliced MID-SENTENCE, so it silently broke a
 *     verbatim match rather than looking like furniture. Strip it before authoring or the fidelity lint
 *     fails on text that is otherwise a perfect copy.
 *
 *  3. SOFT HYPHENS THIRD. A PDF breaks a word across lines with U+2010 plus whitespace: `uncon‐ scious`.
 *     Rejoined only between two letters — a blanket rejoin on an earlier course ate a real hyphen and
 *     produced `distressmaintaining`. Survivors are reported for a human.
 *
 *  4. BACKSLASH ESCAPES LAST, and DOUBLED ones too: a single-level fix looked right and left `\\~`
 *     behind, which broke a verbatim match 41 characters into a block. `\.` is deliberately left alone,
 *     because a numbered-heading escape is load-bearing in the source field.
 *
 * It writes the cleaned text and prints a report. It never edits in place: the raw file stays the thing
 * the fidelity check is diffed against.
 */
const fs = require("node:fs");
const path = require("node:path");

/** The footer itself, without the whitespace around it — which differs by where the footer sits. */
const FURNITURE_BODY = String.raw`(?:GradeGuru|PassTheYear)\s*\|[^\n]{0,120}?(?:Page|Pagina)\s+\d{1,4}\s+(?:of|van)\s+\d{1,4}`;

/**
 * The footer ALONE on its own line. It is a paragraph break once it is gone, so it leaves one behind:
 * replacing it with a space welds the paragraph before it to the heading after it, which destroys the
 * block structure at every page break and moves the text AWAY from the raw source the fidelity check
 * diffs against.
 */
const FURNITURE_OWN_LINE = new RegExp(String.raw`\n[ \t]*` + FURNITURE_BODY + String.raw`[ \t]*(?=\n)`, "gi");

/** The same footer spliced into a sentence. This one wants a space, because the sentence continues. */
const FURNITURE_INLINE = new RegExp(String.raw`[ \t]*` + FURNITURE_BODY + String.raw`[ \t]*`, "gi");

/** A word broken across a line: letter, U+2010, whitespace (a newline or not), letter. */
const SOFT_HYPHEN = /(\p{L})‐[ \t]*\r?\n?[ \t]*(\p{L})/gu;

/** Any surviving U+2010 — reported, never guessed at. */
const SOFT_HYPHEN_LEFT = /‐/gu;

/**
 * One or more backslashes before a character the exporter escaped for no reason here. `.` is excluded on
 * purpose: `1\.` is how a source writes a numbered heading it does not want auto-listed.
 */
const ESCAPES = /\\+([~+=)(\[\]\-*_])/g;

/**
 * ASK WHETHER THE BYTES ARE UTF-8, never whether the decode produced a replacement character.
 *
 * The lenient decoder turns any invalid sequence into U+FFFD, so "did it come out with U+FFFD" cannot
 * tell a Windows-1252 file from a UTF-8 file that genuinely CONTAINS one — and the second is the case
 * this tool exists to refuse. Worse, the bytes of a real U+FFFD (EF BF BD) decode under Windows-1252 to
 * a printable run, so the retry looked like a success and would have rewritten every accented character
 * in an otherwise fine file. A strict decoder answers the actual question: it THROWS on bytes that are
 * not UTF-8.
 */
function decode(buf) {
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(buf), encoding: "utf-8" };
  } catch {
    return { text: new TextDecoder("windows-1252").decode(buf), encoding: "windows-1252" };
  }
}

function normalise(raw) {
  const notes = [];

  const ownLine = (raw.match(FURNITURE_OWN_LINE) ?? []).length;
  let text = raw.replace(FURNITURE_OWN_LINE, "\n");
  const inline = (text.match(FURNITURE_INLINE) ?? []).length;
  text = text.replace(FURNITURE_INLINE, " ");
  notes.push(`page furniture removed: ${ownLine + inline} (${ownLine} on its own line, ${inline} mid-sentence)`);

  const joined = (text.match(SOFT_HYPHEN) ?? []).length;
  text = text.replace(SOFT_HYPHEN, "$1$2");
  const leftover = (text.match(SOFT_HYPHEN_LEFT) ?? []).length;
  notes.push(`soft hyphens rejoined: ${joined}`);
  if (leftover > 0) {
    notes.push(`! ${leftover} U+2010 left, not between two letters — read each one, do not blanket-replace`);
  }

  const unescaped = (text.match(ESCAPES) ?? []).length;
  text = text.replace(ESCAPES, "$1");
  notes.push(`backslash escapes removed: ${unescaped}`);

  // What a human still has to look at.
  const bullets = (text.match(/^\s*•/gm) ?? []).length;
  if (bullets > 0) notes.push(`! ${bullets} literal bullet(s) — these arrive orphaned from their item`);
  const slashes = (text.match(/\\/g) ?? []).length;
  if (slashes > 0) notes.push(`! ${slashes} backslash(es) still present — \\. is expected, anything else is not`);
  const long = text.split("\n").filter((l) => l.length > 500).length;
  if (long > 0) notes.push(`! ${long} line(s) over 500 chars — a table cell caps at 500, check these`);
  notes.push(`asterisks in the cleaned text: ${(text.match(/\*/g) ?? []).length}`);

  return { text, notes };
}

// Running it is the CLI; requiring it is the two pure functions above. Without this guard the argv
// parsing and its `process.exit` would run at import time, so neither could be tested.
if (require.main !== module) {
  module.exports = { normalise, decode };
} else {
  const [input, output] = process.argv.slice(2);
  if (!input) {
    console.error("usage: node tools/content-intake/normalise.js <in.txt> [out.txt]");
    process.exit(1);
  }

  const decoded = decode(fs.readFileSync(input));
  if (decoded.encoding !== "utf-8") {
    console.log("! decoded as WINDOWS-1252, not UTF-8 — every accented character would have been lost");
  }
  if (decoded.text.includes("�")) {
    console.error(
      `REFUSED: ${path.basename(input)} carries U+FFFD, the replacement character.\n` +
        `It is already corrupt: something read these bytes as the wrong encoding before you got them.\n` +
        `A replacement character inside a name is invisible in every later check and on the page.\n` +
        `Re-export the source rather than cleaning around it.`,
    );
    process.exit(2);
  }

  const { text, notes } = normalise(decoded.text);
  const out = output ?? input.replace(/(\.[^.]+)?$/, ".clean$1");
  fs.writeFileSync(out, text, "utf8");

  console.log(`\n${path.basename(input)} → ${path.basename(out)}  (${decoded.encoding})`);
  for (const note of notes) console.log(`  ${note}`);
  console.log(`\nA line beginning ! needs a person. The raw file is untouched: keep diffing against it.\n`);
}
