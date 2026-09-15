# The three phases that are not built

Intake, Convert, Compose, Layout, Audit and Publish each have a skill. These three do not, and the
reason is the same in all three cases: **each needs something that does not exist yet.** They are
written down so the shape is not lost and so nobody improvises them.

**If a run reaches one of these, say it is not built and say what is missing.** Do not invent it.

---

## Phase 1 · Analyze · machine only · conditional

**NOT BUILT.** It needs past exams with their answer keys in the folder. Where they exist this phase is worth building next, because the coverage map is what tells Layout where the worked examples and the exam-tip callouts belong. Without it, Layout places them by the file's own emphasis and Student View's gap line is empty by construction rather than by inspection.

Reverse-engineer the exams against the material, to find where the exam's weight falls and where the
material is silent.

**Runs when** past exams are in the folder and no current analysis exists, or the one that exists is a
year out of date. **Skipped when** there are no past exams to work against, or a current analysis and
coverage map already exist. **The skip is a line on the findings list with its reason**, so the course
status still says which phases it went through.

**Out:** an analysis as an HTML file (HTML because it can carry pictures and be shared with a person),
and the **coverage map**: every past-exam question mapped to the section that teaches it or to _not
covered_, and every formula-sheet item mapped to where the material defines it or to _not defined_.

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

## Phase 5 · Student View · a second person

**NOT BUILT, and closer than it was.** It needs a reviewer and a link, and the LINK is now half built: the platform can mint a signed credential good for one course's draft, so the thing that used to be impossible is not. What is missing is the other half, and it is two pieces of work rather than a design question: the reader has to accept that credential, and one MCP op has to hand it out.

Until both land there is still no link a current student of the course can be sent, so the author reads their own work, which this phase says explicitly not to rely on. **Do not improvise around it**: a preview link invented here is a URL that does not open.

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
author in one message with a recommendation each.

**And write the rubric.** Every observation that a check could have caught goes into `rubric.md` in the
course folder, naming the observation and the course it came from. An entry that has fired on three
courses graduates into an Audit check. Without that, this phase is a permanent human checkpoint that
merely claims it will retire.

---

## Phase 7 · Observe · sensors

**NOT BUILT, and it is one door away.** Its one machine sensor, the student-facing content report, is built and running on the platform, already gated, already read by the Hub. Nothing over MCP reads it, so this plugin cannot. That is a single read op over a function that exists, not a phase that needs designing. The rest of the phase is people, not sessions. What a run CAN do is hand over: the findings list's accepted lines are the watch list, and the closing report says so.

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
