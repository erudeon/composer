#!/usr/bin/env node
/**
 * `identify.mjs` — WHAT IS THIS FILE, REALLY, AND WHAT DO WE KNOW ABOUT ITS KIND?
 *
 *   node identify.mjs <file-or-folder> [...]  [--all] [--json]
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────────────────────────────
 *
 * Everything this pipeline has learned about file formats was learned the hard way, one document at a
 * time, and it lived in commit messages. A `.docx` that was a JPEG. A `.pdf` that was a Word file, sitting
 * in a live course folder as a past exam and discarded because of its name. A Hungarian Word whose
 * heading styles are called `Cmsor1`. A summary carrying KaTeX's own CSS classes because somebody
 * pasted a rendered web page into it. None of that is guessable and all of it is expensive to rediscover.
 *
 * `formats/registry.json` is that knowledge as data: what each kind of file IS, what it is FOR in a
 * university, how to handle it, and what has already gone wrong with it. This reads the bytes, measures
 * the facts the registry keys on, and prints every entry that matches.
 *
 * A file matches MORE THAN ONE ENTRY, on purpose. A real document is a Word file AND a document with
 * equations AND a document about money, and each of those carries its own warning.
 *
 * ── IT NEVER GUESSES ─────────────────────────────────────────────────────────────────────────────────
 *
 * A file that matches nothing is reported as unrecognised, by name, and that is a request to add an
 * entry rather than an answer. Exits non-zero when anything is unrecognised or matches an entry we
 * cannot handle, so it can gate an intake.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { join, extname, resolve, basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
const { sniff, entry, names } = require("./intake/docx-zip.js");
const { headingLevels, authoredStyles } = require("./intake/docx-core.js");
const REGISTRY = JSON.parse(
  readFileSync(join(HERE, "..", "formats", "registry.json"), "utf8"),
);

/** Style ids that only exist because something was pasted in from a web page. */
const PASTE_STYLES = /^(msonormal|katex|strut|vlist|msupsub|mspace|mtight)/i;

const count = (s, re) => (s.match(re) ?? []).length;

/*
 * A TEXT LAYER IS DRAWN TEXT, AND THE DRAWING IS COMPRESSED. `BT` and `Tj` live in the page content
 * stream, which every modern writer Flate-compresses, so looking for them in the raw bytes finds
 * nothing and calls a readable exam paper a scan. It did: 14 past papers with real text layers, one of
 * them 54 KB, were reported as scans needing OCR we do not have.
 *
 * So inflate what inflates and look in there. Bounded: it stops at the first evidence and reads at most
 * a few MB, because this runs over a whole folder and the answer is usually in the first stream.
 */
function hasTextLayer(buf, latin1) {
  if (/\bBT\b/.test(latin1) && /\/Type\s*\/Font/.test(latin1)) return true;
  let budget = 8 * 1024 * 1024;
  const re = /stream\r?\n/g;
  for (let m; (m = re.exec(latin1)) && budget > 0; ) {
    const end = latin1.indexOf("endstream", m.index);
    if (end < 0) break;
    const chunk = buf.subarray(m.index + m[0].length, end);
    budget -= chunk.length;
    let out;
    try {
      out = inflateSync(chunk).toString("latin1");
    } catch {
      continue; // not Flate, or not a stream we can read: no evidence either way
    }
    // Text BEGUN and text SHOWN. A form XObject can open BT and draw nothing.
    if (/\bBT\b/.test(out) && /\b(?:Tj|TJ|'|")\s/.test(out)) return true;
  }
  return false;
}


/** Everything the registry is allowed to key on, measured from the bytes. */
function factsOf(file) {
  const buf = readFileSync(file);
  const ext = extname(file).toLowerCase();
  const kind = sniff(buf);
  const expected = {
    ".docx": "zip",
    ".dotx": "zip",
    ".xlsx": "zip",
    ".pptx": "zip",
    ".pdf": "pdf",
    ".doc": "ole",
    ".xls": "ole",
    ".ppt": "ole",
    ".png": "png",
    ".jpg": "jpeg",
    ".jpeg": "jpeg",
    ".gif": "gif",
    ".rtf": "rtf",
  }[ext];

  const f = {
    ext,
    kind,
    kb: Math.round(buf.length / 1024),
    extMatchesBytes: expected === undefined ? true : kind === expected,
  };

  /*
   * A file whose bytes say nothing is either text or something we have no magic for. Deciding by
   * DECODING is the honest test: valid UTF-8 that is mostly printable is text, and anything else is not.
   */
  if (kind === "unknown") {
    try {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(
        buf.subarray(0, 4096),
      );
      const printable = count(text, /[\p{L}\p{N}\p{P}\p{Zs}\n\r\t]/gu);
      if (text.length > 0 && printable / text.length > 0.95) f.kind = "text";
    } catch {
      /* not UTF-8, so not text we can read */
    }
  }

  if (kind === "pdf") {
    const s = buf.toString("latin1");
    f.pdfProducer = /\/Producer\s*\(([^)]{0,60})\)/.exec(s)?.[1] ?? "";
    f.textLayer = hasTextLayer(buf, s);
    f.pdfPages = count(s, /\/Type\s*\/Page[^s]/g);
  }

  if (kind !== "zip") return f;

  const all = names(buf);
  f.ooxml = all.includes("word/document.xml")
    ? "word"
    : all.includes("xl/workbook.xml")
      ? "excel"
      : all.includes("ppt/presentation.xml")
        ? "powerpoint"
        : "other-zip";
  f.wdp = all.filter((n) => n.endsWith(".wdp")).length;
  if (f.ooxml !== "word") return f;

  const doc = entry(buf, "word/document.xml") ?? "";
  const styles = entry(buf, "word/styles.xml") ?? "";
  f.generator =
    /<Application>([^<]*)</.exec(entry(buf, "docProps/app.xml") ?? "")?.[1] ??
    "";
  f.paragraphs = count(doc, /<w:p[\s>]/g);
  f.pStyle = count(doc, /<w:pStyle\b/g);
  f.oMath = count(doc, /<m:oMath[\s>]/g);
  f.tables = count(doc, /<w:tbl>/g);
  f.numbering = count(doc, /<w:numPr>/g);
  f.pictures = count(doc, /<a:blip\b/g);
  f.textboxes = count(doc, /<w:txbxContent\b/g);
  f.shapes = count(doc, /<v:shape\b/g);
  f.comments = entry(buf, "word/comments.xml") ? 1 : 0;
  f.tracked = count(doc, /<w:(ins|del)\b/g);

  const text = doc.replace(/<[^>]+>/g, "");
  f.words = text.split(/\s+/).filter(Boolean).length;
  f.currency = count(text, /[$€£]/g);
  f.excelFormulas = count(
    text,
    /=(SUM|SUMIF|IF|ROUND|AVERAGE|COUNT|VLOOKUP|INDEX|MATCH)\b/gi,
  );
  f.literalBullets = count(text, /[•▪◦]/g);
  f.wordsPerEquation = f.oMath > 0 ? Math.round(f.words / f.oMath) : null;

  // Heading styles come from the same resolution the extractor uses, so this cannot disagree with it.
  f.headingStyles = [...headingLevels(styles).values()].filter(
    (v) => v !== null,
  ).length;

  let paste = 0;
  let localised = 0;
  for (const m of styles.matchAll(/<w:style\b[\s\S]*?<\/w:style>/g)) {
    const id = /w:styleId="([^"]+)"/.exec(m[0])?.[1] ?? "";
    const name = /<w:name\b[^>]*w:val="([^"]*)"/.exec(m[0])?.[1] ?? "";
    if (PASTE_STYLES.test(id)) paste += 1;
    // Word strips the accents out of a style ID and keeps them in the NAME, so the name is where a
    // localised Word shows itself: `Cmsor1` is called `Címsor 1`.
    if (/[^\x20-\x7e]/.test(name)) localised += 1;
  }
  f.htmlPasteStyles = paste;
  /*
   * Styles the AUTHOR created, by Word's own `w:customStyle`. Counted and never interpreted: what
   * `In Short` may become on the page is the platform's vocabulary, served by `content_guide`, and a
   * list of variant names here would be a second copy of a generated thing going stale on its own.
   */
  f.semanticStyles = authoredStyles(styles).size;
  f.accentStrippedStyles = localised;
  return f;
}

/**
 * Does one measured fact meet one registry condition?
 *
 * A condition is a comparison string (`">0"`, `"<10"`, `">=40"`), a `~` prefix for "contains", or a
 * literal to equal. Anything else is a typo in the registry, and `validate.mjs` refuses those.
 */
function meets(value, cond) {
  if (typeof cond === "string") {
    const cmp = /^(>=|<=|>|<)\s*(-?\d+(?:\.\d+)?)$/.exec(cond);
    if (cmp) {
      const n = Number(value);
      if (!Number.isFinite(n)) return false;
      const to = Number(cmp[2]);
      return cmp[1] === ">"
        ? n > to
        : cmp[1] === "<"
          ? n < to
          : cmp[1] === ">="
            ? n >= to
            : n <= to;
    }
    if (cond.startsWith("~"))
      return String(value ?? "")
        .toLowerCase()
        .includes(cond.slice(1).toLowerCase());
    if (/^-?\d+$/.test(cond)) return Number(value) === Number(cond);
  }
  return value === cond;
}

function match(facts) {
  return REGISTRY.entries.filter((e) =>
    Object.entries(e.when).every(([key, cond]) => meets(facts[key], cond)),
  );
}

/**
 * The registry as a page somebody can read.
 *
 * GENERATED, always, and never edited: a catalogue maintained in two places is a catalogue that
 * disagrees with itself within a month. `validate.mjs` fails when `docs/FIELD-GUIDE.md` is not exactly
 * what this returns.
 */
export function guide() {
  const { census, entries } = REGISTRY;
  const MARKS = {
    caught: "handled",
    partial: "partly handled",
    "not caught": "NOT HANDLED",
  };
  const order = ["caught", "partial", "not caught"];
  const lines = [
    "# The field guide",
    "",
    "Every kind of file this pipeline has met, what it is for in a university, and how to handle it.",
    "",
    "**Generated from `formats/registry.json`. Do not edit this file.** Add an entry there, with the",
    "document that showed it, and regenerate with:",
    "",
    "```bash",
    "node scripts/identify.mjs --write-guide",
    "```",
    "",
    `Drawn from a census of ${census.files.toLocaleString()} files on ${census.when}: ` +
      `${census.wordDocuments} Word documents, ${census.summaries} course summaries, ` +
      `${census.equations.toLocaleString()} equations.`,
    "",
    "To ask what a file in front of you is:",
    "",
    "```bash",
    "node scripts/identify.mjs <file-or-folder> --all",
    "```",
    "",
    "| Kind | Status |",
    "| --- | --- |",
  ];
  for (const e of [...entries].sort(
    (a, b) => order.indexOf(a.status) - order.indexOf(b.status),
  ))
    lines.push(`| [${e.name}](#${e.id}) | ${MARKS[e.status]} |`);

  for (const status of order) {
    const group = entries.filter((e) => e.status === status);
    if (group.length === 0) continue;
    lines.push(
      "",
      `## ${status === "caught" ? "Handled" : status === "partial" ? "Partly handled" : "Not handled"}`,
    );
    for (const e of group) {
      lines.push(
        "",
        `### ${e.name}`,
        "",
        `<a id="${e.id}"></a>`,
        "",
        `**What it is for.** ${e.purpose}`,
        "",
        `**How to handle it.** ${e.handling}`,
        "",
        ...(e.gotcha ? [`**What goes wrong.** ${e.gotcha}`, ""] : []),
        `**Seen.** ${e.seen}`,
        "",
        "**Recognised by.** " +
          Object.entries(e.when)
            .map(
              ([k, v]) =>
                `\`${k} ${typeof v === "string" && /^[<>~]/.test(v) ? v : "= " + v}\``,
            )
            .join(", "),
      );
    }
  }
  return lines.join("\n") + "\n";
}

/*
 * Running it is the CLI; importing it is `guide()`. Without this guard, `validate.mjs` asking for the
 * generated page instead ran the whole command line, printed a usage message and exited the validator.
 */
const isMain =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (!isMain) {
  /* imported for `guide()`; nothing below is the caller's business */
} else {
  const args = process.argv.slice(2);
  const showAll = args.includes("--all");
  const asJson = args.includes("--json");
  if (args.includes("--write-guide")) {
    const { writeFileSync } = await import("node:fs");
    const out = join(HERE, "..", "docs", "FIELD-GUIDE.md");
    writeFileSync(out, guide());
    console.log(
      `${REGISTRY.entries.length} kinds written to docs/FIELD-GUIDE.md`,
    );
    process.exit(0);
  }
  const targets = args.filter((a) => !a.startsWith("--"));
  if (targets.length === 0) {
    console.error(
      "usage: node identify.mjs <file-or-folder> [...] [--all] [--json]\n\n" +
        `${REGISTRY.entries.length} kinds of file are catalogued in formats/registry.json.`,
    );
    process.exit(2);
  }

  function walk(p, depth = 0) {
    if (depth > 5) return [];
    let s;
    try {
      s = statSync(p);
    } catch {
      return [];
    }
    if (!s.isDirectory()) return [p];
    return readdirSync(p, { withFileTypes: true }).flatMap((e) =>
      e.name.startsWith(".") || e.name.startsWith("~$")
        ? []
        : walk(join(p, e.name), depth + 1),
    );
  }

  const files = targets.flatMap((t) => walk(resolve(t))).sort();
  const report = [];
  let blocked = 0;

  for (const file of files) {
    let facts;
    try {
      facts = factsOf(file);
    } catch (err) {
      report.push({ file, error: err.message, entries: [] });
      blocked += 1;
      continue;
    }
    const hits = match(facts);
    if (hits.length === 0) blocked += 1;
    if (hits.some((e) => e.status === "not caught")) blocked += 1;
    report.push({ file, facts, entries: hits.map((e) => e.id) });

    if (asJson) continue;
    console.log(`\n${basename(file)}  (${facts.kb} KB, bytes say ${facts.kind})`);
    if (!facts.extMatchesBytes)
      console.log(
        `  ! THE NAME IS WRONG: named ${facts.ext} and the bytes say ${facts.kind}.`,
      );
    if (hits.length === 0) {
      console.log(
        `  ! UNRECOGNISED. Nothing in the field guide describes this.\n` +
          `    Add an entry to formats/registry.json rather than guessing at it.`,
      );
      continue;
    }
    for (const e of hits) {
      const mark =
        e.status === "caught" ? " " : e.status === "partial" ? "~" : "!";
      console.log(`  ${mark} ${e.name}  [${e.status}]`);
      if (showAll || e.status !== "caught") {
        console.log(`      what it is for: ${e.purpose}`);
        console.log(`      how to handle:  ${e.handling}`);
        if (e.gotcha) console.log(`      gotcha:         ${e.gotcha}`);
      }
    }
  }

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(
      `\n${files.length} file(s), ${REGISTRY.entries.length} kinds catalogued.` +
        `  A line beginning ! needs a person; ~ means we handle it only partly.` +
        `\nRun with --all to print what every match means.\n`,
    );
  }
  process.exit(blocked > 0 ? 1 : 0);
}
