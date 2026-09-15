/**
 * COMPOSER RUNS ON OPUS, AND THE GATE SAYS SO WITHOUT ASKING THE MODEL.
 *
 * The thing being checked is a decision made OUTSIDE the model, so this drives the hook the way Claude
 * Code drives it: a JSON payload on stdin, a transcript on disk, and whatever comes back on stdout.
 *
 * IT INVENTS AS LITTLE OF THE PAYLOAD AS IT CAN. An earlier version passed `effort` as a string when the
 * real one is an object, and injected `CLAUDE_PLUGIN_ROOT` into the child's environment when nothing
 * promises it is there. Both were green over a gate that could not work, which is the failure CLAUDE.md
 * names: a verifier must not share its assumptions with the thing it verifies. Every shape here is one
 * observed in a real transcript or stated in the hook documentation.
 */
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const { mkdtempSync, writeFileSync } = require("node:fs");
const { join, resolve } = require("node:path");
const { tmpdir } = require("node:os");

const PLUGIN_ROOT = resolve(__dirname, "..");
const GATE = join(PLUGIN_ROOT, "hooks", "model-gate.mjs");
const dir = mkdtempSync(join(tmpdir(), "composer-gate-"));

/** A transcript shaped like the real one: JSONL, the model on `message.model`, newest last. */
function transcript(name, entries, { padTo = 0, padBytes = 200, tailPad = 0 } = {}) {
  const path = join(dir, `${name}.jsonl`);
  const lines = [];
  const filler = (bytes) => JSON.stringify({ type: "user", message: { role: "user", content: "x".repeat(bytes) } });
  for (let i = 0; i < padTo; i += 1) lines.push(filler(padBytes));
  for (const entry of entries)
    lines.push(
      JSON.stringify(
        typeof entry === "string"
          ? { type: "assistant", message: { role: "assistant", model: entry, content: [] } }
          : entry,
      ),
    );
  /* AFTER the model line, which is what pushes it out of the first window. */
  for (let i = 0; i < tailPad; i += 1) lines.push(filler(padBytes));
  writeFileSync(path, lines.join("\n") + "\n");
  return path;
}

const assistant = (model, extra = {}) => ({
  type: "assistant",
  message: { role: "assistant", model, content: [] },
  ...extra,
});

/** THE ENVIRONMENT IS NOT DOCTORED: whatever the gate needs, it must find for itself. */
function ask(payload) {
  const env = { ...process.env };
  delete env.CLAUDE_PLUGIN_ROOT;
  delete env.CLAUDE_EFFORT;
  const run = spawnSync(process.execPath, [GATE], { input: JSON.stringify(payload), encoding: "utf8", env });
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

/* Effort arrives as an OBJECT with a level. It is a recommendation and never a refusal. */
const lowEffort = ask(skillCall(opus, "composer:layout", { effort: { level: "low" } }));
assert.ok(lowEffort, "a low effort went unmentioned entirely");
assert.strictEqual(decisionOf(lowEffort), null, "a low effort was refused rather than mentioned");
assert.match(lowEffort.systemMessage, /effort/i, "a low effort went unmentioned");
assert.strictEqual(ask(skillCall(opus, "composer:layout", { effort: { level: "xhigh" } })), null, "xhigh was talked at");
assert.ok(ask(skillCall(opus, "composer:layout", { effort: "medium" })), "an older string effort was ignored");

// ── Sonnet: allowed on purpose, and told about Opus ──────────────────────────────────────────────────

const onSonnet = ask(skillCall(transcript("sonnet", ["claude-sonnet-5"])));
assert.ok(onSonnet, "Sonnet was let through without a word about Opus");
assert.strictEqual(decisionOf(onSonnet), null, "Sonnet was blocked, and somebody low on usage may choose it");
assert.match(onSonnet.systemMessage, /\/model opus/, "Sonnet was not told how to switch");

// ── Haiku and Fable: refused, with the sentence that fixes it ────────────────────────────────────────

for (const [name, model] of [
  ["fable", "claude-fable-5-1"],
  ["haiku", "claude-haiku-4-5-20251001"],
]) {
  const said = ask(skillCall(transcript(name, [model])));
  assert.strictEqual(decisionOf(said), "deny", `${name} was allowed to run Composer`);
  assert.match(said.hookSpecificOutput.permissionDecisionReason, /\/model opus/, `${name} was not told how to fix it`);
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
  "an upload ran on Fable by calling the script through the placeholder",
);
assert.strictEqual(
  decisionOf(ask(bash(`node ${PLUGIN_ROOT}/scripts/images.mjs figures.json --course c1`))),
  "deny",
  "this checkout's own path was not recognised",
);

// ── And no opinion whatsoever about anybody else's work ──────────────────────────────────────────────

assert.strictEqual(ask(bash("git status")), null, "the gate blocked an unrelated command");
/*
 * EVERY plugin writes `${CLAUDE_PLUGIN_ROOT}`, so the variable alone cannot mean "ours". This exact
 * command belongs to another plugin installed on this machine, and the first version of the gate
 * refused it.
 */
assert.strictEqual(
  ask(bash('bash "${CLAUDE_PLUGIN_ROOT}/hooks/scripts/track-telemetry.sh" --hook-source plugin')),
  null,
  "the gate refused another plugin's own command",
);
assert.strictEqual(
  ask(bash("grep -rn CLAUDE_PLUGIN_ROOT ~/my-plugin/skills")),
  null,
  "the gate refused somebody reading about the variable",
);
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
/* A ceiling stated in CLAUDE.md rather than a hole nobody noticed: the MCP door is not gated. */
assert.strictEqual(
  ask({ ...skillCall(fable), tool_name: "mcp__pty__content_import", tool_input: { manifest: {} } }),
  null,
  "the gate started claiming MCP calls without the rules being updated",
);

// ── A subagent is judged on ITS model, not the session's ─────────────────────────────────────────────

const helper = transcript("helper", ["claude-haiku-4-5-20251001"]);
assert.strictEqual(
  decisionOf(ask(skillCall(opus, "composer:layout", { agent_transcript_path: helper, agent_id: "a1" }))),
  "deny",
  "a cheap subagent ran the pipeline under an Opus session",
);
/* And a helper's turn inlined into the main transcript is not the session's model either. */
const inlined = transcript("inlined", [
  assistant("claude-opus-5"),
  assistant("claude-fable-5-1", { isSidechain: true }),
]);
assert.strictEqual(ask(skillCall(inlined)), null, "a subagent's turn was read as the session's model");

// ── Unreadable, unknown, and not written yet: it opens, and it says which ────────────────────────────

const missing = ask(skillCall(join(dir, "no-such-file.jsonl")));
assert.ok(missing, "an unreadable transcript passed in silence, which is a gate that is not there");
assert.strictEqual(decisionOf(missing), null, "an unreadable transcript bricked the plugin");
assert.match(missing.systemMessage, /could not check/i, "a fail-open said nothing");

const strange = ask(skillCall(transcript("strange", ["some-model-nobody-has-heard-of"])));
assert.ok(strange, "an unknown model passed in silence");
assert.strictEqual(decisionOf(strange), null, "an unknown model bricked the plugin");
assert.match(strange.systemMessage, /some-model-nobody-has-heard-of/, "a fail-open did not name what it read");
assert.doesNotMatch(strange.systemMessage, /repair/i, "a model we simply do not know was reported as a fault");

/* A session whose first turn has not been written yet. The commonest entry of all: a first run. */
const fresh = transcript("fresh", [{ type: "user", message: { role: "user", content: "put my summary up" } }]);
const onFresh = ask(skillCall(fresh));
assert.ok(onFresh, "a session with no turn yet passed in silence");
assert.strictEqual(decisionOf(onFresh), null, "a first run was bricked");

/* No payload at all is not a Composer call. A malformed one is broken machinery and says so. */
for (const [input, expectation] of [
  ["", null],
  ["not json at all", "loud"],
]) {
  const run = spawnSync(process.execPath, [GATE], { input, encoding: "utf8" });
  assert.strictEqual(run.status, 0, "a bad payload was not survived");
  const said = run.stdout.trim();
  if (expectation === null) assert.strictEqual(said, "", "an empty payload produced an opinion");
  else assert.match(said, /could not check/i, "a malformed payload was swallowed in silence");
}

// ── The model is read from the END, however long the session or its lines ────────────────────────────

const long = transcript("long", ["claude-opus-5"], { padTo: 4000 });
assert.strictEqual(ask(skillCall(long)), null, "the model was not found at the end of a long session");

/*
 * ONE LINE BIGGER THAN THE FIRST WINDOW. A small model re-emitting a whole course into a message is
 * what makes these, so a fixed tail would switch the gate off in exactly the sessions it is for.
 */
const huge = transcript("huge", ["claude-fable-5-1"], { tailPad: 2, padBytes: 400 * 1024 });
assert.strictEqual(decisionOf(ask(skillCall(huge))), "deny", "a line larger than the window switched the gate off");

/* The harness speaks last. Those are not a model, and taking one would report no model at all. */
const trailing = transcript("trailing", ["claude-fable-5-1", "<synthetic>", "<synthetic>"]);
assert.strictEqual(decisionOf(ask(skillCall(trailing))), "deny", "a synthetic entry hid the model");

/* Newest wins: a session that switched to Opus is on Opus. */
const switched = transcript("switched", ["claude-fable-5-1", "claude-opus-5"]);
assert.strictEqual(ask(skillCall(switched)), null, "a session that switched to Opus was still refused");

console.log("t_modelgate: Composer runs on Opus, says so on Sonnet, and refuses the rest");
