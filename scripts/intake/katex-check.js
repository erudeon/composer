/**
 * EVERY EQUATION IN AN EXTRACT, THROUGH THE READER'S OWN KaTeX OPTIONS.
 *
 * `docx.js` writes `$…$` and `$$…$$` into the extract. The reader's write gate validates each with
 * `strict: true, trust: false, throwOnError: true, output: "mathml"` (`apps/web/lib/passos/authoring/math.ts`),
 * and an equation that fails there is refused at import. This runs the same call over the whole file
 * before a manifest exists, so the refusal is met here with the equation in front of you rather than in an
 * apply of a 300 KB course.
 *
 *   node katex-check.js <extract.md>
 *
 * Exit 1 when anything is refused. Requires `katex`, which this plugin declares as its one dependency.
 * WHERE the maths is comes from `maths-spans.js`, which is the one answer every tool here uses.
 */
const fs = require("node:fs");
const { mathsSpans, fragileSpans } = require("./maths-spans.js");
const { weldedSpaces } = require("./maths-spacing.js");

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
  /*
   * THE PATH, NOT THE PHRASE. "Run npm install in the plugin directory" is useless to somebody who has
   * never seen the plugin directory, and a plugin lives under a cache path nobody would guess. This
   * script knows exactly where it is, so it says so, as a command that can be pasted.
   */
  const pluginRoot = require("node:path").resolve(__dirname, "..", "..");
  console.error(
    "The maths checker needs one package installed, and it is not there yet.\n\n" +
      "Run this once, then try again:\n\n" +
      `  cd "${pluginRoot}" && npm install\n\n` +
      "It is worth doing rather than skipping. An equation the reader will not accept is met here,\n" +
      "with the equation in front of you, or inside a whole-course upload later, and those are very\n" +
      "different days.",
  );
  process.exit(2);
}

const OPTIONS = {
  trust: false,
  strict: true,
  throwOnError: true,
  output: "mathml",
};

const file = process.argv[2];
if (!file) {
  console.error("usage: node katex-check.js <extract.md>");
  process.exit(2);
}

const text = fs.readFileSync(file, "utf8");
const eqs = mathsSpans(text);
const refused = [];
for (const e of eqs) {
  try {
    katex.renderToString(e.tex, { ...OPTIONS, displayMode: e.display });
  } catch (err) {
    refused.push([e.tex, err instanceof Error ? err.message : String(err)]);
  }
}
/*
 * A SPAN CAN PARSE AND STILL NOT SURVIVE BEING READ BACK. KaTeX accepts an escaped dollar, so it is
 * stored happily; reading the lecture back gives a different expression, and the next repair run sees a
 * change nobody made. Reported, never refused: the equation is correct, and rewriting somebody's maths
 * to suit a round trip is not this script's call.
 */
const fragile = fragileSpans(text);

/*
 * A MULTI-WORD NAME LOSES ITS SPACES AND NOTHING COMPLAINS. Maths mode ignores ordinary spaces, so
 * `Share Capital` is drawn as "ShareCapital" and `Depreciation Expense` as "DepreciationExpense". It
 * parses, it stores, it renders, and it is wrong on the page in a way that reads as the author's own
 * typo.
 *
 * ASKED OF THE RENDERER, ONE SPACE AT A TIME: delete the space and draw it again. If the drawing is
 * unchanged, that space was never being drawn. Nothing here knows what the repair looks like, which is
 * the point: a detector built out of the repair's own rules goes blind wherever the repair does, and
 * the first version of this check did exactly that. It tested the drawn output for an ASCII space, and
 * KaTeX draws U+00A0, so every multi-word expression came back welded whether it was repaired or not.
 */
const drawn = (tex, display) =>
  katex
    .renderToString(tex, { ...OPTIONS, displayMode: display })
    .replace(/<annotation[\s\S]*?<\/annotation>/g, "")
    .replace(/<[^>]+>/g, "");

const welded = [];
for (const e of eqs) {
  let whole;
  try {
    whole = drawn(e.tex, e.display);
  } catch {
    continue; // already counted as refused, and its message is the one worth reading
  }
  let count = 0;
  for (let i = 1; i < e.tex.length - 1; i += 1) {
    if (e.tex[i] !== " ") continue;
    if (!/[A-Za-z]/.test(e.tex[i - 1]) || !/[A-Za-z]/.test(e.tex[i + 1])) continue;
    const without = e.tex.slice(0, i) + e.tex.slice(i + 1);
    try {
      if (drawn(without, e.display) === whole) count += 1;
    } catch {
      /* removing it broke the expression, so it was load-bearing and is not a weld */
    }
  }
  if (count > 0) welded.push({ ...e, count });
}

console.log(
  `equations=${eqs.length} refused=${refused.length} fragile=${fragile.length} welded=${welded.length}`,
);
/*
 * NAME THE LIKELY CAUSE, because the refusal never does.
 *
 * A long, word-heavy span is almost never an equation somebody wrote wrong. It is a currency sign in
 * prose that has paired with the opening delimiter of a real equation further along the line, and
 * everything between them has been read as maths. KaTeX then refuses it for whatever punctuation it
 * met first, which sends a reader hunting through a sentence for a LaTeX error that is not there.
 *
 * The write path applies the same rule, so this is a real refusal and not an artefact of checking.
 */
const proseLike = (tex) =>
  tex.trim().split(/\s+/).length > 6 && !/[\\^_{}]/.test(tex);

for (const [tex, why] of refused) {
  console.log(`\n  ${JSON.stringify(tex)}\n  ${why}`);
  if (proseLike(tex))
    console.log(
      `  This reads as a sentence, so it is probably a currency sign that has paired with a real\n` +
        `  equation later on the line. Escape the amount as \\$ and the sentence stops being maths.`,
    );
}
if (fragile.length > 0) {
  console.log(
    `\n${fragile.length} equation(s) parse but do not survive a read back:`,
  );
  for (const span of fragile.slice(0, 5))
    console.log(`  ${JSON.stringify(span.tex.slice(0, 60))}\n    ${span.why}`);
}
/*
 * Reported, never refused. The repair exists and is one command, but running it is a Compose decision
 * and this script runs during Convert, where stopping the run would only strand the extract.
 */
if (welded.length > 0) {
  console.log(
    `\n! ${welded.length} equation(s) have a multi-word name whose spaces will not be drawn:`,
  );
  for (const e of welded.slice(0, 8)) {
    const { tex } = weldedSpaces(e.tex);
    console.log(
      `  ${e.tex.slice(0, 80)}\n    ${e.count} space(s) not drawn; repaired it is  ${tex.slice(0, 80)}`,
    );
  }
  if (welded.length > 8) console.log(`  ... and ${welded.length - 8} more`);
  console.log(
    `\n  Repair them all, in place, with:\n` +
      `    node "${require("node:path").resolve(__dirname, "..")}/fix-maths-spacing.mjs" ${file}`,
  );
}

process.exit(refused.length === 0 ? 0 : 1);
