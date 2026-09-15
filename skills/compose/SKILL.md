---
name: compose
description: Phase 2. Make the short list of mechanical corrections a converted document needs and nothing more, leaving the author's own words exactly as they wrote them, and asking before any change of meaning. It REMOVES things, which is what separates it from the Audit that only reports them. Use when the Composer's state says Phase 2 Compose, and whenever somebody wants something in a summary fixed, cleaned, tidied, corrected or TAKEN OUT, wants old branding or logos removed, asks about headings that are really paragraphs, asks whether their writing will be edited, or asks what happens to a mistake in the source.
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

   **And restore the spaces a multi-word name lost.** Maths mode ignores an ordinary space, so
   `Share Capital` is drawn as "ShareCapital" and `Depreciation Expense` as "DepreciationExpense".
   Nothing refuses it: it parses, it stores, it renders, and it is wrong on the page in a way that
   reads as the author's own typo. Word causes it, by recording a typed space between two maths runs
   as presentation, which is why the SAME equation can carry one welded name and one intact phrase.
   **41 of 56 equations in the first accounting summary carried one**, across every lecture, and the
   only reason it was caught is that somebody read one. `katex-check.js` reports them as `welded`:

   ```
   node "${CLAUDE_PLUGIN_ROOT}/scripts/fix-maths-spacing.mjs" <source-of-record.md>
   ```

   It touches nothing but those spaces: not one inside `\text{}`, where the space is already real, and
   not one that ends a control word, where it is load-bearing. Re-run `katex-check.js` afterwards and
   `welded` must be 0.

5. **Fold every shape drawn over the text** into the block it annotated, and delete the shape.
6. **Collapse a duplicated picture** to one reference.

7. **A heading that is really a paragraph.** An author applies a heading style to a body paragraph and
   Word records it as one, so four hundred words arrive behind a `###`. The write path then refuses the
   lecture twice, for a heading at a depth the outline does not have and for a section that opens onto
   nothing, and neither message names the cause. Drop the marker, keep every word. `normalise.js`
   counts them: a heading over 120 characters is one. **Eleven of 134 real summaries carry one.**
8. **A heading deeper than `###`.** The reader's outline is a section and a subsection and nothing else.
   Fold it into the section above, or make it a bold lead-in on the paragraph it introduces, which keeps
   the author's own emphasis without inventing a section. `normalise.js` counts these too. **Twenty-five
   of 134 carry one**, and one summary carries 38.

   **ON the paragraph, not above it.** A folded heading left standing as its own bold line reads as a
   heading with nothing under it, and the paragraph gap beneath it looks like a mistake on the page.
   Join it to the sentence it introduces. Three things cannot take a lead-in and keep their own line: a
   list, a table row, and a display equation. Neither can a line that is itself emphasised, and that one
   bites: joining a bold aside to the `**Step 2:**` under it swallowed three steps of a worked example
   into the note of the step before, and the block still rendered, three moves short.

   **Do the merge where every other transformation happens: over the WHOLE unit, before it is sliced.**
   Merging when the blocks are cut produces prose that is a perfect copy of text the source does not
   contain, and the verbatim check refuses it, correctly.

9. **A heading that is an equation.** A display formula standing where a title should be. Keep the
   formula as the formula it is and give the section a short title the source supports. If the source
   gives no words for it, that is a line to ask about rather than one to invent.

**Split or merge nothing.** The unit boundaries are the file's own until the course manual says
otherwise. A structure the professor did not use means students cannot find their materials, and that
costs trust which is not cheap to rebuild.

### Three of those nine are not a script, and must never be reported as one

Three of them need eyes rather than a pass. Retyping an equation that was a picture needs somebody to **read the picture**. Folding a shape needs the
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
ones the author confirms. Leave the rest as open lines.

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
