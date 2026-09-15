#!/usr/bin/env node
/**
 * Promote the author's standalone bold section lines to real headings.
 *
 * The document carries one heading level: the lecture title. Every section inside a lecture is a bold
 * paragraph, so a lecture arrives as one wall of text with no outline. `headings.json` names, per unit,
 * the exact line and the level it becomes. The words are untouched; only the markers change.
 *
 *   node promote-headings.mjs <course folder> [--check]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const folder = resolve(process.argv[2] ?? ".");
const check = process.argv.includes("--check");
const path = join(folder, "02-source", "source-of-record.md");
const map = JSON.parse(readFileSync(join(folder, "headings.json"), "utf8"));

const lines = readFileSync(path, "utf8").split("\n");
let unit = 0;
let done = 0;
let byStyle = 0;
const flagsDropped = [];
const tooLong = [];

/**
 * A heading line AS IT ENDS UP: the author's words, without a flag emoji, without a leading number and
 * without a trailing colon. `headings.json` holds this form, because it is what a reader sees and what
 * the author corrects, so the lookup has to normalise the raw line the same way before matching it.
 *
 * The number comes off because a reader numbers its own sections: left on, the contents list reads
 * "9.3  3. Sum-of-the-Years'-Digits Method".
 */
const FLAG = /^\s*(?:🎯|💡|📌|⚠️)\s*/u;
const NUMBER = /^\d+[.)]\s+/;
const plain = (text) => text.replace(FLAG, "").replace(NUMBER, "").replace(/:$/, "").trim();
const missed = [];
const seen = new Set();

for (let i = 0; i < lines.length; i += 1) {
  if (/^# /.test(lines[i])) {
    // The lecture title itself: drop the bold markers so it does not render with asterisks.
    lines[i] = lines[i].replace(/^# \*\*(.+)\*\*\s*$/, "# $1");
    unit += 1;
    continue;
  }
  /*
   * The author's OWN styles say it first. Stilus2 is a section and Stilus3 a subsection, and Word
   * records the style whether or not the line was also made bold, so this catches the ones that carry
   * no ** markers at all and would otherwise be swallowed into the paragraph above.
   */
  const styled = /^<!-- style: St[íi]lus([23]) -->$/.exec(lines[i].trim());
  if (styled) {
    let j = i + 1;
    while (j < lines.length && lines[j].trim() === "") j += 1;
    const text = lines[j]?.trim().replace(/^\*\*(.+?)\*\*:?$/, "$1");
    /*
     * A PARAGRAPH IS NOT A HEADING, whatever style it was given. Word applies a heading style to a body
     * paragraph on its own, constantly, and one 350-character paragraph came through as a `###`: the
     * contents list then carries a section title four lines long. Over 120 characters it is prose.
     */
    if (text && text.length > 120) {
      tooLong.push(`unit ${unit}: ${text.slice(0, 70)}...`);
      continue;
    }
    if (text && !/^#/.test(text)) {
      /*
       * `headings.json` OVERRIDES THE AUTHOR'S STYLE LEVEL. The style says what they meant a line to be;
       * the file says what it is in the outline, and the two differ where an author styled a parent and
       * its children the same way. A named level wins, and the name is recorded either way.
       */
      const named = map[String(unit)]?.[plain(text)];
      if (named) seen.add(`${unit}:${plain(text)}`);
      /*
       * PLAIN, like the bold-line path below. The author's own style branch used to write the line
       * VERBATIM, so a section they had numbered themselves -- "2. No Beginning WIP, Multiple
       * Processes" -- became a heading carrying a number the course already draws.
       */
      lines[j] = `${"#".repeat(named ?? Number(styled[1]))} ${plain(text)}`;
      lines[i] = null; // the marker has been spent; leaving it strands a comment in the prose
      byStyle += 1;
    }
    continue;
  }

  const wanted = map[String(unit)];
  if (!wanted) continue;
  /* Already promoted by an earlier run: count it, so re-running is not an error. */
  const already = /^(#{2,3})\s+(.+?)\s*$/.exec(lines[i].trim());
  if (already) {
    const hit = Object.entries(wanted).find(
      ([name, lvl]) => lvl === already[1].length && plain(name) === plain(already[2]),
    );
    if (hit) {
      seen.add(`${unit}:${hit[0]}`);
      continue;
    }
  }

  /*
   * BOLD OR NOT. The author's section lines are usually bold, and the labels that introduce a table
   * usually are not: "Transactions Table", "LIFO Periodic:", "COGS Calculation:". Both are named in
   * `headings.json` by the words a reader sees, so both are matched here.
   */
  const m = /^\*\*(.+?)\*\*(:?)\s*$/.exec(lines[i].trim()) ?? [null, lines[i].trim(), ""];
  if (!m[1]) continue;
  /*
   * LOOKED UP THE WAY IT WILL BE WRITTEN. `headings.json` holds the heading as it ends up, without a
   * flag emoji and without a trailing colon, because that is what a reader sees and what the author
   * corrects. Matching the raw line instead misses every entry that carried either, which was 42 of
   * 215 on this course.
   */
  const text = plain(m[1] + m[2]);
  const level = wanted[text];
  if (level === undefined) continue;
  seen.add(`${unit}:${text}`);
  lines[i] = `${"#".repeat(level)} ${text}`;
  /*
   * AND THE STYLE MARKER ABOVE IT IS SPENT. The author styled these labels the same way they styled a
   * worked example, so a marker left standing has the builder collect the heading into an example
   * callout: three headings came out as one box reading "Transactions Table / Results Comparison by
   * Method / FIFO", with the tables they introduced left outside it.
   */
  for (let k = i - 1; k >= 0; k -= 1) {
    if (lines[k] === null || lines[k].trim() === "") continue;
    if (/^<!--\s*style:.*-->$/.test(lines[k].trim())) lines[k] = null;
    break;
  }
  if (FLAG.test(m[1])) flagsDropped.push(`unit ${unit}: ${m[1]}`);
  done += 1;
}

for (const [u, entries] of Object.entries(map)) {
  if (u.startsWith("_")) continue;
  for (const text of Object.keys(entries))
    if (!seen.has(`${u}:${text}`)) missed.push(`unit ${u}: ${text}`);
}

if (missed.length) {
  console.error(`! ${missed.length} heading(s) named but not found:`);
  for (const m of missed) console.error(`    ${m}`);
  process.exit(1);
}
if (tooLong.length) {
  console.log(`  ${tooLong.length} paragraph(s) styled as a heading, left as prose:`);
  for (const t of tooLong) console.log(`    ${t}`);
}
if (flagsDropped.length) {
  console.log(`  ${flagsDropped.length} heading(s) carried one of the author's flags, now on the record:`);
  for (const f of flagsDropped) console.log(`    ${f}`);
}
if (!check) writeFileSync(path, lines.filter((l) => l !== null).join("\n"));
console.log(
  `${done} bold line(s) and ${byStyle} authored-style line(s) promoted${check ? " (check only, nothing written)" : ""}`,
);
