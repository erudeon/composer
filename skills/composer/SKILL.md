---
name: composer
description: Drive a course from raw materials to published on pass the year, through eight phases with gates. Use this whenever somebody wants to upload, ingest, build, fix, check or publish course content - a summary, a set of lectures, practice questions, a glossary or a mock exam - and whenever they mention the Composer, a course folder, a manifest, or "getting this course up". Use it even when they only name one step, because the step belongs to a phase and the phase decides what has to be true before and after it. Start here rather than reaching for the MCP tools directly.
arguments: [folder]
---

# Composer

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/state.mjs" $folder`

The block above was produced by reading the course folder BEFORE you read this skill. It is the state of
this run. Trust it over any memory of an earlier session, and do not re-derive it by listing the folder.

If it says no folder was given, ask which folder holds the course's materials. Do not guess one, and do
not accept files pasted into the chat: **the session reads a folder**. A manifest emitted into a tool
call costs its whole length in tokens twice and every re-emission can corrupt text the upload exists to
reproduce exactly.

## What you are doing

Eight phases. **Compose decides what it says. Layout decides how it looks. Audit decides whether it is
right.** Those three acts are distinct, and running them together is how a course ships with every write
returning OK and a third of a lecture missing.

| Phase | What it settles | Who |
| --- | --- | --- |
| 0 Intake | what we hold, and what is wrong with the file | operator alone |
| 1 Analyze | what the exams ask, and where the material is silent | machine, conditional |
| 2 Compose | make the text right | operator, on the record |
| 3 Layout | make it a course | operator with you |
| 4 Audit | prove it | nobody |
| 5 Student View | a second person reads it as a student | a reviewer |
| 6 Publish | one press, production, named | one person |
| 7 Observe | watch it until the exam | sensors |

Read the phase's own skill before acting in it: `intake`, `layout`, `audit`. Phases 1, 2, 5, 6 and 7 are
carried here, in `reference/`, because each is short enough that a skill of its own would cost more to
keep consistent than it saves.

## How you run

**Say the phase.** Every message starts with the phase it is in.

**Ask once, ask together.** Every decision that is the operator's is asked at the START of the phase that
needs it, as one set of multiple-choice questions with a recommendation each. Never one at a time, never
mid-phase. There are four such moments and no others: the structure questions at Intake, the substantive
edits at Compose, unit 1 at Layout, the open lines at Publish.

**Record instead of stopping.** A finding goes on the list. A skip goes on the record. A doubt becomes an
open line. None of them is a reason to pause. The pauses are the gates that name a person.

**Work in files.** The converter's output, the source of record, the media inventory, the findings list,
the manifest and the figures are files in the folder. The chat is the log, not the store. Nothing passes
through a tool call that can pass through a file.

**Never invent, never fix silently.** Prose is the author's, verbatim, typos included. The mechanical
list runs without asking. A certain, small edit is made with its reason on the record. Anything else is
a gap, and when in doubt it is a gap.

**Name the environment every time you write.** Production, always. Staging is not in this pipeline, in
any mode, with no exception. The rehearsal is `content_import` `plan`, which pre-flights every block and
question and writes nothing.

**Confirm which hub answered before anything is written.** `get_my_context`, and read `server.deployment`
AND `server.commit`. The version string alone is not a deployment identity. Production and staging run
the same build, offer the same tools and resolve to the same role, so a write sent to the wrong one
succeeds, reads back correct, and never appears on the site you meant. Say which hub and which build in
one line.

**Keep the operator's cost low.** Report in the shape below and nothing longer. Detail goes in the files.

## The phase report

```
Phase N · Name · done
Did: one line
Gate: met, or not met because ...
Findings: +n, by class
Next: Phase N+1 · Name, starting now · or · waiting on: who, for what
```

## Where the rules live

**Ask the MCP, do not remember.** `content_guide` is generated from the schemas the write path validates
against, so it cannot drift on shapes: call it for the manifest's shape, every block's props and guide,
the question vocabulary, the maths rules and the glossary contract. Call it at the start of a Layout
session rather than recalling it from an earlier one.

**This plugin carries what no schema states**: the phases, the gates, the dispositions, the findings
list, and the platform behaviours in `reference/behaviours.md`. If you ever find a prop table, a lint
rule name or a tool signature written out in this repo, that is a bug: delete it and call the tool.

## Never fan out

The rate limit is keyed on the CREDENTIAL, not the worker, and it fails closed at sixty calls a minute.
Four workers on one connection share one budget, so parallelism divides throughput rather than
multiplying it. Eight parallel agents once exhausted a session and six died mid-write, leaving five units
half uploaded. **For an MCP-bound job the fix is always fewer calls, never more workers.**

## Pilot one unit, end to end

Build unit 1, apply it, verify it, show it, report, and wait. On the operator's word, build the rest
without further questions and report once. The first unit is the pattern, not a sample: every platform
surprise was visible in the first unit of a course that then had ten more built against a wrong
assumption.
