---
name: publish
description: Phase 6. Make a finished course visible to students, once every open finding is closed or accepted in writing by a person. Use when the Composer's state says Phase 6 Publish, and whenever somebody says publish, go live, make it visible, release it, ship it, or asks whether a course is ready for students to see or what is still standing in the way.
---

# Phase 6 · Publish

The course has been on production since Layout. This makes it **visible**, and says so unambiguously.
**Published** is the word. Not live, not shipped, not up.

This is the one irreversible act in the pipeline, which is the only reason it is a phase of its own.

## Before you press

**1. Read the findings list.** Every line must be `done` or `accepted`. A line that is `accepted` must
carry a `why`, written by the person accepting it.

**2. Ask about the open lines once**, in one message, with a recommendation each: accept or hold. That
is the last of the four moments in this pipeline where the author decides something.

**3. Read what the cascade will touch.** A course-level publish carries every lecture, bank and paper
with it, **which silently reverses a deliberate withdrawal**. If a unit was withdrawn on purpose, this
puts it back. For a single mid-block fix there is a lecture-level door; use that instead.

**4. Confirm the hub.** Say which deployment and which build answered, in one line.

## The press

Press only on the word `publish` from the author. Not on "looks good", not on "go ahead with
everything", not on silence.

Then report the status in the platform's own words, **with the environment named**.

## The refusal you never bypass

The publish door refuses while any lecture it would publish has no body. **There is an optional flag
that turns that refusal off. Never pass it.** A refusal means a unit is empty, and shipping a stub to
students is not something this pipeline does quietly. If the author genuinely means to ship a stub,
that is a finding they accept in writing first, and then it is their sentence on the record rather than
a boolean in a tool call.

## A missing input is accepted, not forgotten

A course can reach this phase without its manual, or without the cohort's voice. **It does not reach the
press** without somebody writing on the findings list that the gap is known and accepted.

## Gate

Every unit through Audit. The findings list closed, or every open line accepted in writing. The publish
door's own refusal not bypassed.

## Report

```
Phase 6 · Publish · done
Did: published <course>, <n> units, on <deployment> build <commit>
Gate: met, or not met because ...
Findings: 0 open, <n> accepted
Next: Phase 7 · Observe, handed over. The accepted lines are the watch list.
```
