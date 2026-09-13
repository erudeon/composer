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
 * IS THIS SPAN MATHS, OR IS IT TWO AMOUNTS WITH A PHRASE BETWEEN THEM?
 *
 * Real inline maths carries a signal: a command, a script, a group, or symbol density. Running prose
 * carries spaces and words.
 */
function looksLikeMaths(span) {
  // Maths says something. A span with no letter and no digit is punctuation between two currency
  // signs: a lone backslash, a comma, a dash. Eleven of these came out of one summary about money.
  if (!/[A-Za-z0-9]/.test(span)) return false;
  /*
   * NOTHING ENDS ON A DANGLING OPERATOR. `x =` is not an equation anybody wrote; it is the left half of
   * a sentence that happens to sit between two currency signs. Every spelling of every binary operator
   * belongs in this class, typographic ones included: a document written in Word is full of U+2212 and
   * U+00D7 where a keyboard would have given `-` and `*`.
   */
  if (/[-+*/=<>~–—−±×÷]\s*$/.test(span)) return false;
  if (/[\\^_{}]/.test(span)) return true;
  return span.trim().split(/\s+/).length <= 3;
}

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
const DISPLAY = /\$\$([\s\S]+?)\$\$/g;
const INLINE =
  /(^|[^\\$])\$(?![\s$])((?:\\\$|[^$\n]){0,398}?(?:\\\$|[^$\s\\]))\$/g;

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
    if (!looksLikeMaths(m[2])) continue;
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

module.exports = { mathsSpans, looksLikeMaths, withoutCode };
