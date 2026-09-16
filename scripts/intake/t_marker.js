/**
 * A DASH THAT IS A VALUE, NOT PUNCTUATION.
 *
 * A table cell holding one em dash means "not applicable". The punctuation rules have no concept of
 * that, and both of them corrupt it:
 *
 *   - the lone-dash rule turns a totals row into `| Totaal | 0,0 | : | : | 13,091 |`
 *   - the paired rule is worse. Two adjacent marker cells look like a matched pair to it, so `| — | — |`
 *     brackets the pipe between them and emits `(|)`, destroying the row's column structure.
 *
 * Both were live on a published course. An en dash is what a marker cell should hold: it is the
 * conventional one, it is not the banned character, and it cannot be read as punctuation joining two
 * clauses.
 *
 *   node scripts/intake/t_marker.js
 */
const assert = require("node:assert");
const { stripEmDashes } = require("./lib.js");

const EN_DASH = "–";
const EM_DASH = "—";

const CASES = [
  // The whole string is the marker: a cell handed over on its own.
  [EM_DASH, EN_DASH],
  [`  ${EM_DASH}  `, `  ${EN_DASH}  `],

  /*
   * TWO ADJACENT MARKER CELLS, which is the case that produced `(|)`. The second one is why the cell
   * pattern uses a lookahead: consuming the closing pipe makes adjacent cells overlap and the second of
   * every pair goes unmatched.
   */
  [
    `| Totaal | 0,0 | ${EM_DASH} | ${EM_DASH} | 13,091 |`,
    `| Totaal | 0,0 | ${EN_DASH} | ${EN_DASH} | 13,091 |`,
  ],

  // A single marker cell at the end of a row.
  [
    `| Wanneer verplicht between | Als de conditie de persoon blijvend verandert | ${EM_DASH} |`,
    `| Wanneer verplicht between | Als de conditie de persoon blijvend verandert | ${EN_DASH} |`,
  ],

  // Three in a row, to show the lookahead holds past the first pair.
  [`| a | ${EM_DASH} | ${EM_DASH} | ${EM_DASH} |`, `| a | ${EN_DASH} | ${EN_DASH} | ${EN_DASH} |`],

  /*
   * A DASH INSIDE A CELL IS STILL PUNCTUATION, and must go down the ordinary rule rather than becoming a
   * marker. This is the line that keeps the two apart: the marker rule may only fire on a cell holding
   * NOTHING else.
   */
  [
    `| Begrip | een toets ${EM_DASH} of een formule | 3 |`,
    "| Begrip | een toets, of een formule | 3 |",
  ],
];

for (const [input, expected] of CASES) {
  assert.strictEqual(stripEmDashes(input), expected, `\n  in:   ${input}\n  want: ${expected}\n  got:  ${stripEmDashes(input)}`);
}

for (const [input] of CASES) {
  const out = stripEmDashes(input);
  assert.ok(!out.includes(EM_DASH), `an em dash survived: ${input}`);
  /*
   * THE COLUMN COUNT IS THE POINT. The `(|)` bug was invisible as a punctuation change and obvious as a
   * row that lost a column, so that is what this asserts.
   */
  assert.strictEqual(
    (out.match(/\|/g) || []).length,
    (input.match(/\|/g) || []).length,
    `the row lost or gained a column:\n  in:  ${input}\n  out: ${out}`,
  );
}

// PROVE THE CHECK CAN FAIL: every case must do real work.
assert.ok(
  CASES.every(([input, expected]) => input !== expected),
  "a case is a no-op, so it proves nothing about the marker rule",
);

console.log(`t_marker: ${CASES.length} cases, all load-bearing. OK`);
