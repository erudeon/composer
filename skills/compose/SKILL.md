---
name: compose
description: Phase 2 of the Composer. Make the finite list of mechanical changes a converted document needs, and no others, keeping the author's prose exactly as written and recording every substantive edit with its reason. Use when the Composer's state says Phase 2 Compose, when a source of record needs cleaning before layout, or when somebody wants to fix something in a summary.
---

# Phase 2 · Compose

Make the changes the file needs, and none of the changes it does not. **The source of record is edited,
not the course**, and nothing here is written to the platform.

**Skipped when** the file arrived clean: no old branding, no equation as a picture, no shapes over the
text, no duplicates, no empty headings, and nothing substantive on the findings list. Record the skip
with its reason, so the course still says which phases it went through.

## The mechanical edits, made without asking

1. **Strip the old branding**: cover, note to the reader, links, marketing, footer. **The prose stays.**
2. **Remove em dashes, and strip a number from a heading.** Do not do this by hand:
   `scripts/intake/lib.js` exports `stripEmDashes` and `stripHeadingNumber`, and it is marker-aware.
   Three separate corruption bugs in one upload came from a cleanup that matched across emphasis
   markers, and this is the version that survived them.
3. **Delete empty headings, and emoji in headings.** Keep en dashes and every other character.
4. **Retype every equation that was pasted as a picture**, as LaTeX.
5. **Fold every shape drawn over the text** into the block it annotated, and delete the shape.
6. **Collapse a duplicated picture** to one reference.

**Split or merge nothing.** The unit boundaries are the file's own until the course manual says
otherwise. A structure the professor did not use means students cannot find their materials, and that
costs trust which is not cheap to rebuild.

### Three of those six are not a script, and must never be reported as one

Retyping an equation that was a picture needs somebody to **read the picture**. Folding a shape needs the
shape, which the text extract never contained. Collapsing a duplicate needs the media inventory. All
three depend on Intake's inventory, and a script reporting them clean would be hiding exactly the two
defects no text diff can see: a symbol that was a picture, and one that lived in a floating text box.

Do them from the inventory, one entry at a time, and say in the report that you did.

## What a substantive edit is, and is not

**It is:** a wrong sign, a wrong answer, a definition the exams use differently. **Certain, and small**,
made with the reason written on the findings list. **Mark the edited passage** so Audit and the reviewer
can tell it from the original.

**It is not:** a gap the coverage map found, which is published as a gap. A passage that reads badly,
which is the author's. A topic the professor has since changed, which is Observe's.

**When you are not certain, the line stays open and the passage stays as written.** Prose is the
author's, verbatim, typos included.

Ask about every substantive candidate **once**, in one message, with a recommendation each. Make the
ones the operator confirms. Leave the rest as open lines.

## Gate

Every mechanical line done, or recorded as needing the inventory. Every substantive line has its reason
or is explicitly left open. The source of record carries no em dash, no numbered heading and no old
branding.

## Report

```
Phase 2 · Compose · done
Did: <n> mechanical edits, <m> substantive with reasons, <k> left open
Gate: met, or not met because ...
Findings: +n, by class
Next: Phase 3 · Layout, starting now
```
