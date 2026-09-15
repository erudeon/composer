/**
 * A CALLOUT RUN STOPS AT A TABLE.
 *
 * A callout is ONE box and a table cannot be drawn inside it, so a run that lifts the table out and
 * carries on past it reorders the lecture. On a published course the box ran "So, the first journal
 * entry would be:", then "So, the second...", then "So, the third...", and all three entries appeared
 * after it in a row: a student read the first colon and got two more paragraphs before any entry.
 *
 * Nothing is lost by stopping. What follows the table stays where the author put it, as prose.
 */
const assert = require("node:assert");
const { execFileSync } = require("node:child_process");
const { mkdtempSync, writeFileSync, mkdirSync, readFileSync } = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");

const dir = mkdtempSync(join(tmpdir(), "composer-runtable-"));
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
    "## Double-entry bookkeeping",
    "",
    "Some ordinary prose so the section is not empty.",
    "",
    "**Example:** Your company buys a computer for EUR 1,000 cash.",
    "",
    "**Transaction 1:** The company acquires an asset and pays with another.",
    "",
    "So, the first journal entry would be:",
    "",
    "| Account name | Debit | Credit |",
    "| --- | --- | --- |",
    "| Equipment | EUR 1,000 |  |",
    "| Cash |  | EUR 1,000 |",
    "",
    "**Transaction 2:** The company buys 40 shirts for EUR 5 each.",
    "",
    "So, the second journal entry would be:",
    "",
    "| Account name | Debit | Credit |",
    "| --- | --- | --- |",
    "| Inventory | EUR 200 |  |",
    "| Cash |  | EUR 200 |",
    "",
  ].join("\n"),
);

execFileSync("node", [join(__dirname, "build-manifest.mjs"), dir], { stdio: "pipe" });
const blocks = JSON.parse(readFileSync(join(dir, "04-manifest", "manifest.json"), "utf8")).topics[0]
  .blocks;

const callout = blocks.find((b) => b.type === "callout");
assert.ok(callout, "the example did not become a callout at all");
assert.ok(
  callout.body.includes("first journal entry"),
  `the callout lost the line it opens on:\n${callout.body}`,
);
assert.ok(
  !callout.body.includes("Transaction 2"),
  `the run crossed a table and swallowed the next transaction:\n${callout.body}`,
);

/* And the second transaction is still THERE, after the first table, as the author wrote it. */
const at = (needle) => blocks.findIndex((b) => JSON.stringify(b).includes(needle));
assert.ok(at("Transaction 2") !== -1, "the second transaction was dropped instead of left as prose");
assert.ok(
  at("Transaction 2") > at("Equipment"),
  "the second transaction came out before the entry it follows",
);
assert.ok(at("Inventory") > at("Transaction 2"), "the second entry came out before its own narration");

console.log("t_runtable: a callout run stops at a table");
