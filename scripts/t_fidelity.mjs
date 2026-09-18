/**
 * EVERY WORD THE AUTHOR WROTE STILL REACHES A STUDENT.
 *
 * The case this exists for shipped. A clause inside a question option was rewritten so that "only
 * allowed for experiments" became "only allowed when the groups have been formed by randomisation":
 * the meaning survived, the author's words did not, and `push --verify`, the plan's source lint and
 * `handcraft-check` all passed it, because every one of them compares the course to itself.
 *
 * TWO SHAPES, AND ONLY ONE OF THEM FAILS. A line that never appears was moved or dropped, which is the
 * ordinary shape of building a course. A line that RUNS AND THEN STOPS is a corruption, because nothing
 * deliberately deletes the last four words of a sentence. A check that failed on both would fire on
 * every healthy course and be ignored inside a week.
 *
 *   node scripts/t_fidelity.mjs
 */
import assert from "node:assert";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

const SENTENCE =
  "No conclusion whatsoever may be drawn, because ANOVA is only allowed for experiments.";

const run = (topics) => {
  const dir = mkdtempSync(join(tmpdir(), "composer-fidelity-"));
  mkdirSync(join(dir, "04-manifest"), { recursive: true });
  writeFileSync(
    join(dir, "04-manifest", "manifest.json"),
    JSON.stringify({ version: 1, course: {}, topics }),
  );
  try {
    return { ok: true, out: execFileSync("node", [join(HERE, "fidelity-check.mjs"), dir], { encoding: "utf8" }) };
  } catch (e) {
    return { ok: false, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
};

const topic = (source, blocks, questions = []) => [
  { number: 1, title: "Lecture 1", source, blocks, questions },
];

/* THE REAL ONE: a question option rewritten so the sentence stops partway through. */
const rewritten = run(
  topic(`## A section\n\nSome ordinary teaching about variance and experiments.\n\n**C.** ${SENTENCE}`, [
    { id: "b1", type: "prose", body: "## A section\n\nSome ordinary teaching about variance and experiments." },
  ], [
    {
      key: "q1", type: "SINGLE", stem: "Which conclusion holds?", explanation: "The factor was not manipulated.",
      options: [
        { text: "There is an association but no causal claim", correct: true },
        { text: "No conclusion whatsoever may be drawn, because an ANOVA is only allowed when the groups have been formed by randomisation." },
      ],
    },
  ]),
);
assert.ok(!rewritten.ok, `a rewritten clause must FAIL:\n${rewritten.out}`);
assert.match(rewritten.out, /stops partway through/, rewritten.out);
assert.match(rewritten.out, /for experiments/, `and name the words that were lost:\n${rewritten.out}`);

/*
 * THE MASKING CASE, which the first version of this check could not see. "experiments" appears in the
 * lecture's own prose, so counting words against a pool of the unit's vocabulary finds nothing missing.
 * The sentence is what has to be looked for, not the words.
 */
assert.match(
  rewritten.out,
  /Lecture 1/,
  "the word being present elsewhere in the unit must not mask the gap",
);

/* THE SAME SENTENCE, INTACT: no finding, however it is split across blocks. */
const intact = run(
  topic(`## A section\n\nSome teaching.\n\n**C.** ${SENTENCE}`, [
    { id: "b1", type: "prose", body: "## A section\n\nSome teaching." },
  ], [
    {
      key: "q1", type: "SINGLE", stem: "Which conclusion holds?", explanation: "Because it was not manipulated.",
      options: [{ text: "An association only", correct: true }, { text: SENTENCE }],
    },
  ]),
);
assert.ok(intact.ok, `an intact sentence must pass:\n${intact.out}`);
assert.match(intact.out, /still reaches a student/, intact.out);

/* A WHOLE LINE GONE is a decision, reported and not failed: this is what keeps the check readable. */
const dropped = run(
  topic("## A section\n\nThe kept paragraph about variance.\n\nA removed heading nobody published here.", [
    { id: "b1", type: "prose", body: "## A section\n\nThe kept paragraph about variance." },
  ]),
);
assert.ok(dropped.ok, `a whole line moved or dropped must NOT fail:\n${dropped.out}`);
assert.match(dropped.out, /moved or dropped/, `but must be reported:\n${dropped.out}`);

/* A unit with no source is reported rather than silently passing, which is the weaker thing to be. */
const noSource = run([{ number: 1, title: "Lecture 1", blocks: [{ id: "b1", type: "prose", body: "Words." }] }]);
assert.match(noSource.out, /no source on this unit/, `an unchecked unit must say so:\n${noSource.out}`);

/* Scaffolding is the document's, not the author's: a table rule or a figure marker is never a finding. */
const scaffold = run(
  topic("## A section\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n\n[FIGURE:word/media/image1.png]\n\nReal prose here.", [
    { id: "b1", type: "prose", body: "## A section\n\nReal prose here." },
    { id: "b2", type: "table", caption: "A table", head: ["a", "b"], rows: [["1", "2"]] },
  ]),
);
assert.ok(scaffold.ok, `document scaffolding must not be a finding:\n${scaffold.out}`);

console.log("ok  a rewritten sentence fails, a moved line is reported, an intact course is silent");
