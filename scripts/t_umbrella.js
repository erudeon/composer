/**
 * AN "EXAMPLES:" UMBRELLA IS A HEADING, NOT AN EXAMPLE.
 *
 * An author writes "**Examples: Power Rule in Action**" and then numbers the real ones under it.
 * That first line strips to nothing, so it used to emit a callout with an EMPTY BODY, which the
 * write path refuses outright, and to swallow the first numbered example's title on the way out:
 * its equation was left standing as a bare prose block with no heading over it.
 */
const assert = require("node:assert");
const { execFileSync } = require("node:child_process");
const { mkdtempSync, writeFileSync, mkdirSync, readFileSync } = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");

const dir = mkdtempSync(join(tmpdir(), "composer-umbrella-"));
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
    "## The Power Rule",
    "",
    "Some ordinary prose so the section is not empty.",
    "",
    "**Examples: Power Rule in Action**",
    "",
    "**Example 1: Cube function**",
    "",
    "$$y=x^3 \\Rightarrow 3x^2$$",
    "",
    "**Example 2: Fractional power**",
    "",
    "$$V=Q^{5/4} \\Rightarrow \\frac{5}{4}Q^{1/4}$$",
    "",
  ].join("\n"),
);

execFileSync("node", [join(__dirname, "build-manifest.mjs"), dir], { stdio: "pipe" });
const blocks = JSON.parse(readFileSync(join(dir, "04-manifest", "manifest.json"), "utf8")).topics[0]
  .blocks;

/* No block may be empty: the write path refuses one, so the builder must never make one. */
for (const b of blocks)
  assert.ok(
    (b.body ?? b.problem ?? "x").trim(),
    `an empty ${b.type} block was built: ${b.id}`,
  );

/* The umbrella's own label never becomes a block: it is a heading for what follows. */
assert.ok(
  !blocks.some((b) => (b.title ?? "") === "Examples: Power Rule in Action"),
  "the umbrella label was drawn as a block of its own",
);

/*
 * KNOWN AND NOT FIXED HERE: the sibling merge takes a following example's LEAD but not the
 * paragraph under it, so Example 2's equation is still left outside the box. That is a separate
 * defect in the sibling rule, recorded against the course rather than patched around here.
 */

console.log("t_umbrella: an examples heading is not an empty example");
