/**
 * AN EXAMPLE THE AUTHOR LABELLED THEIR OWN WAY IS STILL AN EXAMPLE, AND A SECOND ONE IS NOT A
 * SIBLING OF THE FIRST.
 *
 * Two defects that both end with a solution sitting in a paragraph.
 *
 * The lead had to START with "Example", so "**Method 1 Example: Solving by elimination**" was not an
 * example at all: two complete three-step solutions stayed in one prose block. A prefix is allowed
 * now, but only when a colon follows the word, so "**For example**, take y = 2x + 1" stays the
 * sentence it is.
 *
 * And the sibling merge claimed ANY following example, taking its lead and leaving the paragraphs
 * under it behind. A five-step worked example on integration by substitution was dissolved that
 * way. Two examples are one callout when the author wrote them as two BULLETS of one list; a
 * standalone one with a body of its own is its own example.
 */
const assert = require("node:assert");
const { execFileSync } = require("node:child_process");
const { mkdtempSync, writeFileSync, mkdirSync, readFileSync } = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");

const dir = mkdtempSync(join(tmpdir(), "composer-examplelead-"));
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
    "## Methods",
    "",
    "Some ordinary prose so the section is not empty.",
    "",
    "**For example**, take $y=2x+1$. Choosing $x=0$ gives $y=1$.",
    "",
    "**Method 1 Example: Solving by elimination**",
    "",
    "**Step 1: Add the equations.**",
    "",
    "$$8y = 8$$",
    "",
    "Some prose between the two examples.",
    "",
    "**Example: Substitution with exponentials**",
    "",
    "Now try integrating this one:",
    "",
    "$$\\int e^{7x-5}dx$$",
    "",
    "Here the exponent is linear, so substitution is the key.",
    "",
    "**Step 1: Choose a substitution**",
    "",
    "$$u = 7x - 5$$",
    "",
  ].join("\n"),
);

execFileSync("node", [join(__dirname, "build-manifest.mjs"), dir], { stdio: "pipe" });
const blocks = JSON.parse(readFileSync(join(dir, "04-manifest", "manifest.json"), "utf8")).topics[0]
  .blocks;

/* The author's own label is recognised, and it becomes the computation it is. */
const first = blocks.find((b) => (b.title ?? "").includes("Method 1 Example"));
assert.ok(first, "an example labelled the author's own way was not recognised");
assert.strictEqual(first.type, "worked-example", "it has steps, so it is a worked example");

/* The second example keeps its own body rather than being folded into the first as a bare lead. */
const second = blocks.find((b) => (b.title ?? "").includes("Substitution with exponentials"));
assert.ok(second, "the second example was swallowed as a sibling of the first");
assert.ok(
  JSON.stringify(second).includes("u = 7x - 5"),
  "the second example lost the working that sat under it",
);

/* No step marker is left standing in a paragraph. */
for (const b of blocks)
  if (b.type === "prose")
    assert.ok(!/^\*\*Step\s*\d+/m.test(b.body), `a step marker stayed in prose: ${b.id}`);

/* And an ordinary sentence that merely says "for example" is not lifted into a box. */
assert.ok(
  blocks.some((b) => b.type === "prose" && b.body.includes("take $y=2x+1$")),
  "a sentence beginning 'For example' was wrongly lifted out of the prose",
);

console.log("t_examplelead: an author's own example label is read, and a second example stays whole");
