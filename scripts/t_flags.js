/**
 * An author writes the flag INSIDE their own emphasis. Eating the opening `**` with the emoji leaves
 * its partner behind: `**🎯 Try** doing this` became `Try** doing this`, which draws a stray pair of
 * asterisks and loses the emphasis, and `**🎯 Note ...**` became a body ending in a bare `**`.
 * Thirteen callouts on one real course, every one of them silent.
 */
const assert = require("node:assert");
const { execFileSync } = require("node:child_process");
const { mkdtempSync, writeFileSync, mkdirSync, readFileSync } = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");

const dir = mkdtempSync(join(tmpdir(), "composer-flags-"));
mkdirSync(join(dir, "02-source"), { recursive: true });
mkdirSync(join(dir, "04-manifest"), { recursive: true });
writeFileSync(
  join(dir, "composer.json"),
  JSON.stringify({ course: "T", slug: "t", courseShell: { programCode: "nl-x-y-bsc-en-y1" } }),
);
writeFileSync(
  join(dir, "02-source", "source-of-record.md"),
  [
    "# Unit One",
    "",
    "## A Section",
    "",
    "Some ordinary prose so the section is not empty.",
    "",
    "**🎯 Try** doing this for all of them.",
    "",
    "More prose.",
    "",
    "## Another Section",
    "",
    "Prose here too.",
    "",
    "**💡 Note that this whole line is emphasised.**",
    "",
    "Closing prose.",
    "",
    "## A Third Section",
    "",
    "Prose again.",
    "",
    "🎯 A flag with no markers at all.",
    "",
    "Last prose.",
    "",
  ].join("\n"),
);

execFileSync("node", [join(__dirname, "build-manifest.mjs"), dir, "--unit", "1"], {
  encoding: "utf8",
});
const { topics } = JSON.parse(readFileSync(join(dir, "04-manifest", "manifest.json"), "utf8"));
const callouts = topics[0].blocks.filter((b) => b.type === "callout");

for (const c of [...callouts, ...topics[0].blocks.filter((b) => b.type === "prose")])
  for (const field of ["body", "title"])
    if (typeof c[field] === "string")
      assert.equal(c[field].split("**").length % 2, 1, `unbalanced markers in ${c.id}: ${c[field]}`);

const bodies = callouts.map((c) => c.body);
assert.ok(
  bodies.some((b) => b.startsWith("**Try** doing this")),
  `the author's emphasis must survive: ${JSON.stringify(bodies)}`,
);
/* A line the author emphasised WHOLE: both markers belonged to the flag, so both go with it. */
assert.ok(
  bodies.some((b) => b === "Note that this whole line is emphasised."),
  `a wholly emphasised line loses the wrapper with the flag: ${JSON.stringify(bodies)}`,
);
assert.ok(
  bodies.some((b) => b === "A flag with no markers at all."),
  `a bare flag still loses only its emoji: ${JSON.stringify(bodies)}`,
);
/* And the emoji never reaches a reader. */
for (const b of bodies) assert.ok(!/[🎯💡📌⚠️]/u.test(b), `an emoji survived: ${b}`);
/* The variant still comes from which flag it was. */
assert.deepEqual(
  callouts.map((c) => c.variant).sort(),
  ["exam-tip", "exam-tip", "intuition"].sort(),
  `variants: ${callouts.map((c) => `${c.variant}`)}`,
);

console.log("flags ok");

/*
 * A COLON-ENDED FLAG ANNOUNCES THE WHOLE LIST, not its first item. A recap of a ten-step cycle came
 * out as "the process with 10 steps: 1. Identify and Analyze Transactions", with the other nine left
 * in the prose behind it, and the reader's own lint is what noticed: an ordered list of one item.
 */
const listDir = mkdtempSync(join(tmpdir(), "composer-flaglist-"));
mkdirSync(join(listDir, "02-source"), { recursive: true });
mkdirSync(join(listDir, "04-manifest"), { recursive: true });
writeFileSync(
  join(listDir, "composer.json"),
  JSON.stringify({ course: "T", slug: "t", courseShell: { programCode: "nl-x-y-bsc-en-y1" } }),
);
writeFileSync(
  join(listDir, "02-source", "source-of-record.md"),
  [
    "# Unit One", "", "## A Section", "", "Prose so the section is not empty.", "",
    "🎯 To recap, the whole thing has three steps:", "",
    "1. The first step", "1. The second step", "1. The third step", "",
    "Closing prose.", "",
    "## Another Section", "", "More prose.", "",
    "🎯 The rule is this:", "", "One sentence, and only this one.", "",
    "A separate paragraph that must NOT be swallowed.", "",
  ].join("\n"),
);
execFileSync("node", [join(__dirname, "build-manifest.mjs"), listDir, "--unit", "1"], { encoding: "utf8" });
const listTopic = JSON.parse(readFileSync(join(listDir, "04-manifest", "manifest.json"), "utf8")).topics[0];
const listCallouts = listTopic.blocks.filter((b) => b.type === "callout");

const recap = listCallouts.find((c) => c.body.includes("three steps"));
assert.ok(recap, `the flagged recap should be a callout: ${JSON.stringify(listCallouts.map((c) => c.body))}`);
for (const step of ["The first step", "The second step", "The third step"])
  assert.ok(recap.body.includes(step), `the whole list belongs to it, missing ${step}: ${recap.body}`);

/* And a colon announcing a SENTENCE still takes one line, not everything after it. */
const sentence = listCallouts.find((c) => c.body.includes("The rule is this"));
assert.ok(sentence, "the second flag should be a callout too");
assert.ok(sentence.body.includes("One sentence, and only this one."), sentence.body);
assert.ok(
  !sentence.body.includes("must NOT be swallowed"),
  `a colon announcing a sentence takes one line: ${sentence.body}`,
);

console.log("flagged lists ok");
