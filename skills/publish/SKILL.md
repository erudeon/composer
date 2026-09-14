---
name: publish
description: Phase 6. Make a finished course visible to students, once every open finding is closed or accepted in writing by a person. This is the LAST step and it only runs after Audit. Use when the Composer's state says Phase 6 Publish, and whenever somebody says publish, go live, make it visible, release it, ship it, or asks what is still standing in the way of students seeing it.
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

**3. Read what the cascade will touch.** `content_publish` on a COURSE carries every lecture, every
lesson body, every practice bank and every mock exam with it, because a student reading a course needs
all of them and one that publishes half of itself gives them lectures with no practice.

That cascade **silently reverses a deliberate withdrawal**: a row withdrawn on purpose and a row never
published look identical from here, so it puts the withdrawn one back. The reply says how many rows
below the course actually moved. **Read that number.** If it is larger than the units you expected to
publish, something came back that somebody took down.

The same door takes a single lecture, a single bank or a single paper. For a mid-course fix, use the
narrow one and leave the rest alone.

**4. Check which box answered.** `get_my_context`. It is a check, not a sentence: if it does not say
production, stop and tell the author you cannot reach pass the year right now.

## The press

`content_publish`, target `course`, `published: true`.

Press only on the word `publish` from the author. Not on "looks good", not on "go ahead with
everything", not on silence.

**Publishing is a separate permission from writing.** A credential that has written this whole course
may still be refused here, and that refusal is not a fault in the course. Say what it means plainly:
the work is saved and somebody with publishing rights has to press it.

## Then read it back, because the door does not tell you this

`content_read` `get_course`. Its `contents` counts what EXISTS against what a student can actually see,
lecture by lecture, bank by bank.

It is the only call that catches a course published with its practice invisible, which is a course that
looks finished from every other angle and gives students no questions to work through. Compare the two
numbers and say them to the author in their terms: how many lectures are now visible, and how many sets
of practice questions came with them.

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
Did: published <course>. <n> lectures now visible, <m> sets of practice with them
Gate: met, or not met because ...
Findings: 0 open, <n> accepted
Next: Phase 7 · Observe, handed over. The accepted lines are the watch list.
```
