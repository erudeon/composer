/**
 * Every way carrying multi-part cases between hubs has gone wrong, one assert each: four found by doing
 * it on 15 September 2026, and four more a review found in the fix itself. The network half is not
 * tested here. All eight live in the pure half, and every one of them reported success while losing
 * content, which is the only failure this script exists to stop.
 *
 *   node scripts/t_cases.mjs
 */
import assert from "node:assert/strict";

import {
  alreadyDeclared,
  bindingWrites,
  caseIndex,
  casesOf,
  declareCases,
  fingerprint,
} from "./carry-cases.mjs";

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
  const { sidecar, missing } = declareCases(
    manifest,
    new Map([
      ["src-1", "A case"],
      ["src-2", "Another"],
    ]),
  );
  assert.equal(missing.length, 0);
  const [q1, q2, q3, q4] = manifest.topics[0].questions;
  assert.equal(q1.group, undefined, "a standalone question is left alone");
  assert.deepEqual(
    q2.group,
    { stem: "A case" },
    "the first part declares the case",
  );
  assert.equal("group" in q3, false, "a later part must carry no group at all");
  assert.deepEqual(q4.group, { stem: "Another" });
  assert.deepEqual(
    sidecar["week-1"].map((c) => c.keys),
    [["q2", "q3"], ["q4"]],
  );
}

/* 2. A case the source cannot explain is a refusal. Its parts would otherwise be written as standalone
      questions about a situation the student is never shown, which no count can see. */
{
  const manifest = {
    topics: [
      { slug: "week-2", questions: [{ key: "q9", group: { id: "gone" } }] },
    ],
  };
  const { missing } = declareCases(manifest, new Map());
  assert.deepEqual(missing, ["week-2: case gone"]);
}

/* 3. The stimulus makes a markdown to rich to markdown round trip, so matching on bytes fails. The
      fingerprint has to survive moved markers and re-wrapped whitespace. */
{
  const sent =
    "**Case: the research request**\n\nPsychologist Meijer is treating Sanne (34).";
  const readBack =
    "**Case: the research request**\n\nPsychologist Meijer is treating\nSanne (34).";
  assert.equal(fingerprint(sent), fingerprint(readBack));
  assert.notEqual(
    fingerprint(sent),
    fingerprint("**Case: the card and the bequest**\n\nSomething else."),
  );
}

/* 4. A part already in its case must not be rewritten. An update bumps a version, stamps the row and
      writes an audit line, so a re-run that "fixed" everything again would churn the whole bank. */
{
  // ONE lecture's entries: a bank is a lecture's, and a key is unique inside it and nowhere wider.
  const entries = [{ stem: "A case", keys: ["q2", "q3"] }];
  const groups = new Map([[fingerprint("A case"), "live-1"]]);
  const stored = new Map([
    [
      "q2",
      {
        questionId: "id2",
        question: { key: "q2", group: { id: "live-1" }, stem: "..." },
      },
    ],
    ["q3", { questionId: "id3", question: { key: "q3", stem: "..." } }],
  ]);
  const { writes, already } = bindingWrites(entries, groups, stored);
  assert.equal(
    already,
    1,
    "the part that is already in its case is left alone",
  );
  assert.equal(writes.length, 1);
  assert.equal(writes[0].questionId, "id3");
  assert.deepEqual(writes[0].question.group, { id: "live-1" });
  assert.equal(
    writes[0].question.stem,
    "...",
    "the whole question goes back, because an update replaces it",
  );
}

/* casesOf keeps declaration order, which is the order the parts take inside the case. */
{
  const parts = casesOf({
    questions: [
      { key: "b", group: { id: "g" } },
      { key: "a", group: { id: "g" } },
    ],
  });
  assert.deepEqual(
    parts.get("g").map((q) => q.key),
    ["b", "a"],
  );
}

/* 5. Two cases in one bank whose stimulus agrees for 120 characters cannot be told apart. A plain Map
      kept the last one, so every part of BOTH cases went into whichever the hub returned second, and the
      part count then read correct. A case series shares its preamble by design: this is ordinary input. */
{
  const shared =
    "Case 3: Psychologist Meijer is treating Sanne (34) for panic complaints, referred by her GP after a long and difficult year in which she";
  const { byFingerprint, ambiguous } = caseIndex([
    { id: "group-A", stem: `${shared} difficult year at work.` },
    { id: "group-B", stem: `${shared} difficult year at home.` },
  ]);
  assert.equal(
    ambiguous.length,
    1,
    "the pair that cannot be told apart is reported",
  );
  assert.equal(byFingerprint.size, 1);

  const distinct = caseIndex([
    { id: "a", stem: "Case: the card" },
    { id: "b", stem: "Case: the father" },
  ]);
  assert.deepEqual(distinct.ambiguous, []);
  assert.equal(distinct.byFingerprint.size, 2);
}

/* 6. A declared part the bank cannot account for is REPORTED, never skipped. `continue` on a missing key
      is correct per bank and silent overall: three declared parts with one readable answered "1 write"
      and a success line. */
{
  const entries = [{ stem: "A case", keys: ["q1", "q2", "q3"] }];
  const groups = new Map([[fingerprint("A case"), "live-1"]]);
  const stored = new Map([
    ["q1", { questionId: "id1", question: { key: "q1" } }],
  ]);
  const { writes, unresolved } = bindingWrites(entries, groups, stored);
  assert.equal(writes.length, 1);
  assert.deepEqual(
    unresolved.map((u) => u.key),
    ["q2", "q3"],
  );
}

/* 7. A case that never reached the target hub is reported rather than passed over, or the parts of a
      case the apply refused would be left standalone with nothing saying so. */
{
  const { writes, unresolved } = bindingWrites(
    [{ stem: "Missing case", keys: ["q1"] }],
    new Map(),
    new Map(),
  );
  assert.equal(writes.length, 0);
  assert.equal(unresolved[0].why, "its case is not on the target hub");
}

/* 8. A second `stems` run would find no group ids at all, declare nothing, report nothing missing, and
      overwrite the good sidecar with an empty one. `bind` then moves nothing and calls it success. */
{
  assert.equal(
    alreadyDeclared({
      topics: [{ questions: [{ key: "q1", group: { id: "src-1" } }] }],
    }),
    false,
  );
  assert.equal(
    alreadyDeclared({
      topics: [{ questions: [{ key: "q1", group: { stem: "A case" } }] }],
    }),
    true,
  );
  assert.equal(
    alreadyDeclared({ topics: [{ questions: [{ key: "q1" }] }] }),
    false,
  );
}

console.log(
  "ok  carry-cases: declares, refuses a case with no stimulus or an ambiguous one, matches on words,\n" +
    "    binds once, reports every part it cannot account for, and refuses a second declaration",
);
