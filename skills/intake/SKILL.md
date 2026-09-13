---
name: intake
description: Phase 0 of the Composer. Collect what there is, convert a Word summary into a source of record with its maths as LaTeX, inventory every drawing so each gets a disposition, and open the findings list. Use this when starting a course, when a summary or materials have just arrived, when a document needs converting or checking before anything is written, or when the Composer's state says Phase 0 Intake.
---

# Phase 0 · Intake

Collect what there is, convert what arrived, and write down what is wrong with the file. **Nothing is
written to the platform in this phase.**

The phase exists to prove we hold every material the course needs and to surface the gap at once if we
do not, and to make a form every later phase can check against. What is wrong with a file is known on
the first day. It must not be discovered on the last.

## Out

- The checklist, every item marked present, partial or missing.
- **The source of record**: one text-and-LaTeX file per teaching unit, produced by a program.
- **The media inventory**: every drawing with a class and exactly one disposition.
- The findings list, opened.
- The course structure as the file carries it, with the four structure questions answered.

## Gate

Every checklist item has a state. Every drawing has a disposition. The structure questions are answered
and recorded. A missing checklist item does **not** block the phases that follow: it goes on the findings
list and blocks Publish until somebody accepts it in writing.

## The run order

**1. Preflight every file, every time.**

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/intake/preflight.js" <file> ...
```

Read every `!` before parsing a word. Every check in it is a defect that has already shipped or nearly
shipped a course: two of four files on one upload were PDFs wearing a `.docx`; a fifth stopped at page 80
of 96 and said so only in its own running footer. **Markdown and `.docx` are accepted. PDF is refused as
a source.**

Run it on every NEW file too, not only the first. One engagement lost hours to a Hoorcollege source that
was Social Psychology content in a Personality Psychology file, found only when somebody extracted the
text. **Grep the extract for a word the course must contain and a word it must not.** And if a source is
missing or wrong twice, go and look: the correct file sat in the operator's Downloads folder for hours
because nobody checked.

**2. Open the summary and inventory its drawings.**

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/intake/open-docx.js" <summary.docx> <work-dir>
```

This unzips the document, refuses anything that is not really a zip, and writes `media-inventory.json`:
every picture, floating text box and drawn shape, in document order, each with the heading it falls
under. **Every entry comes out with `disposition: null`,** because choosing between the five is a
judgement about a drawing in its place and a script that guessed would be making the one call this phase
exists to keep honest.

**3. Convert the text.**

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/intake/docx.js" <work-dir>/word/document.xml <work-dir>/source.txt
node "${CLAUDE_PLUGIN_ROOT}/scripts/intake/normalise.js" <work-dir>/source.txt <work-dir>/source-of-record.txt
node "${CLAUDE_PLUGIN_ROOT}/scripts/intake/katex-check.js" <work-dir>/source-of-record.txt
```

**The converter is a program, not you.** A maths summary carries over a thousand equation objects;
retyping them through a model is where errors and tokens both come from. `omml.js` turns Word's own
equations into LaTeX, which is the thing `python-docx` and `mammoth` silently drop. The KaTeX check runs
the reader's exact strict options over every `$…$`, so a refusal is met with the equation in front of you
rather than inside an apply of a 300 KB course.

**The raw file stays what you diff against.** `normalise.js` fixes encoding, page furniture, soft hyphens
and backslash escapes in the one order that works, and refuses a file that is still corrupt after both
encodings rather than cleaning around a replacement character.

**4. Slice the source per teaching unit** and write one file per unit. A single 85,000-token document
read by twenty workers is 1.7 million tokens of the same text.

**5. Open the findings list.** `findings.json` in the course folder. The format is
`reference/findings-format.md`; read it once and follow it exactly, because the Publish gate parses it.

**6. Ask the four structure questions, in ONE message, with a recommendation each.**

They are the operator's and nobody else's, and asking them later is expensive: renaming a unit
re-derives its address, and a title renders **as authored** because nothing composes it from the series
and number.

1. What is a teaching unit called here: Lecture, Week, Chapter, Theme?
2. One series of units, or two?
3. How are they numbered: one run, or a number per series?
4. Does the title repeat its number, or omit it?

## The dispositions

Five, and exactly one per drawing. The class decides the disposition.

| The drawing is | Disposition | It becomes |
| --- | --- | --- |
| A clean graph of a function the text states | `chart` drawn from the expression, with a domain, and a slider where the text varies a constant | a chart |
| A graph with pen annotation on it | `chart`: the pen becomes markers and labels, nothing is kept as pixels | a chart |
| A 3D surface | `figure`, regenerated with alt text naming the function. There is no 3D chart in the reader | a figure |
| An equation pasted as a picture | `retype` as LaTeX, validated on write | a formula |
| A shape drawn over the text: a circle, an arrow, a floating equation box | `fold`: dropped, and what it said goes into the block it annotated | prose or a formula |
| A duplicate of an earlier picture | one chart, referenced twice | a chart |
| Old branding: a cover, marketing | `drop` | nothing |

**A crop from a book, a slide, Chegg or the web is NEVER uploaded.** It is redrawn from the function the
text gives. Reproducing images from books and lectures risks the institutional relationship, which is the
one failure that costs more than a bad course. Transform rather than copy.

**Prefer a chart outright wherever the values are recoverable.** A plot given as data or as a formula
costs no bytes, reflows, themes, and is searchable by its title. A picture of the same plot is none of
those.

## Provenance is a finding, not a footnote

A file rarely says who wrote it or for which year. Each unattributed drawing is a line on the findings
list with its disposition; the writer and the year are two lines that stay open unless somebody knows.
An alt text that still begins "Solved Assume that the product function" is a Chegg screenshot and is a
finding, not a figure.

## What the cohort thinks is collected here too

It is checklist item four and it is not slack. Intake does not only give us course data, it gives us the
understanding of the specific customers in that cohort, which is why the item exists and why a missing
one is recorded rather than dropped.

## Report

```
Phase 0 · Intake · done
Did: converted <n> units, inventoried <m> drawings, opened the findings list
Gate: met, or not met because ...
Findings: +n, by class
Next: Phase 1 · Analyze, starting now
```
