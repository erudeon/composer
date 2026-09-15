/**
 * THE FOUR SOURCE ARTEFACTS, FIXED ONCE, IN THE ONE ORDER THAT WORKS.
 *
 *   node scripts/intake/normalise.js <in.md> [out.md]
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
 * the fidelity check is diffed against. It exits NON-ZERO when the report holds a line beginning `!`,
 * because a finding nobody is forced to read is a finding nobody reads.
 */
const fs = require("node:fs");
const path = require("node:path");
const { mathsSpans } = require("./maths-spans.js");

/** The footer itself, without the whitespace around it — which differs by where the footer sits. */
const FURNITURE_BODY = String.raw`(?:GradeGuru|PassTheYear)\s*\|[^\n]{0,120}?(?:Page|Pagina)\s+\d{1,4}\s+(?:of|van)\s+\d{1,4}`;

/**
 * The footer ALONE on its own line. It is a paragraph break once it is gone, so it leaves one behind:
 * replacing it with a space welds the paragraph before it to the heading after it, which destroys the
 * block structure at every page break and moves the text AWAY from the raw source the fidelity check
 * diffs against.
 */
const FURNITURE_OWN_LINE = new RegExp(
  String.raw`\n[ \t]*` + FURNITURE_BODY + String.raw`[ \t]*(?=\n)`,
  "gi",
);

/** The same footer spliced into a sentence. This one wants a space, because the sentence continues. */
const FURNITURE_INLINE = new RegExp(
  String.raw`[ \t]*` + FURNITURE_BODY + String.raw`[ \t]*`,
  "gi",
);

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
 * MATHS IS NOT AN EXPORTER ARTEFACT, AND THE RULE ABOVE WAS EATING IT.
 *
 * A backslash before an underscore inside `$...$` is a LaTeX escape KaTeX requires. The same two
 * characters in prose are a Word export escaping something for no reason. Stripping both meant every
 * maths span carrying one came out invalid, and the check that catches that runs on the file AFTER
 * this step. Measured on a real Data Analytics summary: the extract held 100 equations and 0 refusals,
 * and this step turned 16 of them into parse errors. Silently, on every document it had ever seen.
 *
 * So the maths is lifted out before any cleanup and put back untouched. WHERE the maths is comes from
 * `maths-spans.js` and not from a pattern of its own: this file used to carry a second, looser answer
 * to that question, which meant a span the checker correctly ignored was still protected from cleanup.
 * A page footer between two currency signs survived normalisation that way, silently.
 */
/*
 * THE PLACEHOLDER, BUILT RATHER THAN TYPED.
 *
 * It has to be a character no rule below rewrites and no real document contains, and U+0000 is the only
 * honest choice. Writing it as a literal byte makes THIS FILE binary: `grep` skips it, git diffs it as
 * binary, and a formatter is entitled to eat it. Writing it as `\u0000` inside a template literal is
 * what was meant, and twice now a tool on the way in turned that escape back into the byte.
 *
 * `String.fromCharCode` cannot be misread by anything, so it is what stays.
 */
const MARK = String.fromCharCode(0) + "M";
const HOLD_RE = new RegExp(String.fromCharCode(0) + "M(\\d+)" + String.fromCharCode(0), "g");

function protectMaths(text) {
  const held = [];
  let masked = "";
  let at = 0;
  for (const span of mathsSpans(text)) {
    // A placeholder holding no character any rule below rewrites, and none a real document contains.
    // Spelt as an escape and not typed as a byte: written literally it makes this source file binary,
    // which hides it from grep and invites an editor to eat it.
    held.push(text.slice(span.start, span.end));
    masked +=
      text.slice(at, span.start) +
      MARK +
      (held.length - 1) +
      String.fromCharCode(0);
    at = span.end;
  }
  masked += text.slice(at);
  return {
    masked,
    restore: (t) => t.replace(HOLD_RE, (_, i) => held[Number(i)]),
  };
}

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
    return {
      text: new TextDecoder("utf-8", { fatal: true }).decode(buf),
      encoding: "utf-8",
    };
  } catch {
    return {
      text: new TextDecoder("windows-1252").decode(buf),
      encoding: "windows-1252",
    };
  }
}

function normalise(rawInput) {
  const notes = [];

  // Every rule below runs on PROSE only. The maths goes back in untouched at the end.
  const { masked: raw, restore } = protectMaths(rawInput);

  const ownLine = (raw.match(FURNITURE_OWN_LINE) ?? []).length;
  let text = raw.replace(FURNITURE_OWN_LINE, "\n");
  const inline = (text.match(FURNITURE_INLINE) ?? []).length;
  text = text.replace(FURNITURE_INLINE, " ");
  notes.push(
    `page furniture removed: ${ownLine + inline} (${ownLine} on its own line, ${inline} mid-sentence)`,
  );

  const joined = (text.match(SOFT_HYPHEN) ?? []).length;
  text = text.replace(SOFT_HYPHEN, "$1$2");
  const leftover = (text.match(SOFT_HYPHEN_LEFT) ?? []).length;
  notes.push(`soft hyphens rejoined: ${joined}`);
  if (leftover > 0) {
    notes.push(
      `! ${leftover} U+2010 left, not between two letters — read each one, do not blanket-replace`,
    );
  }

  const unescaped = (text.match(ESCAPES) ?? []).length;
  text = text.replace(ESCAPES, "$1");
  notes.push(`backslash escapes removed: ${unescaped}`);

  /*
   * A NON-BREAKING SPACE IS A SPACE. Word writes U+00A0 after a bold lead-in constantly, and one real
   * 12-week summary carried 57. It DRAWS as an ordinary space, so nothing on the page ever looks
   * wrong and every later phase that matches a line by its text silently misses it.
   *
   * Prose only, which `protectMaths` above has already guaranteed: KaTeX draws U+00A0 as a real
   * space, so one inside an equation is the author holding two words of a name apart and replacing it
   * would change what is drawn.
   */
  const nbsp = (text.match(/ /g) ?? []).length;
  text = text.replace(/ /g, " ");
  notes.push(`non-breaking spaces: ${nbsp}`);

  // What a human still has to look at.
  /*
   * A LITERAL BULLET IS A BULLET THE AUTHOR TYPED, and it arrives orphaned from the item it belongs to.
   * It is NOT a list the extractor found: `docx.js` writes those as `-`, reading Word's own numbering.
   * For as long as the extractor emitted `•` itself, this fired on 111 of 134 real documents and meant
   * nothing, which is how a check teaches people to skip it.
   */
  const bullets = (text.match(/^\s*[•▪◦]/gm) ?? []).length;
  if (bullets > 0)
    notes.push(
      `! ${bullets} literal bullet(s) typed into the text — these arrive orphaned from their item`,
    );
  /*
   * A HEADING THAT IS REALLY A PARAGRAPH.
   *
   * An author applies a heading style to a body paragraph and Word records it as one, so the extractor
   * faithfully emits four hundred words behind a `###`. The write path then refuses the lecture twice
   * over, for a heading at a depth the outline does not have and for a section that opens onto nothing,
   * and neither message says the real cause. Found on a real Philosophy summary, where two entire
   * paragraphs were styled Heading 3.
   *
   * 120 characters is comfortably longer than any real heading and far shorter than a paragraph.
   */
  const longHeadings = text
    .split("\n")
    .filter((l) => /^#{1,6}\s/.test(l) && l.length > 120).length;
  if (longHeadings > 0)
    notes.push(
      `! ${longHeadings} heading(s) over 120 characters, which are paragraphs the author styled as headings` +
        ` — the write path refuses these twice over, and neither refusal names the cause`,
    );

  /*
   * THE READER'S OUTLINE STOPS AT THREE. A `####` in the source is legitimate in Word and has no home
   * on the page: the write path takes `##` for a section and `###` for a subsection and nothing else.
   * Reported here rather than rewritten, because folding it into a section or turning it into a bold
   * lead-in is a judgement about the text.
   */
  const tooDeep = (text.match(/^#{4,}\s/gm) ?? []).length;
  if (tooDeep > 0)
    notes.push(
      `! ${tooDeep} heading(s) deeper than ### — the outline is ## and ### and nothing else, so each` +
        ` must be folded into a section or become a bold lead-in on the paragraph it introduces`,
    );

  const slashes = (text.match(/\\/g) ?? []).length;
  if (slashes > 0)
    notes.push(
      `! ${slashes} backslash(es) still present — \\. is expected, anything else is not`,
    );
  /*
   * THE 500 CAP IS A TABLE CELL'S, so only a table row can break it. Measured against every line, this
   * fired on 72 of 134 documents and was reporting long paragraphs, which are not a defect and are not
   * capped anywhere.
   */
  const wide = text
    .split("\n")
    .filter((l) => l.trimStart().startsWith("|") && l.length > 500).length;
  if (wide > 0)
    notes.push(
      `! ${wide} table row(s) over 500 chars — a cell caps at 500, split these`,
    );
  notes.push(
    `asterisks in the cleaned text: ${(text.match(/\*/g) ?? []).length}`,
  );

  return { text: restore(text), notes };
}

// Running it is the CLI; requiring it is the two pure functions above. Without this guard the argv
// parsing and its `process.exit` would run at import time, so neither could be tested.
if (require.main !== module) {
  module.exports = { normalise, decode };
} else {
  const [input, output] = process.argv.slice(2);
  if (!input) {
    console.error("usage: node scripts/intake/normalise.js <in.md> [out.md]");
    process.exit(1);
  }

  const decoded = decode(fs.readFileSync(input));
  if (decoded.encoding !== "utf-8") {
    console.log(
      "! decoded as WINDOWS-1252, not UTF-8 — every accented character would have been lost",
    );
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

  console.log(
    `\n${path.basename(input)} → ${path.basename(out)}  (${decoded.encoding})`,
  );
  for (const note of notes) console.log(`  ${note}`);

  /*
   * FAIL LOUDLY. Every `!` above is something a person has to look at, and for as long as this exited 0
   * the whole report was advisory: a script running the chain saw success and moved on. It is safe to
   * be strict now that the two findings which fired on most of the corpus were fixed at their causes
   * rather than at their thresholds.
   */
  const findings = notes.filter((n) => n.startsWith("!"));
  if (findings.length > 0) {
    console.error(
      `\n${findings.length} finding(s) above need a person. The raw file is untouched: keep diffing against it.\n`,
    );
    process.exit(1);
  }
  console.log(
    `\nNothing here needs a person. The raw file is untouched: keep diffing against it.\n`,
  );
}
