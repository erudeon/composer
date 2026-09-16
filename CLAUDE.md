# Composer — repository rules

This repo is a Claude Code plugin. It carries the Composer's PROCEDURE and the scripts its phases run.

## The boundary, which is the whole point

**Never copy anything that is generated.** The platform's block schemas, question vocabulary, manifest
shape, maths rules and glossary contract are generated from the schemas its write path validates against
and are served by the `content_guide` MCP tool. A skill that needs one calls the tool.

**If you find a prop table, a lint rule name or a tool signature written out in this repo, that is the
bug.** Delete it and call the tool.

What lives here is what no schema states: the phases, their gates, the modes, the dispositions, the
findings list, and the platform behaviours no schema describes.

## Rules for the skills

- A skill's `description` is paid on every turn; its body only when it fires. Keep bodies under 500
  lines and put long material in `reference/`, which is read only when a skill points at it.
- Explain WHY. A rule whose reason is stated survives contact with a situation nobody predicted.
- No em dashes anywhere a person reads.
- Any script a skill runs must be invoked through `${CLAUDE_PLUGIN_ROOT}`.

## Rules for the scripts

- **`scripts/state.mjs` must never exit non-zero.** A failing `!` command aborts the skill, leaving the
  operator with an error about the tool instead of an answer about their course. Every failure is caught
  and reported as output.
- The intake scripts are CommonJS deliberately: they all use `require()`.
- A verifier never shares code with the thing it verifies. One run normalised the source and the payload
  with the same function, a bug cancelled out on both sides, and the diff read clean while ten
  welded-together words had already shipped.
- Never run a naive whitespace or punctuation cleanup over markdown with inline emphasis. That produced
  three separate corruption bugs in one upload and was its largest single time sink. `lib.js` is the
  version that survived them, and `t_dash.js`, `t_emph.js`, `t_pair.js` and `t_marker.js` are why. Run
  them after touching it. They assert; for most of their life they only printed, so the sweep below
  reported success for them whatever they produced.
- **A dash is not always punctuation.** One alone in a table cell is a value meaning "not applicable",
  and both punctuation rules corrupt it: the lone-dash rule makes it a colon, and two adjacent marker
  cells look like a matched pair, so `| — | — |` brackets the pipe between them. `markerDashes` settles
  those first, into an en dash. `t_marker.js` asserts the row keeps its column count.
- The `t_*.js` and `t_*.mjs` files are the unit checks, one per thing that has broken. **BOTH
  EXTENSIONS**, or the five `.mjs` checks are written, committed, and never run again: a glob of `t_*.js`
  matches none of them, and nothing else does either. **Both folders**, because
  `scripts/` holds as many of them as `scripts/intake/` does and a sweep over one of them reports
  success for a suite it never ran:
  `for t in scripts/t_*.js scripts/t_*.mjs scripts/intake/t_*.js; do node "$t" >/dev/null || echo "FAILED $t"; done`.
  `t_omml.js` covers the equation reader, `t_spans.js` where the maths is in a piece of text, and
  `t_docx.js` heading resolution and Markdown tables.

## Rules for the gate

`hooks/model-gate.mjs` refuses to let this plugin run on a small model. It is a hook rather than an
instruction in a skill because the model doing the deciding would be the one that is not up to the job,
and because a small model does not fail here quickly and cheaply: it re-emits the course into every
message instead of sending the file, and retries what it misread, until somebody's usage is gone and no
course went up.

- **Opus runs, Sonnet runs with a word about Opus, Haiku and Fable are refused.** Sonnet is deliberately
  not blocked: somebody low on usage may choose it on purpose and taking that choice away helps nobody.
- **Effort is recommended, never enforced.** It is the author's to set, and a higher one costs them more
  rather than less, so it can never be a reason to refuse.
- **It fails OPEN, loudly.** The model is not in the hook's payload and has to be read out of the session
  transcript, whose shape is undocumented and free to change. A gate that cannot read the model is broken
  machinery: failing closed would brick the plugin for every author until somebody ships a patch, and
  failing open silently is a gate that is quietly not there. So it opens and says so in a line nobody can
  miss.
- **It reads nothing until it knows the call is ours.** It runs before every Skill and every Bash call in
  the session, so the first thing it does is decide whether this one belongs to this plugin, and only
  then does it touch the disk.
- **A Bash call is ours by this checkout's own path, never by the bare variable.** Every plugin writes
  `${CLAUDE_PLUGIN_ROOT}`, so matching that alone refused another plugin's telemetry command and refused
  somebody grepping for the variable. The placeholder only counts when the command also names a script
  that exists in this plugin.
- **It is a front door, and the other doors are open.** A course STARTS at a skill, which is what this
  really guards. A script reached by some other spelling (copied elsewhere, or run with a relative path
  from inside its own folder) is invisible to it, and so is the MCP door, which writes the same course
  without a shell at all. Both are ceilings rather than oversights: matching a command string cannot be
  made complete, and claiming every MCP call would block work that has nothing to do with this plugin.
  `t_modelgate.js` pins the MCP ceiling, so widening it is a decision somebody makes on purpose.
- **Its check is `scripts/t_modelgate.js`**, which drives the hook with a payload on stdin exactly as
  Claude Code does. Every shape in it was observed in a real transcript or stated in the hook
  documentation: an earlier version invented `effort` as a string and injected `CLAUDE_PLUGIN_ROOT` into
  the child's environment, and was green over a gate that could not work.

## Rules for the field guide

`formats/registry.json` is the catalogue of every kind of file this pipeline has met. It is DATA, not
prose: `scripts/identify.mjs` evaluates each entry's `when` against facts it measures from the bytes,
and `docs/FIELD-GUIDE.md` is generated from it.

- **Every `seen` field names a real file.** An entry nobody has met is a guess, and a guess in the
  catalogue is worse than a gap, because the next person believes it.
- **Never edit `docs/FIELD-GUIDE.md`.** Edit the registry and run
  `node scripts/identify.mjs --write-guide`. The validator fails when the two disagree.
- An entry may only key on a fact declared in the registry's own `facts` block. `validate.mjs` refuses
  one that does not, because a `when` clause naming a fact nothing measures matches nothing and tells
  nobody.
- `status` is honest: `caught`, `partial`, or `not caught`. A format we cannot read is worth an entry
  saying so; the alternative is somebody rediscovering it at midnight.

## Before changing anything in the intake chain

```
node scripts/validate.mjs
node scripts/security-check.mjs
for t in scripts/t_*.js scripts/t_*.mjs scripts/intake/t_*.js; do node "$t" || echo "FAILED $t"; done
node scripts/e2e-check.mjs <a-real-summary-with-no-drawings.docx>
node scripts/corpus-check.mjs <folder-of-real-summaries>
```

Each asks a different question, and none of the others asks `e2e-check`'s: **does a course move through
the phases, and do the gates hold?** It drives a real document from an empty workspace to the edge of
the platform under a throwaway `COMPOSER_HOME`, so it never touches an operator's own courses. Give it a
summary with NO drawings: one full of pictures stops at the disposition gate, which is the gate working
rather than the test failing.

That question went unasked for the whole of this plugin's life, and something had already rotted where
nothing else could see it: `composer.json` carried a `skips` array the Intake skill tells operators to
write into, and `state.mjs` never read it, so an item settled on purpose read MISSING for ever.

The second is the one that matters. Every bug worth finding in this pipeline was found by running real
documents through it and none by reading the code, and a fix verified only on the document that showed
it is how three of them came back. It takes a folder and carries none: the documents are somebody's
coursework and do not belong in a public repository.

## Every input here is somebody else's file

A `.docx` is a zip an author emailed. The chain unpacks it, reads its XML with regular expressions, and
writes what it finds into a folder on the operator's own machine. `scripts/security-check.mjs` holds the
probes for what that can go wrong as, and they run rather than being asserted:

- **No script reaches a shell.** Every external call is `execFileSync` with an argument array, so a file
  called `; rm -rf ~` is a bad name and nothing else. `exec`, a template-string command, or
  `shell: true` anywhere undoes that for every path in the repo at once.
- **An archive is judged before it is unpacked.** `unsafeToUnpack` reads the central directory, which
  DECLARES the unpacked size and every entry name, so a decompression bomb and a path traversal are both
  refused without writing a byte.
- **A course name becomes a slug.** It arrives from an operator, a document title or a model, and it
  becomes a folder; anything that is not `[a-z0-9-]` is not in it, and a name that reduces to nothing is
  refused rather than resolving to the workspace root.
- **A regex that runs on an untrusted document must not backtrack.** The maths scanner alternates over
  overlapping patterns, which is the shape that goes exponential.
- **Never print a credential, never go looking for one.** Two uploads were lost to an agent hunting for
  a token: one posted an unrelated service's secret to this API, one printed a third into a transcript.

## Rules for how it talks

`skills/composer/reference/voice.md` decides every message. It is read once at the start of a run and
it governs all seven skills, so a tone rule belongs there and nowhere else.

- **There is no operator.** The person on the other side wrote the summary. They are an AUTHOR, usually
  a student, and they know the course better than this does. If the word "operator" appears anywhere
  outside that file, it is a mistake.
- **The plumbing is never narrated.** Which box answered, which build, what a step cost: checked, never
  said. A check that fails becomes "I cannot reach pass the year at the moment", not its cause.
- **A finding is about a FILE, never about a person.** Word styles paragraphs as headings on its own,
  splits a phrase across three differently formatted runs on its own, and leaves a lock file beside an
  open document on its own. Most of what gets reported is that.
- **Their prose is published exactly as written, typos included.** Say it early. It is the most
  reassuring fact about this system and the one they are least likely to assume.

## The descriptions are the whole triggering mechanism

A skill that does not fire is a skill that is not there, and nothing else decides it. They are written
to catch what somebody actually TYPES, not what we call things: "can you put my summary up", not "the
source of record". Two rules that came out of testing them:

- **Every phase must own its nouns.** The word "exam" once appeared in no description at all, so a
  request for a mock exam routed nowhere and was caught only by the router matching the verb "add".
- **Two skills must never claim the same question.** Audit and Publish both answered "is it ready";
  Compose and Audit both owned "branding". Say which one REMOVES and which one REPORTS, in the
  descriptions themselves, or the router picks by coin toss.

Test them by judging the description lines ALONE against prompts somebody would really send, with
nothing else in context. Reading the bodies hides exactly the gap you are looking for.
