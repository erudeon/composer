/**
 * AN EXAMPLE KEEPS ITS WORKING, EVEN ACROSS A SENTENCE OF INTENT.
 *
 * Authors write "Use $S_n = ...$" or "The plan is to use the sum formula" between the setup and the
 * computation. The run stopped at that sentence because it is not maths, so the box held the
 * question and the ANSWER sat underneath it as a loose paragraph. On one real course that happened
 * to 33 of 45 examples: every box on the page posed a problem it did not solve.
 *
 * One bridging sentence is crossed, and only when what follows it is working: a list, a display
 * line, a step or a table. A sentence followed by more ordinary prose still ends the example, so a
 * closing remark stays where the author put it.
 */
const assert = require("node:assert");
const { execFileSync } = require("node:child_process");
const { mkdtempSync, writeFileSync, mkdirSync, readFileSync } = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");

const dir = mkdtempSync(join(tmpdir(), "composer-bridge-"));
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
    "## Sequences",
    "",
    "Some ordinary prose so the section is not empty.",
    "",
    "**Example: Stepping down by 5**",
    "",
    "The sequence is $60, 55, 50$ so $a=60$ and $d=-5$.",
    "",
    "The plan is to use the term formula, then the sum formula.",
    "",
    "- $T_{18} = -25$",
    "- $S_{18} = 315$",
    "",
    "A closing remark about why the sum stays positive.",
    "",
    "And a second ordinary paragraph that is plainly not the example.",
    "",
  ].join("\n"),
);

execFileSync("node", [join(__dirname, "build-manifest.mjs"), dir], { stdio: "pipe" });
const blocks = JSON.parse(readFileSync(join(dir, "04-manifest", "manifest.json"), "utf8")).topics[0]
  .blocks;
const example = blocks.find((b) => b.type === "callout" && b.variant === "example");
assert.ok(example, "no example callout was built");

for (const part of ["The plan is to use", "T_{18} = -25", "S_{18} = 315"])
  assert.ok(example.body.includes(part), `the example lost its working: ${part}`);

/* The run stops at the closing remark, because ordinary prose follows it rather than more working. */
assert.ok(
  !example.body.includes("second ordinary paragraph"),
  "the example ran on past its own working and swallowed the section",
);
assert.ok(
  blocks.some((b) => b.type === "prose" && b.body.includes("second ordinary paragraph")),
  "the paragraph after the example went missing entirely",
);

console.log("t_bridge: an example keeps its working across a sentence of intent");

/*
 * AND THE OTHER HALF OF THE SAME RULE: an example whose statement is one line still reaches its
 * working across TWO sentences of intent, while an example that already has its working ends at the
 * author's closing remark.
 */
{
  const dir2 = mkdtempSync(join(tmpdir(), "composer-bridge2-"));
  mkdirSync(join(dir2, "02-source"), { recursive: true });
  mkdirSync(join(dir2, "04-manifest"), { recursive: true });
  writeFileSync(
    join(dir2, "composer.json"),
    JSON.stringify({ course: "T", slug: "t", courseShell: { programCode: "nl-x-y-bsc-en-y1" } }),
  );
  writeFileSync(
    join(dir2, "02-source", "source-of-record.md"),
    [
      "# Unit One",
      "",
      "## Partials",
      "",
      "Some ordinary prose so the section is not empty.",
      "",
      "**Example: First-order partial derivatives**",
      "",
      "Suppose we have the function $z=3x^2+4xy+5y^2$",
      "",
      "We want to see how $z$ changes when one variable moves.",
      "",
      "Start with respect to $x$, treating $y$ as a constant:",
      "",
      "$$f_x=6x+4y$$",
      "",
      "So the two partials together give the responsiveness in each direction.",
      "",
      "And a plainly separate paragraph that closes the section.",
      "",
    ].join("\n"),
  );
  execFileSync("node", [join(__dirname, "build-manifest.mjs"), dir2], { stdio: "pipe" });
  const b2 = JSON.parse(readFileSync(join(dir2, "04-manifest", "manifest.json"), "utf8")).topics[0]
    .blocks;
  const ex = b2.find((b) => b.type === "callout" && b.variant === "example");
  assert.ok(ex.body.includes("f_x=6x+4y"), "the example never reached its working across two sentences");
  assert.ok(
    !ex.body.includes("plainly separate paragraph"),
    "the example ran on past its working into the rest of the section",
  );
  console.log("t_bridge: it reaches its working, and stops once it has it");
}
