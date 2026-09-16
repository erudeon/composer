/**
 * THE EM DASH RULE, PINNED.
 *
 * `stripEmDashes` is the most dangerous function in this repo: it rewrites punctuation inside markdown
 * that already carries inline emphasis, which is the shape that produced three separate corruption bugs.
 * CLAUDE.md names this file as one of the reasons it survived them.
 *
 * It was not. Until this rewrite the file printed its output and asserted nothing, so it exited 0
 * whatever it produced, and the documented sweep (`node "$t" || echo "FAILED $t"`) reported success for
 * a guard that could not fail. Every case below is now an equality, so a change to the rule shows up
 * here as a diff somebody has to justify rather than as a line nobody reads.
 *
 *   node scripts/intake/t_dash.js
 */
const assert = require("node:assert");
const { stripEmDashes } = require("./lib.js");

// [input, expected]. Every input is a real sentence from a real student summary.
const CASES = [
  // A lone dash introducing an explanation becomes a colon.
  [
    "The perception of basic emotions is comparable across cultures — a smiling face indicates happiness everywhere.",
    "The perception of basic emotions is comparable across cultures: a smiling face indicates happiness everywhere.",
  ],
  ["Our **behaviour** — how we act.", "Our **behaviour**: how we act."],
  [
    "Deindividuation therefore depends on what one loses it into — the group norm.",
    "Deindividuation therefore depends on what one loses it into: the group norm.",
  ],

  // A pair bracketing an aside becomes parentheses.
  [
    "**Arousal** is the state of being activated — physiologically or psychologically — such as an increased heart rate or sweating.",
    "**Arousal** is the state of being activated (physiologically or psychologically) such as an increased heart rate or sweating.",
  ],
  [
    "A notorious case from 1964 in New York — the murder of **Kitty Genovese** — gave an enormous impulse to research.",
    "A notorious case from 1964 in New York (the murder of **Kitty Genovese**) gave an enormous impulse to research.",
  ],
  [
    "the collective performance — although increasing with group size — was considerably less than the sum of the individual efforts",
    "the collective performance (although increasing with group size) was considerably less than the sum of the individual efforts",
  ],

  // A sentence that already carries a colon takes a comma, so the reader does not meet two colons.
  [
    "Example: the Japanese emotion **'amae'** — the desire to be dependent and to be taken care of.",
    "Example: the Japanese emotion **'amae'**, the desire to be dependent and to be taken care of.",
  ],
  [
    "**Private conformity** — also called **conversion** or **true acceptance**: you not only change your behaviour.",
    "**Private conformity**, also called **conversion** or **true acceptance**: you not only change your behaviour.",
  ],

  // A connective after the dash takes a comma whatever else the sentence carries.
  [
    "people help sick family more readily, but in life-threatening situations rather healthy relatives — because those have a greater chance of passing on the genes.",
    "people help sick family more readily, but in life-threatening situations rather healthy relatives, because those have a greater chance of passing on the genes.",
  ],

  // Nothing to do: these must come back byte for byte.
  ["Emotions are short-lived, moods are long-lasting.", "Emotions are short-lived, moods are long-lasting."],
  [
    "**Obedience → Compliance → Conformity → Independence → Assertiveness → Defiance**",
    "**Obedience → Compliance → Conformity → Independence → Assertiveness → Defiance**",
  ],

  /*
   * A KNOWN WART, PINNED AS IT IS RATHER THAN AS IT SHOULD BE. `as**` opens a bold span that the tidy
   * pass, not this one, is responsible for spacing, so the marker stays welded to the word before it.
   * stripEmDashes is right not to touch it: moving an emphasis marker is the bug class this whole file
   * exists to catch. Recorded so that a later fix to the emphasis pass shows up here as an intended
   * change instead of a surprise.
   */
  [
    "This is known as** engaged followership**: the participant is motivated to shock.",
    "This is known as** engaged followership**: the participant is motivated to shock.",
  ],
];

for (const [input, expected] of CASES) {
  assert.strictEqual(stripEmDashes(input), expected, `\n  in:   ${input}\n  want: ${expected}\n  got:  ${stripEmDashes(input)}`);
}

/*
 * THE RULE'S ONE ABSOLUTE. Whatever it decides, no em dash may survive it. Asserted over every case
 * rather than trusted, because each branch above reaches a different replacement and only this says
 * that all of them finish the job.
 */
for (const [input] of CASES) {
  assert.ok(!stripEmDashes(input).includes("—"), `an em dash survived: ${input}`);
}

/*
 * PROVE THE CHECK CAN FAIL. A suite of equalities over inputs that happen to need no work would pass
 * against a function that returns its argument, which is exactly the failure this file is replacing.
 * So: the identity function must break at least one case above.
 */
const wouldPass = CASES.filter(([input, expected]) => input === expected).length;
assert.ok(wouldPass < CASES.length, "every case is a no-op, so this suite cannot detect a broken rule");

console.log(`t_dash: ${CASES.length} cases, ${CASES.length - wouldPass} of them load-bearing. OK`);
