const { tidy } = require("./lib.js");
const cases = [
  "the **Ringelmann effect** , also known as ***Social Loafing*** .",
  "Our **behaviour **— how we act.",
  "so that the expectation is confirmed.** Limitations: **",
  "**Emotions **are experiences that occur when we regard our situation.",
  "known as** *private conformity*** (or** *conversion***).",
  "This is known as** engaged followership**: the participant is motivated.",
  "the** clarity **and the** severity **of the emergency",
  "both the** overbenefited **and the** underbenefited **partner.",
  "***Arousal*** is a state of physiological excitation.",
  "no change **here** at all",
];
for (const c of cases) console.log("IN : " + c + "\nOUT: " + tidy(c) + "\n");
