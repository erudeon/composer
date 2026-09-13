#!/usr/bin/env node
/**
 * `state.mjs` — WHERE IS THIS COURSE, ANSWERED BEFORE THE MODEL READS A WORD.
 *
 * The router skill opens with `` !`node ${CLAUDE_PLUGIN_ROOT}/scripts/state.mjs <folder>` ``. That command
 * runs at invocation and its OUTPUT is substituted into the skill body, so the session arrives already
 * knowing the mode, the phase and what is missing. The point is that placing a run in a phase is
 * arithmetic over a folder rather than a judgement the model makes from a directory listing.
 *
 * ── IT MUST NEVER EXIT NON-ZERO ──────────────────────────────────────────────────────────────────────
 *
 * A `!` command that fails ABORTS THE SKILL. So an operator whose folder is strange, whose path has a
 * typo, or who is simply in the wrong directory would get an error about this tool instead of an answer
 * about their course, at the one moment they know least about what is going on. Every failure is caught
 * and reported as output. The only correct exit code is 0.
 *
 * ── IT TAKES THE FOLDER, IT DOES NOT ASSUME IT ───────────────────────────────────────────────────────
 *
 * A person who has just installed a plugin is in their home directory, not in the course folder. Reading
 * `process.cwd()` would report an empty run for a course that has everything in it, one directory away.
 *
 * ── WHAT IT KNOWS AND WHAT IT CANNOT ─────────────────────────────────────────────────────────────────
 *
 * Everything here is derived from FILES. It cannot see production: whether the apply landed, whether
 * `verify` matched, whether anybody published. Those are recorded into `composer.json` by the phase that
 * did them, with a timestamp, because a `!` command cannot make a network call that might hang or 401
 * before there is a session to interpret the failure. So the phase is arithmetic over two things: what
 * is on disk, and what the run wrote down about what it did.
 */
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, resolve, basename, extname } from "node:path";

/** Recorded rather than derived: a run writes these down because no file implies them. */
const STATE_FILE = "composer.json";

const PHASES = [
  "0 Intake",
  "1 Analyze",
  "2 Compose",
  "3 Layout",
  "4 Audit",
  "5 Student View",
  "6 Publish",
  "7 Observe",
];

function safeRead(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

function safeJson(path) {
  const raw = safeRead(path);
  if (raw === null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    // A half-written state file is a fact about the run, not a reason to abort the skill.
    return { __unreadable: true };
  }
}

function walk(dir, depth = 0) {
  if (depth > 2) return [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out = [];
  for (const e of entries) {
    if (e.name.startsWith(".") || e.name === "node_modules") continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full, depth + 1));
    else {
      let size = null;
      try {
        size = statSync(full).size;
      } catch {
        /* a file that vanished between readdir and stat is simply unsized */
      }
      out.push({
        path: full,
        name: e.name,
        ext: extname(e.name).toLowerCase(),
        size,
      });
    }
  }
  return out;
}

/**
 * The five Intake inputs, in the document's own order of priority. A checklist item is met by a file
 * whose name says so, which is a weak test and an honest one: the operator confirms it, and a wrong
 * guess here costs a question rather than a bad write.
 */
const CHECKLIST = [
  {
    key: "courseManual",
    label: "Course manual",
    match: /manual|handbook|syllabus|studiegids/i,
  },
  {
    key: "pastExams",
    label: "Past exams with answer keys",
    match: /exam|tentamen|past.?paper|answer.?key|antwoord/i,
  },
  {
    key: "teachingMaterials",
    label: "Teaching materials (slides, tutorials, formula sheet)",
    match: /slide|lecture|tutorial|formula|college|werkgroep/i,
  },
  {
    key: "cohortVoice",
    label: "What the cohort thinks",
    match: /cohort|student.?voice|feedback|frustration|interview/i,
  },
  {
    key: "summary",
    label: "The pre-written summary",
    match: /summary|samenvatting|notes|compendium/i,
  },
];

function classify(files) {
  const hits = {};
  for (const item of CHECKLIST) {
    hits[item.key] = files
      .filter((f) => item.match.test(f.name))
      .map((f) => f.name);
  }
  return hits;
}

function main() {
  const target = process.argv[2] ? resolve(process.argv[2]) : null;

  if (!target) {
    return [
      "COMPOSER: no course folder given.",
      "",
      "Ask the operator which folder holds this course's materials, then run again with it.",
      "The folder holds the inputs; nothing is read from the chat and nothing is assumed from the",
      "working directory, because a person who has just installed a plugin is rarely standing in it.",
    ].join("\n");
  }

  if (!existsSync(target)) {
    return [
      `COMPOSER: no folder at ${target}`,
      "",
      "Ask the operator for the right path rather than guessing a neighbour of this one.",
      "A wrong or missing source has twice cost hours that a single question would have saved.",
    ].join("\n");
  }

  const files = walk(target);
  const state = safeJson(join(target, STATE_FILE));
  const hits = classify(files);

  const has = (n) =>
    files.some((f) => f.name === n || f.name.endsWith(`/${n}`));
  const sourceOfRecord = files.filter((f) => /source-of-record/i.test(f.path));
  const inventory = files.find((f) => f.name === "media-inventory.json");
  const findings = files.find(
    (f) => f.name === "findings.json" || f.name === "findings.md",
  );
  const manifest = files.find((f) => f.name.endsWith("manifest.json"));
  const docx = files.filter((f) => f.ext === ".docx");
  const pdfs = files.filter((f) => f.ext === ".pdf");

  // ── mode ───────────────────────────────────────────────────────────────────────────────────────────
  let mode = state?.mode ?? null;
  let modeWhy = mode ? "recorded in composer.json" : null;
  if (!mode) {
    if (docx.length > 0 || sourceOfRecord.length > 0) {
      mode = "summary";
      modeWhy = `a written summary is present (${docx.length} .docx, ${sourceOfRecord.length} source-of-record files)`;
    } else if (files.length === 0) {
      mode = null;
      modeWhy = "the folder is empty";
    } else {
      mode = "scratch";
      modeWhy = "no written summary found, so there is nothing to ingest yet";
    }
  }

  // ── phase ──────────────────────────────────────────────────────────────────────────────────────────
  const gates = state?.gates ?? {};
  let phase = 0;
  if (sourceOfRecord.length > 0 && inventory) phase = 1;
  if (gates.analyzeDone || gates.analyzeSkipped) phase = 2;
  if (gates.composeDone || gates.composeSkipped) phase = 3;
  if (manifest && gates.verifyMatched) phase = 4;
  if (gates.auditDone) phase = 5;
  if (gates.reviewDone) phase = 6;
  if (gates.published) phase = 7;

  const missing = CHECKLIST.filter((c) => hits[c.key].length === 0);

  const lines = [];
  lines.push(`COMPOSER STATE  ${target}`);
  lines.push("");
  lines.push(
    `Mode:   ${mode ?? "undecided"}${modeWhy ? `  (${modeWhy})` : ""}`,
  );
  lines.push(`Phase:  ${PHASES[phase]}`);
  lines.push(
    `Files:  ${files.length} in the folder  ·  ${docx.length} .docx  ·  ${pdfs.length} .pdf`,
  );
  if (state?.__unreadable)
    lines.push(
      `WARNING: ${STATE_FILE} is present but not valid JSON. Nothing recorded can be trusted.`,
    );
  lines.push("");

  lines.push("Checklist");
  for (const item of CHECKLIST) {
    const found = hits[item.key];
    const mark = found.length ? "present" : "MISSING";
    lines.push(
      `  ${mark.padEnd(8)} ${item.label}${found.length ? `  (${found.slice(0, 3).join(", ")}${found.length > 3 ? ", ..." : ""})` : ""}`,
    );
  }
  lines.push("");

  lines.push("Artefacts");
  lines.push(
    `  ${sourceOfRecord.length ? "yes" : "no "}  source of record   ${sourceOfRecord.length ? `(${sourceOfRecord.length} files)` : ""}`,
  );
  lines.push(
    `  ${inventory ? "yes" : "no "}  media inventory    ${inventory ? inventory.path.replace(target, ".") : ""}`,
  );
  lines.push(
    `  ${findings ? "yes" : "no "}  findings list      ${findings ? findings.path.replace(target, ".") : ""}`,
  );
  lines.push(
    `  ${manifest ? "yes" : "no "}  manifest           ${manifest ? manifest.path.replace(target, ".") : ""}`,
  );
  lines.push("");

  if (missing.length) {
    lines.push(
      `${missing.length} checklist item(s) missing. A missing item does NOT block the phases that follow.`,
    );
    lines.push(
      "It goes on the findings list and blocks Publish until somebody accepts it in writing.",
    );
    lines.push("");
  }

  lines.push("Next");
  if (!mode) {
    lines.push(
      "  The folder is empty. Ask the operator to put the materials in it, then run again.",
    );
  } else if (phase === 0) {
    lines.push(
      "  Phase 0, Intake. Convert the summary, inventory every drawing, open the findings list,",
    );
    lines.push(
      "  and ask the four structure questions in ONE message with a recommendation each.",
    );
    /*
     * THE SUMMARY, not merely the first `.docx`. A course folder holds exams and teaching materials as
     * Word files too, and pointing the operator at a past exam paper as though it were the summary starts
     * the run by converting the wrong document, which is the exact failure this phase exists to prevent.
     * Where nothing is named like a summary, ask rather than pick.
     */
    const summaryFile =
      docx.find((f) => CHECKLIST[4].match.test(f.name)) ?? null;
    if (summaryFile) {
      lines.push(
        `  Start with: node $CLAUDE_PLUGIN_ROOT/scripts/intake/open-docx.js "${summaryFile.path}" "${join(target, "work")}"`,
      );
    } else if (docx.length) {
      lines.push(
        `  ${docx.length} Word file(s) here and none named like a summary. ASK which one it is before converting.`,
      );
    }
  } else {
    lines.push(`  ${PHASES[phase]}. Read that phase's skill before acting.`);
  }

  return lines.join("\n");
}

try {
  console.log(main());
} catch (err) {
  // The whole point: a failure here is a REPORT, never an exit code, because a non-zero exit would
  // abort the skill and leave the operator with nothing at all.
  console.log(
    [
      "COMPOSER: could not read the folder.",
      "",
      `Reason: ${err && err.message ? err.message : String(err)}`,
      "",
      "Ask the operator for the course folder's path and try again. Do not guess a path,",
      "and do not proceed into a phase without knowing where the materials are.",
    ].join("\n"),
  );
}
process.exit(0);
