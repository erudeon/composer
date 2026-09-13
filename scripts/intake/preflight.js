/**
 * STEP 1 OF EVERY INTAKE, as one command: is this file what its name claims, is it complete, and what
 * is going to bite when you parse it.
 *
 *   node scripts/intake/preflight.js "<file>" ["<file>" ...]
 *
 * Every finding here has already shipped or nearly shipped a broken course:
 *
 *  - A `.docx` that begins `%PDF`. Four source files arrived on 7 September and TWO were PDFs wearing a
 *    .docx extension. The pipeline refuses PDF as a source, so the extension is not cosmetic — it
 *    decides whether the file is accepted at all.
 *  - A file that stops early and says so only in its own footer. One `.docx` ended mid-answer-key at
 *    "Pagina 80 van 82" while its PDF twin was complete, so NEITHER file was sufficient alone: the DOCX
 *    carried the bold that marks every key term, and only the PDF carried the last two pages. Nothing in
 *    the toolchain would have said so. An earlier course lost a whole theme and its entire answer key
 *    this way.
 *  - Dashes counted together. `no-em-dash` is an ERROR and every em dash must go, but the en dashes are
 *    page and number ranges and must SURVIVE — a blanket dash strip corrupts every one of them.
 *  - Soft hyphens (U+2010 before whitespace) left by the PDF layout: `uncon‐ scious`, `dy‐ namics`.
 *    They must be rejoined, and a blanket rejoin on an earlier course ate a real hyphen and produced
 *    `distressmaintaining`, so the count is reported and the judgement stays with a person.
 *  - Literal asterisks in the SOURCE. Two published courses shipped hundreds of `**term**`; knowing the
 *    source started at zero is what proves the pipeline introduced them.
 *
 * Dependency-free on purpose: this runs before anything is installed, on a file somebody just sent.
 */
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

/** What the first bytes actually say the file is, whatever it is called. */
function sniff(buf) {
  if (buf.length >= 4 && buf.toString("latin1", 0, 4) === "%PDF") return "pdf";
  if (buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) return "zip";
  if (buf.length >= 8 && buf.toString("hex", 0, 8) === "d0cf11e0a1b11ae1") return "doc";
  return "unknown";
}

/**
 * `word/document.xml` out of a .docx, without a zip library.
 *
 * Reads the end-of-central-directory record backwards, which is the only reliable way in: a local file
 * header may carry zeroed sizes when the writer streamed the entry, and Word does exactly that.
 */
function documentXml(buf) {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) return null;
  const count = buf.readUInt16LE(eocd + 10);
  let at = buf.readUInt32LE(eocd + 16);
  for (let i = 0; i < count; i += 1) {
    if (buf.readUInt32LE(at) !== 0x02014b50) return null;
    const method = buf.readUInt16LE(at + 10);
    const compressed = buf.readUInt32LE(at + 20);
    const nameLen = buf.readUInt16LE(at + 28);
    const extraLen = buf.readUInt16LE(at + 30);
    const commentLen = buf.readUInt16LE(at + 32);
    const localAt = buf.readUInt32LE(at + 42);
    const name = buf.toString("latin1", at + 46, at + 46 + nameLen);
    if (name === "word/document.xml") {
      // The LOCAL header's own name and extra lengths, which differ from the central directory's.
      const localNameLen = buf.readUInt16LE(localAt + 26);
      const localExtraLen = buf.readUInt16LE(localAt + 28);
      const from = localAt + 30 + localNameLen + localExtraLen;
      const bytes = buf.subarray(from, from + compressed);
      try {
        return method === 0 ? bytes.toString("utf8") : zlib.inflateRawSync(bytes).toString("utf8");
      } catch {
        return null;
      }
    }
    at += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

/** Every "Page 7 of 81" / "Pagina 7 van 81" in the text, in both languages and either order. */
function footerPages(text) {
  const seen = [];
  let total = null;
  const re = /\b(?:page|pagina|blz\.?)\s*(\d{1,4})\s*(?:of|van|\/)\s*(\d{1,4})\b/gi;
  let m;
  while ((m = re.exec(text))) {
    seen.push(Number(m[1]));
    total = Number(m[2]);
  }
  return { highest: seen.length ? Math.max(...seen) : null, total, count: seen.length };
}

function countOf(text, re) {
  return (text.match(re) ?? []).length;
}

function report(file) {
  const buf = fs.readFileSync(file);
  const ext = path.extname(file).toLowerCase();
  const actual = sniff(buf);
  const claimed = ext === ".docx" ? "zip" : ext === ".pdf" ? "pdf" : ext === ".doc" ? "doc" : "text";

  const lines = [];
  lines.push(`\n${path.basename(file)}  (${(buf.length / 1024).toFixed(0)} KB)`);

  if (actual !== claimed) {
    lines.push(
      `  ! WRONG TYPE: named ${ext || "(no extension)"} but the bytes say ${actual.toUpperCase()}.` +
        (actual === "pdf" ? " PDF is REFUSED as a source. Go and find the real .docx: a wrong file has cost hours before." : ""),
    );
  } else {
    lines.push(`  type: ${actual}, matching its extension`);
  }

  // The text to census: a .docx's document.xml, or the file itself when it is already text.
  let text = null;
  let xml = null;
  if (actual === "zip") {
    xml = documentXml(buf);
    if (xml === null) lines.push("  ! could not read word/document.xml — unzip it by hand and census that");
    else text = xml.replace(/<[^>]+>/g, "");
  } else if (actual === "unknown") {
    text = buf.toString("utf8");
  }

  if (text !== null) {
    const pages = footerPages(text);
    if (pages.total !== null && pages.highest !== null) {
      const short = pages.total - pages.highest;
      lines.push(
        short > 0
          ? `  ! TRUNCATED: the footer runs to page ${pages.highest} and says "of ${pages.total}" — ${short} page(s) missing`
          : `  pages: ${pages.highest} of ${pages.total}, complete`,
      );
    } else {
      lines.push("  pages: no running footer found, so completeness cannot be checked from the file");
    }

    lines.push(
      `  dashes: ${countOf(text, /—/g)} em (U+2014, ALL must go) / ` +
        `${countOf(text, /–/g)} en (U+2013, these are ranges — KEEP them)`,
    );
    const soft = countOf(text, /‐\s/g);
    if (soft > 0) lines.push(`  ! ${soft} soft hyphen(s) (U+2010 + space) to rejoin — check each, never blanket`);
    const stars = countOf(text, /\*/g);
    lines.push(
      stars === 0
        ? "  asterisks: none, so any in the uploaded course were introduced by the pipeline"
        : `  ! ${stars} literal asterisk(s) already in the source`,
    );
  }

  if (xml !== null) {
    const styles = countOf(xml, /<w:pStyle\b/g);
    const paras = countOf(xml, /<w:p[\s>]/g);
    lines.push(
      styles === 0
        ? `  ! NO heading styles across ${paras} paragraphs — every level must come from run colour and size (docx2.js, not docx.js)`
        : `  heading styles: ${styles} <w:pStyle> across ${paras} paragraphs`,
    );
    const tables = countOf(xml, /<w:tbl>/g);
    lines.push(
      tables === 0
        ? "  ! no <w:tbl> elements — anything that LOOKS like a table is a text frame and must be rebuilt by hand"
        : `  tables: ${tables} real <w:tbl> — extract with docx.js, never from the paragraph stream`,
    );
    const lists = countOf(xml, /<w:numPr>/g);
    lines.push(
      lists === 0
        ? "  ! no <w:numPr> — bullets and numbers are literal text, so markers arrive orphaned from their items"
        : `  lists: ${lists} numbered/bulleted paragraphs carrying real <w:numPr>`,
    );
  }

  return lines.join("\n");
}

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('usage: node scripts/intake/preflight.js "<file>" ["<file>" ...]');
  process.exit(1);
}
for (const file of files) {
  try {
    console.log(report(file));
  } catch (err) {
    console.log(`\n${path.basename(file)}\n  ! could not read: ${err.message}`);
  }
}
console.log("\nA line beginning ! is something to settle before you parse a word of it.\n");
