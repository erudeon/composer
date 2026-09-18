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

/*
 * A MARKER THAT NEVER CLOSES, in every field a student reads.
 *
 * Fourteen of these shipped on one statistics course before this rule existed, and SIX of them were in
 * the questions, which this gate did not look at at all. Each case below is one of the places they were
 * found, so a future gate that quietly stops reading one of them fails here.
 */
const STAR = "the guess p* is the worst case";
const places = {
  "a prose body": one({ id: "m1", type: "prose", body: STAR }),
  "a callout body": one({ id: "m2", type: "callout", variant: "note", title: "Note", body: STAR }),
  "a table cell": one({ id: "m3", type: "table", variant: "data", caption: "Critical values",
                        head: ["Level", "Value"], rows: [["80%", "for \u2212z*"]] }),
  "a figure caption": one({ id: "m4", type: "figure", imageKey: null, alt: "a curve", caption: STAR }),
  "a worked example step": one({ id: "m5", type: "worked-example", problem: "Find n",
                                 steps: [{ label: "Guess the proportion", result: "p* = 0.5" }] }),
};
for (const [where, topics] of Object.entries(places)) {
  const hit = run(topics);
  assert.ok(!hit.ok, `an unpaired asterisk in ${where} must be a finding`);
  assert.match(hit.out, /marker that never closes/, `in ${where}:\n${hit.out}`);
}

/* THE QUESTIONS. A gate over blocks alone passed a bank holding six of them. */
const inQuestions = run([{ number: 1, title: "T", blocks: [], questions: [
  { key: "q1", stem: "Which guess for p* do you use?", explanation: "p* = 0.5 is the safest.",
    options: [{ text: "p* = 0.5", correct: true }, { text: "p = 0.1" }] },
] }]);
assert.ok(!inQuestions.ok, "an unpaired asterisk in a question stem, option or explanation is a finding");
assert.match(inQuestions.out, /marker that never closes/);

/* Closed spans, an escaped asterisk and the operator itself are all silent. */
const marksOk = run([{ number: 1, title: "T", blocks: [
  { id: "n1", type: "prose", body: "The **bold** and the *italic* both close, and 5 \\* 3 is escaped." },
  { id: "n2", type: "prose", body: "The guess p\u2217 = 0.5 uses the asterisk operator." },
], questions: [
  { key: "q2", stem: "What is p\u2217?", explanation: "The guessed proportion.",
    options: [{ text: "A guess", correct: true }, { text: "A parameter" }] },
] }]);
assert.ok(marksOk.ok, `closed spans and the operator must pass:\n${marksOk.out}`);

/*
 * SPSS PRINTS A FOOTNOTE AND A SCREEN STILL HAS NO PAGE. The rule fired on five of these in one course,
 * every one of them correct teaching about software output rather than a page reference.
 */
const spss = run(one({ id: "f1", type: "prose",
  body: "Read the Pearson Chi-Square row and check the footnote under the SPSS table about expected counts." }));
assert.ok(spss.ok, `a footnote belonging to software output is not a page reference:\n${spss.out}`);

/* A page reference still is one, whatever is near it. */
const realPage = run(one({ id: "f2", type: "prose", body: "The full table is on page 8 of the SPSS output." }));
assert.ok(!realPage.ok, "a page reference is a finding even beside the word SPSS");

console.log("handcraft ok");
