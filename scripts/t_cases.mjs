/**
 * Four things that went wrong carrying multi-part cases between hubs on 15 September 2026, one assert
 * each. The network half is not tested here; these are the decisions that were wrong, and each of them
 * reported success while losing content.
 *
 *   node scripts/t_cases.mjs
 */
import assert from "node:assert/strict";

import { bindingWrites, casesOf, declareCases, fingerprint } from "./carry-cases.mjs";

/* 1. The export writes the SOURCE hub's id on every part. The first part must end up carrying the
      stimulus, and no later part may keep one, or a second part mints a second case. */
{
  const manifest = {
    topics: [
      {
        slug: "week-1",
        questions: [
          { key: "q1" },
          { key: "q2", group: { id: "src-1" } },
          { key: "q3", group: { id: "src-1" } },
          { key: "q4", group: { id: "src-2" } },
        ],
      },
    ],
  };
  const { sidecar, missing } = declareCases(manifest, new Map([["src-1", "A case"], ["src-2", "Another"]]));
  assert.equal(missing.length, 0);
  const [q1, q2, q3, q4] = manifest.topics[0].questions;
  assert.equal(q1.group, undefined, "a standalone question is left alone");
  assert.deepEqual(q2.group, { stem: "A case" }, "the first part declares the case");
  assert.equal("group" in q3, false, "a later part must carry no group at all");
  assert.deepEqual(q4.group, { stem: "Another" });
  assert.deepEqual(sidecar["week-1"].map((c) => c.keys), [["q2", "q3"], ["q4"]]);
}

/* 2. A case the source cannot explain is a refusal. Its parts would otherwise be written as standalone
      questions about a situation the student is never shown, which no count can see. */
{
  const manifest = { topics: [{ slug: "week-2", questions: [{ key: "q9", group: { id: "gone" } }] }] };
  const { missing } = declareCases(manifest, new Map());
  assert.deepEqual(missing, ["week-2: case gone"]);
}

/* 3. The stimulus makes a markdown to rich to markdown round trip, so matching on bytes fails. The
      fingerprint has to survive moved markers and re-wrapped whitespace. */
{
  const sent = "**Case: the research request**\n\nPsychologist Meijer is treating Sanne (34).";
  const readBack = "**Case: the research request**\n\nPsychologist Meijer is treating\nSanne (34).";
  assert.equal(fingerprint(sent), fingerprint(readBack));
  assert.notEqual(fingerprint(sent), fingerprint("**Case: the card and the bequest**\n\nSomething else."));
}

/* 4. A part already in its case must not be rewritten. An update bumps a version, stamps the row and
      writes an audit line, so a re-run that "fixed" everything again would churn the whole bank. */
{
  const sidecar = { "week-1": [{ stem: "A case", keys: ["q2", "q3"] }] };
  const groups = new Map([[fingerprint("A case"), "live-1"]]);
  const stored = new Map([
    ["q2", { questionId: "id2", question: { key: "q2", group: { id: "live-1" }, stem: "..." } }],
    ["q3", { questionId: "id3", question: { key: "q3", stem: "..." } }],
  ]);
  const { writes, already } = bindingWrites(sidecar, groups, stored);
  assert.equal(already, 1, "the part that is already in its case is left alone");
  assert.equal(writes.length, 1);
  assert.equal(writes[0].questionId, "id3");
  assert.deepEqual(writes[0].question.group, { id: "live-1" });
  assert.equal(writes[0].question.stem, "...", "the whole question goes back, because an update replaces it");
}

/* casesOf keeps declaration order, which is the order the parts take inside the case. */
{
  const parts = casesOf({ questions: [{ key: "b", group: { id: "g" } }, { key: "a", group: { id: "g" } }] });
  assert.deepEqual(parts.get("g").map((q) => q.key), ["b", "a"]);
}

console.log("ok  carry-cases: declares, refuses a case with no stimulus, matches on words, binds once");
