/**
 * `figure-batches.mjs` — HOW A COURSE'S FIGURES ARE CUT INTO REQUESTS, AND WHAT EACH ANSWER MEANS.
 *
 * ── THIS FILE EXISTS TWICE, BYTE FOR BYTE ────────────────────────────────────────────────────────────
 *
 *   erudeon/composer          scripts/figure-batches.mjs
 *   erudeon/passtheyear       apps/web/scripts/figure-batches.mjs
 *
 * The two UPLOADERS around it cannot be merged and should not be: the platform's reaches staging and
 * carries Cloudflare Access headers, this one refuses any hub but production and signs in through a
 * browser instead of holding a token. Those are different trust boundaries and each is right where it
 * lives. What was never different is everything below — how bytes are packed and what an answer means —
 * and keeping THAT in two places is what let one fix miss the other for a whole afternoon: three bugs
 * were found in one copy and had to be carried to the other by hand, twice.
 *
 * So it is one file, copied. Each repo's check asserts its copy hashes to the value both checks record.
 * CHANGE IT IN BOTH, or the other repo's check goes red on the next run and says so. Neither repo can
 * import from the other: this one ships as a Claude Code plugin to machines with no platform checkout,
 * and runs on plain Node with nothing installed.
 *
 * Nothing here does IO, holds a credential or knows a URL. That is the other half's job.
 */

/**
 * WHAT A BODY MAY WEIGH BEFORE SOMETHING CUTS IT, measured against production on 2026-09-15 by binary
 * search: a body of 10,485,760 bytes arrives whole and one of 10,485,770 does not.
 *
 * IT IS NOT THE ROUTE'S LIMIT. At 24 MB the route's own 413 fires from the `content-length` fast path,
 * so the request plainly reaches the app; the route is willing to write 20 MB and never gets the chance.
 * Something at the EDGE truncates the body and leaves the original `content-length` on it, so the
 * multipart parse finds no closing boundary. For a year that came back as "the request body must be
 * multipart/form-data", which is a true sentence about the wrong thing.
 */
export const HUB_BODY_LIMIT_BYTES = 10 * 1024 * 1024;

/**
 * ROOM FOR EVERYTHING IN THE BODY THAT IS NOT A PICTURE: a boundary, a content-disposition header and a
 * content-type per part (about 210 bytes each, so ~11 KB at the file ceiling below), plus the manifest
 * JSON, whose alt text may run to 300 characters a figure (~20 KB at that ceiling). Half a megabyte is
 * roughly sixteen times what the worst case needs, which is the right trade: the cost of being generous
 * is one extra request on a large course, and the cost of being tight is a refusal that reads as a
 * corrupt upload.
 */
export const FRAMING_ALLOWANCE_BYTES = 512 * 1024;

/** What one request may carry in PICTURES, derived rather than guessed. */
export const MAX_BATCH_BYTES = HUB_BODY_LIMIT_BYTES - FRAMING_ALLOWANCE_BYTES;

/** The route's own cap on parts per request. Past it the whole request is refused, not trimmed. */
export const MAX_BATCH_FILES = 50;

/** The writer's per-image ceiling. A file past it is refused by the route, so it is refused here first. */
export const MAX_FILE_BYTES = 5 * 1024 * 1024;

/**
 * GREEDY PACKING BY WEIGHT, so a course of any size is a handful of requests rather than one refusal.
 *
 * `entries` are whatever the caller tracks per figure; only `bytes` is read. A single entry over
 * `MAX_BATCH_BYTES` still gets a batch of its own rather than an empty one, because the per-file ceiling
 * above is the thing that refuses it and it should be refused by name.
 */
export function packBatches(entries, limits = {}) {
  const maxBytes = limits.maxBytes ?? MAX_BATCH_BYTES;
  const maxFiles = limits.maxFiles ?? MAX_BATCH_FILES;
  const batches = [];
  let current = [];
  let currentBytes = 0;
  for (const entry of entries) {
    const tooHeavy = currentBytes + entry.bytes > maxBytes;
    const tooMany = current.length >= maxFiles;
    if (current.length > 0 && (tooHeavy || tooMany)) {
      batches.push(current);
      current = [];
      currentBytes = 0;
    }
    current.push(entry);
    currentBytes += entry.bytes;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

/**
 * WHAT ONE REQUEST SAID ABOUT EACH FILE IT WAS GIVEN.
 *
 * The route answers 200, 207 and 422 with `uploaded` and `failed` PER FILE. Reading `!ok` first and
 * replacing both with the status code is why a refused batch once printed identical lines naming no
 * picture. Anything else — a 500, a 413, a 400, an auth refusal — carries neither array, and pushing
 * them appends nothing: the run would report fewer figures than it was given WITHOUT naming one failure,
 * and the markdown map would be substituted into a manifest with markers pointing at nothing.
 *
 * DRIVEN BY THE BATCH, NOT BY THE ANSWER, so every file gets exactly ONE verdict, looked up by name.
 * Pushing the answer's rows wholesale and then adding the unmentioned ones counts a file twice whenever
 * the answer spells its name differently (`./pic1.png` for `pic1.png`) — which makes `failed` longer than
 * the batch and turns the reconciliation line, whose whole job is to prove the run added up, NEGATIVE.
 *
 * `volunteered` is a name the answer offered that this request never sent. Not a lost file; a route to
 * go and look at.
 */
export function reconcile(batch, status, body, requestNumber) {
  const perFile = Array.isArray(body?.uploaded) || Array.isArray(body?.failed);
  if (!perFile) {
    return {
      perFile,
      uploaded: [],
      failed: batch.map((entry) => ({
        name: entry.name,
        error: `request ${requestNumber} answered ${status}`,
      })),
      volunteered: [],
    };
  }

  const byName = (rows) => new Map(rows.map((item) => [item.name, item]));
  const landed = byName(body.uploaded ?? []);
  const refused = byName(body.failed ?? []);
  const uploaded = [];
  const failed = [];
  for (const entry of batch) {
    const ok = landed.get(entry.name);
    if (ok) {
      uploaded.push(ok);
      continue;
    }
    failed.push(
      refused.get(entry.name) ?? {
        name: entry.name,
        error: `request ${requestNumber} answered ${status} without naming this file`,
      },
    );
  }
  const sent = new Set(batch.map((entry) => entry.name));
  const answered = [...landed.keys(), ...refused.keys()];
  const volunteered = answered.filter((name) => !sent.has(name));
  return { perFile, uploaded, failed, volunteered };
}

/**
 * EVERY FILE A STOPPED RUN NEVER TRIED. An auth or budget refusal will refuse the remaining requests
 * identically, so the run stops — and without this the count reports those files as figures that
 * vanished and prints "BUG" at somebody who did nothing wrong.
 */
export function notAttempted(remainingBatches, afterRequestNumber) {
  return remainingBatches.flat().map((entry) => ({
    name: entry.name,
    error: `not attempted: the run stopped after request ${afterRequestNumber}`,
  }));
}

/** A refusal that will be repeated by every remaining request, so there is no point sending them. */
export function refusesEveryRequest(status) {
  return [401, 403, 429].includes(status);
}
