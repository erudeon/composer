#!/usr/bin/env node
/**
 * WHAT IS STILL BEING DRAWN BY HAND WHERE AN ELEMENT EXISTS.
 *
 * The reader has a journal entry, a T-account, a trial balance, an accounting equation, a table, a
 * formula, a worked example and a question. A passage that is one of those and stays prose renders as
 * a paragraph: it loses the arithmetic the element does for free, and the structure the student is
 * being taught to recognise. Nothing refuses it, which is why this exists.
 *
 * It also catches a passage that points at something the page does not have. A summary written for
 * PAPER says "the footnote at the bottom of the page" and "see page 8", and on a screen there is no
 * page and no bottom of it. The sentence survives conversion perfectly and is simply false.
 *
 *   node handcraft-check.mjs <course folder>/04-manifest/manifest.json
 *
 * Exit 1 when anything is found. Every finding names a block, so it can be worked off.
 */
import { readFileSync } from "node:fs";

const file = process.argv[2];
if (!file) {
  console.error("usage: node handcraft-check.mjs <manifest.json>");
  process.exit(2);
}
const manifest = JSON.parse(readFileSync(file, "utf8"));

/**
 * Each rule reads one block and returns why it is a finding, or nothing.
 *
 * `where` names the element the passage should have been, because "this is wrong" without "and this
 * is the thing instead" is a finding nobody acts on.
 */
const RULES = [
  {
    name: "journal entry in prose",
    becomes: "journal-entry",
    test: (b) =>
      b.type === "prose" &&
      /^\s*(?:\*\*)?\s*(?:Dr|Cr)\.\s/m.test(b.body ?? "") &&
      "a Dr. or Cr. line is an entry, and an entry element adds it up",
  },
  {
    /*
     * THE ONE THAT MATTERS MOST ON AN ACCOUNTING COURSE. A converted document turns every entry into a
     * pipe table, and a pipe table renders as a grid: the debits and credits do not add up on the page,
     * nothing says whether they agree, and a student who is being taught to read an entry is shown a
     * spreadsheet instead. 57 of them on one course.
     */
    name: "an accounting element left as a table",
    becomes: "journal-entry, t-account or trial-balance",
    test: (b) => {
      if (b.type !== "table") return null;
      const head = (b.head ?? []).map((h) => String(h).toLowerCase());
      const joined = head.join(" ");
      if (!/\bdebit\b/.test(joined) || !/\bcredit\b/.test(joined)) return null;
      const rows = b.rows ?? [];

      /*
       * A FORMAT ILLUSTRATION IS NOT AN ENTRY. A summary shows the SHAPE of a journal entry before it
       * shows one, with `xxx` where the amounts go. It has the same three columns and no figures at
       * all, and the elements need real amounts, so a table is the right answer and not a finding.
       */
      if (!rows.some((r) => r.some((c) => /\d/.test(String(c ?? ""))))) return null;

      const totals = rows.some((r) => /\btotals?\b/i.test(String(r[0] ?? "")));
      return totals
        ? "every account with its balance and a total: a trial balance"
        : "an Account / Debit / Credit grid: a journal entry";
    },
  },
  {
    /*
     * A STEPS TABLE TAKES NEITHER `head` NOR `roles`. It draws each row's cells stacked, one under the
     * next, which is right for a procedure and wrong for anything with a column of figures. Giving it
     * either prop is not refused: the props are simply dropped, so a financial statement's subtotals
     * stop being subtotals and nothing says so.
     */
    name: "a steps table given props it cannot draw",
    becomes: "table with variant data",
    test: (b) => {
      if (b.type !== "table" || b.variant !== "steps") return null;
      const dropped = [b.head?.length ? "head" : null, b.roles?.length ? "roles" : null].filter(Boolean);
      return dropped.length > 0 && `${dropped.join(" and ")} will be dropped, not drawn`;
    },
  },
  {
    name: "markdown table in prose",
    becomes: "table",
    test: (b) => b.type === "prose" && /^\s*\|.*\|/m.test(b.body ?? "") && "a pipe table left in the text",
  },
  {
    name: "an exercise inside a callout",
    becomes: "question",
    test: (b) =>
      b.type === "callout" &&
      /\b(exercise|try to|try doing|your turn)\b/i.test(b.body ?? "") &&
      /\?/.test(b.body ?? "") &&
      "a question the reader is asked, which the question element can mark",
  },
  {
    name: "an answer written as text",
    becomes: "question",
    test: (b) =>
      /^(?:\*\*)?\s*(?:the\s+)?answers?\b[:!.]?\s*$/im.test(b.body ?? "") &&
      "an answer belongs to its question, not to the prose beside it",
  },
  {
    name: "points at something a page does not have",
    becomes: null,
    test: (b) => {
      const m = /\b(?:footnote|bottom of the page|top of the page|see page \d+|on page \d+|\(page \d+\)|next page|previous page|overleaf)\b/i.exec(
        `${b.body ?? ""} ${b.title ?? ""} ${b.caption ?? ""}`,
      );
      return m && `"${m[0]}" does not exist on a screen`;
    },
  },
  {
    name: "prose ends on a bold line",
    becomes: null,
    test: (b) => {
      if (b.type !== "prose") return null;
      const lines = (b.body ?? "").trim().split("\n").filter((l) => l.trim());
      const last = lines[lines.length - 1] ?? "";
      return /^\*\*[^*]+\*\*:?$/.test(last.trim()) && "a heading with nothing under it";
    },
  },
  {
    name: "a style marker reached a block",
    becomes: null,
    test: (b) =>
      JSON.stringify(b).includes("<!-- style:") && "metadata a reader must never see",
  },
];

let found = 0;
for (const topic of manifest.topics) {
  const hits = [];
  for (const block of topic.blocks ?? [])
    for (const rule of RULES) {
      const why = rule.test(block);
      if (why) hits.push({ block, rule, why });
    }
  if (hits.length === 0) continue;
  found += hits.length;
  console.log(`\n${topic.number}. ${topic.title}`);
  for (const { block, rule, why } of hits) {
    const becomes = rule.becomes ? `  ->  ${rule.becomes}` : "";
    console.log(`   ! ${rule.name}${becomes}`);
    console.log(`     ${block.id}  (${block.type})`);
    console.log(`     ${why}`);
  }
}

console.log(
  found === 0
    ? `\nnothing drawn by hand that an element could carry, across ${manifest.topics.length} lecture(s)`
    : `\n${found} finding(s) across ${manifest.topics.length} lecture(s)`,
);
process.exit(found === 0 ? 0 : 1);
