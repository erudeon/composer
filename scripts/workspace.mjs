#!/usr/bin/env node
/**
 * `workspace.mjs` — ONE PLACE ON THE OPERATOR'S MACHINE, THE SAME SHAPE EVERY TIME.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────────────────────────────
 *
 * A course takes days and several sessions. Between them the only thing that persists is the disk, so
 * where things are IS the memory: a session that opens tomorrow has to be able to tell, from files
 * alone, what was converted, what was sent, what came back and what is still open. A folder somebody
 * assembled by hand cannot answer that, and the previous version of this pipeline asked an operator to
 * "put everything in one folder", which is an instruction with a thousand right answers.
 *
 * So the structure is made, not requested. Numbered, because the order is the pipeline's order and a
 * person opening it in Finder should see the sequence without being taught it.
 *
 *   01-inputs     what the operator put in. NEVER modified: it is what everything is diffed against.
 *   02-source     the source of record, one file per unit, plus the media inventory.
 *   03-figures    the pictures and the map from file name to the markdown that references them.
 *   04-manifest   the current manifest, and versions/ holding every one actually SENT, with its reply.
 *   05-reports    what each phase reported, so a later session can read what happened rather than guess.
 *
 * ── WHY 01-inputs IS NEVER WRITTEN TO ────────────────────────────────────────────────────────────────
 *
 * Every fidelity rule in this pipeline compares something built against the text it came from. If the
 * source can be edited in place, the comparison is against a moving target and a clean diff proves
 * nothing. One upload's fidelity check normalised both sides with the same function, a bug cancelled
 * out, and ten welded-together words shipped. The folder makes that structural.
 *
 * ── WHY VERSIONS ARE OF WHAT WAS SENT, NOT OF WHAT WAS WRITTEN ───────────────────────────────────────
 *
 * A manifest on disk is a draft until it is pushed. What is worth keeping forever is the exact bytes
 * that reached the server and the exact reply, because that pair is the only evidence of what a course
 * looked like at a moment, and re-running "the same file" after an edit is how somebody concludes the
 * server changed under them.
 *
 *   node workspace.mjs init "<course name>"     make or repair the structure, print the paths
 *   node workspace.mjs path "<course name>"     print the paths for an existing course
 *   node workspace.mjs list                     every course in the workspace and its phase
 *   node workspace.mjs snapshot "<course>" <manifest.json> <reply.json|-> <label>
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  statSync,
} from "node:fs";
import { join, resolve, basename } from "node:path";
import { homedir } from "node:os";

/**
 * `~/Documents/Composer` by default, because Documents is where a person looks for their own work and
 * a hidden directory is where a tool hides its own. `COMPOSER_HOME` overrides it for anyone who keeps
 * their working files somewhere else, which on a Mac is usually a synced folder.
 */
export const WORKSPACE = process.env.COMPOSER_HOME
  ? resolve(process.env.COMPOSER_HOME)
  : join(homedir(), "Documents", "Composer");

const DIRS = [
  "01-inputs",
  "02-source",
  "03-figures",
  "04-manifest",
  "04-manifest/versions",
  "05-reports",
];

/**
 * A folder name a person can read and a machine can match. Lowercased, spaces and punctuation to
 * hyphens, because a name that differs only by case or by a stray space is two courses on one disk.
 */
export function courseSlug(name) {
  return String(name)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function coursePaths(name) {
  const slug = courseSlug(name);
  /*
   * A NAME THAT SLUGIFIES TO NOTHING IS NOT A COURSE NAME. `..`, `///` and `!!!` all reduce to an
   * empty string, and an empty segment joins to the workspace ROOT: the course folders would be made
   * directly in `~/Documents/Composer`, on top of everybody else's courses.
   */
  if (!slug) {
    throw new Error(
      `"${name}" is not a usable course name: it has no letters or digits in it. ` +
        `Name the course the way a person would say it.`,
    );
  }
  const root = join(WORKSPACE, slug);
  return {
    slug,
    root,
    inputs: join(root, "01-inputs"),
    source: join(root, "02-source"),
    figures: join(root, "03-figures"),
    manifest: join(root, "04-manifest"),
    versions: join(root, "04-manifest", "versions"),
    reports: join(root, "05-reports"),
    state: join(root, "composer.json"),
    findings: join(root, "findings.json"),
  };
}

/** Idempotent: safe to run on a course that already exists, which is how a resumed session starts. */
export function init(name) {
  const p = coursePaths(name);
  mkdirSync(p.root, { recursive: true });
  for (const d of DIRS) mkdirSync(join(p.root, d), { recursive: true });

  if (!existsSync(p.state)) {
    writeFileSync(
      p.state,
      `${JSON.stringify(
        {
          course: name,
          slug: p.slug,
          createdAt: new Date().toISOString(),
          mode: null,
          hub: null,
          courseId: null,
          gates: {},
          skips: [],
        },
        null,
        2,
      )}\n`,
    );
  }
  if (!existsSync(p.findings)) {
    writeFileSync(
      p.findings,
      `${JSON.stringify({ course: p.slug, openedAt: new Date().toISOString(), mode: null, lines: [] }, null, 2)}\n`,
    );
  }
  if (!existsSync(join(p.inputs, "README.txt"))) {
    writeFileSync(
      join(p.inputs, "README.txt"),
      [
        "Put the course's materials here, and then leave them alone.",
        "",
        "Nothing in this folder is ever edited by the Composer. Every check it runs compares what was",
        "built against what is in here, so if these files change the comparison proves nothing.",
        "",
        "In order of how much each matters:",
        "  1. the course manual",
        "  2. past exams, with their answer keys",
        "  3. teaching materials: slides, tutorials, the formula sheet",
        "  4. what the cohort thinks: frustrations, who they compare us to, what they say",
        "  5. the summary, as the file it came in",
        "",
        "A missing one does not stop the work. It gets written down, and a person has to accept it",
        "before the course can be published.",
        "",
      ].join("\n"),
    );
  }
  return p;
}

/**
 * Keep the exact bytes that were SENT and the exact reply, together, under one timestamp. This pair is
 * the only durable evidence of what a course was at a moment.
 */
export function snapshot(name, manifestPath, replyPath, label = "apply") {
  const p = coursePaths(name);
  if (!existsSync(p.versions))
    throw new Error(
      `no workspace for "${name}". Run: workspace.mjs init "${name}"`,
    );
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const base = `${stamp}-${courseSlug(label)}`;
  copyFileSync(manifestPath, join(p.versions, `${base}.manifest.json`));
  if (replyPath && replyPath !== "-" && existsSync(replyPath)) {
    copyFileSync(replyPath, join(p.versions, `${base}.reply.json`));
  }
  return join(p.versions, `${base}.manifest.json`);
}

function courses() {
  if (!existsSync(WORKSPACE)) return [];
  return readdirSync(WORKSPACE, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith("."))
    .map((d) => d.name);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , cmd, ...rest] = process.argv;
  try {
    if (cmd === "init" || cmd === "path") {
      const name = rest.join(" ").trim();
      if (!name) throw new Error(`usage: workspace.mjs ${cmd} "<course name>"`);
      const p = cmd === "init" ? init(name) : coursePaths(name);
      if (cmd === "path" && !existsSync(p.root))
        throw new Error(`no workspace for "${name}". Run init first.`);
      console.log(
        `${cmd === "init" ? "Workspace ready" : "Workspace"}: ${p.root}\n`,
      );
      console.log(`  01-inputs     ${p.inputs}`);
      console.log(`  02-source     ${p.source}`);
      console.log(`  03-figures    ${p.figures}`);
      console.log(`  04-manifest   ${p.manifest}`);
      console.log(`  05-reports    ${p.reports}`);
      console.log(`\n  state         ${p.state}`);
      console.log(`  findings      ${p.findings}`);
      if (cmd === "init")
        console.log(
          `\nPut the materials in 01-inputs. Nothing else writes there.`,
        );
    } else if (cmd === "list") {
      const all = courses();
      if (all.length === 0) {
        console.log(
          `No courses yet in ${WORKSPACE}.\nStart one: workspace.mjs init "<course name>"`,
        );
      } else {
        console.log(`${WORKSPACE}\n`);
        for (const slug of all) {
          const state = join(WORKSPACE, slug, "composer.json");
          let mode = "?";
          try {
            mode = JSON.parse(readFileSync(state, "utf8")).mode ?? "undecided";
          } catch {
            mode = "unreadable";
          }
          const versions = join(WORKSPACE, slug, "04-manifest", "versions");
          const sent = existsSync(versions)
            ? readdirSync(versions).filter((f) => f.endsWith(".manifest.json"))
                .length
            : 0;
          console.log(
            `  ${slug.padEnd(46)} mode ${String(mode).padEnd(10)} ${sent} sent`,
          );
        }
      }
    } else if (cmd === "snapshot") {
      const [name, manifestPath, replyPath, label] = rest;
      if (!name || !manifestPath)
        throw new Error(
          'usage: workspace.mjs snapshot "<course>" <manifest.json> <reply.json|-> [label]',
        );
      console.log(`Kept: ${snapshot(name, manifestPath, replyPath, label)}`);
    } else {
      console.log(
        [
          "workspace.mjs — one place for a course, the same shape every time.",
          "",
          `  init "<course name>"    make or repair the structure (safe to re-run)`,
          `  path "<course name>"    print the paths`,
          `  list                    every course and its phase`,
          `  snapshot "<course>" <manifest.json> <reply.json|-> [label]`,
          "",
          `Workspace: ${WORKSPACE}   (override with COMPOSER_HOME)`,
        ].join("\n"),
      );
    }
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
