---
name: audit
description: Phase 4. Run every check on a built course that needs no person: what the write path itself refuses, whether the text still matches the source, leftover branding, whether the equations came through right, and whether the glossary and practice questions hold up. Use when the Composer's state says Phase 4 Audit, once a course has just been sent, and whenever somebody asks if a course is correct, wants it checked or reviewed or proofed, or asks what could still be wrong before students see it.
---

# Phase 4 · Audit

Confirm it. **If a check needs no human it belongs here**, and every check is tagged `software` or `ai`,
because the two are built and paid for differently: software checking is the way CI does it, with no
model involved.

Because the source of record exists verbatim before the first block is written, this pipeline can do
something no ad-hoc upload can: **lint the unit against its own source.**

## In

Every unit as applied on production, with its `source` attached, and the findings list.

## The seven families, in this order

**1. Write path, `software`.** Every LaTeX string validated by KaTeX in strict mode at write and refused
rather than rendered red. The plan's lint. `verify`, the diff of what is stored against what was sent.
The question lint, for option letters in stems and missing explanations. Block ids stable.

**2. Source lint, `software`.** Every heading, prose block and number in a chart or table must appear in
the unit's `source`. A unit without a source applies and is reported **unchecked**, which is worse than a
refusal because it reads green.

**3. Residue, `software`.** A grep of the course for the old brand's name and products, an em dash, an
emoji, a heading with no text, an equation in a heading, and **a literal asterisk in anything a student
reads**. This dialect stores one mark per span, so a nested marker is not emphasis: it is punctuation
the reader sees. Hundreds shipped before anybody looked.

**4. Transcription fidelity, `ai`.** The equations the converter flagged, read back against the original
rendering: fractions, limits under a sum, cases, absolute-value bars, and every one that was a picture.
A formula that came out wrong looks exactly like one that came out right, which is why this family is not
a diff.

**5. The media inventory was worked off, `software`.** Every drawing has a disposition and every
disposition was carried out. **This is the family that catches the two things no text diff can see**: a
symbol that was a picture, and one that lived in a floating text box. The text matches either way, so
checking the text proves nothing about them.

**6. Glossary and practice, `software` and `ai`.** Terms correct, within range, every definition
standing alone. Questions technically clean, every one with an explanation, answerable from the unit,
answers right and grammatical, safe under shuffling.

**7. Read it as a student, `ai`.** Open each unit and read it the way somebody revising would, then
check it against the SOURCE. Take the unit's own summary box, which names the concepts that unit
teaches, and confirm the body actually contains them.

**This is the only family that can catch a unit whose manifest was short in the same way its body
was.** Every other family here is a diff: against the source, against what was sent, against the
inventory. A section that never made it into the manifest is absent from both sides of every one of
those comparisons, so they all read clean. Two units of one course were missing sections their own
summaries referenced and no block count could see it.

## Every substantive edit is audited against its reason

A passage marked as edited in the source of record must have a line on the findings list with a `why`.
**One without is a failure of this phase**, whatever the passage says. This is the only check that
polices the author rather than the file.

## What you may fix, and what you may not

**Fix what the write path refused and re-apply.** That is mechanical and it is yours.

**Touch no substantive line.** A wrong sign is the author's call, with a reason on the record. A gap is
published as a gap or left. Ask nothing: every decision in this phase is already made, and the ones that
are not become findings.

## Educational quality ranks last here, and that is deliberate

Whether the bullet points belong where they are, whether there are enough examples, whether the journey
is clear: for a pre-written summary **the pedagogy was the author's call and the fidelity is ours**. Say
what you see, put it on the list, and do not rewrite the author's teaching.

## What this phase cannot do yet

Whether a chart's expression reproduces the picture it replaced is a **visual** check. It is named here
so it moves here when the visual pipeline exists, and until then a person does it in Student View. Do not
claim it in the report.

## Gate

All seven families ran, and what each caught is on the findings list. The phase does not close because the list
is short; it closes because every family ran.

## Report

```
Phase 4 · Audit · done
Did: seven families over <n> units; fixed <m> write-path refusals and re-applied
Gate: met, or not met because ...
Findings: +n, by class
Next: Phase 5 · Student View, waiting on: the reviewer
```
