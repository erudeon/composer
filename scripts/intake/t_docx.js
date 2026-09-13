/**
 * Heading resolution and Markdown tables, on the shapes real documents actually have.
 *
 *   node scripts/intake/t_docx.js
 */
const { headingLevels, gfmTable, listFormats } = require("./docx-core.js");

const style = (id, body) =>
  `<w:style w:type="paragraph" w:styleId="${id}">${body}</w:style>`;
const outline = (n) => `<w:pPr><w:outlineLvl w:val="${n}"/></w:pPr>`;

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

const levels = (xml) => {
  const m = headingLevels(xml);
  return Object.fromEntries([...m].filter(([, v]) => v !== null));
};

check(
  "an English Word's heading styles",
  levels(
    style("Heading1", `<w:name w:val="heading 1"/>${outline(0)}`) +
      style("Heading2", `<w:name w:val="heading 2"/>${outline(1)}`),
  ),
  { Heading1: 1, Heading2: 2 },
);

check(
  "A HUNGARIAN WORD. The id has its accents stripped and the name is the canonical English one, so the outline level is the only thing that does not depend on language. The old extractor found 0 headings in this document; there are 18.",
  levels(
    style("Cmsor1", `<w:name w:val="heading 1"/>${outline(0)}`) +
      style("Cmsor3", `<w:name w:val="heading 3"/>${outline(2)}`) +
      style("Egyenlet", `<w:name w:val="Egyenlet"/>`),
  ),
  { Cmsor1: 1, Cmsor3: 3 },
);

check(
  "a style that adds nothing to Heading 2 IS a Heading 2",
  levels(
    style("Heading2", `<w:name w:val="heading 2"/>${outline(1)}`) +
      style(
        "MySection",
        `<w:name w:val="My Section"/><w:basedOn w:val="Heading2"/>`,
      ),
  ),
  { Heading2: 2, MySection: 2 },
);

check(
  "a style based on Normal is not a heading",
  levels(
    style("Normal", `<w:name w:val="Normal"/>`) +
      style("Body", `<w:name w:val="Body"/><w:basedOn w:val="Normal"/>`),
  ),
  {},
);

check(
  "a basedOn chain that loops terminates instead of recurring forever",
  levels(
    style("A", `<w:name w:val="A"/><w:basedOn w:val="B"/>`) +
      style("B", `<w:name w:val="B"/><w:basedOn w:val="A"/>`),
  ),
  {},
);

check("no styles.xml at all", levels(null), {});

check(
  "a level past 6 has no Markdown spelling and is clamped",
  levels(style("Heading9", `<w:name w:val="heading 9"/>${outline(8)}`)),
  { Heading9: 6 },
);

check(
  "a plain table",
  gfmTable([
    ["a", "b"],
    ["1", "2"],
  ]),
  ["| a | b |", "| --- | --- |", "| 1 | 2 |"],
);

check(
  "A MERGED CELL makes a short row, and a separator narrower than the header silently drops every column past it, so every row pads to the widest",
  gfmTable([["Account", "Debit", "Credit"], ["Cash"]]),
  ["| Account | Debit | Credit |", "| --- | --- | --- |", "| Cash |  |  |"],
);

check(
  "a pipe in a cell is escaped and a newline in one is not allowed to end the table",
  gfmTable([["a|b", "c\nd"]]),
  ["| a\\|b | c d |", "| --- | --- |"],
);

const numbering =
  `<w:num w:numId="1"><w:abstractNumId w:val="7"/></w:num>` +
  `<w:num w:numId="2"><w:abstractNumId w:val="8"/></w:num>` +
  `<w:abstractNum w:abstractNumId="7"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/></w:lvl></w:abstractNum>` +
  `<w:abstractNum w:abstractNumId="8"><w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/></w:lvl></w:abstractNum>`;
const fmt = listFormats(numbering);
check("a bulleted list", fmt("1", "0"), "bullet");
check("a numbered list", fmt("2", "0"), "ordered");
check(
  "numbering we cannot read is a bullet, because a wrong number asserts an order the document never claimed",
  listFormats(null)("1", "0"),
  "bullet",
);

console.log(`\n${ran - failed}/${ran} passed`);
process.exit(failed === 0 ? 0 : 1);
