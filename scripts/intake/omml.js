/**
 * WORD'S OWN EQUATIONS (OMML) TO LaTeX.
 *
 * `docx.js` reads `<w:r>` runs. An equation is not made of those: Word stores it as `<m:oMath>` full of
 * `<m:r>` runs with `<m:t>` text, so every formula in a document was skipped and the extractor said
 * nothing about it. Measured on the two accounting sources: 127 equations in the formula sheet and 109
 * in the summary, all of them invisible. A formula sheet whose formulas are all missing still looks
 * like a successful parse, which is why this is worth a module rather than a regex at the call site.
 *
 * ── THE RULE THAT MATTERS ────────────────────────────────────────────────────────────────────────────
 *
 * AN UNKNOWN CONSTRUCT DEGRADES TO ITS TEXT, IT NEVER VANISHES. Every branch below ends by recursing
 * into children, so a matrix, an n-ary product or anything else Word can write comes out as its own
 * symbols in reading order rather than as nothing. Wrong spacing in a rare formula is a thing a person
 * fixes; a formula that silently disappeared is a thing nobody knows to look for.
 *
 * What the two accounting documents actually contain, counted: text runs, 63 fractions, 32 bracket
 * groups and one superscript. The rest is here because it is cheap and because the next document is not
 * this one.
 */

/** XML entities, and the `<m:t>` text is the only place they appear. */
function unesc(s) {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/**
 * Characters that mean something to LaTeX, escaped so a formula about 100% or $ does not break the
 * document it lands in. The backslash goes first or it would escape the escapes.
 */
/**
 * ESCAPED FOR MATH MODE, NOT FOR TEXT MODE. `\\textbackslash`, `\\textasciicircum` and
 * `\\textasciitilde` are text-mode commands, and KaTeX does not define them: an equation carrying one
 * is REFUSED at the write path, which is the right outcome but the wrong reason. Measured on the real
 * Introduction to Mathematics summary, those three were the only refusals in 1,283 equations.
 *
 * The math-mode spellings below render the same characters and are what KaTeX accepts.
 */
function escapeLatex(s) {
  return s
    .replace(/\\/g, "\\backslash ")
    .replace(/([&%$#_{}])/g, "\\$1")
    .replace(/\^/g, "\\wedge ")
    .replace(/~/g, "\\sim ");
}

/**
 * THE OPERATORS WORD WRITES AS CHARACTERS, as the commands LaTeX wants.
 *
 * Word's equation editor emits Unicode: U+2206 INCREMENT for a delta, U+2219 BULLET OPERATOR for a
 * multiplication. KaTeX has NO GLYPH for U+2206 -- it warns `No character metrics` and renders a hole
 * where the symbol should be, which on a formula sheet is worse than an error because it still looks
 * like a formula. The ones that DO have a glyph are mapped anyway, because a command is spaced as the
 * operator it is and a bare character is spaced as a letter.
 *
 * ANYTHING NOT LISTED PASSES THROUGH UNTOUCHED. KaTeX knows most of Unicode maths, and a character it
 * renders correctly needs no entry here -- this table is for the ones it does not.
 *
 * Counted on the accounting formula sheet: 18 multiplications, 4 deltas, 1 pi.
 */
const SYMBOLS = new Map([
  ["\u2206", "\\Delta"], // INCREMENT, which Word uses for a change-in. No KaTeX glyph at all.
  ["\u2219", "\\cdot"], // BULLET OPERATOR
  ["\u00d7", "\\times"],
  ["\u00f7", "\\div"],
  ["\u00b1", "\\pm"],
  ["\u2264", "\\leq"],
  ["\u2265", "\\geq"],
  ["\u2260", "\\neq"],
  ["\u2248", "\\approx"],
  ["\u221e", "\\infty"],
  /*
   * THE EURO IS NOT A SYMBOL KaTeX HAS. Not one spelling of it renders: the command forms are undefined
   * control sequences, and the bare character only warns "No character metrics" and draws an empty box.
   * An accounting summary puts euro amounts INSIDE its formulas, so the choice is between letters that
   * read correctly and a hole where the currency should be.
   *
   * IN MATHS ONLY. Ordinary prose keeps the sign, because this module is never reached outside an
   * equation.
   */
  ["\u20ac", "\\text{EUR}"],
  /* RIGHTWARDS ARROW, the limit's arrow. KaTeX draws the bare character, but as a letter rather than
   * as a relation, so `x→0` sets with no air around the arrow. */
  ["\u2192", "\\to"],
]);

/**
 * CHARACTERS WORD WRITES THAT MEAN NOTHING AND THAT KaTeX REFUSES. A zero-width space is left behind by
 * editing, and U+2061 FUNCTION APPLICATION is what Word inserts between `ln` and its bracket. In strict
 * mode KaTeX raises on both, and the reader's write gate IS strict mode: nine equations of the
 * Mathematics summary were refused for these alone.
 */
const INVISIBLE = /[\u200b\u2061-\u2064]/g;

/** The function names KaTeX has a command for. Anything else is `\operatorname{…}`. */
const KNOWN_FUNCTIONS = new Set([
  "ln",
  "log",
  "sin",
  "cos",
  "tan",
  "exp",
  "min",
  "max",
  "lim",
  "sup",
  "inf",
  "det",
  "dim",
  "arcsin",
  "arccos",
  "arctan",
  "sinh",
  "cosh",
  "tanh",
]);

/** Word stores an accent as its COMBINING character. U+0305 is the one the summary uses, for an overbar. */
/*
 * BOTH SPELLINGS OF EVERY MARK, because Word uses the standalone characters as readily as the combining
 * ones and they are different codepoints. U+203E OVERLINE was missing and U+0304 COMBINING MACRON was
 * present, so a bar written the common way fell through to the fallback below and came out as a hat:
 * x-bar, the sample mean, silently became x-hat, an estimator, on every page of a statistics summary,
 * rendering perfectly the whole time.
 */
const ACCENTS = new Map([
  ["\u0302", "\\hat"],
  ["\u005e", "\\hat"],
  ["\u0303", "\\tilde"],
  ["\u007e", "\\tilde"],
  // FOUR SPELLINGS OF A BAR, all found in real summaries: combining macron, the standalone macron,
  // the overline, and the modifier letter Word writes for x-bar and pi-bar in statistics and macro.
  ["\u0304", "\\bar"],
  ["\u00af", "\\bar"],
  ["\u203e", "\\bar"],
  ["\u02c9", "\\bar"],
  ["\u0305", "\\overline"],
  ["\u0307", "\\dot"],
  ["\u0308", "\\ddot"],
  ["\u030c", "\\check"],
  ["\u0306", "\\breve"],
  ["\u0300", "\\grave"],
  ["\u0301", "\\acute"],
  ["\u20d7", "\\vec"],
  ["\u2192", "\\vec"],
]);

/** Every accent character this file met and could not name, so an unknown one is reported, not guessed. */
const unknownAccents = new Set();

/**
 * The mapped commands, with a trailing space.
 *
 * THE SPACE IS LOAD-BEARING: without it `\Delta` followed by `Equity` is the single unknown command
 * `\DeltaEquity`, which KaTeX refuses outright. `ommlToLatex` collapses runs of whitespace afterwards,
 * so the guard never shows up as a double space.
 *
 * Applied AFTER `escapeLatex`, deliberately: the commands it inserts contain backslashes, and escaping
 * them would turn every one into the literal text `\textbackslash{}Delta`.
 */
function mapSymbols(s) {
  let out = s;
  for (const [ch, command] of SYMBOLS) out = out.split(ch).join(command + " ");
  return out;
}
/** The children of an element's inner XML, as `[tag, innerXml]` pairs, in document order. */
function children(xml) {
  const out = [];
  // Elements are either `<m:tag ...>...</m:tag>` or self-closing `<m:tag .../>`.
  const re = /<(m:[a-zA-Z]+)\b([^>]*?)(\/)?>/g;
  let m;
  while ((m = re.exec(xml))) {
    const [, tag, , selfClosing] = m;
    if (selfClosing) {
      out.push([tag, ""]);
      continue;
    }
    const close = `</${tag}>`;
    // Find the MATCHING close, not the first one: fractions nest inside fractions.
    let depth = 1;
    let at = re.lastIndex;
    const scan = new RegExp(`<${tag}\\b[^>]*?(\\/)?>|${close}`, "g");
    scan.lastIndex = at;
    let hit;
    let end = -1;
    while ((hit = scan.exec(xml))) {
      if (hit[0] === close) {
        depth -= 1;
        if (depth === 0) {
          end = hit.index;
          break;
        }
      } else if (!hit[1]) {
        depth += 1;
      }
    }
    if (end < 0) continue;
    out.push([tag, xml.slice(at, end)]);
    re.lastIndex = end + close.length;
  }
  return out;
}

/** The inner XML of the FIRST child with this tag, or "" when there is none. */
function child(xml, tag) {
  const hit = children(xml).find(([name]) => name === tag);
  return hit === undefined ? "" : hit[1];
}

/** A property attribute such as `<m:begChr m:val="["/>`, or null. */
function propChar(xml, tag) {
  const m = new RegExp(`<${tag}\\b[^>]*m:val="([^"]*)"`).exec(xml);
  return m === null ? null : unesc(m[1]);
}

/**
 * Wrap in braces unless it is a single PLAIN character, so `x^2` does not become `{x}^{2}`.
 *
 * "PLAIN" IS THE WHOLE OF IT, and a bare length check is not enough. Word writes an apostrophe as a
 * superscript -- "Owner's Drawings" arrives as an sSup whose sup is a single quote -- and `x^'` is a
 * parse error, because a prime is not a group. One letter or digit is safe bare; everything else,
 * including an empty string, takes the braces.
 */
function braced(s) {
  return /^[A-Za-z0-9]$/.test(s) ? s : `{${s}}`;
}

const DELIMITERS = {
  "(": ["(", ")"],
  "[": ["[", "]"],
  "{": ["\\{", "\\}"],
  "|": ["|", "|"],
  "": [".", "."],
};

/**
 * EVERY DELIMITER CHARACTER TO ITS LaTeX SPELLING, opening or closing alike.
 *
 * The pair table above is keyed on the OPENING character, so a CLOSING one looked up in it finds
 * nothing and was emitted raw. `\right}` is not valid LaTeX and KaTeX refuses it, which is how
 * `\left\{1,2,...,N\right}` came out of a real statistics summary: the opening brace escaped by the
 * pair, the closing one not.
 */
const DELIM_LATEX = {
  "{": "\\{",
  "}": "\\}",
  "": ".",
  "⟨": "\\langle",
  "⟩": "\\rangle",
  "‖": "\\|",
  "⌊": "\\lfloor",
  "⌋": "\\rfloor",
  "⌈": "\\lceil",
  "⌉": "\\rceil",
};

/**
 * One OMML element to LaTeX. `inner` is the element's own inner XML.
 *
 * The default arm is the safety net described in the header: recurse, so text inside a construct this
 * function has never met still comes out.
 */
function render(tag, inner) {
  switch (tag) {
    // Properties. They carry styling and control characters, never content.
    case "m:rPr":
    case "m:fPr":
    case "m:dPr":
    case "m:ctrlPr":
    case "m:sSupPr":
    case "m:sSubPr":
    case "m:sSubSupPr":
    case "m:radPr":
    case "m:naryPr":
    case "m:oMathParaPr":
    case "m:argPr":
    case "m:funcPr":
    case "m:limLowPr":
    case "m:limUppPr":
    case "m:barPr":
    case "m:accPr":
    case "m:borderBoxPr":
      return "";

    /** The one element that actually holds text. */
    case "m:t":
      return mapSymbols(escapeLatex(unesc(inner).replace(INVISIBLE, "")));

    /**
     * A RUN. Ordinary runs recurse to their `m:t`. A run marked `<m:nor/>` is NORMAL TEXT: words the
     * author typed into the equation as words (`for any real number`, `NPV`, `max`), which math mode
     * would set as a string of italic variables with the spaces dropped. Ninety-four runs of the
     * Mathematics summary are marked this way. The euro is the one symbol mapped inside text, as letters.
     */
    case "m:r": {
      if (/<m:nor\s*\/>/.test(child(inner, "m:rPr"))) {
        const text = unesc(child(inner, "m:t")).replace(INVISIBLE, "");
        return `\\text{${escapeLatex(text).replace(/\u20ac/g, "EUR")}}`;
      }
      return renderAll(inner);
    }

    /** A function name (`ln`, `log`, `sin`) is upright and spaced as an operator, not a product of letters. */
    case "m:func": {
      const nameXml = child(inner, "m:fName");
      const body = renderAll(child(inner, "m:e"));
      const lim = children(nameXml).find(([tag]) => tag === "m:limLow");
      if (lim) {
        const base = renderAll(child(lim[1], "m:e")).trim();
        const under = renderAll(child(lim[1], "m:lim")).trim();
        const op = KNOWN_FUNCTIONS.has(base)
          ? `\\${base}`
          : `\\operatorname{${base}}`;
        return `${op}_{${under}} ${body}`;
      }
      const name = renderAll(nameXml).trim();
      const op = KNOWN_FUNCTIONS.has(name)
        ? `\\${name}`
        : `\\operatorname{${name}}`;
      return `${op} ${body}`;
    }

    /** A limit under (or over) something that is not a function name. */
    case "m:limLow":
      return `\\underset{${renderAll(child(inner, "m:lim")).trim()}}{${renderAll(child(inner, "m:e")).trim()}}`;
    case "m:limUpp":
      return `\\overset{${renderAll(child(inner, "m:lim")).trim()}}{${renderAll(child(inner, "m:e")).trim()}}`;

    case "m:bar": {
      const pos = propChar(inner, "m:pos");
      return `${pos === "bot" ? "\\underline" : "\\overline"}{${renderAll(child(inner, "m:e"))}}`;
    }

    /** An accent, by the combining character Word stores. Anything else is a hat. */
    case "m:acc": {
      const chr = propChar(inner, "m:chr");
      /*
       * NEVER GUESS A MARK. The old fallback was "anything else is a hat", which turns an accent nobody
       * mapped into a different piece of mathematics that renders cleanly. `\\overset` keeps the
       * character the document actually carried, so the output stays true and KaTeX gets the chance to
       * refuse it in front of somebody rather than after publication.
       */
      let command = chr !== null ? ACCENTS.get(chr) : "\\hat";
      if (chr !== null && !command) {
        unknownAccents.add(chr);
        return `\\overset{${escapeLatex(chr)}}{${renderAll(child(inner, "m:e"))}}`;
      }
      command = command || "\\hat";
      return `${command}{${renderAll(child(inner, "m:e"))}}`;
    }

    case "m:borderBox":
      return `\\boxed{${renderAll(child(inner, "m:e"))}}`;

    case "m:f": {
      const num = renderAll(child(inner, "m:num"));
      const den = renderAll(child(inner, "m:den"));
      return `\\frac{${num}}{${den}}`;
    }

    case "m:d": {
      const open = propChar(inner, "m:begChr");
      const close = propChar(inner, "m:endChr");
      // Word omits both attributes for ordinary round brackets, which is the common case.
      const [l, r] = DELIMITERS[open ?? "("] ?? [open ?? "(", close ?? ")"];
      // A CLOSING character is spelled by DELIM_LATEX, not by the opening-keyed pair table above.
      const right = close === null ? r : (DELIM_LATEX[close] ?? close);
      const parts = children(inner)
        .filter(([name]) => name === "m:e")
        .map(([, body]) => renderAll(body));
      return `\\left${l}${parts.join(",")}\\right${right}`;
    }

    case "m:sSup":
      return `${braced(renderAll(child(inner, "m:e")))}^${braced(renderAll(child(inner, "m:sup")))}`;

    case "m:sSub":
      return `${braced(renderAll(child(inner, "m:e")))}_${braced(renderAll(child(inner, "m:sub")))}`;

    case "m:sSubSup":
      return (
        `${braced(renderAll(child(inner, "m:e")))}` +
        `_${braced(renderAll(child(inner, "m:sub")))}` +
        `^${braced(renderAll(child(inner, "m:sup")))}`
      );

    case "m:rad": {
      const deg = renderAll(child(inner, "m:deg"));
      const body = renderAll(child(inner, "m:e"));
      return deg === "" ? `\\sqrt{${body}}` : `\\sqrt[${deg}]{${body}}`;
    }

    case "m:nary": {
      const op = propChar(inner, "m:chr") ?? "∑";
      const name = op === "∏" ? "\\prod" : op === "∫" ? "\\int" : "\\sum";
      const sub = renderAll(child(inner, "m:sub"));
      const sup = renderAll(child(inner, "m:sup"));
      const body = renderAll(child(inner, "m:e"));
      return `${name}${sub === "" ? "" : `_${braced(sub)}`}${sup === "" ? "" : `^${braced(sup)}`}{${body}}`;
    }

    /** A hard break inside display maths. */
    case "m:brk":
      return " \\\\ ";

    default:
      return renderAll(inner);
  }
}

/** Every child of this inner XML, in order. */
function renderAll(xml) {
  return children(xml)
    .map(([tag, inner]) => render(tag, inner))
    .join("");
}

/**
 * One `<m:oMath>` element's inner XML, as a LaTeX string.
 *
 * Whitespace is collapsed because Word writes each run as its own `<m:t>` and the joins are arbitrary;
 * what matters is the tokens, and a formula with a double space in it renders identically.
 */
function ommlToLatex(innerXml) {
  return renderAll(innerXml).replace(/\s+/g, " ").trim();
}

/** Accent characters met that this file could not name. Empty is the expected answer. */
function unknownAccentsSeen() {
  return [...unknownAccents].map(
    (c) => `U+${c.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")}`,
  );
}

module.exports = {
  unknownAccentsSeen,
  ommlToLatex,
  escapeLatex,
};
