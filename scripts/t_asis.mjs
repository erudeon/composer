/**
 * `--as-is` ON `propose-dispositions.mjs`: the author's pictures are published as pictures.
 *
 *   node scripts/t_asis.mjs
 *
 * The case worth pinning is the one where the two answers DISAGREE. A picture whose prose happens to
 * state a function of x is proposed as a chart by default, which is right for a maths summary and wrong
 * for every course whose pictures are diagrams, screenshots and photographs. A flag that only agreed
 * with the default on the easy cases would pass a test and still trace a curve over somebody's
 * photograph, so this drives a picture that WOULD become a chart and checks that it does not.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

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

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "t_asis-"));
const inventoryPath = path.join(dir, "media-inventory.json");
const sourcePath = path.join(dir, "source-of-record.md");

fs.writeFileSync(
  inventoryPath,
  JSON.stringify({
    drawings: [
      {
        index: 0,
        kind: "picture",
        under: "A curve the text can draw",
        file: "word/media/image1.png",
        disposition: null,
      },
    ],
  }),
);
fs.writeFileSync(
  sourcePath,
  "# A curve the text can draw\n\nThe function y = x^2 + 1 is plotted below.\n",
);

/** The exit code and the dispositions, because the gate closing is half the point of the flag. */
function run(...flags) {
  let stdout;
  let code = 0;
  try {
    stdout = execFileSync(
      process.execPath,
      [
        path.join(import.meta.dirname, "propose-dispositions.mjs"),
        inventoryPath,
        sourcePath,
        ...flags,
      ],
      { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
    );
  } catch (err) {
    // UNCERTAIN exits 1 on purpose, and that run's output is exactly what this needs to read.
    stdout = err.stdout ?? "";
    code = err.status ?? 1;
  }
  return {
    code,
    dispositions: [...stdout.matchAll(/^(\S+)\s+\(\d+\)$/gm)].map((m) => m[1]),
  };
}

const dispositions = (...flags) => run(...flags).dispositions;

check(
  "BY DEFAULT a function of x near a picture proposes a chart, which is the behaviour --as-is exists to override.",
  dispositions(),
  ["chart"],
);

check(
  "WITH --as-is the same picture is a figure. The evidence did not change; the decision did.",
  dispositions("--as-is"),
  ["figure"],
);

check(
  "WITH --as-is THE RUN EXITS 0. UNCERTAIN exits 1 to stop a person, and a flag that states the decision but still stopped them would be no decision at all.",
  run("--as-is").code,
  0,
);

check(
  "A NEAR MISS IS REFUSED, NOT IGNORED. `--asis` reads as 'as is' to a person and as 'no flag' to the parser, and the silent fallback proposes tracing a curve over somebody's photograph.",
  ["--asis", "--as_is", "--as-is=true", "-as-is"].map((f) => run(f).code),
  [2, 2, 2, 2],
);

fs.rmSync(dir, { recursive: true, force: true });

console.log(`\n${ran - failed}/${ran} passed`);
process.exit(failed === 0 ? 0 : 1);
