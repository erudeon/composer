/**
 * `open-docx.js` — TURN A `.docx` INTO A WORKING FOLDER, and enumerate every drawing in it.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────────────────────────────
 *
 * `docx.js` reads `word/document.xml` and emits text with the equations as LaTeX. It is good at that and
 * it does two things it never claimed to do: it does not accept a `.docx` (it wants the inner XML, which
 * means somebody has to unzip first and nothing said so), and it never looks at a picture. A maths
 * summary is mostly pictures of graphs, and Intake's gate is that EVERY drawing has a disposition. So
 * without this, the phase cannot close on any real document.
 *
 * ── WHY `unzip` AND NOT A ZIP LIBRARY ────────────────────────────────────────────────────────────────
 *
 * A `.docx` is a zip. `unzip` ships on macOS and on every Linux box this will ever run on, and adding a
 * dependency to read an archive format the operating system already reads would be a dependency to
 * maintain forever. If a Windows operator ever appears, this is the one line that changes.
 *
 * ── WHAT A DRAWING IS, HERE ──────────────────────────────────────────────────────────────────────────
 *
 * Three different things in the XML, and a summary written by a student contains all three:
 *
 *   - `<a:blip r:embed="rIdN">`  an embedded picture. The relationship file maps rIdN to a file under
 *                                `word/media/`, which is the only place the bytes are.
 *   - `<wps:wsp>` / `<w:txbxContent>`  a floating text box. These carry equations and captions, they are
 *                                anchored to whatever paragraph they happen to sit near, and they are one
 *                                of the two defects no text diff can see.
 *   - `<v:shape>` / `<w:drawing>` with no blip  a drawn shape: a circle or an arrow over the text. The
 *                                other defect no text diff can see, because the text is identical with
 *                                and without it.
 *
 * Each one is reported with the heading it falls under, because a disposition is a judgement about a
 * drawing IN ITS PLACE: the same graph is a `chart` where the prose states its function and a `figure`
 * where it does not.
 *
 * ── IT CLASSIFIES, IT DOES NOT DECIDE ────────────────────────────────────────────────────────────────
 *
 * Every entry comes out with `disposition: null`. Choosing between chart, figure, retype, fold and drop
 * is the operator's, made against the prose, and a script that guessed would be making the one call the
 * pipeline exists to keep honest.
 */
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { headingLevels } = require("./docx-core.js");
const { unsafeToUnpack } = require("./docx-zip.js");

/** Unzip a `.docx` into `dir`, which is created if it is not there. Returns `dir`. */
function unpack(docxPath, dir) {
  if (!fs.existsSync(docxPath)) throw new Error(`no such file: ${docxPath}`);
  /*
   * "PK" is the zip local-file-header magic, and a `.docx` is a zip. THE EXTENSION IS NOT EVIDENCE: two
   * of four files on one real upload were PDFs wearing a `.docx`, and the second document this script was
   * ever pointed at turned out to be one. Reading four bytes costs nothing; the alternative is a parse
   * that produces plausible garbage from a file nobody checked.
   */
  const bytes = fs.readFileSync(docxPath);
  const head = bytes.subarray(0, 4).toString("latin1");
  if (!head.startsWith("PK")) {
    const looksLike = head.startsWith("%PDF") ? "a PDF" : "not an Office file";
    throw new Error(
      `${docxPath} is ${looksLike}, whatever it is named. Run preflight.js on it, then go and find the ` +
        `real file: PDF is refused as a SOURCE, and a wrong file has cost hours before it was opened.`,
    );
  }
  /*
   * THE ARCHIVE IS SOMEBODY ELSE'S FILE, AND `unzip` DOES WHAT IT IS TOLD.
   *
   * The central directory declares what will be written before anything is, so a bomb and a traversal
   * are both answerable without decompressing a byte. Refused here rather than relied on from unzip:
   * Info-ZIP does refuse a traversal, and "the tool we happen to shell out to refuses it" is not a
   * property this repo controls.
   */
  const unsafe = unsafeToUnpack(bytes);
  if (unsafe) {
    throw new Error(
      `${path.basename(docxPath)} was not unpacked: ${unsafe}\n` +
        `Nothing was written. If this really is a document somebody meant to send, open it in Word and ` +
        `save a fresh copy, then try that.`,
    );
  }

  fs.mkdirSync(dir, { recursive: true });
  /*
   * `--` ends the option list, so a file called `-d` or `-x` is read as a path and not as a flag.
   * No shell is involved either way: execFileSync passes an argument array.
   */
  execFileSync("unzip", ["-o", "-q", "--", docxPath, "-d", dir], {
    stdio: ["ignore", "ignore", "pipe"],
  });
  return dir;
}

/** rId -> the file it points at, from `word/_rels/document.xml.rels`. */
function relationships(dir) {
  const relsPath = path.join(dir, "word", "_rels", "document.xml.rels");
  if (!fs.existsSync(relsPath)) return {};
  const xml = fs.readFileSync(relsPath, "utf8");
  const out = {};
  for (const m of xml.matchAll(/<Relationship\b[^>]*\/?>/g)) {
    const id = /Id="([^"]+)"/.exec(m[0])?.[1];
    const target = /Target="([^"]+)"/.exec(m[0])?.[1];
    if (id && target) out[id] = target.replace(/^\.\.\//, "");
  }
  return out;
}

/**
 * The text of a fragment: BOTH `<w:t>` runs and `<m:t>` runs, in document order.
 *
 * An equation is not made of `<w:r>` runs, so reading only `<w:t>` drops every symbol INSIDE a heading
 * or a text box. On a real maths summary that produced labels like "Find the values of  for which:"
 * and "All power functions satisfy , since  for any value of ." -- gaps exactly where the mathematics
 * was. Those labels are what a person reads to decide what a picture becomes, and what the proposal
 * script matches against to find the function a chart would be drawn from, so the gaps cost twice.
 */
function textOf(fragment) {
  return [...fragment.matchAll(/<(?:w|m):t\b[^>]*>([\s\S]*?)<\/(?:w|m):t>/g)]
    .map((m) => m[1])
    .join("")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

/**
 * Every drawing in the document, in document order, each with the heading above it.
 *
 * The scan walks PARAGRAPHS rather than the whole file at once, because position is what makes an entry
 * actionable: "a picture" is not a finding, "the picture under 3.2 Monotonicity" is.
 */
function drawings(dir) {
  const xml = fs.readFileSync(path.join(dir, "word", "document.xml"), "utf8");
  const rels = relationships(dir);
  /*
   * WHAT COUNTS AS A HEADING IS ASKED ONCE, AND `docx-core.js` OWNS THE ANSWER.
   *
   * This used to match `w:val="Heading\d|Title"` literally. A Hungarian Word calls its heading styles
   * `Cmsor1`, so on that document nothing here was a heading and every drawing fell through to the
   * guess below: each one labelled with whatever line of prose happened to precede it. Plausible,
   * wrong, and silent, which is the worst of the three.
   */
  const stylesPath = path.join(dir, "word", "styles.xml");
  const levels = headingLevels(
    fs.existsSync(stylesPath) ? fs.readFileSync(stylesPath, "utf8") : null,
  );
  /*
   * THE PROSE FALLBACK IS A FALLBACK, WHICH IT WAS NOT.
   *
   * Labelling a drawing with the last line of prose above it was meant for a document with no heading
   * styles at all. It ran on EVERY paragraph, so on a document full of real headings the nearest
   * sentence always overwrote the heading and no drawing was ever labelled with one. The inventory
   * read "the picture under `Find the values of x for which:`" where it should have read "under
   * `3.2 Monotonicity`", and a disposition is a judgement about a drawing IN ITS PLACE.
   */
  const usesHeadings = [...levels.keys()].some(
    (id) => levels.get(id) != null && xml.includes(`w:pStyle w:val="${id}"`),
  );

  const found = [];
  let heading = null;
  let index = 0;

  /*
   * ONE PASS OVER THE DOCUMENT, IN ORDER, rather than a walk over paragraph-shaped chunks.
   *
   * The paragraph version matched `<w:p ...>…</w:p>` non-greedily, so a paragraph containing a nested
   * one (a text box, a table cell) ended at the first closing tag and everything after it was skipped;
   * and it `continue`d past any heading, so a picture sitting IN a heading was never seen at all.
   * Measured on a real 4.9 MB maths summary: 53 content images in the file, 32 found. Twenty-one
   * figures, silently absent from the inventory that is Intake's gate.
   *
   * Scanning for the things themselves keeps document order without needing to know where paragraphs
   * begin, which is the part that was never reliable.
   */
  const TOKEN =
    /<w:pStyle\b[^>]*w:val="([^"]+)"[^>]*\/>|<w:p\b[^>]*>|<\/w:p>|<a:blip\b[^>]*r:embed="([^"]+)"|<w:txbxContent\b|<v:shape\b|<wps:wsp\b/g;

  let paraStart = -1;
  let paraIsHeading = false;

  for (const m of xml.matchAll(TOKEN)) {
    const tok = m[0];
    if (tok.startsWith("<w:p ") || tok === "<w:p>") {
      paraStart = m.index + tok.length;
      paraIsHeading = false;
    } else if (tok.startsWith("<w:pStyle")) {
      // Every paragraph carries a style; only the ones resolving to a level are headings.
      paraIsHeading = levels.get(m[1]) != null;
    } else if (tok === "</w:p>") {
      // A heading's text is only knowable once the paragraph closes, and it labels what comes AFTER it.
      if (paraIsHeading && paraStart !== -1) {
        const text = textOf(xml.slice(paraStart, m.index));
        if (text) heading = text;
      } else if (paraStart !== -1 && !usesHeadings) {
        const text = textOf(xml.slice(paraStart, m.index));
        // A line with real words stands in ONLY where a document carries no heading styles at all.
        if (text && /[A-Za-z]{3}/.test(text))
          heading = text.length > 90 ? `${text.slice(0, 90)}...` : text;
      }
      paraStart = -1;
      paraIsHeading = false;
    } else if (tok.startsWith("<a:blip")) {
      const target = rels[m[2]];
      const abs = target ? path.join(dir, "word", target) : null;
      found.push({
        index: index++,
        kind: "picture",
        under: heading,
        file: target ? path.posix.join("word", target) : null,
        bytes: abs && fs.existsSync(abs) ? fs.statSync(abs).size : null,
        text: null,
        disposition: null,
      });
    } else if (tok === "<w:txbxContent") {
      found.push({ index: index++, kind: "textbox", under: heading, file: null, bytes: null, text: null, disposition: null });
    } else {
      found.push({ index: index++, kind: "shape", under: heading, file: null, bytes: null, text: null, disposition: null });
    }
  }

  return found;
}

/**
 * Every CONTENT file under `word/media/`, so a picture the document references from nowhere is still
 * seen. Word's `.wdp` HD Photo copies are excluded: it writes one beside each real picture as an
 * alternate format, and on a real summary 45 of the 98 files were those, which buried the ones that
 * actually had no reference.
 */
function mediaFiles(dir) {
  const mediaDir = path.join(dir, "word", "media");
  if (!fs.existsSync(mediaDir)) return [];
  return fs
    .readdirSync(mediaDir)
    .filter((name) => !/\.wdp$/i.test(name))
    .sort()
    .map((name) => ({
      file: path.posix.join("word", "media", name),
      bytes: fs.statSync(path.join(mediaDir, name)).size,
    }));
}

module.exports = { unpack, relationships, drawings, mediaFiles, textOf };

if (require.main === module) {
  const [, , docx, outDir] = process.argv;
  if (!docx || !outDir) {
    console.error("usage: node open-docx.js <file.docx> <out-dir>");
    process.exit(2);
  }
  /*
   * A REFUSAL IS AN ANSWER, NOT A CRASH. Every reason this stops is one an operator can act on: a PDF
   * wearing a .docx name, an archive that would unpack to a gigabyte, an entry pointing out of its
   * folder. A stack trace buries all three under a line number in somebody else's code.
   */
  let dir;
  try {
    dir = unpack(docx, outDir);
  } catch (err) {
    console.error(`\n${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(2);
  }
  const list = drawings(dir);
  const media = mediaFiles(dir);

  const referenced = new Set(list.filter((d) => d.file).map((d) => d.file));
  const orphans = media.filter((m) => !referenced.has(m.file));

  const inventory = {
    source: path.resolve(docx),
    unpackedTo: path.resolve(dir),
    documentXml: path.join(path.resolve(dir), "word", "document.xml"),
    counts: {
      pictures: list.filter((d) => d.kind === "picture").length,
      textboxes: list.filter((d) => d.kind === "textbox").length,
      shapes: list.filter((d) => d.kind === "shape").length,
      mediaFiles: media.length,
      unreferencedMedia: orphans.length,
    },
    drawings: list,
    unreferencedMedia: orphans,
  };

  fs.writeFileSync(
    path.join(dir, "media-inventory.json"),
    `${JSON.stringify(inventory, null, 2)}\n`,
  );
  console.log(JSON.stringify(inventory.counts, null, 2));
  console.log(
    `\ninventory: ${path.join(path.resolve(dir), "media-inventory.json")}`,
  );
  console.log(`document:  ${inventory.documentXml}`);
  console.log(
    `\nEvery drawing has disposition: null. Assigning them is Intake's gate and the author's call.`,
  );
}
