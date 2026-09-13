---
name: layout
description: Phase 3 of the Composer. Turn a source of record into a course manifest and apply it to a draft course on production - blocks, charts, worked examples, practice questions and a glossary - one unit first, then the rest. Use when the Composer's state says Phase 3 Layout, when building or pushing a manifest, when a unit needs laying out into blocks, or when figures need uploading before a course is written.
---

# Phase 3 · Layout

The edited source of record becomes blocks. **Nothing is written by you**: the prose is the author's,
and what you are deciding is which block carries which piece of it.

Layouting and auditing are different acts. Layouting chooses the right block for a piece of content;
auditing checks whether something is right. A paragraph that renders as a full empty page is a
composition failure, and it is fixed by choosing a different block here, not by nudging the reader
afterwards.

## Before the first byte

**Call `content_guide` now, in this session.** Not from memory of an earlier one.

```
content_guide {"op":"overview"}                                  the order of operations
content_guide {"op":"manifest"}                                  the manifest's shape and its caps
content_guide {"op":"blocks","type":["chart","formula","worked-example","table","callout"]}
content_guide {"op":"questions"}                                 the question shape and its labels
content_guide {"op":"glossary"}                                  the glossary contract
content_guide {"op":"maths"}                                     the maths rules
```

It is generated from the schemas the write path validates against, so it cannot drift on shapes. **This
skill deliberately contains no prop table, no lint rule name and no tool signature**: if you find one
here, it is a bug, and the fix is to delete it and call the tool.

**Confirm which hub answered.** `get_my_context`, reading `server.deployment` AND `server.commit`, and
say both in one line. A write sent to the wrong hub succeeds, reads back correct, and never appears on
the site you meant.

**The course must exist.** `taxonomy` `tree` lists every study and year with its programme CODE; a
manifest names the code, so a load needs no resolve. If there is no course row yet, `content_catalog`
creates one. Nothing later in this phase creates it for you.

## The order, and why it is this order

**1. Figures first, before the manifest.** A manifest carries no bytes, and a storage key is minted per
environment and per course and cannot be predicted. So the figures go up, the markdown that comes back is
substituted into the manifest, and only then is the manifest pushed. **Never rebuild that markdown from
the key.**

Write `figures.json` beside the images and hand the operator the upload. Fifty files and 20 MB a request.
base64 through the one-picture tool is model output: a real course of figures runs to millions of tokens,
so that door is for a repair.

**2. Build the manifest as a FILE, with a script.** A manifest emitted into a tool call costs its whole
length in tokens twice, and every re-emission is a chance to corrupt text the upload exists to reproduce
exactly. **The model writes the parser; the parser writes the course.** For a maths course this is the
difference between a run that finishes and one that stalls.

**Put each unit's slice back on the lecture as `source`.** It is the author's own extracted text and it
is what every fidelity rule diffs each heading, prose block and number against. A lecture without one
applies and is reported unchecked.

**3. Plan.** `content_import` `plan` writes nothing. Read three keys before applying:

- **`blocksRemoved`** — blocks the lectures hold now that this file does not carry, so applying deletes
  them. **This is the one that catches a manifest which silently drops content a published lecture already
  holds.** It is absent when nothing is lost, so its absence is the good news and its presence is a
  stop.
- **`blocksUnknown`** — a stored body that could not be parsed, so what the write destroys is unknown.
  **Not a report of zero**, and the write is planned anyway.
- **`orderNotApplied`** — the reading order was declined because the file does not name every lecture.

**4. Apply, then verify.** An apply answers per operation: that a lecture was written, never that the
body stored is the body you sent. Those came apart once already. `verify` diffs the stored course against
the same file and is the only thing that closes the gate.

An apply refuses **atomically**: one bad block in unit 7 refuses units 1 to 20 and answers "nothing was
written". An earlier successful apply still stands. Say so in the report, because an operator reading
"nothing was written" after a good unit-1 run will reasonably believe they lost it.

## One unit, then stop

Build unit 1. Apply it. Verify it. Show the operator, report, and **wait**. On their word, build the rest
without further questions and report once.

The first unit is the pattern, not a sample. Every platform surprise was first visible in the first unit
of a course that then had ten more built against a wrong assumption.

## The shape of a unit

The prose is verbatim and everything else is yours to place. **Only prose is checked word for word**,
which is the point: you copy the author's sentences exactly where it matters, and you are free to
restructure the same facts into a table, a callout or a checkpoint, which is where the value is added.

```
prose            ## Section 1, with its introduction        verbatim
prose            ### 1.1                                     verbatim, one block per ###
callout example  the source's short example, lifted out
chart            the one-curve figure this section draws
table            the section's rule set
question         2 to 5 pinned, at the end of the section they test
worked-example   the computation the source works through
callout in-short Smartly summarised                          always last
```

A graph is a chart drawn **from the source's expression, never from points read off a picture**. Where
the text gives no expression, the chart says so in its title and is schematic. Where a picture carried
pen, the pen becomes a marker or a label.

## The numbers

Twenty practice questions a unit in the bank, every one keyed, labelled by the thinking it asks for, with
a rationale on each wrong option and no "option A" in any stem, because the reader shuffles. One inline
question block at the end of each section, drawing from the bank. Eight to fifteen glossary terms a unit,
twenty the ceiling.

**Key every question or none.** A bank converges on the key: a declared key that exists is updated in
place, one that does not is created. That needs every question keyed on both sides, in the file and
already in the bank, or the whole bank is declined.

## Gate

`verify` matches for every unit. No block resolves to nothing. **Unit 1 was accepted before unit 2 was
built.**

## Report

```
Phase 3 · Layout · done
Did: <n> units applied, <m> figures uploaded, verify matched
Gate: met, or not met because ...
Findings: +n, by class
Next: Phase 4 · Audit, starting now
```
