/**
 * A RECAP CALLED "KEY INSIGHTS" IS STILL A RECAP.
 *
 * The rule knew "Key Takeaways" and "Summary" and not the two names a whole 23-unit course actually
 * used: ten closing sections written as "Key Insights" or "Conclusion" came out as one more section
 * of teaching, which is the single thing a recap must not look like to somebody revising.
 *
 * The near-misses matter as much as the hits. "Key Theories", "Key Characters in Strategic Context"
 * and "Key Economic Metrics" are sections that TEACH, in the same document, and a rule loose enough
 * to take "Key <anything>" would have folded five of those into boxes and hidden them.
 *
 *   node scripts/t_recapnames.js
 */
const assert = require("node:assert");
const { execFileSync } = require("node:child_process");
const { mkdtempSync, writeFileSync, mkdirSync, readFileSync } = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");

const RECAPS = ["Key Insights", "Conclusion", "Key Takeaways", "Summary", "Key Points"];
const TEACHING = ["Key Theories", "Key Economic Metrics", "Key Characters in Strategic Context"];

const dir = mkdtempSync(join(tmpdir(), "composer-recapnames-"));
mkdirSync(join(dir, "02-source"), { recursive: true });
mkdirSync(join(dir, "04-manifest"), { recursive: true });
writeFileSync(
  join(dir, "composer.json"),
  JSON.stringify({ course: "T", slug: "t", courseShell: { programCode: "nl-x-y-bsc-en-y1" } }),
);

const lines = ["# Unit One", ""];
for (const heading of [...RECAPS, ...TEACHING]) {
  lines.push(`## ${heading}`, "", `Ordinary prose belonging to ${heading}.`, "");
}
writeFileSync(join(dir, "02-source", "source-of-record.md"), lines.join("\n"));

execFileSync("node", [join(__dirname, "build-manifest.mjs"), dir], { stdio: "pipe" });
const blocks = JSON.parse(readFileSync(join(dir, "04-manifest", "manifest.json"), "utf8")).topics[0]
  .blocks;

const boxed = new Set(
  blocks.filter((b) => b.type === "callout" && b.variant === "in-short").map((b) => b.title),
);

for (const heading of RECAPS)
  assert.ok(boxed.has(heading), `"${heading}" should be a recap box, and it is not: ${[...boxed]}`);

for (const heading of TEACHING)
  assert.ok(
    !boxed.has(heading),
    `"${heading}" teaches and must stay a section, but it was folded into a box`,
  );

console.log(`ok  ${RECAPS.length} recap names boxed, ${TEACHING.length} teaching sections left alone`);
