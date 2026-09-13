const fs = require("fs");
const { ommlToLatex } = require("./omml.js");

/*
 * WHAT THE IMPORTER READS MATHS AS (`lib/passos/authoring/serialize.ts`). Inline is a single dollar
 * with a NON-SPACE either side, which is Pandoc's rule and the reason nothing here pads the latex;
 * display is a doubled one on its own line.
 */
const INLINE = String.fromCharCode(36);
const DISPLAY_OPEN = INLINE + INLINE;
const xml = fs.readFileSync(process.argv[2], "utf8");
function unesc(s) {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}
const body = xml.slice(xml.indexOf("<w:body>"));
// split into block-level elements: paragraphs and tables
const out = [];
const blockRe = /<w:p\b[\s\S]*?<\/w:p>|<w:p\b[^>]*\/>|<w:tbl>[\s\S]*?<\/w:tbl>/g;
let m;
function paraText(p) {
  let t = "";
  /*
   * AN EQUATION IS NOT MADE OF `<w:r>` RUNS, which is why every one of them used to vanish here without
   * a word. Word writes maths as `<m:oMath>` full of `<m:r>`/`<m:t>`, and `<w:r\b` matches neither -- so
   * the extractor read a formula sheet, found no formulas, and reported a clean parse. Measured on the
   * two accounting sources: 127 equations in the formula sheet and 109 in the summary.
   *
   * MATCHED IN THE SAME PASS AS THE RUNS, never in a second sweep, so an equation sitting mid-sentence
   * comes out where it actually is rather than appended to the end of the paragraph. The oMath branch is
   * FIRST in the alternation because it swallows its own contents: a run inside an equation must not be
   * picked up again and printed twice.
   */
  const runRe = /<m:oMath\b[\s\S]*?<\/m:oMath>|<w:r\b[\s\S]*?<\/w:r>|<w:br\b[^>]*\/>|<w:tab\b[^>]*\/>/g;
  /*
   * DISPLAY OR INLINE, decided by the paragraph rather than by the equation. Word wraps a standalone
   * equation in `<m:oMathPara>`, which is the only thing separating "this formula is the paragraph"
   * from "this formula is a phrase in a sentence" -- and the two take different delimiters on the way
   * into the importer.
   */
  const display = /<m:oMathPara\b/.test(p);
  let r;
  while ((r = runRe.exec(p))) {
    const rs = r[0];
    if (/^<m:oMath/.test(rs)) {
      const latex = ommlToLatex(rs.replace(/^<m:oMath\b[^>]*>/, "").replace(/<\/m:oMath>$/, ""));
      // An equation that renders to nothing is one Word left empty. An empty pair of delimiters is a
      // parse error downstream and says less than saying nothing at all.
      if (latex) t += display ? DISPLAY_OPEN + latex + DISPLAY_OPEN : INLINE + latex + INLINE;
      continue;
    }
    if (/^<w:br/.test(rs)) {
      t += "\n";
      continue;
    }
    if (/^<w:tab/.test(rs)) {
      t += "\t";
      continue;
    }
    const rPr = (rs.match(/<w:rPr>[\s\S]*?<\/w:rPr>/) || [""])[0];
    const b = /<w:b\b(?![^>]*w:val="(0|false)")/.test(rPr);
    const i = /<w:i\b(?![^>]*w:val="(0|false)")/.test(rPr);
    let txt = "";
    const tRe = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>|<w:br\b[^>]*\/>|<w:tab\b[^>]*\/>/g;
    let tm;
    while ((tm = tRe.exec(rs))) {
      if (tm[1] !== undefined) txt += unesc(tm[1]);
      else if (/^<w:br/.test(tm[0])) txt += "\n";
      else txt += "\t";
    }
    if (!txt) continue;
    if (b && i) txt = "***" + txt + "***";
    else if (b) txt = "**" + txt + "**";
    else if (i) txt = "*" + txt + "*";
    t += txt;
  }
  return t.replace(/\*\*\*\*/g, "").replace(/\*\*(\s*)\*\*/g, "$1");
}
while ((m = blockRe.exec(body))) {
  const blk = m[0];
  if (blk.startsWith("<w:tbl")) {
    out.push("[[TABLE]]");
    const rowRe = /<w:tr\b[\s\S]*?<\/w:tr>/g;
    let rw;
    while ((rw = rowRe.exec(blk))) {
      const cellRe = /<w:tc>[\s\S]*?<\/w:tc>/g;
      let cl;
      let cells = [];
      while ((cl = cellRe.exec(rw[0]))) {
        const ps = cl[0].match(/<w:p\b[\s\S]*?<\/w:p>/g) || [];
        cells.push(ps.map(paraText).join(" ").trim());
      }
      out.push("| " + cells.join(" | ") + " |");
    }
    out.push("[[/TABLE]]");
    continue;
  }
  const pPr = (blk.match(/<w:pPr>[\s\S]*?<\/w:pPr>/) || [""])[0];
  const style = (pPr.match(/<w:pStyle w:val="([^"]*)"/) || [])[1] || "";
  const numId = (pPr.match(/<w:numId w:val="([^"]*)"/) || [])[1];
  const ilvl = (pPr.match(/<w:ilvl w:val="([^"]*)"/) || [])[1] || "0";
  const outline = (pPr.match(/<w:outlineLvl w:val="([^"]*)"/) || [])[1];
  const szM = pPr.match(/<w:sz w:val="([^"]*)"/) || [];
  let t = paraText(blk);
  if (!t.trim()) {
    out.push("");
    continue;
  }
  let pre = "";
  if (style) pre = "{" + style + (outline !== undefined ? "/ol" + outline : "") + "} ";
  else if (outline !== undefined) pre = "{ol" + outline + "} ";
  if (numId) pre += "• ".repeat(1 + +ilvl);
  out.push(pre + t);
}
fs.writeFileSync(process.argv[3], out.join("\n"));
console.log("blocks", out.length);
