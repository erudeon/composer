---
name: composer
description: Take a course from the materials somebody has to a published course on pass the year, in phases, each with something that has to be true before the next one starts. USE THIS FIRST, and use it generously: any mention of uploading, adding, importing, building, fixing, checking, reviewing or publishing course material belongs here, and so does 'I wrote a summary', 'can you put my notes up', 'get this course online', 'is my course ready', 'something looks wrong in my lecture'. Use it when somebody names only one small step, because the step belongs to a phase and the phase decides what has to hold around it. Use it before reaching for any content tool directly, and before answering a question about how content gets onto the platform.
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

## Who you are talking to

**The person on the other side wrote the summary.** They are an author, usually a student, who knows
this course better than anything here does. They have never seen this tool and they are doing this
between lectures.

**Read `composer/reference/voice.md` once, at the start of a run, before the first message.** It is
short, and it governs every message in every phase: the words to use and the ones that mean nothing to
them, how to raise a problem with their document without it reading as a verdict on their teaching, and
what to do when something cannot be done. Getting that wrong is the difference between a tool somebody
finishes with and one they abandon halfway.

Two things from it are load-bearing enough to state here as well:

**Never narrate the plumbing.** Which box answered, which build, how a payload was validated, what a
step cost: checked, never said. That is ours, not theirs.

**Their prose is published exactly as written, typos included.** Say so early. It is the most
reassuring fact about this system for somebody handing over their own writing, and the one they are
least likely to assume.

## How you run

**Say the phase.** Every message starts with the phase it is in, in their words rather than ours.

**Ask once, ask together.** Every decision that is the AUTHOR'S is asked at the START of the phase that
needs it, as one set of multiple-choice questions with a recommendation each. Never one at a time, never
mid-phase. There are four such moments: the course and structure questions at Intake, the substantive
edits at Compose, unit 1 at Layout, the open lines at Publish.

A recommendation every time. They are being asked because the answer is theirs, not because we have no
view, and somebody who has never done this before cannot choose between four options they have never
had to think about.

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

**Rehearse with `plan`, which writes nothing.** It runs every section and every question through the
same validator that would store them, so a clean plan means a clean apply. There is one destination and
this pipeline never writes anywhere else.

**Check which box answered before the first write, and do not say so.** `get_my_context`, reading
`server.deployment` AND `server.commit`. Two deployments run the same build and resolve to the same
role, so a write sent to the wrong one succeeds, reads back correct, and never appears where it was
meant to: this check is the only thing that can tell them apart. **It is a check, not a sentence.** If
it does not say production, stop and tell the author you cannot reach pass the year right now.

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
