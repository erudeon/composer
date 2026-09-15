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
 * The four things that must hold are the four ways that has gone or could go wrong: the marker exists
 * at all, it keeps its place in the prose, it is spelled the way the inventory spells it, and a
 * paragraph carrying both a picture and words keeps both.
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

/** The markdown `docx.js` writes for one body, as an array of non-blank lines. */
function convert(bodyInner, rels) {
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
  const lines = fs
    .readFileSync(out, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  fs.rmSync(dir, { recursive: true, force: true });
  return lines;
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

console.log(`\n${ran - failed}/${ran} passed`);
process.exit(failed === 0 ? 0 : 1);
