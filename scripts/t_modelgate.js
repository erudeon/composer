/**
 * COMPOSER RUNS ON OPUS, AND THE GATE SAYS SO WITHOUT ASKING THE MODEL.
 *
 * The thing being checked is a decision made OUTSIDE the model, so this drives the hook the way Claude
 * Code drives it: a JSON payload on stdin, a transcript on disk, and whatever comes back on stdout. No
 * part of it asks the gate what it thinks; it reads what it answers.
 *
 * The four answers, and the two ways they are allowed to be wrong:
 *   - opus runs and is not talked at, unless the effort is somewhere the hard phases suffer;
 *   - sonnet runs WITH a word about Opus, because somebody low on usage may pick it on purpose;
 *   - haiku and fable are refused, with the sentence that fixes it;
 *   - anything unreadable runs, LOUDLY, because a gate that cannot read the model is broken machinery
 *     and a silent fail-open is a gate that is quietly not there.
 *
 * And the thing it must never do: have an opinion about somebody else's tool call.
 */
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const { mkdtempSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");

const GATE = join(__dirname, "..", "hooks", "model-gate.mjs");
const dir = mkdtempSync(join(tmpdir(), "composer-gate-"));
const PLUGIN_ROOT = "/somewhere/plugins/composer";

/** A transcript shaped like the real one: JSONL, the model on `message.model`, newest last. */
function transcript(name, models, { padTo = 0 } = {}) {
  const path = join(dir, `${name}.jsonl`);
  const lines = [];
  /* Padding first, so a tail read has to skip a half line to find anything. */
  for (let i = 0; i < padTo; i += 1)
    lines.push(JSON.stringify({ type: "user", message: { role: "user", content: "x".repeat(200) } }));
  for (const model of models)
    lines.push(JSON.stringify({ type: "assistant", message: { role: "assistant", model, content: [] } }));
  writeFileSync(path, lines.join("\n") + "\n");
  return path;
}

function ask(payload) {
  const run = spawnSync(process.execPath, [GATE], {
    input: JSON.stringify(payload),
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT },
  });
  assert.strictEqual(run.status, 0, `the gate exited ${run.status}: ${run.stderr}`);
  const said = run.stdout.trim();
  return said ? JSON.parse(said) : null;
}

const skillCall = (transcript_path, skill = "composer:layout", extra = {}) => ({
  hook_event_name: "PreToolUse",
  tool_name: "Skill",
  tool_input: { skill },
  transcript_path,
  ...extra,
});

const decisionOf = (said) => said?.hookSpecificOutput?.permissionDecision ?? null;

// ── Opus: the right model, and not talked at ─────────────────────────────────────────────────────────

const opus = transcript("opus", ["claude-opus-5"]);
assert.strictEqual(ask(skillCall(opus)), null, "Opus was interrupted by the gate");
assert.strictEqual(ask(skillCall(opus, "composer")), null, "the bare router was interrupted on Opus");

/* Effort is a recommendation, never a refusal: it is the author's to set, and a higher one costs more. */
const lowEffort = ask(skillCall(opus, "composer:layout", { effort: "low" }));
assert.ok(lowEffort, "a low effort went unmentioned entirely");
assert.strictEqual(decisionOf(lowEffort), null, "a low effort was refused rather than mentioned");
assert.match(lowEffort.systemMessage, /effort/i, "a low effort went unmentioned");
assert.strictEqual(ask(skillCall(opus, "composer:layout", { effort: "xhigh" })), null, "xhigh was talked at");

// ── Sonnet: allowed on purpose, and told about Opus ──────────────────────────────────────────────────

const sonnet = transcript("sonnet", ["claude-sonnet-5"]);
const onSonnet = ask(skillCall(sonnet));
assert.ok(onSonnet, "Sonnet was let through without a word about Opus");
assert.strictEqual(decisionOf(onSonnet), null, "Sonnet was blocked, and somebody low on usage may choose it");
assert.match(onSonnet.systemMessage, /Opus/, "Sonnet was not told what the right model is");
assert.match(onSonnet.systemMessage, /\/model opus/, "Sonnet was not told how to switch");

// ── Haiku and Fable: refused, with the sentence that fixes it ────────────────────────────────────────

for (const [name, model] of [
  ["fable", "claude-fable-5-1"],
  ["haiku", "claude-haiku-4-5-20251001"],
]) {
  const said = ask(skillCall(transcript(name, [model])));
  assert.strictEqual(decisionOf(said), "deny", `${name} was allowed to run Composer`);
  assert.match(said.hookSpecificOutput.permissionDecisionReason, /\/model opus/, `${name} was not told how to fix it`);
  assert.ok(said.systemMessage, `${name} was refused without the author being told why`);
}

// ── A script of this plugin is the same call by another door ─────────────────────────────────────────

const fable = transcript("fable2", ["claude-fable-5-1"]);
const bash = (command) => ({
  hook_event_name: "PreToolUse",
  tool_name: "Bash",
  tool_input: { command },
  transcript_path: fable,
});
assert.strictEqual(
  decisionOf(ask(bash('node "${CLAUDE_PLUGIN_ROOT}/scripts/push.mjs" manifest.json --apply'))),
  "deny",
  "an upload ran on Fable by calling the script directly",
);
assert.strictEqual(
  decisionOf(ask(bash(`node ${PLUGIN_ROOT}/scripts/images.mjs figures.json --course c1`))),
  "deny",
  "the expanded path was not recognised as this plugin's own script",
);

// ── And no opinion whatsoever about anybody else's work ──────────────────────────────────────────────

assert.strictEqual(ask(bash("git status")), null, "the gate blocked an unrelated command");
assert.strictEqual(ask(bash("pnpm --filter web typecheck")), null, "the gate blocked somebody else's build");
assert.strictEqual(
  ask({ ...skillCall(fable), tool_input: { skill: "superpowers:brainstorming" } }),
  null,
  "the gate blocked another plugin's skill",
);
assert.strictEqual(
  ask({ ...skillCall(fable), tool_input: { skill: "composer-lookalike:thing" } }),
  null,
  "the gate claimed a skill that only starts like ours",
);

// ── Unreadable, or unknown: it opens, and it says so ─────────────────────────────────────────────────

const missing = ask(skillCall(join(dir, "no-such-file.jsonl")));
assert.ok(missing, "an unreadable transcript passed in silence, which is a gate that is not there");
assert.strictEqual(decisionOf(missing), null, "an unreadable transcript bricked the plugin");
assert.match(missing.systemMessage, /could not tell which model/i, "a fail-open said nothing");
assert.match(missing.systemMessage, /repair/i, "a fail-open did not ask for the gate to be repaired");

const strange = ask(skillCall(transcript("strange", ["some-model-nobody-has-heard-of"])));
assert.ok(strange, "an unknown model passed in silence");
assert.strictEqual(decisionOf(strange), null, "an unknown model bricked the plugin");
assert.match(strange.systemMessage, /some-model-nobody-has-heard-of/, "a fail-open did not name what it read");

/* No payload at all, and a payload that is not JSON: neither is a Composer call. */
for (const input of ["", "not json at all"]) {
  const run = spawnSync(process.execPath, [GATE], { input, encoding: "utf8" });
  assert.strictEqual(run.status, 0, `a ${input ? "malformed" : "missing"} payload was not survived`);
  assert.strictEqual(run.stdout.trim(), "", `a ${input ? "malformed" : "missing"} payload produced an opinion`);
}

// ── The model is read from the END, however long the session ─────────────────────────────────────────

/* A transcript far past the tail read, whose model sits in the last lines where a real one does. */
const long = transcript("long", ["claude-opus-5"], { padTo: 4000 });
assert.strictEqual(ask(skillCall(long)), null, "the model was not found at the end of a long session");

/* The harness speaks last. Those are not a model, and taking one would report no model at all. */
const trailing = transcript("trailing", ["claude-fable-5-1", "<synthetic>", "<synthetic>"]);
assert.strictEqual(
  decisionOf(ask(skillCall(trailing))),
  "deny",
  "a synthetic entry after the model's turn hid the model",
);

/* Newest wins: a session that switched to Opus is on Opus. */
const switched = transcript("switched", ["claude-fable-5-1", "claude-opus-5"]);
assert.strictEqual(ask(skillCall(switched)), null, "a session that switched to Opus was still refused");

console.log("t_modelgate: Composer runs on Opus, says so on Sonnet, and refuses the rest");
