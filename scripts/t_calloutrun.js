/**
 * TWO CALLOUTS OF ONE KIND MAY NOT TOUCH, AND MERGING THEM MUST NOT COST THEIR LABELS.
 *
 * The old merge claimed any following example and took only its LEAD, so the paragraphs under it
 * were left behind as prose. Claiming only a bulleted sibling fixed that and exposed the other half:
 * two standalone examples with nothing between them, which the write path refuses outright.
 *
 * So they are merged here, as one box, with each of the author's own labels kept as a bold lead
 * inside it. Nothing is dropped and nothing is left outside.
 */
const assert = require("node:assert");
const { execFileSync } = require("node:child_process");
const { mkdtempSync, writeFileSync, mkdirSync, readFileSync } = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");

const dir = mkdtempSync(join(tmpdir(), "composer-calloutrun-"));
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
    "## Chain rule",
    "",
    "Some ordinary prose so the section is not empty.",
    "",
    "**Example 2: Logarithm of a linear term**",
    "",
    "$$y=\\ln(10x+2)$$",
    "",
    "**Example 3: Exponential of a linear term**",
    "",
    "$$y=e^{3x+1}$$",
    "",
  ].join("\n"),
);

execFileSync("node", [join(__dirname, "build-manifest.mjs"), dir], { stdio: "pipe" });
const blocks = JSON.parse(readFileSync(join(dir, "04-manifest", "manifest.json"), "utf8")).topics[0]
  .blocks;

for (let i = 1; i < blocks.length; i += 1)
  assert.ok(
    !(blocks[i].type === "callout" && blocks[i].variant === blocks[i - 1]?.variant && blocks[i - 1].type === "callout"),
    `two ${blocks[i].variant} callouts are side by side: ${blocks[i - 1].id} and ${blocks[i].id}`,
  );

const merged = blocks.find((b) => b.type === "callout" && b.variant === "example");
assert.ok(merged, "the examples vanished");
for (const kept of ["Logarithm of a linear term", "Exponential of a linear term", "\\ln(10x+2)", "e^{3x+1}"])
  assert.ok(JSON.stringify(merged).includes(kept), `the merge lost: ${kept}`);

console.log("t_calloutrun: two examples of one kind become one box, keeping both labels");
