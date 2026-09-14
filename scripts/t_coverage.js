/**
 * THE AUTHOR'S WORDS ALL REACH A BLOCK.
 *
 * Every other check here asks whether what was built is VALID. This asks whether it is ALL there, which
 * is the failure nothing else can see: a build that drops a sentence is clean, green and short.
 *
 * It was written after a section carrying two exam tips published one of them. 12 of 71 flagged
 * sentences on one real course, and the author's notes are the part of a summary a student reads first.
 */
const assert = require("node:assert");
const { execFileSync } = require("node:child_process");
const { mkdtempSync, writeFileSync, mkdirSync, readFileSync } = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");

const dir = mkdtempSync(join(tmpdir(), "composer-coverage-"));
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
    "## One Section With Two Of Each",
    "",
    "Ordinary prose so the section is not empty.",
    "",
    "🎯 The first exam tip, about depreciation.",
    "",
    "More prose between them.",
    "",
    "🎯 The second exam tip, about impairment.",
    "",
    "💡 The first intuition, about liquidity.",
    "",
    "Closing prose.",
    "",
    "💡 The second intuition, about solvency.",
    "",
    "The last paragraph.",
    "",
  ].join("\n"),
);

execFileSync("node", [join(__dirname, "build-manifest.mjs"), dir, "--unit", "1"], { encoding: "utf8" });
const topic = JSON.parse(readFileSync(join(dir, "04-manifest", "manifest.json"), "utf8")).topics[0];
const text = topic.blocks.map((b) => b.body ?? "").join("\n");

for (const sentence of [
  "The first exam tip, about depreciation.",
  "The second exam tip, about impairment.",
  "The first intuition, about liquidity.",
  "The second intuition, about solvency.",
])
  assert.ok(text.includes(sentence), `a flagged sentence did not reach a block: ${sentence}`);

/* And they are MERGED, not four boxes: two of a kind may not touch. */
const callouts = topic.blocks.filter((b) => b.type === "callout");
const kinds = callouts.map((c) => c.variant);
assert.equal(new Set(kinds).size, kinds.length, `two callouts of one kind in a section: ${kinds}`);

const examTip = callouts.find((c) => c.variant === "exam-tip");
assert.ok(examTip.body.includes("depreciation") && examTip.body.includes("impairment"), examTip.body);
/* In the order they were written. */
assert.ok(
  examTip.body.indexOf("depreciation") < examTip.body.indexOf("impairment"),
  `merged out of order: ${examTip.body}`,
);

/* Every paragraph of prose is there too, which is the other half of "all there". */
for (const p of ["Ordinary prose so the section is not empty.", "More prose between them.", "Closing prose.", "The last paragraph."])
  assert.ok(text.includes(p), `a paragraph did not reach a block: ${p}`);

/*
 * A SECTION WITH NO PROSE OF ITS OWN IS STILL A SECTION when what follows it is its SUBSECTIONS.
 * Dropping it lost nine grouping headings on one course, each a line missing from the contents a
 * student navigates by, including one on a lecture that was already published.
 */
const groupDir = mkdtempSync(join(tmpdir(), "composer-groups-"));
mkdirSync(join(groupDir, "02-source"), { recursive: true });
mkdirSync(join(groupDir, "04-manifest"), { recursive: true });
writeFileSync(
  join(groupDir, "composer.json"),
  JSON.stringify({ course: "T", slug: "t", courseShell: { programCode: "nl-x-y-bsc-en-y1" } }),
);
writeFileSync(
  join(groupDir, "02-source", "source-of-record.md"),
  [
    "# Unit One", "",
    "## Cash vs Accrual Basis Accounting", "",
    "### Cash Basis Accounting", "", "Records revenue when cash is received.", "",
    "### Accrual Basis Accounting", "", "Records revenue when it is earned.", "",
    "## A Heading With Nothing At All Under It", "",
    "## A Real Section", "", "With prose of its own.", "",
  ].join("\n"),
);
execFileSync("node", [join(__dirname, "build-manifest.mjs"), groupDir, "--unit", "1"], { encoding: "utf8" });
const groups = JSON.parse(readFileSync(join(groupDir, "04-manifest", "manifest.json"), "utf8")).topics[0];
const headings = groups.blocks.flatMap((b) => (b.body ?? "").match(/^#{2,3} .+$/gm) ?? []);

assert.ok(
  headings.some((h) => h === "## Cash vs Accrual Basis Accounting"),
  `a section that groups subsections keeps its heading: ${JSON.stringify(headings)}`,
);
assert.ok(headings.some((h) => h === "### Cash Basis Accounting"));
assert.ok(headings.some((h) => h === "## A Real Section"));
/* And a heading with nothing under it at all is still dropped, which is the other half of the rule. */
assert.ok(
  !headings.some((h) => h.includes("Nothing At All")),
  `a heading with no children and no prose is not a section: ${JSON.stringify(headings)}`,
);

console.log("coverage ok");
