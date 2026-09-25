/**
 * A UNIT IS NAMED BY ITS CATEGORY AND ITS NUMBER AS READ, and its title carries neither.
 *
 * The platform prints "Module 6b" above a unit's title from the category it sits in and its number, and
 * refuses a unit whose category the course does not declare. So the builder writes what composer.json
 * settled: the categories once, each unit's number as a student reads it, and its title without the
 * designation the document's heading still carries. Everything supplied for a unit stays filed by its
 * build number, which `unit-keys.json` keeps against its address for every later step.
 *
 *   node scripts/t_naming.mjs
 */
import assert from "node:assert";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

const unit = (heading) => `# ${heading}\n\n## Section\n\nAn ordinary paragraph of teaching that must stay prose.\n`;
const headings = ["Lecture · Week 1: Markets", "Literature · Module 6b: Firms", "Lecture · Week 2: Prices"];

function course(composer) {
  const dir = mkdtempSync(join(tmpdir(), "composer-naming-"));
  mkdirSync(join(dir, "02-source"));
  mkdirSync(join(dir, "04-manifest"));
  writeFileSync(join(dir, "02-source", "source-of-record.md"), headings.map(unit).join("\n"));
  writeFileSync(
    join(dir, "composer.json"),
    JSON.stringify({
      course: "Business",
      courseShell: { programCode: "nl-eur-iba-bsc-en-y1", slug: "business", title: "Business" },
      ...composer,
    }),
  );
  return dir;
}

const SERIES = [
  { name: "Lecture", unit: "Lecture", plural: "Lectures", what: "the lecture weeks" },
  { name: "Literature", unit: "Module", plural: "Modules" },
];
const UNITS = [
  { title: headings[0], number: 1, shownTitle: "Markets", shownNumber: 1, series: "Lecture" },
  { title: headings[1], number: 2, shownTitle: "Firms", shownNumber: "6b", series: "Literature", subtitle: "Reading" },
  { title: headings[2], number: 3, shownTitle: "Prices", shownNumber: 2, series: "Lecture" },
];

/* The categories once, and each unit as a student reads it. */
{
  const dir = course({ structure: { containerWord: "Unit", series: SERIES }, units: UNITS });
  execFileSync("node", [join(HERE, "build-manifest.mjs"), dir], { encoding: "utf8" });
  const m = JSON.parse(readFileSync(join(dir, "04-manifest", "manifest.json"), "utf8"));

  assert.deepStrictEqual(m.course.series, [
    { name: "Lecture", unit: "Lecture", plural: "Lectures" },
    { name: "Literature", unit: "Module", plural: "Modules" },
  ]);
  assert.deepStrictEqual(
    m.topics.map((t) => [t.series, t.number, t.title]),
    [
      ["Lecture", 1, "Markets"],
      ["Literature", "6b", "Firms"],
      ["Lecture", 2, "Prices"],
    ],
  );
  assert.strictEqual(m.topics[1].subtitle, "Reading");
  assert.strictEqual(m.topics[0].subtitle, undefined);
  // The address is still the heading's, so settling the words never moves a published lecture.
  assert.ok(m.topics[1].slug.includes("module-6b"), m.topics[1].slug);

  // Every later step finds a unit by its build number, whatever a student reads.
  const keys = JSON.parse(readFileSync(join(dir, "04-manifest", "unit-keys.json"), "utf8"));
  assert.deepStrictEqual(Object.values(keys), [1, 2, 3]);
  execFileSync("node", [join(HERE, "slice.mjs"), dir, "3"], { encoding: "utf8" });
  const slice = JSON.parse(readFileSync(join(dir, "04-manifest", "slice.json"), "utf8"));
  assert.deepStrictEqual(slice.topics.map((t) => t.title), ["Prices"]);
}

/* A course with one run of units declares no category, and none is sent. */
{
  const dir = course({ structure: { containerWord: "Lecture", series: "one" } });
  execFileSync("node", [join(HERE, "build-manifest.mjs"), dir], { encoding: "utf8" });
  const m = JSON.parse(readFileSync(join(dir, "04-manifest", "manifest.json"), "utf8"));
  assert.strictEqual(m.course.series, undefined);
  assert.ok(m.topics.every((t) => t.series === undefined), JSON.stringify(m.topics.map((t) => t.series)));
  assert.deepStrictEqual(m.topics.map((t) => t.number), [1, 2, 3]);
}

/* A unit in a category composer.json never declared stops the build and says the line that fixes it. */
{
  const dir = course({
    structure: { containerWord: "Unit", series: [{ name: "Lecture", what: "the lectures" }] },
    units: UNITS,
  });
  const run = spawnSync("node", [join(HERE, "build-manifest.mjs"), dir], { encoding: "utf8" });
  assert.notStrictEqual(run.status, 0, "an undeclared category must stop the build");
  assert.match(run.stderr, /"Lecture", "Literature"/);
  assert.match(run.stderr, /structure\.series/);
}

console.log("t_naming: ok");
