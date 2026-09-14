#!/usr/bin/env node
/**
 * SEND A COURSE MANIFEST AS A FILE, so its bytes never enter a model's context.
 *
 * `content_import` takes a whole course in one MCP call, which fixed the round trips and not the cost:
 * the caller still has to EMIT every byte of the course into that call. Measured on a real upload, a
 * 341KB course is roughly 90,000 tokens in and 90,000 out before a single retry, and every re-emission
 * is a chance to corrupt text the upload exists to reproduce verbatim.
 *
 * `POST /api/mcp/content/import` takes the same manifest as a request body, with the same credential,
 * the same limits and the same gates. Bytes written to a file by a script never reach the model at all,
 * so the cost is the length of this command line.
 *
 * That route already existed and was already documented, and two uploads used the expensive door
 * anyway — one of them went hunting through stored credentials looking for a token and posted another
 * service's to this API. So this exists to make the cheap path the OBVIOUS one: no curl to remember, no
 * credential to go looking for, and a reply printed rather than dumped.
 *
 * PLAN IS THE DEFAULT. Writing takes `--apply`, spelled out, every time.
 *
 * Plain Node with no dependencies and no app runtime, so it runs in a fresh worktree before anything is
 * installed — which is exactly where a manifest gets built.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/*
 * ONE HUB. Staging is not in the Composer's pipeline, in any mode, with no exception, so this script
 * cannot reach it: a door that exists is a door somebody uses at 2am. The rehearsal is `plan`, which
 * pre-flights every block and question against production and writes nothing.
 */
const PRODUCTION_HUB = "https://hub.passtheyear.com";

const USAGE = `
Usage: node scripts/push.mjs <manifest.json> [--apply | --verify] [--hub <url>] [--show-request]

  (default)        plan: decide and report, write nothing
  --apply          run the operations
  --verify         read back what landed and compare it to this file; writes nothing
  --hub <url>      send somewhere else entirely
  --show-request   print the equivalent curl and exit, sending nothing

Credential: PTY_MCP_TOKEN in the environment. Mint your own in the Hub; it is yours, it is scoped to
what you can already reach, and it expires.
`.trim();

function fail(message, code = 1) {
  console.error(message);
  process.exit(code);
}

const args = process.argv.slice(2);
if (args.length === 0 || args.includes("--help") || args.includes("-h"))
  fail(USAGE, args.length === 0 ? 1 : 0);

const file = args.find((a) => !a.startsWith("--"));
if (!file) fail(`No manifest file given.\n\n${USAGE}`);
if (!fs.existsSync(file)) fail(`No such file: ${file}`);

const apply = args.includes("--apply");
/*
 * READ BACK WHAT LANDED. An apply reports per OPERATION — that a lecture was written, not that the body
 * now stored is the body the file declared — and the two came apart once on a published course with
 * every operation green. Writes nothing, so it is safe to run at any time.
 */
const verify = args.includes("--verify");
if (apply && verify)
  fail("--apply and --verify are different requests. Apply, then verify.");
const hubFlag = args.indexOf("--hub");
const hub = hubFlag !== -1 ? args[hubFlag + 1] : PRODUCTION_HUB;
if (!hub) fail(`--hub needs a URL.\n\n${USAGE}`);

const body = fs.readFileSync(file, "utf8");

/*
 * NOTHING GOES UP STILL DRAWN BY HAND.
 *
 * Every other check in this pipeline asks whether the write path will ACCEPT the file. It will accept
 * a journal entry drawn as a pipe table, a question asked in a paragraph, and an answer pointing at a
 * footnote, because all three are valid blocks. They are just not the blocks the author's material is
 * made of, and a course goes up looking built and reading dumped.
 *
 * It gates the SEND rather than the build, because the build is not the last word: a course folder
 * places its own elements over the derived file afterwards, and gating the build would refuse work
 * that is about to be done. Here the file is final.
 *
 * A plan is allowed through, because a plan writes nothing and seeing the operations is often how
 * somebody works out which element a passage wants.
 */
if (apply) {
  const handcraft = spawnSync(
    process.execPath,
    [path.join(path.dirname(fileURLToPath(import.meta.url)), "handcraft-check.mjs"), file],
    { encoding: "utf8" },
  );
  if (handcraft.stdout) process.stdout.write(handcraft.stdout);
  if (handcraft.status !== 0) {
    console.error(
      "\nNothing was sent. Each finding above names the block and the element it should be.\n" +
        "Place them, build again, and re-run. To see the operations first, drop --apply.",
    );
    process.exit(1);
  }
}
/*
 * PARSED HERE, so a JSON error is reported against the file rather than as a 400 from the far end. A
 * manifest is usually machine-written, and a builder that emitted something unparseable should be told
 * so before a request is made.
 */
try {
  JSON.parse(body);
} catch (cause) {
  fail(
    `${file} is not valid JSON: ${cause instanceof Error ? cause.message : String(cause)}`,
  );
}

const op = apply ? "apply" : verify ? "verify" : "plan";
const url = `${hub}/api/mcp/content/import${op === "plan" ? "" : `?op=${op}`}`;
const bytes = Buffer.byteLength(body);
/* The route's own ceiling. Past it a lecture is written with `content_lesson` 'append', which has none. */
const MAX_BYTES = 4 * 1024 * 1024;

if (args.includes("--show-request")) {
  const headers = [
    `-H "Authorization: Bearer $PTY_MCP_TOKEN"`,
    `-H "content-type: application/json"`,
  ];
  console.log(
    `curl -sS -X POST "${url}" \\\n  ${headers.join(" \\\n  ")} \\\n  --data-binary @${path.basename(file)}`,
  );
  process.exit(0);
}

const token = process.env.PTY_MCP_TOKEN;
if (!token) {
  fail(
    `PTY_MCP_TOKEN is not set, so there is no way to reach ${hub}.\n\n` +
      `Mint one for yourself in the Hub, under your own account. It is scoped to what you can already\n` +
      `reach, it expires, and it is yours: do not share it and do not paste it into a chat.\n\n` +
      `Then, in the same terminal you run this from:\n` +
      `  export PTY_MCP_TOKEN='<the token>'\n` +
      `  node scripts/push.mjs <file>            # plans, writes nothing\n` +
      `  node scripts/push.mjs <file> --apply    # writes\n\n` +
      `If you cannot mint one, use content_import over the MCP instead. It needs no token and always\n` +
      `works; it just costs the length of the course in tokens, which is a real cost and a better one\n` +
      `than a stalled upload.\n\n` +
      `DO NOT go hunting for a token in stored connections or another tool's config. An attempt at that\n` +
      `once posted an unrelated service's credential to this API.`,
    2,
  );
}

if (bytes > MAX_BYTES) {
  fail(
    `${file} is ${(bytes / 1024 / 1024).toFixed(2)} MB and this route takes 4 MB.\n` +
      `Split it by lecture — the import converges on slugs, so several files are one course — or write\n` +
      `the long bodies with content_lesson 'append', which has no ceiling.`,
  );
}

const headers = {
  authorization: `Bearer ${token}`,
  "content-type": "application/json",
};

/** A short line per finding, errors first, because those are what refuse the write. */
function printFindings(findings) {
  if (!Array.isArray(findings) || findings.length === 0) return;
  const order = { error: 0, warning: 1 };
  const sorted = [...findings].sort(
    (a, b) => (order[a?.severity] ?? 2) - (order[b?.severity] ?? 2),
  );
  console.log(`\nFindings (${findings.length}):`);
  for (const f of sorted)
    console.log(
      `  ${String(f?.severity ?? "?").toUpperCase()} ${f?.rule}  ${f?.where}\n    ${f?.message}`,
    );
}

/** The operations, rolled up by kind: the full list is long and says the same thing many times. */
function printOperations(operations) {
  if (!Array.isArray(operations)) return;
  if (operations.length === 0) {
    console.log("\nOperations: none — applying this would change nothing.");
    return;
  }
  const byOp = new Map();
  for (const op of operations) byOp.set(op?.op, (byOp.get(op?.op) ?? 0) + 1);
  console.log(`\nOperations (${operations.length}):`);
  for (const [op, count] of byOp)
    console.log(`  ${String(count).padStart(4)} × ${op}`);
  /*
   * A body write is a whole-array REPLACE, so WHICH lecture is rewritten is the one fact a plan exists to
   * show. The rolled-up count above cannot say it.
   */
  const rewrites = operations
    .filter((o) => o?.op === "write-lesson")
    .map((o) => o.slug ?? "?");
  if (rewrites.length > 0)
    console.log(`  lectures rewritten: ${rewrites.join(", ")}`);

  /*
   * AND WHAT AN OVERWRITE WOULD OVERWRITE WITH. A rolled-up count reading `1 × update-course` hides the
   * only thing an operator needs in order to say yes: a course's TITLE and container word are what a
   * student reads, and a manifest restores them on every run, so a file that quietly disagrees with a
   * correction somebody made in the Hub undoes it on the next apply and the count looks identical
   * either way. Same for a renamed lecture or paper.
   */
  for (const op of operations) {
    if (!op?.changes || Object.keys(op.changes).length === 0) continue;
    const what = Object.entries(op.changes)
      .map(([field, value]) => `${field} -> ${JSON.stringify(value)}`)
      .join(", ");
    console.log(`  ${op.op}${op.slug ? ` ${op.slug}` : ""}: ${what}`);
  }
}

/**
 * THE THREE THINGS THAT MUST NOT BE SKIMMED PAST.
 *
 * Each is absent from the reply unless it has something to say, so printing them plainly here costs
 * nothing on a clean run and is the whole point on a dirty one. `blocksRemoved` is the one that catches a
 * manifest quietly deleting content a published lecture already holds.
 */
function printWarnings(payload) {
  for (const key of ["blocksRemoved", "blocksUnknown", "orderNotApplied"]) {
    const value = payload?.[key];
    if (!value) continue;
    console.log(`\n!! ${key}`);
    console.log(`   ${value.note ?? ""}`);
    if (Array.isArray(value.byTopic)) {
      for (const topic of value.byTopic)
        console.log(`   ${topic.slug}: ${topic.blockIds?.join(", ")}`);
    }
    if (Array.isArray(value.slugs)) console.log(`   ${value.slugs.join(", ")}`);
    if (Array.isArray(value.blockedBy))
      console.log(`   blocked by: ${value.blockedBy.join(", ")}`);
  }
}

const deployment = hub === PRODUCTION_HUB ? "PRODUCTION" : hub;
console.log(
  `${op === "apply" ? "APPLY" : op} → ${deployment}  (${(bytes / 1024).toFixed(0)} KB)`,
);

let response;
try {
  response = await fetch(url, { method: "POST", headers, body });
} catch (cause) {
  fail(
    `Could not reach ${hub}: ${cause instanceof Error ? cause.message : String(cause)}`,
  );
}

const text = await response.text();
let payload;
try {
  payload = JSON.parse(text);
} catch {
  /*
   * A 302 to Cloudflare Access and a 401 both arrive as HTML or as a short string, and reading either as
   * "the plan is clean" is a mistake that has been made here before. The status is checked, not the shape.
   */
  fail(
    `HTTP ${response.status} from ${hub}, and the reply was not JSON:\n${text.slice(0, 500)}`,
  );
}

/* The MCP tools wrap their answer; the route may or may not. Read whichever shape came back. */
const result = payload?.result ?? payload;
printFindings(result?.findings);
printOperations(result?.operations);
printWarnings(result);

if (Array.isArray(result?.unmanaged) && result.unmanaged.length > 0) {
  console.log(
    `\nUnmanaged (${result.unmanaged.length}) — on the course, not named by this file. Never deleted:`,
  );
  /*
   * THE ID IS PRINTED FOR A GLOSSARY TERM, and for that reason only: it is the one unmanaged row a
   * course usually wants GONE — a term written the wrong way round, or renamed in a later draft, which
   * then sits in the flashcard deck forever because nothing an import does ever deletes. That rule is
   * deliberate and stays: a file that simply forgets a term must not remove it. So the deletion is a
   * separate, deliberate act, and `content_glossary` takes a termId nothing else here hands back.
   */
  for (const row of result.unmanaged.slice(0, 20))
    console.log(
      row.kind === "glossary-term"
        ? `  ${row.kind} ${row.title ?? row.id}   ${row.id}`
        : `  ${row.kind} ${row.title ?? row.id}`,
    );
  if (result.unmanaged.some((r) => r.kind === "glossary-term"))
    console.log(
      `\n  A glossary term you want gone is deleted on purpose, one call per term:\n` +
        `  content_glossary {"request":{"op":"delete","termId":"<the id above>"}}`,
    );
}

/*
 * THE READ-BACK'S VERDICT, PER LECTURE. `missing` is the shape a silent deletion takes: blocks the file
 * declares and the database does not hold. `unexpected` is ordinary after a person edited in the Hub and
 * suspicious straight after a full apply.
 */
if (op === "verify") {
  const topics = Array.isArray(result?.topics) ? result.topics : [];
  const damaged = topics.filter(
    (t) => t?.missing?.length > 0 || t?.stored === null || t?.exists === false,
  );
  console.log(
    `\nVerified ${topics.length} lecture(s): ${result?.matches ? "every one matches" : `${damaged.length} do not`}`,
  );
  for (const t of damaged) {
    if (t.exists === false) console.log(`  MISSING LECTURE ${t.slug}`);
    else if (t.stored === null) console.log(`  UNREADABLE      ${t.slug}`);
    else
      console.log(
        `  ${t.slug}: declared ${t.declared}, stored ${t.stored}, missing ${t.missing.join(", ")}`,
      );
  }
  /*
   * AND THE PAPERS. The read-back has compared a mock paper's questions and its draw since v2.3.7, and
   * this printed only the lectures — so a verify could say "every one matches" while a paper was short
   * of questions or a Hub edit held a draw the file contradicts. A `matches` of false with nothing
   * printed to explain it is worse than not asking.
   */
  const exams = Array.isArray(result?.exams) ? result.exams : [];
  const short = exams.filter(
    (e) =>
      e?.exists === false ||
      e?.missing?.length > 0 ||
      e?.unkeyed > 0 ||
      Object.keys(e?.settingsAdrift ?? {}).length > 0,
  );
  if (exams.length > 0) {
    console.log(
      `Verified ${exams.length} paper(s): ${short.length === 0 ? "every one matches" : `${short.length} do not`}`,
    );
    for (const e of short) {
      if (e.exists === false) console.log(`  MISSING PAPER   ${e.slug}`);
      else {
        if (e.missing?.length > 0)
          console.log(`  ${e.slug}: declared ${e.declared}, stored ${e.stored}, missing ${e.missing.join(", ")}`);
        if (e.unkeyed > 0)
          console.log(`  ${e.slug}: ${e.unkeyed} declared question(s) carry no key, so nothing compared them`);
        for (const [field, stored] of Object.entries(e.settingsAdrift ?? {}))
          console.log(`  ${e.slug}: the file names ${field}, the bank holds ${JSON.stringify(stored)}`);
      }
    }
  }

  if (!result?.matches) {
    fail(
      "\nWhat this file declares is NOT all stored. Re-send the whole file with --apply: a lesson body is " +
        "a replace, so the lectures already right are a no-op and the ones that are not are rewritten whole, " +
        "and a question converges on its key.",
    );
  }
  console.log(
    "\nEvery lecture this file declares a body for holds exactly those blocks" +
      (exams.length > 0 ? ", and every paper holds what it declares." : "."),
  );
  process.exit(0);
}

if (apply && Array.isArray(result?.results)) {
  const failed = result.results.filter((r) => r?.ok === false);
  const skipped = result.results.filter((r) => r?.skipped);
  console.log(
    `\nApplied ${result.applied ?? 0}, failed ${result.failed ?? 0}, skipped ${skipped.length}`,
  );
  for (const row of [...failed, ...skipped])
    console.log(
      `  ${row.ok ? "SKIP" : "FAIL"} ${row.op} ${row.where}\n    ${row.error ?? ""}`,
    );
}

if (!response.ok) {
  fail(`\nHTTP ${response.status}. Nothing was written.`);
}

if (result?.refused) {
  fail(
    `\nRefused: fix every finding with severity 'error' and send the file again. Nothing was written.`,
  );
}

if (apply && (result?.failed ?? 0) > 0) {
  fail(
    `\n${result.failed} operation(s) were refused. Correct the manifest and re-send the whole file: everything that landed is a no-op the second time.`,
  );
}

console.log(
  apply
    ? `\nDone. Verify with content_import 'verify' — an apply says a lecture was written, not that the stored body is the body you sent.`
    : `\nPlan only, nothing written. Re-run with --apply when it reads right.`,
);
