#!/usr/bin/env node
/**
 * COMPOSER RUNS ON OPUS, AND REFUSES THE MODELS THAT BURN A COURSE TRYING.
 *
 * ── WHY THIS IS A GATE AND NOT A NOTE IN A SKILL ─────────────────────────────────────────────────────
 *
 * A small model does not fail at this quickly and cheaply. It fails EXPENSIVELY: it re-emits the course
 * body into a tool call rather than sending the file, retries what it misread, and loops on errors it
 * cannot diagnose. The observable cost is an author's usage gone in an afternoon, on a course that never
 * went up. Asking a model to police itself is no use, because the model deciding is the one that is not
 * up to the job. So the decision is made OUTSIDE it, before the tool call runs.
 *
 * ── THE FOUR ANSWERS ─────────────────────────────────────────────────────────────────────────────────
 *
 *   opus            run, say nothing. This is what the pipeline is built and measured on.
 *   sonnet          run, and say that Opus is the one to use. Deliberately NOT blocked: somebody low on
 *                   usage may choose it on purpose, and taking that choice away helps nobody.
 *   haiku, fable    refused, with the one sentence that fixes it.
 *   unreadable      run, and SAY SO. Loudly.
 *
 * ── WHY IT FAILS OPEN ────────────────────────────────────────────────────────────────────────────────
 *
 * The model is not in the hook's payload; it has to be read out of the session transcript, whose on-disk
 * shape is undocumented and free to change. A gate that cannot read the model is BROKEN MACHINERY, and
 * the two ways of being wrong are not symmetric: failing closed bricks the plugin for every author until
 * somebody ships a patch, while failing open costs one session on the wrong model. So it opens, and says
 * so, because a SILENT fail-open is a gate that is quietly not there.
 *
 * ── WHAT IT DOES NOT COVER, SAID PLAINLY ─────────────────────────────────────────────────────────────
 *
 * It sees `Skill` and `Bash`. A course STARTS at the skill, which is the door this really guards. A
 * script of this plugin reached by some other spelling (copied elsewhere, or run from inside its own
 * folder with a relative path) is invisible to it, and so is the MCP door, which writes the same course
 * without a shell at all. Those are ceilings, not oversights: matching a command string cannot be made
 * complete, and claiming every MCP call would block work that has nothing to do with this plugin.
 */
import { openSync, fstatSync, readSync, closeSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/** Start at 256 KB and double outward. A single line can be larger than any fixed window: the very
 * behaviour this gate exists to stop is a model emitting a whole course into one message, and the
 * longest line measured on this machine is 1.3 MB. A fixed tail would switch the gate off in exactly
 * the sessions it is for. */
const FIRST_TAIL = 256 * 1024;

/** The transcript is written asynchronously, so a brand new session can have no turn in it yet. */
const LAG_RETRY_MS = 250;

/** WHERE THIS PLUGIN IS, asked of the file itself rather than of the environment. An earlier version
 * matched the bare string `CLAUDE_PLUGIN_ROOT`, which is written by EVERY plugin: it refused another
 * plugin's telemetry command, and refused an author grepping for the variable. */
const PLUGIN_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

let scriptNames = null;
function ourScriptNames() {
  if (scriptNames) return scriptNames;
  try {
    scriptNames = readdirSync(join(PLUGIN_ROOT, "scripts")).filter((n) => /\.(mjs|js)$/.test(n));
  } catch {
    scriptNames = [];
  }
  return scriptNames;
}

/**
 * WHAT THIS PLUGIN'S OWN CALLS LOOK LIKE.
 *
 * A skill arrives as `composer:<name>`, and the router is also reachable as a bare `composer`. A Bash
 * call is ours when it names this checkout's own path, or when it uses the `${CLAUDE_PLUGIN_ROOT}`
 * placeholder AND names a script that actually exists in this plugin. The second half is what stops it
 * claiming somebody else's command: every plugin writes that variable, only this one has these files.
 */
function isComposerCall({ tool_name: tool, tool_input: input }) {
  if (tool === "Skill") {
    const skill = String(input?.skill ?? "");
    return skill === "composer" || skill.startsWith("composer:");
  }
  if (tool === "Bash") {
    const command = String(input?.command ?? "");
    if (command.includes(PLUGIN_ROOT)) return true;
    if (!command.includes("CLAUDE_PLUGIN_ROOT")) return false;
    return ourScriptNames().some((name) => command.includes(`/scripts/${name}`));
  }
  return false;
}

/** One tail read. Returns the model, or null if this window held no complete entry carrying one. */
function scanTail(path, bytes) {
  let fd;
  try {
    fd = openSync(path, "r");
    const size = fstatSync(fd).size;
    const length = Math.min(size, bytes);
    const buffer = Buffer.alloc(length);
    /* The COUNT, not the length: a short read otherwise leaves NUL padding that corrupts the newest line. */
    const read = readSync(fd, buffer, 0, length, size - length);
    const lines = buffer.subarray(0, read).toString("utf8").split("\n");
    /* The first line of a tail read is usually half a line. */
    if (size > length) lines.shift();
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      let entry;
      try {
        entry = JSON.parse(lines[i]);
      } catch {
        continue;
      }
      /*
       * A SIDECHAIN ENTRY IS A SUBAGENT'S TURN, NOT THIS SESSION'S. Reading one would report a helper's
       * model as the author's, in either direction: a cheap subagent under an Opus session reads as
       * refused, and on a version that inlines them a cheap PARENT could read as allowed.
       */
      if (entry?.isSidechain === true) continue;
      const model = entry?.message?.model;
      if (typeof model === "string" && model && model !== "<synthetic>") return model;
    }
    return { exhausted: size <= length };
  } catch {
    return null; /** unreadable is not the same as "nothing in it", and the caller tells them apart */
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

/**
 * The model of the most recent real turn, widening the window until the file is exhausted.
 *
 * BOUNDED. This runs before every Skill and Bash call in the session, so a loop with only a data-dependent
 * exit is a loop that can stall somebody's keyboard: a file being appended to while it is read can keep
 * moving its own end. The cap is generous enough that no real transcript reaches it and small enough that
 * hitting it costs a read rather than a session.
 */
const MAX_TAIL = 64 * 1024 * 1024;

function modelFromTranscript(path) {
  if (!path) return null;
  for (let bytes = FIRST_TAIL; bytes <= MAX_TAIL; bytes *= 2) {
    const found = scanTail(path, bytes);
    if (typeof found === "string") return found;
    if (found === null) return null; /** could not read it at all */
    if (found.exhausted) return null; /** read the whole file and it holds no turn yet */
  }
  return null; /** past the cap: treated as unreadable, which fails open and says so */
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** A nudge, never a refusal: effort is the author's to set, and a higher one costs them more, not less.
 * The payload carries it as an object with a `level`; older shapes and the environment are both read. */
function effortLevel(payload) {
  const raw = payload?.effort;
  const level = typeof raw === "string" ? raw : raw?.level;
  return level ?? process.env.CLAUDE_EFFORT ?? null;
}

function effortNote(payload) {
  const level = effortLevel(payload);
  return level === "low" || level === "medium"
    ? " Composer also does its best work with the thinking effort set high."
    : "";
}

/** Written, then returned rather than exited on: `process.exit` does not flush a pipe, and a dropped
 * refusal is a refusal that did not happen. */
function say(output) {
  process.stdout.write(JSON.stringify(output));
}

async function decide(payload) {
  if (!isComposerCall(payload)) return; /** not ours: no opinion, and nothing was read */

  /* A subagent has its own transcript, and its own model. Judge the one actually running this call. */
  const path = payload.agent_transcript_path ?? payload.transcript_path;

  let model = modelFromTranscript(path);
  if (!model) {
    /* The transcript is written asynchronously, so the first call of a session can arrive before the
     * turn that made it. That is the `/composer` first-run path, so it is worth one short wait. */
    await sleep(LAG_RETRY_MS);
    model = modelFromTranscript(path);
  }

  const name = model ? model.toLowerCase() : "";
  const family = ["opus", "sonnet", "haiku", "fable"].find((f) => name.includes(f)) ?? null;

  if (family === "opus") {
    const note = effortNote(payload);
    if (note) say({ systemMessage: `Composer is on the right model.${note}` });
    return;
  }

  if (family === "sonnet") {
    say({
      systemMessage:
        `Composer is running on Sonnet. It will work, but Opus is what it is built for and is far less ` +
        `likely to need a second run at a course. Switch with /model opus if you have the usage for it.` +
        effortNote(payload),
    });
    return;
  }

  if (family === "haiku" || family === "fable") {
    const Family = family[0].toUpperCase() + family.slice(1);
    say({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        /* The model reads this one, and `voice.md` tells it to relay this wording rather than improve it. */
        permissionDecisionReason:
          `Composer needs Opus, and this session is on ${Family}. On a small model it cannot finish a ` +
          `course, and it uses up an enormous amount of usage failing to: it sends the whole course into ` +
          `every message instead of uploading the file, and retries what it misreads.\n\n` +
          `Switch with /model opus and ask again. Nothing has been lost, and the course folder is exactly ` +
          `where it was.`,
      },
    });
    return;
  }

  /*
   * Unknown, or unreadable. Open, and loud. Two different sentences, because they are two different
   * situations for the person reading them: one is a model nobody here has heard of, the other is this
   * gate being broken, and only the second is worth telling us about.
   */
  say({
    systemMessage: model
      ? `Composer does not recognise the model this session is on (${model}), so it is letting this ` +
        `through. Composer is built for Opus: check with /model.${effortNote(payload)}`
      : `Composer could not check which model this session is on, so it is letting this through. It is ` +
        `built for Opus and should not be run on a small one: check with /model. If this keeps ` +
        `happening, the check itself needs repairing.${effortNote(payload)}`,
  });
}

let raw = null;
try {
  raw = readFileSync(0, "utf8");
} catch {
  /* Broken machinery, not an ordinary call. Said out loud, because a silent fail-open is no gate. */
  say({
    systemMessage:
      "Composer could not check which model this session is on, so it is letting this through. It is " +
      "built for Opus and should not be run on a small one: check with /model.",
  });
  process.exitCode = 0;
  raw = null;
}

if (raw !== null) {
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    if (raw.trim() !== "")
      say({
        systemMessage:
          "Composer could not check which model this session is on, so it is letting this through. It " +
          "is built for Opus and should not be run on a small one: check with /model.",
      });
    payload = null;
  }
  if (payload) await decide(payload);
}
