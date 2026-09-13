const { stripEmDashes } = require("./lib.js");
const cases = [
  'Helping sometimes involves physical danger or effort. **Darley & Batson (1973) — the Good Samaritan experiment**: theology students had to give a lecture quickly — about the "Good Samaritan". On the way they saw a man groaning in an alley.',
  "**Social Impact Theory (Latané)**: strength × immediacy × number — immediacy can be partly replaced by **online immediacy**. **French & Raven — six power bases**: reward, coercive, legitimate.",
  "A notorious case from 1964 in New York — the murder of **Kitty Genovese** — gave an enormous impulse to research.",
];
for (const c of cases) console.log("OUT: " + stripEmDashes(c) + "\n");
