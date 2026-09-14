/**
 * The findings list is counted once, and a list under the wrong key is REPORTED rather than counted as
 * nothing. Publish refuses while any line is `open`, so a miscount here is a gate that fails open.
 *
 *   node scripts/t_findings.mjs
 */
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const home = mkdtempSync(join(tmpdir(), "composer-findings-"));

/** One course folder with the given findings file, read back through the CLI the skill actually runs. */
function block(name, findings) {
  const dir = join(home, name);
  mkdirSync(join(dir, "01-inputs"), { recursive: true });
  writeFileSync(join(dir, "01-inputs", "summary.docx"), "not a real docx");
  writeFileSync(join(dir, "composer.json"), JSON.stringify({ course: name, gates: {} }));
  writeFileSync(join(dir, "findings.json"), JSON.stringify(findings));
  return execFileSync(process.execPath, [new URL("./state.mjs", import.meta.url).pathname, dir], {
    env: { ...process.env, COMPOSER_HOME: home },
    encoding: "utf8",
  });
}

const line = (state) => ({ id: "f-001", class: "file", what: "x", where: "y", state });
let failed = 0;
const check = (what, got) => {
  if (!got) failed++;
  console.log(`${got ? "ok  " : "FAIL"} ${what}`);
};

check(
  "a list under the documented key is counted and not complained about",
  !block("right-key", { lines: [line("open"), line("done")] }).includes("invisible to the gate"),
);
check(
  "a list under ANY other key is reported, because every count here reads `lines`",
  block("wrong-key", { lines: [], findings: [line("open")] }).includes('under "findings"'),
);
check(
  "so is one in a file with no `lines` at all",
  block("no-lines", { entries: [line("open")] }).includes('under "entries"'),
);
check(
  "an empty list is not a misplaced one",
  !block("empty", { lines: [] }).includes("invisible to the gate"),
);

process.exit(failed ? 1 : 0);
