---
name: intake
description: Phase 0 of the Composer. Prove a course's materials are present and are what they claim to be, give every drawing a disposition, settle the six structure questions, and open the findings list. Use when starting a course, when materials have just arrived, when checking whether files are complete or the right ones, or when the Composer's state says Phase 0 Intake.
---

# Phase 0 · Intake

Prove we hold what this course needs, and write down what is wrong with it. **Nothing is written to the
platform in this phase**, and nothing is converted here either: that is the `convert` skill, which this
phase calls and then takes the result of.

What is wrong with a file is knowable on the first day. It must not be discovered on the last.

## 0. Make the workspace

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/workspace.mjs" init "<course name>"
```

Safe to re-run, and a resumed session starts here: it prints the paths and touches nothing that exists.
It makes one folder per course under `~/Documents/Composer`, numbered in the pipeline's own order, and
**`01-inputs` is the one folder nothing else ever writes to**, because every check downstream compares
what was built against what is in there.

The operator puts the materials in `01-inputs`. Everything after this is written beside them, never
over them.

## 1. Check every file is what it claims to be

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/intake/preflight.js" <file> ...
```

**Read every `!` before parsing a word.** Each check is a defect that has shipped or nearly shipped a
course. **Markdown and `.docx` are accepted. PDF is refused as a source.**

Then ask what the files actually are:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/identify.mjs" <folder> --all
```

This reads the bytes against `formats/registry.json`, the catalogue of every kind of file this pipeline
has met: what it is for in a university, how to handle it, and what has already gone wrong with it. It
matches more than one kind per file on purpose, because a document is a Word file AND a document with
equations AND a document about money, and each of those carries its own warning. **A file it does not
recognise is reported by name and is a request to add an entry, never a reason to guess.**

Two findings from it change what you do, and both look ordinary: a `.pdf` whose bytes are a Word file is
usable and its name is a lie in the useful direction, and a `.docx` whose bytes are a PDF or a
photograph is not a document at all. Both have sat in live course folders.

Run it on every NEW file, not just the first. One engagement lost hours to a lecture source that held a
different course's content entirely, found only when somebody extracted the text. **Grep the extract for
a word the course must contain and a word it must not.** And if a source is missing or wrong twice, go
and look for it: the right file has sat in a Downloads folder for hours while people theorised.

## 2. Fill the checklist

Five items, in order of how much they matter:

1. **The course manual.** Without it we do not know what we are doing.
2. **Past exams, with answer keys.** Without them we do not know if we are exam-oriented.
3. **Teaching materials**: slides, tutorials, the formula sheet.
4. **What the cohort thinks.** Their frustrations, who they compare us to, what they say. This is not
   slack: it is the understanding of the specific customers in this cohort, and it is why the item exists.
5. **The summary**, as the file it came in.

Mark each present, partial or missing. **A missing item does not block the phases that follow.** It goes
on the findings list and blocks Publish until somebody accepts it in writing.

## 3. Convert

Hand off to the `convert` skill. It returns the source of record and the media inventory.

## 4. Give every drawing a disposition

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/propose-dispositions.mjs" <media-inventory.json> <source-of-record.txt>
```

It pairs each drawing with the text around it and PROPOSES, quoting the evidence: a chart where the
prose states a function of x, a figure for a surface, a fold for a shape or a text box, and UNCERTAIN
where it found nothing. **It exits non-zero while anything is uncertain**, because that is a thing a
person must look at.

**Look at those pictures.** You can see them: they are files under `02-source/work/word/media`. Open the
uncertain ones, read the prose beside them, and decide. Then present the proposals to the operator as
GROUPS, in one message, with a recommendation each. Seventy-nine drawings becomes about five decisions,
and not one of them is a guess.

Exactly one disposition each, and the class decides it.

| The drawing is | Disposition |
| --- | --- |
| A graph of a function the text states | `chart`, drawn from the expression the text gives |
| A graph with pen annotation on it | `chart`: what the pen pointed at becomes part of the chart, nothing is kept as pixels |
| A 3D surface | `figure`, regenerated with alt text naming the function |
| An equation pasted as a picture | `retype` as LaTeX |
| A shape drawn over the text: a circle, an arrow, a floating equation box | `fold`: dropped, and what it said goes into the block it annotated |
| A duplicate of an earlier picture | one chart, referenced twice |
| Old branding: a cover, marketing | `drop` |

**A crop from a book, a slide, Chegg or the web is NEVER uploaded.** It is redrawn from the function the
text gives. Reproducing images from books and lectures risks the institutional relationship, which is the
one failure that costs more than a bad course. Transform rather than copy.

**Provenance is a finding, not a footnote.** A file rarely says who wrote it or for which year. Each
unattributed drawing is a line on the findings list; the writer and the year stay open unless somebody
knows. An alt text that still reads like a homework-help site is a screenshot, not a figure.

## 5. Open the findings list

`findings.json` in the course folder. Its format is
`${CLAUDE_PLUGIN_ROOT}/skills/composer/reference/findings-format.md`. Read it once and follow it
exactly, because the Publish gate parses this file.

## 6. Ask the six structure questions

In ONE message, with a recommendation each. They are the operator's and nobody else's, and asking them
later is expensive: renaming a unit re-derives its address, a title renders **as authored**, and
changing the reading order later means renaming, renumbering and reordering live rows.

1. **The container word.** What is a teaching unit called here: Lecture, Week, Chapter, Theme? **And
   does each series have its own?** Crossing the two is what puts "Unit 1: Theme 1: ..." on a screen.
2. **Structure.** One series of units, or two? **And do the lectures follow the themes, or interleave
   with them?** The second half decides the reading order of the whole course.
3. **Numbering.** One run, or a number per series? Two lectures may show the same number only across
   NAMED series, which is what a series is for. It is enforced, so an answer here is not cosmetic: two
   courses went in front of students with colliding lecture numbers.
4. **The title.** Does it repeat its number, or omit it?
5. **House style beyond the mechanical edits.** Em dashes and heading numbers are removed without
   asking. Subtitles, capitalisation and title format are not, and nobody else decides them. **This is
   the most expensive question to ask late**: on one course it arrived after three banks were written
   and cost 124 questions deleted one at a time, about 29 per cent of that upload's token budget.
6. **Practice questions or mock exams?** They are different things and both get called "exam questions".
   A mock exam is a standalone PAPER; the questions embedded in each unit are PRACTICE QUESTIONS and
   always get built. "Upload everything except the mock exams" means the papers. Reading it the other
   way skips every bank in the course.

Record the answers in `composer.json` under `gates.structureAnswered`. **The phase does not close without
them**, because the state script checks for them by name.

## And one thing to REPORT rather than ask

**Is there an EN and an NL pair?** Two languages of one course are two courses sharing a slug, which
changes course creation, file naming and the whole plan. It is visible in the materials, so read it off
them and say so. Discovering it at Layout is a rebuild.

## Gate

Every checklist item has a state. **Every drawing has a disposition.** The structure questions are
answered and recorded. A source of record exists.

## Report

```
Phase 0 · Intake · done
Did: <n> files checked, <m> drawings dispositioned, structure settled
Gate: met, or not met because ...
Findings: +n, by class
Next: Phase 2 · Compose, starting now
```
