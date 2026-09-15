#!/usr/bin/env node
/**
 * CARRY THE MULTI-PART CASES WHEN A COURSE MOVES BETWEEN HUBS, because nothing else does.
 *
 * ── WHAT WAS WRONG ───────────────────────────────────────────────────────────────────────────────────
 *
 * A course read back with `content:export` carries `group: {id}` on every part of every case, holding
 * the SOURCE hub's group id. That id names nothing on the target, so each part is refused with "Question
 * group not found" while its bank's standalone questions land. On 15 September 2026 that lost 54 of 180
 * questions across two courses, and the apply reported `Applied 58, failed 3`: a course that reads
 * finished from the catalogue, from the lecture count and from the glossary, and gives a student two
 * thirds of the practice it claims.
 *
 * ── WHY THE OBVIOUS FIX DOES NOT WORK ────────────────────────────────────────────────────────────────
 *
 * Writing the TARGET's group ids into the file and applying again reports success and changes nothing.
 * The import's question sync lists `group` under the fields a portable manifest cannot carry and drops
 * it from BOTH sides of its comparison, so a part whose only difference is the case it belongs to reads
 * as `unchanged` and is never written. That is deliberate: an id is correct on exactly one database.
 *
 * So a case crosses in two moves, and the second one is not a manifest at all:
 *
 *   `stems`  read each case's stimulus off the SOURCE hub and put it on the FIRST part, so the apply
 *            CREATES the case. Every later part has its `group` removed, because a second part carrying
 *            the same stem would mint a second case.
 *   ...apply the manifest...
 *   `bind`   read the cases the apply just minted, then move every remaining part into its case through
 *            `exercises_questions` 'bulk_update', which is the only door that can.
 *
 * ── THE MATCH IS ON WORDS, NEVER ON BYTES ────────────────────────────────────────────────────────────
 *
 * A stem sent as markdown is stored as a rich document and read back as markdown again, and the
 * serialiser is free to move an asterisk or a line break on the way. Matching a source case to the case
 * it became therefore compares a fingerprint of the words, not the text.
 *
 * Usage:
 *   node scripts/carry-cases.mjs stems <manifest.json> --course <sourceCourseId> [--hub <url>]
 *   node scripts/carry-cases.mjs bind  <manifest.json> --course <targetCourseId> [--hub <url>]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { bearerFor, noCredentialMessage, PRODUCTION_HUB } from "./credential.mjs";

const USAGE = `
Usage: node scripts/carry-cases.mjs stems|bind <manifest.json> --course <courseId> [--hub <url>]

  stems   read each case's stimulus off the source hub and declare it on the manifest's first part
  bind    move every part into the case the apply minted on the target hub
`.trim();

/* ── The pure half, which the check drives without a network ──────────────────────────────────────── */

/**
 * A stem read back is not the stem sent. Compare the words: markers stripped, whitespace collapsed,
 * lower case, and only as much as identifies it. Two cases in one bank never open the same way.
 */
export function fingerprint(stem) {
  return String(stem ?? "")
    .replace(/[*_`#>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .slice(0, 120);
}

/** The parts of each case a lecture declares, in the order the file lists them. */
export function casesOf(topic) {
  const cases = new Map();
  for (const question of topic.questions ?? []) {
    const id = question.group?.id;
    if (!id) continue;
    if (!cases.has(id)) cases.set(id, []);
    cases.get(id).push(question);
  }
  return cases;
}

/**
 * Declare every case on its first part and strip the rest, and answer with what the bind step will need.
 *
 * `stemById` comes from the source hub. A case the source cannot explain is a REFUSAL rather than a
 * silent drop: its parts would otherwise be written as standalone questions asking about a situation
 * the student is never shown.
 */
export function declareCases(manifest, stemById) {
  const sidecar = {};
  const missing = [];
  for (const topic of manifest.topics ?? []) {
    const cases = casesOf(topic);
    if (cases.size === 0) continue;
    sidecar[topic.slug] = [];
    for (const [id, parts] of cases) {
      const stem = stemById.get(id);
      if (!stem) {
        missing.push(`${topic.slug}: case ${id}`);
        continue;
      }
      parts[0].group = { stem };
      for (const part of parts.slice(1)) delete part.group;
      sidecar[topic.slug].push({ stem, keys: parts.map((p) => p.key) });
    }
  }
  return { sidecar, missing };
}

/**
 * The writes that move parts into their case: every declared part whose stored case is not the one its
 * stem minted. A part already in place is left alone, because an update bumps a version and stamps a row
 * for nothing.
 */
export function bindingWrites(sidecar, groupIdByFingerprint, storedByKey) {
  const writes = [];
  let already = 0;
  for (const entries of Object.values(sidecar)) {
    for (const entry of entries) {
      const groupId = groupIdByFingerprint.get(fingerprint(entry.stem));
      if (!groupId) continue; // a case of another bank, or not applied yet
      for (const key of entry.keys) {
        const stored = storedByKey.get(key);
        if (!stored) continue;
        if (stored.question.group?.id === groupId) {
          already += 1;
          continue;
        }
        writes.push({ questionId: stored.questionId, question: { ...stored.question, group: { id: groupId } } });
      }
    }
  }
  return { writes, already };
}

/* ── The half that talks to a hub ─────────────────────────────────────────────────────────────────── */

function fail(message, code = 1) {
  console.error(message);
  process.exit(code);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** One stateless JSON-RPC call, with the hub's own rate limit waited out rather than treated as an error. */
async function callTool(hub, token, tool, request) {
  for (let attempt = 0; ; attempt++) {
    const id = attempt + 1;
    const response = await fetch(`${hub}/api/mcp`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "mcp-protocol-version": "2025-06-18",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params: { name: tool, arguments: { request } } }),
      redirect: "manual",
    }).catch((err) => fail(`Could not reach ${hub}: ${err instanceof Error ? err.message : String(err)}`));

    const text = await response.text();
    if (response.status === 401 || response.status === 403) fail(`${hub} refused the credential (HTTP ${response.status}).`, 2);
    if (response.status === 302) fail(`${hub} answered 302, so something in front of it wants a sign-in this cannot do.`, 2);

    let messages;
    try {
      messages = text.trimStart().startsWith("{")
        ? [JSON.parse(text)]
        : text.split("\n").filter((line) => line.startsWith("data: ")).map((line) => JSON.parse(line.slice(6)));
    } catch {
      fail(`${tool}: the answer was not JSON (HTTP ${response.status}): ${text.slice(0, 300)}`);
    }
    const message = messages.find((m) => m.id === id) ?? messages[0];
    const errorText = message?.error
      ? JSON.stringify(message.error)
      : message?.result?.isError
        ? (message.result.content?.[0]?.text ?? "")
        : null;
    if (errorText !== null) {
      const wait = /Try again in (\d+) seconds/.exec(errorText);
      if (wait && attempt < 5) {
        process.stderr.write(`  the hub is pacing us, waiting ${Number(wait[1]) + 1}s\n`);
        await sleep((Number(wait[1]) + 1) * 1000);
        continue;
      }
      fail(`${tool} ${request?.op ?? ""}: ${errorText.slice(0, 500)}`);
    }
    return JSON.parse(message.result?.content?.[0]?.text ?? "{}");
  }
}

/** Every practice bank of a course, with its cases and, when asked, its questions whole. */
async function banksOf(hub, token, courseId, { withQuestions = false } = {}) {
  const banks = await callTool(hub, token, "content_read", { op: "list_banks", courseId });
  const out = [];
  for (const bank of banks.rows ?? []) {
    const groups = await callTool(hub, token, "content_read", { op: "list_groups", bankId: bank.id });
    const questions = [];
    if (withQuestions) {
      for (let page = 1; page < 50; page++) {
        const answer = await callTool(hub, token, "content_read", { op: "list_questions", bankId: bank.id, detail: "full", page });
        questions.push(...(answer.rows ?? []));
        if (!answer.hasMore) break;
      }
    }
    out.push({ id: bank.id, groups: groups.rows ?? [], questions });
  }
  return out;
}

/* The check imports the pure half above, so the command line only runs when this file IS the command. */
if (path.resolve(process.argv[1] ?? "") !== fileURLToPath(import.meta.url)) {
  // Imported, not run.
} else {
  await main();
}

async function main() {
const args = process.argv.slice(2);
if (args.includes("--help") || args.length < 2) fail(USAGE, args.length < 2 ? 1 : 0);

const stage = args[0];
if (!["stems", "bind"].includes(stage)) fail(`Unknown stage "${stage}".\n\n${USAGE}`);
const file = args.find((a, i) => i > 0 && !a.startsWith("--") && args[i - 1] !== "--course" && args[i - 1] !== "--hub");
if (!file) fail(`No manifest given.\n\n${USAGE}`);
if (!fs.existsSync(file)) fail(`No such file: ${file}`);
const courseId = args[args.indexOf("--course") + 1];
if (args.indexOf("--course") === -1 || !courseId) fail(`--course needs the course id on THIS hub.\n\n${USAGE}`);
const hub = args.indexOf("--hub") === -1 ? PRODUCTION_HUB : args[args.indexOf("--hub") + 1];

const token = await bearerFor(hub);
if (!token) fail(noCredentialMessage(hub), 2);

const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
const sidecarPath = path.join(path.dirname(file), `${path.basename(file, ".json")}.cases.json`);

if (stage === "stems") {
  const stemById = new Map();
  for (const bank of await banksOf(hub, token, courseId)) {
    for (const group of bank.groups) stemById.set(group.id, group.stem);
  }
  const { sidecar, missing } = declareCases(manifest, stemById);
  if (missing.length > 0) {
    fail(
      `The source hub has no stimulus for ${missing.length} case(s), so their parts would ask about a situation nobody is shown:\n  ${missing.join("\n  ")}`,
    );
  }
  const declared = Object.values(sidecar).reduce((n, entries) => n + entries.length, 0);
  fs.writeFileSync(sidecarPath, JSON.stringify(sidecar, null, 2));
  fs.writeFileSync(file, JSON.stringify(manifest, null, 2));
  console.log(`${path.basename(file)}: ${declared} case(s) declared by their stimulus. Apply, then run 'bind'.`);
} else {
  if (!fs.existsSync(sidecarPath)) fail(`No ${path.basename(sidecarPath)} beside the manifest. Run 'stems' first.`);
  const sidecar = JSON.parse(fs.readFileSync(sidecarPath, "utf8"));
  let bound = 0;
  let already = 0;
  for (const bank of await banksOf(hub, token, courseId, { withQuestions: true })) {
    const groupIdByFingerprint = new Map(bank.groups.map((g) => [fingerprint(g.stem), g.id]));
    const storedByKey = new Map();
    for (const row of bank.questions) {
      const question = row.question ?? row;
      if (question?.key) storedByKey.set(question.key, { questionId: row.questionId ?? row.id, question });
    }
    const result = bindingWrites(sidecar, groupIdByFingerprint, storedByKey);
    already += result.already;
    // In declared order, so part (b) takes its place before part (c).
    for (let i = 0; i < result.writes.length; i += 20) {
      const batch = result.writes.slice(i, i + 20);
      await callTool(hub, token, "exercises_questions", { op: "bulk_update", questions: batch });
      bound += batch.length;
    }
  }
  console.log(`${path.basename(file)}: ${bound} part(s) moved into their case, ${already} already there.`);
  console.log("Read it back: content_read 'list_groups' must report partCount equal to the parts each case declares.");
}
}
