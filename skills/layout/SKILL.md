---
name: layout
description: Phase 3. Set the course itself up correctly, then turn the text into lectures, sections, tables, worked examples, charts, practice questions, the glossary and MOCK EXAM PAPERS, and send it, one lecture first so it can be looked at before the rest follow. Use when the Composer's state says Phase 3 Layout, and whenever somebody asks how their course will LOOK or BEHAVE on the page, whether a graph will be interactive, how something renders on a phone, wants it built or sent or pushed, wants any of these MADE or PLACED: a chart, a graph, a table, a callout, a worked example, the glossary, practice questions, a question bank, a mock exam or a past paper. Also when they ask where a picture will go, or what a course is named and which teaching period it sits in. A question about whether something already built is any GOOD is Audit's, not this.
---

# Phase 3 · Layout

The edited source of record becomes blocks. **Nothing is written by you**: the prose is the author's, and
what you are deciding is which block carries which piece of it.

Layouting and auditing are different acts. Layouting chooses the right block; auditing checks whether
something is right. A paragraph that renders as a full empty page is a composition failure, and it is
fixed by choosing a different block here, not by nudging the reader afterwards.

## Ask the server what a block takes. Do not remember it.

**Every content tool takes ONE parameter, `request`, with the real arguments nested inside it.** A flat
call is refused. Ask only for what this course needs:

```
content_guide {"request":{"op":"manifest"}}
content_guide {"request":{"op":"blocks","type":["chart","table","callout"]}}
content_guide {"request":{"op":"questions"}}
content_guide {"request":{"op":"glossary"}}
```

Add `{"request":{"op":"maths"}}` **only for a course with equations in it**. The tool is split by op so
a lecture on social psychology does not pay for the delimiter rule, and asking for all of them spends
the saving the split exists to create.

What comes back is generated from the schemas the write path validates against, so it is the authority
on every shape, prop, label and cap. None of those is written down in this plugin.

**Check which box answered**, once, before the first write: `get_my_context`, reading
`server.deployment` AND `server.commit`. Two deployments run the same build and resolve to the same
role, so a write to the wrong one succeeds, reads back correct, and never appears where it was meant
to. **It is a check, not a sentence**: if it does not say production, stop and tell the author you
cannot reach pass the year right now.

## Step 0. The course itself, and it is verified before a word of teaching goes up

**Set the course up correctly before you upload any lecture or teaching material.** A course is a row
before it is a syllabus, and every lecture hangs off that row. Getting it wrong is not a cosmetic
problem you fix later: a rename re-derives the address and takes every link with it, and the container
word is stored on the COURSE, so it is one word for the whole thing.

`taxonomy` `tree` gives the programme CODE a manifest names. `content_catalog` `create_course` makes the
row if there is none. **Nothing later creates it for you**, and nothing later checks it either.

Five things have to be right, and they were all settled in Intake:

| | Why it is not cosmetic |
| --- | --- |
| **Title** | What a student reads in the catalogue, and the source of the slug in every link |
| **Programme** | A course belongs to exactly one, and moving it later is refused while it is placed |
| **Period** | The block or term it is taught in. The manifest carries it, so a load sets it without a second call; `course_schedule` is the repair path and lists what a programme actually has. A period from another programme is refused outright, so a wrong one is a wrong course, not a wrong label |
| **Container word** | `topicTerm`, one word for the course. It is what every count says: "5 weeks", "5 problem sets" |
| **Unit order and numbers** | Reading order is a statement about the whole course. Changing it later renames, renumbers and reorders live rows |

**Then READ THE ROW BACK and show the author what it says**, in one line each: title, programme,
period, container word, address. Not what you sent. What is stored.

**Stop there and get a yes.** This is the last cheap moment. After the first lecture is written, every
one of these five costs a migration of live rows instead of one call.

A course whose shell is wrong looks completely fine on its own page, which is why nothing downstream
ever catches it: every later check compares a lecture against its source, and the source says nothing
about which programme the course belongs to.

## The order, and the two commands that make it cheap

**0. Check you can reach the Hub before anything long starts.**

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/credential.mjs" status
```

It asks nobody anything and answers at once. If it says a click is needed, get it NOW, while the author
is still at the keyboard, rather than forty figures into an upload.

**1. Figures first.** A manifest carries no bytes and a storage key cannot be predicted, so the pictures
go up before the file that references them. `images.mjs` sends a whole folder in one go, and
`content_upload_image` is the door for a single picture added later. Write `figures.json` beside the
images, then:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/images.mjs" figures.json --course <courseId>
```

It answers a file-name-to-markdown map. **Substitute it for the `[FIGURE:word/media/imageN.png]` markers
the source of record carries**, verbatim, and never rebuild that markdown from the key: a key is minted
per environment and per course, and one typed by hand paints nothing.

The map is keyed on the file's BASENAME (`image1.png`) and the marker names it from the work directory
(`word/media/image1.png`), so match on the basename. `build-manifest.mjs` REFUSES a manifest still
holding a marker, naming every one: left in, it is drawn on the page as literal text, and the verbatim
check agrees with it because the marker is in the source of record too.

**2. Build the course file with `build-manifest.mjs`.** Not by emitting it into a tool call: that costs
its whole length in tokens twice, and every re-emission can corrupt text this upload exists to
reproduce exactly.

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/build-manifest.mjs" <course folder> --unit 1
```

**You do not write a parser per course.** The rules for turning a document into blocks are the same for
every summary ever written, and written out again per course they drift: the second course silently
loses whatever the first learned. This script carries the rules; the course folder carries only what no
amount of reading the text can produce.

**What it derives, for any course**: the unit boundaries, the section tree, prose blocks and where they
split, examples and whether one is stepped, worked-example steps and their labels, tables and their
kind, lists of named rules, folded headings and what they lead, the author's emoji flags and which
callout each becomes, and where a defining equation wants a formula block.

**What `<course folder>/course-data.mjs` supplies**, keyed by unit number, because the document cannot
give it up: `CHARTS` (somebody has to LOOK at the drawing, and a plausible wrong curve renders
perfectly and teaches something false), `QUESTIONS`, `GLOSSARY`, `FORMULA_TERMS` (the gloss per symbol),
`TERMS`, `CHECKS`, `EXTRA`, `REPAIRS` (a passage whose layout did not survive Word), and
`CALLOUT_TITLES`. A unit with nothing supplied still builds.

**It runs the checks the server will run**, before the round trip: a paragraph that is not in the
source, a prose block still holding a table or an example, a prose block ending on a bold line, and a
duplicate block id.

**Three scripts sit either side of it, and every one of them exists because a course needed it.** They
take the course folder as their argument, the same way, and none of them is optional on a real summary.

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/promote-headings.mjs" <course folder>
node "${CLAUDE_PLUGIN_ROOT}/scripts/build-manifest.mjs"   <course folder>
node "${CLAUDE_PLUGIN_ROOT}/scripts/apply-blocks.mjs"     <course folder>
node "${CLAUDE_PLUGIN_ROOT}/scripts/slice.mjs"            <course folder> 1 2 3
```

- **`promote-headings.mjs`** turns the author's own bold lines and Word styles into headings, from a
  `headings.json` in the course folder. A summary whose only heading level is the lecture title derives
  ZERO sections without it, and one written with the author's styles keeps the number they typed unless
  this strips it.
- **`apply-blocks.mjs`** places what no pass can derive, from a `unit-blocks.mjs` in the course folder:
  a markdown table that is really a journal entry, a display line that is really a formula, a run of
  calculation lines that is really a worked example. Its ops find their anchor by EXACT STRING and fail
  loudly rather than guess, which is what saves you when the builder's behaviour moves underneath a
  half-finished course.
- **`slice.mjs`** writes `04-manifest/slice.json` holding only the units named. **Send that, not the
  manifest**: the manifest carries every unit the document has, a body write is a whole-array REPLACE,
  and sending a unit that was never built publishes the converter's raw tables over nothing.

**Put each unit's slice on the lecture as `source`.** It is the text Intake extracted, and it is what
every fidelity rule diffs the headings, prose and numbers against.

**3. Nothing goes up still drawn by hand.** `push.mjs --apply` runs `handcraft-check.mjs` over the
final file and refuses to send while anything is found. It is the only check in this pipeline that does
not ask whether the write path will ACCEPT the file: it will accept a journal entry drawn as a pipe
table, a question asked in a paragraph, and an answer pointing at a footnote, because all three are
valid blocks. They are simply not the blocks the author's material is made of.

It reads the manifest and names the block and the element it should be:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/handcraft-check.mjs" 04-manifest/manifest.json
```

**It exists because an AUTHOR caught it twice**, on a lecture that was already on the site. On one
accounting course it found 43: forty entries still drawn as grids, an exercise asked inside an example
box, and a sentence telling the reader the answer was at the bottom of a page that has no bottom.

**3b. Plan, then apply, then verify.**

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/push.mjs" manifest.json            # plans, writes nothing
node "${CLAUDE_PLUGIN_ROOT}/scripts/push.mjs" manifest.json --apply
node "${CLAUDE_PLUGIN_ROOT}/scripts/push.mjs" manifest.json --verify
```

**If it says nothing here can reach the Hub, that is one click and it is done for good.** Run it,
with a five minute timeout because a person has to press a button:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/credential.mjs" login
```

Their own browser opens on the Hub and asks them to approve the Composer. Tell them to look for the
window, and that it is once, not once a session. Then run the push again. It renews itself from then
on, and they are only asked again if a month goes by with no upload or they revoke it themselves.

If they cannot approve it at all, `content_import` over the MCP does the same job and needs no
credential. It costs the length of the course in tokens, which is a real cost and a better one than a
stalled upload. Say which door you used.

**Keep what you sent.** After each plan and each apply:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/workspace.mjs" snapshot "<course>" manifest.json reply.json plan
```

It files both under `04-manifest/versions` with one timestamp. The pair is the only durable evidence of
what a course was at a moment, and it is what a session next week reads instead of guessing.

**Read `blocksRemoved`, `blocksUnknown` and `orderNotApplied` on the plan before applying.** The reply
explains each in its own words. Their absence is the good news; `blocksRemoved` appearing is a stop.

**A refused apply is not an untouched course.** A manifest carrying a lint error is refused whole before
anything is written. An apply that gets past the lint is **not** atomic: it answers per operation, so a
lecture refused for a bad block names itself and the ones after it still land. Re-send the whole
corrected file; everything that already landed is a no-op the second time.

## One unit, then stop

Build unit 1. Apply it. Verify it. Show the author, report, and **wait**. On their word, build the
rest without further questions and report once.

**A unit holding a drawing parked as `later` is refused, and the refusal is the point.** Intake may
close on one unit at a time, which is what makes a first sitting an hour rather than an afternoon; the
price is that reaching a parked unit means going back to Intake for its pictures first. Check the
inventory for a `later` under any heading in the unit you are about to build, and say which ones rather
than building around them.

## The shape of a unit

Prose is verbatim; everything else is yours to place. Only prose is checked word for word, which is the
point: copy the author's sentences exactly where it matters, and restructure the same facts into a table
or a callout where that teaches better.

### The author may have already told you

Look for `<!-- style: ... -->` in the slice. Those are the styles the AUTHOR created in Word, written
out by `docx.js`, and each one marks the paragraph under it:

```
<!-- style: In Short -->

The recap paragraph.
```

**Believe them over your own reading.** `Example`, `In Short`, `not-prose` and whatever else a template
carries are the author saying what a paragraph is for, and that is better evidence than anything you can
infer from the sentences. Ask `content_guide` what each one may become on the page; the marker gives you
the intent, not the element name.

**The NAME may say nothing, so the course says it instead.** A Hungarian Word calls its styles
`Stilus1`..`Stilus4`, and one real summary used `Stilus1` above all 60 of its worked examples. Map the
name to what the author meant in `STYLES` in `course-data.mjs`, per course, because nothing else can
know. Today one meaning is acted on, `example`, which makes the paragraph under it an example where the
author put it.

**A style nobody claims is DROPPED, never drawn.** A marker is metadata and a reader must never see one:
left in the text it does not vanish for being a comment, it lands inside a prose block and is printed.
211 of them across one course's sixteen lectures.

A paragraph marked `not-prose` is not the author's prose and must not go into a prose block.

### A lesson starts at heading 2

**Inside a lesson the headings are `##` and `###`. Never `#`.**

The unit's own top-level heading IS the lesson: it becomes the topic's title and never appears again as
a block. A `#` inside the body puts a second document title halfway down the page, competing with the
one the reader already draws from the topic.

So the document's own levels shift down by one on the way in: the source's `#` is the lesson title, its
`##` are the sections, its `###` the subsections. Anything deeper than `###` is a paragraph with a bold
lead, not a heading: the reader's outline stops at three and a `####` is invisible in it.

The extractor does NOT do this shift. `docx.js` reports the document's real levels, because that is how
you find where one unit stops and the next starts. The shift is yours, here, when a unit becomes blocks.

```
prose            the section heading and its paragraphs, one block per subsection
callout          the source's own short example, lifted out of the paragraph
chart            the figure this section draws, from the expression the text gives
table            the section's rule set
question         2 to 5 pinned, at the end of the section they test
worked-example   the computation the source works through
callout          the closer, last
```

Which callout kind, what a chart takes, and what the closer is called all come from `content_guide`.

### Anything the reader has a block FOR leaves the prose

**This is the check that decides whether a lecture looks built or dumped**, and every line of it was
written after a real course went up and came back. A prose block is for the author's PARAGRAPHS. When a
passage is one of the shapes below, it becomes that block and stops being prose:

| In the source | Becomes | What it looks like left in prose |
| --- | --- | --- |
| `**Example**: ...`, whether a paragraph or a bullet | an `example` callout | a sentence no different from the ones around it, and the reader never sees an example on the page |
| an example with `**Step 1:** ...` in it | a `worked-example` | a wall of bold numbers and boxed equations, with no reveal and no answer |
| a markdown table | a `table` block | a markdown grid whose every cell draws its own boxed equation |
| three or more `- **Name**: <formula>` | a `definitions` table | a column of bold words each trailing a display line |
| a display equation a student must KNOW | a `formula` block | a bare equation, with the symbols explained in a sentence somewhere below it |
| a closing section headed `In Short`, `Summary` or `Recap` | an `in-short` callout | one more section of the lecture, reading exactly like the teaching before it, when its whole job is to look different to somebody revising |

**A step's label NAMES THE MOVE, and the author usually wrote it.** `**Step 4 (Step 1 again):** Divide
the leading term by...` carries both: the number, which the reader forbids in a label, and the move,
which is exactly what a label is. Strip the number and keep their sentence.

**A table cell takes INLINE maths.** A `$$...$$` that came out of a Word table renders as a boxed
equation inside the cell, one per cell, and the table becomes unreadable. Convert to `$...$` on the way
in.

**Two callouts of the same kind may not touch.** Where the author wrote two examples as two bullets of
one list, that is ONE callout holding both, and every lead-in inside it is stripped, not just the first.

**A formula block is drawn WHERE ITS DISPLAY LINE ALREADY SITS**, never appended to the end of the
section. Every other authored block can follow its section; this one replaces a line in the middle of
one, and the paragraph after it usually says "This limit gives..." about the equation directly above.

**Only the equations a student is expected to know.** The reader's own test: a formula with nothing to
explain is a display line in the prose. Three in a first calculus lecture is right; thirty is a lecture
that has stopped distinguishing.

**A flag under a folded heading keeps its flag, and the heading becomes the callout's title.** Merging
the heading into the flagged sentence first swallows the flag, and an exam tip the author marked as
examined goes in as an ordinary paragraph, taking its equation with it.

**A lead-in whose content became another block goes WITH it.** A bold line introducing a table, left in
the prose after the table is lifted out, is a heading with nothing under it and a block boundary
beneath that: on the page it reads as a bold line, a wide gap, and then a table that looks unrelated.
Put it in the caption and take it out of the prose. No prose block should ever END on a bold line.

**An example runs until the next example or the next folded heading.** Not until the next paragraph
that does not look like maths: this document opens its longest worked example with a fraction and a
sentence of intent before its first step, and a run that stopped there turned the most important example
in the lecture into a callout holding one fraction. Look AHEAD for a step before deciding.


**A graph is drawn from the source's expression, never from points read off a picture.** Where the text
gives no expression, say so in the chart's title and make it schematic.

## The two numbers this plugin sets

Everything else about questions and glossary terms comes from the server. These two are ours:

- **Twenty practice questions a unit** in the bank, and **one inline question block at the end of each
  section**, drawing from it.
- **Eight to fifteen glossary terms a unit.** Twenty is the ceiling and the lint warns above it.

**A target is not a quota to fill by inventing.** Copy the source's questions; author new ones only
where a unit has clearly too few, and SAY that you did. A source that prints no questions for its
lectures is a content decision, not a gap to fill quietly. Nineteen invented questions to reach twenty
is the failure this whole plugin exists to prevent, wearing the costume of thoroughness.

## A lecture may carry a subtitle

One line under the title, for what the lecture covers when the title alone does not say. It is the
cheapest thing in the manifest and the one most often left out, and on a contents page of twelve
lectures it is the difference between a list somebody scans and a list they read.

## Give every question a key

Without keys the bank is write-once: a second apply creates a duplicate of every question instead of
updating it. The rule and the recovery for a bank that has none are in
`${CLAUDE_PLUGIN_ROOT}/skills/composer/reference/behaviours.md`; read it before building a bank.

## Block ids are the anchor, so they are derived and never positional

**A block id is what reading progress and every deep link point at.** Derive it from the source, so it
survives an insert: `t3-sec-003`, not `block-7`. A positional id moves the moment a block is added
above it, and takes every student's place in the lecture and every shared link with it.

## A published lecture's address does not move

A lecture's address is derived from its title, so correcting a typo in a PUBLISHED title MOVES it: the
old lecture is left on the course as an orphan no import ever deletes, and every link anybody already
holds breaks. Pin it in `SLUGS` in `course-data.mjs` before changing the words, and the plan will say
`update-topic` rather than `create-topic`. Check that it does.

## Practice questions and mock exams are different things

A lecture's `questions` fill its practice bank. A mock exam PAPER lives in the manifest's `exams` and
has a bank of its own. **A paper is always MCQ and carries no bytes**; a DOCUMENT paper's PDF is
attached in the Hub.

**A PAPER CARRIES ITS OWN QUESTIONS.** They are not pinned by key out of a lecture's bank: a question
that sat in both would be written twice, once by the lecture and once by the paper. `build-manifest.mjs`
refuses that outright rather than letting it through.

**A MANIFEST CANNOT NAME A MULTI-PART GROUP.** It can OPEN one, by sending `group.stem` on a question,
but a `group.id` of your own is refused at APPLY with "Question group not found" and the PLAN does not
catch it, because the plan never resolves ids. Attaching the later parts needs a second pass through
`exercises_questions`, which is a different door.

So in a file-loaded course, write a run the way the real papers write one: repeat the shared setup in
each part, opening the later ones with "Recall that...". Every question then stands on its own, which a
drawn sitting needs anyway, since it takes questions independently and a part that only made sense
beside its siblings arrives alone and unreadable.

**A paper's questions are OPEN_ENDED where the real sitting is.** A bank of multiple choice is right for
practice and wrong for a mock: a student who has only ever picked from four options has not practised
the thing being examined. Give each one the marking scheme the paper itself would publish, so they can
mark their own answer the way the grader will. Every positive criterion is worth 1 or 2 points and they
must sum to the question's points; a repeatable negative one deducts for a minor mistake and sits
outside that sum, and a scheme only counts on an OPEN_ENDED question: every other type drops the field
on the way in. `content:lint` refuses a scheme that breaks any of this, offline, before the push.

"Upload everything except the mock exams" means the standalone PAPERS. The questions embedded in each
unit are PRACTICE QUESTIONS and always get built. Reading it the other way skips every bank in the
course.

## Dated sittings are not mock exams either

The real exam dates are `course.assessments`, each with a kind and a `startsAt`. One is a date on a
calendar, the other is practice. A course published without its sittings loses the countdown the
product is organised around. Ask `content_guide` for the field names.

## A course's files are the other half of the load

Formula sheets, past papers and handouts reach a student as downloadable materials through
`content_materials`, not as blocks. A manifest carries no bytes, so nothing about a clean apply tells
you they are missing.

## The credential is theirs, and you never go looking for another

`node "${CLAUDE_PLUGIN_ROOT}/scripts/credential.mjs" login` opens the author's own browser and they
approve it once. It is scoped to what they can already reach, it is kept on their machine and nowhere
else, and it renews itself without asking again. `status` says whether anything is needed; `forget`
removes it.

**Nothing about this is theirs to type.** They never see a token, never copy one and never open a
terminal. If you find yourself about to ask an author to paste a secret to you, that is the bug.

A hand-minted token is the exception, for a machine with no browser to open. `credential.mjs` prints
where to make one, for whichever deployment is being written to. Do not write that address down here:
it is derived, and a copy of it in a skill is a copy that rots.

**If nothing works, stop and ask.** Do not search the machine, the repository, a password store or
another service's configuration for something that might work. **Two uploads have been lost to an agent
chasing this route: one posted an unrelated service's credential to this API, and one printed a third
into a transcript**, where it stayed. Never echo a token, never paste one into a tool call, and never
put one in a file this plugin writes.

## Never fan out

The rate limit is keyed on the credential, not the worker, so four workers share one budget and
parallelism divides throughput. For an MCP-bound job the fix is always fewer calls, never more workers.

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
