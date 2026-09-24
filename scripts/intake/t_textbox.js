/**
 * A PARAGRAPH THAT ANCHORS A FLOATING TEXT BOX KEEPS ITS OWN WORDS.
 *
 *   node scripts/intake/t_textbox.js
 *
 * Found on a real summary (Applied Microeconomics, lecture 1, "Market Failures", list item 2). Word holds
 * the text box "Missing markets" in a run of the item, twice (DrawingML in `<mc:Choice>`, VML in
 * `<mc:Fallback>`), and the item's own sentence after it. `BLOCK_RE` is non-greedy, so the item ended at
 * the box's inner `</w:p>`: it came out as "1. M**issing markets**", the fallback copy came out as a
 * stray "**Missing markets**" paragraph, and "Public goods – free-rider problems lead to under
 * provision." was gone. The fixture below is that paragraph's shape, cut down.
 *
 * Two readers are driven, `docx.js` and `docx2.js`, and each is judged twice: on the exact lines, and by
 * `words-check.js`, which counts the body's words with a real XML parser and shares no code with either.
 */
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { lostWords } = require("./words-check.js");

let failed = 0;
let ran = 0;
const check = (what, got, expected) => {
  const ok = JSON.stringify(got) === JSON.stringify(expected);
  ran += 1;
  if (!ok) failed += 1;
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok)
    console.log(
      `       expected ${JSON.stringify(expected)}\n       got      ${JSON.stringify(got)}`,
    );
};

const run = (text, bold = false) =>
  `<w:r>${bold ? "<w:rPr><w:b/></w:rPr>" : ""}<w:t xml:space="preserve">${text}</w:t></w:r>`;
const box = (inner) =>
  `<w:txbxContent><w:p><w:pPr><w:jc w:val="center"/></w:pPr>${inner}</w:p></w:txbxContent>`;
/** A text box as Word writes one: DrawingML for those who can read it, VML for those who cannot. */
const textBox = (inner) =>
  `<w:r><mc:AlternateContent><mc:Choice Requires="wps"><w:drawing><wp:anchor><a:graphic><a:graphicData>` +
  `<wps:wsp><wps:txbx>${box(inner)}</wps:txbx></wps:wsp></a:graphicData></a:graphic></wp:anchor></w:drawing>` +
  `</mc:Choice><mc:Fallback><w:pict><v:shape><v:textbox>${box(inner)}</v:textbox></v:shape></w:pict>` +
  `</mc:Fallback></mc:AlternateContent></w:r>`;
const item = (inner) =>
  `<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>${inner}</w:p>`;

const BODY =
  item(run("Market power", true) + run(" – monopolies restrict output.")) +
  item(
    textBox(run("M", true) + run("issing markets", true)) +
      run("Public goods", true) +
      run(" – free-rider problems lead to under provision."),
  ) +
  item(run("Externalities", true) + run(" – costs spill over onto others.")) +
  `<w:p>${run("The last three are sometimes called ")}${run("missing markets", true)}${run(".")}</w:p>`;

const NUMBERING =
  `<?xml version="1.0"?><w:numbering><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0">` +
  `<w:numFmt w:val="decimal"/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/>` +
  `</w:num></w:numbering>`;

/** The markdown one reader writes for one body, in a work directory shaped as `open-docx.js` makes it. */
function convert(reader, body) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "t_textbox-"));
  fs.mkdirSync(path.join(dir, "word", "_rels"), { recursive: true });
  const documentXml = `<?xml version="1.0"?><w:document><w:body>${body}</w:body></w:document>`;
  fs.writeFileSync(path.join(dir, "word", "document.xml"), documentXml);
  fs.writeFileSync(path.join(dir, "word", "numbering.xml"), NUMBERING);
  fs.writeFileSync(
    path.join(dir, "word", "_rels", "document.xml.rels"),
    `<?xml version="1.0"?><Relationships/>`,
  );
  const out = path.join(dir, "out.md");
  execFileSync(
    process.execPath,
    [path.join(__dirname, reader), path.join(dir, "word", "document.xml"), out],
    {
      stdio: "pipe",
    },
  );
  const markdown = fs.readFileSync(out, "utf8");
  fs.rmSync(dir, { recursive: true, force: true });
  return {
    documentXml,
    markdown,
    lines: markdown.split("\n").filter((l) => l.trim()),
  };
}

for (const reader of ["docx.js", "docx2.js"]) {
  const { documentXml, markdown, lines } = convert(reader, BODY);
  check(
    `${reader}: THE ITEM THAT ANCHORS THE BOX IS ITS OWN SENTENCE, and the box's words are in no paragraph of the text: the inventory lists the box for a disposition of its own`,
    lines,
    [
      "1. **Market power** – monopolies restrict output.",
      "1. **Public goods** – free-rider problems lead to under provision.",
      "1. **Externalities** – costs spill over onto others.",
      "The last three are sometimes called **missing markets**.",
    ],
  );
  check(
    `${reader}: EVERY WORD OF THE BODY IS IN THE MARKDOWN, counted by a reader that shares no code with this one`,
    lostWords(documentXml, markdown).lost.map((l) => l.word),
    [],
  );
}

check(
  "THE INDEPENDENT CHECK CAN FAIL. Given the markdown the old reader wrote for this body, it names every word of the lost sentence and the paragraph they came from",
  lostWords(
    `<w:document><w:body>${BODY}</w:body></w:document>`,
    "1. **Market power** – monopolies restrict output.\n1. M**issing markets**\n\n**Missing markets**\n\n" +
      "1. **Externalities** – costs spill over onto others.\n\nThe last three are sometimes called **missing markets**.\n",
  ).lost.map((l) => `${l.word} <- ${l.where}`),
  [
    "Public",
    "goods",
    "free",
    "rider",
    "problems",
    "lead",
    "to",
    "under",
    "provision",
  ].map(
    (w) =>
      `${w} <- Public goods – free-rider problems lead to under provision.`,
  ),
);

check(
  "AN EMPTY TEXT BOX HOLDS NOTHING, so it blanks nothing. A self-closing box matched as an opening tag would run on to the next box's closing tag and take the body in between with it",
  convert(
    "docx.js",
    `<w:p><w:r><w:txbxContent/></w:r>${run("Kept.")}</w:p><w:p>${run("Also kept.")}</w:p>` +
      item(textBox(run("Boxed")) + run("Item.")),
  ).lines,
  ["Kept.", "Also kept.", "1. Item."],
);

console.log(`\n${ran - failed}/${ran} passed`);
process.exit(failed === 0 ? 0 : 1);
