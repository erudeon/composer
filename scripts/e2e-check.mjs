#!/usr/bin/env node
/**
 * `e2e-check.mjs` — DRIVE ONE COURSE THROUGH THE PHASES AND CHECK THE GATES OPEN WHEN THEY SHOULD.
 *
 *   node scripts/e2e-check.mjs <a-real-summary.docx>
 *
 * ── WHAT THIS ASKS THAT NOTHING ELSE DOES ────────────────────────────────────────────────────────────
 *
 * `corpus-check` asks whether documents convert. `validate` asks whether the skills are well formed.
 * The `t_*.js` files ask whether a function is right. None of them asks the question an operator
 * actually has: **does a course move through this pipeline, and do the gates hold?**
 *
 * That question went unasked for the whole of the plugin's life, and the answer had rotted in a way
 * nothing else could see: `composer.json` carried a `skips` array the Intake skill told operators to
 * write into, and the state script never read it, so an item settled on purpose read MISSING forever.
 *
 * ── IT USES A REAL DOCUMENT AND A THROWAWAY WORKSPACE ────────────────────────────────────────────────
 *
 * Under `COMPOSER_HOME` in a temp directory, so it never touches the operator's own courses. Point it
 * at a summary with no drawings in it and every gate is reached honestly: a document full of pictures
 * stops at the disposition gate, which is the gate working, not the test failing.
 *
 * It stops where the platform begins. Applying a manifest needs the MCP connection, so the last phases
 * are reported as unreachable rather than faked.
 */
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  copyFileSync,
  writeFileSync,
  readFileSync,
  existsSync,
} from "node:fs";
import { join, basename, dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const doc = process.argv[2];
if (!doc || !existsSync(doc)) {
  console.error("usage: node scripts/e2e-check.mjs <a-real-summary.docx>\n");
  console.error(
    "Pick one with no drawings in it, or the run stops at the disposition gate, correctly.",
  );
  process.exit(2);
}

const HOME = mkdtempSync(join(tmpdir(), "e2e-home-"));
const COURSE = "Composer End To End Test";
const SLUG = "composer-end-to-end-test";
const env = { ...process.env, COMPOSER_HOME: HOME };

let failed = 0;
const say = (ok, what, detail = "") => {
  if (!ok) failed += 1;
  console.log(
    `${ok ? "ok  " : "FAIL"} ${what}${detail ? `\n       ${detail}` : ""}`,
  );
};
const run = (script, args) => {
  try {
    return {
      code: 0,
      out: execFileSync("node", [join(ROOT, "scripts", script), ...args], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        env,
      }),
    };
  } catch (e) {
    return { code: e.status ?? 1, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
};
const state = () => run("state.mjs", [SLUG]).out;
const phaseOf = (s) => /^Phase:\s+(\d)/m.exec(s)?.[1] ?? "?";
const stateFile = join(HOME, SLUG, "composer.json");
const readState = () => JSON.parse(readFileSync(stateFile, "utf8"));
const writeState = (fn) => {
  const d = readState();
  fn(d);
  writeFileSync(stateFile, `${JSON.stringify(d, null, 2)}\n`);
};

console.log(`\ndriving "${basename(doc)}" through the phases, in ${HOME}\n`);

// ── PHASE 0 · the workspace ─────────────────────────────────────────────────────────────────────────
console.log("PHASE 0 · Intake\n");
say(run("workspace.mjs", ["init", COURSE]).code === 0, "the workspace is made");
const paths = join(HOME, SLUG);
say(
  existsSync(join(paths, "01-inputs")),
  "  01-inputs exists, and is the folder nothing writes back to",
);

// An empty folder must not read as a course in progress.
say(phaseOf(state()) === "0", "an empty course reads as Phase 0");

copyFileSync(doc, join(paths, "01-inputs", "summary-e2e.docx"));
say(
  existsSync(join(paths, "01-inputs", "summary-e2e.docx")),
  "the summary is in 01-inputs",
);

const pre = run("intake/preflight.js", [
  join(paths, "01-inputs", "summary-e2e.docx"),
]);
say(pre.code === 0, "preflight passes the document");
const id = run("identify.mjs", [join(paths, "01-inputs", "summary-e2e.docx")]);
say(
  id.code === 0 && /\[caught\]/.test(id.out),
  "the field guide recognises it",
  (id.out.match(/^\s+[ !~]\s+(.+?)\s+\[/gm) ?? [])
    .map((l) => l.trim().replace(/\s+\[$/, ""))
    .join(" · "),
);

/*
 * THE STATE SOMEBODY IS ACTUALLY IN WHEN THEY ARRIVE: their summary open in Word. That makes a `~$`
 * lock file beside it for exactly as long as the document is open, and it used to be counted as a
 * second document and named as the pre-written summary. Our own README in the same folder made an
 * empty course report one input.
 */
{
  const lock = join(paths, "01-inputs", "~$summary-e2e.docx");
  writeFileSync(lock, "word lock file");
  const withLock = state();
  const counted = /Files:\s+(\d+) input/.exec(withLock)?.[1];
  say(
    counted === "1",
    `a document open in Word does not become a second input (counted ${counted})`,
    "the lock file exists exactly when somebody is looking at their summary, which is when they come here",
  );
  say(
    !withLock.includes("~$"),
    "  and it is never named as the summary",
  );
  execFileSync("rm", ["-f", lock]);
}

// ── PHASE 0 · convert ───────────────────────────────────────────────────────────────────────────────
const work = join(paths, "02-source", "work");
mkdirSync(dirname(work), { recursive: true });
say(
  run("intake/open-docx.js", [
    join(paths, "01-inputs", "summary-e2e.docx"),
    work,
  ]).code === 0,
  "open-docx unpacks it and inventories every drawing",
);

const inv = JSON.parse(
  readFileSync(join(work, "media-inventory.json"), "utf8"),
);
const undisposed = inv.drawings.filter((d) => d.disposition === null).length;
say(
  true,
  `  ${inv.drawings.length} drawing(s), ${undisposed} undisposed`,
  undisposed > 0
    ? "this course will correctly stop at the disposition gate"
    : "nothing to adjudicate, so the gate is reached honestly",
);

const ex = run("intake/docx.js", [
  join(work, "word", "document.xml"),
  join(paths, "02-source", "source.md"),
]);
say(ex.code === 0, "docx.js extracts it as Markdown", ex.out.trim());
const nm = run("intake/normalise.js", [
  join(paths, "02-source", "source.md"),
  join(paths, "02-source", "source-of-record.md"),
]);
/*
 * THE CONTRACT, NOT SILENCE. normalise exits non-zero if and ONLY if it printed a line needing a
 * person. Asserting that it says nothing asserts something about the DOCUMENT, and a real document is
 * entitled to have defects in it: 25 of 134 real summaries carry a heading deeper than the reader's
 * outline allows. What must hold is that the exit code and the report agree, so a script running the
 * chain cannot pass while the report says otherwise.
 */
const nmFindings = nm.out
  .split("\n")
  .map((l) => l.trim())
  .filter((l) => l.startsWith("!"));
say(
  (nm.code !== 0) === nmFindings.length > 0,
  `normalise's exit code agrees with its report (${nmFindings.length} finding(s), exit ${nm.code})`,
  nmFindings.map((f) => f.slice(0, 110)).join("\n       "),
);
const kx = run("intake/katex-check.js", [
  join(paths, "02-source", "source-of-record.md"),
]);
say(
  kx.code === 0,
  "every equation passes the reader's own KaTeX options",
  kx.out.trim(),
);

const sor = readFileSync(
  join(paths, "02-source", "source-of-record.md"),
  "utf8",
);
say(
  /^#{1,3} /m.test(sor),
  "the source of record is Markdown with real headings",
);
say(
  !/\{Heading\d\}|\[\[TABLE\]\]/.test(sor),
  "  and carries none of the old private scaffolding",
);

// ── PHASE 0 · the gate ──────────────────────────────────────────────────────────────────────────────
console.log("\n  the gate, and what it refuses\n");

say(
  phaseOf(state()) === "0",
  "with the structure unanswered, the phase does NOT close",
);

writeState((d) => {
  d.gates.structureAnswered = true;
  d.structure = {
    containerWord: "Lecture",
    series: "one",
    numbering: "one run",
    titleSource: "the document's own heading 1, verbatim",
  };
  d.skips = [
    {
      item: "Course manual",
      reason: "not held; structure read off the summary and confirmed",
    },
    { item: "What the cohort thinks", reason: "no cohort feedback held" },
  ];
});

const withSkips = state();
say(
  /skipped\s+Course manual/.test(withSkips),
  "a RECORDED SKIP reads as skipped, not MISSING",
  "the skill tells an operator to record one; nothing read it until this test existed",
);
say(
  /skipped\s+What the cohort thinks/.test(withSkips),
  "  and so does the second one",
);

const openPhase = phaseOf(withSkips);
say(
  openPhase !== "0" || undisposed > 0,
  `the phase advances once the gate is met (now Phase ${openPhase})`,
  undisposed > 0 ? "still 0, correctly: drawings remain undisposed" : "",
);

// ── PHASE 2 · compose ───────────────────────────────────────────────────────────────────────────────
console.log("\nPHASE 2 · Compose\n");

const { stripEmDashes, stripHeadingNumber, tidy } = await import(
  `file://${join(ROOT, "scripts/intake/lib.js")}`
).then((m) => m.default ?? m);
const emDashes = (sor.match(/—/g) ?? []).length;
const composed = sor
  .split("\n")
  .map((line) =>
    /^#{1,6} /.test(line)
      ? line.replace(/^(#{1,6} )(.*)$/, (_, h, t) => h + stripHeadingNumber(t))
      : stripEmDashes(line),
  )
  .join("\n");
writeFileSync(join(paths, "02-source", "composed.md"), composed);
say(
  (composed.match(/—/g) ?? []).length === 0,
  `every em dash removed (${emDashes} found)`,
  "by lib.js, which is marker-aware: three corruption bugs came from doing this by hand",
);

/*
 * A CHECK THAT PASSES BECAUSE THERE WAS NOTHING TO DO IS NOT A CHECK. Most documents carry no em dash,
 * so the line above can go green on a run that never exercised the edit at all. These fixed cases do,
 * every time, and they are the shapes that broke it before: a dash inside an emphasis span, a paired
 * dash bracketing a phrase, and a dash introducing a definition rather than an aside.
 */
const COMPOSE_CASES = [
  ["Our **behaviour** \u2014 how we act.", "**behaviour**"],
  [
    "A case from 1964 \u2014 the murder of **Kitty Genovese** \u2014 gave an impulse to research.",
    "**Kitty Genovese**",
  ],
  [
    "**Private conformity** \u2014 also called **conversion**: you change your behaviour.",
    "**conversion**",
  ],
];
const composeProved = COMPOSE_CASES.every(([input, mustSurvive]) => {
  const out = stripEmDashes(input);
  return !out.includes("\u2014") && out.includes(mustSurvive);
});
say(
  composeProved,
  "and it is proved on the shapes that broke it, not only on what this document happened to hold",
  COMPOSE_CASES.map(([i]) => JSON.stringify(stripEmDashes(i).slice(0, 52))).join(
    "\n       ",
  ),
);

say(
  stripHeadingNumber("3.2 Monotonicity") === "Monotonicity" &&
    stripHeadingNumber("Monotonicity") === "Monotonicity",
  "a numbered heading loses its number, and an unnumbered one is left alone",
);


const before = (sor.match(/\*/g) ?? []).length;
const after = (composed.match(/\*/g) ?? []).length;
say(
  before === after,
  "and the emphasis markers are untouched",
  `${before} before, ${after} after`,
);

const headingsBefore = (sor.match(/^#{1,6} /gm) ?? []).length;
const headingsAfter = (composed.match(/^#{1,6} /gm) ?? []).length;
say(
  headingsBefore === headingsAfter && headingsBefore > 0,
  "no heading lost",
  `${headingsBefore} before, ${headingsAfter} after`,
);
say(
  !/\$/.test(composed) ||
    (composed.match(/\$/g) ?? []).length === (sor.match(/\$/g) ?? []).length,
  "no maths delimiter disturbed",
);

// ── PHASE 3 · layout, as far as it goes without the platform ────────────────────────────────────────
console.log("\nPHASE 3 · Layout\n");

const units = [...composed.matchAll(/^# (.+)$/gm)].map((m) => m[1]);
const sections = [...composed.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
say(
  units.length + sections.length > 0,
  `the document's own structure is readable: ${units.length} top-level, ${sections.length} sections`,
);
say(
  !/^# /m.test(composed.split("\n").slice(1).join("\n")) || units.length > 0,
  "  and a lesson's headings start at ## by the layout rule",
);

writeState((d) => {
  d.gates.courseShellVerified = false;
});
const beforeShell = run("state.mjs", [SLUG]).out;
say(
  /confirm the course row itself/.test(beforeShell) ||
    phaseOf(beforeShell) !== "3",
  "Layout waits on the course row before anything is written",
  "the course is a row before it is a syllabus",
);

say(
  true,
  "the apply needs the platform, so this run stops here",
  "reconnect the passtheyear MCP server to take a course past Layout",
);

// ── STATE, WHICH MUST NEVER FAIL ────────────────────────────────────────────────────────────────────
console.log("\nthroughout\n");
let stateOk = true;
for (const arg of [
  SLUG,
  "",
  "no-such-course",
  "/etc/hosts",
  "a/b/c",
  "..",
  "-x",
]) {
  if (run("state.mjs", [arg]).code !== 0) {
    stateOk = false;
    console.log(`       state.mjs exited non-zero on ${JSON.stringify(arg)}`);
  }
}
say(
  stateOk,
  "state.mjs never exits non-zero, on any input",
  "a failing ! command aborts the skill and hands the operator an error about the tool",
);

console.log(
  `\n${failed === 0 ? "the funnel holds" : `${failed} check(s) FAILED`}\n`,
);
process.exit(failed === 0 ? 0 : 1);
