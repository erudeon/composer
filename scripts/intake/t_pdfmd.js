/**
 * THE PDF PATH, ON THE GEOMETRY THAT ACTUALLY BROKE.
 *
 * `pdf.js` is the last resort and nothing else covers it: `corpus-check.mjs` runs the docx chain, and
 * the one real document this was written against is not in this repository.
 *
 * Every rule in that file reads poppler's XML and nothing else, so that is the seam tested here. The
 * coordinates below are lifted from the real summary, which means this needs no PDF and no poppler
 * and still proves the three things that went wrong:
 *
 *   A SCAN IS REFUSED. No text means every rule finds nothing and the result is a valid, EMPTY
 *   Markdown file, which is the one failure that looks like success. The threshold is text PER PAGE:
 *   poppler merges neighbouring runs, so counting runs refuses a short document that reads perfectly.
 *
 *   A BOLD PHRASE AND THE SPACE AFTER IT ARE SEPARATE RUNS. Dropping the whitespace-only run welds its
 *   neighbours on: "The**Business in Context (BIC) Model**combines".
 *
 *   A LIST'S DEPTH IS ITS MARKER'S COLUMN, NOT ITS TEXT'S. In this document a child bullet's text sits
 *   at x=162, which is exactly where a numbered item's own text starts; only the markers differ, at
 *   135 and 149. Reading the text column makes the child look like its parent's sibling, and thirteen
 *   numbered items across three modules lost their numbers to it.
 *
 *   node scripts/intake/t_pdfmd.js
 */
"use strict";

const assert = require("node:assert");
const { xmlToMarkdown } = require("./pdf.js");

/** One `<text>` element as poppler writes it. */
const run = (top, left, font, body) =>
  `<text top="${top}" left="${left}" width="10" height="18" font="${font}">${body}</text>`;

/** The fonts of the real document: a blue 24pt title, body Calibri, and its bold cut. */
const FONTS = [
  '<fontspec id="0" size="24" family="Arial" color="#2980b8"/>',
  '<fontspec id="1" size="18" family="BCDLEE+Calibri" color="#000000"/>',
  '<fontspec id="2" size="18" family="BCDJEE+Calibri" color="#000000"/>',
  '<fontspec id="3" size="15" family="BCDOEE+CourierNewPSMT" color="#000000"/>',
  '<fontspec id="4" size="15" family="BCDPEE+SymbolMT" color="#000000"/>',
].join("\n");

const page = (lines) =>
  `<pdf2xml>\n<page number="1" position="absolute" top="0" left="0" height="1263" width="893">\n` +
  `${FONTS}\n${lines.join("\n")}\n</page>\n</pdf2xml>\n`;

/* ── a scan is refused rather than silently emptied ───────────────────────────────────────────────── */

assert.throws(
  () => xmlToMarkdown(page([])),
  /scan|text layer/i,
  "a PDF with no text must be refused, not turned into an empty Markdown file",
);

/* ── the three shapes ─────────────────────────────────────────────────────────────────────────────── */

const md = xmlToMarkdown(
  page([
    run(311, 108, "0", "<b>Module 1: The Concept of Business in Context </b>"),

    // A bold phrase between two ordinary ones, each space its own run.
    run(485, 108, "1", "The"),
    run(485, 136, "1", " "),
    run(485, 140, "2", "<b>Business in Context (BIC) Model</b>"),
    run(485, 376, "1", " "),
    run(485, 380, "1", "combines these three levels."),

    // A numbered item at marker 135 / text 162, and its child bullet at marker 149 / text 162.
    run(600, 135, "3", "1."),
    run(600, 149, "1", " "),
    run(600, 162, "2", "<b>Political Systems</b>"),
    run(600, 313, "1", ":"),
    run(622, 149, "4", "\u2022"),
    run(622, 156, "1", " "),
    run(622, 162, "1", "A democracy elects its leaders."),
    run(644, 135, "3", "2."),
    run(644, 149, "1", " "),
    run(644, 162, "2", "<b>Economic Systems</b>"),
    run(644, 315, "1", ":"),
    run(666, 149, "4", "\u2022"),
    run(666, 156, "1", " "),
    run(666, 162, "1", "A market economy leaves it to the market."),
  ]),
);

assert.ok(
  /^# Module 1: The Concept of Business in Context$/m.test(md),
  `the largest coloured face is the unit title:\n${md}`,
);

assert.ok(
  /The \*\*Business in Context \(BIC\) Model\*\* combines/.test(md),
  `the spaces around a bold phrase must survive, or its neighbours weld to it:\n${md}`,
);

assert.strictEqual(
  (md.match(/^\d+\. /gm) ?? []).length,
  2,
  `both numbered items keep their number:\n${md}`,
);

assert.ok(
  /^ +- A democracy elects its leaders\./m.test(md),
  `the child bullet's TEXT is level with its parent's, so this passes only if depth reads the ` +
    `marker column:\n${md}`,
);


/*
 * THE SAME COLUMNS WITH NO SPACER RUNS, which is what a tightly-set PDF produces and what isolates
 * the rule. Both the numbered item and its child bullet put their TEXT at 162; only the markers
 * differ, at 135 and 149. Read the text column and the child is its parent's sibling.
 */
const tight = xmlToMarkdown(
  page([
    run(311, 108, "0", "<b>Module 3: Formal Institutions</b>"),
    run(600, 135, "3", "1."),
    run(600, 162, "2", "<b>Political Systems</b>"),
    run(622, 149, "4", "\u2022"),
    run(622, 162, "1", "A democracy elects its leaders."),
    run(644, 135, "3", "2."),
    run(644, 162, "2", "<b>Economic Systems</b>"),
    run(666, 149, "4", "\u2022"),
    run(666, 162, "1", "A market economy leaves it to the market."),
  ]),
);

assert.strictEqual(
  (tight.match(/^\d+\. /gm) ?? []).length,
  2,
  `both items keep their number with no spacer runs to lean on:\n${tight}`,
);
assert.ok(
  /^ +- A democracy elects its leaders\./m.test(tight),
  `the child must nest on its MARKER column, since its text column matches its parent's:\n${tight}`,
);

console.log("ok  a scan is refused; bold keeps its spaces; a list nests by its marker column");
