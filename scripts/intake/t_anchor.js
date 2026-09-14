/**
 * Where a drawing BELONGS, when its anchor says otherwise.
 *
 *   node scripts/intake/t_anchor.js
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { drawings } = require("./open-docx.js");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "composer-anchor-"));
fs.mkdirSync(path.join(dir, "word", "_rels"), { recursive: true });
fs.writeFileSync(
  path.join(dir, "word", "styles.xml"),
  `<w:styles><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:pPr><w:outlineLvl w:val="1"/></w:pPr></w:style></w:styles>`,
);
fs.writeFileSync(
  path.join(dir, "word", "_rels", "document.xml.rels"),
  `<Relationships><Relationship Id="rId1" Target="media/a.png"/><Relationship Id="rId2" Target="media/b.png"/></Relationships>`,
);

const head = (t) =>
  `<w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>${t}</w:t></w:r></w:p>`;
const pic = (id, floating) =>
  `<w:p><w:r><w:drawing>${floating ? "<wp:anchor>" : "<wp:inline>"}<a:blip r:embed="${id}"/>${floating ? "</wp:anchor>" : "</wp:inline>"}</w:drawing></w:r></w:p>`;

fs.writeFileSync(
  path.join(dir, "word", "document.xml"),
  `<w:document><w:body>${head("Interval Notation")}<w:p><w:r><w:t>from a to b</w:t></w:r></w:p>` +
    // The author's real shape: the figure anchored at the TAIL of one section, illustrating the next.
    pic("rId1", true) +
    head("Absolute Value") +
    `<w:p><w:r><w:t>distance from zero</w:t></w:r></w:p>` +
    pic("rId2", false) +
    head("Summations") +
    `</w:body></w:document>`,
);

const got = drawings(dir);
let failed = 0;
const check = (what, ok) => {
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
};

check("the heading above is still reported", got[0].under === "Interval Notation");
check("AND the heading below, which is the one a floating figure usually illustrates", got[0].before === "Absolute Value");
check("a floating drawing says so", got[0].floating === true);
check("an inline one says so too, and its anchor IS where it sits", got[1].floating === false && got[1].under === "Absolute Value");
check("the last drawing has no heading after it", got[1].before === "Summations");

process.exit(failed ? 1 : 0);
