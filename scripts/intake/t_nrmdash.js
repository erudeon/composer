/**
 * THE EM DASH RULE IS ACTUALLY WIRED INTO THE CHAIN, AND RUNS PER LINE.
 *
 * `t_dash.js`, `t_pair.js` and `t_marker.js` pin `stripEmDashes` itself, and all three were green for
 * this plugin's whole life over a function THE CHAIN NEVER CALLED. `preflight.js` counted the dashes
 * and said ALL must go; `normalise.js` removed page furniture, soft hyphens, escapes and non-breaking
 * spaces, and left every dash where it was. A real upload carried 340 of them into the manifest, where
 * the model took them out by hand with a blanket comma: the function would have made seven of those a
 * pair of parentheses and one a table marker.
 *
 * So this file asserts the WIRING rather than the rule. A test of the function cannot fail when nobody
 * calls it, which is the whole reason this exists.
 *
 * It also pins PER LINE. `stripEmDashes` splits on `/(?<=[.!?])\s+/` and rejoins with a space, and a
 * newline is `\s`: handed the whole document in one string it welded 8,218 lines into 213 and destroyed
 * every heading and paragraph in the file. That version passed `t_dash.js` too.
 *
 *   node scripts/intake/t_nrmdash.js
 */
const assert = require("node:assert");
const { execFileSync } = require("node:child_process");
const { mkdtempSync, writeFileSync, readFileSync } = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");

const dir = mkdtempSync(join(tmpdir(), "composer-nrmdash-"));
const input = join(dir, "in.md");
const output = join(dir, "out.md");

const LINES = [
  "# Unit One",
  "",
  "The second — and by far the most important — is that the foundation comes back up.",
  "",
  "Statistics is cumulative — anyone who skips this week plays catch-up.",
  "",
  "## A section that must still be a heading",
  "",
  "A maths line $SS_A — df_A$ keeps its own dash, because that is not punctuation.",
  "",
  "| Cell | Value |",
  "| --- | --- |",
  "| — | — |",
  "",
];
writeFileSync(input, LINES.join("\n"));

const out = execFileSync("node", [join(__dirname, "normalise.js"), input, output], {
  encoding: "utf8",
});
const text = readFileSync(output, "utf8");
const lines = text.split("\n");

/* THE WIRING. Without it every assertion below passes on the input unchanged. */
assert.ok(
  !/—/.test(text.replace(/\$[^$]*\$/g, "")),
  `no em dash may survive outside maths:\n${JSON.stringify(text)}`,
);
assert.match(out, /em dashes removed: \d+/, `the run should report the count:\n${out}`);

/* PER LINE. A whole-document call welds these together and the file loses its structure. */
assert.strictEqual(
  lines.length,
  LINES.length,
  `the line count must not change:\n${JSON.stringify(text)}`,
);
assert.ok(lines.includes("# Unit One"), "a heading must still be alone on its line");
assert.ok(
  lines.includes("## A section that must still be a heading"),
  `the second heading must survive:\n${JSON.stringify(text)}`,
);

/* The rule's own judgement, through the chain: a pair brackets, a single one joins. */
assert.ok(
  text.includes("The second (and by far the most important) is that"),
  `a bracketing pair becomes parentheses:\n${JSON.stringify(text)}`,
);
assert.ok(
  /Statistics is cumulative[:,] anyone who skips/.test(text),
  `a single dash becomes a comma or a colon:\n${JSON.stringify(text)}`,
);

/* A dash inside maths is a minus sign, and a lone one in a cell is a value meaning "not applicable". */
assert.ok(text.includes("$SS_A — df_A$"), `maths keeps its own dash:\n${JSON.stringify(text)}`);
const row = lines.find((l) => l.startsWith("| ") && !l.includes("Cell") && !l.includes("---"));
assert.strictEqual(
  row.split("|").length,
  LINES[LINES.length - 2].split("|").length,
  `the marker row must keep its column count:\n${JSON.stringify(row)}`,
);

console.log("ok  the chain removes em dashes, per line, and keeps headings, maths and table markers");
