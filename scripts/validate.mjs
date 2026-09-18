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

/*
 * ── THE TWO MANIFESTS, WHICH ARE THE SHOP WINDOW ─────────────────────────────────────────────────────
 *
 * `plugin.json` and `marketplace.json` are what somebody reads BEFORE installing, and nothing checked
 * them. The marketplace entry described this as internal tooling long after it went public and became
 * the thing a student installs, which is both wrong and the kind of wrong nobody notices from inside.
 *
 * A MARKETPLACE MANIFEST HERE IS OPTIONAL, AND ITS ABSENCE IS THE INTENDED STATE. One Claude Code
 * marketplace per role was settled on 17 September, and a plugin repository declaring one of its own
 * is what broke the tower's installer: two repositories claimed the name `erudeon` and a machine holds
 * one marketplace per name. Composer is listed by `erudeon/marketplace-authors` and `erudeon/marketplace`
 * instead, so this file was deleted on purpose.
 *
 * Requiring it anyway made `validate.mjs` report an error on every run of a correct repository, which is
 * how a check stops being read. It is validated when present and not demanded.
 */
for (const file of [
  ".claude-plugin/plugin.json",
  ".claude-plugin/marketplace.json",
]) {
  const full = join(ROOT, file);
  const required = file.endsWith("plugin.json");
  if (!existsSync(full)) {
    if (required) errors.push(`${file}: missing`);
    continue;
  }
  let json;
  try {
    json = JSON.parse(readFileSync(full, "utf8"));
  } catch (err) {
    errors.push(`${file}: is not valid JSON (${err.message})`);
    continue;
  }
  const described = [json, ...(json.plugins ?? [])];
  for (const entry of described) {
    const text = entry.description;
    if (!text) continue;
    if (text.includes("—")) errors.push(`${file}: description contains an em dash`);
    /*
     * Words that mean nothing to somebody choosing whether to install this, or that say something about
     * us rather than about them.
     */
    for (const word of ["MCP", "internal", "manifest", "pipeline"])
      if (new RegExp(`\\b${word}\\b`, "i").test(text))
        errors.push(
          `${file}: description says "${word}", which is our word and not theirs`,
        );
  }
}

/*
 * ── A COUNT WRITTEN IN PROSE, AGAINST THE LIST IT COUNTS ─────────────────────────────────────────────
 *
 * "the six structure questions", "the seven families". These drift the moment one is added, and they
 * drift SILENTLY: the list is right and the sentence above it is wrong, so a session following the
 * sentence stops early. It happened tonight when four structure questions became six and the state
 * script went on saying four.
 */
const WORDS = {
  two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10,
};
for (const [file, heading, noun, item] of [
  // Each file numbers its own list its own way, so the pattern comes with the file.
  ["skills/intake/SKILL.md", "structure questions", "numbered question", /^\d+\. \*\*/gm],
  ["skills/audit/SKILL.md", "families", "numbered family", /^\*\*\d+\./gm],
]) {
  const full = join(ROOT, file);
  if (!existsSync(full)) continue;
  const text = readFileSync(full, "utf8");
  const said = new RegExp(`(${Object.keys(WORDS).join("|")}) ${heading}`).exec(text);
  if (!said) continue;
  /*
   * COUNT THE LIST THE SENTENCE IS ABOUT, not every numbered line in the file. Intake carries a
   * checklist and a set of questions, and counting both together says eleven where the sentence, quite
   * correctly, says six.
   */
  const from = text.lastIndexOf("\n## ", said.index);
  const rest = text.slice(from === -1 ? 0 : from + 1);
  const nextHeading = rest.indexOf("\n## ", 1);
  const section = nextHeading === -1 ? rest : rest.slice(0, nextHeading);
  const actual = (section.match(item) ?? []).length;
  if (WORDS[said[1]] !== actual)
    errors.push(
      `${file}: says "${said[0]}" and carries ${actual} ${noun}(s). ` +
        `A session following the sentence stops at the wrong one.`,
    );
}

/*
 * ── A TABLE OF CONTENTS THAT HAS STOPPED MATCHING ITS FILE ───────────────────────────────────────────
 *
 * A long reference gets one so somebody can find the one answer they came for. It then drifts the first
 * time a section is added, which happened here within the hour: a contents list missing the section you
 * need is worse than none, because it reads as proof the section does not exist.
 *
 * Checked rather than maintained. Any reference carrying a "What is in here" list must name every
 * heading below it.
 */
for (const dir of skillNames) {
  const refDir = join(ROOT, "skills", dir, "reference");
  if (!existsSync(refDir)) continue;
  for (const file of readdirSync(refDir).filter((f) => f.endsWith(".md"))) {
    const text = readFileSync(join(refDir, file), "utf8");
    const where = `skills/${dir}/reference/${file}`;
    /*
     * A REFERENCE IS READ BY THE SAME SESSION THAT WRITES TO THE AUTHOR, so an em dash in one is an em
     * dash one sentence away from a message. This checked SKILL.md bodies and never the files beside
     * them, and three were sitting in `behaviours.md` the whole time.
     */
    if (text.includes("—")) errors.push(`${where}: contains an em dash`);
    if (!text.includes("## What is in here")) continue;
    for (const m of text.matchAll(/^#{2,3} (.+)$/gm)) {
      const title = m[1].trim();
      if (title === "What is in here") continue;
      if (!text.includes(`[${title}](#`))
        errors.push(`${where}: "${title}" is not in its own table of contents`);
    }
  }
}

/*
 * ── COMMANDS ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * A command is what somebody TYPES, so it is the first thing that runs and the last thing anybody
 * checks. It names a skill and may point at a reference, and neither was verified: a command naming a
 * skill that does not exist fails at the moment a person is trying to start.
 */
const commandsDir = join(ROOT, "commands");
if (existsSync(commandsDir)) {
  for (const file of readdirSync(commandsDir).filter((f) => f.endsWith(".md"))) {
    const text = readFileSync(join(commandsDir, file), "utf8");
    const where = `commands/${file}`;
    const fm = frontmatter(text, where);
    if (fm) {
      for (const key of Object.keys(fm.keys))
        if (!ALLOWED_KEYS.has(key))
          errors.push(`${where}: frontmatter key "${key}" is not a real key`);
      if (!fm.keys.description)
        errors.push(`${where}: no description, so nothing says what it is for`);
    }
    if (text.includes("—")) errors.push(`${where}: contains an em dash`);
    // Every skill it names must exist, and so must every reference it points at.
    for (const m of text.matchAll(/`([a-z0-9-]+)` skill/g))
      if (!skillNames.includes(m[1]))
        errors.push(`${where}: names the "${m[1]}" skill, which does not exist`);
    for (const m of text.matchAll(/`((?:[a-z0-9-]+\/)*reference\/[a-z0-9-]+\.md)`/g))
      if (!existsSync(join(ROOT, "skills", m[1])))
        errors.push(`${where}: points at ${m[1]}, which does not exist`);
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
/*
 * Every page that can tell somebody to run something. CLAUDE.md belongs here: a maintainer's tool is
 * documented for a maintainer, and leaving it out reported the corpus harness as unreachable while its
 * instructions sat one file away.
 */
const allProse = [skillText, referenceText, "README.md", "CLAUDE.md"]
  .map((p) =>
    p.endsWith(".md") && existsSync(join(ROOT, p))
      ? readFileSync(join(ROOT, p), "utf8")
      : p,
  )
  .join("\n");

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
/*
 * A LIBRARY IS USED BY BEING REQUIRED, not by being named in prose. `omml.js` is the reason a maths
 * course converts at all and no operator will ever run it directly, so "no skill mentions it" is the
 * wrong question to ask of it. The question worth asking is about a script an operator is meant to RUN
 * that nothing tells them to run: this plugin shipped its two most important commands unnamed.
 */
const scriptSources = scriptsUnder("scripts")
  .map((s) => readFileSync(join(ROOT, "scripts", s), "utf8"))
  .join("\n");

for (const s of scriptsUnder("scripts")) {
  if (s === "validate.mjs") continue;
  const base = s.split("/").pop();
  const importedByAnother =
    scriptSources.includes(`./${base}`) || scriptSources.includes(`/${base}"`);
  if (importedByAnother) continue;
  if (!allProse.includes(s) && !allProse.includes(base)) {
    warnings.push(
      `scripts/${s}: nothing tells an operator to run it, and no other script imports it.`,
    );
  }
}

/*
 * ── NO SOURCE FILE IS BINARY ─────────────────────────────────────────────────────────────────────────
 *
 * `normalise.js` needs a placeholder character no document contains, and U+0000 is the honest choice.
 * Typed as a literal byte it makes the SOURCE binary: grep skips the file, git diffs it as binary, and
 * a formatter may eat it. It was written that way, fixed, and written that way again, because a `\u0000`
 * escape in the content was turned back into the byte on the way to disk both times.
 *
 * Checked rather than remembered, since remembering it failed twice.
 */
for (const rel of scriptsUnder("scripts")) {
  const bytes = readFileSync(join(ROOT, "scripts", rel));
  const nuls = bytes.filter((b) => b === 0).length;
  if (nuls > 0)
    errors.push(
      `scripts/${rel}: ${nuls} NUL byte(s) in the source, which makes the file binary. ` +
        `Build the character with String.fromCharCode(0) instead of typing or escaping it.`,
    );
}

/*
 * ── THE FIELD GUIDE ──────────────────────────────────────────────────────────────────────────────────
 *
 * `formats/registry.json` is knowledge as DATA, which only works while it stays machine-readable: an
 * entry keyed on a fact nothing measures matches nothing and says so to nobody, and a `when` clause
 * with a typo in its comparison silently never fires. Both are invisible at a glance.
 *
 * `docs/FIELD-GUIDE.md` is generated from it. Checked here rather than trusted, because a generated
 * file somebody edited by hand is a second source of truth wearing the face of the first.
 */
const registryPath = join(ROOT, "formats", "registry.json");
if (!existsSync(registryPath)) {
  errors.push("formats/registry.json is missing: the field guide has no data.");
} else {
  const registry = JSON.parse(readFileSync(registryPath, "utf8"));
  const knownFacts = new Set(
    Object.keys(registry.facts ?? {}).filter((k) => !k.startsWith("$")),
  );
  const STATUSES = new Set(["caught", "partial", "not caught"]);
  const ids = new Set();
  for (const e of registry.entries ?? []) {
    const where = `formats/registry.json (${e.id ?? "an entry with no id"})`;
    if (!e.id || ids.has(e.id))
      errors.push(`${where}: missing or duplicate id.`);
    ids.add(e.id);
    for (const field of [
      "name",
      "status",
      "when",
      "purpose",
      "handling",
      "seen",
    ])
      if (!e[field]) errors.push(`${where}: no ${field}.`);
    if (e.status && !STATUSES.has(e.status))
      errors.push(
        `${where}: status "${e.status}" is not one of ${[...STATUSES].join(", ")}.`,
      );
    for (const [key, cond] of Object.entries(e.when ?? {})) {
      if (!knownFacts.has(key))
        errors.push(
          `${where}: keyed on "${key}", which identify.mjs does not measure.`,
        );
      if (
        typeof cond === "string" &&
        /^[<>~=]/.test(cond) &&
        !/^(>=|<=|>|<)\s*-?\d+(\.\d+)?$|^~./.test(cond)
      )
        errors.push(
          `${where}: "${key}: ${cond}" is not a comparison identify.mjs can evaluate.`,
        );
    }
  }

  const guidePath = join(ROOT, "docs", "FIELD-GUIDE.md");
  const { guide } = await import(
    `file://${join(ROOT, "scripts", "identify.mjs")}`
  );
  if (!existsSync(guidePath)) {
    errors.push(
      "docs/FIELD-GUIDE.md is missing. Run: node scripts/identify.mjs --write-guide",
    );
  } else if (readFileSync(guidePath, "utf8") !== guide()) {
    errors.push(
      "docs/FIELD-GUIDE.md does not match formats/registry.json. It is GENERATED: edit the registry, " +
        "then run `node scripts/identify.mjs --write-guide`.",
    );
  }
}

for (const w of warnings) console.log(`warn  ${w}`);
for (const e of errors) console.log(`ERROR ${e}`);
console.log(
  `\n${skillNames.length} skills, ${errors.length} error(s), ${warnings.length} warning(s)`,
);
process.exit(errors.length > 0 ? 1 : 0);
