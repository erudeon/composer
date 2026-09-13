#!/usr/bin/env node
/**
 * `validate.mjs` — THE CHECKS THIS PLUGIN CAN RUN ON ITSELF.
 *
 * A plugin fails differently from an application. There is no compiler and no type system: a skill that
 * points at a reference file nobody wrote, or runs a script that is not there, is perfectly valid text
 * that fails only when an operator is halfway through a course. Both of those have already happened
 * here, which is why this exists rather than because it seemed tidy.
 *
 * It also refuses frontmatter keys that are not real. `arguments:` looked plausible, appeared in no
 * other skill anywhere, bound nothing, and left a `$folder` that silently expanded to an empty string.
 *
 *   node scripts/validate.mjs
 *
 * Exit 1 on any error. Warnings print and do not fail.
 */
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * What a SKILL.md may declare. Taken from what skills in the wild actually carry: `arguments` is
 * NOT here on purpose. A command takes `$ARGUMENTS`; a skill does not bind positional arguments.
 */
const ALLOWED_KEYS = new Set([
  "name",
  "description",
  "license",
  "allowed-tools",
  "disallowed-tools",
  "metadata",
  "compatibility",
  "argument-hint",
]);

/** Descriptions are paid on EVERY turn, so length here is a running cost, not a one-off. */
const DESCRIPTION_MAX = 1024;
/** A body over this wants a `reference/` file: it is loaded whole whenever the skill fires. */
const BODY_MAX_LINES = 500;

const errors = [];
const warnings = [];

function frontmatter(text, file) {
  if (!text.startsWith("---\n")) {
    errors.push(`${file}: no frontmatter`);
    return null;
  }
  const end = text.indexOf("\n---", 4);
  if (end === -1) {
    errors.push(`${file}: frontmatter is not closed`);
    return null;
  }
  const out = {};
  for (const line of text.slice(4, end).split("\n")) {
    const m = /^([a-z][a-z-]*):\s*(.*)$/.exec(line);
    // Continuation and nested lines belong to the key above them; only top-level keys are checked.
    if (m) out[m[1]] = m[2];
  }
  return { keys: out, bodyFrom: end + 4 };
}

const skillsDir = join(ROOT, "skills");
const skillNames = existsSync(skillsDir)
  ? readdirSync(skillsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
  : [];

if (skillNames.length === 0) errors.push("skills/: no skills found");

const seenNames = new Map();

for (const dir of skillNames) {
  const file = join("skills", dir, "SKILL.md");
  const full = join(ROOT, file);
  if (!existsSync(full)) {
    errors.push(`${file}: missing`);
    continue;
  }
  const text = readFileSync(full, "utf8");
  const fm = frontmatter(text, file);
  if (!fm) continue;

  for (const key of Object.keys(fm.keys)) {
    if (!ALLOWED_KEYS.has(key)) {
      errors.push(
        `${file}: frontmatter key "${key}" is not a real skill key. Allowed: ${[...ALLOWED_KEYS].join(", ")}`,
      );
    }
  }

  const name = fm.keys.name?.trim();
  if (!name) errors.push(`${file}: no name`);
  else {
    if (!/^[a-z0-9-]+$/.test(name))
      errors.push(`${file}: name "${name}" must be kebab-case`);
    if (name !== dir)
      errors.push(
        `${file}: name "${name}" does not match its directory "${dir}"`,
      );
    if (seenNames.has(name))
      errors.push(
        `${file}: name "${name}" is also used by ${seenNames.get(name)}`,
      );
    seenNames.set(name, file);
  }

  const description = fm.keys.description?.trim();
  if (!description)
    errors.push(
      `${file}: no description, so nothing decides when this skill fires`,
    );
  else if (description.length > DESCRIPTION_MAX) {
    errors.push(
      `${file}: description is ${description.length} chars, over ${DESCRIPTION_MAX}. It is paid every turn.`,
    );
  } else if (!/\buse (this|it|when)\b/i.test(description)) {
    warnings.push(
      `${file}: description says what the skill IS but never when to USE it, which is what triggers it`,
    );
  }

  const body = text.slice(fm.bodyFrom);
  const lines = body.split("\n").length;
  if (lines > BODY_MAX_LINES) {
    warnings.push(
      `${file}: body is ${lines} lines, over ${BODY_MAX_LINES}. Move the long half into reference/.`,
    );
  }

  if (body.includes("—")) errors.push(`${file}: contains an em dash`);

  // Every reference this skill names must exist. A confident pointer at nothing is the worst failure
  // mode here, because the session reports it followed advice it could not read.
  for (const m of body.matchAll(
    /`((?:[a-z0-9-]+\/)*reference\/[a-z0-9-]+\.md)`/g,
  )) {
    const target = m[1].startsWith("composer/")
      ? join(ROOT, "skills", m[1])
      : join(ROOT, "skills", dir, m[1]);
    if (!existsSync(target))
      errors.push(`${file}: points at ${m[1]}, which does not exist`);
  }

  // Every script it tells an operator to run must exist, at the path it names.
  for (const m of body.matchAll(
    /\$\{CLAUDE_PLUGIN_ROOT\}\/([A-Za-z0-9._/-]+)/g,
  )) {
    if (!existsSync(join(ROOT, m[1])))
      errors.push(`${file}: runs ${m[1]}, which does not exist`);
  }
}

// A script nothing invokes is either dead or a skill forgot to mention it. Either is worth knowing.
const skillText = skillNames
  .map((d) => join(ROOT, "skills", d, "SKILL.md"))
  .filter(existsSync)
  .map((f) => readFileSync(f, "utf8"))
  .join("\n");
const referenceText = skillNames
  .flatMap((d) => {
    const refDir = join(ROOT, "skills", d, "reference");
    return existsSync(refDir)
      ? readdirSync(refDir).map((f) => readFileSync(join(refDir, f), "utf8"))
      : [];
  })
  .join("\n");
const allProse = `${skillText}\n${referenceText}\n${existsSync(join(ROOT, "README.md")) ? readFileSync(join(ROOT, "README.md"), "utf8") : ""}`;

function scriptsUnder(dir, prefix = "") {
  const full = join(ROOT, dir);
  if (!existsSync(full)) return [];
  return readdirSync(full, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? scriptsUnder(join(dir, e.name), `${prefix}${e.name}/`)
      : /\.(mjs|js)$/.test(e.name) && !e.name.startsWith("t_")
        ? [`${prefix}${e.name}`]
        : [],
  );
}
for (const s of scriptsUnder("scripts")) {
  if (s === "validate.mjs") continue;
  if (!allProse.includes(s))
    warnings.push(
      `scripts/${s}: no skill or reference mentions it. Dead, or undocumented.`,
    );
}

for (const w of warnings) console.log(`warn  ${w}`);
for (const e of errors) console.log(`ERROR ${e}`);
console.log(
  `\n${skillNames.length} skills, ${errors.length} error(s), ${warnings.length} warning(s)`,
);
process.exit(errors.length > 0 ? 1 : 0);
