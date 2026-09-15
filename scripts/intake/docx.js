/**
 * `docx.js` — A WORD BODY AS MARKDOWN, WITH THE HEADINGS READ FROM THE STYLES.
 *
 *   node docx.js <work-dir>/word/document.xml <out.md> [<work-dir>/word/styles.xml]
 *
 * The third argument is optional and almost never passed: `styles.xml` and `numbering.xml` sit next to
 * `document.xml` in every folder `open-docx.js` produces, so they are found there.
 *
 * ── THE STYLE'S NAME IS NOT THE STYLE'S MEANING ──────────────────────────────────────────────────────
 *
 * This used to print the style's id and let a later step decide what `{Heading1}` meant. Two documents
 * in the corpus broke that: one written in a Hungarian Word, whose equation style is called `Egyenlet`,
 * and one exported from Google Docs, whose headings are a custom style with a name of its own. A rule
 * matching the English word found no headings in either and called both documents unstructured.
 *
 * Word does not work that way and neither does this any more. A style carries `<w:outlineLvl>`, in its
 * own definition or inherited through `<w:basedOn>`, and that is what makes it a heading whatever the
 * user interface calls it. The level comes from there, from the style's canonical `w:name` (which is
 * English even when the document is not), or from the id, in that order.
 *
 * ── IT SAYS WHEN IT FOUND NOTHING ────────────────────────────────────────────────────────────────────
 *
 * A document with no resolvable headings comes out of here as one flat run of paragraphs, and that is
 * indistinguishable from a document that genuinely has none. Nothing downstream could tell the
 * difference, so nothing downstream ever reported it: the course was simply built with every section at
 * the same level. A long document with no headings now exits non-zero and names `docx2.js`.
 */
const fs = require("node:fs");
const path = require("node:path");
const { ommlToLatex } = require("./omml.js");
const { relationships } = require("./open-docx.js");
const {
  headingLevels,
  authoredStyles,
  paraText,
  flatten,
  tableRows,
  gfmTable,
  emitter,
  listFormats,
  paraProps,
  BLOCK_RE,
} = require("./docx-core.js");

const [xmlPath, outPath, stylesArg] = process.argv.slice(2);
if (!xmlPath || !outPath) {
  console.error(
    "usage: node docx.js <work-dir>/word/document.xml <out.md> [<work-dir>/word/styles.xml]",
  );
  process.exit(2);
}

const wordDir = path.dirname(xmlPath);
const read = (p) => (fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null);
const xml = fs.readFileSync(xmlPath, "utf8");
const stylesXml = read(stylesArg ?? path.join(wordDir, "styles.xml"));
const levels = headingLevels(stylesXml);
const authored = authoredStyles(stylesXml);
const listFormat = listFormats(read(path.join(wordDir, "numbering.xml")));
/*
 * rId -> `word/media/imageN.png`, read by `open-docx.js` so the mapping has ONE home. The inventory and
 * the markers below must name the same file for the same picture, or a figure is placed from one
 * document into another one's prose.
 */
const rels = relationships(path.dirname(wordDir));

const body = xml.slice(xml.indexOf("<w:body>"));
const out = emitter();
const text = (p) => flatten(paraText(p, ommlToLatex));
const counts = { paragraphs: 0, headings: 0, lists: 0, tables: 0, authored: 0, figures: 0 };
const authoredSeen = new Map();

let m;
while ((m = BLOCK_RE.exec(body))) {
  const blk = m[0];

  if (blk.startsWith("<w:tbl")) {
    const rows = tableRows(blk, (tc) =>
      (tc.match(/<w:p\b[\s\S]*?<\/w:p>/g) || [])
        // A cell is inline by definition, so its equations take single delimiters.
        .map((cellPara) => flatten(paraText(cellPara, ommlToLatex, true)))
        .join(" "),
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

  /*
   * WHERE THE PICTURE SAT, as a marker on its own line.
   *
   * A picture lives in a paragraph of its own carrying no text, so the skip below used to drop it and
   * the position with it. `media-inventory.json` then said a picture existed and which HEADING it fell
   * under, and nothing anywhere said which paragraph: placing 58 figures meant guessing a paragraph per
   * picture inside a section that runs for pages. The marker is the missing half, and `images.mjs`
   * already documents substituting `[FIGURE:x]` for the markdown an upload answers.
   *
   * IT NAMES THE FILE, not an index. An index is only meaningful beside the inventory that minted it,
   * and the two are read by different steps at different times.
   *
   * A paragraph holding BOTH a picture and text emits the marker first. That is a position rounded to
   * the paragraph, not a wrong one, and it is the only honest answer: an inline picture has no place in
   * a line of Markdown prose to be put back into.
   */
  for (const blip of blk.matchAll(/<a:blip\b[^>]*r:embed="([^"]+)"/g)) {
    const target = rels[blip[1]];
    if (!target) continue;
    /*
     * A RELATIONSHIP'S TARGET IS RELATIVE TO `word/`, and `media-inventory.json` names the same file
     * from the work directory. Two spellings of one path is how a marker stops matching the inventory
     * entry it belongs to, so the marker is written in the inventory's spelling.
     */
    const file = target.startsWith("word/") ? target : `word/${target}`;
    counts.figures += 1;
    out.blank();
    out.line(`[FIGURE:${file}]`);
    out.blank();
  }

  if (!t) continue;
  counts.paragraphs += 1;

  const { style, numId, ilvl, outline } = paraProps(blk);
  // A paragraph may override its style's outline level, and that override is the document's last word.
  const level =
    outline !== undefined
      ? Math.min(6, Math.max(1, Number(outline) + 1))
      : (levels.get(style) ?? null);

  if (level !== null) {
    counts.headings += 1;
    out.blank();
    // A heading holds one line: a newline inside it ends the heading and orphans the rest of it.
    out.line("#".repeat(level) + " " + t.replace(/\s*\n\s*/g, " "));
    out.blank();
    continue;
  }

  if (numId !== undefined) {
    counts.lists += 1;
    // Every ordered item is written "1." on purpose: Markdown numbers the list itself, and a hand-typed
    // sequence goes wrong the moment an item is inserted.
    const marker = listFormat(numId, ilvl) === "ordered" ? "1." : "-";
    out.line(
      "  ".repeat(Number(ilvl)) + marker + " " + t.replace(/\s*\n\s*/g, " "),
    );
    continue;
  }

  out.blank();
  /*
   * WHAT THE AUTHOR CALLED THIS PARAGRAPH, when they called it anything. Written as an HTML comment on
   * its own line, followed by a blank one: it is invisible on any rendered page, it changes not one
   * character of the prose the verbatim lint diffs, and a parser can read it with a single test.
   *
   * The blank line is load-bearing. An HTML block in Markdown runs until a blank line, so a comment
   * sitting directly above a paragraph swallows it.
   */
  const styleName = authored.get(style);
  if (styleName) {
    counts.authored += 1;
    authoredSeen.set(styleName, (authoredSeen.get(styleName) ?? 0) + 1);
    out.line(`<!-- style: ${styleName} -->`);
    out.blank();
  }
  out.line(t);
  out.blank();
}

fs.writeFileSync(outPath, out.text());
console.log(
  `paragraphs=${counts.paragraphs} headings=${counts.headings} lists=${counts.lists} ` +
    `tables=${counts.tables} authored=${counts.authored} figures=${counts.figures}`,
);
if (authoredSeen.size > 0) {
  console.log(
    `the author named these paragraphs: ` +
      [...authoredSeen].map(([n, c]) => `${n} (${c})`).join(", ") +
      `\n  That is their own answer to what each one is FOR. Carry it into layout; do not re-guess it.`,
  );
}

/*
 * ponytail: 40 paragraphs is the line between "a cheat sheet, which really has no headings" and "a
 * summary whose headings this failed to find". The densest cheat sheet in the corpus runs to 60
 * paragraphs and carries 89 equations in 530 words; the shortest real summary runs to several hundred.
 * Raise it if a real document ever lands in between.
 */
if (counts.headings === 0 && counts.paragraphs >= 40) {
  console.error(
    `\n! NO HEADINGS across ${counts.paragraphs} paragraphs, so this came out as one flat run.\n` +
      `  Nothing later can tell that from a document that genuinely has none, which is why it is said here.\n` +
      `  A Google Docs export carries no usable styles: run docx2.js instead, which reads the typography.\n` +
      `  Then LOOK at the result. That is a guess about font sizes, not a reading of structure.`,
  );
  process.exit(3);
}
