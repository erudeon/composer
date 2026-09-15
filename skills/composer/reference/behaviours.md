# What the machine does that no schema states

`content_guide` is generated from the schemas the write path validates against, so it is the authority on
every SHAPE: a block's props, a question's fields, the manifest, the caps. **Ask it, never remember it.**

This file carries the other kind of knowledge: what the platform DOES. None of it is in a schema, and
several of these behaviours are destructive in a way that reports success: the write returns OK, the read
back agrees with what you sent, and content is gone anyway. Those are the ones to read twice.

## A body write is a whole-array replace

The manifest describes the whole body, so **anything it leaves out is deleted**. Omitting `blocks`
entirely is safe and touches nothing. A PARTIAL `blocks` array is destructive. **The two differ by one
optional key**, which is the whole danger: a partial array looks like a smaller edit and is a deletion.

To repair one lecture, send the COMPLETE intended array with the version you read back. That is a
compare-and-swap on a whole known-good body, and it is the safe way to use replace semantics. To place a
single block, use the edit door, which names the blocks it touches.

Never split one lecture across several imports. Each apply replaces the whole body, so the second one
removes what the first wrote.

## The three keys on a plan

- **`blocksRemoved`**: what applying will delete. **Absent when nothing is lost**, so its absence is the
  good news, and its presence is a stop.
- **`blocksUnknown`**: a stored body that could not be parsed, so what the write destroys is unknown.
  **It is not a report of zero**, and the write is planned anyway.
- **`orderNotApplied`**: the reading order was declined because the file does not name every lecture.

**Reading order is a statement about the whole course.** A manifest naming fewer lectures than the course
holds does not reorder it. Before this was true, a one-lecture apply lifted that lecture to position
zero, twice, on two courses, on one day.

## An apply answers per operation, never per outcome

That a lecture was written is not that the body stored is the body you sent. Those came apart once. Only
`verify` closes that gap: it diffs the stored course against the same file.

TWO DIFFERENT REFUSALS, and conflating them is how a course gets re-uploaded onto itself. A manifest
carrying a lint ERROR is refused whole, before the first write. An apply that gets PAST the lint is
**not atomic**: it answers per operation, so a lecture refused for a bad block names itself and the
ones after it still land. An author who reads "3 operations refused" as "nothing was written" and
re-runs is re-running against a course that already changed.

## Which doors are safe to retry

- `content_lesson` `append` is idempotent on block id and answers whether it had already applied. Safe.
- A rate-limited call is refused before any write. Safe.
- **Almost nothing else is. Re-running a create makes a second row.**

## The rate limit is keyed on the credential

Sixty calls a minute, on the CREDENTIAL and not the worker, and it **fails closed**: when its backing
store is unavailable the call is refused rather than allowed. Four workers on one connection share one
budget, so parallelism divides throughput. Eight parallel agents once exhausted a session and six died
mid-write, leaving five units half uploaded. **For an MCP-bound job the fix is always fewer calls.**

## Only prose is checked verbatim, and that is a feature

Callouts, tables, term blocks and worked examples are free-form. So you copy the author's sentences
exactly where it matters and are free to restructure the same facts into a table, a callout or a
checkpoint, which is where the value is added. An agent that does not know this either pastes walls of
prose or rewrites prose and gets refused. Both happened on one run.

**What the comparison forgives**, before you fight it: the whole dash family folds to a space, so a
comma, colon or semicolon is a safe substitute for an em dash. It folds ellipses and curly quotes, drops
trailing punctuation, strips emphasis marks, rejoins a hyphen broken across a line, collapses whitespace,
lowercases, and unescapes a backslash before ASCII punctuation. **It does not strip a literal bullet**,
and a footer spliced mid-sentence breaks a match that is otherwise a perfect copy, which is why the
normaliser runs first. Very short units are skipped entirely.

A bullet that reaches the source of record now is one the AUTHOR typed, not scaffolding: the extractor
writes Word's own numbering as `-` and `1.`. It used to write a literal `•`, which made this warning fire
on 111 of 134 real documents and mean nothing.

## The two glossary doors disagree

The two glossary doors name the definition field differently, and both schemas are strict, so carrying
one door's spelling to the other is refused rather than silently wrong. Read the shape from
`content_guide` for whichever door you are using.


## Publishing cascades

It carries every lecture, bank and paper with it, **which silently reverses a deliberate withdrawal**. If
a unit was withdrawn on purpose, a course-level publish puts it back. There is a lecture-level door for a
single fix; use it for a mid-block repair.

It refuses while a lecture would open blank. **There is an optional flag that turns that refusal off.
Never pass it.** A refusal means a unit has no body, and shipping a stub to students is not a thing this
pipeline does quietly.

## Things that waste an hour

- A rename moves the URL segment, so anything converging on the slug stops matching and creates a second
  lecture beside the first. Pin the slug when renaming.
- A summary block repeated across two lectures can be refused as a duplicate. The plan names the rule
  and both block ids; do not guess the threshold.
- Nested lists survive. Several paragraphs in one list item do not.
- An unknown field now names the fields that object accepts. Read the error rather than guessing.
- Never run a shell one-liner with a backslash in the payload: a double-quoted string eats one level, so
  the script runs against text that is not what you typed. Twice on one run a fix reported success and
  changed nothing. Write a file.

## Nested emphasis becomes a literal asterisk

**This dialect stores ONE mark per span.** A nested marker has no spelling, so `***both***`, or a bold
inside an italic, is stored as text and the student reads the asterisks. Use `**bold**` or `*italic*`,
never both. **Hundreds shipped before this rule existed.**

The extractor can produce it on its own: Word marks a run bold AND italic and the naive spelling is
`***word***`. Check the source of record for a triple marker before you build from it.

## Every question carries a key, or the bank is write-once

**Give every question a `key`, and the manifest becomes a repair path.** A key is the author's own
handle, unique within the bank, and it is what an apply converges on: a declared key that already exists
is UPDATED in place, one that does not is CREATED, and a stored question the file does not name is left
alone and reported. Re-sending an unchanged file is a no-op, as it is everywhere else here.

**ALL OR NONE, ON BOTH SIDES.** The apply converges only when every question in the FILE carries a key
AND every question already in the BANK does. Either half unkeyed and it declines the whole bank and says
so: an unkeyed row cannot be matched, so converging would create a second copy rather than update it.

**A course loaded before keys existed therefore stays write-once until its bank is keyed.** Read it back
with `content_read` `list_questions` `detail: "full"`, add keys, and send it through
`exercises_questions` `bulk_update` once. Ask `content_guide` `questions` for the field's spelling.

## Nothing is ever deleted by an import

A question carries a student's attempt history and an item-total correlation, so an import never removes
one: a bank you shortened keeps everything you dropped. Removing a question is a deliberate
`exercises_questions` `bulk_delete`. **A save never deletes a term either**: a glossary row written the
wrong way round is removed with `content_glossary` `delete`, on purpose, or not at all.

An agent that assumes the manifest is the whole truth will re-send a shortened bank, expect the extras
to go, and not understand why the course still shows them.

## A shrink has a backstop, and it is not the plan

A body write that shortens the block array is refused unless you send `confirmShrink: true`. **That is a
seatbelt, not a route.** Meeting it means the array you built is shorter than the one stored, which is
the deletion this file opens by warning about. Go and find out why before you reach for the flag.

## Prices are safe and do not need escaping

"the $1 group paid $20" survives the serializer. A dollar in prose is prose. Verify against the write
path before working around a delimiter: defensive escaping across an economics or accounting summary
rewrites text that was already correct, and prose is the one thing checked word for word.

## A read-back is not a manifest

`formula` blocks and worked-example answers carrying a caret do not round-trip canonically yet, so a
plan built from a read-back may name a lecture as rewritten that you never touched. **Read the plan's
"lectures rewritten" line before applying.** On a repair run this is the difference between real damage
and an artefact of the comparison.

## If you must run in parallel, run about five

Fanning out is the wrong instinct here and the rate limit is keyed on the credential, so workers share
one budget. Where somebody does it anyway: about five, and check the session budget first. Eight
parallel upload agents were tried once and six died mid-write.

## Punctuation comes back with a backslash, and that is correct

Rich text is written PLAIN and stored ESCAPED. A literal `|`, `[`, `]`, `*`, `~` or `$` in prose comes
back from a read with a backslash in front of it.

**That is not damage and it is not something to fix.** The backslash is what stops the character opening
a table column, or a mark, the next time the text is parsed. Strip it and the text is wrong the moment
anything reads it again.

So: never pre-escape on the way in, and never correct one on the way out. An audit that diffs stored
text against what was sent will see these and must let them be. A pass that "cleans them up" rewrites
every lecture in a course and breaks each one.

## A long lecture is several calls, and a shorter lecture is better

A body too large for one request goes in through `content_lesson` `append`, which is idempotent on
block id, so a call repeated after a lost reply changes nothing. There is no lecture too long to load.

But length is a teaching decision before it is a transport one. **Mastery is tracked per lecture**, so a
lecture carrying two units of material gives a student one number for both and no way to see which half
they have. Where a lecture is long enough to need several calls, ask whether it is really two.

## Never renumber a course that runs two series

`content_catalog` `renumber_topics` resets every lecture's number to its POSITION in the course. On a
course with one run of lectures that is a repair. On a course with two named runs it is destruction:
Problem 1 and Lecture 1 both exist on purpose, numbers are per series, and the reading order is the
array rather than the numbers. Running it collapses both runs into one sequence and there is no undo.

