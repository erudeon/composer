/**
 * THE SHARED CORE HAS NOT DRIFTED, and it still does what the two uploaders need.
 *
 *   node scripts/t_figurebatches.mjs
 *
 * `figure-batches.mjs` exists in this repo and in `erudeon/passtheyear` at
 * `apps/web/scripts/figure-batches.mjs`. Neither can import from the other: this one ships as a plugin to
 * machines with no platform checkout. So it is one file, copied, and this is what keeps the copies honest.
 *
 * COMPARED WITH WHITESPACE REMOVED, not collapsed and not byte for byte. Every code line in the file is
 * kept under 80 columns so this repo's prettier default and the platform's 120 agree today, but nothing
 * ENFORCES that, and the day a line grows past 80 they wrap it differently. Collapsing is not enough
 * either: a collapsed newline becomes a space the other side never had. Removing whitespace ignores
 * every wrapping decision and nothing else: change a word, a number, a name or a comment, and this goes
 * red.
 *
 * BOTH CHECKS MUST NORMALISE THE SAME WAY, or the hash cannot be the same number in two repositories.
 *
 * WHEN THIS FAILS, the fix is never to update the hash alone. Copy the file across, then update the hash
 * in BOTH repos' checks. The hash being identical in two repositories is the only thing making a
 * one-sided edit visible to a reviewer.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {
  HUB_BODY_LIMIT_BYTES,
  MAX_BATCH_BYTES,
  MAX_BATCH_FILES,
  notAttempted,
  packBatches,
  reconcile,
  refusesEveryRequest,
} from "./figure-batches.mjs";

/**
 * The normalised hash of `figure-batches.mjs`. IDENTICAL IN BOTH REPOSITORIES.
 * Update it in both, in the same change that copies the file across.
 */
const SHARED = "9950a91955fb39dd";

let failed = 0;
let ran = 0;
const check = (what, got, expected) => {
  const ok = JSON.stringify(got) === JSON.stringify(expected);
  ran += 1;
  if (!ok) failed += 1;
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok)
    console.log(
      `       expected ${JSON.stringify(expected)}\n       got      ${JSON.stringify(got)}`,
    );
};

const text = fs.readFileSync(
  path.join(import.meta.dirname, "figure-batches.mjs"),
  "utf8",
);
const normalised = createHash("sha256")
  .update(text.replace(/\s+/g, ""))
  .digest("hex")
  .slice(0, 16);

check(
  `THE SHARED CORE MATCHES THE COPY IN erudeon/passtheyear. If this is red, one repo has a fix the other does not, which is what put three bugs in one copy and not the other. Copy the file across and update this hash in BOTH.\n       hash now: ${normalised}`,
  normalised,
  SHARED,
);

// ── What the two uploaders actually depend on.

check(
  "THE BUDGET IS DERIVED FROM THE MEASURED LIMIT, not chosen. A body of 10,485,760 bytes arrives whole and one ten bytes larger does not, so the pictures in a request must leave room for the multipart framing around them.",
  [
    MAX_BATCH_BYTES < HUB_BODY_LIMIT_BYTES,
    HUB_BODY_LIMIT_BYTES - MAX_BATCH_BYTES >= 256 * 1024,
  ],
  [true, true],
);

const sized = (n, bytes) =>
  Array.from({ length: n }, (_, i) => ({ name: `p${i + 1}.png`, bytes }));

check(
  "PACKING STOPS AT THE BYTE BUDGET",
  packBatches(sized(4, MAX_BATCH_BYTES / 3), {}).map((b) => b.length),
  [3, 1],
);

check(
  "AND AT THE PART CEILING, which the route refuses the whole request over rather than trimming",
  packBatches(sized(MAX_BATCH_FILES + 1, 1), {}).map((b) => b.length),
  [MAX_BATCH_FILES, 1],
);

check(
  "A FILE TOO BIG FOR ANY BATCH STILL GETS ONE, so the per-file ceiling refuses it BY NAME rather than an empty batch refusing it by accident",
  packBatches([{ name: "huge.png", bytes: MAX_BATCH_BYTES * 2 }], {}).map(
    (b) => b.length,
  ),
  [1],
);

const batch = [
  { name: "a.png", bytes: 1 },
  { name: "b.png", bytes: 1 },
];

check(
  "AN ANSWER WITH NO ARRAYS IS A LOSS OF THE WHOLE BATCH. Appending nothing would report fewer figures than were given without naming one failure.",
  (() => {
    const r = reconcile(batch, 500, { error: "boom" }, 1);
    return [r.perFile, r.uploaded.length, r.failed.length];
  })(),
  [false, 0, 2],
);

check(
  "A NAME THE ANSWER SPELLS DIFFERENTLY IS COUNTED ONCE, not twice. Counting it twice made `failed` longer than the batch and turned the reconciliation line negative.",
  (() => {
    const r = reconcile(
      batch,
      207,
      { uploaded: [], failed: [{ name: "./a.png", error: "no" }] },
      1,
    );
    return [r.failed.length, r.volunteered];
  })(),
  [2, ["./a.png"]],
);

check(
  "EVERY FILE GETS EXACTLY ONE VERDICT, and silence about one is a failure rather than a success",
  (() => {
    const r = reconcile(
      batch,
      200,
      { uploaded: [{ name: "a.png", key: "k" }], failed: [] },
      1,
    );
    return [r.uploaded.map((u) => u.name), r.failed.map((f) => f.name)];
  })(),
  [["a.png"], ["b.png"]],
);

check(
  "A STOPPED RUN NAMES WHAT IT NEVER TRIED, or the count reports those files as figures that vanished",
  notAttempted([[{ name: "c.png" }], [{ name: "d.png" }]], 2).map(
    (f) => f.name,
  ),
  ["c.png", "d.png"],
);

check(
  "AND IT STOPS ONLY FOR A REFUSAL EVERY REQUEST WOULD GET",
  [401, 403, 429, 500, 422].map(refusesEveryRequest),
  [true, true, true, false, false],
);

console.log(`\n${ran - failed}/${ran} passed`);
process.exit(failed === 0 ? 0 : 1);
