---
name: layout
description: Phase 3 of the Composer. Turn a source of record into a course manifest and apply it to a draft course on production, one unit first and then the rest. Use when the Composer's state says Phase 3 Layout, when building or pushing a manifest, when a unit needs laying out into blocks, or when figures need uploading before a course is written.
---

# Phase 3 · Layout

The edited source of record becomes blocks. **Nothing is written by you**: the prose is the author's, and
what you are deciding is which block carries which piece of it.

Layouting and auditing are different acts. Layouting chooses the right block; auditing checks whether
something is right. A paragraph that renders as a full empty page is a composition failure, and it is
fixed by choosing a different block here, not by nudging the reader afterwards.

## Ask the server what a block takes. Do not remember it.

**Every content tool takes ONE parameter, `request`, with the real arguments nested inside it.** A flat
call is refused. Ask only for what this course needs:

```
content_guide {"request":{"op":"manifest"}}
content_guide {"request":{"op":"blocks","type":["chart","table","callout"]}}
content_guide {"request":{"op":"questions"}}
content_guide {"request":{"op":"glossary"}}
```

Add `{"request":{"op":"maths"}}` **only for a course with equations in it**. The tool is split by op so
a lecture on social psychology does not pay for the delimiter rule, and asking for all of them spends
the saving the split exists to create.

What comes back is generated from the schemas the write path validates against, so it is the authority
on every shape, prop, label and cap. None of those is written down in this plugin.

**Confirm which hub answered**, once, before the first write: `get_my_context`, reading
`server.deployment` AND `server.commit`, and say both in one line.

**The course must exist.** `taxonomy` `tree` gives the programme CODE a manifest names;
`content_catalog` `create_course` makes the row if there is none. Nothing later creates it for you.

## The order, and the two commands that make it cheap

**1. Figures first.** A manifest carries no bytes and a storage key cannot be predicted, so the pictures
go up before the file that references them. Write `figures.json` beside the images, then:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/images.mjs" figures.json --course <courseId>
```

It answers a file-name-to-markdown map. Substitute that into the manifest verbatim.

**2. Build the manifest as a FILE, with a script you write.** Not by emitting it into a tool call: that
costs its whole length in tokens twice, and every re-emission can corrupt text this upload exists to
reproduce exactly. **The model writes the parser; the parser writes the course.**

**Put each unit's slice on the lecture as `source`.** It is the text Intake extracted, and it is what
every fidelity rule diffs the headings, prose and numbers against.

**3. Plan, then apply, then verify.**

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/push.mjs" manifest.json            # plans, writes nothing
node "${CLAUDE_PLUGIN_ROOT}/scripts/push.mjs" manifest.json --apply
node "${CLAUDE_PLUGIN_ROOT}/scripts/push.mjs" manifest.json --verify
```

If no token is available, `content_import` over the MCP does the same job and needs none. It costs the
length of the course in tokens, which is a real cost and a better one than a stalled upload. Say which
door you used.

**Keep what you sent.** After each plan and each apply:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/workspace.mjs" snapshot "<course>" manifest.json reply.json plan
```

It files both under `04-manifest/versions` with one timestamp. The pair is the only durable evidence of
what a course was at a moment, and it is what a session next week reads instead of guessing.

**Read `blocksRemoved`, `blocksUnknown` and `orderNotApplied` on the plan before applying.** The reply
explains each in its own words. Their absence is the good news; `blocksRemoved` appearing is a stop.

**A refused apply is not an untouched course.** A manifest carrying a lint error is refused whole before
anything is written. An apply that gets past the lint is **not** atomic: it answers per operation, so a
lecture refused for a bad block names itself and the ones after it still land. Re-send the whole
corrected file; everything that already landed is a no-op the second time.

## One unit, then stop

Build unit 1. Apply it. Verify it. Show the operator, report, and **wait**. On their word, build the
rest without further questions and report once.

## The shape of a unit

Prose is verbatim; everything else is yours to place. Only prose is checked word for word, which is the
point: copy the author's sentences exactly where it matters, and restructure the same facts into a table
or a callout where that teaches better.

```
prose            the section heading and its paragraphs, one block per subsection
callout          the source's own short example, lifted out of the paragraph
chart            the figure this section draws, from the expression the text gives
table            the section's rule set
question         2 to 5 pinned, at the end of the section they test
worked-example   the computation the source works through
callout          the closer, last
```

Which callout kind, what a chart takes, and what the closer is called all come from `content_guide`.

**A graph is drawn from the source's expression, never from points read off a picture.** Where the text
gives no expression, say so in the chart's title and make it schematic.

## The two numbers this plugin sets

Everything else about questions and glossary terms comes from the server. These two are ours:

- **Twenty practice questions a unit** in the bank, and **one inline question block at the end of each
  section**, drawing from it.
- **Eight to fifteen glossary terms a unit.**

## Never fan out

The rate limit is keyed on the credential, not the worker, so four workers share one budget and
parallelism divides throughput. For an MCP-bound job the fix is always fewer calls, never more workers.

## Gate

`verify` matches for every unit. No block resolves to nothing. **Unit 1 was accepted before unit 2 was
built.**

## Report

```
Phase 3 · Layout · done
Did: <n> units applied, <m> figures uploaded, verify matched
Gate: met, or not met because ...
Findings: +n, by class
Next: Phase 4 · Audit, starting now
```
