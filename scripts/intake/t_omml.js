/**
 * Regression scaffold: WORD'S EQUATIONS TO LaTeX, construct by construct.
 *
 * Run it after touching `omml.js`. Unlike the other scaffolds here it ASSERTS as well as printing: a
 * formula that comes out wrong looks exactly like a formula that comes out right unless something
 * compares it, and the failure mode this module exists to stop -- an equation silently becoming nothing
 * -- is invisible to a human skimming output.
 *
 *   node t_omml.js
 *
 * THE LAST TWO CASES ARE THE ONES THAT WERE ACTUALLY BROKEN, found by running the two real accounting
 * documents through KaTeX rather than by reading the code.
 */
const assert = require("node:assert/strict");
const { ommlToLatex } = require("./omml.js");

/** An `<m:r>` run holding one piece of text. Word wraps every fragment in one of these. */
const r = (text) => `<m:r><m:rPr><m:sty m:val="p"/></m:rPr><m:t>${text}</m:t></m:r>`;
const el = (tag, inner) => `<${tag}>${inner}</${tag}>`;

const cases = [
  ["plain text", r("Assets=Liabilities"), "Assets=Liabilities"],
  ["a fraction", el("m:f", el("m:num", r("a")) + el("m:den", r("b"))), "\\frac{a}{b}"],
  [
    "a fraction inside a fraction",
    el("m:f", el("m:num", el("m:f", el("m:num", r("a")) + el("m:den", r("b")))) + el("m:den", r("c"))),
    "\\frac{\\frac{a}{b}}{c}",
  ],
  ["default brackets", el("m:d", el("m:e", r("x+y"))), "\\left(x+y\\right)"],
  [
    "square brackets, which Word names explicitly",
    el("m:d", el("m:dPr", '<m:begChr m:val="["/><m:endChr m:val="]"/>') + el("m:e", r("x"))),
    "\\left[x\\right]",
  ],
  ["a superscript", el("m:sSup", el("m:e", r("x")) + el("m:sup", r("2"))), "x^2"],
  ["a subscript", el("m:sSub", el("m:e", r("x")) + el("m:sub", r("i"))), "x_i"],
  [
    "a multi-character exponent, which needs its braces",
    el("m:sSup", el("m:e", r("x")) + el("m:sup", r("n+1"))),
    "x^{n+1}",
  ],
  ["a square root", el("m:rad", el("m:e", r("x"))), "\\sqrt{x}"],
  ["a cube root", el("m:rad", el("m:deg", r("3")) + el("m:e", r("x"))), "\\sqrt[3]{x}"],
  [
    "a sum with both bounds",
    el(
      "m:nary",
      el("m:naryPr", '<m:chr m:val="∑"/>') + el("m:sub", r("i=1")) + el("m:sup", r("n")) + el("m:e", r("x")),
    ),
    // The upper bound stays bare: a single plain character needs no braces, which is the same rule that
    // keeps `x^2` from becoming `{x}^{2}`.
    "\\sum_{i=1}^n{x}",
  ],

  /*
   * AN N-ARY WITH NO OPERATOR IS AN INTEGRAL, and Word writes one exactly this way: the default is
   * omitted, so an integral is a `m:nary` carrying no `m:chr` at all. Reading the absence as a sum
   * turned all 41 integrals of a calculus summary into summation signs, and every one of them
   * parsed, stored and rendered. The bounds case below is how the definite integrals were written.
   */
  [
    "an n-ary with NO operator, which is Word's integral",
    el("m:nary", el("m:naryPr", "<m:limLoc m:val=\"subSup\"/>") + el("m:e", r("f(x)dx"))),
    "\\int{f(x)dx}",
  ],
  [
    "a definite integral, still with no operator named",
    el(
      "m:nary",
      el("m:naryPr", "") + el("m:sub", r("a")) + el("m:sup", r("b")) + el("m:e", r("f(x)dx")),
    ),
    "\\int_a^b{f(x)dx}",
  ],

  // ── The operator map ──────────────────────────────────────────────────────────────────────────
  ["a delta, which KaTeX has no glyph for", r("∆Equity"), "\\Delta Equity"],
  ["a bullet operator", r("Price∙Shares"), "Price\\cdot Shares"],
  ["a euro sign, which KaTeX cannot render in any spelling", r("€5"), "\\text{EUR} 5"],

  // ── The safety net the module is built around ─────────────────────────────────────────────────
  ["an unknown construct degrades to its text rather than vanishing", el("m:groupChr", el("m:e", r("a+b"))), "a+b"],
  ["a LaTeX-special character is escaped, and the word between the two is a word", r("100% of $x"), "100\\%\\text{ of }\\$x"],

  // ── The two the real documents broke on ───────────────────────────────────────────────────────
  [
    "an apostrophe Word wrote as a superscript, which is not a group",
    el("m:sSup", el("m:e", r("Owner")) + el("m:sup", r("'"))),
    "{Owner}^{'}",
  ],
  ["an empty equation renders to nothing at all", "", ""],

  // ── What a MATHEMATICS document adds to an accounting one ─────────────────────────────────────
  // Counted on the IBA Mathematics summary: 8 zero-width spaces and one U+2061 inside equations (all
  // nine refused by the reader's strict KaTeX), 23 `ln` as a function, 20 boxed results, 4 bars, 2
  // accents, 1 limit, 94 normal-text runs, 3 arrows.
  ["a zero-width space Word leaves in a run, which strict KaTeX refuses", r("m=5\u200b"), "m=5"],
  ["the invisible function-application character", r("ln\u2061(x)"), "ln(x)"],
  [
    "a function name, upright and spaced as an operator",
    el("m:func", el("m:fName", r("ln")) + el("m:e", r("x"))),
    "\\ln x",
  ],
  [
    "a limit under lim",
    el("m:func", el("m:fName", el("m:limLow", el("m:e", r("lim")) + el("m:lim", r("Δx→0")))) + el("m:e", r("f"))),
    "\\lim_{Δx\\to 0} f",
  ],
  [
    "a limit under something that is not a function",
    el("m:limLow", el("m:e", r("max")) + el("m:lim", r("x"))),
    "\\underset{x}{max}",
  ],
  ["a limit over something", el("m:limUpp", el("m:e", r("lim")) + el("m:lim", r("x→0"))), "\\overset{x\\to 0}{lim}"],
  ["an overbar", el("m:bar", el("m:e", r("x"))), "\\overline{x}"],
  ["an underbar", el("m:bar", el("m:barPr", '<m:pos m:val="bot"/>') + el("m:e", r("x"))), "\\underline{x}"],
  [
    "an accent by its combining character",
    el("m:acc", el("m:accPr", '<m:chr m:val="\u0305"/>') + el("m:e", r("y"))),
    "\\overline{y}",
  ],
  ["a hat by default", el("m:acc", el("m:e", r("y"))), "\\hat{y}"],
  ["a boxed equation", el("m:borderBox", el("m:e", r("y=mx+c"))), "\\boxed{y=mx+c}"],
  [
    "a normal-text run, which is words and not variables",
    '<m:r><m:rPr><m:nor/></m:rPr><m:t xml:space="preserve">for any real number </m:t></m:r>' + r("n"),
    "\\text{for any real number }n",
  ],
  ["a euro inside normal text", "<m:r><m:rPr><m:nor/></m:rPr><m:t>€</m:t></m:r>" + r("5"), "\\text{EUR}5"],
  ["a rightwards arrow", r("x→0"), "x\\to 0"],
];

let failed = 0;
for (const [name, xml, want] of cases) {
  const got = ommlToLatex(xml);
  const ok = got === want;
  if (!ok) failed += 1;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}`);
  if (!ok) console.log(`       want: ${JSON.stringify(want)}\n       got : ${JSON.stringify(got)}`);
}


/* ── words the author typed into an equation ─────────────────────────────────────────────────────── */

let extra = 0;
const run = (t, nor) =>
  `<m:oMath><m:r>${nor ? "<m:rPr><m:nor/></m:rPr>" : ""}<m:t>${t}</m:t></m:r></m:oMath>`;

for (const [what, xml, expected] of [
  [
    "WORDS WITH SPACES ARE WORDS. Math mode sets every letter as a variable and drops the spaces, so this rendered as changeiny on a published lecture.",
    run("change in y"),
    "\\text{change in }y",
  ],
  [
    "a connective between conditions. This one read andx > 0.",
    run("a>0, a≠1, and x>0"),
    "a>0, a\\neq 1,\\text{ and }x>0",
  ],
  [
    "A RUN THAT IS ONLY A SPACE. Word writes the gaps around a connective as their own runs and math mode drops every one.",
    run(" "),
    "~",
  ],
  ["a bare connective, which is prose wherever it appears", run("or"), "\\text{or}"],
  [
    "TWO LETTERS WITH NO SPACE ARE A PRODUCT, not a word: ab is a times b and stays italic.",
    run("ab"),
    "ab",
  ],
  ["a product written with a space is still a product", run("a b"), "a b"],
  ["a run the author marked as normal text is unchanged", run("for any real number", true), "\\text{for any real number}"],
]) {
  const got = ommlToLatex(xml).trim();
  const ok = got === expected;
  if (!ok) failed += 1;
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok) console.log(`       want: ${JSON.stringify(expected)}\n       got : ${JSON.stringify(got)}`);
  extra += 1;
}

for (const [what, xml, expected] of [
  [
    "TWO LETTERS AROUND AN OPERATOR ARE VARIABLES. `ac > bc` is a times c against b times c, and wrapping it shipped a whole course in upright text.",
    run("ac > bc"),
    "ac > bc",
  ],
  ["a three-letter product is still variables when it is not a word", run("xyz + 1"), "xyz + 1"],
  ["a function name keeps its own spelling", run("ln(x) + 1"), "ln(x) + 1"],
  ["the space BEFORE a word belongs to it too", run("100 of x"), "100\\text{ of }x"],
  [
    "A RUN ENDING ON A WORD. The lookahead for the next token runs off the end, which crashed the whole extraction on the first real document.",
    run("x is positive"),
    "x\\text{ is positive}",
  ],
])
  {
  const got = ommlToLatex(xml).trim();
  const ok = got === expected;
  if (!ok) failed += 1;
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok) console.log(`       want: ${JSON.stringify(expected)}\n       got : ${JSON.stringify(got)}`);
  extra += 1;
}

console.log(`\n${cases.length + extra - failed}/${cases.length + extra} passed`);
assert.equal(failed, 0, `${failed} OMML case(s) came out wrong`);
