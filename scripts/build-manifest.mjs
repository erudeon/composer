#!/usr/bin/env node
/**
 * BUILD A COURSE FILE FROM A SOURCE OF RECORD. One script, every course.
 *
 *   node build-manifest.mjs <course folder> [--unit 1] [--unit 2] ...
 *
 * ── WHY THIS IS NOT PER-COURSE ───────────────────────────────────────────────────────────────────────
 *
 * The rules for turning a document into blocks are the same for every summary ever written: an example
 * is an example, a table is a table, a heading folded out of the outline leads the paragraph under it.
 * Written once per course they drift, and the second course silently loses whatever the first learned.
 * So the RULES AND THE METHODS live here, and what cannot be derived from the document lives beside the
 * document in `course-data.mjs`.
 *
 * ── WHAT IS DERIVED, AND WHAT HAS TO BE SUPPLIED ─────────────────────────────────────────────────────
 *
 * DERIVED, from the text itself, for any course:
 *   the unit boundaries, the section tree, prose blocks and where they split, examples and whether one
 *   is stepped, worked-example steps and their labels, tables and their kind, lists of named rules,
 *   folded headings and what they lead, the author's emoji flags and which callout each becomes, where
 *   a defining equation wants a formula block.
 *
 * SUPPLIED in `course-data.mjs`, because no amount of reading the text can produce it:
 *   which chart a DRAWING becomes (somebody has to look at the picture), the practice questions, the
 *   glossary, the terms under a formula, and any repair for a passage whose layout did not survive Word.
 *
 * Everything supplied is keyed by unit number, and a unit with nothing supplied still builds.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

/* ── the course folder ───────────────────────────────────────────────────────────────────────────── */

const args = process.argv.slice(2);
const folder = resolve(args.find((a) => !a.startsWith("--")) ?? ".");
const wanted = args.flatMap((a, i) =>
  a === "--unit" ? [Number(args[i + 1])] : [],
);

const fail = (message) => {
  console.error(message);
  process.exit(1);
};

const state = join(folder, "composer.json");
if (!existsSync(state))
  fail(`No composer.json in ${folder}. Is that the course folder?`);
const course = JSON.parse(readFileSync(state, "utf8"));

const sourcePath = join(folder, "02-source", "source-of-record.md");
if (!existsSync(sourcePath))
  fail("No 02-source/source-of-record.md yet. Convert the summary first.");
const raw = readFileSync(sourcePath, "utf8");

const dataPath = join(folder, "course-data.mjs");
const DATA = existsSync(dataPath)
  ? await import(pathToFileURL(dataPath).href)
  : {};
/** What a unit supplies under `name`, or the empty shape the caller expects when it supplies nothing. */
const forUnit = (name, n, fallback = {}) => DATA[name]?.[n] ?? fallback;

/* ── the transformations, over a whole unit, before anything is sliced ───────────────────────────── */

/*
 * A HEADING WHOSE TEXT IS A DISPLAY EQUATION. A formula standing where a title should be.
 *
 * Deep in the outline it is dropped and the equation kept as the line it is. At `##` it carries a
 * whole section, so dropping it would take the section with it: there the course supplies a title its
 * own text supports, under HEADINGS in `course-data.mjs`. Nothing is invented here either way, and a
 * `##` with no supplied title is left alone and reported, because a section titled with an equation is
 * a question for the author rather than something to guess at.
 */
const HEADING_IS_AN_EQUATION = /^(#{2,6})\s+(\$\$.*\$\$)\s*$/;

/* The author's emoji flags become a callout's variant, and the emoji never survives. */
const FLAG = /^\s*(?:\*\*)?\s*(🎯|💡|📌|⚠️)\s*(?:\*\*)?\s*/u;
const POINTER = /(?:👉|➡️)\s*/gu;
const VARIANT = {
  "🎯": "exam-tip",
  "💡": "intuition",
  "📌": "key-concept",
  "⚠️": "note",
};

const DEFAULT_TITLE = {
  "exam-tip": "In the exam",
  intuition: "The idea behind it",
  "key-concept": "The idea this rests on",
  note: "Worth knowing",
};

/**
 * ONE PASS OVER A UNIT. Normalises the headings, strips the emoji, and joins every folded heading to
 * the paragraph it introduces, which is the only place that merge can happen: done later, when the
 * blocks are cut, it produces prose that is a perfect copy of text the source does not contain and the
 * verbatim check refuses it, correctly.
 *
 * Returns the lines, the flagged sentences with the section each belongs to, and the set of lines that
 * WERE headings, so the block walker can tell a new subject from a bold sentence.
 */
function walk(unitLines, HEADINGS, equationHeadings) {
  const kept = [];
  const flags = [];
  const folded = new Set();
  let section = null;
  let promoting = false;
  let lead = null;
  let leadWasAHeading = false;
  let headingForNextFlag = null;

  /*
   * A `###` whose children carry all its prose is a LABEL, not a section: the outline is a section and
   * a subsection and nothing else, so the children take its place. Decided by looking, not by a list:
   * a heading with no prose of its own before its first child is a label wherever it appears.
   */
  const isALabel = (at) => {
    for (let i = at + 1; i < unitLines.length; i += 1) {
      const line = unitLines[i];
      if (/^#{4,}\s/.test(line)) return true;
      if (/^#{1,3}\s/.test(line)) return false;
      if (line.trim()) return false;
    }
    return false;
  };

  for (let i = 0; i < unitLines.length; i += 1) {
    let line = unitLines[i];
    const asEquation = HEADING_IS_AN_EQUATION.exec(line);
    if (asEquation) {
      const supplied = HEADINGS[asEquation[2]];
      if (supplied) line = `${asEquation[1]} ${supplied}`;
      else if (asEquation[1].length > 2) continue;
      else equationHeadings.push(asEquation[2]);
    }

    const h2 = /^## (.+)$/.exec(line);
    if (h2) {
      section = h2[1].trim();
      promoting = false;
      kept.push(line);
      continue;
    }

    const h3 = /^### (.+)$/.exec(line);
    if (h3) {
      promoting = isALabel(i);
      if (promoting) continue;
      section = h3[1].trim();
      kept.push(line);
      continue;
    }

    const h4 = /^#{4,}\s+(.+)$/.exec(line);
    if (h4) {
      if (promoting) {
        section = h4[1].trim();
        kept.push(`### ${h4[1].trim()}`);
      } else {
        lead = `**${h4[1].trim()}**`;
        leadWasAHeading = true;
      }
      continue;
    }

    /* A numbered item that is ONLY a bold lead-in is not a sequence; the words stay, the number goes. */
    /*
     * A NUMBERED ITEM THAT IS ONLY A BOLD LEAD-IN IS NOT A SEQUENCE. Authors number a set of steps and
     * then bullet the working under each, which breaks the list in Markdown and leaves an ordered list
     * of one item apiece. The words and the emphasis stay; only the number goes. The same applies where
     * the number is followed by a bold lead-in and then more text on the line.
     */
    let clean = line
      .replace(/^\d+\.\s+(\*\*[^*]+\*\*:?)\s*$/, "$1")
      .replace(FLAG, "")
      .replace(POINTER, "");

    /*
     * AN ORDERED ITEM WITH NO SIBLINGS IS A SENTENCE. Stripping the number off the bold-only steps of a
     * procedure can leave the one step that carried trailing text standing alone, and a list of one
     * item is not a sequence: the reader's own lint says to write it as a sentence.
     */
    if (/^\d+\.\s/.test(clean)) {
      const near = (from, step) => {
        for (let k = from; k >= 0 && k < unitLines.length; k += step) {
          const other = unitLines[k];
          if (!other.trim()) continue;
          if (/^#{1,6}\s/.test(other)) return false;
          return /^\d+\.\s/.test(other) && !/^\d+\.\s+\*\*[^*]+\*\*:?\s*$/.test(other);
        }
        return false;
      };
      if (!near(i - 1, -1) && !near(i + 1, 1)) clean = clean.replace(/^\d+\.\s+/, "");
    }

    /* The author's own bold-only line leads its paragraph for the same reason a folded heading does. */
    if (!lead && /^\*\*[^*]+\*\*:?\s*$/.test(clean.trim())) {
      lead = clean.trim();
      leadWasAHeading = false;
      continue;
    }

    /*
     * A FLAGGED LINE UNDER A FOLDED HEADING KEEPS ITS FLAG, and the heading becomes the callout's
     * title. Merging first swallows the flag, and a tip the author marked as examined goes in as an
     * ordinary sentence, taking whatever it introduced with it.
     */
    if (lead && FLAG.test(line)) {
      headingForNextFlag = lead.replace(/^\*\*|\*\*:?$/g, "").trim();
      lead = null;
      leadWasAHeading = false;
    }

    if (lead) {
      if (!clean.trim()) continue; // hold it across the blank line
      /*
       * ONLY AN ORDINARY PARAGRAPH TAKES A LEAD-IN. A list, a table row and a display line cannot, and
       * neither can a line that is itself emphasised: joining a bold aside to the `**Step 2:**` under
       * it swallowed three steps of a worked example into the note of the step before.
       */
      const joinable = !/^\s*(?:[-*]\s|\d+\.\s|\||\$\$|\*\*)/.test(clean);
      const merged = `${lead} ${clean.trim()}`;
      if (joinable) kept.push(merged);
      else kept.push(lead, "", clean); // the blank keeps them two paragraphs, not one
      if (leadWasAHeading) folded.add((joinable ? merged : lead).trim());
      lead = null;
      leadWasAHeading = false;
      continue;
    }

    const m = FLAG.exec(line);
    if (m && clean.trim()) {
      /*
       * A FLAG ENDING IN A COLON INTRODUCES THE LINE UNDER IT, so the callout takes that line too.
       * Lifting the sentence alone leaves the formula it announces standing with nothing above it.
       */
      const follows = clean.trim().endsWith(":")
        ? unitLines.slice(i + 1).find((l) => l.trim())
        : null;
      flags.push({
        title: headingForNextFlag,
        section,
        variant: VARIANT[m[1]],
        lead: clean.trim(),
        body: follows ? `${clean.trim()}\n\n${follows.trim()}` : clean.trim(),
        alsoDrop: follows ? follows.trim() : null,
      });
      headingForNextFlag = null;
    }
    kept.push(clean);
  }
  if (lead) kept.push(lead);
  return { kept, flags, folded };
}

/* ── what shape is this paragraph ────────────────────────────────────────────────────────────────── */

const isTable = (p) => /^\|/.test(p.trim());
const isBoldOnly = (p) => /^\*\*[^*]+\*\*:?\s*$/.test(p.trim());
const EXAMPLE = /^\s*(?:[-*]\s+)?\*\*(Examples?[^*]*)\*\*\s*:?\s*/;
const STEP = /^\*\*Step\s*\d+[^*]*?\*\*\s*/;
const FINAL = /^\*\*Final Answer[^*]*\*\*\s*$/i;
const DISPLAY = /^\$\$([\s\S]+)\$\$$/;
const WHERE = /^\s*where\b/i;
/** A bullet naming a rule, with the rule either beside it or on the display line under it. */
const NAMED_RULE = /^\s*[-*]\s+\*\*([^*]+?)\*\*\s*:?\s*(.*)$/;

/** A cell takes INLINE maths. A display span in one draws a boxed equation per cell. */
const cellMaths = (s) => s.replace(/\$\$(.+?)\$\$/g, "$$$1$$").trim();

const slug = (s) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 44);

const words = (s) => s.split(/\s+/).filter(Boolean).length;
const tidy = (lines) =>
  (Array.isArray(lines) ? lines.join("\n") : lines)
    .replace(/\n{3,}/g, "\n\n")
    .trim();

/** The author's markdown table, as the block the reader draws tables with. */
function tableBlock(para, caption) {
  const rows = para
    .trim()
    .split("\n")
    .map((l) =>
      l
        .replace(/^\||\|$/g, "")
        .split("|")
        .map(cellMaths),
    )
    .filter((r) => !r.every((c) => /^:?-+:?$/.test(c)));
  const [head, ...body] = rows;
  /* The variant decides how a table behaves on a phone, which is where the wrong one is unreadable. */
  const definitions =
    head.length <= 3 && /notation|term|symbol|rule|name|word/i.test(head[0]);
  return {
    type: "table",
    variant: definitions ? "definitions" : "data",
    caption,
    head,
    rows: body,
  };
}

/**
 * AN EXAMPLE THAT COMPUTES THROUGH STEPS IS A WORKED EXAMPLE. Summaries write those as "**Step 1:**
 * <the move>" followed by the display line that move produces, which is the shape the block wants: a
 * step's label NAMES the move and never says "Step 2", and the author already wrote the move after the
 * number. So the number goes and their sentence becomes the label.
 */
function workedBlock(paras, title) {
  const steps = [];
  const problem = [];
  let answer = null;
  let seenFinal = false;

  for (const para of paras) {
    if (FINAL.test(para.trim())) {
      seenFinal = true;
      continue;
    }
    if (STEP.test(para.trim())) {
      /*
       * A LABEL NAMES THE MOVE, IN 120 CHARACTERS. Some authors write a whole sentence after the step
       * number; the write path refuses it and truncating would lose their words. So the label is the
       * first clause and the rest becomes the step's note, which is where a sentence belongs anyway.
       */
      const said = para
        .trim()
        .replace(STEP, "")
        .replace(/[:\s]+$/, "");
      if (said.length <= 120) {
        steps.push({ label: said || "Continue" });
        continue;
      }
      const at = said.lastIndexOf(" ", 118);
      const cut = at > 40 ? at : 118;
      steps.push({
        label: said.slice(0, cut).replace(/[,:\s]+$/, ""),
        note: said.slice(cut).trim(),
      });
      continue;
    }
    const display = DISPLAY.exec(para.trim());
    if (seenFinal && display) {
      answer = display[1].trim();
      continue;
    }
    if (steps.length) {
      const last = steps[steps.length - 1];
      /* The display line a step produces is its result; anything else is why the move works. */
      if (display && !last.result) last.result = display[1].trim();
      else last.note = [last.note, para.trim()].filter(Boolean).join(" ");
      continue;
    }
    problem.push(para.trim());
  }
  return {
    type: "worked-example",
    title,
    problem: problem.join("\n\n"),
    steps,
    ...(answer ? { answer } : {}),
  };
}

/* ── one unit becomes blocks ─────────────────────────────────────────────────────────────────────── */

function buildUnit(unitLines, number, title) {
  const equationHeadings = [];
  const { kept, flags, folded } = walk(unitLines, forUnit("HEADINGS", number), equationHeadings);

  /*
   * THE SOURCE IS THE WHOLE UNIT, and the prose is what is left once the blocks that carry a passage
   * better have taken theirs. The check asks whether a prose body appears IN the source, so a source
   * that is a superset is correct; a prose block repeating a passage already drawn as a callout would
   * be the actual defect.
   */
  const source = tidy(kept);

  const REPAIRS = forUnit("REPAIRS", number);
  const dropped = new Set(
    flags.flatMap((f) => [f.lead, f.alsoDrop]).filter(Boolean),
  );
  let proseText = tidy(kept.filter((l) => !dropped.has(l.trim())));

  /*
   * A REPAIR CUTS A PASSAGE WHOSE LAYOUT DID NOT SURVIVE WORD, by its first and last line. Both ends
   * must be found or the build stops, so an edited source fails loudly rather than silently leaving
   * the passage in twice.
   */
  for (const { from, to, label } of REPAIRS.cut ?? []) {
    const lines = proseText.split("\n");
    const a = lines.findIndex((l) => l.trim() === from);
    const b = lines.findIndex((l, i) => i >= a && l.trim() === to);
    if (a < 0 || b < 0)
      fail(`The passage for "${label}" is not in the source any more.`);
    proseText = [...lines.slice(0, a), ...lines.slice(b + 1)].join("\n");
  }
  proseText = proseText.replace(/\n{3,}/g, "\n\n");

  const sections = [];
  let cur = null;
  const closeSection = () => {
    if (cur && cur.body.join("\n").trim()) sections.push(cur);
    cur = null;
  };
  for (const line of proseText.split("\n").slice(1)) {
    const h = /^(##|###) (.+)$/.exec(line);
    if (h) {
      closeSection();
      cur = { level: h[1].length, heading: h[2].trim(), body: [] };
      continue;
    }
    if (cur) cur.body.push(line);
  }
  closeSection();

  const blocks = [];
  const used = new Map();
  /** Derived from the heading and never positional: a block id is what progress and deep links key on. */
  const idFor = (stem) => {
    const base = `u${number}-${slug(stem)}`;
    const n = (used.get(base) ?? 0) + 1;
    used.set(base, n);
    return n === 1 ? base : `${base}-${n}`;
  };

  const CHARTS = forUnit("CHARTS", number);
  const TERMS = forUnit("TERMS", number);
  const CHECKS = forUnit("CHECKS", number);
  const EXTRA_TABLES = forUnit("EXTRA", number);
  const FORMULA_TERMS = forUnit("FORMULA_TERMS", number);
  const TITLES = forUnit("CALLOUT_TITLES", number);

  /** A long section splits at its own bold lead-ins, never mid-paragraph and never inside a table. */
  const MAX_WORDS = 460;
  const split = (body) => {
    if (words(body) <= MAX_WORDS) return [body];
    const parts = [];
    let run = [];
    for (const p of body.split(/\n\n+/)) {
      if (
        run.length &&
        /^\*\*[A-Z]/.test(p) &&
        words(run.join("\n\n")) >= MAX_WORDS * 0.5
      ) {
        parts.push(run.join("\n\n"));
        run = [];
      }
      run.push(p);
    }
    if (run.length) parts.push(run.join("\n\n"));
    return parts;
  };

  for (const s of sections) {
    const out = [];
    let prose = [];
    const flushProse = () => {
      if (prose.length) out.push({ type: "prose", body: prose.join("\n\n") });
      prose = [];
    };

    const paras = tidy(s.body)
      .split(/\n\n+/)
      .filter((p) => p.trim());

    const leadOf = (para) =>
      /^\*\*([^*]+?)\*\*/.exec(para ?? "")?.[1].replace(/[:\s]+$/, "") ?? null;

    /*
     * A LEAD-IN WHOSE CONTENT BECAME ANOTHER BLOCK GOES WITH IT. Left in the prose after its table is
     * lifted out it is a heading with nothing under it and a block boundary beneath that: on the page,
     * a bold line, a wide gap, then a table that looks unrelated to it.
     */
    const captionFor = (i) => {
      const last = prose[prose.length - 1];
      if (last && isBoldOnly(last)) return leadOf(prose.pop());
      return leadOf(paras[i - 1]) ?? s.heading;
    };

    for (let i = 0; i < paras.length; i += 1) {
      const para = paras[i];

      if (isTable(para)) {
        const caption = captionFor(i);
        flushProse();
        out.push(tableBlock(para, caption));
        continue;
      }

      /*
       * A DEFINING EQUATION IS A FORMULA, drawn WHERE ITS DISPLAY LINE ALREADY SITS and never appended
       * to the section: the paragraph after it says "This limit gives..." about the line directly
       * above. The author announces one by explaining its symbols underneath, so a display line with a
       * `where` clause under it is the signal; the terms are supplied, because a gloss per symbol is
       * not something the sentence reliably gives up.
       */
      const display = DISPLAY.exec(para.trim());
      const terms = display ? FORMULA_TERMS[display[1].trim()] : null;
      /*
       * A DEFINING EQUATION IS NOT ONE THE AUTHOR IS PARTWAY THROUGH INTRODUCING. Where the paragraph
       * above it is a bold lead-in ("Define the Lagrangian:"), the equation is a step in a procedure
       * rather than a definition standing on its own: lifting it leaves the lead-in as the last line of
       * a prose block, which is the bold-line-with-nothing-under-it shape again. It stays in the prose.
       */
      const leadsIt = prose.length && isBoldOnly(prose[prose.length - 1]);
      if (display && terms && !leadsIt) {
        flushProse();
        out.push({ type: "formula", latex: display[1].trim(), terms });
        if (WHERE.test(paras[i + 1] ?? "")) i += 1;
        continue;
      }

      if (!EXAMPLE.test(para)) {
        /*
         * A LIST OF NAMED RULES IS A TABLE. Three or more is a set worth drawing as one; one or two is
         * a sentence with emphasis on it. As a list it is a column of bold words each trailing a boxed
         * equation, which is the shape that came back for a second look.
         */
        const rules = [];
        let k = i;
        while (k < paras.length) {
          const lines = paras[k].split("\n").filter((l) => l.trim());
          const m = lines.length === 1 ? NAMED_RULE.exec(lines[0]) : null;
          if (!m) break;
          if (m[2].trim()) {
            rules.push([m[1].trim(), cellMaths(m[2].trim())]);
            k += 1;
            continue;
          }
          const next = paras[k + 1];
          if (!next || !DISPLAY.test(next.trim())) break;
          rules.push([m[1].trim(), cellMaths(next.trim())]);
          k += 2;
        }
        if (rules.length >= 3) {
          const caption = captionFor(i);
          flushProse();
          out.push({
            type: "table",
            variant: "definitions",
            caption,
            head: ["Rule", "Formula"],
            rows: rules,
          });
          i = k - 1;
          continue;
        }
        prose.push(para);
        continue;
      }

      /*
       * AN EXAMPLE RUNS UNTIL THE NEXT ONE OR THE NEXT FOLDED HEADING. Whether it is stepped is decided
       * by looking AHEAD: a summary opens its longest worked example with a fraction and a sentence of
       * intent before the first step, and a run that stopped at that sentence turned the most important
       * example in the lecture into a callout holding one fraction.
       */
      let stepsAhead = false;
      for (let k = i + 1; k < paras.length && !EXAMPLE.test(paras[k]); k += 1)
        if (STEP.test(paras[k].trim())) stepsAhead = true;

      const run = [para];
      const tables = [];
      while (i + 1 < paras.length) {
        const next = paras[i + 1];
        if (EXAMPLE.test(next)) break;
        if (folded.has(next.trim().split("\n")[0].trim())) break;
        const continues =
          stepsAhead ||
          STEP.test(next.trim()) ||
          FINAL.test(next.trim()) ||
          /^\$\$|^\s*[-*]\s|^\$/.test(next) ||
          isTable(next);
        if (!continues) break;
        i += 1;
        (isTable(next) ? tables : run).push(next);
      }

      /* Consecutive examples merge: two callouts of the same kind may not touch. */
      const siblings = [];
      while (i + 1 < paras.length && EXAMPLE.test(paras[i + 1]))
        siblings.push(paras[(i += 1)].replace(EXAMPLE, "").trim());

      flushProse();
      const label = EXAMPLE.exec(run[0])[1]
        .trim()
        .replace(/[:\s]+$/, "");
      /* Strip EVERY lead-in, not only the first: two examples written as two bullets are one paragraph. */
      let inside = 0;
      const strip = (line) => {
        if (!EXAMPLE.test(line)) return line;
        inside += 1;
        return line.replace(EXAMPLE, (match) =>
          /^\s*[-*]\s/.test(match) ? "- " : "",
        );
      };
      const body = [run[0].replace(EXAMPLE, "").trim(), ...run.slice(1)]
        .filter(Boolean)
        .map((p) => p.split("\n").map(strip).join("\n").trim());

      if (run.some((r) => STEP.test(r.trim())))
        out.push(workedBlock(body, label));
      else
        out.push({
          type: "callout",
          variant: "example",
          title:
            inside || siblings.length
              ? "Examples"
              : /\d|:|–/.test(label)
                ? label
                : "Example",
          body: [...body, ...siblings].join("\n\n"),
        });
      for (const t of tables) out.push(tableBlock(t, label));
    }
    flushProse();

    /* The heading goes on the first block that can carry one, which is the first prose block. */
    const firstProse = out.find((b) => b.type === "prose");
    if (firstProse)
      firstProse.body = `${"#".repeat(s.level)} ${s.heading}\n\n${firstProse.body}`;
    else
      out.unshift({
        type: "prose",
        body: `${"#".repeat(s.level)} ${s.heading}`,
      });

    for (const b of out) {
      if (b.type !== "prose") {
        blocks.push({ id: idFor(`${s.heading}-${b.type}`), ...b });
        continue;
      }
      for (const part of split(b.body))
        blocks.push({ id: idFor(s.heading), type: "prose", body: part });
    }

    /* Then everything anchored to this section: the author's flags first, in their own words. */
    const mine = flags.filter((f) => f.section === s.heading);
    const oneEach = mine.filter(
      (f, i) => mine.findIndex((o) => o.variant === f.variant) === i,
    );
    const anchored = [
      ...oneEach.map((f) => ({
        type: "callout",
        variant: f.variant,
        title: f.title ?? TITLES[f.lead] ?? DEFAULT_TITLE[f.variant],
        body: f.body,
      })),
      ...(EXTRA_TABLES[s.heading] ?? []),
      ...(REPAIRS.worked?.[s.heading] ?? []),
      ...(CHARTS[s.heading] ?? []),
      ...(TERMS[s.heading] ?? []),
      ...(CHECKS[s.heading] ?? []),
    ];
    for (const b of anchored)
      blocks.push({ id: idFor(`${s.heading}-${b.type}`), ...b });
  }

  if (equationHeadings.length)
    console.log(
      `   ! ${equationHeadings.length} section heading(s) are a display equation and no title was supplied:\n       ${equationHeadings.join("\n       ")}`,
    );

  return {
    slug: slug(title),
    title,
    number,
    series: course.structure?.containerWord ?? "Lecture",
    source,
    blocks,
    questions: forUnit("QUESTIONS", number, []),
  };
}

/* ── every unit the document declares ────────────────────────────────────────────────────────────── */

const allLines = raw.split("\n");
const h1 = allLines.flatMap((l, i) =>
  /^# (.+)$/.test(l) ? [{ at: i, title: /^# (.+)$/.exec(l)[1].trim() }] : [],
);

/** Front matter is named on the record rather than guessed: a rename must not silently publish it. */
const FRONT_MATTER = new Set(course.structure?.frontMatterTitles ?? []);
const declared = (course.units ?? []).map((u) => u.title);
const units = h1.filter((u) =>
  declared.length ? declared.includes(u.title) : !FRONT_MATTER.has(u.title),
);
if (!units.length)
  fail(
    "No units found. Does composer.json list them, or does the source carry heading 1s?",
  );

const topics = units
  .map((u, idx) => {
    const next = h1.find((x) => x.at > u.at);
    const number =
      course.units?.find((c) => c.title === u.title)?.number ?? idx + 1;
    return {
      u,
      number,
      lines: allLines.slice(u.at, next ? next.at : allLines.length),
    };
  })
  .filter((t) => !wanted.length || wanted.includes(t.number))
  .map((t) => buildUnit(t.lines, t.number, t.u.title));

if (!topics.length) fail(`No unit matched --unit ${wanted.join(", ")}.`);

const glossary = topics.flatMap((t) =>
  forUnit("GLOSSARY", t.number, []).map((g) => ({
    ...g,
    topicSlug: t.slug,
  })),
);

const manifest = {
  version: 1,
  course: {
    slug: course.courseShell?.slug ?? slug(course.course),
    programCode:
      course.courseShell?.programmeCode ??
      course.courseShell?.programCode ??
      DATA.PROGRAM_CODE,
    title: course.courseShell?.title ?? course.course,
    topicTerm: course.structure?.containerWord ?? "Lecture",
    style: { requireSource: true },
  },
  topics,
  ...(glossary.length ? { glossary } : {}),
};
if (!manifest.course.programCode)
  fail(
    "No programme code. Put it in composer.json under courseShell, or export PROGRAM_CODE from course-data.mjs.",
  );

const out = join(folder, "04-manifest", "manifest.json");
writeFileSync(out, `${JSON.stringify(manifest, null, 2)}\n`);

/* ── what the build says about itself ────────────────────────────────────────────────────────────── */

for (const t of topics) {
  const by = {};
  for (const b of t.blocks) by[b.type] = (by[b.type] ?? 0) + 1;
  const prose = t.blocks.filter((b) => b.type === "prose");
  console.log(`${t.number}. ${t.title}`);
  console.log(
    `   ${t.blocks.length} blocks: ${Object.entries(by)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${v} ${k}`)
      .join(", ")}`,
  );
  console.log(
    `   ${t.questions.length} questions, ${forUnit("GLOSSARY", t.number, []).length} glossary terms, longest prose ${Math.max(0, ...prose.map((b) => words(b.body)))} words`,
  );

  const ids = t.blocks.map((b) => b.id);
  const dupes = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
  if (dupes.length)
    console.log(`   ! duplicate block ids: ${dupes.join(", ")}`);

  /*
   * THE CHECKS THE SERVER WILL RUN, RUN HERE FIRST. Finding out at the write boundary costs a round
   * trip to learn something this file already knows.
   */
  const orphans = [];
  for (const b of prose)
    for (const para of b.body.replace(/^#{2,3} .*\n\n/, "").split("\n\n"))
      if (para.trim() && !t.source.includes(para.trim())) orphans.push(b.id);
  if (orphans.length)
    console.log(`   ! ${orphans.length} paragraph(s) not found in the source`);

  const strays = prose.filter(
    (b) =>
      /^\|/m.test(b.body) || /^\s*(?:[-*]\s+)?\*\*Examples?\b/m.test(b.body),
  );
  if (strays.length)
    console.log(
      `   ! ${strays.length} prose block(s) still hold a table or an example`,
    );

  const stranded = prose.filter((b) => {
    const lines = b.body
      .trim()
      .split("\n")
      .filter((l) => l.trim());
    return isBoldOnly(lines[lines.length - 1]);
  });
  if (stranded.length)
    console.log(`   ! ${stranded.length} prose block(s) end on a bold line`);
}

console.log(
  `\n${out} (${(JSON.stringify(manifest).length / 1024).toFixed(0)} KB)`,
);
