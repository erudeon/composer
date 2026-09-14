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

/** What the author meant by a style they named themselves. Course knowledge, not unit knowledge. */
const STYLES = DATA.STYLES ?? {};

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

/** A style `docx.js` wrote out for a later phase to read. Not content, and never drawn. */
const AUTHORED_STYLE = /^\s*<!--\s*style:\s*(.+?)\s*-->\s*$/;

/*
 * The author's emoji flags become a callout's variant, and the emoji never survives.
 *
 * THE MARKERS DO SURVIVE. An author writes the flag INSIDE their own emphasis, `**🎯 Try** doing this`
 * or `**🎯 Note that ...**`, and eating the opening `**` along with the emoji leaves its partner
 * behind: the first becomes `Try** doing this`, which draws a stray pair of asterisks and loses the
 * author's emphasis, and the second becomes a body ending in a bare `**`. Thirteen callouts on one
 * course. So the opening marker is MATCHED, to find the flag, and put back.
 */
const FLAG = /^(\s*\*\*)?\s*(?:🎯|💡|📌|⚠️)\s*/u;
const FLAG_KIND = /(🎯|💡|📌|⚠️)/u;

/**
 * The emoji goes and the author's emphasis stays, which are two different answers depending on what
 * the `**` before the flag was doing.
 *
 * `**🎯 Note the whole line.**` is a line the author emphasised WHOLE, and both markers belong to the
 * flag: they go with it, and what is left is the plain sentence the callout carries.
 *
 * `**🎯 Try** doing this` is a flag sitting inside emphasis on ONE WORD. Taking the opener leaves its
 * partner stranded, which draws a stray pair of asterisks and loses the author's emphasis, so the
 * opener is put back.
 *
 * Told apart by where the emphasis closes: at the very end and nowhere else, it wrapped the line.
 */
/** The list item shapes `docx.js` writes: `- ` for a bullet and `1. ` for an ordered item. */
const LIST_ITEM = /^\s*(?:[-*]\s|\d+[.)]\s)/;

/**
 * What a colon-ended flag announces: the next line that is content, and the whole RUN of it when that
 * line is a list item. Returned joined, so the callout carries it as the one thing it is.
 */
function followingContent(unitLines, at) {
  let j = at + 1;
  while (j < unitLines.length && (!unitLines[j].trim() || AUTHORED_STYLE.test(unitLines[j]))) j += 1;
  const first = unitLines[j];
  if (first === undefined) return null;
  if (!LIST_ITEM.test(first)) return first;
  const run = [];
  for (; j < unitLines.length; j += 1) {
    if (!unitLines[j].trim()) continue;
    if (!LIST_ITEM.test(unitLines[j])) break;
    run.push(unitLines[j]);
  }
  return run.join("\n");
}

/**
 * A SHORT LABEL IS NOT AN EXAMPLE, whatever style sits above it.
 *
 * An author reaches for one style for everything that is not body text, so the same style marks a
 * worked example AND the one-line label introducing a table. 17 of 61 on one course: "Transactions
 * Table", "LIFO Periodic:", "COGS Calculation:". Made into examples they are swallowed by the run that
 * collects them, and three consecutive labels came out as ONE callout reading "Transactions Table /
 * Results Comparison by Method / 1. FIFO", with the tables they introduced left behind.
 *
 * A label has no sentence in it: few words and no full stop. It stays prose, and a course that wants it
 * to be a heading says so in `headings.json`, which is a decision rather than a guess.
 */
function isALabel(line) {
  const text = line.trim().replace(/\*\*/g, "").replace(/^\s*(?:🎯|💡|📌|⚠️)\s*/u, "");
  return text.split(/\s+/).filter(Boolean).length <= 6 && !/[.!?]$/.test(text);
}

const unflag = (line) => {
  const m = FLAG.exec(line);
  if (!m) return line;
  const rest = line.slice(m[0].length);
  if (!m[1]) return rest;
  const closes = rest.indexOf("**");
  if (closes !== -1 && closes === rest.length - 2) return rest.slice(0, -2);
  return m[1].trimStart() + rest;
};
const POINTER = /(?:👉|➡️)\s*/gu;
const VARIANT = {
  "🎯": "exam-tip",
  "💡": "intuition",
  "📌": "key-concept",
  "⚠️": "note",
};

/*
 * What an author calls the closing recap. Matched on the HEADING, so it catches the common case where
 * the author wrote the words but never gave them a style. An `In Short` Word style is caught too, by
 * the style pass, because the author saying it outright beats anything inferred from the text.
 */
const IS_A_RECAP = /^(?:in\s+short|in\s+summary|summary|recap|key\s+takeaways?|to\s+summari[sz]e)\s*$/i;

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
  let pendingExample = false;
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

    /*
     * THE AUTHOR'S STYLE MARKERS ARE METADATA AND A READER MUST NEVER SEE ONE. `docx.js` writes the
     * styles the author named in Word as `<!-- style: In Short -->` above the paragraph they mark, so
     * a phase that understands one can read it. Nothing here understands any of them, and a marker
     * left in the text does not vanish for being a comment: it lands inside a prose block and is drawn.
     *
     * 211 of them, across every lecture of one real course, in three styles that author had made up.
     * Whatever DOES act on a marker consumes it before this point; anything still here is unread, and
     * unread metadata is dropped rather than published.
     */
    const styled = AUTHORED_STYLE.exec(line);
    if (styled) {
      /*
       * A COURSE MAY CLAIM ONE. The style NAME carries no meaning on its own: a template might call it
       * `In Short`, and a Hungarian Word calls the same thing `Stilus1`, so only the course can say
       * what its author meant by it. `STYLES` in `course-data.mjs` is where that is said, and a style
       * nobody claims is dropped rather than drawn.
       */
      if (STYLES[styled[1]] === "example") pendingExample = true;
      continue;
    }

    /*
     * The paragraph under a claimed example style IS an example, and saying so in the text the example
     * machinery already reads puts it where the author put it. Anchoring it to the section instead
     * would move it to the end, away from the thing it illustrates.
     */
    if (pendingExample && line.trim()) {
      pendingExample = false;
      /*
       * A FLAG ON THE LINE WINS. The style marks a whole paragraph and the flag marks that sentence, so
       * the flag is the more specific of the two and its own path handles it, variant and all. Rewriting
       * first also moved the flag off the start of the line, where the strip is anchored, so the emoji
       * survived into the body of a callout.
       */
      if (!FLAG.test(line) && !isALabel(line))
        line = `**Example**: ${line.trim().replace(/^\**Examples?\**\s*:\s*/i, "")}`;
    }

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
      .replace(POINTER, "");
    clean = unflag(clean);

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

    const m = FLAG.test(line) ? FLAG_KIND.exec(line) : null;
    if (m && clean.trim()) {
      /*
       * A FLAG ENDING IN A COLON INTRODUCES THE LINE UNDER IT, so the callout takes that line too.
       * Lifting the sentence alone leaves the formula it announces standing with nothing above it.
       */
      /*
       * The next line that is CONTENT. A style marker is the author naming what the paragraph under it
       * is for, so it sits between the flag and the thing the flag announces: taking the first
       * non-empty line gives the callout a comment for a body and leaves the equation behind.
       */
      /*
       * AND A LIST IS ONE THING. Taking the first line that is content is right when a colon announces a
       * sentence or an equation, and wrong when it announces a LIST: the callout then carries step one
       * of ten and the other nine are left in the prose behind it, which is how a recap of the whole
       * accounting cycle came out as "the process with 10 steps: 1. Identify and Analyze Transactions".
       */
      const follows = clean.trim().endsWith(":") ? followingContent(unitLines, i) : null;
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
  /*
   * A SECTION WITH NO PROSE OF ITS OWN IS STILL A SECTION, when what follows it is its SUBSECTIONS.
   *
   * Dropping an empty one is right for a heading with nothing at all under it. It is wrong for a `##`
   * that groups two `###`, which is ordinary document structure: "Cash vs Accrual Basis Accounting"
   * over "Cash Basis" and "Accrual Basis", "Inventory Ratios and Turnover" over the two ratios. Nine of
   * them on one course, every one a line missing from the contents a student navigates by, including
   * one on a lecture that was already published.
   *
   * Told apart by what comes next: a deeper heading means it has children, so it is kept.
   */
  const closeSection = (nextLevel) => {
    if (!cur) return;
    const hasProse = cur.body.join("\n").trim();
    if (hasProse || (nextLevel !== undefined && nextLevel > cur.level)) sections.push(cur);
    cur = null;
  };
  for (const line of proseText.split("\n").slice(1)) {
    const h = /^(##|###) (.+)$/.exec(line);
    if (h) {
      closeSection(h[1].length);
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

    /*
     * THE CLOSING RECAP IS A CALLOUT, NOT A SECTION. Almost every summary ends each unit with one, and
     * its author names it: "In Short", "In short", "Summary", "Recap", or a paragraph styled `In Short`
     * in Word. Left as prose it reads as one more section of the lecture, indistinguishable from the
     * teaching that went before it, when its whole job is to look different so a reader revising can
     * find it. The reader has a variant for exactly this.
     *
     * Only where the section is ALL prose. A recap holding a table or a worked example is not a recap,
     * and folding one into a callout would bury it.
     */
    if (IS_A_RECAP.test(s.heading) && out.every((b) => b.type === "prose")) {
      const body = out
        .map((b) => b.body.trim())
        .filter(Boolean)
        .join("\n\n");
      if (body) {
        blocks.push({
          id: idFor(s.heading),
          type: "callout",
          variant: "in-short",
          title: s.heading,
          body,
        });
        continue;
      }
    }

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
    /*
     * TWO CALLOUTS OF THE SAME KIND MAY NOT TOUCH, SO THEY ARE ONE CALLOUT.
     *
     * This used to keep the FIRST flag of each kind and drop the rest, which is not the same thing at
     * all: on one real course 12 of the author's 71 flagged sentences never reached the page, silently,
     * because a section happened to carry two exam tips. Their notes are the part of a summary a student
     * reads first.
     *
     * Merged in the order they were written, with the first one's title, because a title is one thing
     * and the kind is what they have in common.
     */
    const oneEach = [];
    for (const f of mine) {
      const already = oneEach.find((o) => o.variant === f.variant);
      if (already) already.body = `${already.body}\n\n${f.body}`;
      else oneEach.push({ ...f });
    }
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
    /*
     * THE ADDRESS IS PINNED WHERE A COURSE SAYS SO. A lecture's address is derived from its title, so
     * correcting a typo in a PUBLISHED title would move it: the old lecture is left on the course as an
     * orphan that no import ever deletes, and every link anybody already has breaks. SLUGS in
     * `course-data.mjs` keeps the address while the words change.
     */
    slug: forUnit("SLUGS", number, null) ?? slug(title),
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

/*
 * A MOCK EXAM PAPER IS NOT A PRACTICE BANK. The bank belongs to a lecture and is drawn from as a
 * student reads; a paper is a fixed sitting, and it PINS its questions by key from the banks. So the
 * questions themselves live with the unit that teaches them, and `EXAMS` names which ones make a paper.
 */
const exams = DATA.EXAMS ?? [];

/* A paper's questions are its own, keyed like every other, and never also in a lecture's bank. */
const inBanks = new Set(topics.flatMap((t) => t.questions.map((q) => q.key)));
const both = exams.flatMap((e) => e.questions.map((q) => q.key)).filter((k) => inBanks.has(k));
if (both.length)
  fail(`A question is in a paper AND a lecture bank, so it would be written twice: ${[...new Set(both)].join(", ")}`);

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
  ...(exams.length ? { exams } : {}),
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


