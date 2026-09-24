#!/usr/bin/env node
/**
 * The manifest holds every lecture the source document does. Only the ones actually BUILT may be sent:
 * an unbuilt lecture's blocks are the converter's raw tables, and a body write is a whole-array
 * replace, so sending one would publish handcrafted tables over nothing.
 *
 *   node slice.mjs <course folder> <n> [n...]   ->  writes 04-manifest/slice.json
 *
 * <n> is the unit's number, the same one `build-manifest.mjs --unit` takes: its row's in composer.json,
 * or its place in the document when composer.json declares none.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const folder = resolve(process.argv[2]);
const want = new Set(process.argv.slice(3).map(Number));
if (!want.size) {
  console.error("! name the units to send");
  process.exit(1);
}
const m = JSON.parse(readFileSync(join(folder, "04-manifest", "manifest.json"), "utf8"));

m.topics = m.topics.filter((t) => want.has(t.number));
const slugs = new Set(m.topics.map((t) => t.slug));
m.glossary = (m.glossary ?? []).filter((g) => slugs.has(g.topicSlug));

const missing = [...want].filter((n) => !m.topics.some((t) => t.number === n));
if (missing.length) {
  console.error(`! no unit ${missing.join(", ")}`);
  process.exit(1);
}
/* A number on two units is not a unit, and sending both is a lecture nobody asked for. */
const twice = [...want].filter((n) => m.topics.filter((t) => t.number === n).length > 1);
if (twice.length) {
  console.error(`! unit ${twice.join(", ")} is the number of more than one unit, so it names none of them`);
  process.exit(1);
}
const out = join(folder, "04-manifest", "slice.json");
writeFileSync(out, `${JSON.stringify(m, null, 2)}\n`);
console.log(
  `${out}\n${m.topics.map((t) => `  ${t.series} ${t.number}: ${t.blocks.length} blocks, ${t.questions?.length ?? 0} questions`).join("\n")}\n  ${m.glossary.length} glossary terms`,
);
