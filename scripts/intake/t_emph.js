/**
 * EMPHASIS SPACING, PINNED.
 *
 * Word writes whitespace INSIDE an emphasis span constantly ("**behaviour **is"), which markdown will
 * not render: the span simply does not close where the author meant it to. `tidy` walks the markers and
 * moves that whitespace outside, and it is marker-aware precisely so it can never match across a span
 * boundary.
 *
 * This is the third of the three files CLAUDE.md names as the reason `lib.js` survived its corruption
 * bugs, and like the other two it printed its output and asserted nothing, so it exited 0 whatever it
 * produced.
 *
 *   node scripts/intake/t_emph.js
 */
const assert = require("node:assert");
const { tidy } = require("./lib.js");

const CASES = [
  // Space before the punctuation, outside the span: closed up.
  [
    "the **Ringelmann effect** , also known as ***Social Loafing*** .",
    "the **Ringelmann effect**, also known as ***Social Loafing***.",
  ],

  // Trailing space inside the span: moved out, so the span closes on the word.
  ["Our **behaviour **— how we act.", "Our **behaviour** — how we act."],
  ["**Emotions **are experiences that occur when we regard our situation.", "**Emotions** are experiences that occur when we regard our situation."],
  ["the** clarity **and the** severity **of the emergency", "the **clarity** and the **severity** of the emergency"],
  ["both the** overbenefited **and the** underbenefited **partner.", "both the **overbenefited** and the **underbenefited** partner."],

  // Leading space inside the span: moved out, so the span opens on the word.
  ["This is known as** engaged followership**: the participant is motivated.", "This is known as **engaged followership**: the participant is motivated."],
  ["so that the expectation is confirmed.** Limitations: **", "so that the expectation is confirmed. **Limitations:**"],

  // Nothing to do: these must come back byte for byte.
  ["***Arousal*** is a state of physiological excitation.", "***Arousal*** is a state of physiological excitation."],
  ["no change **here** at all", "no change **here** at all"],

  /*
   * A KNOWN WART, PINNED AS IT IS RATHER THAN AS IT SHOULD BE.
   *
   * With a nested italic inside a bold, the walker gets the stack wrong: the space that belongs outside
   * `***` is moved INSIDE it, producing `*private conformity ***(or`, and the opening `as**` is left
   * welded to the word before it. Both are the opposite of what this function is for. The correct output
   * would be "known as ***private conformity*** (or ***conversion***).".
   *
   * Recorded rather than fixed because that fix belongs to the emphasis walker, not to the em dash work
   * this file was repaired for, and because this function is the one that caused three corruption bugs:
   * it does not get an unrelated change smuggled in beside a test repair. Pinned so the fix, when it
   * comes, shows up here as an intended change instead of a surprise.
   */
  ["known as** *private conformity*** (or** *conversion***).", "known as** *private conformity ***(or** *conversion***)."],
];

for (const [input, expected] of CASES) {
  assert.strictEqual(tidy(input), expected, `\n  in:   ${input}\n  want: ${expected}\n  got:  ${tidy(input)}`);
}

/*
 * THE ABSOLUTE: tidy may move a marker's whitespace, never a marker's COUNT. Dropping or adding one
 * re-opens a span somewhere later in the document, which is how a whole paragraph once went bold.
 */
for (const [input] of CASES) {
  const out = tidy(input);
  for (const marker of ["***", "**", "*"]) {
    const count = (s) => s.split(marker).length - 1;
    assert.strictEqual(count(out), count(input), `tidy changed the number of ${marker} markers:\n  in:  ${input}\n  out: ${out}`);
  }
  // The words themselves are the author's and are never touched.
  assert.strictEqual(
    out.replace(/[*\s]/g, ""),
    input.replace(/[*\s]/g, ""),
    `tidy changed the text, not just the spacing:\n  in:  ${input}\n  out: ${out}`,
  );
}

// PROVE THE CHECK CAN FAIL: most cases must be real work, or this passes against the identity function.
const noops = CASES.filter(([input, expected]) => input === expected).length;
assert.ok(noops < CASES.length - 2, "too few cases do real work for this suite to detect a broken rule");

console.log(`t_emph: ${CASES.length} cases, ${CASES.length - noops} of them load-bearing. OK`);
