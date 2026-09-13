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

/** Unzip a `.docx` into `dir`, which is created if it is not there. Returns `dir`. */
function unpack(docxPath, dir) {
  if (!fs.existsSync(docxPath)) throw new Error(`no such file: ${docxPath}`);
  /*
   * "PK" is the zip local-file-header magic, and a `.docx` is a zip. THE EXTENSION IS NOT EVIDENCE: two
   * of four files on one real upload were PDFs wearing a `.docx`, and the second document this script was
   * ever pointed at turned out to be one. Reading four bytes costs nothing; the alternative is a parse
   * that produces plausible garbage from a file nobody checked.
   */
  const head = fs.readFileSync(docxPath).subarray(0, 4).toString("latin1");
  if (!head.startsWith("PK")) {
    const looksLike = head.startsWith("%PDF") ? "a PDF" : "not an Office file";
    throw new Error(
      `${docxPath} is ${looksLike}, whatever it is named. Run preflight.js on it, then go and find the ` +
        `real file: PDF is refused as a SOURCE, and a wrong file has cost hours before it was opened.`,
    );
  }
  fs.mkdirSync(dir, { recursive: true });
  execFileSync("unzip", ["-o", "-q", docxPath, "-d", dir], {
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

/** The `<w:t>` runs of a fragment, joined. Used for a heading's text and a text box's contents. */
function textOf(fragment) {
  return [...fragment.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)]
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
  const found = [];
  let heading = null;
  let index = 0;

  for (const para of xml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)) {
    const p = para[0];

    /*
     * Word marks a heading with a paragraph style. A GOOGLE DOCS EXPORT CARRIES NONE -- which is why
     * `docx.js` falls back to run colour and size -- and a drawing with no context cannot be given a
     * disposition, because "a picture" is not something an operator can decide about while "the picture
     * under 3.2" is. So where there is no style, the nearest preceding prose stands in. It is a worse
     * label and it is never absent, which is the trade that matters: the alternative is a null on every
     * drawing in every document a student actually wrote.
     */
    const style = /<w:pStyle\b[^>]*w:val="([^"]*)"/.exec(p)?.[1];
    if (style && /^Heading\d|^Title$/i.test(style)) {
      heading = textOf(p) || heading;
      continue;
    }
    const prose = textOf(p);
    // At least one real word, so a code fence, a bullet glyph or a row of dashes never becomes a label.
    if (
      prose &&
      /[A-Za-z]{3}/.test(prose) &&
      !/<a:blip\b|w:txbxContent|<v:shape\b|<wps:wsp\b/.test(p)
    ) {
      heading = prose.length > 90 ? `${prose.slice(0, 90)}...` : prose;
      continue;
    }

    const blips = [...p.matchAll(/<a:blip\b[^>]*r:embed="([^"]+)"/g)];
    for (const b of blips) {
      const target = rels[b[1]];
      found.push({
        index: index++,
        kind: "picture",
        under: heading,
        file: target ? path.posix.join("word", target) : null,
        bytes:
          target && fs.existsSync(path.join(dir, "word", target))
            ? fs.statSync(path.join(dir, "word", target)).size
            : null,
        text: null,
        disposition: null,
      });
    }

    for (const box of p.matchAll(
      /<w:txbxContent\b[\s\S]*?<\/w:txbxContent>/g,
    )) {
      found.push({
        index: index++,
        kind: "textbox",
        under: heading,
        file: null,
        bytes: null,
        text: textOf(box[0]) || null,
        disposition: null,
      });
    }

    // A shape with no picture and no text box is a drawn mark over the prose: a circle, an arrow, a line.
    if (
      blips.length === 0 &&
      !/w:txbxContent/.test(p) &&
      /<v:shape\b|<wps:wsp\b/.test(p)
    ) {
      found.push({
        index: index++,
        kind: "shape",
        under: heading,
        file: null,
        bytes: null,
        text: null,
        disposition: null,
      });
    }
  }

  return found;
}

/** Every file under `word/media/`, so a picture the document references from nowhere is still seen. */
function mediaFiles(dir) {
  const mediaDir = path.join(dir, "word", "media");
  if (!fs.existsSync(mediaDir)) return [];
  return fs
    .readdirSync(mediaDir)
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
  const dir = unpack(docx, outDir);
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
    `\nEvery drawing has disposition: null. Assigning them is Intake's gate and the operator's call.`,
  );
}
