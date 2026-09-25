/**
 * A UNIT'S BUILD NUMBER, the key everything supplied for it is filed under: `course-data.mjs`,
 * `unit-blocks.mjs` and every `--unit` argument. It is its row's `number` in composer.json, or its place
 * in the document when composer.json lists none.
 *
 * It is not always the number a student reads. A course can run two categories that each count from one
 * (FA 1 and MA 1), and a number can be "6b". So `build-manifest.mjs` writes the number as read into the
 * manifest, and beside it `04-manifest/unit-keys.json`, each unit's address against its build number. Every
 * later step finds a unit through this, whatever the reader sees.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const UNIT_KEYS_FILE = "unit-keys.json";

/** The build number of a manifest topic. A manifest built before the file existed numbers by build key. */
export function unitKeys(folder) {
  const path = join(folder, "04-manifest", UNIT_KEYS_FILE);
  const bySlug = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
  return (topic) => bySlug[topic.slug] ?? topic.number;
}
