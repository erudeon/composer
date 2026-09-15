/**
 * `docx-core.js` — READING A WORD BODY. THE HALF THAT IS THE SAME WHATEVER THE DOCUMENT IS.
 *
 * ── WHY THIS IS ITS OWN FILE ─────────────────────────────────────────────────────────────────────────
 *
 * There are two extractors, because there are two kinds of document: one whose headings are real styles
 * and one whose headings are only a font size. They differ in that ONE decision and they used to
 * differ in everything, because the second was written by copying the first.
 *
 * They drifted, and the drift was expensive. `docx2.js` never picked up the `<m:oMath>` fix, so a
 * Google Docs export carrying equations came out of it looking clean and missing every formula: exactly
 * the failure mode the comment in `docx.js` calls the most expensive one in the whole intake, reproduced
 * three feet away. Everything both extractors agree on lives here now, and each of them is the one
 * decision it actually owns.
 *
 * ── THE OUTPUT IS MARKDOWN ───────────────────────────────────────────────────────────────────────────
 *
 * It used to be a private format: `{Heading1}` before a heading, a literal `•` before a list item,
 * `[[TABLE]]` fences around a table. Every consumer then had to strip that scaffolding, and the
 * stripping is precisely where prose stops matching the source it came from. The `prose-verbatim` lint
 * at the write path diffs byte for byte, so a scaffolding character removed by the wrong rule is a
 * refused import naming a character forty lines in.
 *
 * Markdown removes the step. A heading is `##`, a bullet is `-`, a table is a table, an equation is
 * already `$…$`, and nothing downstream has to know this file exists.
 */
const path = require("node:path");

("use strict");

function unesc(s) {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/*
 * WHAT THE IMPORTER READS MATHS AS (`lib/passos/authoring/serialize.ts`). Inline is a single dollar
 * with a NON-SPACE either side, which is Pandoc's rule and the reason nothing here pads the latex;
 * display is a doubled one. `maths-spans.js` reads back exactly this.
 */
const INLINE = String.fromCharCode(36);
const DISPLAY_OPEN = INLINE + INLINE;

/**
 * THE SPELLING `media-inventory.json` USES for a picture, from a relationship's target.
 *
 * ONE HOME, because two spellings of one path is how a marker stops matching the inventory entry it
 * belongs to, and the two are written by different scripts at different times. `path.posix.join`
 * normalises `./media/x.png` and `/media/x.png`, which a `startsWith` guard cannot.
 */
function mediaPathFor(target) {
  return path.posix.join("word", target);
}

/** An embedded picture, wherever it sits. */
const BLIP_RE = /<a:blip\b[^>]*r:embed="([^"]+)"/g;

/**
 * EVERY PICTURE IN A BODY, BY BYTE OFFSET, scanned over the WHOLE string rather than per block.
 *
 * `BLOCK_RE` is non-greedy, so a paragraph carrying a floating text box ends at the INNER `</w:p>` and
 * everything after it — a picture included — is matched by no block at all. Measured on one real
 * summary, a paragraph-based scan found 32 of its 53 pictures, and 30 of 248 corpus documents carry a
 * text box. A table's cells are the same problem from the other side: the table branch returns before
 * any paragraph inside it is looked at.
 *
 * Offsets are the fix for both. The caller walks blocks and flushes every picture that sits before the
 * point it has reached, so a picture in a gap no block covers is emitted rather than lost.
 */
function pictureOffsets(body, rels) {
  const out = [];
  for (const m of body.matchAll(BLIP_RE)) {
    const target = rels[m[1]];
    if (target) out.push({ at: m.index, file: mediaPathFor(target) });
  }
  return out;
}

/** Block-level elements of a body, in document order: paragraphs and tables. */
const BLOCK_RE =
  /<w:p\b[\s\S]*?<\/w:p>|<w:p\b[^>]*\/>|<w:tbl>[\s\S]*?<\/w:tbl>/g;

/** The runs of one paragraph, with the formatting each one carries. */
function runsOf(p) {
  const res = [];
  const runRe = /<w:r\b[\s\S]*?<\/w:r>/g;
  let r;
  while ((r = runRe.exec(p))) {
    const rs = r[0];
    const rPr = (rs.match(/<w:rPr>[\s\S]*?<\/w:rPr>/) || [""])[0];
    let txt = "";
    const tRe =
      /<w:t\b[^>]*>([\s\S]*?)<\/w:t>|<w:br\b[^>]*\/>|<w:tab\b[^>]*\/>/g;
    let tm;
    while ((tm = tRe.exec(rs))) {
      if (tm[1] !== undefined) txt += unesc(tm[1]);
      else if (/^<w:br/.test(tm[0])) txt += "\n";
      else txt += "\t";
    }
    if (!txt) continue;
    res.push({
      txt,
      bold: /<w:b\b(?![^>]*w:val="(0|false)")/.test(rPr),
      italic: /<w:i\b(?![^>]*w:val="(0|false)")/.test(rPr),
      size: +((rPr.match(/<w:sz w:val="(\d+)"/) || [])[1] || 0) / 2,
      colour: (rPr.match(/<w:color w:val="([^"]*)"/) || [])[1] || "",
    });
  }
  return res;
}

/**
 * One paragraph as Markdown text: its runs, its equations, and its emphasis.
 *
 * AN EQUATION IS NOT MADE OF `<w:r>` RUNS, which is why every one of them used to vanish without a
 * word. Word writes maths as `<m:oMath>` full of `<m:r>`/`<m:t>`, and `<w:r\b` matches neither, so the
 * extractor read a formula sheet, found no formulas, and reported a clean parse.
 *
 * MATCHED IN THE SAME PASS AS THE RUNS, never in a second sweep, so an equation sitting mid-sentence
 * comes out where it actually is rather than appended to the end of the paragraph. The oMath branch is
 * FIRST in the alternation because it swallows its own contents: a run inside an equation must not be
 * picked up again and printed twice.
 */
function paraText(p, ommlToLatex, forceInline = false) {
  const runRe =
    /<m:oMath\b[\s\S]*?<\/m:oMath>|<w:r\b[\s\S]*?<\/w:r>|<w:br\b[^>]*\/>|<w:tab\b[^>]*\/>/g;
  /*
   * DISPLAY OR INLINE, decided by the paragraph rather than by the equation. Word wraps a standalone
   * equation in `<m:oMathPara>`, which is the only thing separating "this formula is the paragraph"
   * from "this formula is a phrase in a sentence", and the two take different delimiters.
   */
  /*
   * A TABLE CELL IS NEVER DISPLAY MATHS. Word wraps a cell holding nothing but an equation in
   * `<m:oMathPara>` exactly as it would a standalone paragraph, so the cell came out with `$$`
   * delimiters and the reader drew a centred block inside a table column. A cell is inline by
   * definition, whatever the paragraph inside it says, so the caller overrides it.
   */
  const display = !forceInline && /<m:oMathPara\b/.test(p);

  /*
   * COLLECTED FIRST, EMITTED AFTERWARDS, and that order is the whole fix.
   *
   * Marking each run as it arrives is what produced nested emphasis. Word splits one phrase across
   * runs by formatting, so "From *Foundations of Physics* (1740)" is three runs: bold, bold+italic,
   * bold. Wrapping each one on its own gives `**From **` + `***...***` + `**(1740)**`, and the tidy-up
   * pass then leaves `**From *Foundations of Physics *(1740)**`: a mark inside a mark.
   *
   * THE READER'S DIALECT CARRIES ONE MARK PER SPAN, so a nested one is not emphasis at all. It is
   * stored with its inner asterisks as literal characters and the student reads them on the page. The
   * write path refuses it by name (`no-nested-emphasis`), which is how this was found.
   *
   * So each run is reduced to ONE mark before anything is written, and adjacent runs carrying the same
   * mark are merged into a single span. Nesting then cannot be constructed.
   */
  const pieces = [];
  const push = (mark, text) => {
    const last = pieces[pieces.length - 1];
    if (last && last.mark === mark) last.text += text;
    else pieces.push({ mark, text });
  };

  let r;
  while ((r = runRe.exec(p))) {
    const rs = r[0];
    if (/^<m:oMath/.test(rs)) {
      const latex = ommlToLatex(
        rs.replace(/^<m:oMath\b[^>]*>/, "").replace(/<\/m:oMath>$/, ""),
      );
      // An equation that renders to nothing is one Word left empty. An empty pair of delimiters is a
      // parse error downstream and says less than saying nothing at all.
      if (latex) {
        /*
         * TWO EQUATIONS WITH NOTHING BETWEEN THEM MEET AS `$$`, WHICH IS A DIFFERENT DELIMITER.
         *
         * Word lets one cell or one paragraph hold several `<m:oMath>` elements back to back, and a
         * statistics cheat sheet does exactly that: `P(X=1)=p,` and `P(X=0)=1-p` are two objects in one
         * cell. Emitted as inline maths they close and open against each other, the scanner reads the
         * doubled dollar as display, and the whole row is refused. One space is enough, and it is what
         * the reader would draw between them anyway.
         */
        const previous = pieces[pieces.length - 1];
        if (previous && previous.text.endsWith(INLINE)) push("", " ");
        push(
          "",
          display
            ? DISPLAY_OPEN + latex + DISPLAY_OPEN
            : INLINE + latex + INLINE,
        );
      }
      continue;
    }
    if (/^<w:br/.test(rs)) {
      push("", "\n");
      continue;
    }
    if (/^<w:tab/.test(rs)) {
      push("", "\t");
      continue;
    }
    for (const run of runsOf(rs)) {
      /*
       * BOLD WINS over italic where Word set both. One of the two has to go and neither is
       * recoverable, so it is the one these documents use for a key term, which is what a reader most
       * needs to see.
       */
      push(run.bold ? "**" : run.italic ? "*" : "", run.txt);
    }
  }

  let t = "";
  for (const piece of pieces) {
    if (!piece.mark) {
      t += piece.text;
      continue;
    }
    /*
     * THE MARKERS GO ROUND THE WORDS, NOT ROUND THE SPACES. Word happily marks a trailing space bold,
     * and `**behaviour **is` renders as asterisks rather than as emphasis. A span that is only
     * whitespace is not emphasis at all.
     */
    const [, before, core, after] = /^(\s*)([\s\S]*?)(\s*)$/.exec(piece.text);
    t += core ? before + piece.mark + core + piece.mark + after : piece.text;
  }
  return t;
}

/**
 * A TAB IS LAYOUT, AND IN MARKDOWN IT IS A CODE BLOCK.
 *
 * Word indents with `<w:ind>` and pads with `<w:tab/>`, neither of which is content. Left alone, a
 * tab-indented paragraph becomes an indented code block: its emphasis stops rendering and, worse, the
 * `$…$` inside it stops being maths. Leading whitespace goes, interior tabs become one space.
 */
function flatten(text) {
  return text
    .replace(/\t/g, " ")
    .replace(/^[ \t]+/gm, "")
    .replace(/[ \t]+$/gm, "");
}

/** Rows of one `<w:tbl>` as arrays of cell text. */
function tableRows(blk, cellText) {
  const rows = [];
  for (const rw of blk.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)) {
    const cells = [];
    for (const cl of rw[0].matchAll(/<w:tc>[\s\S]*?<\/w:tc>/g))
      cells.push(cellText(cl[0]));
    rows.push(cells);
  }
  return rows;
}

/**
 * A table as GitHub-flavoured Markdown.
 *
 * A cell holds one line: a pipe inside it is escaped or it opens a column that is not there, and a
 * newline inside it ends the table. Merged cells make rows of different widths, and a separator row
 * narrower than its header silently drops every column past it, so every row is padded to the widest.
 */
function gfmTable(rows) {
  const width = Math.max(0, ...rows.map((r) => r.length));
  if (width === 0) return [];
  const clean = (c) =>
    (c ?? "")
      .replace(/\s*\n\s*/g, " ")
      /*
       * BACKSLASH AND PIPE TOGETHER, IN ONE PASS. Escaping the pipe alone turns a cell holding `a\|b`
       * into `a\\|b`, which Markdown reads as an escaped BACKSLASH followed by a bare pipe: the cell
       * splits and every column after it shifts by one, silently, on a table that looked fine in Word.
       */
      .replace(/[\\|]/g, (c) => `\\${c}`)
      .replace(/\s{2,}/g, " ")
      .trim();
  const line = (cells) =>
    "| " +
    Array.from({ length: width }, (_, i) => clean(cells[i])).join(" | ") +
    " |";
  const out = [line(rows[0]), "|" + " --- |".repeat(width)];
  for (const r of rows.slice(1)) out.push(line(r));
  return out;
}

/**
 * Lines, with the blank lines Markdown needs between blocks and never between list items.
 *
 * Word's own empty paragraphs are spacing, so they collapse here rather than arriving as a run of blank
 * lines that Markdown would ignore anyway.
 */
function emitter() {
  const out = [];
  const lastIsBlank = () => out.length === 0 || out[out.length - 1] === "";
  return {
    blank() {
      if (!lastIsBlank()) out.push("");
    },
    line(s) {
      out.push(s);
    },
    text() {
      return (
        out
          .join("\n")
          .replace(/\n{3,}/g, "\n\n")
          .trim() + "\n"
      );
    },
  };
}

/**
 * `numId` + `ilvl` -> "bullet" or "ordered", read from `word/numbering.xml`.
 *
 * Word stores the marker's shape on the ABSTRACT numbering, one level down from the id a paragraph
 * carries, so a paragraph alone cannot say whether it is a bullet or a number. Guessing costs the
 * reader an ordered list drawn as dots, or a bulleted one drawn as 1, 2, 3.
 */
function listFormats(numberingXml) {
  const abstractOf = new Map();
  const fmt = new Map();
  if (numberingXml) {
    for (const m of numberingXml.matchAll(
      /<w:num\b[^>]*w:numId="(\d+)"[^>]*>([\s\S]*?)<\/w:num>/g,
    )) {
      const abstract = /<w:abstractNumId\b[^>]*w:val="(\d+)"/.exec(m[2])?.[1];
      if (abstract) abstractOf.set(m[1], abstract);
    }
    for (const m of numberingXml.matchAll(
      /<w:abstractNum\b[^>]*w:abstractNumId="(\d+)"[\s\S]*?<\/w:abstractNum>/g,
    )) {
      for (const l of m[0].matchAll(
        /<w:lvl\b[^>]*w:ilvl="(\d+)"[\s\S]*?<\/w:lvl>/g,
      )) {
        const f = /<w:numFmt\b[^>]*w:val="([^"]+)"/.exec(l[0])?.[1];
        if (f) fmt.set(`${m[1]}:${l[1]}`, f);
      }
    }
  }
  return (numId, ilvl) => {
    const abstract = abstractOf.get(String(numId));
    const f = abstract ? fmt.get(`${abstract}:${ilvl}`) : null;
    // Unknown numbering is a bullet: a dash reads as a list either way, where a wrong "1." asserts an
    // order the document never claimed.
    return f && f !== "bullet" && f !== "none" ? "ordered" : "bullet";
  };
}

/**
 * Every paragraph style that is a heading, and at what level.
 *
 * `<w:outlineLvl>` is zero-based in the file and one-based here, because `#` is level 1. A level past 6
 * has no Markdown spelling and is clamped: Word allows nine and no summary has ever used more than four.
 */
function headingLevels(stylesXml) {
  const own = new Map();
  const basedOn = new Map();
  if (stylesXml) {
    for (const m of stylesXml.matchAll(/<w:style\b[\s\S]*?<\/w:style>/g)) {
      const s = m[0];
      if (!/w:type="paragraph"/.test(s)) continue;
      const id = /w:styleId="([^"]+)"/.exec(s)?.[1];
      if (!id) continue;
      const base = /<w:basedOn\b[^>]*w:val="([^"]+)"/.exec(s)?.[1];
      if (base) basedOn.set(id, base);
      const name = /<w:name\b[^>]*w:val="([^"]*)"/.exec(s)?.[1] ?? "";
      const outline = /<w:outlineLvl\b[^>]*w:val="(\d+)"/.exec(s)?.[1];
      const named =
        /^heading\s*(\d+)/i.exec(name) ?? /^heading\s*(\d+)$/i.exec(id);
      let level = null;
      if (outline !== undefined) level = Number(outline) + 1;
      else if (named) level = Number(named[1]);
      else if (/^title$/i.test(name)) level = 1;
      if (level !== null) own.set(id, Math.min(6, Math.max(1, level)));
    }
  }
  /*
   * `<w:basedOn>` inherits `outlineLvl`, so a style that adds nothing to Heading 2 IS a Heading 2. The
   * `seen` set is for a styles.xml whose chain loops, which a corrupted export can produce and which
   * would otherwise be an infinite recursion in the middle of somebody's intake.
   */
  const resolved = new Map();
  const resolve = (id, seen = new Set()) => {
    if (resolved.has(id)) return resolved.get(id);
    if (seen.has(id)) return null;
    seen.add(id);
    const level =
      own.get(id) ?? (basedOn.has(id) ? resolve(basedOn.get(id), seen) : null);
    resolved.set(id, level);
    return level;
  };
  for (const id of new Set([...own.keys(), ...basedOn.keys()])) resolve(id);
  return resolved;
}

/**
 * THE STYLES THE AUTHOR MADE, WHICH ARE THE ONLY PLACE THEY SAID WHAT A PARAGRAPH IS FOR.
 *
 * The house summary template does not only give an author headings. It gives them `In Short`, `Example`
 * and `not-prose`, and an author using them has already answered the question the layout phase otherwise
 * has to guess at: which paragraph is a worked example, which is a recap, which is not the author's prose
 * at all. It is the one piece of authorial intent in the whole file, and every extractor that asked only
 * "is this a heading" threw it away.
 *
 * Word marks these itself. A style the user created carries `w:customStyle="1"`; a built-in one does
 * not. That is Word's own answer, so this needs no list of names to keep up to date, and it works on a
 * template nobody has told us about yet.
 *
 * It reports the style's NAME and never a meaning. What `In Short` may become on the page is the
 * platform's vocabulary, the layout phase asks `content_guide` for it, and a mapping written here would
 * be a second copy of a generated thing.
 */
function authoredStyles(stylesXml) {
  const out = new Map();
  if (!stylesXml) return out;
  for (const m of stylesXml.matchAll(/<w:style\b[\s\S]*?<\/w:style>/g)) {
    const s = m[0];
    if (!/w:type="paragraph"/.test(s)) continue;
    if (!/w:customStyle="1"/.test(s)) continue;
    // A custom style that IS a heading is already spelt as one; it does not need a second marker.
    if (/<w:outlineLvl\b/.test(s)) continue;
    const id = /w:styleId="([^"]+)"/.exec(s)?.[1];
    const name = /<w:name\b[^>]*w:val="([^"]*)"/.exec(s)?.[1];
    if (id && name) out.set(id, name);
  }
  return out;
}

/** What a paragraph's own `<w:pPr>` says about it. */
function paraProps(blk) {
  const pPr = (blk.match(/<w:pPr>[\s\S]*?<\/w:pPr>/) || [""])[0];
  return {
    style: (pPr.match(/<w:pStyle\b[^>]*w:val="([^"]*)"/) || [])[1] || "",
    numId: (pPr.match(/<w:numId\b[^>]*w:val="([^"]*)"/) || [])[1],
    ilvl: (pPr.match(/<w:ilvl\b[^>]*w:val="([^"]*)"/) || [])[1] || "0",
    outline: (pPr.match(/<w:outlineLvl\b[^>]*w:val="([^"]*)"/) || [])[1],
  };
}

module.exports = {
  unesc,
  mediaPathFor,
  pictureOffsets,
  headingLevels,
  authoredStyles,
  runsOf,
  paraText,
  flatten,
  tableRows,
  gfmTable,
  emitter,
  listFormats,
  paraProps,
  BLOCK_RE,
};
