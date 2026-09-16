/**
 * PAIRED DASHES ACROSS SENTENCE BOUNDARIES AND EMPHASIS SPANS.
 *
 * `t_dash.js` covers one sentence at a time. This file covers what broke in the field: a paragraph of
 * SEVERAL sentences where the dashes are not a matched pair at all, and where a naive pairing rule
 * would bracket from one sentence into the next and swallow the text between them.
 *
 * The defence is that the rule splits on sentence boundaries first and only then looks for a pair, and
 * that it refuses to bracket across an odd number of `**` markers. Both are asserted here.
 *
 * Like t_dash.js this file used to print and assert nothing, so it exited 0 whatever came out.
 *
 *   node scripts/intake/t_pair.js
 */
const assert = require("node:assert");
const { stripEmDashes } = require("./lib.js");

const CASES = [
  /*
   * TWO DASHES IN ONE PARAGRAPH THAT ARE NOT A PAIR. The first closes a bold label, the second
   * introduces an aside, and they sit in different sentences. Bracketing from one to the other would
   * eat "theology students had to give a lecture quickly" and put it inside parentheses.
   */
  [
    'Helping sometimes involves physical danger or effort. **Darley & Batson (1973) — the Good Samaritan experiment**: theology students had to give a lecture quickly — about the "Good Samaritan". On the way they saw a man groaning in an alley.',
    'Helping sometimes involves physical danger or effort. **Darley & Batson (1973), the Good Samaritan experiment**: theology students had to give a lecture quickly, about the "Good Samaritan". On the way they saw a man groaning in an alley.',
  ],

  /*
   * THE SAME, WITH THE DASHES IN SEPARATE SENTENCES. A pair here would bracket across the full stop.
   */
  [
    "**Social Impact Theory (Latané)**: strength × immediacy × number — immediacy can be partly replaced by **online immediacy**. **French & Raven — six power bases**: reward, coercive, legitimate.",
    "**Social Impact Theory (Latané)**: strength × immediacy × number, immediacy can be partly replaced by **online immediacy**. **French & Raven, six power bases**: reward, coercive, legitimate.",
  ],

  // A genuine pair, for contrast: this one must become parentheses.
  [
    "A notorious case from 1964 in New York — the murder of **Kitty Genovese** — gave an enormous impulse to research.",
    "A notorious case from 1964 in New York (the murder of **Kitty Genovese**) gave an enormous impulse to research.",
  ],

  /*
   * A PAIR THAT WOULD SPLIT A BOLD SPAN. The inner phrase carries one `**`, so bracketing it would move
   * a marker and weld the bold across the parenthesis. What this case pins is the REFUSAL: no
   * parentheses appear, and each dash falls back to the ordinary lone-dash rule. That the second one
   * lands on a colon is that rule working normally ("were" is not a connective and the sentence carries
   * no colon of its own), not a judgement about this sentence.
   */
  [
    "the **first factor — and the second** — were measured separately.",
    "the **first factor, and the second**: were measured separately.",
  ],
];

for (const [input, expected] of CASES) {
  assert.strictEqual(stripEmDashes(input), expected, `\n  in:   ${input}\n  want: ${expected}\n  got:  ${stripEmDashes(input)}`);
}

for (const [input] of CASES) {
  const out = stripEmDashes(input);
  assert.ok(!out.includes("—"), `an em dash survived: ${input}`);
  // Emphasis is never moved: the count of markers is what went in.
  assert.strictEqual(
    (out.match(/\*\*/g) || []).length,
    (input.match(/\*\*/g) || []).length,
    `the rule added or dropped a bold marker:\n  in:  ${input}\n  out: ${out}`,
  );
}

/*
 * PROVE THE CHECK CAN FAIL: no case here may be a no-op, or the suite would pass against a function
 * that returns its argument.
 */
assert.ok(
  CASES.every(([input, expected]) => input !== expected),
  "a case is a no-op, so it proves nothing about the pairing rule",
);

console.log(`t_pair: ${CASES.length} cases, all load-bearing. OK`);
