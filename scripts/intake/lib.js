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
    // Dutch
    "omdat|hoewel|terwijl|want|maar|zodat|doordat|aangezien|waardoor|waarbij|waarvan|zoals|wat|die|dat|als|wanneer|tenzij|ook|en|of" +
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
 * The index of the bracket that is still open at `off`, or -1 when the position is not inside one.
 * Walks back over closed pairs so a bracket earlier in the line that has already closed is not mistaken
 * for the enclosing one.
 *
 * THE SCAN IS BOUNDED, AND THE BOUND IS THE POINT. Unbounded, this is quadratic in a line's dashes, and
 * a line is somebody else's document: 4,000 dashes separated by balanced bracket pairs took 10.9
 * seconds, which is an intake that hangs on a file an author emailed. A bracketed aside is a phrase, so
 * anything further back than this is not the aside this dash sits in, and giving up returns the answer
 * the rule had before brackets were considered at all. Cheap, and safe in the direction that matters.
 */
const SCOPE_LIMIT = 400;

function openBracketBefore(s, off) {
  let depth = 0;
  const stop = Math.max(0, off - SCOPE_LIMIT);
  for (let i = off - 1; i >= stop; i--) {
    if (s[i] === ")") depth++;
    else if (s[i] === "(") {
      if (depth === 0) return i;
      depth--;
    }
  }
  return -1;
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
  const sentences = s.split(/(?<=[.!?])\s+/);
  const done = sentences.map((sentence) => {
    let t = sentence;
    // paired -> parentheses, but never across an emphasis marker: bracketing half
    // of a bold span would move the marker and mangle the sentence.
    //
    // THE CLOSING DASH IS SOMETIMES DOING TWO JOBS. In a list it ends the aside AND separates the item
    // from the next one, so bracketing alone leaves them welded: "DFAB = $(I-1)(J-1)$ — het product,
    // niet de som — DFE = ..." became "(het product, niet de som) DFE = ..." with nothing joining them.
    // What follows tells the two apart. Prose resuming the same clause continues in lower case ("gave
    // an enormous impulse", "en dat is"); a new item starts with a capital, a digit or a formula
    // ("DFE ="), and that one needs the comma the dash was providing.
    t = t.replace(/\s—\s([^—]{1,160}?)\s—\s/g, (m, inner, off, str) => {
      if ((inner.match(/\*\*/g) || []).length % 2 !== 0) return m;
      const after = str.slice(off + m.length).replace(/^\*+/, "");
      return " (" + inner + ")" + (/^[A-Z0-9$\\]/.test(after) ? ", " : " ");
    });
    if (!t.includes("—")) return t;
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
      const open = openBracketBefore(t, off);
      const hasColon = open === -1 ? sentenceHasColon : /:/.test(t.slice(open, off).replace(/—/g, ""));
      return hasColon || COMMA_AFTER.test(after) ? ", " : ": ";
    });
    return t;
  });
  return done
    .join(" ")
    .replace(/\s+([,.;:)])/g, "$1")
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
    .replace(/\s+([,.;:!?])/g, "$1")
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
