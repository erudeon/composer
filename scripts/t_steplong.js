/**
 * A CALCULATION TOO LONG FOR A LABEL IS NOT CUT IN HALF.
 *
 * The label cap is 120 characters and the write path enforces it, so a long line has to be split. Split
 * at the 118th character it breaks wherever that lands: one real course got a step labelled
 * "...400 units x 100% + 600" whose note was "Goods Inventory", and another whose whole note was
 * "*Process 1*) = EUR 1,200". A calculation already names itself on the LEFT of its equals sign.
 */
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const { mkdtempSync, writeFileSync, mkdirSync, readFileSync } = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");

const dir = mkdtempSync(join(tmpdir(), "composer-steplong-"));
mkdirSync(join(dir, "04-manifest"), { recursive: true });
writeFileSync(join(dir, "composer.json"), JSON.stringify({ course: "T", slug: "t" }));

const LONG =
  "**DM EU for Process 1** = 400 units × 100% + 600 units × 100% " +
  "+ 250 units × 100% + 180 units × 100% + 90 units × 100% = **1,520 units**";
assert.ok(LONG.length > 120, "the fixture has to be longer than the cap or it proves nothing");

writeFileSync(
  join(dir, "04-manifest", "manifest.json"),
  JSON.stringify({
    topics: [
      {
        number: 1,
        slug: "t",
        title: "T",
        blocks: [{ id: "b1", type: "prose", body: `### Working\n\nFirst, the materials.\n\n${LONG}` }],
      },
    ],
  }),
);
writeFileSync(
  join(dir, "unit-blocks.mjs"),
  'export const OPS = { 1: [{ op: "worked", id: "b1", problem: "p" }] };\n',
);

const r = spawnSync("node", [join(__dirname, "apply-blocks.mjs"), dir], { encoding: "utf8" });
assert.strictEqual(r.status, 0, `apply-blocks failed:\n${r.stdout}${r.stderr}`);
const block = JSON.parse(readFileSync(join(dir, "04-manifest", "manifest.json"), "utf8")).topics[0]
  .blocks[0];
assert.strictEqual(block.type, "worked-example");

const step = block.steps[0];
assert.ok(step.label.length <= 120, `the label is over the cap: ${step.label.length}`);
assert.ok(
  !step.label.includes("units × 100%"),
  `the label was cut out of the middle of the arithmetic: ${JSON.stringify(step.label)}`,
);
assert.match(step.label, /DM EU for Process 1/, `the label lost the name of the thing: ${step.label}`);
assert.ok(step.note.includes("1,520 units"), `the note lost the answer: ${JSON.stringify(step.note)}`);
assert.ok(step.note.includes("400 units"), `the note lost the working: ${JSON.stringify(step.note)}`);

console.log("t_steplong: a long calculation is named, not cut in half");
