/**
 * THE SHARED CORE HAS NOT DRIFTED, and it still does what the two uploaders need.
 *
 *   node scripts/t_figurebatches.mjs
 *
 * `figure-batches.mjs` exists in this repo and in `erudeon/passtheyear` at
 * `apps/web/scripts/figure-batches.mjs`. Neither can import from the other: this one ships as a plugin to
 * machines with no platform checkout. So it is one file, copied, and the hash below keeps them honest.
 *
 * THE HASH IS NOT ENOUGH ON ITS OWN, and believing it was is the mistake this file was reviewed for. When
 * it goes red its own remedy is "copy the file across and update the hash in BOTH" -- exactly right for a
 * deliberate edit, and therefore a way to launder ANY deliberate edit past every check that reads its
 * numbers back out of the module. Measured: six mutations survived the behaviour checks this file first
 * shipped with, including restoring the guessed 8 MiB budget and raising MAX_BATCH_FILES to 500, which
 * would make the route answer 400 to every request. So the numbers are pinned to LITERALS here.
 *
 * THE ROUTE'S OWN CONSTANTS ARE COMPARED IN THE PLATFORM'S HALF, `apps/web/scripts/figure-batches.test.ts`
 * -- it is the repo that has the route. This half cannot see it, which is the honest limit of a check that
 * ships to a machine with no platform checkout.
 *
 * COMPARED WITH WHITESPACE REMOVED, not collapsed and not byte for byte. Both repos' checks must normalise
 * the SAME way, or the hash cannot be one number in two repositories: a collapsed newline becomes a space
 * the other side never had. Removing it ignores every wrapping decision and nothing else. It IS blind to
 * spacing inside a string literal, which is why the messages below are spelled out whole.
 *
 * WHEN THIS FAILS, never update the hash alone. Copy the file across, then update it in BOTH repos.
 *
 * NOTHING RUNS THIS AUTOMATICALLY. This repo has no CI; the platform's half runs on every pull request
 * there. So a fix made HERE and not carried across is caught only when somebody runs the sweep in
 * CLAUDE.md, which is why that sweep is in CLAUDE.md.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {
  FRAMING_ALLOWANCE_BYTES,
  HUB_BODY_LIMIT_BYTES,
  MAX_ALT_CHARS,
  MAX_BATCH_BYTES,
  MAX_BATCH_FILES,
  MAX_FILE_BYTES,
  notAttempted,
  packBatches,
  reconcile,
  refusesEveryRequest,
} from "./figure-batches.mjs";

/**
 * The normalised hash of `figure-batches.mjs`. IDENTICAL IN BOTH REPOSITORIES.
 * Update it in both, in the same change that copies the file across.
 */
const SHARED = "7ba827e85e1be76a";

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

// ── The numbers, pinned to literals rather than read back out of the module.

check(
  "THE MEASURED LIMIT IS THE MEASURED LIMIT. A body of 10,485,760 bytes arrives whole and one ten bytes larger does not. Asserting merely that the budget sits UNDER it passes for the guessed 8 MiB this replaced.",
  [
    HUB_BODY_LIMIT_BYTES,
    MAX_BATCH_BYTES,
    MAX_BATCH_BYTES === HUB_BODY_LIMIT_BYTES - FRAMING_ALLOWANCE_BYTES,
  ],
  [10485760, 9961472, true],
);

check(
  "AND THE ROUTE'S OWN CEILINGS ARE WHAT THE ROUTE SAYS. Raising one of these without raising it there makes every request answer 400; the platform's half compares them against the route directly.",
  [MAX_BATCH_FILES, MAX_FILE_BYTES, MAX_ALT_CHARS],
  [50, 5242880, 300],
);

// ── What the two uploaders actually depend on.

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
  "AN ANSWER WITH NO ARRAYS IS A LOSS OF THE WHOLE BATCH, NAMING THE REQUEST. Appending nothing would report fewer figures than were given without naming one failure.",
  reconcile(batch, 500, { error: "boom" }, 1),
  {
    perFile: false,
    uploaded: [],
    failed: [
      { name: "a.png", error: "request 1 answered 500" },
      { name: "b.png", error: "request 1 answered 500" },
    ],
    volunteered: [],
  },
);

check(
  "A NULL BODY IS A LOST BATCH, not a crash. The old inline copy threw at `body.uploaded`.",
  reconcile(batch, 502, null, 3).failed.length,
  2,
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
  "A FILE THAT LANDED COMES BACK AS THE ROUTE'S ROW, not the entry that was sent. The caller reads `key` and `markdown` off these, so handing back the entry gives the right name and the right count while stranding every storage key.",
  reconcile(
    batch,
    200,
    {
      uploaded: [{ name: "a.png", key: "k", markdown: "![a](k)", bytes: 10 }],
      failed: [],
    },
    1,
  ),
  {
    perFile: true,
    uploaded: [{ name: "a.png", key: "k", markdown: "![a](k)", bytes: 10 }],
    failed: [
      {
        name: "b.png",
        error: "request 1 answered 200 without naming this file",
      },
    ],
    volunteered: [],
  },
);

check(
  "A STOPPED RUN NAMES WHAT IT NEVER TRIED, or the count reports those files as figures that vanished",
  notAttempted([[{ name: "c.png" }], [{ name: "d.png" }]], 2),
  [
    { name: "c.png", error: "not attempted: the run stopped after request 2" },
    { name: "d.png", error: "not attempted: the run stopped after request 2" },
  ],
);

check(
  "AND IT STOPS ONLY FOR A REFUSAL EVERY REQUEST WOULD GET",
  [401, 403, 429, 500, 422].map(refusesEveryRequest),
  [true, true, true, false, false],
);

console.log(`\n${ran - failed}/${ran} passed`);
process.exit(failed === 0 ? 0 : 1);
