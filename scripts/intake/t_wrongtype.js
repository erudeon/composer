/**
 * A FILE THAT IS NOT WHAT ITS NAME CLAIMS STOPS THE RUN.
 *
 * `preflight.js` has printed "WRONG TYPE: named .docx but the bytes say JPEG" for as long as it has
 * existed, and exited 0 while doing it. So the end-to-end check reported "ok preflight passes the
 * document", handed the photograph to `open-docx.js`, which refused it correctly, and then died reading
 * an inventory that refusal had never written. The operator saw an ENOENT stack trace; the one sentence
 * that said what was actually wrong was printed two steps earlier and thrown away.
 *
 * A JPEG and a PDF have both sat under a `.docx` name in a real course folder, which is why the line
 * exists at all.
 *
 * ONLY the wrong-type finding refuses. Literal asterisks, a missing `<w:numPr>` and a soft hyphen are
 * things worth knowing about a document that can still be read, and failing on those would refuse
 * almost every real summary and teach everybody to ignore the exit code.
 *
 *   node scripts/intake/t_wrongtype.js
 */
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const { mkdtempSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");

const dir = mkdtempSync(join(tmpdir(), "composer-wrongtype-"));
const preflight = join(__dirname, "preflight.js");
const run = (file) => spawnSync("node", [preflight, file], { encoding: "utf8" });

/* A JPEG named .docx. The first bytes are all the sniffer reads. */
const jpeg = join(dir, "summary.docx");
writeFileSync(jpeg, Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(600, 0x20)]));
const asJpeg = run(jpeg);
assert.match(asJpeg.stdout, /WRONG TYPE/, `it must still say so:\n${asJpeg.stdout}`);
assert.notStrictEqual(
  asJpeg.status,
  0,
  `a photograph named .docx must REFUSE, not report:\n${asJpeg.stdout}${asJpeg.stderr}`,
);

/* A PDF named .docx, the other one that has really happened. */
const pdf = join(dir, "notes.docx");
writeFileSync(pdf, Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(600, 0x20)]));
const asPdf = run(pdf);
assert.notStrictEqual(asPdf.status, 0, "a PDF named .docx must refuse too");

/* A plain text file named .md is exactly what it claims, whatever else the report says about it. */
const md = join(dir, "notes.md");
writeFileSync(
  md,
  "# A unit\n\nA line with a literal asterisk 5 * 3 and a soft hyphen uncon‐ scious in it.\n",
);
const text = run(md);
assert.strictEqual(
  text.status,
  0,
  `an advisory finding must not refuse a readable file:\n${text.stdout}${text.stderr}`,
);

console.log("ok  preflight refuses a file whose bytes are not what its name claims, and only that");
