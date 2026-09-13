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
