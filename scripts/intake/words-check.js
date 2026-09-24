/**
 * `words-check.js` — IS EVERY WORD OF THE BODY IN THE MARKDOWN, at least as often as the document has it?
 *
 *   node words-check.js <work-dir>/word/document.xml <out.md>
 *
 * Exit 1 and a list of what went missing, with the paragraph each word came from, when anything did.
 *
 * ── WHY IT SHARES NOTHING WITH `docx.js` ─────────────────────────────────────────────────────────────
 *
 * `docx.js` reads Word's XML with regular expressions, and a paragraph anchoring a floating text box
 * ended at the box's own inner `</w:p>`: the list item printed the box's words as its own and its own
 * sentence was lost, with nothing anywhere saying so. A check built from the same matchers would have
 * lost the same sentence and read clean. So this one uses a real XML parser and no code of that
 * chain's, and it asks the plainest question there is.
 *
 * What it counts: the text of every paragraph in `<w:body>`, table cells included, leaving out
 * `<w:txbxContent>` (a text box is listed in `media-inventory.json` and settled there) and
 * `<mc:Fallback>` (Word's second copy of whatever `<mc:Choice>` already holds). A word is a run of
 * letters and digits, so escapes and punctuation cannot make one differ. An asterisk in the markdown
 * is emphasis or multiplication and nothing says which: Word bolds half a word as often as a whole
 * one, so `**S**tatement` is one word on the page, while `z*σ` is two. A word is there if either
 * reading has it.
 *
 * Equations are not `<w:t>` and are not counted, since `omml.js` rewrites them as LaTeX and
 * `katex-check.js` is their check, but each one ends a word: "f", an equation, and "is" are two words,
 * not "fis". So does a non-breaking hyphen, which Word writes as an element rather than a character:
 * "well", `<w:noBreakHyphen/>`, "known" is two words, and a reader that drops the element welds them.
 *
 * It can only see a LOSS. A word printed twice is not caught here.
 */
const fs = require("node:fs");
const path = require("node:path");

let SaxesParser;
try {
  ({ SaxesParser } = require("saxes"));
} catch {
  // The first line is what corpus-check prints beside the document, so it has to be the fix.
  console.error(
    `! words-check needs saxes, which is not installed: cd "${path.resolve(__dirname, "..", "..")}" && npm install`,
  );
  process.exit(2);
}

const LEFT_OUT = new Set(["w:txbxContent", "mc:Fallback"]);
const SPACE = new Set(["w:tab", "w:br", "w:cr", "w:noBreakHyphen", "m:oMath"]);
const words = (s) => s.normalize("NFC").match(/[\p{L}\p{N}]+/gu) ?? [];

/** Every body paragraph's own text, in document order. */
function bodyParagraphs(xml) {
  const parser = new SaxesParser();
  const done = [];
  const open = [];
  let inBody = false;
  let leftOut = 0;
  let inText = false;
  parser.on("opentag", (tag) => {
    if (tag.name === "w:body") inBody = true;
    if (LEFT_OUT.has(tag.name)) leftOut += 1;
    if (!inBody || leftOut) return;
    if (tag.name === "w:p") open.push("");
    else if (tag.name === "w:t") inText = true;
    else if (SPACE.has(tag.name) && open.length) open[open.length - 1] += " ";
  });
  parser.on("text", (text) => {
    if (inText && open.length) open[open.length - 1] += text;
  });
  parser.on("closetag", (tag) => {
    if (LEFT_OUT.has(tag.name)) leftOut -= 1;
    else if (leftOut) return;
    else if (tag.name === "w:t") inText = false;
    else if (tag.name === "m:oMath" && open.length)
      open[open.length - 1] += " ";
    else if (tag.name === "w:p" && open.length) done.push(open.pop());
    else if (tag.name === "w:body") inBody = false;
  });
  parser.write(xml).close();
  return done;
}

const tally = (list) => {
  const n = new Map();
  for (const w of list) n.set(w, (n.get(w) ?? 0) + 1);
  return n;
};

/**
 * Each word the document has more often than the markdown does. `where` is the paragraph holding the
 * most of the missing words, which is the one that lost them rather than the first to use the word.
 */
function lostWords(documentXml, markdown) {
  const paragraphs = bodyParagraphs(documentXml).map((text) => ({
    text,
    words: words(text),
  }));
  const source = tally(paragraphs.flatMap((p) => p.words));
  const asWritten = tally(words(markdown));
  const unmarked = tally(words(markdown.replace(/\*/g, "")));
  const output = (word) =>
    Math.max(asWritten.get(word) ?? 0, unmarked.get(word) ?? 0);
  const missing = [...source].filter(([word, count]) => output(word) < count);
  const gone = new Set(missing.map(([word]) => word));
  const score = (p) => new Set(p.words.filter((w) => gone.has(w))).size;
  const lost = missing.map(([word, count]) => ({
    word,
    source: count,
    output: output(word),
    where: paragraphs
      .filter((p) => p.words.includes(word))
      .reduce((best, p) => (score(p) > score(best) ? p : best)).text,
  }));
  return { paragraphs: paragraphs.length, lost };
}

module.exports = { lostWords };

if (require.main === module) {
  const [xmlPath, mdPath] = process.argv.slice(2);
  if (!xmlPath || !mdPath) {
    console.error(
      "usage: node words-check.js <work-dir>/word/document.xml <out.md>",
    );
    process.exit(2);
  }
  const { paragraphs, lost } = lostWords(
    fs.readFileSync(xmlPath, "utf8"),
    fs.readFileSync(mdPath, "utf8"),
  );
  if (!lost.length) {
    console.log(
      `every word of ${paragraphs} body paragraphs is in the markdown`,
    );
    process.exit(0);
  }
  console.error(
    `! ${lost.length} word(s) of ${paragraphs} body paragraphs are missing from the markdown:`,
  );
  for (const l of lost)
    console.error(
      `  "${l.word}" ${l.source}x in the document, ${l.output}x in the markdown, from: ${l.where.trim().slice(0, 120)}`,
    );
  process.exit(1);
}
