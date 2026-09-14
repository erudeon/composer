#!/usr/bin/env node
/**
 * RESTORE THE SPACES A MULTI-WORD NAME LOSES IN MATHS MODE, in place.
 *
 * `katex-check.js` reports these; this is the repair it names. A space between two letters inside an
 * expression is not drawn, so `Share Capital` reads as "ShareCapital". This puts back the `\ ` that
 * makes it a real space, and touches nothing else: not a space inside `\text{}`, where it is already
 * real, and not a space that ends a control word, where it is load-bearing.
 *
 *   node fix-maths-spacing.mjs <extract.md> [--check]
 *
 * `--check` writes nothing and exits non-zero when a repair is still owed, which is what a gate wants.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { mathsSpans } = require("./intake/maths-spans.js");
const { weldedSpaces } = require("./intake/maths-spacing.js");

const file = process.argv[2];
const check = process.argv.includes("--check");
if (!file) {
  console.error("usage: node fix-maths-spacing.mjs <extract.md> [--check]");
  process.exit(2);
}

const text = readFileSync(file, "utf8");
const spans = mathsSpans(text);

/*
 * BACK TO FRONT. Every span carries an offset into the original text, and repairing one makes it
 * longer, so working forwards invalidates every offset after the first edit.
 *
 * A span's offsets INCLUDE its `$` delimiters and its `tex` does not, so the replacement is made
 * inside the slice rather than over it. Splicing `tex` across [start, end) eats the dollars, and the
 * rest of the document becomes maths. Done with a function replacement, because `$` in a string
 * replacement is a capture reference and these strings are full of them.
 */
let out = text;
let equations = 0;
let spaces = 0;
for (const span of [...spans].reverse()) {
  const { tex, fixed } = weldedSpaces(span.tex);
  if (fixed === 0) continue;
  const raw = out.slice(span.start, span.end);
  const at = raw.indexOf(span.tex);
  if (at === -1) {
    console.error(`! could not place a repaired equation, nothing written: ${span.tex.slice(0, 60)}`);
    process.exit(2);
  }
  const repaired = raw.slice(0, at) + tex + raw.slice(at + span.tex.length);
  equations += 1;
  spaces += fixed;
  out = out.slice(0, span.start) + repaired + out.slice(span.end);
}

if (check) {
  console.log(
    equations === 0
      ? `${spans.length} equation(s), none welded`
      : `! ${equations} equation(s) still have a welded multi-word name`,
  );
  process.exit(equations === 0 ? 0 : 1);
}

if (equations > 0) writeFileSync(file, out);
console.log(
  `${spans.length} equation(s), ${equations} repaired, ${spaces} space(s) restored`,
);
