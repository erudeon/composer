/**
 * A NUMBERED LIST STAYS NUMBERED.
 *
 * Authors number a set and bullet the detail under each item. Word indents those bullets by two
 * spaces, and two is not enough to nest under `1. ` — an ordered marker is three characters wide, so
 * Markdown closes the list at the first child and the next item opens a NEW list. Every item then
 * renders as "1.".
 *
 * The old answer was to delete the numbers and leave the bold lead-ins, which reads acceptably and is
 * not what the author wrote: 54 numbered items across one 23-unit course silently stopped being a
 * sequence, including Scott's three pillars and Dunning's three advantages, where the count IS the
 * point a student has to remember.
 *
 * The nesting is the actual fault and it is fixable: indent each child by its parent's marker width.
 * Then the list holds together, the numbers render 1, 2, 3, and nothing has to be thrown away.
 *
 * A LONE ITEM IS STILL A SENTENCE. One numbered item with no siblings is not a sequence, and the
 * reader's own lint says to write it as a sentence. That rule stays.
 *
 *   node scripts/t_nesting.js
 */
const assert = require("node:assert");
const { execFileSync } = require("node:child_process");
const { mkdtempSync, writeFileSync, mkdirSync, readFileSync } = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");

const dir = mkdtempSync(join(tmpdir(), "composer-nesting-"));
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
    "## Types of Institutions",
    "",
    "1. **Formal Institutions**:",
    "  - Written, explicit rules such as laws, regulations, and contracts.",
    "  - Examples: Property rights and legal systems.",
    "1. **Informal Institutions**:",
    "  - Unwritten norms, traditions, and cultural practices.",
    "  - Examples: Social customs and societal expectations.",
    "",
    "## A set with a third level",
    "",
    "1. **Environmental Level**:",
    "  - Examines external factors affecting businesses, including:",
    "    - **Economy**: Economic conditions and policies.",
    "    - **Technology**: Advancements and innovations.",
    "1. **Strategic Level**:",
    "  - Concerns the formulation of goals by upper management.",
    "",
    /* The case 96e151f found: a five-step method where ONE step has its detail bulleted underneath.
       That step used to lose its number while its siblings kept theirs, publishing a sequence with a
       hole in it. It shipped without a test, so it gets one here. */
    "## A method with one bulleted step",
    "",
    "1. **Theory:** state it.",
    "1. **Hypothesis:** derive it.",
    "1. **Data collection:**",
    "  - correlational studies",
    "  - experimental studies",
    "1. **Verification:** test it.",
    "",
    "## A lone item",
    "",
    "1. **Only one of these**: and it stands by itself.",
    "",
    "Ordinary prose after it.",
    "",
  ].join("\n"),
);

execFileSync("node", [join(__dirname, "build-manifest.mjs"), dir], { stdio: "pipe" });
const blocks = JSON.parse(readFileSync(join(dir, "04-manifest", "manifest.json"), "utf8")).topics[0]
  .blocks;
const bodyOf = (heading) => {
  const b = blocks.find((x) => x.type === "prose" && x.body.includes(`## ${heading}`));
  assert.ok(b, `no block for "${heading}": ${blocks.map((x) => x.id).join(", ")}`);
  return b.body;
};

const types = bodyOf("Types of Institutions");
assert.strictEqual(
  (types.match(/^\d+\. /gm) ?? []).length,
  2,
  `both items should still be numbered:\n${types}`,
);
assert.ok(
  /^ {3}- Written, explicit rules/m.test(types),
  `a child of an ordered item needs three spaces to nest under it:\n${types}`,
);

const deep = bodyOf("A set with a third level");
assert.strictEqual((deep.match(/^\d+\. /gm) ?? []).length, 2, `both items numbered:\n${deep}`);
assert.ok(/^ {3}- Examines external factors/m.test(deep), `second level at three:\n${deep}`);
assert.ok(/^ {5}- \*\*Economy\*\*/m.test(deep), `third level at five, under a bullet:\n${deep}`);

const method = bodyOf("A method with one bulleted step");
assert.strictEqual(
  (method.match(/^\d+\. /gm) ?? []).length,
  4,
  `every step keeps its number, including the one with bullets under it:\n${method}`,
);
assert.ok(
  !/^\*\*Data collection/m.test(method),
  `the bulleted step must not be orphaned out of the sequence:\n${method}`,
);

const lone = bodyOf("A lone item");
assert.ok(
  !/^\d+\. /m.test(lone),
  `one item is not a sequence and should read as a sentence:\n${lone}`,
);

console.log("ok  numbered lists keep their numbers and nest; a lone item is still a sentence");
