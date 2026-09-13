const { stripEmDashes } = require("./lib.js");
const cases = [
  "The perception of basic emotions is comparable across cultures — a smiling face indicates happiness everywhere.",
  "Our **behaviour** — how we act.",
  "**Arousal** is the state of being activated — physiologically or psychologically — such as an increased heart rate or sweating.",
  "Example: the Japanese emotion **'amae'** — the desire to be dependent and to be taken care of.",
  "people help sick family more readily, but in life-threatening situations rather healthy relatives — because those have a greater chance of passing on the genes.",
  "A notorious case from 1964 in New York — the murder of **Kitty Genovese** — gave an enormous impulse to research.",
  "**Private conformity** — also called **conversion** or **true acceptance**: you not only change your behaviour.",
  "Emotions are short-lived, moods are long-lasting.",
  "**Obedience → Compliance → Conformity → Independence → Assertiveness → Defiance**",
  "the collective performance — although increasing with group size — was considerably less than the sum of the individual efforts",
  "This is known as** engaged followership**: the participant is motivated to shock.",
  "Deindividuation therefore depends on what one loses it into — the group norm.",
];
for (const c of cases) console.log("IN : " + c + "\nOUT: " + stripEmDashes(c) + "\n");
