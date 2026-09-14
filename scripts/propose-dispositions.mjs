#!/usr/bin/env node
/**
 * `propose-dispositions.mjs` — PAIR EVERY DRAWING WITH THE TEXT AROUND IT, so a person can decide.
 *
 * ── WHY A SCRIPT AND NOT A READ-THROUGH ──────────────────────────────────────────────────────────────
 *
 * A real summary has 79 drawings and 97 KB of prose. Deciding what each picture becomes means knowing
 * what the text says NEAR it, and a session that reads the whole document to place each one pays for
 * that document 79 times. The pairing is mechanical; only the decision is not.
 *
 * ── IT PROPOSES. IT NEVER DECIDES. ───────────────────────────────────────────────────────────────────
 *
 * Every proposal carries the evidence it was made from: the heading, the surrounding line, and the
 * expression it found, quoted. A proposal with no evidence comes out as UNCERTAIN and stays that way.
 * The operator confirms in groups, and the session must LOOK at any picture whose proposal it is about
 * to act on, because an expression that appears near a picture is not necessarily the expression the
 * picture draws.
 *
 * ── WHAT COUNTS AS EVIDENCE ──────────────────────────────────────────────────────────────────────────
 *
 * An expression in x is a candidate for a chart's `fn`. That is the only thing here that can become an
 * interactive element without somebody inventing a curve, and inventing one is the failure that cannot
 * be caught downstream: a plausible wrong curve teaches a student something false and renders perfectly.
 *
 *   node propose-dispositions.mjs <media-inventory.json> <source-of-record.txt>
 *
 * Exits 1 when anything is UNCERTAIN, because that is a thing a person must look at.
 */
import { readFileSync, existsSync } from "node:fs";

const [, , inventoryPath, sourcePath] = process.argv;
if (!inventoryPath || !sourcePath) {
  console.error(
    "usage: propose-dispositions.mjs <media-inventory.json> <source-of-record.txt>",
  );
  process.exit(2);
}
for (const f of [inventoryPath, sourcePath]) {
  if (!existsSync(f)) {
    console.error(`no such file: ${f}`);
    process.exit(2);
  }
}

const inventory = JSON.parse(readFileSync(inventoryPath, "utf8"));
const source = readFileSync(sourcePath, "utf8");
const lines = source.split("\n");

/** A function of x, written either as maths or as plain text. Both appear in a converted summary. */
const FUNCTION_OF_X = /(?:[fghpqyv]\s*\(\s*x\s*\)|y)\s*=\s*([^\n,;.]{2,80})/i;
/** A 3D surface names two variables. The reader has no 3D chart, so these are figures. */
const TWO_VARIABLE = /\(\s*x\s*,\s*y\s*\)|\bz\s*=/i;

/** The lines around a heading, which is the only position an extracted picture carries. */
function contextFor(heading) {
  if (!heading) return [];
  const at = lines.findIndex((l) =>
    l.includes(heading.replace(/\.\.\.$/, "").slice(0, 40)),
  );
  if (at === -1) return [];
  return lines.slice(Math.max(0, at - 2), at + 12);
}

function propose(d) {
  if (d.kind === "textbox") {
    return {
      disposition: "fold",
      why: "a floating text box: what it says belongs in the block it annotates",
      evidence: d.text ?? null,
    };
  }
  if (d.kind === "shape") {
    return {
      disposition: "fold",
      why: "a shape drawn over the text: what it pointed at belongs in the block",
      evidence: null,
    };
  }

  const ctx = contextFor(d.under).join("\n");
  if (TWO_VARIABLE.test(ctx)) {
    return {
      disposition: "figure",
      why: "the text names two variables, so this is a surface and the reader has no 3D chart",
      evidence: d.under,
    };
  }
  const m = FUNCTION_OF_X.exec(ctx);
  if (m) {
    return {
      disposition: "chart",
      why: "the text states a function of x, so the curve can be drawn from it rather than traced",
      evidence: m[0].trim(),
    };
  }
  return {
    disposition: "UNCERTAIN",
    why: "no expression found near this picture. LOOK at the image and read the prose before deciding",
    evidence: d.under,
  };
}

const proposals = inventory.drawings.map((d) => ({ ...d, ...propose(d) }));
const groups = new Map();
for (const p of proposals) {
  const key = p.disposition;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(p);
}

console.log(`${proposals.length} drawing(s) in ${inventoryPath}\n`);
for (const [disposition, items] of [...groups].sort(
  (a, b) => b[1].length - a[1].length,
)) {
  console.log(`${disposition}  (${items.length})`);
  console.log(`  ${items[0].why}`);
  for (const it of items.slice(0, 8)) {
    console.log(
      `    #${String(it.index).padStart(2)} ${(it.file ?? it.kind).padEnd(24)} ${it.evidence ? JSON.stringify(String(it.evidence).slice(0, 62)) : ""}`,
    );
  }
  if (items.length > 8) console.log(`    ... and ${items.length - 8} more`);
  console.log("");
}

const uncertain = groups.get("UNCERTAIN")?.length ?? 0;
console.log(
  "These are PROPOSALS. Nothing is decided until the author says so, and any picture becoming",
);
console.log(
  "an interactive chart must be LOOKED AT and checked against the curve before it is written.",
);

if (uncertain > 0) {
  console.error(
    `\n! ${uncertain} drawing(s) have no evidence either way. A person has to look at them.`,
  );
  process.exit(1);
}
