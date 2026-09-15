/**
 * THE LENGTH CUT COMES AFTER THE TRIM, SO IT CAN LAND ON A HYPHEN.
 *
 * `slug()` trims leading and trailing hyphens and THEN cuts to 44 characters, which puts the cut
 * anywhere in the string including on a separator. "Chapter 7: Week 7: The Entrepreneur, Executive &
 * Manager" lands exactly there and produced `...-executive-`, which the manifest schema refuses:
 * a slug is lower case letters, digits and single hyphens.
 *
 * It is found only by the offline lint, and only for a title whose 45th character happens to be the
 * wrong one, which is why it survived several courses before a title with an ampersand hit it.
 *
 *   node scripts/t_slugcut.js
 */
const assert = require("node:assert");
const { execFileSync } = require("node:child_process");
const { mkdtempSync, writeFileSync, mkdirSync, readFileSync } = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");

/** The manifest schema's own rule: lower case letters, digits and SINGLE hyphens, none at either end. */
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const TITLES = [
  "Chapter 7: Week 7: The Entrepreneur, Executive & Manager",
  "Module 3: Formal Institutions - Political, Economic, and Legal Systems",
  "A title ending in punctuation!",
  "Straight Lines, Sequences, and Series",
];

const dir = mkdtempSync(join(tmpdir(), "composer-slugcut-"));
mkdirSync(join(dir, "02-source"), { recursive: true });
mkdirSync(join(dir, "04-manifest"), { recursive: true });
writeFileSync(
  join(dir, "composer.json"),
  JSON.stringify({ course: "T", slug: "t", courseShell: { programCode: "nl-x-y-bsc-en-y1" } }),
);
writeFileSync(
  join(dir, "02-source", "source-of-record.md"),
  TITLES.flatMap((t) => [`# ${t}`, "", "Some prose so the unit is not empty.", ""]).join("\n"),
);

execFileSync("node", [join(__dirname, "build-manifest.mjs"), dir], { stdio: "pipe" });
const topics = JSON.parse(readFileSync(join(dir, "04-manifest", "manifest.json"), "utf8")).topics;

for (const t of topics)
  assert.ok(SLUG.test(t.slug), `"${t.title}" made the slug "${t.slug}", which the schema refuses`);

console.log(`ok  ${topics.length} titles, every slug legal: ${topics.map((t) => t.slug).join(", ")}`);
