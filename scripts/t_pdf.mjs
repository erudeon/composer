/**
 * A scan and a readable page, told apart. The page's text is drawn inside a COMPRESSED content stream,
 * which is what every real writer produces and what the raw-bytes probe could never see.
 *
 *   node scripts/t_pdf.mjs
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import { execFileSync } from "node:child_process";

const dir = mkdtempSync(join(tmpdir(), "composer-pdf-"));

/** A one-page PDF whose content stream is `body`, Flate-compressed when `zip`, plus optional font. */
function pdf(name, body, { zip, font }) {
  const stream = zip ? deflateSync(Buffer.from(body)) : Buffer.from(body);
  const parts = [
    Buffer.from(
      "%PDF-1.7\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n" +
        "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
        `3 0 obj<</Type/Page/Parent 2 0 R${font ? "/Resources<</Font<</F1 5 0 R>>>>" : ""}/Contents 4 0 R>>endobj\n` +
        `4 0 obj<</Length ${stream.length}${zip ? "/Filter/FlateDecode" : ""}>>stream\n`,
    ),
    stream,
    Buffer.from(
      "\nendstream endobj\n" +
        (font ? "5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n" : "") +
        "trailer<</Root 1 0 R>>\n%%EOF\n",
    ),
  ];
  const path = join(dir, name);
  writeFileSync(path, Buffer.concat(parts));
  return path;
}

const DRAWN = "BT /F1 12 Tf 72 720 Td (Introduction to Mathematics) Tj ET";
const IMAGE_ONLY = "q 612 0 0 792 0 0 cm /Im0 Do Q";

pdf("readable-compressed.pdf", DRAWN, { zip: true, font: true });
pdf("readable-plain.pdf", DRAWN, { zip: false, font: true });
pdf("scan.pdf", IMAGE_ONLY, { zip: true, font: false });
pdf("scan-plain.pdf", IMAGE_ONLY, { zip: false, font: false });

// identify exits 1 when anything needs a person, and two of these four do. The output is the answer.
let out;
try {
  out = execFileSync(process.execPath, [new URL("./identify.mjs", import.meta.url).pathname, dir], {
    encoding: "utf8",
  });
} catch (err) {
  out = err.stdout ?? "";
}
const calledScan = (f) => new RegExp(`${f}[^]*?\\n\\n`).exec(out)?.[0].includes("no text layer") ?? false;

let failed = 0;
for (const [file, expected] of [
  ["readable-compressed.pdf", false],
  ["readable-plain.pdf", false],
  ["scan.pdf", true],
  ["scan-plain.pdf", true],
]) {
  const got = calledScan(file);
  if (got !== expected) failed++;
  console.log(`${got === expected ? "ok  " : "FAIL"} ${file} ${expected ? "is" : "is not"} a scan`);
}
process.exit(failed ? 1 : 0);
