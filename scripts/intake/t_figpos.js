/**
 * WHERE A PICTURE SAT IN THE TEXT, end to end through `docx.js`.
 *
 *   node scripts/intake/t_figpos.js
 *
 * This one drives the script rather than a function out of `docx-core.js`, because the bug it guards
 * was in the script's own control flow: a paragraph holding a picture and no text was skipped by the
 * empty-text test, so every picture's POSITION was lost while `media-inventory.json` went on reporting
 * that the picture existed. Nothing downstream could tell a document whose pictures were unplaceable
 * from one that had none, and 58 figures were placed by guessing a paragraph from a heading.
 *
 * Each check below is one way this has gone or could go wrong: the marker exists at all; it keeps the
 * blank lines that make it its own Markdown block; it is spelled the way the inventory spells it; a
 * paragraph carrying both a picture and words keeps both; a picture after a floating text box is not
 * lost to a non-greedy block match; one in a table cell is named rather than dropped; one in a heading
 * belongs to the section it OPENS; and one in a list item does not cut the list in two.
 */
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

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

const para = (inner) => `<w:p>${inner}</w:p>`;
const words = (s) => `<w:r><w:t>${s}</w:t></w:r>`;
const picture = (rid) =>
  `<w:r><w:drawing><wp:inline><a:graphic><a:graphicData>` +
  `<pic:pic><pic:blipFill><a:blip r:embed="${rid}"/></pic:blipFill></pic:pic>` +
  `</a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;

/** A work directory in the shape `open-docx.js` unpacks, with only the parts `docx.js` reads. */
function workDir(bodyInner, rels) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "t_figpos-"));
  fs.mkdirSync(path.join(dir, "word", "_rels"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "word", "document.xml"),
    `<?xml version="1.0"?><w:document><w:body>${bodyInner}</w:body></w:document>`,
  );
  fs.writeFileSync(
    path.join(dir, "word", "_rels", "document.xml.rels"),
    `<?xml version="1.0"?><Relationships>` +
      rels
        .map(
          ([id, target]) =>
            `<Relationship Id="${id}" Target="${target}" Type="image"/>`,
        )
        .join("") +
      `</Relationships>`,
  );
  return dir;
}

/** The markdown `docx.js` writes for one body, verbatim. */
function raw(bodyInner, rels) {
  const dir = workDir(bodyInner, rels);
  const out = path.join(dir, "source.md");
  execFileSync(
    process.execPath,
    [
      path.join(__dirname, "docx.js"),
      path.join(dir, "word", "document.xml"),
      out,
    ],
    { stdio: "pipe" },
  );
  const text = fs.readFileSync(out, "utf8");
  fs.rmSync(dir, { recursive: true, force: true });
  return text;
}

/** The same, as an array of non-blank lines, for the cases where only order is in question. */
function convert(bodyInner, rels) {
  return raw(bodyInner, rels)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

const IMAGE_RELS = [
  ["rId7", "media/image1.png"],
  ["rId8", "media/image2.jpg"],
];

check(
  "A PICTURE IN A PARAGRAPH OF ITS OWN IS STILL IN THE TEXT. This is the whole bug: such a paragraph carries no words, the empty-text skip dropped it, and the picture's place in the prose existed nowhere afterwards.",
  convert(
    para(words("Before the picture.")) +
      para(picture("rId7")) +
      para(words("After the picture.")),
    IMAGE_RELS,
  ),
  [
    "Before the picture.",
    "[FIGURE:word/media/image1.png]",
    "After the picture.",
  ],
);

check(
  "THE INVENTORY'S SPELLING, not the relationship's. A relationship target is relative to `word/` and `media-inventory.json` names the file from the work directory; two spellings of one path is how a marker stops matching the entry it belongs to.",
  convert(para(picture("rId8")), IMAGE_RELS).filter((l) =>
    l.startsWith("[FIGURE:"),
  ),
  ["[FIGURE:word/media/image2.jpg]"],
);

check(
  "A PARAGRAPH HOLDING BOTH KEEPS BOTH. The marker comes first: that is a position rounded to the paragraph rather than a wrong one, and an inline picture has no place in a line of Markdown prose to be put back into.",
  convert(para(picture("rId7") + words("A caption beside it.")), IMAGE_RELS),
  ["[FIGURE:word/media/image1.png]", "A caption beside it."],
);

check(
  "A RELATIONSHIP THAT RESOLVES TO NOTHING IS NOT A MARKER NAMING NOTHING. A `[FIGURE:undefined]` would be substituted for a picture that does not exist, which is worse than the picture simply being absent.",
  convert(para(picture("rIdMissing")) + para(words("Only this.")), IMAGE_RELS),
  ["Only this."],
);

const heading = (text) =>
  `<w:p><w:pPr><w:pStyle w:val="Heading1"/><w:outlineLvl w:val="0"/></w:pPr>${words(text)}</w:p>`;
const bullet = (text, inner = "") =>
  `<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>${words(text)}${inner}</w:p>`;
/** A paragraph whose floating text box carries a `<w:p>` of its own, then a picture AFTER it. */
const withTextBox = (rid) =>
  `<w:p>${words("A paragraph.")}<w:r><mc:AlternateContent><mc:Choice><w:drawing><wp:anchor><a:graphic>` +
  `<a:graphicData><wps:wsp><wps:txbx><w:txbxContent><w:p><w:r><w:t>Boxed.</w:t></w:r></w:p>` +
  `</w:txbxContent></wps:txbx></wps:wsp></a:graphicData></a:graphic></wp:anchor></w:drawing></mc:Choice>` +
  `</mc:AlternateContent></w:r>${picture(rid)}</w:p>`;
/** A heading paragraph with the picture pasted inside it, which Word allows and authors do. */
const headingWithPicture = (text, rid) =>
  heading(text).replace("</w:p>", `${picture(rid)}</w:p>`);
const tableWithPicture = (rid) =>
  `<w:tbl><w:tr><w:tc><w:p>${words("Cell one")}</w:p></w:tc>` +
  `<w:tc><w:p>${picture(rid)}</w:p></w:tc></w:tr></w:tbl>`;

check(
  "THE BLANK LINES AROUND A MARKER ARE LOAD-BEARING. Without them the marker joins the paragraph above into one Markdown block, and substituting the picture's markdown there drops it into the middle of the author's sentence. Asserted on the RAW file, because a check that trims every line cannot see this and passed while it was broken.",
  raw(
    para(words("Before.")) + para(picture("rId7")) + para(words("After.")),
    IMAGE_RELS,
  ),
  "Before.\n\n[FIGURE:word/media/image1.png]\n\nAfter.\n",
);

check(
  "A PICTURE AFTER A FLOATING TEXT BOX. `BLOCK_RE` is non-greedy, so that paragraph ends at the text box's own inner `</w:p>` and everything after it is matched by no block. A paragraph-based scan found 32 of 53 pictures on one real summary for exactly this reason.",
  convert(withTextBox("rId7") + para(words("Next.")), IMAGE_RELS).filter((l) =>
    l.startsWith("[FIGURE:"),
  ),
  ["[FIGURE:word/media/image1.png]"],
);

check(
  "A PICTURE IN A TABLE CELL, named above the table. The table branch returns before any paragraph inside it is read, so this one had no marker at all while the inventory listed it.",
  convert(tableWithPicture("rId8"), IMAGE_RELS).filter((l) =>
    l.startsWith("[FIGURE:"),
  ),
  ["[FIGURE:word/media/image2.jpg]"],
);

check(
  "A PICTURE PASTED INTO A HEADING BELONGS TO THE SECTION IT OPENS. A marker written above the heading names the section BEFORE it, one section early, which reads as correct and is not.",
  convert(
    headingWithPicture("Section Two", "rId7") + para(words("Body.")),
    IMAGE_RELS,
  ),
  ["# Section Two", "[FIGURE:word/media/image1.png]", "Body."],
);

check(
  'A PICTURE IN A LIST ITEM KEEPS THE LIST WHOLE. Every ordered item is written "1." and Markdown renumbers, so a list cut in two by a full-width marker restarts at 1 and a procedure with a screenshot on step 3 silently renumbers. The marker is indented to the item\'s content column instead.',
  raw(bullet("one", picture("rId7")) + bullet("two"), IMAGE_RELS),
  "- one\n\n  [FIGURE:word/media/image1.png]\n\n- two\n",
);

console.log(`\n${ran - failed}/${ran} passed`);
process.exit(failed === 0 ? 0 : 1);
