/**
 * THE SHARED SCRIPTS CARRY NO COURSE'S RULE.
 *
 * apply-blocks and slice came into the plugin from the IBEB year 1 Accounting folder still holding its
 * one rule: every course came out of apply-blocks as "(FA) ..." and "(MA) ..." in a Financial or
 * Management Accounting series, numbered from 1 again after the tenth unit, and slice looked units up by
 * that series and so could not find unit 1 of any other course.
 *
 * So a course that is not Accounting goes through both, with a unit-blocks.mjs (without one apply-blocks
 * stops before it reaches anything) and more than ten units, and comes out with the titles, series and
 * numbers it went in with. Its numbers start at 0, as a course with a Week 0 does, so a slice that
 * picked by place in the document rather than by number would pick the wrong unit and fail here.
 *
 *   node scripts/t_series.mjs
 */
import assert from "node:assert";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const dir = mkdtempSync(join(tmpdir(), "composer-series-"));
mkdirSync(join(dir, "04-manifest"), { recursive: true });
writeFileSync(join(dir, "composer.json"), JSON.stringify({ course: "Applied Microeconomics" }));

/* Two series, as a course with lectures beside readings declares them, numbered 0 to 12. */
const topics = Array.from({ length: 13 }, (_, n) => ({
  number: n,
  series: n <= 10 ? "Lecture" : "Literature",
  slug: `unit-${n}`,
  title: n <= 10 ? `Lecture ${n}: Market Failures ${n}` : `Reading ${n}: Akerlof (1970)`,
  blocks: [{ id: `u${n}-b1`, type: "prose", body: `Unit ${n}.` }],
}));
writeFileSync(join(dir, "04-manifest", "manifest.json"), JSON.stringify({ course: {}, topics }));
writeFileSync(
  join(dir, "unit-blocks.mjs"),
  'export const OPS = { 1: [{ op: "rename", id: "u1-b1", to: "u1-opening" }] };\n',
);

const run = (script, ...args) => {
  const r = spawnSync("node", [join(HERE, script), dir, ...args], { encoding: "utf8" });
  assert.strictEqual(r.status, 0, `${script} failed:\n${r.stdout}${r.stderr}`);
};
const read = (name) => JSON.parse(readFileSync(join(dir, "04-manifest", name), "utf8")).topics;
const identity = (t) => ({ title: t.title, series: t.series, number: t.number, slug: t.slug });

run("apply-blocks.mjs");
const applied = read("manifest.json");
assert.strictEqual(applied[1].blocks[0].id, "u1-opening", "the op never ran, so this proves nothing");
assert.deepStrictEqual(applied.map(identity), topics.map(identity), "apply-blocks moved a title, series or number");

run("slice.mjs", "1", "12");
assert.deepStrictEqual(
  read("slice.json").map(identity),
  [topics[1], topics[12]].map(identity),
  "slice picked the wrong units, or changed them",
);

/* A unit the document does not have is refused rather than sliced to nothing. */
const r = spawnSync("node", [join(HERE, "slice.mjs"), dir, "13"], { encoding: "utf8" });
assert.notStrictEqual(r.status, 0, "slice accepted a unit the document does not have");

/* Nor is a number two units share: sending both would publish a lecture nobody asked for. */
const shared = read("manifest.json");
shared[12].number = 1;
writeFileSync(join(dir, "04-manifest", "manifest.json"), JSON.stringify({ course: {}, topics: shared }));
const twice = spawnSync("node", [join(HERE, "slice.mjs"), dir, "1"], { encoding: "utf8" });
assert.notStrictEqual(twice.status, 0, "slice sent two units for one number");

console.log("t_series: a course goes through apply-blocks and slice with its own titles, series and numbers");
