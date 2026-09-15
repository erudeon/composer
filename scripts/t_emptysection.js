/**
 * A SECTION WHOSE ONLY CONTENT IS SUPPLIED IS STILL A SECTION.
 *
 * An empty section is dropped, and rightly: a heading with nothing under it is a line in the
 * contents leading nowhere. But "empty" was measured on the PROSE alone, and a course that cuts a
 * list and supplies the picture of it in the same place empties the prose on purpose. The section
 * then vanished and took the supplied block with it, silently: the diagram was declared, the build
 * reported success, and the lecture shipped without it.
 *
 * Found on a 23-unit course where "CSR Stages" was five bullets replaced by a five-stage timeline.
 *
 *   node scripts/t_emptysection.js
 */
const assert = require("node:assert");
const { execFileSync } = require("node:child_process");
const { mkdtempSync, writeFileSync, mkdirSync, readFileSync } = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");

const dir = mkdtempSync(join(tmpdir(), "composer-emptysection-"));
mkdirSync(join(dir, "02-source"), { recursive: true });
mkdirSync(join(dir, "04-manifest"), { recursive: true });
writeFileSync(
  join(dir, "composer.json"),
  JSON.stringify({ course: "T", slug: "t", courseShell: { programCode: "nl-x-y-bsc-en-y1" } }),
);
writeFileSync(
  join(dir, "02-source", "source-of-record.md"),
  [
    "# Unit One",
    "",
    "## Opening section",
    "",
    "Prose that survives, so the unit is not wholly supplied.",
    "",
    "## Five Stages",
    "",
    "- **One**: the first.",
    "- **Five**: the last.",
    "",
    "## Genuinely empty",
    "",
    "## After",
    "",
    "More prose.",
    "",
  ].join("\n"),
);
writeFileSync(
  join(dir, "course-data.mjs"),
  `export const REPAIRS = {
  1: { cut: [{ label: "Five Stages", from: "- **One**: the first.", to: "- **Five**: the last." }] },
};
export const EXTRA = {
  1: {
    "Five Stages": [
      {
        type: "diagram",
        kind: "timeline",
        title: "The five stages",
        items: [{ label: "One" }, { label: "Five" }],
      },
    ],
  },
};
`,
);

execFileSync("node", [join(__dirname, "build-manifest.mjs"), dir], { stdio: "pipe" });
const blocks = JSON.parse(readFileSync(join(dir, "04-manifest", "manifest.json"), "utf8")).topics[0]
  .blocks;

assert.ok(
  blocks.some((b) => b.type === "diagram" && b.title === "The five stages"),
  `the supplied diagram should have survived its section being emptied:\n${blocks
    .map((b) => `${b.id} ${b.type}`)
    .join("\n")}`,
);

assert.ok(
  !blocks.some((b) => /genuinely-empty/.test(b.id)),
  "a section with no prose AND nothing supplied is still dropped",
);

console.log("ok  a section carrying only supplied blocks survives, a wholly empty one does not");
