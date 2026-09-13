/**
 * Where the maths is. Every case here is one a real document got wrong.
 *
 *   node scripts/intake/t_spans.js
 */
const { mathsSpans } = require("./maths-spans.js");

const D = String.fromCharCode(36);
const cases = [
  // [what it is, text, the tex of every span expected, in order]
  ["a plain inline equation", `${D}x^2 + 1${D}`, ["x^2 + 1"]],
  ["a display equation", `${D}${D}\\frac{a}{b}${D}${D}`, ["\\frac{a}{b}"]],
  [
    "AN AMOUNT INSIDE AN EQUATION. The escaped dollar is one the equation is about, and letting it close the span truncated every money formula to a stump that KaTeX refused. This shape turned 5 refusals across the corpus into 24.",
    `${D}5,000 \\times \\${D}1,200${D}`,
    ["5,000 \\times \\$1,200"],
  ],
  [
    "TWO AMOUNTS WITH A DASH BETWEEN THEM. Pandoc's rule settles it: the closing dollar is preceded by a space, so it never opened an equation. Four of the five refusals left across 134 documents were this.",
    `${D}60,000 – ${D}40,000 is the difference`,
    [],
  ],
  [
    "two amounts with a sentence between them",
    `${D}100,000 forever. At a 5% discount rate that is ${D}2m`,
    [],
  ],
  [
    "a dangling operator, which is the left half of a sentence",
    `earnings ${D}3.90 − ${D}4.60 per share`,
    [],
  ],
  [
    "a dollar in code is not a delimiter",
    "the column `announcements$AR_0` and `x$y`",
    [],
  ],
  [
    "an inline equation does not cross a line",
    `costs ${D}5 per unit\nand ${D}9 per box`,
    [],
  ],
  ["a table cell of amounts", `| ${D}900,000 | ${D}450,000 |`, []],
  [
    "two real equations in one sentence",
    `let ${D}a_1${D} and ${D}b_2${D} be given`,
    ["a_1", "b_2"],
  ],
  [
    "display and inline together, and the display's dollars do not pair with the inline's",
    `${D}${D}y = mx${D}${D} where ${D}m${D} is the slope`,
    ["y = mx", "m"],
  ],
];

let failed = 0;
for (const [what, text, expected] of cases) {
  const got = mathsSpans(text).map((s) => s.tex);
  const ok =
    got.length === expected.length && got.every((t, i) => t === expected[i]);
  if (!ok) failed += 1;
  console.log(`${ok ? "ok  " : "FAIL"} ${what.split(".")[0]}`);
  if (!ok) {
    console.log(`       in:       ${JSON.stringify(text)}`);
    console.log(`       expected: ${JSON.stringify(expected)}`);
    console.log(`       got:      ${JSON.stringify(got)}`);
  }
}

// The offsets have to point at the original string, or normalise puts the maths back in the wrong place.
const text = `a ${D}x^2${D} b`;
const [span] = mathsSpans(text);
const sliced = text.slice(span.start, span.end);
const offsetsOk = sliced === `${D}x^2${D}`;
if (!offsetsOk) failed += 1;
console.log(
  `${offsetsOk ? "ok  " : "FAIL"} the offsets point into the original text`,
);
if (!offsetsOk) console.log(`       got ${JSON.stringify(sliced)}`);

console.log(`\n${cases.length + 1 - failed}/${cases.length + 1} passed`);
process.exit(failed === 0 ? 0 : 1);
