/**
 * A STYLE MARKER IS METADATA AND A READER MUST NEVER SEE ONE.
 *
 * `docx.js` writes the styles an author named in Word as `<!-- style: In Short -->` above the
 * paragraph they mark, so a phase that understands one can read it. A marker nothing understands does
 * not vanish for being a comment: it lands inside a prose block and is drawn. 211 of them across every
 * lecture of one real course.
 *
 * And a flag ending in a colon announces the line UNDER it, which is content, not the marker sitting
 * between the two. Taking the first non-empty line gave the callout a comment for a body and left the
 * equation behind.
 */
const assert = require("node:assert");
const { execFileSync } = require("node:child_process");
const { mkdtempSync, writeFileSync, mkdirSync, readFileSync } = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");

const dir = mkdtempSync(join(tmpdir(), "composer-styles-"));
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
    "## A Section",
    "",
    "<!-- style: Stilus4 -->",
    "",
    "A paragraph the author styled as body text.",
    "",
    "<!-- style: In Short -->",
    "",
    "Another paragraph under a style nothing here reads.",
    "",
    "## Another Section",
    "",
    "Prose so the section is not empty.",
    "",
    "🎯 The rule is calculated by:",
    "",
    "<!-- style: Egyenlet -->",
    "",
    "$$a = b + c$$",
    "",
    "Closing prose.",
    "",
  ].join("\n"),
);

execFileSync("node", [join(__dirname, "build-manifest.mjs"), dir, "--unit", "1"], {
  encoding: "utf8",
});
const { topics } = JSON.parse(readFileSync(join(dir, "04-manifest", "manifest.json"), "utf8"));

const everything = JSON.stringify(topics[0].blocks);
assert.ok(!everything.includes("<!-- style:"), "a style marker reached a block");
assert.ok(!everything.includes("Stilus4"), "a style name reached a block");

/* The author's paragraphs are still there: the marker goes, the text it marked does not. */
assert.ok(everything.includes("A paragraph the author styled as body text."));
assert.ok(everything.includes("Another paragraph under a style nothing here reads."));

/* The flag ending in a colon took the equation, not the marker that sat between them. */
const callout = topics[0].blocks.find((b) => b.type === "callout");
assert.ok(callout, "the flagged line should be a callout");
assert.ok(
  callout.body.includes("$$a = b + c$$"),
  `the callout must carry the equation it announces: ${JSON.stringify(callout.body)}`,
);

console.log("styles ok");
