// Shared transforms: the two mandated edits, and nothing else.
"use strict";

// A dash that introduces a subordinate clause or an appositive phrase becomes a
// comma; one that introduces a definition or an explanation becomes a colon.
const COMMA_AFTER = new RegExp(
  "^(?:because|although|though|while|whereas|since|so|as|and|but|or|which|who|that|if|when|unless|also|plus|yet|for)\\b",
  "i",
);

// --- 1. remove em dashes -------------------------------------------------
// Paired dashes bracketing a phrase inside one sentence become parentheses;
// a single dash becomes a comma or a colon. Words are never changed.
function stripEmDashes(s) {
  if (!s.includes("—")) return s;
  const sentences = s.split(/(?<=[.!?])\s+/);
  const done = sentences.map((sentence) => {
    let t = sentence;
    // paired -> parentheses, but never across an emphasis marker: bracketing half
    // of a bold span would move the marker and mangle the sentence.
    t = t.replace(/\s—\s([^—]{1,160}?)\s—\s/g, (m, inner) =>
      (inner.match(/\*\*/g) || []).length % 2 === 0 ? " (" + inner + ") " : m,
    );
    if (!t.includes("—")) return t;
    const hasColon = /:/.test(t.replace(/—/g, ""));
    t = t.replace(/\s*—\s*/g, (m, off) => {
      const after = t.slice(off + m.length).replace(/^\*+/, "");
      const prevChar = t.slice(0, off).trimEnd().slice(-1);
      if (/[,;:]/.test(prevChar)) return " ";
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

module.exports = { stripEmDashes, stripHeadingNumber, tidy };
