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
   * comma. This is the line between the two: the scan pairs brackets rather than taking the nearest
   * one it finds.
   */
  [
    "Example: the tracks (vmbo, havo, vwo) — the Dutch secondary-school system.",
    "Example: the tracks (vmbo, havo, vwo), the Dutch secondary-school system.",
  ],

  /*
   * AN UNMATCHED BRACKET IS NOT AN ASIDE. A half-open interval is ordinary in a statistics course, and
   * a bracket an author opens and never closes is ordinary in anybody's file. Treating either as an
   * enclosing aside hides the sentence's real colon and produces the exact double colon the comma
   * branch exists to prevent.
   */
  [
    "Voorbeeld: het interval (0,1] — de kans dat iets gebeurt.",
    "Voorbeeld: het interval (0,1], de kans dat iets gebeurt.",
  ],

  /*
   * A COLON LATER IN THE SAME BRACKET COUNTS. Looking only from the bracket to the dash missed it and
   * emitted two colons inside one pair of brackets.
   */
  [
    "De tracks (vmbo, havo — de indeling: van laag naar hoog).",
    "De tracks (vmbo, havo, de indeling: van laag naar hoog).",
  ],

  /*
   * THE WORD THAT DECIDES IS THE ONE A READER SEES, so emphasis markers are stepped over before the
   * connective is matched. Without that strip, a bolded connective reaches neither branch and the
   * sentence takes a colon. `— **omdat**` and `— **Bold**` are both common shapes in these summaries.
   */
  ["Dit is belangrijk — **omdat** emoties schadelijk kunnen zijn.", "Dit is belangrijk, **omdat** emoties schadelijk kunnen zijn."],

  /*
   * A DASH THAT FOLLOWS PUNCTUATION ADDS NONE OF ITS OWN. Word leaves these behind constantly when an
   * author reflows a list. Without the guard the dash contributes a second mark and the reader meets
   * "opties: : de eerste" or "altijd, , en dat".
   */
  ["Er zijn drie opties: — de eerste, de tweede en de derde.", "Er zijn drie opties: de eerste, de tweede en de derde."],
  ["Dit geldt altijd, — en dat is de regel.", "Dit geldt altijd, en dat is de regel."],

  /*
   * THE OTHER SIDE OF THAT: punctuation on the FAR side of the dash, which the guard above does not
   * see because it only looks backwards. The replacement lands next to a mark that is already there,
   * and the final cleanup closes the pair up. Both of these were reachable and nothing pinned them, so
   * deleting either cleanup left every suite green.
   */
  ["Deel een: de tekst — , en deel twee.", "Deel een: de tekst, en deel twee."],
  ["Titel: — : ondertitel", "Titel: ondertitel"],

  // Word's own spacing, which the same cleanup closes up.
  ["De uitkomst — significant , zoals verwacht .", "De uitkomst: significant, zoals verwacht."],

  /*
   * THE CONNECTIVE MUST BE A WHOLE WORD. "ofschoon" begins with "of", which is on the list, so without
   * the word boundary every word merely STARTING with a connective takes the comma. Dutch has plenty:
   * ofschoon, datgene, alsof, dusdanig.
   */
  ["Dit gebeurt — ofschoon het regent.", "Dit gebeurt: ofschoon het regent."],

  // One of the waar- family, so removing them is not silent.
  ["Dit is het punt — waarin de fout zit.", "Dit is het punt, waarin de fout zit."],

  /*
   * DOUBLED SPACING AROUND A PAIR. Word leaves two spaces where an author deleted a word, and the
   * bracket must still close up against its contents rather than reading "( b)".
   */
  ["a —  b —  c", "a (b) c"],

  /*
   * AN ASIDE HAS A LENGTH LIMIT, and past it the two dashes are not a pair at all. Bracketing a hundred
   * words swallows most of the sentence into a parenthesis, so both dashes fall back to the lone rule.
   * The limit is 160 characters; this phrase is 200.
   */
  [
    `Het begin — ${"zeer ".repeat(40)}einde — daarna nog iets.`,
    `Het begin: ${"zeer ".repeat(40)}einde: daarna nog iets.`,
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
 * A line is somebody else's document and nothing bounds its length. Three versions of this rule have
 * already been quadratic: an unbounded backward scan for the enclosing bracket (10.9 seconds on 4,000
 * dashes), computing the sentence's colon test inside the per-dash replacer, and slicing the remainder
 * of the line per dash. None of them changed a single character of output, so no equality above would
 * ever have noticed. Only a measurement can see this class of fault.
 *
 * THE SHAPE IS ASSERTED, NOT THE CLOCK. A wall-clock ceiling has to be sized against the machine it
 * runs on: the first version here was 600ms, which on this machine sat only 1.5x below the weaker of
 * the two faults, so a computer half again as fast would have let it through silently. Doubling the
 * dash count at a FIXED total length is hardware-independent. Linear work stays flat; anything
 * quadratic in the dashes doubles.
 */
{
  /*
   * Keep the filler well over the 160-character limit on a bracketed aside. Under it the PAIRED rule
   * consumes these dashes instead, the lone-dash path never runs, and this measures nothing.
   */
  const SIZE = 800000;
  const build = (dashes) => {
    const filler = "()".repeat(Math.floor((SIZE / dashes - 4) / 2));
    assert.ok(filler.length > 160, `filler for ${dashes} dashes is short enough that the paired rule eats the test`);
    return Array.from({ length: dashes }, () => `${filler} — y`).join(" ");
  };

  // Median of three: one slow run on a busy machine should not decide this.
  const time = (line) => {
    const runs = [0, 0, 0].map(() => {
      const started = process.hrtime.bigint();
      const out = stripEmDashes(line);
      assert.ok(!out.includes("—"), "the pathological line kept an em dash");
      return Number(process.hrtime.bigint() - started) / 1e6;
    });
    return runs.sort((a, b) => a - b)[1];
  };

  const single = time(build(2000));
  const double = time(build(4000));
  const ratio = double / Math.max(single, 0.1);

  assert.ok(
    ratio < 2.5,
    `doubling the dashes in the same ${SIZE} characters multiplied the work by ${ratio.toFixed(1)} ` +
      `(${single.toFixed(0)}ms then ${double.toFixed(0)}ms). Linear work stays flat, so this is a ` +
      "quadratic path in the number of dashes.",
  );
}

console.log(`t_dash: ${CASES.length} cases, ${CASES.length - wouldPass} of them load-bearing. OK`);
