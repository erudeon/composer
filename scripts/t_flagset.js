/**
 * THE FLAG SET IS THE AUTHOR'S, NOT OURS.
 *
 * The set was 🎯 💡 📌 ⚠️. A real maths summary flagged with ❗ and 👉 instead, so 8 of its 24
 * flagged lines never became callouts at all: they stayed in the prose WITH THE EMOJI STILL IN THEM,
 * and a student read "❗ Notice how this connects to price controls" as an ordinary paragraph. The
 * author's notes are the part of a summary a student reads first, which is why this is not cosmetic.
 */
const assert = require("node:assert");
const { execFileSync } = require("node:child_process");
const { mkdtempSync, writeFileSync, mkdirSync, readFileSync } = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");

const dir = mkdtempSync(join(tmpdir(), "composer-flagset-"));
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
    "## Taxes",
    "",
    "Some ordinary prose so the section is not empty.",
    "",
    "❗Notice how this connects to price controls: both policies push the market away.",
    "",
    "More ordinary prose in between.",
    "",
    "**❗Mini pitfalls to avoid:** the triangle heights are differences.",
    "",
    "Another ordinary paragraph.",
    "",
    "👉 The key takeaway is that shifting price away from equilibrium creates imbalance.",
    "",
  ].join("\n"),
);

execFileSync("node", [join(__dirname, "build-manifest.mjs"), dir], { stdio: "pipe" });
const blocks = JSON.parse(readFileSync(join(dir, "04-manifest", "manifest.json"), "utf8")).topics[0]
  .blocks;

for (const phrase of ["Notice how this connects", "Mini pitfalls to avoid", "The key takeaway is"]) {
  const inCallout = blocks.some((b) => b.type === "callout" && (b.body ?? "").includes(phrase));
  assert.ok(inCallout, `this flagged line never became a callout: "${phrase}"`);
}

/* And no reader ever sees a marker: the emoji goes with the flag, everywhere. */
const everything = JSON.stringify(blocks);
for (const emoji of ["❗", "👉", "💡", "🎯", "📌"])
  assert.ok(!everything.includes(emoji), `a flag emoji reached the page: ${emoji}`);

console.log("t_flagset: every flag the author uses becomes a callout, and no emoji survives");
