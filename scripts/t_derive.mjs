/**
 * WHAT THE BUILDER DERIVES THAT IT USED TO LEAVE AS PROSE.
 *
 * Every case here is something a real two-language Statistics course shipped, or would have shipped if
 * anybody had used this script on it instead of writing a parser by hand:
 *
 *   - the ANSWER KEY printed in the lecture body, under the questions, for a student to read;
 *   - 348 pictures as `![alt](key)` inside prose, so alt stopped being a field and the caption under
 *     each one stayed an italic paragraph;
 *   - the closing recap built as one more section, because the recap names were English only and the
 *     document said "Brief overview" and "Kort overzicht";
 *   - no inline check in any unit, on a course where every unit had ten questions;
 *   - a table of contents published as the first lecture in the syllabus.
 *
 * The question lift is detected BY SHAPE and never by the heading's words, so the same fixture is run
 * in two languages: a word list would have to grow once per language for ever, and this is the check
 * that says it does not.
 *
 *   node scripts/t_derive.mjs
 */
import assert from "node:assert";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

/** A unit in either language, with the same shape and none of the same words. */
const unit = (t) => `
# ${t.unit}

## ${t.section}

An ordinary paragraph of teaching that must stay prose.

![${t.alt}](${"a".repeat(48)})

*${t.caption}*

A paragraph after the picture, which is prose and not a caption.

## ${t.recap}

${t.recapBody}

## ${t.questionsHeading}

**1.** ${t.stem}

**A.** ${t.right}

**B.** ${t.wrong}

**2.** ${t.stem} (2)

**A.** ${t.right}

**B.** ${t.wrong}

**3.** ${t.stem} (3)

**A.** ${t.right}

**B.** ${t.wrong}

### ${t.answersHeading}

**1.** A ${"—"} ${t.why}

**2.** A ${"—"} ${t.why}

**3.** A ${"—"} ${t.why}
`;

const build = (source, shell = {}) => {
  const dir = mkdtempSync(join(tmpdir(), "composer-derive-"));
  mkdirSync(join(dir, "02-source"), { recursive: true });
  mkdirSync(join(dir, "04-manifest"), { recursive: true });
  writeFileSync(join(dir, "02-source", "source-of-record.md"), source);
  writeFileSync(
    join(dir, "composer.json"),
    JSON.stringify({
      course: "t",
      slug: "t",
      courseShell: { programCode: "nl-eur-psy-bsc-en-y2", slug: "t", title: "T", topicTerm: "Unit" },
      ...shell,
    }),
  );
  try {
    const out = execFileSync("node", [join(HERE, "build-manifest.mjs"), dir], { encoding: "utf8" });
    return { ok: true, out, manifest: JSON.parse(readFileSync(join(dir, "04-manifest", "manifest.json"), "utf8")) };
  } catch (e) {
    return { ok: false, out: `${e.stdout ?? ""}${e.stderr ?? ""}`, manifest: null };
  }
};

const LANGUAGES = [
  {
    name: "English",
    unit: "Lecture 1: Inference", section: "Why it matters", recap: "Brief overview",
    recapBody: "The whole unit in three lines.", questionsHeading: "10 Multiple-choice questions",
    answersHeading: "Answers", stem: "Which test applies?", right: "A chi-square test",
    wrong: "A paired t-test", why: "The variables are categorical.",
    alt: "A scatterplot of x against y", caption: "Figure: the relationship",
  },
  {
    name: "Dutch",
    unit: "Hoorcollege 1: Inferentie", section: "Waarom dit telt", recap: "Kort overzicht",
    recapBody: "Het hele onderdeel in drie regels.", questionsHeading: "10 Meerkeuzevragen",
    answersHeading: "Antwoorden", stem: "Welke toets past hierbij?", right: "Een chi-kwadraattoets",
    wrong: "Een gepaarde t-toets", why: "De variabelen zijn categorisch.",
    alt: "Een spreidingsdiagram van x tegen y", caption: "Figuur: het verband",
  },
];

for (const lang of LANGUAGES) {
  const { ok, out, manifest } = build(unit(lang));
  assert.ok(ok, `${lang.name}: the build must succeed:\n${out}`);
  const topic = manifest.topics[0];
  const bodies = topic.blocks.filter((b) => b.type === "prose").map((b) => b.body).join("\n");

  /* THE ANSWER KEY LEAVES THE BODY. This is the one that reached students. */
  assert.strictEqual(topic.questions.length, 3, `${lang.name}: three questions must reach the bank`);
  assert.ok(!bodies.includes(lang.answersHeading), `${lang.name}: the answers heading must not be prose`);
  assert.ok(!bodies.includes(lang.why), `${lang.name}: an explanation must not be prose:\n${bodies}`);
  assert.ok(!bodies.includes(lang.stem), `${lang.name}: a stem must not be prose`);
  const q = topic.questions[0];
  assert.strictEqual(q.options.filter((o) => o.correct).length, 1, `${lang.name}: one correct option`);
  assert.strictEqual(q.options.find((o) => o.correct).text, lang.right, `${lang.name}: the right one`);
  assert.strictEqual(q.explanation, lang.why, `${lang.name}: the explanation travels with it`);

  /* A PICTURE ON ITS OWN IS A FIGURE, and its caption is the italic line under it. */
  const fig = topic.blocks.find((b) => b.type === "figure");
  assert.ok(fig, `${lang.name}: the lone picture must be a figure block:\n${JSON.stringify(topic.blocks.map((b) => b.type))}`);
  assert.strictEqual(fig.alt, lang.alt, `${lang.name}: alt is a field, not a string in a body`);
  assert.strictEqual(fig.caption, lang.caption, `${lang.name}: the italic line under it is its caption`);
  assert.ok(!bodies.includes("!["), `${lang.name}: no picture may be left inline`);
  assert.ok(bodies.includes("A paragraph after the picture"), `${lang.name}: ordinary prose survives`);

  /* THE CLOSING RECAP IS A BOX, in either language. */
  const last = topic.blocks[topic.blocks.length - 1];
  assert.strictEqual(last.type, "callout", `${lang.name}: a unit ends on its recap`);
  assert.strictEqual(last.variant, "in-short", `${lang.name}: and the recap is in-short`);
  assert.ok(last.body.includes(lang.recapBody), `${lang.name}: carrying the author's words`);

  /* THE INLINE CHECK, before the closing box. */
  const check = topic.blocks.findIndex((b) => b.type === "question");
  assert.ok(check > 0, `${lang.name}: a unit with a bank carries an inline check`);
  assert.strictEqual(check, topic.blocks.length - 2, `${lang.name}: and it sits before the closing box`);
  assert.strictEqual(topic.blocks[check].count, 3, `${lang.name}: it draws no more than the bank holds`);
}

/* HALF A BANK IS WORSE THAN NONE: an answer naming an option the question does not have is refused. */
const mismatched = build(
  unit(LANGUAGES[0]).replace("**1.** A —", "**1.** D —"),
);
assert.ok(mismatched.ok, "a mismatched answer key must not crash the build");
assert.strictEqual(
  mismatched.manifest.topics[0].questions.length,
  0,
  "an answer naming an option that does not exist lifts NOTHING, rather than a partial bank",
);
assert.match(mismatched.out, /NOT lifted/, `and it says so:\n${mismatched.out}`);

/* A TABLE OF CONTENTS IS NOT A LECTURE, and the builder refuses rather than guessing. */
const contents = build(
  `\n# Table of contents\n\nTable of contents 1\n\nLecture 1: Inference 6\n\nWhy it matters 8\n\n` +
    `Brief overview 20\n\nAnswers 24\n\nMore headings 28\n` + unit(LANGUAGES[0]),
);
assert.ok(!contents.ok, "a contents list must refuse the build");
assert.match(contents.out, /frontMatterTitles/, `and name the fix:\n${contents.out}`);

/* Named on the record, it builds and is not a topic. */
const named = build(
  `\n# Table of contents\n\nTable of contents 1\n\nLecture 1: Inference 6\n\nWhy it matters 8\n\n` +
    `Brief overview 20\n\nAnswers 24\n\nMore headings 28\n` + unit(LANGUAGES[0]),
  { structure: { frontMatterTitles: ["Table of contents"] } },
);
assert.ok(named.ok, `named front matter must build:\n${named.out}`);
assert.strictEqual(named.manifest.topics.length, 1, "and must not become a topic");

console.log("ok  the builder derives questions, figures, the recap and the check, in two languages");
