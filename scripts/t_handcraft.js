/**
 * The gate that exists because an AUTHOR caught it, twice, on a lecture that was already on the site.
 * Each case below is one of the things they found or one of the false positives that would make the
 * gate unusable if it fired on them.
 */
const assert = require("node:assert");
const { execFileSync } = require("node:child_process");
const { mkdtempSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");

const dir = mkdtempSync(join(tmpdir(), "composer-handcraft-"));
const run = (topics) => {
  const file = join(dir, `${Math.random().toString(36).slice(2)}.json`);
  writeFileSync(file, JSON.stringify({ version: 1, course: {}, topics }));
  try {
    return { out: execFileSync("node", [join(__dirname, "handcraft-check.mjs"), file], { encoding: "utf8" }), ok: true };
  } catch (e) {
    return { out: e.stdout ?? "", ok: false };
  }
};
const one = (block) => [{ number: 1, title: "T", blocks: [block] }];

/* An entry drawn as a grid. Forty of these on one course. */
const entry = run(one({
  id: "b1", type: "table", head: ["Account", "Debit", "Credit"],
  rows: [["Cash", "€1,000", ""], ["Share Capital", "", "€1,000"]],
}));
assert.ok(!entry.ok, "an Account/Debit/Credit grid with amounts must be a finding");
assert.match(entry.out, /journal entry/);

/* The SHAPE of an entry is a table on purpose: no amounts anywhere, so nothing to add up. */
const format = run(one({
  id: "b2", type: "table", head: ["Account", "Debit", "Credit"],
  rows: [["Dr. Account Name", "xxx", ""], ["Cr. Account Name", "", "xxx"]],
}));
assert.ok(format.ok, `a format illustration must not be a finding:\n${format.out}`);

/* A trial balance is told from an entry by its total row. */
const tb = run(one({
  id: "b3", type: "table", head: ["Account", "Debit", "Credit"],
  rows: [["Cash", "€9,400", ""], ["**Total**", "€13,600", "€13,600"]],
}));
assert.ok(!tb.ok);
assert.match(tb.out, /trial balance/);

/* A question asked inside an example box. */
const exercise = run(one({
  id: "b4", type: "callout", variant: "example", title: "Examples",
  body: "Short Exercise: is this a deferral or an accrual?",
}));
assert.ok(!exercise.ok);
assert.match(exercise.out, /question/);

/* A sentence pointing at something a screen does not have. */
const footnote = run(one({ id: "b5", type: "prose", body: "The answer is in the footnote at the bottom of the page!" }));
assert.ok(!footnote.ok);
assert.match(footnote.out, /footnote/);

/* Dr. and Cr. lines left in the prose. */
const drcr = run(one({ id: "b6", type: "prose", body: "So:\n\n**Dr. Cash 10,000**\n\n**Cr. Share Capital 10,000**" }));
assert.ok(!drcr.ok);

/* Ordinary prose, a real callout and a real journal entry are all silent. */
const clean = run([{ number: 1, title: "T", blocks: [
  { id: "c1", type: "prose", body: "## A Section\n\nAn ordinary paragraph about accruals." },
  { id: "c2", type: "callout", variant: "intuition", title: "The idea behind it", body: "Cash and recognition come apart." },
  { id: "c3", type: "journal-entry", caption: "An entry", accounts: [], entries: [] },
  { id: "c4", type: "table", variant: "data", caption: "Normal balances", head: ["Type", "Increases With"], rows: [["Assets", "Debit"]] },
] }]);
assert.ok(clean.ok, `a clean lecture must pass:\n${clean.out}`);
assert.match(clean.out, /nothing drawn by hand/);

console.log("handcraft ok");
