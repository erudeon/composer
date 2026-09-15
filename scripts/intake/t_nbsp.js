/**
 * A NON-BREAKING SPACE IS A SPACE, IN PROSE. IN MATHS IT IS NOT.
 *
 * Word puts U+00A0 after a bold lead-in constantly: one real 12-week summary carried 57 of them. It
 * draws as an ordinary space, so nothing on the page ever looks wrong, and every later phase that
 * matches a line by its text silently misses. A whole passage failed to be found by an exact-string
 * anchor that differed from the file by one invisible character.
 *
 * It must NOT be touched inside maths. The reader's KaTeX draws U+00A0 as a real space, so an author
 * who put one between two words of a variable name is relying on it, and replacing it there would
 * change what is drawn. `protectMaths` already lifts every span out, so the rule only has to run
 * where it is safe.
 *
 *   node scripts/intake/t_nbsp.js
 */
const assert = require("node:assert");
const { execFileSync } = require("node:child_process");
const { mkdtempSync, writeFileSync, readFileSync } = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");

const dir = mkdtempSync(join(tmpdir(), "composer-nbsp-"));
const input = join(dir, "in.md");
const output = join(dir, "out.md");

const NBSP = " ";
writeFileSync(
  input,
  [
    "# Unit One",
    "",
    `**Takeaway:**${NBSP}Managing ethics integrates codes and culture.`,
    "",
    `A price of 12${NBSP}euros, and $x${NBSP}y = 1$ which must keep its own space.`,
    "",
  ].join("\n"),
);

const out = execFileSync("node", [join(__dirname, "normalise.js"), input, output], {
  encoding: "utf8",
});
const text = readFileSync(output, "utf8");

assert.ok(
  text.includes("**Takeaway:** Managing ethics"),
  `the lead-in's non-breaking space should be an ordinary one:\n${JSON.stringify(text)}`,
);
assert.ok(text.includes("12 euros"), "a non-breaking space between words is an ordinary space");
assert.ok(
  text.includes(`$x${NBSP}y = 1$`),
  `the one inside maths must survive untouched:\n${JSON.stringify(text)}`,
);
assert.ok(/non-breaking spaces?: 2\b/.test(out), `the run should report the count:\n${out}`);

console.log("ok  non-breaking spaces normalised in prose, kept inside maths");
