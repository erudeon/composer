#!/usr/bin/env node
/**
 * Read a course back from a hub into a manifest FILE, so a copy to another environment is
 * `content:export` then `content:images` then `content:push`, disk to disk, and never a body re-typed
 * through a model.
 *
 * What it writes, next to each other in --out:
 *   <slug>.manifest.json   the course in the shape `content:push` takes (packages/core/src/content/manifest.ts)
 *   <slug>.figures.json    every storage key the bodies reference, with its alt: the OTHER half of a course,
 *                          because a key is minted per environment and per course and paints nothing
 *                          anywhere else. Pull the bytes, `content:images` them into the target, and
 *                          substitute the returned markdown before pushing.
 *   <slug>.report.json     counts and anything this could not carry.
 *
 * It reads through the same MCP tools a session uses (`content_read`), one stateless JSON-RPC call per
 * read, so it adds no door of its own.
 *
 * Usage: pnpm --filter web content:export --course <courseId> --out <dir> [--staging | --hub <url>]
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const HUBS = { production: "https://hub.passtheyear.com", staging: "https://hub.erudeon.com" };
const USAGE = `Usage: pnpm --filter web content:export --course <courseId> --out <dir> [--staging | --hub <url>]`;

const args = process.argv.slice(2);
if (args.length === 0 || args.includes("--help")) {
  console.log(USAGE);
  process.exit(args.length === 0 ? 1 : 0);
}
const flag = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};
const courseId = flag("--course");
const out = flag("--out");
if (!courseId || !out) fail(USAGE);
const hub = flag("--hub") ?? (args.includes("--staging") ? HUBS.staging : HUBS.production);

const token = process.env.PTY_MCP_TOKEN;
if (!token) fail("PTY_MCP_TOKEN is not set. Mint one on the hub's /account page; never paste it into a transcript.", 2);

const headers = {
  authorization: `Bearer ${token}`,
  "content-type": "application/json",
  accept: "application/json, text/event-stream",
  "mcp-protocol-version": "2025-06-18",
};
if (hub === HUBS.staging) {
  const id = process.env.CF_ACCESS_CLIENT_ID;
  const secret = process.env.CF_ACCESS_CLIENT_SECRET;
  if (!id || !secret) fail("Staging needs CF_ACCESS_CLIENT_ID and CF_ACCESS_CLIENT_SECRET.", 2);
  headers["CF-Access-Client-Id"] = id;
  headers["CF-Access-Client-Secret"] = secret;
}

function fail(message, code = 1) {
  console.error(message);
  process.exit(code);
}

let rpcId = 0;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/*
 * One stateless JSON-RPC call. The hub allows 60 calls a minute per credential and says so with the
 * seconds left in the window; a course is a few hundred reads, so waiting that out is the normal path,
 * not an error.
 */
async function call(tool, request) {
  for (let attempt = 0; ; attempt++) {
    const id = ++rpcId;
    const body = JSON.stringify({
      jsonrpc: "2.0",
      id,
      method: "tools/call",
      params: { name: tool, arguments: request === undefined ? {} : { request } },
    });
    let response;
    try {
      response = await fetch(`${hub}/api/mcp`, { method: "POST", headers, body, redirect: "manual" });
    } catch (err) {
      fail(`${tool}: could not reach ${hub}: ${err instanceof Error ? err.message : String(err)}`);
    }
    const text = await response.text();
    if (response.status === 401 || response.status === 403)
      fail(`${tool}: ${hub} refused the token (HTTP ${response.status}).`, 2);
    if (response.status === 302)
      fail(`${tool}: ${hub} answered 302 (Cloudflare Access headers missing or expired).`, 2);
    let messages;
    try {
      messages = text.trimStart().startsWith("{")
        ? [JSON.parse(text)]
        : text
            .split("\n")
            .filter((line) => line.startsWith("data: "))
            .map((line) => JSON.parse(line.slice(6)));
    } catch {
      fail(`${tool}: the answer was not JSON (HTTP ${response.status}): ${text.slice(0, 300)}`);
    }
    const message = messages.find((m) => m.id === id) ?? messages[0];
    if (!message) fail(`${tool}: no JSON-RPC message in the answer (HTTP ${response.status}): ${text.slice(0, 300)}`);
    const errorText = message.error
      ? JSON.stringify(message.error)
      : message.result?.isError
        ? (message.result.content?.[0]?.text ?? "")
        : null;
    if (errorText !== null) {
      const wait = /Rate limit exceeded.*?Try again in (\d+) seconds/.exec(errorText);
      if (wait && attempt < 5) {
        const seconds = Number(wait[1]) + 1;
        process.stderr.write(`  rate limited, waiting ${seconds}s\n`);
        await sleep(seconds * 1000);
        continue;
      }
      fail(`${tool} ${request?.op ?? ""}: ${errorText.slice(0, 600)}`);
    }
    return JSON.parse(message.result?.content?.[0]?.text ?? "");
  }
}

/* Every page of a paged read, so a course never comes back as its first fifty rows. */
async function pages(tool, request, rowsKey = "rows") {
  const rows = [];
  for (let page = 1; ; page++) {
    const answer = await call(tool, { ...request, page });
    rows.push(...(answer[rowsKey] ?? []));
    if (!answer.hasMore && (answer.pageCount === undefined || page >= answer.pageCount)) break;
    if (page > 200) fail(`${tool} ${request.op}: more than 200 pages, refusing to loop forever`);
  }
  return rows;
}

const ctx = await call("get_my_context");
console.log(
  `export ← ${ctx.server.deployment === "production" ? "PRODUCTION" : ctx.server.deployment} ${ctx.server.resourceUrl} (${ctx.server.commit})`,
);

const course = await call("content_read", { op: "get_course", courseId });

/*
 * The programme-year CODE is what the manifest names; the hub hands back an id and the names around it.
 * `taxonomy` 'tree' carries codes without ids, so the study is matched on university, study name,
 * language and year, and `resolve` confirms the id before the code is trusted.
 */
const tree = await call("taxonomy", { op: "tree" });
const programCode = await findProgramCode(tree, course);
if (!programCode)
  fail(
    `No programme-year code resolves to programId ${course.programId} (${course.universityName} / ${course.programName} / ${course.year}).`,
  );

async function findProgramCode(taxonomy, c) {
  const candidates = [];
  for (const university of taxonomy.universities ?? []) {
    if (university.name !== c.universityName) continue;
    for (const study of university.studies ?? []) {
      if (study.language !== c.language) continue;
      if (study.name !== c.programName && study.label !== c.programName) continue;
      for (const year of study.years ?? []) if (year.year === c.year) candidates.push(year.code);
    }
  }
  for (const code of candidates) {
    const hit = await call("taxonomy", { op: "resolve", value: code });
    if (hit.found && hit.id === c.programId) return code;
  }
  return null;
}

const topics = (await call("content_read", { op: "list_topics", courseId })).rows ?? [];
const banks = (await call("content_read", { op: "list_banks", courseId })).rows ?? [];
const bankByTopic = new Map(banks.filter((b) => b.topicId).map((b) => [b.topicId, b]));

const report = {
  hub,
  courseId,
  slug: course.slug,
  programCode,
  topics: 0,
  blocks: 0,
  questions: 0,
  glossary: 0,
  exams: 0,
  assessments: 0,
  figures: 0,
  warnings: [],
};
const figures = [];
const KEY = /^[0-9a-f]{48}$/;
const INLINE_IMAGE = /!\[([^\]]*)\]\(([0-9a-f]{48})(?:\s[^)]*)?\)/g;

/* The same walk the import's figure-key check makes: every string a block carries, however deep. */
function harvestFigures(block, topicSlug) {
  const seen = new Set();
  const note = (key, alt) => {
    if (seen.has(key)) return;
    seen.add(key);
    figures.push({ key, alt, topicSlug, blockId: block.id });
  };
  if (block.type === "figure" && typeof block.imageKey === "string" && KEY.test(block.imageKey))
    note(block.imageKey, block.alt ?? "");
  const walk = (value) => {
    if (typeof value === "string") for (const m of value.matchAll(INLINE_IMAGE)) note(m[2], m[1]);
    else if (Array.isArray(value)) for (const item of value) walk(item);
    else if (value && typeof value === "object") for (const item of Object.values(value)) walk(item);
  };
  walk(block);
}

/* A row's own id is its key: unique within the bank, stable across re-runs, and never typed by hand. */
function manifestQuestion(row) {
  const { topicId: _topicId, ...question } = row.question ?? {};
  return { key: row.id, ...question };
}

const manifestTopics = [];
for (const topic of topics) {
  const blocks = [];
  for (let from = 0; ;) {
    const lesson = await call("content_read", {
      op: "read_lesson",
      topicId: topic.id,
      detail: "full",
      from,
      limit: 1500,
    });
    blocks.push(...(lesson.blocks ?? []));
    if (!lesson.hasMore) break;
    from += lesson.blocks?.length ?? 0;
    if (!lesson.blocks?.length) break;
  }
  for (const block of blocks) harvestFigures(block, topic.slug);

  const bank = bankByTopic.get(topic.id);
  const questions = bank
    ? (await pages("content_read", { op: "list_questions", bankId: bank.id, detail: "full" })).map(manifestQuestion)
    : [];

  const entry = { slug: topic.slug, title: topic.title, number: topic.number };
  if (topic.subtitle) entry.subtitle = topic.subtitle;
  if (topic.series) entry.series = topic.series;
  if (blocks.length) entry.blocks = blocks;
  else report.warnings.push(`lecture "${topic.slug}" has no body; omitted 'blocks' so an apply leaves it alone`);
  if (questions.length) entry.questions = questions;
  manifestTopics.push(entry);
  report.topics += 1;
  report.blocks += blocks.length;
  report.questions += questions.length;
  console.log(`  ${topic.slug}: ${blocks.length} blocks, ${questions.length} questions`);
}

const slugByTopicId = new Map(topics.map((t) => [t.id, t.slug]));
const glossaryRows = await pages("content_read", { op: "list_glossary", courseId });
const glossary = [];
for (const row of glossaryRows) {
  if (typeof row.description !== "string" || row.description.trim() === "") {
    report.warnings.push(`glossary term "${row.term}" has no definition here; skipped, the manifest requires one`);
    continue;
  }
  const term = { term: row.term, definition: row.description };
  const topicSlug = row.firstSeenTopicId ? slugByTopicId.get(row.firstSeenTopicId) : undefined;
  if (topicSlug) term.topicSlug = topicSlug;
  glossary.push(term);
}
report.glossary = glossary.length;

const examRows = (await call("content_read", { op: "list_exams", courseId })).rows ?? [];
const exams = [];
for (const exam of examRows) {
  const entry = { slug: exam.slug, title: exam.title };
  if (exam.kind === "FINAL" || exam.kind === "MIDTERM") entry.kind = exam.kind;
  const bankId = exam.bankId ?? banks.find((b) => b.examId === exam.id)?.id;
  if (bankId) {
    const questions = (await pages("content_read", { op: "list_questions", bankId, detail: "full" })).map(
      manifestQuestion,
    );
    if (questions.length) entry.questions = questions;
    report.questions += questions.length;
  } else report.warnings.push(`exam "${exam.slug}" has no bank this read can see; its questions were not exported`);
  if (!entry.slug) {
    report.warnings.push(`exam "${exam.title}" has no slug; skipped`);
    continue;
  }
  exams.push(entry);
}
report.exams = exams.length;

const assessmentRows = (await call("content_read", { op: "list_assessments", courseId })).assessments ?? [];
const assessments = assessmentRows.map(({ kind, startsAt, endsAt, title, location }) => {
  const a = { kind, startsAt };
  if (endsAt) a.endsAt = endsAt;
  if (title) a.title = title;
  if (location) a.location = location;
  return a;
});
report.assessments = assessments.length;

const manifest = {
  version: 1,
  course: { slug: course.slug, programCode, title: course.title, topicTerm: course.topicTerm },
  topics: manifestTopics,
};
if (course.description) manifest.course.description = course.description;
if (course.termName) {
  const terms = (await call("content_read", { op: "list_terms", programId: course.programId })).terms ?? [];
  const term = terms.find((t) => t.termId === course.termId) ?? { name: course.termName };
  manifest.course.term = { name: term.name };
  if (term.startsOn) manifest.course.term.startsOn = term.startsOn;
  if (term.endsOn) manifest.course.term.endsOn = term.endsOn;
}
if (assessments.length) manifest.course.assessments = assessments;
if (exams.length) manifest.exams = exams;
if (glossary.length) manifest.glossary = glossary;
report.figures = figures.length;

await mkdir(out, { recursive: true });
/* Two programmes can teach one slug (an NL and an EN course), so the file is named by both. */
const base = path.join(out, `${programCode}--${course.slug}`);
await writeFile(`${base}.manifest.json`, JSON.stringify(manifest, null, 2) + "\n");
await writeFile(`${base}.figures.json`, JSON.stringify(figures, null, 2) + "\n");
await writeFile(`${base}.report.json`, JSON.stringify(report, null, 2) + "\n");
console.log(
  `\n${programCode} ${course.slug}: ${report.topics} lectures, ${report.blocks} blocks, ${report.questions} questions, ${report.glossary} glossary terms, ${report.exams} papers, ${report.figures} figure keys` +
    (report.warnings.length ? `\n${report.warnings.map((w) => `  ! ${w}`).join("\n")}` : "") +
    `\n→ ${base}.manifest.json`,
);
