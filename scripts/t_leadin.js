/**
 * A HELD LEAD-IN MUST NOT CROSS A HEADING.
 *
 * A bold line on its own is treated as the lead-in of the paragraph under it, and it is held across
 * blank lines until that paragraph arrives. Nothing stopped it crossing a heading, so a section that
 * ENDS on a bold result line handed that line to the first paragraph of the NEXT section: on one real
 * course "**Total COGS = €220,500**", the answer of a three-step worked example, was drawn as the
 * opening words of the In Short summary, and the worked example ended with its total missing.
 */
const assert = require("node:assert");
const { execFileSync } = require("node:child_process");
const { mkdtempSync, writeFileSync, mkdirSync, readFileSync } = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");

const dir = mkdtempSync(join(tmpdir(), "composer-leadin-"));
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
    "## The Working",
    "",
    "Some ordinary prose so the section is not empty.",
    "",
    "**Total COGS = EUR 220,500**",
    "",
    "## In short",
    "",
    "This lecture showed how cost allocation works from end to end.",
    "",
  ].join("\n"),
);

execFileSync("node", [join(__dirname, "build-manifest.mjs"), dir], { stdio: "pipe" });
const manifest = JSON.parse(readFileSync(join(dir, "04-manifest", "manifest.json"), "utf8"));
const blocks = manifest.topics[0].blocks;
const bodies = blocks.map((b) => b.body ?? "");

const summary = bodies.find((b) => b.includes("cost allocation works from end to end"));
assert.ok(summary, "the summary paragraph is missing entirely");
assert.ok(
  !summary.includes("220,500"),
  `the total crossed the heading into the next section: ${JSON.stringify(summary)}`,
);
assert.ok(
  bodies.some((b) => b.includes("220,500")),
  "the total was dropped instead of being kept in its own section",
);

console.log("t_leadin: a lead-in does not cross a heading");
