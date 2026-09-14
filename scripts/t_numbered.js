/**
 * AN EXAMPLE'S OWN NUMBERED STEPS BELONG TO IT.
 *
 * An example runs on through a bulleted line and a display equation, but a `1.` item broke it: the
 * ordered list is exactly how an author writes "here is the worked bit", and the run's continues test
 * knew only about `-` and `*`. The callout then held the lead sentence and nothing else, and the five
 * numbered steps landed underneath it as bare prose: on the page, a box saying "Example: calculating
 * the intercepts" and then, outside the box, the whole solution. Ten of them in one unit.
 */
const assert = require("node:assert");
const { execFileSync } = require("node:child_process");
const { mkdtempSync, writeFileSync, mkdirSync, readFileSync } = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");

const dir = mkdtempSync(join(tmpdir(), "composer-numbered-"));
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
    "## Intercepts",
    "",
    "Some ordinary prose so the section is not empty.",
    "",
    "**Example: Calculating the intercepts**",
    "",
    "Take $6x-3y+12=0$. We will find both intercepts cleanly.",
    "",
    "1. Put it in $y=mx+c$, so $y=2x+4$.",
    "1. **Vertical intercept**, set $x=0$, which gives $(0,4)$.",
    "1. **Horizontal intercept**, set $y=0$, which gives $(-2,0)$.",
    "",
    "A closing sentence that is ordinary prose again.",
    "",
  ].join("\n"),
);

execFileSync("node", [join(__dirname, "build-manifest.mjs"), dir], { stdio: "pipe" });
const blocks = JSON.parse(readFileSync(join(dir, "04-manifest", "manifest.json"), "utf8")).topics[0]
  .blocks;

const example = blocks.find((b) => b.type === "callout" && b.variant === "example");
assert.ok(example, "no example callout was built at all");
for (const step of ["Vertical intercept", "Horizontal intercept", "Put it in"])
  assert.ok(example.body.includes(step), `the example lost its step: ${step}`);

/* And the prose after it is still prose, so the run did not swallow the whole section. */
assert.ok(
  blocks.some((b) => b.type === "prose" && b.body.includes("A closing sentence")),
  "the example ran past its own steps and took the next paragraph",
);
/* No prose block may hold a step: that is the split this test exists to stop. */
assert.ok(
  !blocks.some((b) => b.type === "prose" && b.body.includes("Vertical intercept")),
  "a numbered step landed outside the example, as bare prose",
);

console.log("t_numbered: an example keeps its numbered steps");
