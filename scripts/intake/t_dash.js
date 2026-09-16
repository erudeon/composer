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

  /*
   * DUTCH CONNECTIVES REACH THE SAME BRANCH AS ENGLISH ONES. The list was English-only, so each of
   * these took a colon, which is wrong every time: "omdat" is "because", "of" here is "whether",
   * "die" and "wat" are relative pronouns. Live Dutch courses only ever read correct by accident,
   * when the sentence happened to carry an earlier colon and reached a comma down the other branch.
   */
  [
    "gaat het maken van de berekeningen meestal ook een stuk beter — omdat je de onderliggende redenering snapt.",
    "gaat het maken van de berekeningen meestal ook een stuk beter, omdat je de onderliggende redenering snapt.",
  ],
  ["De vraag is simpel — of de varianties gelijk zijn.", "De vraag is simpel, of de varianties gelijk zijn."],
  [
    "Dit is de formele toets — want Levene toetst de gelijkheid van varianties.",
    "Dit is de formele toets, want Levene toetst de gelijkheid van varianties.",
  ],
  [
    "de mogelijkheid om interacties te toetsen — wat met losse one-way ANOVA's principieel onmogelijk is.",
    "de mogelijkheid om interacties te toetsen, wat met losse one-way ANOVA's principieel onmogelijk is.",
  ],
  [
    "De amygdala — die betrokken is bij angst — consolideert het geheugen.",
    "De amygdala (die betrokken is bij angst) consolideert het geheugen.",
  ],

  /*
   * AND A DUTCH SENTENCE WHOSE DASH IS NOT A CONNECTIVE still takes a colon, so the rule above widened
   * the comma branch rather than replacing the colon one.
   */
  [
    "Er zijn twee soorten geheugen — het werkgeheugen en het langetermijngeheugen.",
    "Er zijn twee soorten geheugen: het werkgeheugen en het langetermijngeheugen.",
  ],

  /*
   * A COLON OUTSIDE A BRACKET DOES NOT COLLIDE WITH A DASH INSIDE ONE. The comma branch exists so the
   * reader never meets two colons in one breath, but "Example:" here is outside the aside entirely.
   * Taking a comma from it made the gloss read as a fourth Dutch school track alongside vmbo, havo and
   * vwo, which is what shipped to the live course and had to be corrected by hand.
   */
  [
    "Example: education level (vmbo, havo, vwo — the Dutch secondary-school tracks, from pre-vocational to pre-university), place in a ranking.",
    "Example: education level (vmbo, havo, vwo: the Dutch secondary-school tracks, from pre-vocational to pre-university), place in a ranking.",
  ],

  /*
   * THE SAME SENTENCE SHAPE WITH THE BRACKET ALREADY CLOSED before the dash, which must still take the
   * comma. This is the line between the two: the scan walks back over closed pairs rather than taking
   * the nearest bracket it finds.
   */
  [
    "Example: the tracks (vmbo, havo, vwo) — the Dutch secondary-school system.",
    "Example: the tracks (vmbo, havo, vwo), the Dutch secondary-school system.",
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

/*
 * THE RULE MUST NOT BE QUADRATIC IN A LINE'S DASHES.
 *
 * A line is somebody else's document and nothing bounds its length. Two versions of this rule have
 * already been quadratic: an unbounded backward scan for the enclosing bracket (4,000 dashes took 10.9
 * seconds), and computing the sentence's colon test inside the per-dash replacer, which copies the whole
 * line every time (400k chars with 2,000 dashes went from 3ms to 226ms). Both were caught by measuring
 * rather than by reading, and neither changed a single character of output, so no equality above would
 * have noticed.
 *
 * The ceiling is deliberately loose. It exists to catch an intake that HANGS on a hostile file, not to
 * police milliseconds, because wall-clock on a shared machine is not a stable number.
 */
{
  /*
   * The size is chosen so the WEAKER of the two regressions is still obvious: at 800k characters the
   * healthy rule takes about 30ms, the colon regression 1,986ms and the unbounded scan far worse. A
   * ceiling of 600ms is twenty times the healthy figure and a third of the weaker fault, which is the
   * gap that makes this neither flaky nor decorative. Sized at 400k/2,000 it missed the colon
   * regression entirely, so this number was measured against the fault rather than guessed.
   *
   * Keep the filler well over the 160-character limit on a bracketed aside. Under it the PAIRED rule
   * consumes these dashes instead, the lone-dash path never runs, and the check silently measures
   * nothing.
   */
  const SIZE = 800000;
  const DASHES = 4000;
  const filler = "()".repeat(Math.floor((SIZE / DASHES - 4) / 2));
  assert.ok(filler.length > 160, "filler is short enough that the paired rule eats the test");

  const line = Array.from({ length: DASHES }, () => `${filler} — y`).join(" ");
  const started = process.hrtime.bigint();
  const out = stripEmDashes(line);
  const ms = Number(process.hrtime.bigint() - started) / 1e6;

  assert.ok(!out.includes("—"), "the pathological line kept an em dash");
  assert.ok(
    ms < 600,
    `stripEmDashes took ${ms.toFixed(0)}ms on ${DASHES} dashes in ${SIZE} characters. ` +
      "It runs in about 30ms when linear, so this is a quadratic path, not a slow machine.",
  );
}

console.log(`t_dash: ${CASES.length} cases, ${CASES.length - wouldPass} of them load-bearing. OK`);
