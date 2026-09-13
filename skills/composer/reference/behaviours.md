# What the machine does that no schema states

`content_guide` is generated from the schemas the write path validates against, so it is the authority on
every SHAPE: a block's props, a question's fields, the manifest, the caps. **Ask it, never remember it.**

This file carries the other kind of knowledge: what the platform DOES. None of it is in a schema, every
item below has already cost somebody a real upload, and a few of them destroyed live content while every
signal read green.

## A body write is a whole-array replace

The manifest describes the whole body, so **anything it leaves out is deleted**. Omitting `blocks`
entirely is safe and touches nothing. A PARTIAL `blocks` array is destructive. **The two differ by one
optional key.** Twice, a write carrying a partial array silently dropped a third of a published lecture,
once including the exam summary.

To repair one lecture, send the COMPLETE intended array with the version you read back. That is a
compare-and-swap on a whole known-good body, and it is the safe way to use replace semantics. To place a
single block, use the edit door, which names the blocks it touches.

Never split one lecture across several imports. That is what destroyed a theme.

## The three keys on a plan

- **`blocksRemoved`** — what applying will delete. **Absent when nothing is lost**, so its absence is the
  good news. This is the one that would have caught the day two units lost a third of their prose.
- **`blocksUnknown`** — a stored body that could not be parsed, so what the write destroys is unknown.
  **It is not a report of zero**, and the write is planned anyway.
- **`orderNotApplied`** — the reading order was declined because the file does not name every lecture.

**Reading order is a statement about the whole course.** A manifest naming fewer lectures than the course
holds does not reorder it. Before this was true, a one-lecture apply lifted that lecture to position
zero, twice, on two courses, on one day.

## An apply answers per operation, never per outcome

That a lecture was written is not that the body stored is the body you sent. Those came apart once. Only
`verify` closes that gap: it diffs the stored course against the same file.

An apply refuses **atomically**. One bad block in unit 7 refuses units 1 to 20 and answers "nothing was
written". An earlier successful apply still stands.

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
which is why the normaliser runs first, and why a footer spliced mid-sentence breaks a match that is
otherwise a perfect copy. Very short units are skipped entirely.

## Two doors disagree on one field name

The glossary tool's field is `description`. The manifest's is `definition`. Both schemas are strict, so
the wrong one is refused either way, and fourteen terms were hand-built with the wrong key before a
refusal named it.

**`RECALL` is not a label.** The label for recalling a term or a fact is `DEFINITIONS`.

## Every content tool nests its arguments

They take one parameter, `request`, and the real arguments go inside it. Every tool in the group was
tried flat on a real run and every one refused. The publish tool has no `op` at all.

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
- Two identical blocks over 2,000 characters are refused; a shorter identical pair is allowed and
  reported. A repeated summary in a source document hits this.
- Nested lists survive. Several paragraphs in one list item do not.
- Prices are safe and need no escaping.
- An unknown field now names the fields that object accepts. Read the error rather than guessing.
- Never run a shell one-liner with a backslash in the payload: a double-quoted string eats one level, so
  the script runs against text that is not what you typed. Twice on one run a fix reported success and
  changed nothing. Write a file.
