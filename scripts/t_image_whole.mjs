/**
 * A PICTURE CUT OFF PART-WAY IS CAUGHT BY ITS OWN END MARKER, end to end: the helper, the identify fact,
 * and the uploader's refusal before anything is sent.
 *
 *   node scripts/t_image_whole.mjs
 *
 * The case worth pinning is the one every other check passes: a JPEG whose stream stops early still
 * begins FF D8, still sniffs as a JPEG and still carries its size in the header. Sixty-five pictures on
 * production got in that way. So the three files below are built from a real, whole JPEG and PNG by
 * cutting bytes off the END, and the whole ones must still pass.
 */
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { imageWholeByMarkers } from "./image-whole.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
let failed = 0;
let ran = 0;
const check = (what, got, expected) => {
  const ok = JSON.stringify(got) === JSON.stringify(expected);
  ran += 1;
  if (!ok) failed += 1;
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok) console.log(`       expected ${JSON.stringify(expected)}\n       got      ${JSON.stringify(got)}`);
};

/* The smallest whole files of each kind: a 1x1 JPEG and a 1x1 PNG, bytes as their encoders write them. */
const JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/yQALCAABAAEBAREA/8wABgAQEAX/2gAIAQEAAD8A0s8g/9k=",
  "base64",
);
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);
const GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

check("a whole jpeg is whole", imageWholeByMarkers(JPEG), true);
check("a whole png is whole", imageWholeByMarkers(PNG), true);
check("a whole gif is whole", imageWholeByMarkers(GIF), true);
check("a jpeg cut off is not", imageWholeByMarkers(JPEG.subarray(0, JPEG.length - 5)), false);
check("a png cut off is not", imageWholeByMarkers(PNG.subarray(0, PNG.length - 3)), false);
check("a jpeg padded with zeros after EOI is still whole", imageWholeByMarkers(Buffer.concat([JPEG, Buffer.alloc(4)])), true);
check("a file that is not a picture has no answer", imageWholeByMarkers(Buffer.from("PK not a picture at all")), null);
check("a stub too short to hold a marker has no answer", imageWholeByMarkers(Buffer.from([0xff, 0xd8])), null);

/* identify.mjs reports the fact, and the registry's entry keys on it. */
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "t_image_whole-"));
fs.writeFileSync(path.join(dir, "whole.jpg"), JPEG);
fs.writeFileSync(path.join(dir, "cut.jpg"), JPEG.subarray(0, JPEG.length - 5));
/* identify exits 1 whenever a file matches no entry, as the whole one here does; its report is on stdout either way. */
const report = spawnSync("node", [path.join(HERE, "identify.mjs"), dir, "--json"], { encoding: "utf8" }).stdout;
const rows = JSON.parse(report);
const byName = Object.fromEntries(rows.map((r) => [path.basename(r.file), r]));
check("identify: the whole file's fact", byName["whole.jpg"]?.facts?.imageWhole, true);
check("identify: the cut file's fact", byName["cut.jpg"]?.facts?.imageWhole, false);
check("identify: the cut file is named by its entry", (byName["cut.jpg"]?.entries ?? []).includes("image-cut-off"), true);
check("identify: the whole file is not", (byName["whole.jpg"]?.entries ?? []).includes("image-cut-off"), false);

/* images.mjs refuses before sending: no credential is needed to be told a file is cut off. */
fs.writeFileSync(path.join(dir, "figures.json"), JSON.stringify([{ file: "cut.jpg", alt: "A cut-off picture" }]));
let out = "";
try {
  execFileSync("node", [path.join(HERE, "images.mjs"), path.join(dir, "figures.json"), "--course", "crs_test"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  out = "exited 0";
} catch (err) {
  out = String(err.stderr ?? err.stdout ?? "");
}
check("images.mjs refuses the cut-off file by name, before any request", /cut\.jpg.*cut off part-way/s.test(out), true);

fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n${ran} checks, ${failed} failed`);
process.exit(failed ? 1 : 0);
