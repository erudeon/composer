#!/usr/bin/env node
/**
 * SEND A COURSE'S FIGURES AS FILES, so their bytes never enter a model's context.
 *
 * `content_upload_image` takes one picture per call as base64, and a tool call's arguments are MODEL
 * OUTPUT: the caller must emit every byte of the encoding perfectly. Measured on Cognitieve Psychologie
 * (NL, y2): 58 figures, 8.1 MB on disk, about 10.8 MB as base64, roughly 2.7M tokens — and a single
 * 897 KB diagram is around 300K tokens on its own, past what a model can emit in one response at all.
 * The picture that will not fit is then either crushed until it does or quietly dropped, so the cost is
 * paid in the quality of what students see.
 *
 * `POST /api/mcp/content/images` takes the same bytes as a multipart body, with the same credential, the
 * same gates and the same writer. A file read from disk by this script costs the length of one command
 * line, and it arrives at full resolution.
 *
 * IT WRITES THE MARKDOWN MAP, which is the half a bare curl would leave to be done by hand. Keys are
 * minted by the storage driver and cannot be predicted, so a manifest can only reference a figure AFTER
 * it is uploaded: `<input>.uploaded.json` maps each file name to the exact markdown to paste, and a
 * manifest builder substitutes its `[FIGURE:x]` markers from that.
 *
 * Plain Node with no dependencies and no app runtime, so it runs in a fresh worktree before anything is
 * installed — which is exactly where a course gets built.
 */
import fs from "node:fs";
import path from "node:path";

/*
 * ONE HUB. Staging is not in the Composer's pipeline, in any mode, so this script cannot reach it.
 */
import {
  bearerFor,
  noCredentialMessage,
  PRODUCTION_HUB,
} from "./credential.mjs";

const USAGE = `
Usage: node scripts/images.mjs <figures.json> --course <courseId> [--hub <url>] [--show-request]

  <figures.json>   [{ "file": "image1.png", "alt": "What it shows", "topicId": "optional" }, ...]
                   File paths are relative to that file's own directory.
  --course <id>    The course every figure belongs to. Required.
  --hub <url>      Send somewhere else entirely.
  --show-request   Print the equivalent curl and exit, sending nothing.

Writes <figures.json>.uploaded.json: file name -> the markdown to paste into a lesson body.

Credential: none to arrange. The author approves this once in their browser and it renews itself
(node scripts/credential.mjs login). PTY_MCP_TOKEN in the environment still wins.
`.trim();

function fail(message, code = 1) {
  console.error(message);
  process.exit(code);
}

const args = process.argv.slice(2);
if (args.length === 0 || args.includes("--help") || args.includes("-h"))
  fail(USAGE, args.length === 0 ? 1 : 0);

const file = args.find((a) => !a.startsWith("--") && !isFlagValue(a));
function isFlagValue(candidate) {
  const index = args.indexOf(candidate);
  return (
    index > 0 && (args[index - 1] === "--course" || args[index - 1] === "--hub")
  );
}
if (!file) fail(`No figures file given.\n\n${USAGE}`);
if (!fs.existsSync(file)) fail(`No such file: ${file}`);

const courseFlag = args.indexOf("--course");
const courseId = courseFlag !== -1 ? args[courseFlag + 1] : undefined;
if (!courseId) fail(`--course <courseId> is required.\n\n${USAGE}`);

const hubFlag = args.indexOf("--hub");
const hub = hubFlag !== -1 ? args[hubFlag + 1] : PRODUCTION_HUB;
if (!hub) fail(`--hub needs a URL.\n\n${USAGE}`);

/*
 * PARSED HERE, so a malformed list is reported against the file rather than as a 422 from the far end.
 * Only the shape this script itself depends on is checked; the route validates the rest against the
 * schema it will actually store.
 */
let figures;
try {
  figures = JSON.parse(fs.readFileSync(file, "utf8"));
} catch (cause) {
  fail(
    `${file} is not valid JSON: ${cause instanceof Error ? cause.message : String(cause)}`,
  );
}
if (!Array.isArray(figures) || figures.length === 0) {
  fail(`${file} must be a non-empty JSON array of { file, alt, topicId? }.`);
}

const base = path.dirname(path.resolve(file));
const entries = figures.map((figure, index) => {
  if (!figure || typeof figure !== "object")
    fail(`Item ${index} is not an object.`);
  const { file: name, alt, topicId } = figure;
  if (typeof name !== "string" || name.length === 0)
    fail(`Item ${index} has no "file".`);
  /*
   * ALT TEXT IS REQUIRED, and refused here rather than by the server, because this is where the person
   * who can write it is standing. A figure a screen reader cannot describe is one some students cannot
   * use, and a bulk uploader is exactly where that gets skipped for speed.
   */
  if (typeof alt !== "string" || alt.trim().length === 0)
    fail(`Item ${index} (${name}) has no "alt" text.`);
  const full = path.resolve(base, name);
  if (!fs.existsSync(full)) fail(`Item ${index}: no such file: ${full}`);
  const bytes = fs.statSync(full).size;
  return { name: path.basename(name), alt, topicId, full, bytes };
});

const duplicates = entries
  .map((e) => e.name)
  .filter((name, index, all) => all.indexOf(name) !== index);
if (duplicates.length > 0) {
  // Parts are matched to manifest entries BY NAME, so two files sharing a basename would upload one twice.
  fail(
    `Two figures share the file name "${duplicates[0]}". Names must be unique within one push.`,
  );
}

/* The route's own ceilings. Past them it refuses the whole request, so the packing happens here. */
/*
 * EIGHT, NOT TWENTY. The route's own ceiling is 20 MB, and production refuses long before it: measured
 * on a real course, 7.6 MB was accepted and 11.1 MB and 12.8 MB were both refused. So a batch packed to
 * the documented limit fails on the first request of any course worth batching, and the refusal is
 * `422 "The request body must be multipart/form-data."`, which names neither the size nor the cause.
 * Eight is under the lowest refusal seen with room to spare: 174 pictures across two courses, no refusal.
 */
const MAX_BATCH_BYTES = 8 * 1024 * 1024;
const MAX_BATCH_FILES = 50;
const MAX_FILE_BYTES = 5 * 1024 * 1024;

const oversized = entries.filter((e) => e.bytes > MAX_FILE_BYTES);
if (oversized.length > 0) {
  fail(
    `${oversized[0].name} is ${(oversized[0].bytes / 1024 / 1024).toFixed(1)} MB; the limit is 5 MB per image.\n` +
      `Export it at a sensible size rather than sending a screenshot of a whole screen.`,
  );
}

/** Greedy packing by weight, so a course of any size is a handful of requests rather than one refusal. */
const batches = [];
let current = [];
let currentBytes = 0;
for (const entry of entries) {
  if (
    current.length > 0 &&
    (currentBytes + entry.bytes > MAX_BATCH_BYTES ||
      current.length >= MAX_BATCH_FILES)
  ) {
    batches.push(current);
    current = [];
    currentBytes = 0;
  }
  current.push(entry);
  currentBytes += entry.bytes;
}
if (current.length > 0) batches.push(current);

const url = `${hub}/api/mcp/content/images?courseId=${encodeURIComponent(courseId)}`;
const totalBytes = entries.reduce((sum, e) => sum + e.bytes, 0);

if (args.includes("--show-request")) {
  const headers = [`-H "Authorization: Bearer $PTY_MCP_TOKEN"`];
  const parts = batches[0]
    .map((e) => `-F "files=@${e.full}"`)
    .join(" \\\n    ");
  /* The variable is normally unset now: this is the hand-run form, for a machine with no browser. */
  console.log(
    `curl -X POST "${url}" \\\n    ${headers.join(" \\\n    ")} \\\n` +
      `    -F 'manifest=${JSON.stringify(batches[0].map(({ name, alt, topicId }) => ({ name, alt, ...(topicId ? { topicId } : {}) })))}' \\\n` +
      `    ${parts}`,
  );
  process.exit(0);
}

if (!(await bearerFor(hub))) fail(noCredentialMessage(hub), 2);

const accessHeaders = {};

console.log(
  `Uploading ${entries.length} figure${entries.length === 1 ? "" : "s"} ` +
    `(${(totalBytes / 1024 / 1024).toFixed(1)} MB) to ${hub} in ${batches.length} request${batches.length === 1 ? "" : "s"}.`,
);

const uploaded = [];
const failed = [];

for (const [index, batch] of batches.entries()) {
  const form = new FormData();
  form.append(
    "manifest",
    JSON.stringify(
      batch.map(({ name, alt, topicId }) => ({
        name,
        alt,
        ...(topicId ? { topicId } : {}),
      })),
    ),
  );
  for (const entry of batch) {
    form.append("files", new Blob([fs.readFileSync(entry.full)]), entry.name);
  }

  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${await bearerFor(hub)}`,
        ...accessHeaders,
      },
      body: form,
    });
  } catch (cause) {
    fail(
      `Request ${index + 1} failed: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }

  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    /*
     * An HTML body here means something other than the API answered: a login page, a proxy, or a gateway.
     * not something a script can complete.
     */
    fail(
      `Request ${index + 1}: ${response.status} did not return JSON.\n` +
        (text.trimStart().startsWith("<")
          ? "That is an HTML page, not the API. Check the hub URL and that your token is set."
          : text.slice(0, 400)),
    );
  }

  const perFile = Array.isArray(body.uploaded) || Array.isArray(body.failed);
  if (perFile) {
    /*
     * A REFUSAL THAT NAMES EACH FILE IS THE MOST USEFUL ANSWER THIS SCRIPT EVER GETS, and testing
     * `!response.ok` first threw it away: a 422 means NOTHING in that batch landed and a 207 means some
     * of it did, and BOTH carry `uploaded` and `failed` per file. Overwriting them with the status code
     * left the operator a wall of identical "answered 422" lines and no way to tell which picture was
     * too large, wrongly typed, or named twice.
     */
    uploaded.push(...(body.uploaded ?? []));
    failed.push(...(body.failed ?? []));
    const named = new Set(
      [...(body.uploaded ?? []), ...(body.failed ?? [])].map(
        (item) => item.name,
      ),
    );
    for (const entry of batch) {
      // Declared, sent, and mentioned in neither array. Silence about a file is a loss of that file.
      if (!named.has(entry.name)) {
        failed.push({
          name: entry.name,
          error: `request ${index + 1} answered ${response.status} without naming this file`,
        });
      }
    }
  } else {
    /*
     * A REQUEST THAT DID NOT ANSWER PER FILE HAS TO BE TREATED AS A LOSS OF EVERY FILE IN IT.
     *
     * A 500, a 413, a 400 or an auth refusal carries neither array, so pushing them appends nothing and
     * the run reports fewer figures than it was given WITHOUT reporting a single failure. On a course
     * big enough to need two requests that is the whole of the second batch going missing under a
     * success message, and the map file below would then be substituted into a manifest with those
     * markers pointing at nothing.
     */
    for (const entry of batch) {
      failed.push({
        name: entry.name,
        error: `request ${index + 1} answered ${response.status}`,
      });
    }
  }

  if (!response.ok) {
    console.error(
      `  request ${index + 1} of ${batches.length} failed: ${response.status} ${body.error ?? ""}`,
    );
    // An auth or budget refusal will refuse every remaining batch the same way; stop rather than repeat it.
    if ([401, 403, 429].includes(response.status)) {
      console.error(
        "  stopping: the remaining requests would be refused identically.",
      );
      break;
    }
  }
}

for (const item of uploaded)
  console.log(`  ok      ${item.name}  ${(item.bytes / 1024).toFixed(0)} KB`);
for (const item of failed) console.log(`  FAILED  ${item.name}  ${item.error}`);

/*
 * THE MAP IS WRITTEN EVEN AFTER A PARTIAL RUN, because a key is minted by the storage driver and exists
 * nowhere else: discarding it on failure would strand the objects already written. It is named as partial
 * so nobody substitutes it believing it is the whole course.
 */
if (uploaded.length > 0) {
  const mapFile = `${file}.uploaded.json`;
  const map = Object.fromEntries(
    uploaded.map((item) => [item.name, item.markdown]),
  );
  fs.writeFileSync(mapFile, `${JSON.stringify(map, null, 2)}\n`, "utf8");
  console.log(
    `\nMarkdown written to ${mapFile}. Substitute it into the manifest; do not rebuild it from the key.`,
  );
}

console.log(
  `\n${uploaded.length} uploaded, ${failed.length} failed, of ${entries.length} declared.`,
);
if (failed.length > 0) {
  console.error(
    `\nTHIS RUN IS INCOMPLETE. ${failed.length} figure${failed.length === 1 ? "" : "s"} did not upload, so ` +
      `${uploaded.length > 0 ? "the map above covers only part of the course" : "no map was written"}. ` +
      `Re-run for the missing files before pushing a manifest that references them.`,
  );
}
/* A count that does not add up is its own failure: something was neither uploaded nor reported. */
const accounted = uploaded.length + failed.length === entries.length;
if (!accounted)
  console.error(
    `\nBUG: ${entries.length - uploaded.length - failed.length} figures unaccounted for.`,
  );
/*
 * `process.exitCode`, NEVER `process.exit()`. This script has made real HTTP requests, and undici's
 * keep-alive sockets are still open when the last one resolves: calling `process.exit()` here aborts the
 * loop with those handles live, which on Windows trips a libuv assertion and leaves the shell with 127.
 * A clean run would then read as a failure to any `&&` chain that called it. Setting the code and
 * returning lets the loop drain and reports the number this script actually chose.
 */
process.exitCode = failed.length === 0 && accounted ? 0 : 1;
