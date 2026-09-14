/**
 * A STEP'S LABEL IS THE AUTHOR'S OWN WORDS.
 *
 * `**Step 1: Write revenue clearly.**` puts the words INSIDE the bold, which is how almost every
 * author writes one, and the step pattern ate the lot: the label came out empty and was replaced
 * with the placeholder "Continue". `**Step 2: Solve for** $Q$**.**` puts the variable OUTSIDE it,
 * and the label came out as the leftover `$Q$**.**`. Seventeen of one course's sixty-five steps
 * carried one or the other, and on the page a worked example read "1. Continue / 2. Continue".
 */
const assert = require("node:assert");
const { execFileSync } = require("node:child_process");
const { mkdtempSync, writeFileSync, mkdirSync, readFileSync } = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");

const dir = mkdtempSync(join(tmpdir(), "composer-steplabel-"));
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
    "## Break-even",
    "",
    "Some ordinary prose so the section is not empty.",
    "",
    "**Example: Break-even analysis**",
    "",
    "A firm sells each unit for $P=20$. Costs are $TC = 60 + 12Q$.",
    "",
    "**Step 1: Write revenue clearly.**",
    "",
    "$$TR = 20Q$$",
    "",
    "**Step 2: Solve for** $Q$**.**",
    "",
    "$$20Q - 12Q = 60 ⇒ Q = 7.5$$",
    "",
  ].join("\n"),
);

execFileSync("node", [join(__dirname, "build-manifest.mjs"), dir], { stdio: "pipe" });
const blocks = JSON.parse(readFileSync(join(dir, "04-manifest", "manifest.json"), "utf8")).topics[0]
  .blocks;
const worked = blocks.find((b) => b.type === "worked-example");
assert.ok(worked, "no worked example was built");

const labels = worked.steps.map((s) => s.label);
assert.deepStrictEqual(
  labels,
  ["Write revenue clearly", "Solve for $Q$"],
  `the author's words did not reach the labels: ${JSON.stringify(labels)}`,
);
/* And the working still lands as each step's result, not swept into a note. */
assert.strictEqual(worked.steps[0].result, "TR = 20Q");
assert.ok(worked.steps[1].result.includes("Q = 7.5"));

console.log("t_steplabel: a step's label is the author's own words");
