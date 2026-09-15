/**
 * TWO WAYS A BLOCK IS PERFECTLY VALID AND STILL WRONG ON THE PAGE.
 *
 * Both were found by an author looking at a rendered lecture, after every check here had passed the
 * block: the write path takes it, KaTeX renders it, and the reader draws it wrongly anyway.
 *
 * An equation wider than the paper is CLIPPED, with a scroll shadow where the rest of it should be.
 * Ten of them on one real course, two clipped mid-line, the widest on a lecture already published.
 *
 * A step label, a step note, a chart title, a marker label and a table caption are all PLAIN TEXT, so
 * `**Finished Goods**` reaches a student with its asterisks on.
 */
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const { mkdtempSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");

const run = (blocks) => {
  const dir = mkdtempSync(join(tmpdir(), "composer-drawn-"));
  const file = join(dir, "manifest.json");
  writeFileSync(file, JSON.stringify({ topics: [{ number: 1, title: "T", blocks }] }));
  const r = spawnSync("node", [join(__dirname, "handcraft-check.mjs"), file], { encoding: "utf8" });
  return r.stdout + r.stderr;
};

/* The one that was actually on the page: a fraction whose numerator alone runs past the sheet. */
const WIDE =
  "Cost\\ per\\ unit = \\frac{Current\\text{ costs}}{Current\\ EU} = " +
  "\\frac{Current\\text{ costs}}{Completed\\ units + Closing\\ WIP\\ EU - Opening\\ WIP\\ EU}";
let out = run([{ id: "b1", type: "formula", latex: WIDE }]);
assert.match(out, /wider than the sheet/, `a clipped equation was not reported:\n${out}`);

/* Stacked, the same maths fits, and the check must not cry about it. */
const STACKED =
  "\\begin{aligned}Cost\\ per\\ unit &= \\frac{Current\\text{ costs}}{Current\\ EU} \\\\ " +
  "&= \\frac{Current\\text{ costs}}{Completed\\ units + Closing\\ WIP\\ EU - Opening\\ WIP\\ EU}\\end{aligned}";
out = run([{ id: "b2", type: "formula", latex: STACKED }]);
assert.doesNotMatch(out, /wider than the sheet/, `stacking it was reported anyway:\n${out}`);

/* A fraction is as wide as its wider half. Measuring the sum would condemn every short one. */
out = run([{ id: "b3", type: "formula", latex: "x = \\frac{Total\\ product\\ cost}{Normal\\ units}" }]);
assert.doesNotMatch(out, /wider than the sheet/, `a short fraction was measured as the sum:\n${out}`);

/* Markdown in each plain-text field there is. */
out = run([
  {
    id: "b4",
    type: "worked-example",
    title: "E",
    problem: "p",
    steps: [{ label: "Value inventories", note: "WIP = 400 EU x EUR 20 = **EUR 8,000**" }],
  },
]);
assert.match(out, /drawn as plain text/, `a step note kept its emphasis:\n${out}`);
assert.match(out, /step 1 note/, `the finding did not say WHICH field:\n${out}`);

/* A list marker is drawn as a hyphen, so it is markdown too. This is the shape that reached a page. */
out = run([
  {
    id: "b4b",
    type: "worked-example",
    title: "E",
    problem: "p",
    steps: [{ label: "Value inventories", note: "- WIP = 400 EU x EUR 20\n- Finished goods = 2,600 EU" }],
  },
]);
assert.match(out, /drawn as plain text/, `a bulleted note was not reported:\n${out}`);

out = run([
  { id: "b5", type: "chart", title: "T", series: [], markers: [{ x: 0, y: 0, label: "**Break-even**" }] },
]);
assert.match(out, /drawn as plain text/, `a chart marker label kept its emphasis:\n${out}`);

out = run([{ id: "b6", type: "table", caption: "A **bold** caption", head: [], rows: [] }]);
assert.match(out, /drawn as plain text/, `a table caption kept its emphasis:\n${out}`);

/* And a clean one stays clean, or the check is worthless. */
out = run([
  { id: "b7", type: "formula", latex: "Assets = Liabilities + Equity" },
  { id: "b8", type: "worked-example", title: "E", problem: "p", steps: [{ label: "Add them up", note: "2 + 2 = 4" }] },
  { id: "b9", type: "table", caption: "A plain caption", head: [], rows: [] },
]);
assert.match(out, /nothing drawn by hand/, `a clean lecture was reported:\n${out}`);

console.log("t_drawn: a clipped equation and markdown in a plain-text field");
