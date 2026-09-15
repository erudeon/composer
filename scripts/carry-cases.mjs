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
 * ── EVERYTHING HERE REFUSES RATHER THAN REPORTING A NUMBER ───────────────────────────────────────────
 *
 * This script exists because a step reported success for work it had not done, so it may not do that
 * itself. It refuses on a stimulus the source cannot supply, on two cases in one bank that cannot be
 * told apart, on a second `stems` run that would empty the sidecar, and on any declared part it did not
 * end up finding. And `bind` does not believe its own writes: it re-reads the bank afterwards and
 * checks every declared part is where it should be, because "the write returned OK" is the sentence
 * that cost the afternoon.
 *
 * ── THE MATCH IS ON WORDS, NEVER ON BYTES ────────────────────────────────────────────────────────────
 *
 * A stem sent as markdown is stored as a rich document and read back as markdown again, and the
 * serialiser is free to move an asterisk or a line break on the way. Matching a source case to the case
 * it became therefore compares a fingerprint of the words, not the text.
 *
 * Usage:
 *   node scripts/carry-cases.mjs stems <manifest.json> --course <sourceCourseId> --hub <sourceHub>
 *   node scripts/carry-cases.mjs bind  <manifest.json> --course <targetCourseId> --hub <targetHub>
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  bearerFor,
  noCredentialMessage,
  PRODUCTION_HUB,
} from "./credential.mjs";

const USAGE = `
Usage: node scripts/carry-cases.mjs stems|bind <manifest.json> --course <courseId> --hub <url>

  stems   read each case's stimulus off the source hub and declare it on the manifest's first part
  bind    move every part into the case the apply minted on the target hub

  --hub defaults to production. Name it on both stages when a course is moving in any other direction.
`.trim();

/* ── The pure half, which the check drives without a network ──────────────────────────────────────── */

/**
 * A stem read back is not the stem sent. Compare the words: markers stripped, whitespace collapsed,
 * lower case, and only as much as identifies it.
 */
export function fingerprint(stem) {
  return String(stem ?? "")
    .replace(/[*_`#>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .slice(0, 120);
}

/**
 * The cases of ONE bank, by fingerprint, and the ones that cannot be told apart.
 *
 * A `new Map(...)` over the list would keep the last of any pair that agrees for 120 characters and
 * silently bind both cases' parts into whichever `list_groups` returned second. A case series shares its
 * preamble by design, so this is ordinary input, not a pathological one: it is reported and refused.
 */
export function caseIndex(groups) {
  const byFingerprint = new Map();
  const ambiguous = [];
  for (const group of groups ?? []) {
    const key = fingerprint(group.stem);
    if (byFingerprint.has(key)) ambiguous.push(key);
    else byFingerprint.set(key, group.id);
  }
  return { byFingerprint, ambiguous };
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

/** A manifest whose first parts already carry a stimulus has been through `stems` already. */
export function alreadyDeclared(manifest) {
  return (manifest.topics ?? []).some((topic) =>
    (topic.questions ?? []).some(
      (question) => question.group?.stem !== undefined,
    ),
  );
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
 * The writes that move ONE LECTURE'S parts into their case, and every part this bank could not account
 * for.
 *
 * `entries` is that lecture's own cases and nothing else. Handed the whole sidecar, a lecture that
 * reuses a case elsewhere in the course would match this bank's `q1` against another lecture's `q1`,
 * because a question key is unique within a bank and not within a course, and absorb a standalone
 * question into a case it has nothing to do with.
 */
export function bindingWrites(entries, groupIdByFingerprint, storedByKey) {
  const writes = [];
  const unresolved = [];
  let already = 0;
  for (const entry of entries ?? []) {
    const groupId = groupIdByFingerprint.get(fingerprint(entry.stem));
    if (!groupId) {
      for (const key of entry.keys)
        unresolved.push({ key, why: "its case is not on the target hub" });
      continue;
    }
    for (const key of entry.keys) {
      const stored = storedByKey.get(key);
      if (!stored) {
        unresolved.push({ key, why: "no question with that key in this bank" });
        continue;
      }
      if (stored.question.group?.id === groupId) {
        already += 1;
        continue;
      }
      writes.push({
        questionId: stored.questionId,
        question: { ...stored.question, group: { id: groupId } },
      });
    }
  }
  return { writes, already, unresolved };
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
      body: JSON.stringify({
        jsonrpc: "2.0",
        id,
        method: "tools/call",
        params: { name: tool, arguments: { request } },
      }),
      redirect: "manual",
    }).catch((err) =>
      fail(
        `Could not reach ${hub}: ${err instanceof Error ? err.message : String(err)}`,
      ),
    );

    const text = await response.text();
    if (response.status === 401 || response.status === 403)
      fail(`${hub} refused the credential (HTTP ${response.status}).`, 2);
    if (response.status === 302)
      fail(
        `${hub} answered 302, so something in front of it wants a sign-in this cannot do.`,
        2,
      );

    let messages;
    try {
      messages = text.trimStart().startsWith("{")
        ? [JSON.parse(text)]
        : text
            .split("\n")
            .filter((line) => line.startsWith("data: "))
            .map((line) => JSON.parse(line.slice(6)));
    } catch {
      fail(
        `${tool}: the answer was not JSON (HTTP ${response.status}): ${text.slice(0, 300)}`,
      );
    }
    /*
     * The answer to THIS request or nothing. Falling back to the first message in the envelope turned an
     * unrelated reply into `{}`, which reads as an empty bank list: on `bind` that is "0 parts moved"
     * and exit 0, which is the failure shape this whole script exists to stop.
     */
    const message = messages.find((m) => m.id === id);
    if (!message)
      fail(
        `${tool}: the hub answered, but not this request (HTTP ${response.status}).`,
      );
    const errorText = message.error
      ? JSON.stringify(message.error)
      : message.result?.isError
        ? (message.result.content?.[0]?.text ?? "")
        : null;
    if (errorText !== null) {
      const wait = /Try again in (\d+) seconds/.exec(errorText);
      if (wait && attempt < 5) {
        process.stderr.write(
          `  the hub is pacing us, waiting ${Number(wait[1]) + 1}s\n`,
        );
        await sleep((Number(wait[1]) + 1) * 1000);
        continue;
      }
      fail(`${tool} ${request?.op ?? ""}: ${errorText.slice(0, 500)}`);
    }
    return JSON.parse(message.result?.content?.[0]?.text ?? "{}");
  }
}

/**
 * Every question of a bank, whole.
 *
 * Paged against the `total` the hub reports rather than against `hasMore` alone: a page flag this did
 * not recognise would break the loop after page one and every question past it would be invisible, which
 * this script would then report as parts it could not find. Running out of pages before the total is a
 * refusal.
 */
async function questionsOfBank(hub, token, bankId) {
  const rows = [];
  let total = null;
  for (let page = 1; page <= 200; page++) {
    const answer = await callTool(hub, token, "content_read", {
      op: "list_questions",
      bankId,
      detail: "full",
      page,
    });
    total = answer.total ?? total;
    rows.push(...(answer.rows ?? []));
    if (total !== null && rows.length >= total) break;
    if (!answer.hasMore && (answer.rows ?? []).length === 0) break;
    if (page === 200)
      fail(
        `Bank ${bankId}: more than 200 pages of questions, refusing to loop.`,
      );
  }
  if (total !== null && rows.length < total) {
    fail(
      `Bank ${bankId}: the hub says it holds ${total} questions and answered with ${rows.length}.`,
    );
  }
  return rows;
}

/** The questions of a bank as key to {questionId, question}. A key is unique within a bank, not a course. */
function byKey(rows) {
  const map = new Map();
  for (const row of rows) {
    const question = row.question ?? row;
    if (question?.key)
      map.set(question.key, { questionId: row.questionId ?? row.id, question });
  }
  return map;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help")) fail(USAGE, 0);
  if (args.length < 2) fail(USAGE);

  const stage = args[0];
  if (!["stems", "bind"].includes(stage))
    fail(`Unknown stage "${stage}".\n\n${USAGE}`);

  const flagValue = (name) => {
    const at = args.indexOf(name);
    if (at === -1) return undefined;
    const value = args[at + 1];
    // `--course --hub https://x` would otherwise take "--hub" as the course id and fail on the server.
    if (value === undefined || value.startsWith("--"))
      fail(`${name} needs a value.\n\n${USAGE}`);
    return value;
  };
  const courseId = flagValue("--course");
  const hub = flagValue("--hub") ?? PRODUCTION_HUB;
  if (!courseId) fail(`--course needs the course id on THIS hub.\n\n${USAGE}`);

  const file = args.find(
    (a, i) =>
      i > 0 &&
      !a.startsWith("--") &&
      args[i - 1] !== "--course" &&
      args[i - 1] !== "--hub",
  );
  if (!file) fail(`No manifest given.\n\n${USAGE}`);
  if (!fs.existsSync(file)) fail(`No such file: ${file}`);

  const token = await bearerFor(hub);
  if (!token) fail(noCredentialMessage(hub), 2);

  /* Named on every run, because this writes and it defaults to production. */
  console.log(
    `${stage} ${hub === PRODUCTION_HUB ? "→ PRODUCTION" : `→ ${hub}`}  course ${courseId}`,
  );

  const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
  const sidecarPath = path.join(
    path.dirname(file),
    `${path.basename(file, ".json")}.cases.json`,
  );

  if (stage === "stems") {
    /*
     * A second run finds no `group.id` at all, because the first run replaced them with stems. It would
     * declare nothing, report no missing case, and overwrite a good sidecar with an empty one, after
     * which `bind` moves nothing and says so as a success.
     */
    if (alreadyDeclared(manifest)) {
      fail(
        `${path.basename(file)} already carries its cases by their stimulus, so 'stems' has run on it.\n` +
          `Apply it and then run 'bind'. To start over, re-export the course.`,
      );
    }
    const banks = await callTool(hub, token, "content_read", {
      op: "list_banks",
      courseId,
    });
    const stemById = new Map();
    for (const bank of banks.rows ?? []) {
      const groups = await callTool(hub, token, "content_read", {
        op: "list_groups",
        bankId: bank.id,
      });
      for (const group of groups.rows ?? []) stemById.set(group.id, group.stem);
    }
    const { sidecar, missing } = declareCases(manifest, stemById);
    if (missing.length > 0) {
      fail(
        `The source hub has no stimulus for ${missing.length} case(s), so their parts would ask about a situation nobody is shown:\n  ${missing.join("\n  ")}`,
      );
    }
    const declared = Object.values(sidecar).reduce(
      (n, entries) => n + entries.length,
      0,
    );
    if (declared === 0) {
      console.log(
        `${path.basename(file)}: no multi-part cases in this course, so nothing to carry.`,
      );
      return;
    }
    fs.writeFileSync(sidecarPath, JSON.stringify(sidecar, null, 2));
    fs.writeFileSync(file, JSON.stringify(manifest, null, 2));
    console.log(
      `${path.basename(file)}: ${declared} case(s) declared by their stimulus. Apply, then run 'bind'.`,
    );
    return;
  }

  if (!fs.existsSync(sidecarPath))
    fail(
      `No ${path.basename(sidecarPath)} beside the manifest. Run 'stems' first.`,
    );
  const sidecar = JSON.parse(fs.readFileSync(sidecarPath, "utf8"));

  /*
   * A bank belongs to a lecture, so a lecture's cases are matched only against ITS bank. Without this,
   * a course that reuses one case in two lectures binds the wrong questions, because a question key is
   * unique within a bank and `q1` exists in every one of them.
   */
  const topics = await callTool(hub, token, "content_read", {
    op: "list_topics",
    courseId,
  });
  const slugByTopicId = new Map((topics.rows ?? []).map((t) => [t.id, t.slug]));
  const banks = await callTool(hub, token, "content_read", {
    op: "list_banks",
    courseId,
  });

  let bound = 0;
  let already = 0;
  const unresolved = [];
  const accountedFor = new Set();

  for (const bank of banks.rows ?? []) {
    const slug = slugByTopicId.get(bank.topicId);
    const entries = (slug && sidecar[slug]) || [];
    if (entries.length === 0) continue;

    const groups = await callTool(hub, token, "content_read", {
      op: "list_groups",
      bankId: bank.id,
    });
    const { byFingerprint, ambiguous } = caseIndex(groups.rows ?? []);
    if (ambiguous.length > 0) {
      fail(
        `Two cases in ${slug} open the same way for the first 120 characters, so their parts cannot be told apart. ` +
          `Give one of them a distinct opening line and re-run.`,
      );
    }

    const result = bindingWrites(
      entries,
      byFingerprint,
      byKey(await questionsOfBank(hub, token, bank.id)),
    );
    already += result.already;
    unresolved.push(
      ...result.unresolved.map((u) => `${slug}: ${u.key}, ${u.why}`),
    );

    for (let i = 0; i < result.writes.length; i += 20) {
      await callTool(hub, token, "exercises_questions", {
        op: "bulk_update",
        questions: result.writes.slice(i, i + 20),
      });
    }

    /*
     * READ IT BACK. `bulk_update` answering without an error is not the same as every part having moved,
     * and counting what was SENT is how a partial write reports a whole one.
     */
    const after = byKey(await questionsOfBank(hub, token, bank.id));
    for (const entry of entries) {
      const groupId = byFingerprint.get(fingerprint(entry.stem));
      for (const key of entry.keys) {
        const stored = after.get(key);
        if (stored && stored.question.group?.id === groupId) {
          accountedFor.add(`${slug}:${key}`);
          if (result.writes.some((w) => w.questionId === stored.questionId))
            bound += 1;
        }
      }
    }
  }

  const declaredKeys = Object.entries(sidecar).flatMap(([slug, entries]) =>
    entries.flatMap((entry) => entry.keys.map((key) => `${slug}:${key}`)),
  );
  const missed = declaredKeys.filter((key) => !accountedFor.has(key));

  console.log(
    `${path.basename(file)}: ${bound} part(s) moved into their case, ${already} already there.`,
  );
  if (missed.length > 0 || unresolved.length > 0) {
    fail(
      `${missed.length} declared part(s) are NOT in their case after this run:\n  ${[...new Set([...unresolved, ...missed])].join("\n  ")}\n` +
        `A student meeting one of these gets a question about a situation nobody showed them.`,
    );
  }
  console.log(`Every declared part is in its case, read back from ${hub}.`);
}

/*
 * The check imports the pure half above, so the command line only runs when this file IS the command.
 * `realpathSync` on both sides: `process.argv[1]` keeps a symlinked path (on macOS, /tmp) while
 * `import.meta.url` is already resolved, and the mismatch exits 0 in silence, which here is
 * indistinguishable from "there were no cases to carry".
 */
const invokedAs = process.argv[1] ? fs.realpathSync(process.argv[1]) : "";
if (invokedAs === fs.realpathSync(fileURLToPath(import.meta.url))) await main();
