/**
 * A COURSE IS PUBLISHED FROM CODE THAT EXISTS IN GIT.
 *
 * The manifest is built by these scripts, so it is only as reproducible as the checkout that made it.
 * Publishing from a dirty one put an in-flight change on a PUBLISHED lecture: it lifted a whole worked
 * example into one callout, so the sentence introducing three journal entries sat in a box and the
 * entries sat outside it. The next operator rebuilding from `main` would have got something else and
 * had no way to tell which a student was reading.
 */
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const { mkdtempSync, writeFileSync, mkdirSync, appendFileSync, readFileSync } = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");

/* A throwaway clone of this checkout, so the real one is never touched. */
const dir = mkdtempSync(join(tmpdir(), "composer-dirty-"));
const repo = join(dir, "plugin");
mkdirSync(join(repo, "scripts"), { recursive: true });
const git = (...a) => spawnSync("git", ["-C", repo, ...a], { encoding: "utf8" });
git("init", "-q");
git("config", "user.email", "t@t");
git("config", "user.name", "t");
for (const f of ["push.mjs", "handcraft-check.mjs", "credential.mjs"])
  writeFileSync(join(repo, "scripts", f), readFileSync(join(__dirname, f)));
git("add", "-A");
git("commit", "-qm", "seed");

const manifest = join(dir, "manifest.json");
writeFileSync(manifest, JSON.stringify({ topics: [{ number: 1, title: "T", blocks: [] }] }));

const push = (...extra) =>
  spawnSync(process.execPath, [join(repo, "scripts", "push.mjs"), manifest, "--apply", ...extra], {
    encoding: "utf8",
    env: { ...process.env, PTY_MCP_TOKEN: "not-a-real-token" },
  });

/* Clean: it must get PAST the guard. It fails later, on the credential, which is fine and expected. */
let r = push();
assert.doesNotMatch(
  r.stderr,
  /are not committed/,
  `a clean checkout was refused:\n${r.stderr}`,
);

/* Dirty: it must refuse, name the count, and name the file. */
appendFileSync(join(repo, "scripts", "handcraft-check.mjs"), "\n// an uncommitted change\n");
r = push();
assert.match(r.stderr, /Nothing was sent/, `a dirty checkout was allowed through:\n${r.stderr}`);
assert.match(r.stderr, /handcraft-check\.mjs/, `the refusal did not name the file:\n${r.stderr}`);

/* And the escape hatch has to work, or somebody testing a change cannot test it. */
r = push("--dirty-ok");
assert.doesNotMatch(r.stderr, /are not committed/, `--dirty-ok did not open the gate:\n${r.stderr}`);

console.log("t_dirty: a course is published from code that exists in git");
