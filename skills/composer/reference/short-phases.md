# The five phases that are short

Intake, Layout and Audit have skills of their own because each carries enough material to be worth
loading on demand. These five do not: each is a page, and five more skills would be five more documents
to keep consistent for no gain.

---

## Phase 1 · Analyze · machine only · conditional

Reverse-engineer the exams against the material, to find where the exam's weight falls and where the
material is silent.

**Runs when** past exams are in the folder and no current analysis exists, or the one that exists is a
year out of date. **Skipped when** there are no past exams to work against, or a current analysis and
coverage map already exist. **The skip is a line on the findings list with its reason**, so the course
status still says which phases it went through.

**Out:** an analysis as an HTML file (HTML because it can carry pictures and be shared with a person),
and the **coverage map**: every past-exam question mapped to the section that teaches it or to *not
covered*, and every formula-sheet item mapped to where the material defines it or to *not defined*.

**Every gap the map finds goes on the findings list as a gap, marked as a gap and not as a task.**

**Analyze finds; it never fixes.** A topic the exams test and the material does not cover is published as
a gap or left. It is not written in. This is the one place the temptation lives and the one place the
rule is absolute: a claim the author did not make does not belong in their course, however well it reads.

**Before Layout, not after.** The coverage map tells Layout where the worked examples and the exam-tip
callouts go. Laying out first and analysing second places them by feel.

**Where a course has a coach**, the coach reads the coverage map before Layout and adds what they know as
lines on the findings list. That is the whole of the human half here, and it is optional.

**Skipping has two consequences, and both are silent unless you say them.** Layout places exam-tip
callouts by the file's own emphasis only, and Student View's gap line is empty by construction rather
than by inspection.

---

## Phase 2 · Compose · the operator, on the record · conditional

Make the finite list of changes the file needs, and none of the changes it does not. **The source of
record is edited, not the course.**

**Skipped when** the file arrived clean: no old branding, no equation as a picture, no shapes over the
text, no duplicates, no empty headings, and nothing substantive on the list.

### The mechanical edits, which are made without asking

1. Strip the old branding: cover, note to the reader, links, marketing, footer. **The prose stays.**
2. Remove em dashes, and strip a number from a heading. Keep en dashes and every other character.
   **Do not do this by hand.** `scripts/intake/lib.js` exports `stripEmDashes` and
   `stripHeadingNumber`, and it is marker-aware: three separate corruption bugs in one upload came from
   a cleanup that matched across emphasis markers, and this is the version that survived them.
3. Delete empty headings, and emoji in headings.
4. Retype every equation that was pasted as a picture, as LaTeX.
5. Fold every shape drawn over the text into the block it annotated, and delete the shape.
6. Collapse a duplicated picture to one reference.

**Split or merge nothing.** The unit boundaries are the file's own until the course manual says
otherwise. If we introduce a structure the professor did not use, students will not know where to look,
and that costs trust that is not cheap to rebuild.

**Three of those six cannot be a script, and must never be reported as done by one.** Retyping an
equation that was a picture needs somebody to read the picture. Folding a shape needs the shape, which
the text extract never contained. Collapsing a duplicate needs the media inventory. All three depend on
Intake's inventory, and a script that reported them clean would be hiding exactly the two defects no text
diff can see.

### What a substantive edit is, and is not

**Is:** a wrong sign, a wrong answer, a definition the exams use differently. Certain, small, and made
with the reason on the findings list. **Mark the edited passage**, so Audit and the reviewer can tell it
from the original.

**Is not:** a gap the coverage map found (that is published as a gap); a passage that reads badly (that
is the author's); a topic the professor has since changed (that is Observe's, not this phase's).

**When the operator is not certain, the line stays open and the passage stays as written.**

### Gate

Every mechanical line done. Every substantive line has its reason or is explicitly left open. The source
of record contains no em dash, no numbered heading and no old branding.

---

## Phase 5 · Student View · a second person

The reviewer opens the course and reads it as a student. **The reviewer is not the person who laid it
out**, and where we have one they are a current student of the course, because the summary was written by
students for students and that is who can say whether it reads right.

**This phase is designed to delete itself. Its real product is the rubric**, not a corrected course.

### The list, so observations are comparable across courses

1. Prose verbatim: paragraphs picked at random, read against the original file.
2. Every equation renders: none red, none as a picture, none missing where the file has one.
3. Every graph is interactive where its function is known, and a figure with honest alt text where it is
   not. Each looks like what it replaced.
4. No residue of the old brand, no em dash, no emoji, no empty heading, no equation in a heading.
5. The heading structure is the file's, and the sections listed are the ones the author meant.
6. Questions: answerable from the unit, an explanation each, safe under shuffling.
7. Glossary: within range, every definition standing alone, marked in the text on click.
8. The closer is there, and the unit opens without a blank block.
9. Every substantive edit reads as its reason says.
10. Every gap from the coverage map is either visible to the student or accepted as not shown.

### What comes back

Turn it into lines on the findings list. Fix the mechanical ones and re-verify. Bring the rest to the
operator in one message with a recommendation each.

**And write the rubric.** Every observation that a check could have caught goes into `rubric.md` in the
course folder, naming the observation and the course it came from. An entry that has fired on three
courses graduates into an Audit check. Without that, this phase is a permanent human checkpoint that
merely claims it will retire.

---

## Phase 6 · Publish · one press

It was already on production. This makes it visible, and says so unambiguously.

**Gate:** every unit through Audit with a clean source lint. The findings list closed, or every open line
accepted in writing by the person pressing. And the publish door's own refusal on a lecture that would
open blank, which is never bypassed.

**Ask about the open lines once**, in one message, with a recommendation each: accept or hold. Then press
only on the word `publish` from the operator, and report the status in the platform's words with the
environment named.

**Read what the cascade will touch before pressing.** A course-level publish carries every lecture, bank
and paper with it and reverses a deliberate withdrawal.

**A missing input is accepted, not forgotten.** A course can reach this phase without its manual. It does
not reach the press without somebody writing on the findings list that the gap is known and accepted.

---

## Phase 7 · Observe · sensors

Not the session's phase. It is handed over.

The promise it protects: if something changes during the block, we fix it. A course is watched from the
day it is published to the day of the exam, and a pre-written summary meets the cohort already a year
old, so the sensors matter more here, not less.

**The sensors:** the in-app "something looks wrong" report, which is built and running; support; the
ambassadors who notice when something changed in the university's own system; the group chats we are in;
and the reviewer, who has now read the whole course once.

**Re-entry is at Compose**, as a substantive edit with its reason on the findings list.

**What the session hands over:** the findings list's accepted lines are the watch list, and the closing
report says so.
