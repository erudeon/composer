---
name: migrate
description: Move a course that is already BUILT from one hub to another, staging to production most often, replacing whatever the target holds rather than layering on top of it. Use this when somebody says copy, move, promote, migrate, push it to production, get it off staging, or says a course exists in one place and should exist in another. Use it before reaching for the export or push scripts directly, because the order of the steps is what makes the difference between a course that arrives whole and one that arrives looking whole. This MOVES a course between two hubs and never makes one visible: a course that already sits where students are and only has to be seen is Publish. Building a course from a document is Intake onward, and fixing one that is already on the hub it belongs on is Audit.
---

# Moving a course between hubs

The course exists. Nothing here writes a word of content: this carries what is already written from one
hub to another, and its whole job is making sure the target ends up holding **the same course**, not a
course that counts the same.

**This is not a phase.** A course reaches it after Publish on one hub, or instead of Publish when the
author built on staging and production is where students are.

## What makes this hard, in one sentence

Every step in this reports success for work it did not do: an apply says a lecture was written rather
than that the body stored is the body sent, a question refused inside a bank still leaves that bank
looking full, and a case whose parts never arrived reads as a bank of the right size.

## The order, and why it is this order

**1. Export from the source.** `pnpm --filter web content:export --course <id> --out <dir>` on the
source hub. It writes a manifest and a figures file. Bytes go disk to disk and never through a model,
which is the only way the author's sentences arrive unchanged.

**2. Repair the file against the TARGET's rules, before anything is deleted.** See the second trap
below. Run the target's own `plan`: it writes nothing and it is the only thing that knows.

**3. Only now, clear the target.** Never before you hold a clean plan. Deleting first and discovering
the file is refused leaves the target empty and students with nothing.

**4. Apply.**

**5. Carry the cases**, which the apply cannot. See the first trap.

**6. Verify**, `content_import` 'verify'. It compares what is STORED against the file, lecture by
lecture. An apply's own report cannot answer this and says so.

**7. Publish**, which is Publish's job and its gates.

## The five traps, each of which shipped a broken course

**1. Multi-part cases do not cross, and nothing says so.** An export writes the SOURCE hub's group id
on every part, and that id names nothing on the target, so each part is refused with "Question group not
found" while the bank's standalone questions land. One run lost 54 of 180 questions and reported
`Applied 58, failed 3`.

Worse, the obvious repair does not work either: writing the target's ids into the file and applying
again reports success and writes nothing, because the import drops `group` from both sides of its
comparison, so a part whose only change is its case reads as unchanged. Run this instead, once before
the apply and once after:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/carry-cases.mjs" stems <manifest.json> --course <sourceCourseId> --hub <sourceHub>
node "${CLAUDE_PLUGIN_ROOT}/scripts/carry-cases.mjs" bind  <manifest.json> --course <targetCourseId> --hub <targetHub>
```

**Name `--hub` on BOTH lines, every time.** It defaults to production, and `bind` writes, so a command
copied with the flag missing writes to production whatever direction the course was actually moving.
Each run prints the hub it is about to touch before it touches it.

**2. A course that is LIVE on the source can be refused by the target.** Content authored directly
through the Hub never runs the manifest lint; only an import does. So a published staging course can
produce dozens of errors on the target's plan: em dashes, headings the outline does not have, headings
that open with the document's own numbering, empty blocks, three callouts in a row. Repair the FILE, and
repair it without rewriting the author: an em dash becomes a colon inside a label and a comma in prose,
a level-4 heading becomes a bold lead-in, a heading's own number moves to the end of it, and a run of
callouts is fixed by MOVING a block rather than rewriting one.

**Then prove you took nothing out.** Count the words of every body before and after as multisets: every
token that disappears must reappear with punctuation attached to it. A diff of the text will not tell
you this, because a moved block looks like a deletion and an insertion.

**3. A deleted lecture still owns its URL segment.** The uniqueness of a lecture's segment ignores
whether it is deleted, and the planner only reads live rows, so a ghost is invisible to the plan and the
write fails on it. Freeing one takes three calls: restore it, rename it with an explicit new segment
(renaming refuses a deleted row, which is why the restore comes first), then delete it again.

**4. Emptying the trash is all or nothing, and student attempts block it for ever.** A lecture whose
questions somebody has attempted can never be hard deleted, by design: the attempt pins the question it
answered. The purge is one transaction for the whole course, so a handful of such lectures makes every
lecture unpurgeable and the tool answers with a generic refusal. Do not fight it. Free the segments you
need per trap 3 and leave the rest in the trash, where no student sees them.

**5. The glossary needs its own pass, and deleting is the safe direction.** Deleting a term is
permanent, which is what you want: a SOFT deleted term is silently skipped by the importer for ever, so
the course ends up with a term the glossary tab shows and no lecture defines. There is no bulk delete, so
a stale glossary is one call per term. Clear it BEFORE the apply, or the terms the file carries are
updated in place and keep pointing at lectures that no longer exist.

## What proves it arrived, and none of it is the apply's report

- `content_read` 'get_course': lectures total and published equal, `publishedEmpty` zero, banks
  published, glossary count the file's count and not double it.
- `content_read` 'list_banks': every bank holds the questions the file declares. A bank short by nine is
  the case trap.
- `content_read` 'list_groups': `partCount` equals the parts each case declares. This is the only call
  that catches a case whose parts were written beside it rather than inside it, and a student meeting one
  gets a question about a situation nobody showed them.
- `content_import` 'verify': every lecture matches.

## Gate

The target's plan clean before anything was deleted. Every lecture verified against the file. Every case
reporting the part count it declares. The glossary count equal to the file's. Then Publish, with its own
gates.

## Report

```
Migrate · done
Did: <course> from <source> to <target>. <n> lectures, <m> questions, <c> cases, <g> terms
Removed: <what the target held before, and where its backup is>
Gate: met, or not met because ...
Next: Phase 6 Publish, or published if the author said so
```
