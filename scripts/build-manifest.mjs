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
import { UNIT_KEYS_FILE } from "./unit-keys.mjs";

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
/* THE SET IS THE AUTHOR'S, NOT OURS. ❗ and 👉 are how a real maths summary flags a warning and a
   takeaway, and leaving them out left 8 of its 24 flagged lines in the prose WITH THE EMOJI IN
   THEM. A flag a reader can see is a flag we failed to lift. */
const FLAG = /^(\s*\*\*)?\s*(?:🎯|💡|📌|⚠️|❗|❕|👉|➡️)\uFE0F?\s*/u;
const FLAG_KIND = /(🎯|💡|📌|⚠️|❗|❕|👉|➡️)/u;

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
  const text = line.trim().replace(/\*\*/g, "").replace(/^\s*(?:🎯|💡|📌|⚠️|❗|❕|👉|➡️)\uFE0F?\s*/u, "");
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
/* A pointer MID-LINE is an arrow and is dropped; at the START of a line it is a flag, and the flag
   branch below claims it. Stripping both left the author's one takeaway as ordinary prose. */
const POINTER = /(?!^)(?:👉|➡️)\uFE0F?\s*/gmu;
const VARIANT = {
  "🎯": "exam-tip",
  "💡": "intuition",
  "📌": "key-concept",
  "⚠️": "note",
  /* An author who never types ⚠️ or 📌 reaches for these two instead. */
  "❗": "note",
  "❕": "note",
  "👉": "key-concept",
  "➡️": "key-concept",
};

/*
 * What an author calls the closing recap. Matched on the HEADING, so it catches the common case where
 * the author wrote the words but never gave them a style. An `In Short` Word style is caught too, by
 * the style pass, because the author saying it outright beats anything inferred from the text.
 */
/* A recap names itself, and a summary usually numbers it: "Week 3 Wrap-Up" is the same block as
   "In Short". Left unmatched it reads as one more section of teaching, which is the one thing a
   recap must not look like.
   THE NOUN AFTER "Key" IS A CLOSED SET, and deliberately: the same documents carry "Key Theories",
   "Key Economic Metrics" and "Key Characters in Strategic Context", which are sections that TEACH. A
   rule taking "Key <anything>" folds five of those into boxes and hides them.
   THE SET IS NOT ENGLISH-ONLY. One house writes the same closing box as "Brief overview" in its English
   edition and "Kort overzicht" in its Dutch one; neither matched, so both editions of a live Statistics
   course ended on an ordinary prose section, which is the one thing the guide says a lecture must not
   do. Every addition is a WHOLE PHRASE and never a bare noun: "overview" and "overzicht" open as many
   sections as they close, and the anchor is what keeps "Overzicht van de voorwaarden per procedure" a
   teaching table rather than a box. */
const IS_A_RECAP =
  /^(?:(?:week|unit|lecture|chapter|hoorcollege|college|thema)\s*\d+\s*[:\u2013-]?\s*)?(?:wrap[\s-]?up|in\s+short|in\s+summary|summary|recap|conclusion|key\s+(?:takeaways?|insights?|points?)|to\s+summari[sz]e|brief\s+overview|kort\s+overzicht|samenvatting|kernpunten)\s*$/i;

/** The same names, written as a BOLD LEAD-IN with the summary running on after it. */
const RECAP_LEAD =
  /^\*\*(?:(?:week|unit|lecture|chapter)\s*\d+\s*[:\u2013-]?\s*)?(wrap[\s-]?up|in short|in summary|summary|recap|conclusion|key (?:takeaways?|insights?|points?)|to summari[sz]e)\*\*[:.]?\s*([\s\S]*)$/i;

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
/**
 * NEST EACH LIST CHILD UNDER ITS OWN PARENT'S MARKER.
 *
 * Word indents every level by two spaces whatever the parent is, and two is not enough under an
 * ordered item: `1. ` is three characters wide, so Markdown closes the list at the first child and
 * the next item opens a NEW one. Every item then renders as "1.", which is why stripping the numbers
 * used to look like the lesser evil. It is not: the count IS the thing a student has to remember for
 * Scott's three pillars or Dunning's three advantages.
 *
 * So the indent is rewritten from the parent's ACTUAL marker width, tracked on a stack. A bullet's
 * children go two in, an ordered item's three, and a deeper level goes in by its own parent's width
 * again. Nothing but leading whitespace changes.
 */
function nestLists(lines) {
  const stack = [];
  return lines.map((line) => {
    const m = /^(\s*)([-*]\s|\d+[.)]\s)(.*)$/.exec(line);
    if (!m) {
      /* A blank line sits INSIDE a list as often as it ends one, so only real text resets the stack. */
      if (line.trim()) stack.length = 0;
      return line;
    }
    const [, indent, marker, rest] = m;
    const at = indent.length;
    while (stack.length && stack[stack.length - 1].at >= at) stack.pop();
    const out = stack.length ? stack[stack.length - 1].out + stack[stack.length - 1].width : 0;
    stack.push({ at, out, width: marker.length });
    return " ".repeat(out) + marker + rest;
  });
}

function walk(rawUnitLines, HEADINGS, equationHeadings) {
  const unitLines = nestLists(rawUnitLines);
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

  /*
   * A HEADING ENDS A LEAD-IN. A bold line on its own is held until the paragraph it introduces
   * arrives, and nothing stopped it being held ACROSS a heading: a section ending on a bold result
   * handed that result to the first paragraph of the next section. "**Total COGS = EUR 220,500**",
   * the answer of a three-step worked example, was drawn as the opening words of the In Short.
   */
  /*
   * A SECTION IS AN OCCURRENCE, NOT A NAME. Anchored blocks used to find their section by matching its
   * HEADING TEXT, so an author who writes "WA Method" twice -- once under Step 1 and once under Step 2
   * -- had each section's flagged note drawn under BOTH of them, word for word.
   *
   * Both passes over the unit walk it top to bottom and see the same headings in the same order, so
   * numbering each occurrence as it goes gives the two a key they agree on.
   */
  const nth = new Map();
  const keyFor = (name) => {
    const n = (nth.get(name) ?? 0) + 1;
    nth.set(name, n);
    return `${name}#${n}`;
  };
  let sectionKey = null;

  const endLeadIn = () => {
    if (lead) kept.push(lead);
    lead = null;
    leadWasAHeading = false;
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
      endLeadIn();
      section = h2[1].trim();
      sectionKey = keyFor(section);
      promoting = false;
      kept.push(line);
      continue;
    }

    const h3 = /^### (.+)$/.exec(line);
    if (h3) {
      endLeadIn();
      promoting = isALabel(i);
      if (promoting) continue;
      section = h3[1].trim();
      sectionKey = keyFor(section);
      kept.push(line);
      continue;
    }

    const h4 = /^#{4,}\s+(.+)$/.exec(line);
    if (h4) {
      endLeadIn();
      if (promoting) {
        section = h4[1].trim();
        sectionKey = keyFor(section);
        kept.push(`### ${h4[1].trim()}`);
      } else {
        lead = `**${h4[1].trim()}**`;
        leadWasAHeading = true;
      }
      continue;
    }

    /*
     * THE NUMBER STAYS. It used to be stripped off any item that was only a bold lead-in, because the
     * bullets underneath broke the list and every item rendered as "1." anyway. `nestLists` above
     * fixes that at its cause, so there is nothing left to work around: an ordered list the author
     * wrote is an ordered list the reader gets. Only a LONE item still loses its number, below,
     * because one item is not a sequence.
     */
    let clean = line.replace(POINTER, "");
    clean = unflag(clean);

    /*
     * AN ORDERED ITEM WITH NO SIBLINGS IS A SENTENCE, and one WITH siblings keeps its number.
     *
     * Authors number a set of steps and then bullet the working under each, which breaks the list in
     * Markdown and leaves an ordered list of one item apiece; there the number means nothing and the
     * words alone are right. But the bold-only strip used to run BEFORE this test, so a genuine step
     * that happens to be a bold lead-in with its detail bulleted underneath lost its number while its
     * siblings kept theirs: "1. Theory / 2. Hypothesis / **Data collection:** / 4. Verification",
     * published to students as a five-step method with a hole in it.
     *
     * So the test comes first, on the raw line, and BOTH strips are gated on it.
     */
    if (/^\d+\.\s/.test(clean)) {
      /*
       * A SIBLING IS THE NEXT ITEM AT THE SAME DEPTH, not the next line.
       *
       * Two faults met here. The bold-only strip used to run BEFORE this test, so a genuine step whose
       * detail was bulleted underneath lost its number while its siblings kept theirs, publishing a
       * five-step method with a hole in it. That strip is gone: `nestLists` fixes the broken nesting it
       * was working around, so an ordered list the author wrote survives as one.
       *
       * The test itself was blind in the same direction. An item's own children sit between it and its
       * sibling, so looking only at the adjacent line finds a bullet, concludes the item stands alone,
       * and takes the number off EVERY item in the list. Children are stepped over; anything shallower,
       * any ordinary paragraph and any heading ends the search.
       */
      const mine = /^(\s*)/.exec(clean)[1].length;
      const near = (from, step) => {
        for (let k = from; k >= 0 && k < unitLines.length; k += step) {
          const other = unitLines[k];
          if (!other.trim()) continue;
          if (/^#{1,6}\s/.test(other)) return false;
          const item = /^(\s*)(?:[-*]\s|\d+[.)]\s)/.exec(other);
          if (!item) return false;
          if (item[1].length > mine) continue;
          if (item[1].length < mine) return false;
          return /^\s*\d+\.\s/.test(other);
        }
        return false;
      };
      if (!near(i - 1, -1) && !near(i + 1, 1)) clean = clean.replace(/^(\s*)\d+\.\s+/, "$1");
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
        sectionKey,
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
/*
 * AN AUTHOR MAY LABEL THEIR EXAMPLE THEIR OWN WAY. "**Method 1 Example: Solving by elimination**"
 * is an example, and requiring the word FIRST meant two complete three-step solutions stayed in one
 * paragraph. A prefix is allowed, but only where a colon follows the word, so "**For example**, take
 * y = 2x + 1" stays the sentence it is rather than becoming a box.
 */
const EXAMPLE = /^\s*(?:[-*]\s+)?\*\*((?:[^*]{1,24}?\bExamples?\s*:|Examples?)[^*]*)\*\*\s*:?\s*/;
/* The words a step is labelled with sit INSIDE the bold, so they are CAPTURED rather than eaten.
   An author who writes "**Step 2: Solve for** $Q$**.**" puts half of them outside it instead,
   which is why `workedBlock` joins the capture to what follows on the same line. */
const STEP = /^\*\*Step\s*\d+\s*[:.)\-\u2013]?\s*([^*]*?)\*\*\s*/;
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
    .slice(0, 44)
    /* TRIMMED AFTER THE CUT, not before. The length cut lands anywhere in the string, including on a
       separator, and a slug ending in a hyphen is refused by the manifest schema. "Chapter 7: Week 7:
       The Entrepreneur, Executive & Manager" is exactly 44 characters to that hyphen. */
    .replace(/^-+|-+$/g, "");

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
/**
 * A STEP'S NOTE IS PLAIN TEXT, so every mark in it is drawn as a character. The emphasis goes, and so
 * does the hyphen of a list: an author who answers a step with two bullets got "- WIP = ..." on the
 * page, hyphen and all. The lines stay separate; only the markers go.
 */
const plainNote = (para) =>
  para
    .trim()
    .split("\n")
    .map((line) => line.replace(/^\s*[-*]\s+/, "").replace(/\*\*/g, "").trim())
    .filter(Boolean)
    .join("\n");

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
      /*
       * THE LABEL IS THE AUTHOR'S WORDS, wherever they put them: inside the `**Step N: ...**` marker,
       * after it on the same line, or split across both. Only the FIRST line joins the label; a
       * second line is a sentence about the step and belongs in its note. Leftover emphasis is
       * dropped, because "$Q$**.**" is a stray marker rather than something the author emphasised.
       */
      const inside = (STEP.exec(para.trim())?.[1] ?? "").trim();
      const after = para.trim().replace(STEP, "").split("\n");
      const carried = after.slice(1).join("\n").trim();
      const said = [inside, after[0]]
        .filter(Boolean)
        .join(" ")
        .replace(/\*\*/g, "")
        .replace(/[:.,\s]+$/, "")
        .trim();
      if (said.length <= 120) {
        steps.push({ label: said || "Continue", ...(carried ? { note: carried } : {}) });
        continue;
      }
      const at = said.lastIndexOf(" ", 118);
      const cut = at > 40 ? at : 118;
      steps.push({
        label: said.slice(0, cut).replace(/[,:\s]+$/, ""),
        note: [said.slice(cut).trim(), carried].filter(Boolean).join(" "),
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
      /*
       * A NOTE IS PLAIN TEXT, like the label above it. The label has its emphasis stripped and the
       * note did not, so a bulleted answer under a step reached the page as "**EUR 8,000**" with the
       * asterisks drawn. There is nowhere for the author's emphasis to go here, so it goes.
       */
      else last.note = [last.note, plainNote(para)].filter(Boolean).join(" ");
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

/**
 * A WRITTEN-OUT QUESTION SECTION BELONGS IN THE BANK, AND ITS ANSWER KEY MUST LEAVE THE BODY.
 *
 * Plenty of summaries end each unit with ten multiple-choice questions and then the answers. Built as
 * prose, the last block of the lecture is the key: a student opening the lecture reads the correct
 * answer beside every question, and the bank the reader draws from is empty. That is what this builder
 * did to a real two-language course until somebody looked at a block.
 *
 * DETECTED BY SHAPE, NEVER BY THE HEADING'S WORDS. The heading is "10 Multiple-choice questions" in one
 * edition and "10 Meerkeuzevragen" in the other, and a word list would have to grow once per language
 * for ever. What does not vary is the shape: numbered stems each carrying lettered options, then a run
 * of answers naming a letter and explaining it.
 *
 * IT REFUSES RATHER THAN GUESSES. Under three stems, or answers that do not line up with the stems, and
 * it lifts nothing and says so: half a bank is worse than none, because the half left in the body still
 * carries its answers.
 */
const Q_STEM = /^\*\*(\d+)\.\*\*\s*(.+)$/;
const Q_OPTION = /^\*\*([A-Z])\.\*\*\s*(.+)$/;
/* An answer names the letter and then explains it. It looks like a stem until the letter and dash. */
const Q_ANSWER = /^\*\*(\d+)\.\*\*\s*([A-Z])\s*[—–-]\s*(.+)$/;
const HEADING_LINE = /^#{1,6}\s+\S/;

function liftQuestions(unitLines, number) {
  const at = unitLines.findIndex(
    (l, i) =>
      Q_STEM.test(l.trim()) &&
      !Q_ANSWER.test(l.trim()) &&
      unitLines.slice(i + 1, i + 8).some((n) => Q_OPTION.test(n.trim())),
  );
  if (at < 0) return { lines: unitLines, removed: [], questions: [] };

  /* The section starts at the heading that introduces the questions, so the heading goes too. */
  let start = at;
  while (start > 0 && !HEADING_LINE.test(unitLines[start - 1])) start -= 1;
  if (start > 0) start -= 1;

  const stems = new Map();
  const answers = new Map();
  let current = null;
  let end = at;
  for (let i = at; i < unitLines.length; i += 1) {
    const line = unitLines[i].trim();
    const answer = Q_ANSWER.exec(line);
    if (answer) {
      answers.set(Number(answer[1]), { letter: answer[2], why: answer[3].trim() });
      current = null;
      end = i;
      continue;
    }
    const stem = Q_STEM.exec(line);
    if (stem) {
      current = { n: Number(stem[1]), stem: stem[2].trim(), options: [] };
      stems.set(current.n, current);
      end = i;
      continue;
    }
    const option = Q_OPTION.exec(line);
    if (option && current) {
      current.options.push({ letter: option[1], text: option[2].trim() });
      end = i;
    }
  }

  const built = [];
  for (const n of [...stems.keys()].sort((a, b) => a - b)) {
    const q = stems.get(n);
    const answer = answers.get(n);
    if (!answer || q.options.length < 2) continue;
    /* The key must name an option this question actually has, or the answer belongs to another one. */
    if (!q.options.some((o) => o.letter === answer.letter)) continue;
    built.push({
      key: `u${number}-q${String(n).padStart(2, "0")}`,
      type: "SINGLE",
      stem: q.stem,
      options: q.options.map((o) => ({
        text: o.text,
        ...(o.letter === answer.letter ? { correct: true } : {}),
      })),
      explanation: answer.why,
    });
  }
  if (built.length < 3 || built.length !== stems.size) {
    console.log(
      `   ! a question section was found and NOT lifted: ${stems.size} stem(s), ${built.length} with a ` +
        `usable answer. Left in the body, answers and all, rather than lifting half a bank.`,
    );
    return { lines: unitLines, removed: [], questions: [] };
  }
  return {
    lines: [...unitLines.slice(0, start), ...unitLines.slice(end + 1)],
    /* The lines themselves, so the unit's `source` can stay a superset of everything it published. */
    removed: unitLines.slice(start, end + 1),
    questions: built,
  };
}

/**
 * A PICTURE ON ITS OWN IS A FIGURE, NOT A LINE OF PROSE.
 *
 * `images.mjs` answers markdown, and substituting it leaves `![alt](key)` sitting inside a prose body.
 * It draws, so nothing looks wrong, and three things are quietly lost: `alt` stops being a field and
 * becomes a string a reader can neither read nor a screen reader announce as the picture's own; the
 * caption under it stays an italic paragraph rather than the figure's caption; and `frame` cannot be
 * set at all. A course of 348 slides went up that way before anybody looked at a block.
 *
 * ONLY A PARAGRAPH THAT IS NOTHING BUT THE PICTURE. An image inside a sentence is an inline picture the
 * author put there, and lifting that one out would cut the sentence in half.
 *
 * THE CAPTION IS THE ITALIC PARAGRAPH DIRECTLY UNDER IT, which is what Word's own caption style
 * produces and what every summary this pipeline has met does. Nothing else is taken: a following
 * paragraph of prose stays prose.
 */
/* The alt text is a sentence the author wrote and may itself hold a bracket: one real figure's alt
   read "p = P[Z >= 2.61] = 0.0045", and a `[^\]]*` alt stopped at that first bracket and left the
   whole picture inline as prose. The line is anchored at both ends and is nothing but the image, so a
   greedy alt taking the LAST `](` is the correct reading. */
const LONE_IMAGE = /^!\[([\s\S]*)\]\(([^)\s]+)\)$/;
const ITALIC_ONLY = /^\*([^*].*[^*])\*$/;

function figuresOutOfProse(body) {
  const paras = body.split("\n\n");
  const out = [];
  let prose = [];
  const flushProse = () => {
    const text = prose.join("\n\n").trim();
    prose = [];
    if (text) out.push({ type: "prose", body: text });
  };
  for (let i = 0; i < paras.length; i += 1) {
    const m = LONE_IMAGE.exec(paras[i].trim());
    if (!m) {
      prose.push(paras[i]);
      continue;
    }
    const caption = ITALIC_ONLY.exec((paras[i + 1] ?? "").trim());
    flushProse();
    out.push({
      type: "figure",
      imageKey: m[2],
      /* Required, and the only thing a reader who cannot see it is given. The markdown's own alt text
         is the author's, written when the figure was declared for upload. */
      alt: (m[1] || caption?.[1] || "Figure").slice(0, 300),
      ...(caption ? { caption: caption[1].slice(0, 400) } : {}),
      frame: "original",
    });
    if (caption) i += 1;
  }
  flushProse();
  return out.length ? out : [{ type: "prose", body }];
}

/* ── one unit becomes blocks ─────────────────────────────────────────────────────────────────────── */

function buildUnit(rawLines, number, title, shown) {
  /* The questions and their answer key leave the body before anything is built from it. */
  const { lines: unitLines, removed: liftedLines, questions: lifted } = liftQuestions(rawLines, number);
  const supplied = forUnit("QUESTIONS", number, []);
  const bank = supplied.length ? supplied : lifted;
  const bankSize = bank.length;
  const equationHeadings = [];
  const { kept, flags, folded } = walk(unitLines, forUnit("HEADINGS", number), equationHeadings);

  /*
   * THE SOURCE IS THE WHOLE UNIT, and the prose is what is left once the blocks that carry a passage
   * better have taken theirs. The check asks whether a prose body appears IN the source, so a source
   * that is a superset is correct; a prose block repeating a passage already drawn as a callout would
   * be the actual defect.
   */
  /*
   * THE SOURCE IS A SUPERSET OF EVERYTHING THIS UNIT PUBLISHED, questions included.
   *
   * The lift takes the question section out of the body, which is the whole point of it, and taking it
   * out of `source` as well would leave 80 questions per course that NOTHING can be compared against:
   * `fidelity-check.mjs` reads this field, and a stem or an explanation quietly rewritten would be
   * invisible to it. The lint that reads this field asks only whether what was built appears IN it, so
   * a superset is correct there and was already documented as such.
   */
  const source = [tidy(kept), ...liftedLines].join("\n");

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
  /* The same numbering `walk` gave the flags: both passes see these headings in this order. */
  const nth = new Map();
  const keyFor = (name) => {
    const n = (nth.get(name) ?? 0) + 1;
    nth.set(name, n);
    return `${name}#${n}`;
  };
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
  /*
   * A SECTION WHOSE ONLY CONTENT IS SUPPLIED IS STILL A SECTION. A course that cuts a list and gives
   * the picture of it in the same place empties that section's prose ON PURPOSE, and measuring
   * emptiness on the prose alone dropped the section and took the supplied block with it, silently:
   * declared, built, reported as fine, and missing from the lecture.
   */
  const SUPPLY_MAPS = [
    forUnit("EXTRA", number),
    forUnit("CHARTS", number),
    forUnit("TERMS", number),
    forUnit("CHECKS", number),
    forUnit("REPAIRS", number).worked ?? {},
  ];
  const supplies = (anchor) => SUPPLY_MAPS.some((m) => (m[anchor] ?? []).length > 0);

  const closeSection = (nextLevel) => {
    if (!cur) return;
    const hasProse = cur.body.join("\n").trim();
    if (hasProse || supplies(cur.anchor) || (nextLevel !== undefined && nextLevel > cur.level))
      sections.push(cur);
    cur = null;
  };
  /*
   * A UNIT'S TEXT BEFORE ITS FIRST SUBHEADING IS STILL ITS TEXT. Sections were collected from `##`
   * and `###` alone, so an opening run was collected by nothing and vanished: a unit with NO
   * subheadings produced zero blocks, which the publish door then refused for having no body, three
   * screens from the cause. The opening run is a section with no heading to print, because that is
   * what it is.
   */
  /* `anchor` is what a course keys its supplied blocks on; `heading` is what prints. An opening
     run has the first and not the second, so it can still carry a chart or a callout. */
  cur = { level: 2, heading: null, anchor: "(opening)", key: keyFor("(opening)"), body: [] };

  for (const line of proseText.split("\n").slice(1)) {
    const h = /^(##|###) (.+)$/.exec(line);
    if (h) {
      closeSection(h[1].length);
      const heading = h[2].trim();
      cur = { level: h[1].length, heading, anchor: heading, key: keyFor(heading), body: [] };
      continue;
    }
    if (cur) cur.body.push(line);
  }
  closeSection();

  const blocks = [];
  const used = new Map();
  /** Derived from the heading and never positional: a block id is what progress and deep links key on. */
  const idFor = (stem) => {
    const base = `u${number}-${slug(stem ?? "opening")}`;
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
  /*
   * A TITLE IS LOOKED UP ON A PREFIX, and an unused one is REPORTED.
   *
   * The key used to be the whole cleaned line, so a course that supplied "A quick sign check keeps
   * your algebra perfect" against a sentence that runs on for another forty words matched nothing,
   * silently, and every callout kept the generic default. Four of one course's titles were no-ops
   * and nothing said so. A prefix makes the key writable; the report makes a miss visible.
   */
  const titlesUsed = new Set();
  const titleFor = (lead) => {
    const key = Object.keys(TITLES).find((k) => lead === k || lead.startsWith(k));
    if (key) titlesUsed.add(key);
    return key ? TITLES[key] : undefined;
  };

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
      return leadOf(paras[i - 1]) ?? s.anchor;
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
      /** Working: a step, a list, a display line or a table. What an example is made of. */
      const isWorking = (p) =>
        p !== undefined &&
        (STEP.test(p.trim()) ||
          FINAL.test(p.trim()) ||
          /* An ORDERED item too. `1.` is how an author writes an example's own steps, and leaving it
             out of this test cut every such example off after its first sentence. */
          LIST_ITEM.test(p) ||
          /^\$\$|^\$/.test(p) ||
          isTable(p));
      while (i + 1 < paras.length) {
        const next = paras[i + 1];
        if (EXAMPLE.test(next)) break;
        if (folded.has(next.trim().split("\n")[0].trim())) break;
        /*
         * AN EXAMPLE RUNS UNTIL IT HAS ITS WORKING, AND THE FIRST ORDINARY PARAGRAPH AFTER THAT ENDS
         * IT.
         *
         * Authors put one or two sentences of intent between the question and the answer: "The plan
         * is to use the sum formula", "Our plan is to discount each inflow". Stopping at the first
         * of them left the box holding a question it did not answer, on 33 of one course's 45
         * examples. Crossing them unconditionally is the opposite mistake: it swallows the closing
         * remark, the next subsection and everything after.
         *
         * What tells the two apart is whether this example has found its working YET. Before it has,
         * a sentence is crossed if working lies ahead of it; after it has, prose means the example
         * is over and the author's remark stays where they put it.
         */
        const reachesWorking = () => {
          for (let k = i + 1; k < paras.length && k <= i + 4; k += 1) {
            const p = paras[k];
            if (EXAMPLE.test(p) || folded.has(p.trim().split("\n")[0].trim())) return false;
            if (isWorking(p)) return true;
          }
          return false;
        };
        const continues =
          stepsAhead ||
          isWorking(next) ||
          /* One sentence of intent, anywhere in the example: prose, then working, is still it. */
          isWorking(paras[i + 2]) ||
          /* And a LONGER reach while the example has no working at all, because an author may take
             two or three sentences to get from the question to the first line of the answer. Once
             working has been seen this is off, so a closing remark ends the example. */
          (!run.some(isWorking) && reachesWorking());
        if (!continues) break;
        /*
         * A TABLE ENDS THE RUN, because a callout is ONE box and a table cannot be inside it.
         *
         * Lifting the table out and carrying on past it reorders the lecture: on a published course
         * the box ran "So, the first journal entry would be:", then "So, the second...", then "So,
         * the third...", and all three entries appeared after it in a row. A student read the first
         * colon and got two more paragraphs before any entry arrived.
         *
         * Nothing is lost by stopping. The paragraphs after the table stay where the author put
         * them, as prose, in source order, which is what they were before they were swallowed.
         */
        if (isTable(next)) {
          i += 1;
          tables.push(next);
          break;
        }
        i += 1;
        run.push(next);
      }

      /*
       * AN "EXAMPLES:" UMBRELLA IS A HEADING, NOT AN EXAMPLE. An author labels a group and numbers
       * the real ones under it, so this paragraph strips to nothing at all: it used to emit a
       * callout with an EMPTY BODY, which the write path refuses, and to swallow the first numbered
       * example's title on the way, leaving its equation standing as bare prose.
       */
      if (run.length === 1 && !run[0].replace(EXAMPLE, "").trim()) continue;

      /*
       * TWO EXAMPLES ARE ONE CALLOUT WHEN THE AUTHOR WROTE THEM AS TWO BULLETS, which is the shape
       * the no-two-callouts-may-touch rule is about. A STANDALONE example is its own, and claiming
       * it took only its lead: the paragraphs under it were left behind as prose, which dissolved a
       * five-step worked example on integration by substitution into a bare display line and a
       * heading. A sibling is a list item; anything else starts a new example.
       */
      const siblings = [];
      while (i + 1 < paras.length && EXAMPLE.test(paras[i + 1]) && LIST_ITEM.test(paras[i + 1]))
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
    if (s.heading !== null && IS_A_RECAP.test(s.heading) && out.every((b) => b.type === "prose")) {
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

    /*
     * TWO CALLOUTS OF ONE KIND MAY NOT TOUCH, so two that do become one box.
     *
     * Each keeps the author's own label, as a bold lead inside the merged body, because "Example 2:
     * Logarithm of a linear term" is how they told the reader which is which. The older merge did
     * this at the paragraph level and took only the following example's LEAD, leaving its working
     * outside; doing it on the finished blocks means each one arrives whole.
     */
    for (let k = out.length - 1; k > 0; k -= 1) {
      const here = out[k];
      const before = out[k - 1];
      if (here.type !== "callout" || before.type !== "callout") continue;
      if (here.variant !== before.variant) continue;
      const lead = (b, body) => (b.title && !/^Examples?$/i.test(b.title) ? `**${b.title}**\n\n${body}` : body);
      before.body = `${lead(before, before.body)}\n\n${lead(here, here.body)}`.trim();
      before.title = before.variant === "example" ? "Examples" : before.title;
      out.splice(k, 1);
    }

    /* The heading goes on the first block that can carry one, which is the first prose block. */
    const firstProse = out.find((b) => b.type === "prose");
    /* An opening run has no heading of its own, so it simply keeps its paragraphs. */
    if (s.heading && firstProse)
      firstProse.body = `${"#".repeat(s.level)} ${s.heading}\n\n${firstProse.body}`;
    else if (s.heading && !firstProse)
      out.unshift({
        type: "prose",
        body: `${"#".repeat(s.level)} ${s.heading}`,
      });

    for (const b of out) {
      if (b.type !== "prose") {
        blocks.push({ id: idFor(`${s.anchor ?? s.heading}-${b.type}`), ...b });
        continue;
      }
      for (const part of split(b.body))
        for (const piece of figuresOutOfProse(part))
          blocks.push({ id: idFor(s.anchor ?? s.heading), ...piece });
    }

    /* Then everything anchored to this section: the author's flags first, in their own words. */
    /*
     * BY OCCURRENCE, falling back to the name. The two passes agree on the order of headings, but a
     * repair that cuts a passage can take one out of the second, and a flag that finds no section is a
     * note of the author's that never reaches the page. Better in the wrong one of two same-named
     * sections than gone.
     */
    const byKey = flags.filter((f) => f.sectionKey === s.key);
    const orphaned = (f) => !sections.some((x) => x.key === f.sectionKey);
    const mine = byKey.length
      ? byKey
      : flags.filter((f) => f.section === s.heading && orphaned(f));
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
        /* A SUPPLIED TITLE WINS. It is the course saying this one is wrong, and the commonest
           reason to reach for it is that the line above the flag was taken as a heading when it
           was really the previous example's answer. An unused key is reported, so overriding
           nothing is never silent. */
        title: titleFor(f.lead) ?? f.title ?? DEFAULT_TITLE[f.variant],
        body: f.body,
      })),
      ...(EXTRA_TABLES[s.anchor] ?? []),
      ...(REPAIRS.worked?.[s.anchor] ?? []),
      ...(CHARTS[s.anchor] ?? []),
      ...(TERMS[s.anchor] ?? []),
      ...(CHECKS[s.anchor] ?? []),
    ];
    for (const b of anchored)
      blocks.push({ id: idFor(`${s.anchor}-${b.type}`), ...b });
  }

  /*
   * A CLOSING RECAP THE AUTHOR MARKED AS A BOLD LEAD-IN, not as a heading.
   *
   * The check above catches "In Short" when it is a SECTION. This house writes it as a bold paragraph
   * at the foot of the last section instead, where the lead-in rule then joins it to the summary that
   * follows, so the recap ends up as the tail of an ordinary prose block and reads as one more
   * paragraph of teaching. Its whole job is to look different from the teaching, so a reader revising
   * can find it. Lifted here, once the unit's blocks are settled, because only then is "last" known.
   */
  for (let i = blocks.length - 1; i >= 0; i -= 1) {
    const b = blocks[i];
    if (b.type !== "prose") continue;
    const paras = b.body.split("\n\n");
    const at = paras.findIndex((x) => RECAP_LEAD.exec(x.trim()));
    if (at < 0) break;
    const m = RECAP_LEAD.exec(paras[at].trim());
    const body = [m[2].trim(), ...paras.slice(at + 1)].filter(Boolean).join("\n\n");
    if (!body) break;
    const kept = paras.slice(0, at).join("\n\n").trim();
    if (kept) b.body = kept;
    else blocks.splice(i, 1);
    blocks.push({
      id: `u${number}-in-short`,
      type: "callout",
      variant: "in-short",
      title: "Smartly summarised",
      body,
    });
    break;
  }

  /*
   * THE LECTURE'S OWN PRACTICE, INSIDE THE LECTURE.
   *
   * A bank a student has to go and find is a bank most of them never open. The reader has a block that
   * draws from the unit's own bank, and a course whose every unit had ten questions shipped without one
   * on any of them. It names no question, so the draw stays adaptive and the calibration still counts.
   *
   * BEFORE THE CLOSING BOX, which is the last thing a reader should meet.
   */
  if (bankSize > 0) {
    const check = {
      id: `u${number}-check`,
      type: "question",
      count: Math.min(5, bankSize),
      title: "Check yourself",
      variant: "inline",
    };
    const closing = blocks.findIndex((b) => b.type === "callout" && b.variant === "in-short");
    if (closing < 0) blocks.push(check);
    else blocks.splice(closing, 0, check);
  }

  const unusedTitles = Object.keys(TITLES).filter((k) => !titlesUsed.has(k));
  if (unusedTitles.length)
    console.log(
      `   ! ${unusedTitles.length} supplied callout title(s) matched no flagged line:\n       ${unusedTitles.join("\n       ")}`,
    );

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
    /*
     * WHAT A STUDENT READS, from the unit's row in `composer.json`: its title without the designation the
     * document's heading carries ("Lecture · Week 1: ..."), the line under it, its number as read ("6b",
     * "1&2"), and the category it sits in. The platform prints the designation above the title from the other two, so a
     * title that kept it would say it twice. The address above stays the heading's, so settling these
     * words never moves a published lecture.
     */
    title: shown.title,
    ...(shown.subtitle !== null ? { subtitle: shown.subtitle } : {}),
    number: shown.number,
    ...(shown.series ? { series: shown.series } : {}),
    source,
    blocks,
    /*
     * SUPPLIED QUESTIONS WIN. A course that writes its bank in `course-data.mjs` has said what it
     * wants; the lift is for a document that carries them in its own text and would otherwise publish
     * them as prose.
     */
    questions: bank,
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

/*
 * A CONTENTS LIST IS NOT A LECTURE, AND GUESSING IS STILL NOT ALLOWED.
 *
 * Front matter is named on the record above, deliberately: a rename must never silently publish a page.
 * But a course that names none gets every heading 1 as a unit, and a document opening with its own
 * table of contents published one called "Table of contents", holding a list of page numbers, sitting
 * first in the syllabus. Nobody looked, because nothing said anything.
 *
 * So this does not skip it and does not guess. It REFUSES, and says the one line that fixes it. The
 * shape is unmistakable: a unit with no section of its own whose body is mostly lines ending in a page
 * number.
 */
const looksLikeContents = (u) => {
  const next = h1.find((x) => x.at > u.at);
  const body = allLines
    .slice(u.at + 1, next ? next.at : allLines.length)
    .filter((l) => l.trim());
  if (body.length < 5 || body.some((l) => /^#{2,6}\s/.test(l))) return false;
  const numbered = body.filter((l) => /\s\d{1,4}$/.test(l.trim())).length;
  return numbered / body.length > 0.7;
};
const contents = units.filter(looksLikeContents);
if (contents.length)
  fail(
    `"${contents[0].title}" is a table of contents, not a lecture: ${"" }its lines are headings followed by page ` +
      `numbers, and it would be published first in the syllabus.\n\n` +
      `Name it in composer.json so the record says so rather than this guessing:\n` +
      `  "structure": { "frontMatterTitles": [${contents.map((c) => JSON.stringify(c.title)).join(", ")}] }`,
  );

/*
 * A NUMBER AS READ is a whole number or text: "6b", "1&2", and "1.5" too, which JSON would otherwise carry
 * as the number 1.5 that the platform refuses.
 */
const shownNumberOf = (n) => (typeof n === "number" && !Number.isInteger(n) ? String(n) : n);

/* A build number is what everything supplied for a unit is filed under, so two units may never share one. */
const buildNumbers = (course.units ?? []).map((u) => u.number).filter((n) => n !== undefined);
const shared = [...new Set(buildNumbers.filter((n, i) => buildNumbers.indexOf(n) !== i))];
if (shared.length)
  fail(
    `composer.json gives build number ${shared.join(", ")} to more than one unit. Each unit's "number" is its ` +
      `own key, unique across the course; the number a student reads goes in "shownNumber".`,
  );

const built = units
  .map((u, idx) => {
    const next = h1.find((x) => x.at > u.at);
    const declaredUnit = course.units?.find((c) => c.title === u.title);
    const number = declaredUnit?.number ?? idx + 1;
    return {
      u,
      number,
      shown: {
        title: declaredUnit?.shownTitle ?? u.title,
        number: shownNumberOf(declaredUnit?.shownNumber ?? number),
        series: declaredUnit?.series ?? null,
        // A row that names a subtitle, even an empty one, sends it: an absent one leaves the page's as it is.
        subtitle: declaredUnit && "subtitle" in declaredUnit ? String(declaredUnit.subtitle ?? "") : null,
      },
      lines: allLines.slice(u.at, next ? next.at : allLines.length),
    };
  })
  .filter((t) => !wanted.length || wanted.includes(t.number))
  .map((t) => ({ key: t.number, topic: buildUnit(t.lines, t.number, t.u.title, t.shown) }));

if (!built.length) fail(`No unit matched --unit ${wanted.join(", ")}.`);
const topics = built.map((b) => b.topic);

/*
 * A COURSE'S CATEGORIES ARE DECLARED ONCE, in `structure.series`, with what one unit in each is called and
 * what several are: the platform refuses a unit naming a category the course does not declare, and prints
 * each one's name as the heading over its units. Only the ones a unit uses are sent.
 */
// An intake that answered "one" run of units records the word, not a list: that declares none.
const categories = Array.isArray(course.structure?.series) ? course.structure.series : [];
const usedCategories = [...new Set(topics.map((t) => t.series).filter(Boolean))];
const undeclared = usedCategories.filter((name) => !categories.find((s) => s.name === name)?.plural);
if (undeclared.length)
  fail(
    `A unit sits in ${undeclared.map((n) => `"${n}"`).join(", ")}, which composer.json does not declare with ` +
      `what several units in it are called (and, where it differs from the heading, what one is). Add it under ` +
      `structure.series:\n` +
      undeclared.map((n) => `  { "name": ${JSON.stringify(n)}, "unit": "...", "plural": "..." }`).join("\n"),
  );

const glossary = built.flatMap(({ key, topic }) =>
  forUnit("GLOSSARY", key, []).map((g) => ({
    ...g,
    topicSlug: topic.slug,
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
    ...(usedCategories.length
      ? {
          series: categories
            .filter((c) => usedCategories.includes(c.name))
            .map((c) => ({ name: c.name, unit: c.unit ?? c.name, plural: c.plural })),
        }
      : {}),
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

/*
 * A POSITION MARKER IS SCAFFOLDING, AND IT MUST NOT REACH A STUDENT.
 *
 * `docx.js` writes `[FIGURE:word/media/imageN.png]` where each picture sat, and the source of record is
 * what every fidelity rule diffs against — so a marker left in a body is agreed with by the verbatim
 * check, drawn as literal text on the page, and reported by nothing. The substitution is the operator's
 * step (`images.mjs` answers the markdown, Layout pastes it); this is the refusal that makes forgetting
 * it loud instead of silent.
 */
const withMarkers = [];
for (const t of topics) {
  for (const b of t.blocks) {
    for (const mk of String(b.body ?? "").matchAll(/\[FIGURE:([^\]]+)\]/g)) {
      withMarkers.push(`${t.slug ?? t.title} / ${b.id}: ${mk[1]}`);
    }
  }
}
if (withMarkers.length > 0) {
  fail(
    `${withMarkers.length} picture marker(s) are still in the text, and they would be drawn as literal ` +
      `text on the page:\n  ${withMarkers.slice(0, 8).join("\n  ")}` +
      (withMarkers.length > 8 ? `\n  ... and ${withMarkers.length - 8} more` : "") +
      `\n\nUpload the pictures (scripts/images.mjs), then replace each marker with the markdown the ` +
      `upload answered in <figures>.json.uploaded.json.`,
  );
}

const out = join(folder, "04-manifest", "manifest.json");
writeFileSync(out, `${JSON.stringify(manifest, null, 2)}\n`);
/* Each unit's address against its build number, for every later step (`unit-keys.mjs`). */
writeFileSync(
  join(folder, "04-manifest", UNIT_KEYS_FILE),
  `${JSON.stringify(Object.fromEntries(built.map(({ key, topic }) => [topic.slug, key])), null, 2)}\n`,
);

/* ── what the build says about itself ────────────────────────────────────────────────────────────── */

for (const { key, topic: t } of built) {
  const by = {};
  for (const b of t.blocks) by[b.type] = (by[b.type] ?? 0) + 1;
  const prose = t.blocks.filter((b) => b.type === "prose");
  // The build number first, because it is what every command takes; then the unit as a student reads it.
  console.log(`${key}. ${[t.series, t.number].filter((x) => x !== undefined).join(" ")}: ${t.title}`);
  console.log(
    `   ${t.blocks.length} blocks: ${Object.entries(by)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${v} ${k}`)
      .join(", ")}`,
  );
  console.log(
    `   ${t.questions.length} questions, ${glossary.filter((g) => g.topicSlug === t.slug).length} glossary terms, longest prose ${Math.max(0, ...prose.map((b) => words(b.body)))} words`,
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


