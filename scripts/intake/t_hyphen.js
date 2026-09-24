/**
 * A NON-BREAKING HYPHEN IS A HYPHEN, AND A SOFT ONE IS NOTHING.
 *
 *   node scripts/intake/t_hyphen.js
 *
 * Word writes a non-breaking hyphen as the element `<w:noBreakHyphen/>`, not as a character, so a reader
 * of `<w:t>` alone turned "well‑known" into "wellknown": two words welded into one, the corruption this
 * pipeline has shipped before. It is read as a plain `-`, and `normalise.js`, which rejoins a PDF's
 * line-break hyphen, must leave it where it is. `<w:softHyphen/>` only marks where Word MAY break a
 * word, so it draws nothing and is read as nothing.
 *
 * Both readers are driven: `docx.js`/`docx2.js` for the text, and `open-docx.js` for the heading label
 * a picture is filed under, which `propose-dispositions.mjs` looks up in that text. And the words are
 * counted by `words-check.js`, which shares no code with either.
 */
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { lostWords } = require("./words-check.js");
const { textOf } = require("./open-docx.js");

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

const HYPHEN = "<w:noBreakHyphen/>";
const bold = (inner) => `<w:r><w:rPr><w:b/></w:rPr>${inner}</w:r>`;

const BODY =
  `<w:p><w:r><w:t xml:space="preserve">A well</w:t>${HYPHEN}<w:t xml:space="preserve">known result.</w:t></w:r></w:p>` +
  `<w:p>${bold("<w:t>Self</w:t>")}${bold(HYPHEN)}${bold("<w:t>efficacy</w:t>")}<w:r><w:t xml:space="preserve"> is a belief.</w:t></w:r></w:p>` +
  `<w:p><w:r><w:t xml:space="preserve">The uncon</w:t><w:softHyphen/><w:t xml:space="preserve">scious mind.</w:t></w:r></w:p>`;

/** One reader's markdown for the body, and what normalise.js makes of it. */
function convert(reader) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "t_hyphen-"));
  fs.mkdirSync(path.join(dir, "word", "_rels"), { recursive: true });
  const documentXml = `<?xml version="1.0"?><w:document><w:body>${BODY}</w:body></w:document>`;
  fs.writeFileSync(path.join(dir, "word", "document.xml"), documentXml);
  fs.writeFileSync(
    path.join(dir, "word", "_rels", "document.xml.rels"),
    `<?xml version="1.0"?><Relationships/>`,
  );
  const out = path.join(dir, "out.md");
  const clean = path.join(dir, "clean.md");
  execFileSync(
    process.execPath,
    [path.join(__dirname, reader), path.join(dir, "word", "document.xml"), out],
    { stdio: "pipe" },
  );
  execFileSync(
    process.execPath,
    [path.join(__dirname, "normalise.js"), out, clean],
    { stdio: "pipe" },
  );
  const lines = (f) =>
    fs
      .readFileSync(f, "utf8")
      .split("\n")
      .filter((l) => l.trim());
  const result = {
    documentXml,
    markdown: fs.readFileSync(out, "utf8"),
    lines: lines(out),
    cleaned: lines(clean),
  };
  fs.rmSync(dir, { recursive: true, force: true });
  return result;
}

const EXPECTED = [
  "A well-known result.",
  "**Self-efficacy** is a belief.",
  "The unconscious mind.",
];

for (const reader of ["docx.js", "docx2.js"]) {
  const { documentXml, markdown, lines, cleaned } = convert(reader);
  check(
    `${reader}: A NON-BREAKING HYPHEN IS A HYPHEN, inside a run and as a run of its own inside a bold phrase, and a soft hyphen draws nothing`,
    lines,
    EXPECTED,
  );
  check(
    `${reader}: NORMALISE LEAVES IT THERE. Its rejoin is for a line-break hyphen, and a real one it ate once became "distressmaintaining"`,
    cleaned,
    EXPECTED,
  );
  check(
    `${reader}: EVERY WORD OF THE BODY IS IN THE MARKDOWN, counted by a reader that shares no code with this one`,
    lostWords(documentXml, markdown).lost.map((l) => l.word),
    [],
  );
}

check(
  "THE LABEL A PICTURE IS FILED UNDER SAYS IT TOO, because the proposal script finds that heading in the text by these words",
  textOf(
    `<w:p><w:r><w:t>Well</w:t>${HYPHEN}<w:t xml:space="preserve">known results</w:t></w:r></w:p>`,
  ),
  "Well-known results",
);

console.log(`\n${ran - failed}/${ran} passed`);
process.exit(failed === 0 ? 0 : 1);
