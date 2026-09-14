/**
 * A FLAG BELONGS TO ONE SECTION, NOT TO EVERY SECTION OF THAT NAME.
 *
 * Anchored blocks were matched to their section by its HEADING TEXT. An author who writes "WA Method"
 * once under Step 1 and again under Step 2 then gets each section's exam tip drawn under BOTH: on one
 * real course two of the author's notes were each published twice, word for word, four blocks apart.
 */
const assert = require("node:assert");
const { execFileSync } = require("node:child_process");
const { mkdtempSync, writeFileSync, mkdirSync, readFileSync } = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");

const dir = mkdtempSync(join(tmpdir(), "composer-sections-"));
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
    "## Step 1: working out the units",
    "",
    "Some ordinary prose so the section is not empty.",
    "",
    "### WA Method",
    "",
    "Prose under the first WA heading.",
    "",
    "🎯 The first tip, which belongs to step one only.",
    "",
    "## Step 2: valuing the inventory",
    "",
    "More ordinary prose.",
    "",
    "### WA Method",
    "",
    "Prose under the second WA heading.",
    "",
    "🎯 The second tip, which belongs to step two only.",
    "",
  ].join("\n"),
);

execFileSync("node", [join(__dirname, "build-manifest.mjs"), dir], { stdio: "pipe" });
const blocks = JSON.parse(readFileSync(join(dir, "04-manifest", "manifest.json"), "utf8")).topics[0]
  .blocks;
const count = (needle) => blocks.filter((b) => (b.body ?? "").includes(needle)).length;

assert.strictEqual(count("belongs to step one only"), 1, "the first tip was drawn more than once");
assert.strictEqual(count("belongs to step two only"), 1, "the second tip was drawn more than once");

const at = (needle) => blocks.findIndex((b) => (b.body ?? "").includes(needle));
assert.ok(at("belongs to step one only") < at("More ordinary prose"), "the first tip left its section");
assert.ok(at("belongs to step two only") > at("More ordinary prose"), "the second tip left its section");

console.log("t_sections: a flag belongs to one section");
