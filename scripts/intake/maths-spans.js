/**
 * WHERE THE MATHS IS IN A PIECE OF TEXT. ONE ANSWER, FOR EVERY TOOL THAT ASKS.
 *
 * Two scripts need this and they used to answer it separately. `katex-check.js` scanned for `$...$` to
 * validate; `normalise.js` scanned for `$...$` to lift the maths out before it rewrote prose. The second
 * copy never got the first copy's fixes, so a span the checker correctly ignored was still protected
 * from cleanup: a page footer sitting between two currency signs survived normalisation, silently.
 *
 * ── PANDOC'S RULE IS THE RULE ────────────────────────────────────────────────────────────────────────
 *
 * An inline `$` opens maths only when the NEXT character is not a space, and closes it only when the
 * PREVIOUS character is not a space. That is Pandoc's rule, it is what `docx.js` writes to (which is why
 * it never pads the latex), and it is what the reader's own serializer reads.
 *
 * It is also not a heuristic, which matters, because the heuristic that stood in for it kept failing on
 * real documents. An accounting summary writes `$60,000 – $40,000`, and the span between those two
 * dollar signs is `60,000 – `: two digits and a dash, which looked enough like maths to pass a
 * word-count test and then failed KaTeX on the en dash. Four of the five refusals across 134 real
 * documents were that one shape. Under Pandoc's rule the second `$` is preceded by a space, so it is not
 * a closing delimiter and there was never an equation there to refuse.
 *
 * ── WHAT IS STILL A JUDGEMENT ────────────────────────────────────────────────────────────────────────
 *
 * `looksLikeMaths` stays as a second filter, deliberately biased towards silence. A span skipped here is
 * still validated at the write path, where a genuine refusal names the block it sits in. A span reported
 * here wrongly is an operator reading a page of false alarms, which is how a check stops being read.
 */
"use strict";

/**
 * A `$` INSIDE CODE IS NOT A DELIMITER. R writes `announcements$AR_0`, shell writes `$PATH`, and a
 * statistics or programming summary is full of both. Blanked rather than removed, so every byte offset
 * after it is unchanged and a reported span still points where it really is.
 */
function withoutCode(text) {
  return text
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/\$/g, " "))
    .replace(/`[^`\n]*`/g, (span) => span.replace(/\$/g, " "));
}

/**
 * THERE IS NO HEURISTIC HERE ANY MORE, AND REMOVING IT WAS A CORRECTNESS FIX.
 *
 * This file used to carry `looksLikeMaths`, a filter asking whether a span "looked like" an equation:
 * few words, or a command, or a brace. It existed because the delimiter rule was loose, and a stray
 * currency sign in prose could pair with the next one and swallow half a chapter.
 *
 * Once the real rule was in place the filter had nothing left to catch, and it never stopped
 * REMOVING things. Measured over 134 real summaries: 11,955 spans satisfy the write path's own rule,
 * and the heuristic dropped 725 of them. Every one was an equation. `TC = FC + vQ`, `y = mx + c`,
 * `E = C + I + G + X - M`: ordinary economics, too many words to look like maths to a word count.
 *
 * Those 725 were never validated. The checker exists to meet a refusal here rather than inside an
 * apply, and for each of them it was silently doing the opposite.
 *
 * So the rule is now the write path's rule and nothing else. A checker that disagrees with the thing
 * it is checking for is not a safety net, it is a second opinion nobody asked for.
 */

/*
 * Display maths is a doubled dollar and may cross lines. Inline maths is a single one and may NOT: one
 * stray dollar sign in prose otherwise pairs with the next one anywhere in the document, and everything
 * between becomes one span. On a real accounting summary that made a single 5,000-character "equation"
 * covering half a chapter.
 *
 * The inline pattern reads, left to right: a boundary that is not an escaping backslash, the opening
 * dollar, a first character that is NOT a space, any run that is not a dollar or a newline, a last unit
 * that is not a space, and the closing dollar.
 *
 * THE LAST UNIT MAY NOT BE A LONE BACKSLASH, and getting that wrong cost a run over the whole corpus. An
 * escaped `\$` is a dollar sign the equation is ABOUT (`= \$1,200`), not the end of it. Written as a
 * plain "not a space", the backslash of `\$` satisfied it and the dollar that followed closed the span,
 * so every amount inside an equation truncated it to `... \times \` and KaTeX refused the stump. On
 * documents about money, which is where `\$` lives, that turned 5 refusals across the corpus into 24.
 */
/*
 * AND A SPAN MAY NOT BE FOLLOWED BY A DIGIT. `$x$2` is not maths on the write path, which takes it as
 * text, and it is one of the three shapes the reader names as not surviving a round trip. A checker
 * that disagrees with the write path about where the maths IS is worse than no checker: it validates
 * something that will never be rendered as maths, and stays silent about the one that will.
 *
 * Read from `content_guide` `maths` rather than inferred, so it is the same rule and not a guess at it.
 */
const DISPLAY = /\$\$([\s\S]+?)\$\$/g;
const INLINE =
  /(^|[^\\$])\$(?![\s$])((?:\\\$|[^$\n]){0,398}?(?:\\\$|[^$\s\\]))\$(?!\d)/g;

/**
 * Every maths span in `text`, in document order, each with the offsets it occupies in the ORIGINAL
 * string so a caller can lift it out and put it back.
 */
function mathsSpans(text) {
  const scan = withoutCode(text);
  const found = [];
  for (const m of scan.matchAll(DISPLAY)) {
    found.push({
      display: true,
      tex: m[1],
      start: m.index,
      end: m.index + m[0].length,
    });
  }
  // Inline scanning must not see inside a display span, or `$$a$$ ... $$b$$` pairs the inner dollars.
  // Blanked, never removed, so the offsets still line up with the original text.
  let inlineOnly = scan;
  for (const d of found) {
    inlineOnly =
      inlineOnly.slice(0, d.start) +
      " ".repeat(d.end - d.start) +
      inlineOnly.slice(d.end);
  }
  for (const m of inlineOnly.matchAll(INLINE)) {
    const start = m.index + m[1].length;
    found.push({
      display: false,
      tex: m[2],
      start,
      end: m.index + m[0].length,
    });
  }
  return found.sort((a, b) => a.start - b.start);
}

/**
 * SPANS THAT PARSE NOW AND COME BACK DIFFERENT LATER.
 *
 * KaTeX accepts all of these, so `katex-check` passes them and the write path stores them. What the
 * reader warns about is the ROUND TRIP: read the lecture back and the expression is not the one that
 * was sent, so a repair run sees a change nobody made and rewrites a lecture it did not need to.
 *
 * The three shapes come from `content_guide` `maths`. Two of them cannot occur here, because the
 * scanner above refuses a span that opens or closes on a space and one followed by a digit. The third
 * can: an equation about money carries an escaped dollar, and Word writes those constantly.
 */
function fragileSpans(text) {
  return mathsSpans(text)
    .filter((span) => /\\\$/.test(span.tex) || /\n/.test(span.tex))
    .map((span) => ({
      ...span,
      why: /\\\$/.test(span.tex)
        ? "holds a dollar sign, which does not survive being read back"
        : "holds a newline, which does not survive being read back",
    }));
}

module.exports = { mathsSpans, withoutCode, fragileSpans };
