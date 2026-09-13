/**
 * EVERY EQUATION IN AN EXTRACT, THROUGH THE READER'S OWN KaTeX OPTIONS.
 *
 * `docx.js` writes `$…$` and `$$…$$` into the extract. The reader's write gate validates each with
 * `strict: true, trust: false, throwOnError: true, output: "mathml"` (`apps/web/lib/passos/authoring/math.ts`),
 * and an equation that fails there is refused at import. This runs the same call over the whole file
 * before a manifest exists, so the refusal is met here with the equation in front of you rather than in an
 * apply of a 300 KB course.
 *
 *   node katex-check.js <extract.txt>
 *
 * Exit 1 when anything is refused. Requires `katex`, which this plugin declares as its one dependency.
 */
const fs = require("node:fs");

/*
 * Resolved from the plugin's own dependencies. It used to reach two levels up into the platform
 * monorepo's root `node_modules`, a path that does not exist for an operator whose only two possessions
 * are this plugin and an MCP connection. That reach is the whole reason the intake tools moved here.
 */
let katex;
try {
  katex = require("katex");
} catch {
  /*
   * A plugin is installed by cloning, and whether its dependencies are installed with it is not something
   * this script gets to assume. Crashing with a module-resolution stack trace in the middle of an intake
   * tells the operator nothing they can act on, so say the one command that fixes it and stop cleanly.
   */
  console.error(
    "katex is not installed, so the maths cannot be checked before the apply.\n" +
      "Run `npm install` once inside the plugin directory, then run this again.\n" +
      "Do NOT skip this step on a maths course: an equation the reader refuses is met here with the\n" +
      "equation in front of you, or inside an apply of a 300 KB course, and those are not the same day.",
  );
  process.exit(2);
}

const OPTIONS = {
  trust: false,
  strict: true,
  throwOnError: true,
  output: "mathml",
};

/**
 * A `$` INSIDE CODE IS NOT A DELIMITER. R writes `announcements$AR_0`, shell writes `$PATH`, and a
 * statistics or programming summary is full of both. Scanning them as maths pairs the two dollars either
 * side of a code block and hands the operator a refusal naming forty lines of R, at the one moment they
 * are deciding whether their document converted correctly. Blanked rather than removed, so every byte
 * offset after it is unchanged and a reported equation still points where it really is.
 */
function withoutCode(text) {
  return text
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/\$/g, " "))
    .replace(/`[^`\n]*`/g, (span) => span.replace(/\$/g, " "));
}

/**
 * IS THIS SPAN MATHS, OR IS IT TWO PRICES WITH A SENTENCE BETWEEN THEM?
 *
 * A summary about money writes `$100,000 forever. At a 5% discount rate, ... is $2m`, and the two
 * amounts pair into one "equation" that then fails on the per-cent sign. Real inline maths carries a
 * signal: a command, a script, a group, or symbol density. Running prose carries spaces and words.
 *
 * Deliberately conservative in the direction of silence. A span skipped here is still validated at the
 * write path, where a genuine refusal names the block it is in; a span reported here wrongly is an
 * operator reading a page of false alarms, which is how a check stops being read at all.
 */
function looksLikeMaths(span) {
  // Maths says something. A span with no letter and no digit is punctuation between two currency
  // signs: a lone backslash, a comma, a dash. Eleven of these came out of one summary about money.
  if (!/[A-Za-z0-9]/.test(span)) return false;
  if (/[\\^_{}]/.test(span)) return true;
  const words = span.trim().split(/\s+/).length;
  return words <= 3;
}

function equationsIn(raw) {
  const text = withoutCode(raw);
  const out = [];
  for (const m of text.matchAll(/\$\$([\s\S]+?)\$\$/g))
    out.push({ display: true, tex: m[1] });
  const inlineOnly = text.replace(/\$\$[\s\S]+?\$\$/g, " ");
  /*
   * INLINE MATHS DOES NOT CROSS A LINE. One stray dollar sign in prose (a price, a currency in a
   * table) pairs with the next one anywhere in the document, and everything between becomes one
   * "equation". On a real accounting summary that made a single 5,000-character equation covering
   * half a chapter, which then failed on a euro sign inside it: a true refusal for an entirely false
   * reason, which is worse than no check at all because it teaches people to ignore the output.
   */
  // `\$` INSIDE the maths is a dollar sign the equation is about, not the end of it: an amount in a
  // finance summary is written `= \$400`, and closing there truncates the equation to `... =\`.
  for (const m of inlineOnly.matchAll(
    /(^|[^\\])\$((?:\\\$|[^$\n]){1,400}?)\$/g,
  )) {
    // A dollar the source escaped is a literal one, so its opener is not a delimiter.
    if (looksLikeMaths(m[2])) out.push({ display: false, tex: m[2] });
  }
  return out;
}

const file = process.argv[2];
if (!file) {
  console.error("usage: node katex-check.js <extract.txt>");
  process.exit(2);
}
const eqs = equationsIn(fs.readFileSync(file, "utf8"));
const refused = [];
for (const e of eqs) {
  try {
    katex.renderToString(e.tex, { ...OPTIONS, displayMode: e.display });
  } catch (err) {
    refused.push([e.tex, err instanceof Error ? err.message : String(err)]);
  }
}
console.log(`equations=${eqs.length} refused=${refused.length}`);
for (const [tex, why] of refused)
  console.log(`\n  ${JSON.stringify(tex)}\n  ${why}`);
process.exit(refused.length === 0 ? 0 : 1);
