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

- **`blocksRemoved`** — what applying will delete. **Absent when nothing is lost**, so its absence is the
  good news, and its presence is a stop.
- **`blocksUnknown`** — a stored body that could not be parsed, so what the write destroys is unknown.
  **It is not a report of zero**, and the write is planned anyway.
- **`orderNotApplied`** — the reading order was declined because the file does not name every lecture.

**Reading order is a statement about the whole course.** A manifest naming fewer lectures than the course
holds does not reorder it. Before this was true, a one-lecture apply lifted that lecture to position
zero, twice, on two courses, on one day.

## An apply answers per operation, never per outcome

That a lecture was written is not that the body stored is the body you sent. Those came apart once. Only
`verify` closes that gap: it diffs the stored course against the same file.

TWO DIFFERENT REFUSALS, and conflating them is how a course gets re-uploaded onto itself. A manifest
carrying a lint ERROR is refused whole, before the first write. An apply that gets PAST the lint is
**not atomic**: it answers per operation, so a lecture refused for a bad block names itself and the
ones after it still land. An operator who reads "3 operations refused" as "nothing was written" and
re-runs is re-running against a course that already changed.

## Which doors are safe to retry

- The append door is idempotent on block id and answers whether it had already applied. Safe.
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
