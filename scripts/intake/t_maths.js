/** A multi-word name in maths loses its spaces silently. `maths-spacing.js` is why this stays fixed. */
const assert = require("node:assert");
const { weldedSpaces } = require("./maths-spacing.js");

const same = (tex) => assert.equal(weldedSpaces(tex).tex, tex, tex);
const to = (tex, want, n) => {
  const r = weldedSpaces(tex);
  assert.equal(r.tex, want, tex);
  assert.equal(r.fixed, n, `${tex} count`);
};

/* The defect itself, from the accounting summary that found it. */
to(
  String.raw`Equity=Share Capital+Retained Earnings`,
  String.raw`Equity=Share\ Capital+Retained\ Earnings`,
  2,
);
to(
  String.raw`Depreciation Expense = \frac{Cost-Residual Value}{Estimated Service Life}`,
  String.raw`Depreciation\ Expense = \frac{Cost-Residual\ Value}{Estimated\ Service\ Life}`,
  4,
);

/* A space that ends a control word is load-bearing: `\Delta Share` is not `\Delta\ Share` by accident. */
to(
  String.raw`\Delta Equity=\Delta Share Capital`,
  String.raw`\Delta Equity=\Delta Share\ Capital`,
  1,
);

/* Inside a textual group the space is already real. */
same(String.raw`Prior\text{ retained earnings}`);
same(String.raw`\text{Share Capital and more}`);
to(
  String.raw`Cost\text{ Of }Goods Sold`,
  String.raw`Cost\text{ Of }Goods\ Sold`,
  1,
);
/* Nested braces inside the group must not end it early. */
same(String.raw`\text{a \frac{b c}{d e} f}`);

/* Nothing to do, and nothing done. */
same(String.raw`Assets = Liabilities + Equity`);
same(String.raw`\frac{365}{Turnover}`);
same(String.raw`E=mc^2`);

/* Idempotent: a repaired expression is left alone. */
const once = weldedSpaces(String.raw`Share Capital+Net income`).tex;
assert.equal(weldedSpaces(once).fixed, 0, "second pass must change nothing");

console.log("maths spacing ok");

/*
 * END TO END, because the DETECTOR had its own bug and the unit checks above could not see it. It
 * tested the drawn output for an ASCII space; KaTeX draws U+00A0, so every multi-word expression came
 * back welded whether it had been repaired or not, and the repair looked like it had done nothing.
 * A repaired file must come back clean, and that is the only assertion that would have caught it.
 */
const { execFileSync } = require("node:child_process");
const { writeFileSync, mkdtempSync } = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");

const here = __dirname;
const dir = mkdtempSync(join(tmpdir(), "composer-maths-"));
const fixture = join(dir, "extract.md");
writeFileSync(
  fixture,
  [
    String.raw`Prose with $Share Capital$ inline.`,
    "",
    String.raw`$$Depreciation Expense = \frac{Cost-Residual Value}{Estimated Service Life}$$`,
    "",
    String.raw`Already fine: $$Prior\text{ retained earnings} + Assets$$`,
    "",
    String.raw`Nothing to do: $$E=mc^2$$`,
    "",
  ].join("\n"),
);

const check = () =>
  execFileSync("node", [join(here, "katex-check.js"), fixture], { encoding: "utf8" });

const before = check();
assert.match(before, /welded=2\b/, `expected two welded equations, got:\n${before}`);

execFileSync("node", [join(here, "..", "fix-maths-spacing.mjs"), fixture], {
  encoding: "utf8",
});

const after = check();
assert.match(after, /welded=0\b/, `a repaired file must come back clean, got:\n${after}`);
assert.match(after, /refused=0/, "the repair must not break an equation");

/* And the repair is a no-op the second time, so a re-run cannot double-space anything. */
const again = execFileSync("node", [join(here, "..", "fix-maths-spacing.mjs"), fixture], {
  encoding: "utf8",
});
assert.match(again, /0 repaired/, `second run must repair nothing, got: ${again}`);

console.log("maths spacing end to end ok");

/*
 * THE EDGE OF A TEXTUAL GROUP. A space next to `\text{...}` is OUTSIDE it, so it was never skipped
 * and never repaired either: the letter-on-both-sides rule sees a `}` or a `\`. Every money amount
 * in a finance summary is written this way, and every one of them drew "EUR1,120.50".
 */
to(String.raw`\text{EUR} 1,120.50`, String.raw`\text{EUR}\ 1,120.50`, 1);
to(String.raw`\left(100 \text{and} 540\right)`, String.raw`\left(100\ \text{and}\ 540\right)`, 2);
to(
  String.raw`\boxed{\text{EUR} 72.25 \text{per month}}`,
  String.raw`\boxed{\text{EUR}\ 72.25\ \text{per month}}`,
  2,
);
/* A binary operator already draws its own space, and the one after it ends the control word. */
same(String.raw`\frac{1}{2}\times \text{base}\times \text{height}`);
/* ... and the amount after that operator's own textual group still needs its space. */
to(String.raw`3.5\times \text{EUR} 220.50`, String.raw`3.5\times \text{EUR}\ 220.50`, 1);
/* A space the author put INSIDE the group is already real and stays exactly one space. */
same(String.raw`\text{for any real number }n`);

console.log("maths spacing at a textual edge ok");
