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
  version that survived them, and `t_dash.js`, `t_emph.js` and `t_pair.js` are why. Run them after
  touching it.
- The `t_*.js` files are the unit checks, one per thing that has broken. Run all of them:
  `for t in scripts/intake/t_*.js; do node "$t" >/dev/null || echo "FAILED $t"; done`.
  `t_omml.js` covers the equation reader, `t_spans.js` where the maths is in a piece of text, and
  `t_docx.js` heading resolution and Markdown tables.

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
for t in scripts/intake/t_*.js; do node "$t" || echo "FAILED $t"; done
node scripts/corpus-check.mjs <folder-of-real-summaries>
```

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
