/**
 * `docx2.js` — THE SAME BODY, WHEN THE HEADINGS ARE ONLY A FONT SIZE.
 *
 *   node docx2.js <work-dir>/word/document.xml <out.md>
 *
 * ── WHEN TO REACH FOR THIS ───────────────────────────────────────────────────────────────────────────
 *
 * `docx.js` first, always. Come here only when it has told you it found no headings, which is what a
 * Google Docs export looks like: the download carries no `<w:pStyle>` and no `<w:outlineLvl>`, so there
 * is nothing in the file that says "this line is a section". The only remaining evidence is that the
 * line is set bigger than the ones around it.
 *
 * ── IT GUESSES, AND IT SAYS SO ───────────────────────────────────────────────────────────────────────
 *
 * The body size is the size most of the document is set in. Anything larger is a heading, and the
 * distinct larger sizes rank into levels. That is typography, not structure: a pull quote set large
 * becomes a heading here and a heading set at body size does not. LOOK AT THE RESULT. It prints the
 * sizes it decided on so that looking is quick.
 *
 * Everything else it does is `docx-core.js`, which is the point. This file used to be a copy of
 * `docx.js` with the heading logic changed, and the copy never received the fix that taught the
 * original to read `<m:oMath>`. For as long as that lasted, every Google Docs export carrying
 * equations came out of here looking clean and missing every single formula.
 */
const fs = require("node:fs");
const path = require("node:path");
const { ommlToLatex } = require("./omml.js");
const {
  runsOf,
  paraText,
  flatten,
  tableRows,
  gfmTable,
  emitter,
  listFormats,
  paraProps,
  BLOCK_RE,
} = require("./docx-core.js");

const [xmlPath, outPath] = process.argv.slice(2);
if (!xmlPath || !outPath) {
  console.error("usage: node docx2.js <work-dir>/word/document.xml <out.md>");
  process.exit(2);
}

const wordDir = path.dirname(xmlPath);
const xml = fs.readFileSync(xmlPath, "utf8");
const numberingPath = path.join(wordDir, "numbering.xml");
const listFormat = listFormats(
  fs.existsSync(numberingPath) ? fs.readFileSync(numberingPath, "utf8") : null,
);

const body = xml.slice(xml.indexOf("<w:body>"));
const text = (p) => flatten(paraText(p, ommlToLatex));

/** The size a paragraph is set in: the largest of its runs, since a heading may hold a small footnote. */
function sizeOf(blk) {
  return Math.max(0, ...runsOf(blk).map((r) => r.size));
}

/** Paragraph blocks only, in order, with their size and text. Tables are not evidence about headings. */
const paragraphs = [];
let m;
while ((m = BLOCK_RE.exec(body))) {
  if (m[0].startsWith("<w:tbl")) continue;
  const t = text(m[0]).trim();
  if (t) paragraphs.push({ size: sizeOf(m[0]), chars: t.length });
}

/*
 * THE BODY SIZE IS THE ONE MOST OF THE TEXT IS SET IN, weighted by how much text is set in it rather
 * than by how many paragraphs are. A document with forty one-line headings and eight long paragraphs
 * has more heading paragraphs than body paragraphs, and counting paragraphs would make the headings
 * the body and the body the headings.
 */
const weight = new Map();
for (const p of paragraphs) {
  if (!p.size) continue;
  weight.set(p.size, (weight.get(p.size) ?? 0) + p.chars);
}
const bodySize = [...weight].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
const headingSizes = [...weight.keys()]
  .filter((s) => s > bodySize)
  .sort((a, b) => b - a)
  .slice(0, 6);
const levelOf = (size) => {
  const at = headingSizes.indexOf(size);
  return at === -1 ? null : at + 1;
};

const out = emitter();
const counts = { paragraphs: 0, headings: 0, lists: 0, tables: 0 };

BLOCK_RE.lastIndex = 0;
while ((m = BLOCK_RE.exec(body))) {
  const blk = m[0];

  if (blk.startsWith("<w:tbl")) {
    const rows = tableRows(blk, (tc) =>
      (tc.match(/<w:p\b[\s\S]*?<\/w:p>/g) || []).map(text).join(" "),
    );
    const lines = gfmTable(rows);
    if (lines.length === 0) continue;
    counts.tables += 1;
    out.blank();
    for (const line of lines) out.line(line);
    out.blank();
    continue;
  }

  const t = text(blk).trim();
  if (!t) continue;
  counts.paragraphs += 1;

  const { numId, ilvl } = paraProps(blk);
  const level = numId === undefined ? levelOf(sizeOf(blk)) : null;

  if (level !== null) {
    counts.headings += 1;
    out.blank();
    out.line("#".repeat(level) + " " + t.replace(/\s*\n\s*/g, " "));
    out.blank();
    continue;
  }

  if (numId !== undefined) {
    counts.lists += 1;
    const marker = listFormat(numId, ilvl) === "ordered" ? "1." : "-";
    out.line(
      "  ".repeat(Number(ilvl)) + marker + " " + t.replace(/\s*\n\s*/g, " "),
    );
    continue;
  }

  out.blank();
  out.line(t);
  out.blank();
}

fs.writeFileSync(outPath, out.text());
console.log(
  `paragraphs=${counts.paragraphs} headings=${counts.headings} lists=${counts.lists} tables=${counts.tables}`,
);
console.log(
  `body set at ${bodySize || "?"}pt; heading sizes ${headingSizes.length ? headingSizes.map((s) => s + "pt").join(" > ") : "none found"}`,
);

if (counts.headings === 0 && counts.paragraphs >= 40) {
  console.error(
    `\n! NO HEADINGS, and this reads typography, so there is nothing left to read.\n` +
      `  Every paragraph in this document is set at the same size. The structure is not in the file:\n` +
      `  it is in what the words say, and only a person can put it back. Do that before composing.`,
  );
  process.exit(3);
}
