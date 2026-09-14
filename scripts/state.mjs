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
import { join, resolve, extname } from "node:path";

import { WORKSPACE, coursePaths, courseSlug } from "./workspace.mjs";

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

/*
 * THE FINDINGS FILE, COUNTED ONCE. Publish refuses while any line is `open`, so a run that writes its
 * findings under a key this does not read passes that gate with open findings on the list. It happened:
 * a course carried three open lines under `findings` while `lines` sat empty and every count said zero.
 * A shape we do not recognise is therefore reported, never counted as nothing.
 */
function readFindings(path) {
  const f = safeJson(path);
  if (!f) return { open: 0, misplaced: null };
  if (Array.isArray(f.lines)) {
    const misplaced = Object.entries(f).find(([k, v]) => k !== "lines" && Array.isArray(v) && v.length);
    return {
      open: f.lines.filter((l) => l?.state === "open").length,
      misplaced: f.lines.length === 0 && misplaced ? misplaced[0] : null,
    };
  }
  const any = Object.entries(f).find(([, v]) => Array.isArray(v) && v.length);
  return { open: 0, misplaced: any ? any[0] : null };
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
        depth,
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

/**
 * WHAT THE OPERATOR PUT THERE, and nothing the pipeline generated from it.
 *
 * In a workspace that is `01-inputs`, which is the one folder nothing else writes to. In a loose folder
 * it is the top level only, because Convert unpacks a `.docx` into a work directory beside the
 * materials and every Word file contains `word/footnotes.xml` and `word/endnotes.xml`, both of which
 * match /notes/. Counting those reported a summary present in a folder holding none.
 */
/**
 * IS THIS ONE OF THE AUTHOR'S FILES, or is it something that is merely IN THE FOLDER?
 *
 * Two things live in `01-inputs` that nobody put there:
 *
 * WORD'S LOCK FILE. Opening `summary.docx` makes `~$summary.docx` beside it, and it exists for exactly
 * as long as the document is open. Which is to say: it is there whenever somebody is looking at their
 * summary, which is precisely when they come here. Counted, it reports two documents where there is
 * one, and it is listed BY NAME as the pre-written summary.
 *
 * AND OUR OWN README. `workspace.mjs` writes one into `01-inputs` to say what goes there, and counting
 * it means the folder never reads as empty: a student who has put nothing in yet is told they have one
 * input, which is the one moment the count has to be right.
 */
const NOT_THE_AUTHORS = (name) =>
  name.startsWith("~$") || name.startsWith(".") || name === "README.txt";

function inputFiles(files, structured) {
  const mine = structured
    ? files.filter((f) => f.path.includes("01-inputs"))
    : files.filter((f) => f.depth === 0);
  return mine.filter((f) => !NOT_THE_AUTHORS(f.name));
}

function classify(files) {
  const hits = {};
  for (const item of CHECKLIST) {
    hits[item.key] = files.filter((f) => item.match.test(f.name)).map((f) => f.name);
  }
  return hits;
}

/**
 * WHO IS THIS WAITING ON. A course waiting on a person is the only kind of stuck that does not fix
 * itself, so it is the one thing worth saying before anything else. Everything else is the operator's
 * to move, and saying so is more useful than silence.
 */
function blockedOn(phase, gates, openFindings) {
  if (phase === 3 && !gates.courseShellVerified)
    return "the author, to confirm the course itself: title, programme, period, container word, unit order";
  if (phase === 3 && !gates.unitOneAccepted) return "the author, to look at the first unit and say whether the rest should be built";
  if (phase === 5) return "the reviewer, to read the course as a student";
  if (phase === 6 && openFindings > 0) return `a person, to accept or close ${openFindings} open finding(s)`;
  if (phase === 6) return "the author, to say the word publish";
  return null;
}

/**
 * WHAT TO DO NEXT, IN THE OPERATOR'S WORDS. The pipeline's vocabulary is for the session: "gate unmet,
 * dispositions null" tells a person nothing they can act on. The first unmet thing, said plainly.
 */
function whatNext({ phase, missing, sourceOfRecord, undisposed, gates, structured }) {
  if (!structured) return 'This folder is not set up yet. Run workspace.mjs init "<course name>" and move the materials into 01-inputs.';
  if (phase > 0) return `Continue with ${PHASES[phase]}. Read that phase's skill before acting.`;

  const todo = [];
  if (sourceOfRecord.length === 0) todo.push("convert the summary so there is text to work from");
  if (undisposed === null) todo.push("inventory the pictures");
  else if (undisposed > 0) todo.push(`decide what happens to ${undisposed} picture(s)`);
  if (!gates.structureAnswered) todo.push("settle the course's own title, programme and period, and what a unit is called, how many series and how they are numbered");
  if (missing.length > 0) todo.push(`find ${missing.length} missing material(s): ${missing.map((m) => m.label.toLowerCase()).join(", ")}`);

  return todo.length ? `Next: ${todo[0]}.${todo.length > 1 ? ` Then ${todo.length - 1} more thing(s).` : ""}` : "Intake is done. Move to Compose.";
}

/** The course folders in the workspace, by name. Empty when there are none, and never a throw. */
function knownCourses() {
  try {
    return readdirSync(WORKSPACE, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith("."))
      .map((d) => d.name);
  } catch {
    return [];
  }
}

function listCourses() {
  try {
    const rows = readdirSync(WORKSPACE, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith("."))
      .map((d) => {
        const st = safeJson(join(WORKSPACE, d.name, STATE_FILE)) ?? {};
        const { open } = readFindings(join(WORKSPACE, d.name, "findings.json"));
        const g = st.gates ?? {};
        // The same ladder main() walks, read off the recorded gates alone.
        const phase = g.published ? 7 : g.reviewDone ? 6 : g.auditDone ? 5 : g.verifyMatched ? 4 : g.composeDone || g.composeSkipped ? 3 : g.analyzeDone || g.analyzeSkipped ? 2 : g.structureAnswered ? 1 : 0;
        const waiting = blockedOn(phase, g, open);
        return `  ${d.name.padEnd(44)} ${PHASES[phase].padEnd(16)} ${waiting ? `waiting on ${waiting.split(",")[0]}` : "yours to move"}`;
      });
    return rows.length ? rows.join("\n") : "  (none yet)";
  } catch {
    return "  (no workspace yet)";
  }
}

function main() {
  const given = (process.argv[2] ?? "").trim();

  /*
   * A NAME OR A PATH, because an operator has a course in mind and a tool has a directory. If what was
   * given is not a directory, it is treated as a course name and looked up in the workspace, which is
   * also what makes a resumed session able to find yesterday's work from the course's name alone.
   */
  let target = null;
  if (given) {
    const asPath = resolve(given);
    target = existsSync(asPath) ? asPath : coursePaths(given).root;
  }

  if (!target) {
    const courses = knownCourses();
    return [
      "COMPOSER: no course named yet.",
      "",
      /*
       * THE FIRST THING ANYBODY SEES, and for most people it is also the first time. Somebody arriving
       * here has a document, not a folder, and asking them for a path is asking them to already know
       * how this works. Ask for the COURSE, in the words they would use for it.
       */
      "Ask the author which course they are working on, by name, the way they would say it out loud:",
      '"Introduction to Mathematics", not a path. Then run this again with that name.',
      "",
      courses.length === 0
        ? [
            "Nothing is in progress, so this is a first course.",
            "",
            "Set it up with workspace.mjs init. Then ask where their files ARE rather than telling them",
            "where to put them: workspace.mjs add copies whatever they name into the course, and leaves",
            "the originals alone. Their summary, the course manual, past exams, whatever they have.",
            "",
            "They do not need to have everything. A missing input is written down and carried, not a stop.",
          ].join("\n")
        : [
            "Courses already in progress:",
            listCourses(),
            "",
            "Offer these before making a new one: somebody saying a course name usually means one of them,",
            "and a second folder for the same course splits the work in half without telling anyone.",
          ].join("\n"),
    ].join("\n");
  }

  if (!existsSync(target)) {
    return [
      `COMPOSER: no folder at ${target}`,
      "",
      "Nothing there yet. If this is a new course, make its workspace:",
      `  node scripts/workspace.mjs init "${given}"`,
      "",
      "Do not guess a neighbouring folder. A wrong source has cost hours that one question would save.",
    ].join("\n");
  }

  const files = walk(target);
  const state = safeJson(join(target, STATE_FILE));
  const structured = existsSync(join(target, "01-inputs"));
  const inputs = inputFiles(files, structured);
  const hits = classify(inputs);
  const sourceOfRecord = files.filter(
    (f) => /source-of-record/i.test(f.path) || (structured && f.path.includes("02-source") && /\.(md|txt)$/.test(f.name)),
  );
  const inventory = files.find((f) => f.name === "media-inventory.json");
  const findings = files.find(
    (f) => f.name === "findings.json" || f.name === "findings.md",
  );
  const manifest = files.find((f) => f.name.endsWith("manifest.json"));
  const docx = inputs.filter((f) => f.ext === ".docx");
  const pdfs = inputs.filter((f) => f.ext === ".pdf");

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
  /*
   * INTAKE'S GATE IS THREE THINGS, not one. Reading only "a source of record exists" let a run resume
   * the next morning believing Intake had closed, when no drawing had a disposition and the four
   * structure questions had never been asked. Asking those after unit 1 is the expensive mistake the
   * phase exists to prevent, so they are counted here rather than trusted.
   */
  const inventoryJson = inventory ? safeJson(inventory.path) : null;
  const undisposed = Array.isArray(inventoryJson?.drawings)
    ? inventoryJson.drawings.filter((d) => d?.disposition == null).length
    : null;
  /*
   * PARKED, NOT DECIDED. `later` closes Intake's gate for the unit being built and says nothing about
   * the rest, so it has to stay visible: a park that scrolls out of sight is the undisposed drawing
   * this gate exists to prevent, wearing a different word.
   */
  const parked = Array.isArray(inventoryJson?.drawings)
    ? inventoryJson.drawings.filter((d) => d?.disposition === "later").length
    : 0;

  let phase = 0;
  const intakeClosed =
    sourceOfRecord.length > 0 && inventory && findings && undisposed === 0 && gates.structureAnswered === true;
  if (intakeClosed) phase = 1;
  if (gates.analyzeDone || gates.analyzeSkipped) phase = 2;
  if (gates.composeDone || gates.composeSkipped) phase = 3;
  if (manifest && gates.verifyMatched) phase = 4;
  if (gates.auditDone) phase = 5;
  if (gates.reviewDone) phase = 6;
  if (gates.published) phase = 7;

  /*
   * A SKIP IS AN ANSWER, AND THIS USED TO IGNORE IT.
   *
   * Intake tells an operator to record a skip with its reason, and `composer.json` has a `skips` array
   * for exactly that. Nothing read it, so a checklist item settled deliberately went on reading MISSING
   * for the rest of the course's life: the phase could not close, and the operator who had already made
   * the call was told to make it again every time they ran this.
   *
   * Matched on the item's LABEL, which is what the skill shows a person and therefore what they write
   * down. A skip naming nothing on the checklist is left alone rather than guessed at.
   */
  const skipped = new Set(
    (Array.isArray(state.skips) ? state.skips : [])
      .map((s) => String(s?.item ?? "").trim().toLowerCase())
      .filter(Boolean),
  );
  const isSkipped = (item) => skipped.has(item.label.toLowerCase());
  const missing = CHECKLIST.filter(
    (c) => hits[c.key].length === 0 && !isSkipped(c),
  );

  const lines = [];
  lines.push(`COMPOSER STATE  ${target}`);
  if (!structured) {
    lines.push("");
    lines.push("This is a loose folder, not a Composer workspace. To give it the standard shape:");
    lines.push(`  node scripts/workspace.mjs init "<course name>"   then move the materials into 01-inputs`);
  }
  lines.push("");
  lines.push(
    `Mode:   ${mode ?? "undecided"}${modeWhy ? `  (${modeWhy})` : ""}`,
  );
  lines.push(`Phase:  ${PHASES[phase]}`);
  const { open: openFindings, misplaced } = readFindings(join(target, "findings.json"));
  const waiting = blockedOn(phase, gates, openFindings);
  lines.push(`Waiting on: ${waiting ?? "nobody, this is yours to move"}`);
  if (parked)
    lines.push(
      `        ${parked} drawing(s) parked for a unit nobody is building yet. Settle them before building theirs.`,
    );
  if (misplaced)
    lines.push(
      `        The findings list is under "${misplaced}" and every count here reads "lines", so open findings are\n` +
        `        invisible to the gate that gets them fixed. Move them to "lines" before going further; the shape\n` +
        `        is in composer/reference/findings-format.md.`,
    );
  lines.push(
    `Files:  ${inputs.length} input(s)  ·  ${docx.length} .docx  ·  ${pdfs.length} .pdf`,
  );
  if (state?.__unreadable)
    lines.push(
      `WARNING: ${STATE_FILE} is present but not valid JSON. Nothing recorded can be trusted.`,
    );
  lines.push("");

  lines.push("Checklist");
  for (const item of CHECKLIST) {
    const found = hits[item.key];
    const mark = found.length ? "present" : isSkipped(item) ? "skipped" : "MISSING";
    const detail = found.length
      ? `  (${found.slice(0, 3).join(", ")}${found.length > 3 ? ", ..." : ""})`
      : isSkipped(item)
        ? `  (${(state.skips.find((s) => String(s?.item ?? "").trim().toLowerCase() === item.label.toLowerCase())?.reason ?? "no reason recorded").slice(0, 72)})`
        : "";
    lines.push(`  ${mark.padEnd(8)} ${item.label}${detail}`);
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
      "  The folder is empty. Ask the author where their files are, copy them in, then run again.",
    );
  } else if (phase === 0) {
    /*
     * WHAT IS ACTUALLY MISSING, not the whole of Intake every time. A resumed run reads this block first,
     * and telling somebody to convert a summary they converted last night sends them back over work that
     * is done while the real gate, most often a drawing without a disposition, goes unnamed.
     */
    const todo = [];
    if (!sourceOfRecord.length) todo.push("pull the text out of the summary");
    if (!inventory) todo.push("inventory every drawing");
    if (!findings) todo.push("open the findings list");
    if (undisposed) todo.push(`decide what happens to ${undisposed} drawing(s) still without one`);
    if (!gates.structureAnswered)
      todo.push("settle the structure: ask the six questions in ONE message, a recommendation each");
    lines.push("  Phase 0, Intake. Still to do here:");
    for (const t of todo) lines.push(`    - ${t}`);
    /*
     * THE SUMMARY, not merely the first `.docx`. A course folder holds exams and teaching materials as
     * Word files too, and pointing the operator at a past exam paper as though it were the summary starts
     * the run by converting the wrong document, which is the exact failure this phase exists to prevent.
     * Where nothing is named like a summary, ask rather than pick.
     */
    const summaryFile = sourceOfRecord.length
      ? null
      : (docx.find((f) => CHECKLIST[4].match.test(f.name)) ?? null);
    if (summaryFile) {
      lines.push(
        `  Start with: node $CLAUDE_PLUGIN_ROOT/scripts/intake/open-docx.js "${summaryFile.path}" "${join(target, "work")}"`,
      );
    } else if (!sourceOfRecord.length && docx.length) {
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
      "Ask the author where the course folder is and try again. Do not guess a path,",
      "and do not proceed into a phase without knowing where the materials are.",
    ].join("\n"),
  );
}
process.exit(0);
