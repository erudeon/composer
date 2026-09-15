#!/usr/bin/env node
/**
 * Place the blocks build-manifest.mjs cannot derive, over the manifest it just built.
 *
 * Three kinds of thing live here, and all three need a person rather than a pass: a markdown table that
 * is really a journal entry, a display line that is really a formula a student must know, and a picture
 * that may not be uploaded and whose content has to be carried by an element instead.
 *
 * `unit-blocks.mjs` supplies the ops per unit. PROSE IS NEVER RETYPED: a formula op SPLITS the block it
 * names around the display line already in it, so the author's words are only ever moved, never copied.
 *
 *   node apply-blocks.mjs <course folder>
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const folder = resolve(process.argv[2] ?? ".");
const manifestPath = join(folder, "04-manifest", "manifest.json");
const opsPath = join(folder, "unit-blocks.mjs");
if (!existsSync(opsPath)) {
  console.log("no unit-blocks.mjs, nothing to place");
  process.exit(0);
}
const { OPS } = await import(pathToFileURL(opsPath).href);
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

const fail = (m) => {
  console.error(`! ${m}`);
  process.exit(1);
};

/*
 * The author's example style is claimed in `course-data.mjs` and acted on by build-manifest now, so
 * nothing is lifted here any more. The guard below stays: it is what caught the markers leaking.
 */
let lifted = 0;

/* Nothing the converter wrote for us may reach a reader. */
for (const topic of manifest.topics)
  for (const block of topic.blocks)
    if (typeof block.body === "string" && block.body.includes("<!-- style:"))
      fail(`unit ${topic.number}: ${block.id} still holds a style marker`);

let placed = 0;
for (const topic of manifest.topics) {
  for (const op of OPS[topic.number] ?? []) {
    const at = topic.blocks.findIndex((b) => b.id === op.id);
    if (at === -1) fail(`unit ${topic.number}: no block ${op.id}`);

    if (op.op === "replace") {
      topic.blocks.splice(at, 1, { id: op.id, ...op.block });
      placed += 1;
    } else if (op.op === "after") {
      topic.blocks.splice(at + 1, 0, ...op.blocks);
      placed += op.blocks.length;
    } else if (op.op === "rename") {
      /*
       * A BLOCK ID IS AN ANCHOR. Reading progress and every deep link point at it, so an id that is
       * already live does not move because the builder would derive a different one today.
       */
      if (topic.blocks.some((b) => b.id === op.to))
        fail(`unit ${topic.number}: ${op.to} already exists, so ${op.id} cannot take it`);
      topic.blocks[at].id = op.to;
      placed += 1;
    } else if (op.op === "remove") {
      topic.blocks.splice(at, 1);
      placed += 1;
    } else if (op.op === "move") {
      const [block] = topic.blocks.splice(at, 1);
      const to = topic.blocks.findIndex((b) => b.id === op.before);
      if (to === -1) fail(`unit ${topic.number}: no block ${op.before} to move ${op.id} in front of`);
      topic.blocks.splice(to, 0, block);
      placed += 1;
    } else if (op.op === "cut") {
      /*
       * DROP EVERYTHING FROM A LINE ONWARDS. For a passage the author wrote out longhand that an
       * element now carries: the twelve answers of a ledger exercise, written once as text and once
       * as a journal entry, are the same content twice and the reader has to work out which to trust.
       */
      const block = topic.blocks[at];
      if (block.type !== "prose") fail(`unit ${topic.number}: ${op.id} is a ${block.type}, not prose`);
      const lines = block.body.split("\n");
      const cutAt = lines.findIndex((l) => l.trim() === op.from);
      if (cutAt === -1) fail(`unit ${topic.number}: ${op.id} has no line ${op.from}`);
      const kept = lines.slice(0, cutAt).join("\n").trimEnd();
      if (!kept) fail(`unit ${topic.number}: cutting ${op.id} at ${op.from} would empty it`);
      block.body = kept;
      placed += 1;
    } else if (op.op === "splitAt" || op.op === "formula") {
      const block = topic.blocks[at];
      if (block.type !== "prose")
        fail(`unit ${topic.number}: ${op.id} is a ${block.type}, not prose`);
      const lines = block.body.split("\n");
      const from = lines.indexOf(op.find[0]);
      if (from === -1) fail(`unit ${topic.number}: ${op.id} has no line ${op.find[0]}`);
      for (let k = 1; k < op.find.length; k += 1)
        if (lines[from + 2 * k] !== op.find[k])
          fail(`unit ${topic.number}: ${op.id} line ${k + 1} of the formula does not follow`);
      const last = from + 2 * (op.find.length - 1);

      const before = lines.slice(0, from).join("\n").trim();
      const after = lines.slice(last + 1).join("\n").trim();
      const made = [];
      if (before) made.push({ ...block, body: before });
      made.push({ id: op.block.id, ...op.block.block });
      if (after) made.push({ id: `${block.id}-after`, type: "prose", body: after });
      topic.blocks.splice(at, 1, ...made);
      placed += 1;
    } else if (op.op === "worked") {
      /*
       * A RUN OF CALCULATION LINES IS A WORKED EXAMPLE, and the element exists for exactly that. The
       * author's paragraphs are MOVED into it, never retyped: the heading becomes the title, whatever
       * stands before the first calculation becomes the problem, and every remaining paragraph is one
       * step in the order it was written. Retyping a page of figures by hand is how a digit changes.
       */
      const block = topic.blocks[at];
      if (block.type !== "prose") fail(`unit ${topic.number}: ${op.id} is a ${block.type}, not prose`);
      const paras = block.body.split(/\n\n+/).map((x) => x.trim()).filter(Boolean);
      let title = op.title;
      if (/^#{2,6}\s/.test(paras[0])) {
        const heading = paras.shift().replace(/^#+\s*/, "").trim();
        title ??= heading;
      }
      if (!title) fail(`unit ${topic.number}: ${op.id} has no heading, so give the op a title`);
      /*
       * A STEP LABEL AND ITS NOTE ARE PLAIN TEXT. The write path takes them, the reader draws them as
       * they are, and `**Finished Goods**` therefore reaches a student with its asterisks on. The
       * author's emphasis has nowhere to go here, so it goes.
       */
      const plain = (x) => x.replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
      const isStep = (x) => x.includes("=");
      const firstStep = paras.findIndex(isStep);
      if (firstStep === -1) fail(`unit ${topic.number}: ${op.id} holds no calculation line`);
      const problem = paras.slice(0, firstStep).join("\n\n");

      /*
       * A SENTENCE BETWEEN TWO CALCULATIONS IS NOT A STEP OF ITS OWN. "Conversion costs were applied
       * uniformly, so the total equivalent units are:" announces the line under it, and numbering it
       * as a step of the procedure makes eight steps out of four and leaves two of them with no
       * arithmetic in them at all. It becomes the NAME of the step it introduces, and the calculation
       * becomes that step's note, which is the shape the builder gives a `**Step N:**` of its own.
       */
      const steps = [];
      let pending = [];
      for (const para of paras.slice(firstStep)) {
        if (!isStep(para)) {
          pending.push(para);
          continue;
        }
        /* A label is a name, not a sentence, so it does not end on a stop or a colon. */
        const said = plain(pending.join(" ")).replace(/[.:\s]+$/, "");
        pending = [];
        if (!said) {
          const label = plain(para);
          if (label.length <= 120) steps.push({ label });
          else {
            const at2 = label.lastIndexOf(" ", 118);
            const cut = at2 > 40 ? at2 : 118;
            steps.push({ label: label.slice(0, cut).replace(/[,:\s]+$/, ""), note: label.slice(cut).trim() });
          }
          continue;
        }
        if (said.length <= 120) steps.push({ label: said, note: plain(para) });
        else {
          const at2 = said.lastIndexOf(" ", 118);
          const cut = at2 > 40 ? at2 : 118;
          steps.push({
            label: said.slice(0, cut).replace(/[,:\s]+$/, ""),
            note: `${said.slice(cut).trim()} ${plain(para)}`.trim(),
          });
        }
      }
      /* A closing sentence with no calculation after it still belongs to the last step. */
      if (pending.length && steps.length) {
        const last = steps[steps.length - 1];
        last.note = [last.note, plain(pending.join(" "))].filter(Boolean).join(" ");
      }

      topic.blocks.splice(at, 1, {
        id: op.id,
        type: "worked-example",
        title,
        ...(problem ? { problem } : op.problem ? { problem: op.problem } : {}),
        steps,
      });
      placed += 1;
    } else fail(`unknown op ${op.op}`);
  }
}

/* Ids are the anchor for reading progress and every deep link, so a collision is a stop. */
for (const topic of manifest.topics) {
  const ids = topic.blocks.map((b) => b.id);
  const dupes = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
  if (dupes.length) fail(`unit ${topic.number}: duplicate block ids: ${dupes.join(", ")}`);
}

/* The teaching period, which the course shell settled and build-manifest does not carry through. */
const state = JSON.parse(readFileSync(join(folder, "composer.json"), "utf8"));
if (state.courseShell?.term) manifest.course.term = { name: state.courseShell.term };

/*
 * THE SLUG IS THE ROW THAT ALREADY EXISTS. The workspace folder's name is not the course's address:
 * this course was created in the Hub as `accounting`, and a manifest carrying the folder name would
 * quietly create a SECOND Accounting beside it, looking perfectly correct on its own page.
 */
if (state.courseShell?.slug) manifest.course.slug = state.courseShell.slug;

/*
 * THE TWO SERIES THE AUTHOR DREW AS PART I AND PART II, with the numbers their own document uses.
 *
 * The builder numbers units in reading order, 1 to 16. The document restarts at 1 for Management
 * Accounting, and so does every cross-reference in the text ("we covered this in Lecture 1 MA"), so
 * the numbers a reader sees have to restart too. Units 11 to 16 become Management Accounting 1 to 6.
 */
for (const topic of manifest.topics) {
  const fa = topic.number <= 10;
  topic.series = fa ? "Financial Accounting" : "Management Accounting";
  if (!fa) topic.number -= 10;

  /*
   * AND THE TITLE SAYS IT ONCE. The document's own headings carry the number and the series -- "Lecture
   * 1: Introduction to Financial Accounting & Bookkeeping (FA)" -- and the screen carries both as well,
   * so a student read "Financial Accounting 1: Lecture 1: ... (FA)". The platform's own check reports
   * it. The author's WORDS are what a title is, and the number is what the reader draws. The
   * series tag moves to the FRONT in brackets -- (FA) / (MA). Author decided 2026-09-14.
   *
   * The slug does not move with it: every lecture's address is pinned in `SLUGS` in `course-data.mjs`,
   * which is what keeps a live lecture where it is while its wording changes.
   */
  topic.title = `(${fa ? "FA" : "MA"}) ${topic.title
    .replace(/^\s*Lecture\s+\d+\s*:\s*/i, "")
    .replace(/\s*\((?:FA|MA)\)\s*$/i, "")
    .trim()}`;
}

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
for (const t of manifest.topics) {
  const by = {};
  for (const b of t.blocks) by[b.type] = (by[b.type] ?? 0) + 1;
  console.log(
    `${t.number}. ${t.title}\n   ${t.blocks.length} blocks: ${Object.entries(by)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${v} ${k}`)
      .join(", ")}`,
  );
}
console.log(`\n${lifted} example(s) lifted, ${placed} block(s) placed`);
