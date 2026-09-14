# What in the source means "reach for this"

`content_guide {"request":{"op":"blocks"}}` says what every element IS FOR, one line each, and with a
`type` it gives the exact props. **Read it. None of that is repeated here.**

What is here is the other direction: you are looking at a converted summary, and you have to decide what
each passage becomes. These are the triggers, written from the source side.

**The rule under all of them: reshape freely, invent nothing.** Every fact, number, study, year and
definition comes from the source. The prose stays the author's, word for word. What you are choosing is
the shape it arrives in.

---

## What is in here

- [A picture of a graph](#a-picture-of-a-graph)
  - [Every chart built from a picture is checked against that picture](#every-chart-built-from-a-picture-is-checked-against-that-picture)
- [A heading is a section, not a page break](#a-heading-is-a-section-not-a-page-break)
- [A passage of prose](#a-passage-of-prose)
- [A callout, and which one](#a-callout-and-which-one)
- [A worked computation](#a-worked-computation)
- [When the source does not decide it](#when-the-source-does-not-decide-it)
- [An accounting course has four elements nobody would guess](#an-accounting-course-has-four-elements-nobody-would-guess)
- [The glossary, and which door to use](#the-glossary-and-which-door-to-use)
  - [What qualifies as a term](#what-qualifies-as-a-term)
- [A question lives in a bank, not in a lesson](#a-question-lives-in-a-bank-not-in-a-lesson)
- [Where a block sits on the page, which is a choice you are making anyway](#where-a-block-sits-on-the-page-which-is-a-choice-you-are-making-anyway)
- [Practice questions, and the field most people never fill in](#practice-questions-and-the-field-most-people-never-fill-in)
## A picture of a graph

**The text states a function of x.** A `chart` with `fn` and a `domain`. This is the whole point: a plot
given as an expression costs no bytes, reflows, themes, is searchable by its title, and a student can
read values off it. A picture of the same plot is none of those.

**The text varies a constant** ("as m increases", "for different values of a"): add a `param`. The
student drags it and the curve redraws. This is the single most under-used thing in the reader, and it
turns a static illustration into the lesson.

**The picture marks a point** (a maximum, an intersection, an equilibrium): a `marker` with `guideX` and
`guideY`, which draws the dotted lines down to the axes and labels them. Where the source draws a
tangent, `tangent: true` on the marker rather than a second hand-made curve.

**The picture shades an area** (a surplus, an integral, a region between two curves): `regions`, naming
the curves. The area is computed, not drawn.

**The picture's whole lesson is a crossing that moves**: `whatIf` gives the student a line to drag with
each curve's crossing read off it. Use it where the crossing IS the lesson, not as decoration.

**The text gives no expression.** Do not invent one. A curve that looks right and is wrong is
indistinguishable from a correct one on the page, no check downstream can see it, and it will be wrong
in whichever direction seemed plausible. Two honest answers: a `figure` with alt text naming what it
shows, or a schematic `chart` with `ticks: false` and a title that says it is schematic.

**A surface in two variables.** A `figure`. The reader has no 3D chart.

**A crop from a book, a slide, a homework site or the web.** Never uploaded. Redrawn from the function
the text gives, or it is a finding.

### Every chart built from a picture is checked against that picture

Open the image. Compare it to the curve you wrote: the shape, where it crosses, where it turns, what is
labelled. **They have to match.** This is the one check the pipeline has never had, and it is possible
only because you can see. If they do not match, the expression is wrong or it was the wrong expression,
and the honest outcome is a figure.

---

## A heading is a section, not a page break

Every `##` is a numbered section the reader lists in its contents and links to, so **one heading per
idea**. Not one per screenful, and not one wherever the text felt long: the reader decides where pages
break, and a heading added to force one puts a phantom entry in the contents of every student's copy.

## A passage of prose

**A run of parallel items, one line each.** Bullets, inside the prose block. Not a table: a table for
three short parallel phrases is a heavier object than the thing it holds.

**A sequence where the order is the meaning** (first, then, finally; a procedure; steps of a proof).
An ordered list in the prose, or a `table` with `variant: "steps"` where each step has a rule beside it.
Order matters means ordered, and a reader cannot tell a sequence from a set if both are bullets.

**More than about seven parallel items**, or items with a second attribute each: a `table`. Pick the
`variant` honestly, because it decides what a phone does with it: `comparison` for two or more things
held against each other, `definitions` for term-and-meaning, `data` for numbers, `steps` for a procedure.

**A comparison the author made in sentences** ("whereas X is bounded, Y is not"): a `table` with
`variant: "comparison"`. This is the highest-value reshape in the whole pipeline, because prose hides a
comparison and a table shows it, and the facts are unchanged.

**A term and its meaning, inline in the prose.** A `:::definitions` fence in the prose block, one row per
line. That files the glossary row AND prints the definition where the lecture teaches the word. Ask
`content_guide` for the glossary contract before writing one.

---

## A callout, and which one

A page of undifferentiated notes skims as nothing, so the kind carries meaning. `content_guide` names
every variant; the triggers are:

**The source works an instance through to show the rule.** `example`. Lift it out of the paragraph so it
stops interrupting the argument, and leave the argument intact.

**The source explains what the thing MEANS, informally**, usually right after a definition ("in other
words", "intuitively", "you can think of this as"). `intuition`.

**A definition or result the rest of the unit leans on.** `key-concept`. Sparingly: if three things on a
page are key, none is.

**The source says the exam asks this**, or the coverage map says the exam's weight falls here, or the
original marked it (a target, a highlight, "note that this is examined"). `exam-tip`. **Never invent
one**: an exam tip nobody has evidence for is a claim the author did not make, and students weight it
heavily.

**The unit's closer.** A final `in-short` callout, once, last, titled **Smartly summarised**. What the
unit was about, in the author's terms.

It is a CALLOUT and never a prose heading, and the reason is worth knowing: every heading inside a prose
block has to appear in the source, and no source ends with a section called "Smartly summarised". Written
as prose it is refused; written as the callout it is, it closes the lecture the way the reader expects.

---

## A worked computation

**The source solves a problem in steps.** A `worked-example`, not prose, and not a table. Its steps carry
`formula`, `substitution` and `result` as separate fields, and **the substitution line is the one a stuck
student looks for** , the rule with this problem's actual numbers in it. Prose loses that distinction;
the block keeps it.

**Label each step by the move it makes**, never by its number. "Differentiate the numerator" tells a
reader where they are. "Step 3" tells them nothing, and the reader numbers them anyway.

**A `note` on a step** is for why the move is allowed, where that is not obvious. Plain words.

**One computation, one block.** Two problems in one worked-example is two worked-examples.

---

## When the source does not decide it

Ask. In one message, with a recommendation, at the start of the phase. Never quietly pick the shape that
was easiest to build: every one of these choices is visible to a student and none of them is recoverable
from the manifest afterwards.

---

## An accounting course has four elements nobody would guess

The reader has `journal-entry`, `t-account`, `trial-balance` and `accounting-equation`. A composer that
does not know they exist renders all four as tables, which loses the arithmetic the reader does for free
and the structure a student is being taught to recognise. **Ask `content_guide` for their props before
writing one.** These are the triggers, taken from a real accounting summary:

**A table headed Account Name / Debit / Credit**, with amounts in one column or the other. That is a
`journal-entry`, not a table. The real summary carries dozens, including correcting entries written as a
reversal followed by the correct entry, which is **two** journal entries and not one.

**An account drawn with debits on the left and credits on the right**, usually with a balance struck at
the bottom. A `t-account`. In a converted document this arrives as a two-column table and looks like
nothing in particular, so it is one of the easiest to miss.

**A list of every account with its balance, where the point is that the two sides agree.** A
`trial-balance`. The summary distinguishes unadjusted, adjusted and post-closing: they are the same
element at three moments, and the title carries which.

**Assets = Liabilities + Equity, or a transaction shown as keeping it level.** An `accounting-equation`.
Where the source walks a transaction through and shows the equation still balancing, that is the
element doing its job.

**But an `accounting-equation` needs an OPENING BALANCE, and most first-lecture examples have none.**
The element draws two bars from the transactions given, so a set of entries that nets to zero draws two
EMPTY bars, and a reader stepping through sees nothing move. A teaching example that opens by spending
cash the company was never given does exactly that: buying a computer for cash is one asset up and
another down, and so is buying stock, so both sides sit at zero until something is earned. **Add the
three sums before writing the block**, per side and per step, and if a step leaves both sides at zero
the example does not support this element. Put it where the source FUNDS the company first, which in a
bookkeeping course is the unit with the full ledger exercise rather than the one introducing debits and
credits. **Never add an opening entry the author did not write** to make the bars move.

**A financial statement's standard running order** (Revenue, less Cost of Goods Sold, Gross Profit, and
so on down to Net Income): a `table` with `variant: "steps"` or `data`, using `roles` to mark which rows
are subtotals and which is the total. The subtotals are the lesson, and an ordinary table hides them.

**Never invent an amount, an account name or a side.** A debit posted as a credit is a wrong answer that
renders perfectly, and it is the one error an accounting student will not forgive. If the source is
ambiguous about which account takes which side, that is a finding, not a judgement call.

## The glossary, and which door to use

**Both doors reach the reader.** Every term of a course is matched against the lecture text and marked
where it appears, whichever way it was filed. A glossary loaded as an array is not invisible, and any
advice saying otherwise is out of date: check `content_guide` `glossary` rather than trusting a memory
of this, including this paragraph.

**The array is the door for LOADING a course.** One list, applied a term at a time so a bad row refuses
only itself, with each term anchored to the lecture that introduces it. That anchor is what ranks a
term ahead of the others when its own lecture is marked up.

**The `:::definitions` fence inside a prose block is for where the lecture TEACHES the word** and the
reader should meet the definition in the flow of the text rather than by hovering. It files the same
row and prints the definition at that point. Use it for the handful a unit is built around, and the
array for the rest.

**A term is matched on its text, within the course.** Sending it twice updates it rather than adding a
second row, so a re-run converges. Re-anchoring a term to a different lecture moves it without losing
the row a student's flashcard progress is keyed on.

**A save never deletes.** Committing a lecture writes definitions and removes none, because another
lecture may define the same word and a student may hold flashcards against it. A row written the wrong
way round is removed deliberately, and that is permanent.

### What qualifies as a term

The glossary is not a word list beside the course: it IS the flashcard deck, the reader's clickable
definitions, and the only input to the recall dimension the engine measures. Every term is a card
somebody has to work through and a word underlined in their reading, so a glossary that defines
everything defines nothing. One course shipped 310 terms across eleven lectures, about 28 a unit, which
is every bolded phrase in its source.

**The test, and it is one question:** could a student be asked *what is X?* in an exam, and would the
answer need more than the sentence X appeared in?

**Include**

- A named concept, effect, theory, model, bias or method.
- A technical term whose meaning is not recoverable from the sentence around it.
- A word the course uses in a sense narrower than its everyday one.

**Leave in the prose**

- A word the source merely **bolded for stress**. These documents bold for emphasis as much as for
  vocabulary, and harvesting every bold run is how 310 happens.
- A description rather than a name. "The process of adapting to what others do" is what conformity
  MEANS, not a second term.
- A study, an author or a year. A citation is not a term.
- A phrase whose definition would only restate it. If the meaning is the words themselves, it teaches
  nothing.
- A second spelling or inflection of a term already there. Pick the form the course uses, keep one.

**And the definition has to stand alone.** A sentence lifted out of running prose usually does not: it
starts with "This", it ends mid-citation, or it only makes sense after the paragraph before it. If a
harvested sentence cannot be read cold, rewrite it as a definition or leave the term out. One upload
dropped eight terms for exactly this and was right to.

**How many.** Eight to fifteen a unit: the words a student would be expected to define from memory.
**Twenty is the ceiling and the lint warns above it.**

The reason is not tidiness. **A page shows at most six marked words**, the lecture's own first, then the
ones it introduces, then the rest. So a glossary far past the ceiling does not show a student more: it
shows the same six and buries the words that mattered under the ones that did not. Every term is also a
flashcard somebody has to work through, and the glossary is the only input to the recall the engine
measures. A glossary that defines everything defines nothing.

## A question lives in a bank, not in a lesson

A `question` block names ids and stores no content, so the question stays in the smart draw and in the
calibration. Inlining the text into a lesson body takes it out of both, silently.

**Set `labels`.** They say what thinking a question asks for and feed the adaptive draw. Nothing refuses
a question without them, and the selection quietly gets worse.

**A question block may pin BY KEY.** A key this file declares is resolved to the row at apply time,
which is what makes a manifest carrying pins portable: a row id is correct only on the environment that
minted it and paints nothing anywhere else.

## Where a block sits on the page, which is a choice you are making anyway

Every block takes two placement controls, and leaving them out is itself a decision: the block takes the
whole column and the text stops for it. That is right for the thing a reader must not skip and wrong for
the small aside they should read past.

**Reach for a narrow block beside the text** when the thing is a remark on the paragraph next to it: a
short intuition, a note, a small definition. The text keeps its flow and the aside sits in the margin
where the eye finds it without losing the line.

**Keep the full width** for anything a reader has to stop and work through: a worked example, a table of
any size, a chart, an equation they will copy out. Splitting a reader's attention across a formula and a
paragraph is how both get skimmed.

**On a phone every block is full width regardless.** So the narrow choice is a desktop refinement, never
the thing that makes a layout work. Build it so it reads on a phone first, then place for the desktop.

**A table says what each ROW is**, which is what makes an accounting table legible: an ordinary line, a
heading inside the table, a subtotal, a total. A trial balance whose total row is not marked as one is a
grid of numbers with the answer hidden in it. The same goes for marking the one row that matters, and
for how a steps table numbers itself.

**A figure may be written before its picture exists.** A draft lecture accepts a figure with no image and
a published one refuses it, so a unit can be laid out while the drawings are still being made. Nothing
publishes while one is still empty, which is the point: it is a placeholder that cannot be forgotten.

**Ask `content_guide` `blocks` for the exact spelling of any of this** before writing it. The names and
the ranges are generated from the schema the write path validates against, so they are right there and
nowhere else, including here.

## Practice questions, and the field most people never fill in

**Every wrong option can carry its own explanation**, shown the moment a student picks that option. It
is the single most useful thing in a question bank and it is optional, so it is usually empty.

Write one for every plausible wrong answer, and **name the confusion it rests on** rather than the fact
that it is wrong. "That is the balance sheet definition, not the income statement one" teaches. "That is
incorrect" tells somebody what they already worked out when the screen went red.

The question's own explanation is for why the RIGHT answer is right. The per-option ones are for why
each wrong one was tempting. They do different jobs and a bank with only the first is doing half of it.

**The reader shuffles the options on every attempt.** So an explanation that says "option A" points at
whichever option happens to be first that time. Name the option's WORDS instead. This is the single
most common defect in an imported bank and it is invisible until a student meets it.

**An accounting course can ask for the entry itself.** There is a question type where a student posts
the debits and credits against a chart of accounts, with more accounts offered than the answer uses,
and the decoys are the question. It beats a multiple choice about a transaction, because recording one
is the skill being examined. Amounts are whole minor units, so a cent is 1 and ten thousand is
1,000,000: a rounding mistake here is a wrong answer that renders perfectly.

**Say what thinking each question asks for.** The labels feed the draw that decides what a student sees
next, so a bank with none of them still works and adapts worse. There is a fixed vocabulary; ask
`content_guide` `questions` for it rather than inventing a word.

**A bank comes back in the registry's order, not the order you sent.** A read-back listing questions
differently is not a failed write, and treating it as one is how a clean bank gets rewritten.

**Ask `content_guide` `questions` before writing a bank.** Every type, every field and the label
vocabulary are generated from the schema the write path validates against.

