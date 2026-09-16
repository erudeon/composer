// Shared transforms: the two mandated edits, and nothing else.
"use strict";

// A dash that introduces a subordinate clause or an appositive phrase becomes a
// comma; one that introduces a definition or an explanation becomes a colon.
//
// BOTH LANGUAGES THIS PIPELINE PUBLISHES IN. The list was English-only, so every Dutch course took a
// colon where a comma belonged: "beter — omdat ..." is "better, because ...", never "better: because".
// It read correct on the live Dutch courses only by accident, because those sentences happened to carry
// an earlier colon, which reaches the same answer down a different branch.
//
// Three of the Dutch words are also English ones: "want", "of" and "die". The cost of that overlap is a
// comma where an English sentence would have taken a colon, in constructions that are rare and read
// acceptably either way ("the sum, of all three groups"). The cost of leaving them out is every Dutch
// "want" (because) and "of" (whether) getting a colon, which is wrong every time. Kept.
const COMMA_AFTER = new RegExp(
  "^(?:" +
    // English
    "because|although|though|while|whereas|since|so|as|and|but|or|which|who|that|if|when|unless|also|plus|yet|for" +
    "|" +
    // Dutch. "dus" is here because English "so" is, and the whole waar- family is here because
    // splitting it gave one family two answers.
    "omdat|hoewel|terwijl|want|maar|dus|zodat|doordat|aangezien|namelijk|bijvoorbeeld|oftewel|ofwel" +
    "|waardoor|waarbij|waarvan|waarin|waarop|waarmee|waaruit|waarover" +
    "|zoals|wat|welke|wie|die|dat|als|wanneer|zodra|indien|mits|tenzij|voordat|nadat|totdat|ook|en|of" +
    ")\\b",
  "i",
);

/*
 * A DASH CAN BE A VALUE RATHER THAN PUNCTUATION, and then no punctuation is the right answer for it.
 * A table cell holding one means "not applicable", so the ordinary rule turns a totals row into
 * `["Totaal", "0,0", ":", ":", "13,091"]`, and the paired rule is worse: two adjacent marker cells look
 * like a matched pair to it, so `| — | — |` brackets the pipe between them and emits `(|)`.
 *
 * An en dash is what a marker cell should hold. It is the conventional one, it is not the banned
 * character, and it cannot be read as punctuation joining two clauses.
 *
 * The cell pattern uses a LOOKAHEAD for the closing pipe so it does not consume it. Consuming it makes
 * adjacent marker cells overlap, and the second of every pair goes unmatched.
 */
function markerDashes(s) {
  return s
    .replace(/^(\s*)—(\s*)$/, "$1–$2") // the whole string is the marker
    .replace(/(\|\s*)—(?=\s*\|)/g, "$1–"); // a table cell holding only the marker
}

/*
 * EVERYTHING THE DASH RULES NEED TO KNOW ABOUT A POSITION, MEASURED IN ONE PASS.
 *
 * Both rules want context that is expensive to ask for one dash at a time. Asking per dash is quadratic
 * in a line's dashes, and a line is somebody else's document: a backward scan for the enclosing bracket
 * took 10.9 seconds on 4,000 dashes, and recomputing a sentence's colon test inside the replacer took
 * 1,986ms where the whole rule takes 30ms. Neither changed a character of output, so neither was
 * visible as anything but a hang. Two passes over the sentence, and a lookup per dash, is linear.
 *
 * Bounding those scans instead was the first attempt, and it was the wrong shape: a limit silently
 * changes the ANSWER either side of a boundary nothing tests. This is exact and has no constant in it.
 *
 * For each dash it records:
 *
 *   open/close  the innermost bracket enclosing it, or -1. Only a bracket that actually CLOSES counts.
 *               An unmatched `(` is ordinary in somebody's file (a half-open interval `(0,1]` is one)
 *               and treating it as an aside hands the dash the wrong colon test.
 *   balanced    whether every emphasis, code and maths delimiter before it is closed. A pair of dashes
 *               may only become brackets when BOTH ends sit outside every span, or bracketing moves a
 *               delimiter and welds the span across the parenthesis. `$SS_A — df_A$ ... $SS_E — df_E$`
 *               became `$SS_A (df_A$ ... ) df_E$` when only bold was counted, which is live corruption
 *               in a statistics course. Counting `$` parity inside the phrase does not catch that one:
 *               the two `$` there close one span and open the next.
 */
function scanSentence(t) {
  const closeOf = new Map();
  const pending = [];
  for (let i = 0; i < t.length; i++) {
    if (t[i] === "(") pending.push(i);
    else if (t[i] === ")" && pending.length) closeOf.set(pending.pop(), i);
  }

  const at = new Map();
  const open = [];
  let dollar = 0;
  let tick = 0;
  let star = 0;
  let bold = 0;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (c === "(") {
      if (closeOf.has(i)) open.push(i);
    } else if (c === ")") {
      if (open.length && closeOf.get(open[open.length - 1]) === i) open.pop();
    } else if (c === "$") dollar++;
    else if (c === "`") tick++;
    else if (c === "*") {
      // `**` is one bold marker, `*` one italic, and `***` is one of each.
      if (t[i + 1] === "*") {
        bold++;
        i++;
      } else star++;
    } else if (c === "—") {
      const o = open.length ? open[open.length - 1] : -1;
      at.set(i, {
        open: o,
        close: o === -1 ? -1 : closeOf.get(o),
        balanced: dollar % 2 === 0 && tick % 2 === 0 && star % 2 === 0 && bold % 2 === 0,
      });
    }
  }
  return at;
}

/*
 * Closing up a space before punctuation, EXCEPT before a leading decimal point.
 *
 * "p < .05" is how APA writes a p-value and it is everywhere in a statistics course; collapsing that
 * space gives "p <.05", which changes what the author wrote rather than how it is spaced. A full stop
 * followed by a digit is a number, not the end of a sentence.
 */
function keepDecimal(match, punct, off, str) {
  return punct === "." && /[0-9]/.test(str[off + match.length] || "") ? match : punct;
}

// --- 1. remove em dashes -------------------------------------------------
// Paired dashes bracketing a phrase inside one sentence become parentheses;
// a single dash becomes a comma or a colon. Words are never changed.
function stripEmDashes(s) {
  if (!s.includes("—")) return s;
  // A marker is not punctuation, so it is settled before anything splits this into sentences: a table
  // row is not one, and the rules below would read its cells as clauses.
  s = markerDashes(s);
  if (!s.includes("—")) return s;
  /*
   * SENTENCE BY SENTENCE, because a pair of dashes is only a pair inside one sentence. Without this
   * split, "Eerst dit — dan dat. Daarna — nog iets anders" brackets from the first sentence into the
   * second and emits "Eerst dit (dan dat. Daarna) nog iets anders".
   */
  const sentences = s.split(/(?<=[.!?])\s+/);
  const done = sentences.map((sentence) => {
    let t = sentence;
    let marks = scanSentence(t);
    // paired -> parentheses, but never across a span of any kind: bracketing half of a bold, italic,
    // code or maths span moves its delimiter and welds the span across the parenthesis.
    //
    // THE CLOSING DASH IS SOMETIMES DOING TWO JOBS. In a list it ends the aside AND separates the item
    // from the next one, so bracketing alone leaves them welded: "DFAB = $(I-1)(J-1)$ — het product,
    // niet de som — DFE = ..." became "(het product, niet de som) DFE = ..." with nothing joining them.
    // What follows tells the two apart. Prose resuming the same clause continues in lower case ("gave
    // an enormous impulse", "en dat is"); a new item starts with a capital, a digit or a formula
    // ("DFE ="), and that one needs the comma the dash was providing.
    t = t.replace(/\s—\s([^—]{1,160}?)\s—\s/g, (m, inner, off, str) => {
      const opener = marks.get(off + m.indexOf("—"));
      const closer = marks.get(off + m.lastIndexOf("—"));
      if (!opener?.balanced || !closer?.balanced) return m;
      const after = str.slice(off + m.length).replace(/^\*+/, "");
      return " (" + inner + ")" + (/^[A-Z0-9$\\]/.test(after) ? ", " : " ");
    });
    if (!t.includes("—")) return t;
    // The pass above rewrote `t`, so every offset in the old scan has moved. Measure the new one.
    marks = scanSentence(t);
    // Computed once for the sentence, never per dash: this copies the line, and doing it inside the
    // replacer below is quadratic in the line's dashes.
    const sentenceHasColon = /:/.test(t.replace(/—/g, ""));
    t = t.replace(/\s*—\s*/g, (m, off) => {
      const after = t.slice(off + m.length).replace(/^\*+/, "");
      const prevChar = t.slice(0, off).trimEnd().slice(-1);
      if (/[,;:]/.test(prevChar)) return " ";
      /*
       * A COLON ONLY COLLIDES WITH ONE IN THE SAME BREATH. The colon branch is suppressed when the
       * sentence already carries a colon, so the reader does not meet two. A colon OUTSIDE a bracketed
       * aside does not collide with one inside it, so a dash inside a bracket asks only about the
       * bracket. Without this, "Example: education level (vmbo, havo, vwo — the Dutch tracks)" took a
       * comma from the "Example:" far to its left, and the gloss then read as a fourth Dutch track.
       *
       * Only the text from the bracket to the dash is examined, which SCOPE_LIMIT already caps.
       */
      const mark = marks.get(off + m.indexOf("—"));
      const inBracket = mark && mark.open !== -1;
      const hasColon = inBracket
        ? /:/.test(t.slice(mark.open, mark.close + 1).replace(/—/g, ""))
        : sentenceHasColon;
      return hasColon || COMMA_AFTER.test(after) ? ", " : ": ";
    });
    return t;
  });
  return done
    .join(" ")
    .replace(/\s+([,.;:)])/g, keepDecimal)
    .replace(/([(])\s+/g, "$1")
    .replace(/,\s*,/g, ",")
    .replace(/:\s*:/g, ":")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// --- 2. strip section numbering from a heading ---------------------------
function stripHeadingNumber(h) {
  return h.replace(/^\s*\d+(?:\.\d+)*\.?\s+(?=\S)/, "").trim();
}

// The source puts whitespace inside its emphasis spans ("**behaviour **is"), which
// markdown will not render. Walk the markers and move that whitespace outside the
// span. Marker-aware, so it can never match across a span boundary.
function fixEmphasis(s) {
  const tok = s.split(/(\*{1,3})/).filter((x) => x !== "");
  const out = [];
  const open = []; // stack of indices in `out` holding openers
  for (const t of tok) {
    if (/^\*{1,3}$/.test(t)) {
      const top = open[open.length - 1];
      if (top !== undefined && out[top] === t) {
        // this marker closes the span
        const prev = out[out.length - 1];
        if (typeof prev === "string" && /\s$/.test(prev) && !/^\s+$/.test(prev)) {
          const m = prev.match(/\s+$/)[0];
          out[out.length - 1] = prev.slice(0, -m.length);
          out.push(t, m);
        } else out.push(t);
        open.pop();
      } else {
        open.push(out.length);
        out.push(t);
      }
      continue;
    }
    // text right after an opener must not start with whitespace
    const justOpened = open.length && open[open.length - 1] === out.length - 1;
    if (justOpened && /^\s+/.test(t) && t.trim() !== "") {
      const m = t.match(/^\s+/)[0];
      const marker = out.pop();
      out.push(m, marker, t.slice(m.length));
      open[open.length - 1] = out.length - 2; // the opener moved; keep the stack pointing at it
    } else out.push(t);
  }
  let r = out.join("");
  r = r.replace(/\*{2,3}(\s*)\*{2,3}/g, "$1"); // an emphasis span with nothing in it
  return r;
}

// tidy stray emphasis spacing left by the source's own formatting
function tidy(s) {
  return fixEmphasis(s)
    .replace(/\s+([,.;:!?])/g, keepDecimal)
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * THE TEXT OF AN XML DOCUMENT, FOR COUNTING. Not a sanitiser and never HTML: the callers census a
 * `.docx`'s `document.xml` for words, currency signs and formula-looking strings.
 *
 * It loops to a fixpoint because one pass over a MALFORMED document leaves tags behind. `<w:t a="<b>">`
 * is one match to a single pass, which consumes to the FIRST `>` and leaves `">` as text; worse, a
 * truncated or hand-edited part can leave a whole `<script` sitting in what the caller believes is
 * plain text. The loop costs nothing on a well-formed file, where it runs twice and stops.
 */
function stripTags(xml) {
  let out = xml;
  for (;;) {
    const next = out.replace(/<[^>]*>/g, "");
    if (next === out) return out;
    out = next;
  }
}

module.exports = { stripEmDashes, stripHeadingNumber, tidy, stripTags };
