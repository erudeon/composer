---
name: convert
description: Turn a Word document into a source of record - Markdown with the maths as LaTeX - and inventory every picture, text box and drawn shape in it so each can be given a disposition. Use when a .docx needs converting, when a summary has to become something a course can be built from, when equations or images need extracting from a document, or when the Composer's state says the source of record is missing.
---

# Convert

A document becomes two things: **the source of record**, which is the Markdown every later phase is
checked against, and **the media inventory**, which is every drawing in it waiting for a decision.

**You do not read the document and type out what it says.** A maths summary carries over a thousand
equation objects. Retyping those through a model is where both the errors and the token cost come from,
and an equation that came out wrong looks exactly like one that came out right. **The model writes the
parser; the parser writes the course.**

## The three commands

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/intake/open-docx.js"    <file.docx> <work-dir>
node "${CLAUDE_PLUGIN_ROOT}/scripts/intake/docx.js"         <work-dir>/word/document.xml <work-dir>/source.md
node "${CLAUDE_PLUGIN_ROOT}/scripts/intake/normalise.js"    <work-dir>/source.md <work-dir>/source-of-record.md
node "${CLAUDE_PLUGIN_ROOT}/scripts/intake/katex-check.js"  <work-dir>/source-of-record.md
```

**Use the same `<work-dir>` in all four.** The second reads what the first unzipped.

In a workspace, `<file.docx>` is in `01-inputs` and `<work-dir>` is `02-source/work`. The sliced units
go in `02-source` beside it. **Nothing is written back into `01-inputs`**: that folder is what every
fidelity rule compares against, and a source that can be edited in place makes a clean diff meaningless.

### What each one is for

**`open-docx.js`** unzips the document and writes `media-inventory.json`: every picture, floating text
box and drawn shape, in document order, each with the heading it falls under. It refuses a file whose
bytes are not a zip, whatever its extension says.

**`docx.js`** writes the body as **Markdown**: `#` headings, `-` and `1.` lists, real tables, and
Word's own equations as `$…$` LaTeX. That last part is the whole reason it exists: the common converters
drop `<m:oMath>` silently, so a maths document comes out looking clean and missing every formula.

It also writes out the styles the AUTHOR made, as `<!-- style: In Short -->` above the paragraph they
mark. Word flags those itself, and they are the author's own statement of what a paragraph is for:
Layout reads them instead of guessing. One real summary carries 37 of them.

The heading level comes from the style's `outlineLvl`, which is Word's own answer and does not depend on
what the style is called: a Hungarian Word names its heading styles `Cmsor1`, and reading the name finds
nothing while reading the outline level finds every one. **If it reports no headings it exits non-zero
and says so**, because a flattened document is otherwise indistinguishable from a flat one.

**`normalise.js`** fixes encoding, page furniture, soft hyphens and backslash escapes, in the one order
that works. It refuses a file still corrupt after both encodings rather than cleaning around a
replacement character, and it **exits non-zero when its report holds a line beginning `!`**. Read those
lines; do not route around them. **The raw file stays what you diff against.**

**`katex-check.js`** runs every `$…$` through the reader's exact strict options. A refusal is met here,
with the equation in front of you, instead of inside an apply of a 300 KB course.

## Two things that will bite

**A Google Docs export may have no heading styles at all.** Then there is nothing in the file saying
where a section starts. `docx.js` says so and stops; use `docx2.js` in its place, which ranks the
distinct font sizes above the body size into levels. **Then look at the result**: that is a guess about
typography, not a reading of structure.

**A `$` inside code is not a delimiter.** `katex-check.js` ignores fenced and inline code, because a
statistics summary full of R would otherwise be refused for `data$column`.

## When something about the document is strange

Ask what it is before arguing with it:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/identify.mjs" <file-or-folder> --all
```

It reads the bytes and prints every kind of file it recognises, what that kind is FOR, and what has
already gone wrong with it. A `.pdf` that is really a Word file, a summary carrying a pasted web page,
a document still under review: all of them look ordinary and none of them behaves ordinarily.
`docs/FIELD-GUIDE.md` is the same catalogue as a page to read.

## Then slice it

One file per teaching unit, named so the unit is obvious. A single 85,000-token document read by twenty
workers is 1.7 million tokens of the same text, and Layout attaches each unit's slice to its lecture as
the thing every fidelity rule checks against.

## The media inventory

Every entry comes out with `disposition: null`. **Choosing is the operator's**, made against the prose,
and it is Intake's gate rather than yours. Your job is that nothing is missing from the list.

Report the counts by kind, name anything that looks like a crop from a book or the web, and stop.

## Gate

A source of record exists, one file per unit. Every `$…$` in it passes the KaTeX check, or each refusal
is a line on the findings list. Every drawing in the document is in the inventory.

## Report

```
Convert · done
Did: <n> units, <m> equations, <k> drawings inventoried
Gate: met, or not met because ...
Findings: +n, by class
Next: back to Intake for the dispositions and the structure questions
```
