#!/usr/bin/env node
/**
 * DOES EVERY WORD THE AUTHOR WROTE STILL REACH A STUDENT?
 *
 *   node scripts/fidelity-check.mjs <course folder> [--unit 1] [--unit 2] ...
 *
 * ── WHY NOTHING ELSE ASKS THIS ───────────────────────────────────────────────────────────────────────
 *
 * Three checks already run near here and all three compare the course to ITSELF:
 *
 *   `push --verify`      the stored blocks against the file that was sent. Catches a write that did
 *                        not land, and nothing about whether the file was right.
 *   the plan's lint      every heading, prose block and number against the topic's own `source`. One
 *                        direction only: it asks whether what was BUILT appears in the source, never
 *                        whether the source appears in what was built.
 *   `handcraft-check`    what a block should have been. Not what it says.
 *
 * So a word that left the author's document somewhere between the source of record and the page is
 * invisible to all of them, and three of those shipped on a live course: a clause rewritten inside a
 * question option read perfectly, matched no rule, and lost the author's own words. It was found by
 * running this comparison by hand afterwards.
 *
 * ── WHAT IT DOES, AND THE ONE DISTINCTION THAT MAKES IT USABLE ───────────────────────────────────────
 *
 * A WHOLE LINE MISSING is a structural decision. The question section becomes a bank, the recap heading
 * becomes a box's title, a contents list is dropped: every one of those removes entire lines on purpose,
 * and a check that failed on them would fire on every healthy course and be ignored within a week.
 *
 * A LINE MOSTLY PRESENT WITH WORDS MISSING OUT OF IT is a corruption. Nobody deliberately deletes four
 * words from the middle of a sentence. That is the shape of a rewritten clause, an eaten emphasis
 * marker, a truncated option, a dropped half of a table cell.
 *
 * So the first is reported and the second FAILS. The rule needs nothing from the builder and shares no
 * code with it, which is the point: a builder that drops the wrong section still records that it meant
 * to, and a checker that believed that record could not catch it.
 *
 * It reads the manifest and never the platform: `verify` already covers the wire, this covers the
 * document, and an offline check needs no credential and cannot be rate limited.
 */
import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const args = process.argv.slice(2);
const folder = resolve(args.find((a) => !a.startsWith("--")) ?? ".");
const wanted = args.flatMap((a, i) => (a === "--unit" ? [Number(args[i + 1])] : []));

const file = join(folder, "04-manifest", "manifest.json");
if (!existsSync(file)) {
  console.error(`No 04-manifest/manifest.json in ${folder}. Build the course file first.`);
  process.exit(2);
}
const manifest = JSON.parse(readFileSync(file, "utf8"));

/**
 * A WORD, for the purpose of "did this survive". Letters only, three or more, lower-cased: punctuation
 * and emphasis markers are the house's to change, numbers move between a table cell and a chart, and a
 * two-letter word is too common to attribute to any one line.
 */
const WORD = /[\p{L}]{3,}/gu;
const words = (text) => (text ?? "").toLowerCase().match(WORD) ?? [];

/** Every string in a topic that a student's eye lands on, blocks and questions alike. */
function readerText(topic) {
  const out = [];
  const take = (v) => {
    if (typeof v === "string") out.push(v);
  };
  for (const b of topic.blocks ?? []) {
    for (const key of ["body", "caption", "title", "problem", "answer", "alt"]) take(b[key]);
    if (b.type === "table") {
      for (const c of b.head ?? []) take(c);
      for (const r of b.rows ?? []) for (const c of r ?? []) take(c);
    }
    for (const st of b.steps ?? [])
      for (const key of ["label", "note", "result", "substitution"]) take(st?.[key]);
    for (const s of b.series ?? []) take(s?.label);
    for (const m of b.markers ?? []) take(m?.label);
  }
  for (const q of topic.questions ?? []) {
    take(q.stem);
    take(q.explanation);
    for (const o of q.options ?? []) {
      take(o?.text);
      take(o?.rationale);
    }
  }
  return out.join("\n");
}

/** A line of the source that carries the author's prose, rather than the document's own scaffolding. */
const SCAFFOLD = /^\s*(?:#{1,6}\s|\||!\[|<!--|\[FIGURE:|-{3,}\s*$)/;

/**
 * HOW FAR THE SENTENCE STILL RUNS, which is the question, and not how many of its words exist SOMEWHERE.
 *
 * Counting words against a pool of the unit's own vocabulary was the first version of this and it could
 * not fail: the real defect it was written for, a clause inside a question option rewritten so that
 * "only allowed for experiments" lost its last two words, was invisible, because "experiments" appears
 * elsewhere in that lecture and the pool still had one to spend. A word is not missing when it is
 * missing from the count; it is missing when the sentence it belonged to stops running.
 *
 * So the line is looked for as a CONTIGUOUS RUN in the published word stream, from every position its
 * first word occupies, and the longest run is how much of it survived.
 */
function longestRun(line, index, stream) {
  const want = words(line);
  if (!want.length) return { want, best: 0 };
  let best = 0;
  for (const start of index.get(want[0]) ?? []) {
    let n = 0;
    while (n < want.length && stream[start + n] === want[n]) n += 1;
    if (n > best) best = n;
    if (best === want.length) break;
  }
  return { want, best };
}

let failures = 0;
let notes = 0;

for (const topic of manifest.topics ?? []) {
  if (wanted.length && !wanted.includes(topic.number)) continue;
  if (!topic.source) {
    console.log(`\n${topic.number}. ${topic.title}\n   ! no source on this unit, so nothing can be compared`);
    notes += 1;
    continue;
  }

  const stream = words(readerText(topic));
  const index = new Map();
  for (let i = 0; i < stream.length; i += 1) {
    const at = index.get(stream[i]);
    if (at) at.push(i);
    else index.set(stream[i], [i]);
  }

  const gone = [];
  const cut = [];
  for (const raw of topic.source.split("\n")) {
    const line = raw.trim();
    if (!line || SCAFFOLD.test(line)) continue;
    const { want, best } = longestRun(line, index, stream);
    if (!want.length || best === want.length) continue;
    /*
     * A SENTENCE THAT RUNS AND THEN STOPS is a corruption: something rewrote the rest of it. A line
     * that never runs at all was moved or dropped, which is the normal shape of building a course
     * (a question section becomes a bank, a recap heading becomes a box's title).
     *
     * Four words is the floor for calling a run real. Below that the match is two common words next to
     * each other by accident, and every dropped line in the document would read as a corruption.
     */
    if (best >= 4 && best / want.length >= 0.5) cut.push({ line, want, best });
    else gone.push(line);
  }

  if (!gone.length && !cut.length) continue;
  console.log(`\n${topic.number}. ${topic.title}`);
  for (const { line, want, best } of cut) {
    console.log(`   ! a sentence stops partway through, so something rewrote the rest of it`);
    console.log(`     runs out after: ...${want.slice(Math.max(0, best - 5), best).join(" ")}`);
    console.log(`     the author wrote on: ${want.slice(best, best + 8).join(" ")}`);
    console.log(`     source: ${line.slice(0, 110)}`);
  }
  failures += cut.length;
  if (gone.length) {
    console.log(`   ${gone.length} whole line(s) are not on the page at all, which is usually a decision:`);
    for (const line of gone.slice(0, 6)) console.log(`     ${line.slice(0, 96)}`);
    if (gone.length > 6) console.log(`     ... and ${gone.length - 6} more`);
    notes += gone.length;
  }
}

const units = (manifest.topics ?? []).filter((t) => !wanted.length || wanted.includes(t.number)).length;
console.log(
  failures === 0
    ? `\nevery sentence the author wrote still reaches a student, across ${units} lecture(s)` +
        (notes ? `  (${notes} whole line(s) moved or dropped, listed above)` : "")
    : `\n${failures} sentence(s) lost words, across ${units} lecture(s)`,
);
process.exit(failures === 0 ? 0 : 1);
