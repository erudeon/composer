/**
 * A PDF's own typography, read back as Markdown. THE PATH OF LAST RESORT.
 *
 * ── WHEN THIS IS ALLOWED, AND WHEN IT IS NOT ─────────────────────────────────────────────────────────
 *
 * `preflight.js` refuses a PDF as a source and it is right to: a `.docx` renamed to `.pdf` is common,
 * a PDF twin of a document somebody has is lossy next to the original, and reaching for the PDF is
 * what somebody does instead of going to look for the Word file. Four source files arrived on one day
 * and two of them were PDFs wearing the wrong extension.
 *
 * This exists for the case where there IS no Word file. One course's literature summary was a
 * photograph saved under a `.docx` name, in the working copy and in the live Nextcloud alike, and the
 * only copy of those 31 pages was the PDF. The choice was this or no literature at all.
 *
 * So: go and look for the original first, every time. Use this when it is not there, and CHECK THE
 * RESULT against the PDF word for word, because `corpus-check.mjs` does not cover this path.
 *
 * ── WHAT IT READS ────────────────────────────────────────────────────────────────────────────────────
 *
 * A PDF has no styles, so there is no outlineLvl to read. A PDF printed from Word still draws every
 * level it had, and the drawing is recoverable:
 *
 *   the largest coloured face          a unit title          #
 *   a smaller coloured bold face       a section title       ##
 *   the body face                      body
 *   the body face's BOLD cut           bold inside body      **...**
 *   a face used only in the margins    page furniture        dropped
 *   Symbol / Wingdings / "o" / "N."    a list marker         - or 1. at its own depth
 *
 * This is a guess about typography rather than a reading of structure, which is the same trade
 * `docx2.js` makes for a Word file with no heading styles. It is safe HERE because three signals agree
 * on every run: colour AND size AND family, never one of them alone. On a document where they do not
 * agree, look at the output before trusting it.
 *
 * A SCAN HAS NO TYPOGRAPHY AND IS REFUSED. There is nothing to read and a silent empty file is worse
 * than a stop.
 *
 *   node pdf.js <file.pdf> <out.md>
 *
 * Needs pdftohtml (poppler) on PATH.
 */
"use strict";

const { execFileSync } = require("node:child_process");
const { mkdtempSync, readFileSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");

/* The page box this document draws in. Anything above the first or below the second is running
   furniture: the brand line at the top, the page number and copyright at the foot. */
const HEADER_BELOW = 100;
const FOOTER_ABOVE = 1130;

/** Two runs are on the same visual line when their tops are this close. */
const LINE_EPS = 6;

/** A vertical gap wider than this ends the paragraph. Within one it is 21 to 23 here. */
const PARA_GAP = 30;

/**
 * DEPTH COMES FROM WHERE THE MARKER IS, AND IT IS RELATIVE.
 *
 * A fixed table of columns cannot express this document. Under "Formal Institutions" a child bullet
 * sits at x=149; under "Business Contexts" a child of the same parent column sits at x=189. Both are
 * children of an item whose marker is at 135, so the ladder is local rather than global.
 *
 * Reading the CONTENT column instead is worse, because the bullets at 149 put their text at 162,
 * which is exactly where a numbered item's text starts: a child then looks like its parent's sibling.
 *
 * A stack of marker columns answers both. Further right than the item above is a child, level with it
 * is a sibling, left of it closes the levels in between.
 */
const SAME_COLUMN = 6;

function makeDepths() {
  const stack = [];
  return {
    /** The depth of a list line whose MARKER starts at `x`. */
    forMarker(x) {
      while (stack.length && stack[stack.length - 1] >= x - SAME_COLUMN) stack.pop();
      stack.push(x);
      return stack.length - 1;
    },
    /** A new paragraph at the body column ends whatever list was open above it. */
    reset() {
      stack.length = 0;
    },
  };
}

/** A marker run: the bullet glyph or the "1." of a numbered item, never content. */
function markerKind(text, family) {
  if (/^\d+\.$/.test(text.trim())) return "ol";
  if (/^[a-z]\.$/i.test(text.trim()) && text.trim().length === 2) return "ol";
  if (/Wingdings|Symbol/i.test(family)) return "ul";
  if (text.trim() === "o" && /Courier/i.test(family)) return "ul";
  if (/^[•▪●·]$/.test(text.trim())) return "ul";
  return null;
}

function unescapeXml(s) {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&");
}

/** One run's text with its emphasis kept, and a flag for whether the WHOLE run was bold. */
function runText(html) {
  const bold = /^\s*<b>/.test(html) && /<\/b>\s*$/.test(html);
  const italic = /^\s*<i>/.test(html) && /<\/i>\s*$/.test(html);
  const plain = unescapeXml(html.replace(/<a [^>]*>|<\/a>|<\/?b>|<\/?i>/g, ""));
  return { plain, bold, italic };
}

/** Markdown's own characters, where they would otherwise change the meaning of the author's text. */
function escapeMd(s) {
  return s.replace(/([\\`*_[\]])/g, "\\$1");
}

/** Run poppler and read the typography out of what it says. */
function pdfToMarkdown(pdfPath) {
  const dir = mkdtempSync(join(tmpdir(), "pdf2md-"));
  const stem = join(dir, "doc");
  execFileSync("pdftohtml", ["-xml", "-i", "-nodrm", "-q", pdfPath, stem]);
  return xmlToMarkdown(readFileSync(`${stem}.xml`, "utf8"), pdfPath);
}

/**
 * EVERY RULE IN THIS FILE READS THIS XML AND NOTHING ELSE, so this is the seam worth testing: the
 * geometry that broke a real document can be written out exactly, and a test needs no PDF and no
 * poppler to prove the rules still read it the same way.
 */
function xmlToMarkdown(xml, pdfPath = "(xml)") {

  /*
   * A SCAN IS REFUSED. Its pages carry an image and no text runs, so every rule below finds nothing
   * and the result is a valid, empty Markdown file: the one failure that looks like success.
   */
  const pages = Math.max(1, (xml.match(/<page number=/g) ?? []).length);
  const chars = (xml.match(/<text [^>]*>([\s\S]*?)<\/text>/g) ?? [])
    .map((t) => t.replace(/<[^>]+>/g, "").trim())
    .join("").length;
  /* PER PAGE, not a raw count: poppler merges neighbouring runs, so counting them refuses a short
     document that is perfectly readable. A scan yields nothing at all whatever its length. */
  if (chars / pages < 40) {
    throw new Error(
      `${pdfPath} yields ${chars} character(s) across ${pages} page(s), so it is a scan or an ` +
        `export with no text layer. There is nothing here to read: find the document it was ` +
        `printed from.`,
    );
  }

  /* Font ids are global and cumulative across pages: page 2 adds 10 upward and never redefines 0. */
  const specs = new Map();
  for (const m of xml.matchAll(
    /<fontspec id="(\d+)" size="(\d+)" family="([^"]*)" color="([^"]*)"\/>/g,
  )) {
    specs.set(m[1], { size: Number(m[2]), family: m[3], colour: m[4] });
  }

  /** Every content run in reading order, page by page, furniture already gone. */
  const lines = [];
  for (const page of xml.split(/(?=<page number=)/)) {
    if (!page.startsWith("<page number=")) continue;
    const runs = [];
    for (const t of page.matchAll(
      /<text top="(-?\d+)" left="(-?\d+)" width="(-?\d+)" height="(-?\d+)" font="(\d+)">([\s\S]*?)<\/text>/g,
    )) {
      const top = Number(t[1]);
      const left = Number(t[2]);
      if (top < HEADER_BELOW || top > FOOTER_ABOVE) continue;
      const spec = specs.get(t[5]) ?? { size: 0, family: "", colour: "" };
      const { plain, bold, italic } = runText(t[6]);
      /* A WHITESPACE-ONLY RUN IS THE SPACE BETWEEN TWO WORDS. Word emits the bold phrase, the space
         after it and the next word as three runs, so dropping the middle one welds them together:
         "The**Business in Context (BIC) Model**combines". Kept here, dropped a line at a time below. */
      if (plain === "") continue;
      /* The cover block: the document's own title page, which the course already says. */
      if (spec.size >= 30) continue;
      runs.push({ top, left, spec, plain, bold, italic });
    }
    runs.sort((a, b) => a.top - b.top || a.left - b.left);

    /* Runs into visual lines. A line's own top is its FIRST run's, because a marker glyph sits a
       pixel or two below the text it marks and clustering on the mean drifts. */
    for (const run of runs) {
      const last = lines[lines.length - 1];
      if (
        last &&
        last.page === page &&
        Math.abs(run.top - last.top) <= LINE_EPS
      ) {
        last.runs.push(run);
      } else {
        lines.push({ page, top: run.top, runs: [run] });
      }
    }
  }

  /* Lines into blocks. */
  const out = [];
  const depths = makeDepths();
  let para = null;
  /** The open list stack: one entry per depth, saying whether it is ordered. */
  let lastTop = null;

  const flush = () => {
    if (para && para.text.trim()) out.push(para);
    para = null;
  };

  for (const line of lines) {
    const gap = lastTop === null ? Infinity : line.top - lastTop;
    lastTop = line.top;

    let runs = line.runs.slice().sort((a, b) => a.left - b.left);
    while (runs.length && runs[0].plain.trim() === "") runs = runs.slice(1);
    if (runs.length === 0) continue;
    const first = runs[0];
    const marker = markerKind(first.plain, first.spec.family);
    let depth = 0;
    if (marker) {
      depth = depths.forMarker(first.left);
      runs = runs.slice(1);
      while (runs.length && runs[0].plain.trim() === "") runs = runs.slice(1);
      if (runs.length === 0) continue;
    } else if (gap > PARA_GAP) {
      /* A WRAPPED line is still inside its item, so only a line that opens a block closes the list. */
      depths.reset();
    }
    if (runs.length === 0) continue;

    const content = runs.map((r) => r.plain).join("");
    if (!content.trim()) continue;

    const lead = runs[0].spec;
    /* THE HEADING TEST IS PER DOCUMENT. These are the values one real summary drew; a PDF from another
       template will use others, so read its fontspec table before trusting the output. */
    const heading =
      lead.colour === "#2980b8" && lead.size >= 24
        ? 1
        : lead.colour === "#2980b8" && lead.size >= 18
          ? 2
          : 0;

    /* Emphasis, rebuilt from the runs rather than from the joined string: a bold word and the colon
       after it are separate runs, and asking the string which half was bold is not answerable. */
    const md = runs
      .map((r) => {
        const body = escapeMd(r.plain);
        if (!body.trim()) return body;
        const [, pre, core, post] = /^(\s*)([\s\S]*?)(\s*)$/.exec(body);
        if (r.bold) return `${pre}**${core}**${post}`;
        if (r.italic) return `${pre}*${core}*${post}`;
        return body;
      })
      .join("");

    if (heading) {
      /* A TITLE THAT WRAPPED IS STILL ONE TITLE. "Module 3: Formal Institutions - Political,
         Economic, and / Legal Systems" is drawn as two lines of the same 24pt blue, and treating the
         second as its own module put a heading with no number into the contents list. */
      const open = out[out.length - 1];
      if (
        open?.kind === "heading" &&
        open.level === heading &&
        gap <= PARA_GAP &&
        para === null
      ) {
        open.text += (/[\s-]$/.test(open.text) ? "" : " ") + content.trim();
        open.md = open.text;
        continue;
      }
      flush();
      out.push({
        kind: "heading",
        level: heading,
        text: content.trim(),
        md: content.trim(),
      });
      continue;
    }

    const startsBlock = marker !== null || gap > PARA_GAP || para === null;
    if (startsBlock) {
      flush();
      para = { kind: marker ?? "p", depth, text: content, md };
    } else {
      /* A wrapped line. Word breaks at a space and the run before it usually carries that space, so
         the join supplies one only when it does not. A break straight after a HYPHEN is the one case
         where no space belongs: "integration-" / "responsiveness framework" is one hyphenated term
         and a space there invents a second one. */
      const sep = /[\s-]$/.test(para.text) ? "" : " ";
      para.text += sep + content;
      para.md += sep + md;
    }
  }
  flush();

  /* Markdown. List depth is two spaces a level, which is what docx.js emits and what the manifest
     builder reads. */
  const md = [];
  let prev = null;
  for (const b of out) {
    if (b.kind === "heading") {
      md.push("", `${"#".repeat(b.level)} ${b.md}`, "");
    } else if (b.kind === "ul" || b.kind === "ol") {
      if (prev && prev.kind === "p") md.push("");
      const bullet = b.kind === "ol" ? "1." : "-";
      md.push(
        `${"  ".repeat(b.depth)}${bullet} ${b.md.trim()}`,
      );
    } else {
      md.push("", b.md.trim(), "");
    }
    prev = b;
  }

  return (
    md
      .join("\n")
      /* Emphasis tidied ONCE, over the whole document, because a bold phrase broken across a line
       arrives as two runs that only become adjacent after the wrap is joined. */
      .replace(/\*\*(\s*)\*\*/g, "$1")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/^\n+/, "")
      .trimEnd()
      .concat("\n")
  );
}

module.exports = { pdfToMarkdown, xmlToMarkdown };

/* Run directly, the same way every other script in this folder does. */
if (require.main === module) {
  const [, , pdf, out] = process.argv;
  if (!pdf || !out) {
    console.error("usage: node pdf.js <file.pdf> <out.md>");
    process.exit(2);
  }
  const markdown = pdfToMarkdown(pdf);
  writeFileSync(out, markdown);
  const h1 = (markdown.match(/^# /gm) ?? []).length;
  const h2 = (markdown.match(/^## /gm) ?? []).length;
  const bold = (markdown.match(/\*\*/g) ?? []).length / 2;
  const lists = (markdown.match(/^ *(?:-|1\.) /gm) ?? []).length;
  console.log(
    `${out}  headings=${h1}/${h2}  bold=${bold}  lists=${lists}  words=${markdown.split(/\s+/).length}`,
  );
  console.log(
    "\nA PDF is the LAST RESORT and nothing checks this path for you: read the result against the PDF.\n",
  );
}
