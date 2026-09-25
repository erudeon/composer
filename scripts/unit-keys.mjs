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

/**
 * The build number of a manifest topic. A manifest built before the file existed numbers by build number,
 * so without the file its own number is the key. With the file, a unit it does not know is refused rather
 * than looked up by the number a student reads: a hand-edited address or a manifest restored without its
 * keys would otherwise pick the wrong unit without a word.
 */
export function unitKeys(folder) {
  const path = join(folder, "04-manifest", UNIT_KEYS_FILE);
  if (!existsSync(path)) return (topic) => topic.number;
  const bySlug = JSON.parse(readFileSync(path, "utf8"));
  return (topic) => {
    if (topic.slug in bySlug) return bySlug[topic.slug];
    throw new Error(
      `${UNIT_KEYS_FILE} does not know the unit at "${topic.slug}", so its build number is unknown. ` +
        `Rebuild with build-manifest.mjs, which writes the manifest and its keys together.`,
    );
  };
}
