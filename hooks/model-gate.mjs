#!/usr/bin/env node
/**
 * COMPOSER RUNS ON OPUS, AND REFUSES THE MODELS THAT CANNOT FINISH A COURSE.
 *
 * ── WHY THIS IS A GATE AND NOT A NOTE IN A SKILL ─────────────────────────────────────────────────────
 *
 * A small model does not fail at this quickly and cheaply. It fails EXPENSIVELY: it re-emits the course
 * body into a tool call rather than sending the file, it retries what it misread, and it loops on
 * errors it cannot diagnose. The observable cost is an author's usage gone in an afternoon, on a course
 * that never went up. Asking a model to police itself is no use here, because the model doing the
 * deciding is the one that is not up to the job.
 *
 * So the decision is made OUTSIDE the model, by this hook, before the tool call runs.
 *
 * ── THE THREE ANSWERS ────────────────────────────────────────────────────────────────────────────────
 *
 *   opus            run, say nothing. This is what the pipeline is built and measured on.
 *   sonnet          run, but say that Opus is the one to use. Deliberately NOT blocked: somebody low on
 *                   usage may choose it on purpose, and taking that choice away helps nobody.
 *   haiku, fable    refused, with the one sentence that fixes it.
 *   anything else   run, and SAY LOUDLY that the model could not be read.
 *
 * ── WHY IT FAILS OPEN ────────────────────────────────────────────────────────────────────────────────
 *
 * The model is not in the hook's own payload; it has to be read out of the session transcript, whose
 * on-disk shape is undocumented and free to change. A gate that cannot read the model is BROKEN
 * MACHINERY, and the cost of guessing wrong in each direction is not symmetric: failing closed bricks
 * the plugin for every author until somebody ships a patch, while failing open costs one session on the
 * wrong model. So it opens, and it says so in a line nobody can miss, because a silent fail-open is just
 * a gate that quietly is not there.
 *
 * Plain Node, no dependencies, and it touches the disk only once it already knows the call is ours.
 */
import { readFileSync, openSync, fstatSync, readSync, closeSync } from "node:fs";

/** Read at most this much of the tail. A transcript grows without limit; the last model is at the end. */
const TAIL_BYTES = 512 * 1024;

/**
 * WHAT THIS PLUGIN'S OWN CALLS LOOK LIKE.
 *
 * A skill of this plugin arrives as `composer:<name>`; the router is also reachable as a bare `composer`.
 * A script of this plugin is always invoked through `${CLAUDE_PLUGIN_ROOT}` (the repo requires it), so
 * either the literal or the path it expands to is the honest signal that a Bash call is ours.
 */
function isComposerCall({ tool_name: tool, tool_input: input }) {
  if (tool === "Skill") {
    const skill = String(input?.skill ?? "");
    return skill === "composer" || skill.startsWith("composer:");
  }
  if (tool === "Bash") {
    const command = String(input?.command ?? "");
    if (command.includes("CLAUDE_PLUGIN_ROOT")) return true;
    const root = process.env.CLAUDE_PLUGIN_ROOT;
    return Boolean(root) && command.includes(root);
  }
  return false;
}

/**
 * The model of the most recent turn, read backwards from the end of the transcript.
 *
 * `<synthetic>` entries are the harness talking rather than a model, so they are skipped: taking one
 * would report no model at all on a session that has plenty.
 */
function modelFromTranscript(path) {
  if (!path) return null;
  let fd;
  try {
    fd = openSync(path, "r");
    const size = fstatSync(fd).size;
    const length = Math.min(size, TAIL_BYTES);
    const buffer = Buffer.alloc(length);
    readSync(fd, buffer, 0, length, size - length);
    const lines = buffer.toString("utf8").split("\n");
    /* The first line of a tail read is usually half a line. It is simply skipped. */
    if (size > length) lines.shift();
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      let entry;
      try {
        entry = JSON.parse(lines[i]);
      } catch {
        continue;
      }
      const model = entry?.message?.model;
      if (typeof model === "string" && model && model !== "<synthetic>") return model;
    }
    return null;
  } catch {
    return null;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

/** Matched on the family rather than the exact id, so a dated or renamed build of one is still one. */
function familyOf(model) {
  const name = model.toLowerCase();
  for (const family of ["opus", "sonnet", "haiku", "fable"]) if (name.includes(family)) return family;
  return null;
}

/** A nudge, never a refusal: effort is the author's to set and a higher one costs them more, not less. */
function effortNote(effort) {
  return effort === "low" || effort === "medium"
    ? " Composer also does its best work with the thinking effort set high."
    : "";
}

function say(output) {
  process.stdout.write(JSON.stringify(output));
  process.exit(0);
}

function main(payload) {
  if (!isComposerCall(payload)) process.exit(0); /** not ours: no opinion, and no file was read */

  const model = modelFromTranscript(payload.transcript_path);
  const family = model ? familyOf(model) : null;

  if (family === "opus") {
    /* The right model. Silent, unless the effort is set somewhere the judgement-heavy phases suffer. */
    const note = effortNote(payload.effort);
    if (!note) process.exit(0);
    say({ systemMessage: `Composer is on the right model.${note}` });
  }

  if (family === "sonnet") {
    say({
      systemMessage:
        `Composer is running on Sonnet. It will work, but Opus is what it is built for and is far less ` +
        `likely to need a second run at a course. Switch with /model opus if you have the usage for it.` +
        effortNote(payload.effort),
    });
  }

  if (family === "haiku" || family === "fable") {
    const reason =
      `Composer needs Opus, and this session is on ${family}. On a small model it cannot finish a ` +
      `course, and it uses up an enormous amount of usage failing to: it sends the whole course into ` +
      `every message instead of uploading the file, and retries what it misreads.\n\n` +
      `Switch with /model opus and ask again. Nothing has been lost, and the course folder is exactly ` +
      `where it was.`;
    say({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: reason,
      },
      systemMessage: reason,
    });
  }

  /*
   * Unknown, or unreadable. Open, and loud: this is the sentence that gets the gate repaired, and
   * without it a changed transcript format would silently switch the whole thing off.
   */
  say({
    systemMessage:
      `Composer could not tell which model this session is on${model ? ` (it reads as "${model}")` : ""}, ` +
      `so it is letting this through unchecked. Composer needs Opus: on a small model it burns an ` +
      `enormous amount of usage and cannot finish a course. Check with /model, and tell erudeon that ` +
      `the model gate needs repairing.` + effortNote(payload.effort),
  });
}

let raw = "";
try {
  raw = readFileSync(0, "utf8");
} catch {
  process.exit(0); /** no payload is not a Composer call */
}
let payload = null;
try {
  payload = JSON.parse(raw);
} catch {
  process.exit(0);
}
main(payload ?? {});
