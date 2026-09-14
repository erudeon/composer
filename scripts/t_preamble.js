/**
 * A UNIT'S TEXT BEFORE ITS FIRST SUBHEADING IS STILL ITS TEXT.
 *
 * Sections were collected from `##` and `###` alone, so anything between the unit's own title and
 * its first subheading was collected by nothing and vanished. A unit with NO subheadings at all
 * therefore produced zero blocks: the build reported it, the lint passed it, and the publish door
 * refused it for having no body, three screens away from the cause.
 *
 * The opening run becomes a section of its own, with no heading of its own to print, which is
 * exactly what it is.
 */
const assert = require("node:assert");
const { execFileSync } = require("node:child_process");
const { mkdtempSync, writeFileSync, mkdirSync, readFileSync } = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");

const dir = mkdtempSync(join(tmpdir(), "composer-preamble-"));
mkdirSync(join(dir, "02-source"), { recursive: true });
mkdirSync(join(dir, "04-manifest"), { recursive: true });
writeFileSync(
  join(dir, "composer.json"),
  JSON.stringify({
    course: "T",
    slug: "t",
    courseShell: { programCode: "nl-x-y-bsc-en-y1" },
    units: [
      { number: 0, title: "Before you start" },
      { number: 1, title: "Straight lines" },
    ],
  }),
);
writeFileSync(
  join(dir, "02-source", "source-of-record.md"),
  [
    "# Before you start",
    "",
    "There is one exam at the end of the block.",
    "",
    "- Watch all the webcasts.",
    "- Practice the modelling exercises.",
    "",
    "A large part of the multiple choice leaned on simplifying algebraic expressions.",
    "",
    "# Straight lines",
    "",
    "A preamble that sits before this unit's first subheading.",
    "",
    "## The straight line",
    "",
    "A line is written $y = mx + c$.",
    "",
  ].join("\n"),
);

execFileSync("node", [join(__dirname, "build-manifest.mjs"), dir], { stdio: "pipe" });
const topics = JSON.parse(readFileSync(join(dir, "04-manifest", "manifest.json"), "utf8")).topics;

/* A unit with no subheadings at all still has a body. */
const zero = topics.find((t) => t.number === 0);
assert.ok(zero.blocks.length > 0, "a unit with no subheadings produced no blocks at all");
const all = JSON.stringify(zero.blocks);
for (const kept of ["one exam at the end", "Watch all the webcasts", "simplifying algebraic expressions"])
  assert.ok(all.includes(kept), `the unit lost its text: ${kept}`);

/* And a preamble before a unit's first subheading is kept, not dropped. */
const one = topics.find((t) => t.number === 1);
assert.ok(
  JSON.stringify(one.blocks).includes("preamble that sits before"),
  "a preamble before the first subheading was dropped",
);

console.log("t_preamble: a unit's opening text survives, with or without subheadings");
