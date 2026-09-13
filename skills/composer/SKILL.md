---
name: composer
description: Drive a course from raw materials to published on pass the year, through phases with gates. Use this whenever somebody wants to upload, ingest, build, fix, check or publish course content - a summary, a set of lectures, practice questions, a glossary or a mock exam - and whenever they mention the Composer, a course folder, a manifest, or getting a course up. Use it even when they name only one step, because the step belongs to a phase and the phase decides what has to be true before and after it. Start here rather than reaching for the MCP tools directly.
---

# Composer

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/state.mjs" "$COMPOSER_FOLDER"`

The block above was produced by reading the course folder BEFORE you read this skill. It is the state of
this run. Trust it over any memory of an earlier session.

**If it says no folder was given, that is the normal first run.** Ask which folder holds this course's
materials, then read the state with one Bash call:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/state.mjs" <the folder>
```

Run that once per phase transition, not repeatedly: it reads the disk, so its answer only changes when a
phase changes something. Do not guess a folder, and do not accept files pasted into the chat: **the
session reads a folder.**

## The phases, and which have skills

**Compose decides what it says. Layout decides how it looks. Audit decides whether it is right.** Those
three acts are distinct, and running them together is how a course ships with every write returning OK
and a third of a lecture missing.

| Phase | Skill | What it settles |
| --- | --- | --- |
| 0 Intake | `intake` | what we hold, and whether it is what it claims |
| · | `convert` | a document becomes a source of record and a media inventory |
| 1 Analyze | not built | what the exams ask. Needs past exams; optional, and skipping is recorded |
| 2 Compose | `compose` | make the text right |
| 3 Layout | `layout` | make it a course |
| 4 Audit | `audit` | prove it, with nobody |
| 5 Student View | not built | a second person reads it as a student |
| 6 Publish | `publish` | one press, production, named |
| 7 Observe | not built | watch it until the exam |

The three unbuilt phases are one page each in `reference/short-phases.md`, with what has to exist before
they can be. **Do not improvise them.** Say they are not built, say what is missing, and carry on.

## How you run

**Say the phase.** Every message starts with the phase it is in.

**Ask once, ask together.** Every decision that is the operator's is asked at the START of the phase that
needs it, as one set of multiple-choice questions with a recommendation each. Never one at a time, never
mid-phase. There are four such moments: the structure questions at Intake, the substantive edits at
Compose, unit 1 at Layout, the open lines at Publish.

**Record instead of stopping.** A finding goes on the list, a skip goes on the record, a doubt becomes an
open line. None is a reason to pause. The pauses are the gates that name a person.

**Everything lives in one place.** `~/Documents/Composer/<course>`, made by `workspace.mjs init`, with
the materials in `01-inputs` and everything derived numbered beside them. A session that opens tomorrow
reads that folder and knows what happened; `workspace.mjs list` shows every course and its phase.

**Work in files.** The source of record, the media inventory, the findings list, the manifest and the
figures are files in the folder. The chat is the log, not the store. Nothing passes through a tool call
that can pass through a file: a manifest emitted into one costs its whole length in tokens twice, and
every re-emission can corrupt text the upload exists to reproduce exactly.

**Never invent, never fix silently.** Prose is the author's, verbatim, typos included. A certain, small
edit is made with its reason on the record. Anything else is a gap, and when in doubt it is a gap. A
claim the author did not make does not belong in their course, however well it reads.

**Production, always.** Staging is not in this pipeline, in any phase, for any reason. The rehearsal is
`content_import` `plan`, which pre-flights every block and question and writes nothing.

**Confirm which hub answered before the first write.** `get_my_context`, reading `server.deployment` AND
`server.commit`, said in one line. Production and staging run the same build and resolve to the same
role, so a write sent to the wrong one succeeds, reads back correct, and never appears on the site you
meant.

## The phase report

```
Phase N · Name · done
Did: one line
Gate: met, or not met because ...
Findings: +n, by class
Next: Phase N+1 · Name, starting now · or · waiting on: who, for what
```

Report in that shape and nothing longer. Detail goes in the files.

## Where the rules live

**Ask the MCP, never remember.** `content_guide` is generated from the schemas the write path validates
against, so it cannot drift: call it for the manifest's shape, a block's props, the question vocabulary,
the maths rules and the glossary contract. **Every content tool takes one parameter, `request`, with the
arguments nested inside it.** A flat call is refused.

**This plugin carries only what no schema states**: the phases, the gates, the dispositions, the findings
list, and the platform behaviours in `reference/behaviours.md`.
