/**
 * A MULTI-WORD NAME IN MATHS LOSES ITS SPACES, SILENTLY.
 *
 * Maths mode ignores ordinary spaces, so `$Share Capital$` renders as "ShareCapital" and
 * `$Depreciation Expense$` as "DepreciationExpense". Nothing refuses it: KaTeX parses it, the write
 * path stores it, and the equation is simply wrong on the page in a way that reads as a typo the
 * author made. On the first accounting course FORTY-SEVEN of sixty-four equations carried one, across
 * every lecture, and the only reason it was caught is that somebody read one.
 *
 * Word is what produces this. An author types "Share Capital" into an equation editor, Word records
 * two adjacent maths runs, and the space between them is presentational. Where Word happened to mark a
 * word as text the converter writes `\text{...}` and the space survives, which is why the SAME
 * equation can carry one welded name and one intact phrase.
 *
 * The repair is the space the author typed: `\ `, which is a real space in maths mode and leaves the
 * identifiers styled exactly as they were. `\text{}` would also work and would un-italicise the name,
 * which is a change to how the author's maths looks rather than a repair of it.
 */

/** Inside one of these, a space is already a real space and must not be touched. */
const TEXTUAL = /\\(?:text|textrm|textit|textbf|mathrm|mathit|mbox|operatorname)\s*\{/g;

/** The spans of a maths expression that are inside a textual group, as [start, end) pairs. */
function textualRanges(tex) {
  const ranges = [];
  for (const m of tex.matchAll(TEXTUAL)) {
    let depth = 1;
    let i = m.index + m[0].length;
    for (; i < tex.length && depth > 0; i += 1) {
      if (tex[i] === "\\") { i += 1; continue; }
      if (tex[i] === "{") depth += 1;
      else if (tex[i] === "}") depth -= 1;
    }
    ranges.push([m.index, i]);
  }
  return ranges;
}

const isLetter = (c) => c !== undefined && /[A-Za-z]/.test(c);

/**
 * Restore the spaces inside one expression. Returns { tex, fixed } where `fixed` counts the spaces
 * that were welded.
 *
 * A space is welded when a letter sits on each side of it AND it is not terminating a control word:
 * the space in `\Delta Share` belongs to `\Delta` and removing it would change what is drawn.
 */
function weldedSpaces(tex) {
  const skip = textualRanges(tex);
  const inSkip = (i) => skip.some(([a, b]) => i >= a && i < b);
  let out = "";
  let fixed = 0;
  for (let i = 0; i < tex.length; i += 1) {
    const c = tex[i];
    if (c !== " " || inSkip(i) || !isLetter(tex[i - 1]) || !isLetter(tex[i + 1])) {
      out += c;
      continue;
    }
    let j = i - 1;
    while (j >= 0 && isLetter(tex[j])) j -= 1;
    if (tex[j] === "\\") { out += c; continue; } // the space ends a command, and it is load-bearing
    out += "\\ ";
    fixed += 1;
  }
  return { tex: out, fixed };
}

module.exports = { weldedSpaces };
