const fs = require("fs");
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
const out = [];
const blockRe = /<w:p\b[\s\S]*?<\/w:p>|<w:tbl>[\s\S]*?<\/w:tbl>/g;
let m;
function runs(p) {
  const res = [];
  const runRe = /<w:r\b[\s\S]*?<\/w:r>/g;
  let r;
  while ((r = runRe.exec(p))) {
    const rs = r[0];
    const rPr = (rs.match(/<w:rPr>[\s\S]*?<\/w:rPr>/) || [""])[0];
    const b = /<w:b\b(?![^>]*w:val="(0|false)")/.test(rPr);
    const i = /<w:i\b(?![^>]*w:val="(0|false)")/.test(rPr);
    const sz = +((rPr.match(/<w:sz w:val="(\d+)"/) || [])[1] || 0) / 2;
    const col = (rPr.match(/<w:color w:val="([^"]*)"/) || [])[1] || "";
    let txt = "";
    const tRe = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>|<w:br\b[^>]*\/>|<w:tab\b[^>]*\/>/g;
    let tm;
    while ((tm = tRe.exec(rs))) {
      if (tm[1] !== undefined) txt += unesc(tm[1]);
      else if (/^<w:br/.test(tm[0])) txt += "\n";
      else txt += "\t";
    }
    if (txt) res.push({ b, i, sz, col, txt });
  }
  return res;
}
function render(rr) {
  let t = "";
  for (const r of rr) {
    let x = r.txt;
    if (r.b && r.i) x = "***" + x + "***";
    else if (r.b) x = "**" + x + "**";
    else if (r.i) x = "*" + x + "*";
    t += x;
  }
  return t
    .replace(/\*\*\*\*/g, "")
    .replace(/\*\*(\s+)\*\*/g, "$1")
    .replace(/\*(\s+)\*/g, "$1");
}
function cellText(tc) {
  const ps = tc.match(/<w:p\b[\s\S]*?<\/w:p>/g) || [];
  return ps
    .map((p) => render(runs(p)))
    .join(" ")
    .trim();
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
      while ((cl = cellRe.exec(rw[0]))) cells.push(cellText(cl[0]));
      out.push("| " + cells.join(" | ") + " |");
    }
    out.push("[[/TABLE]]");
    continue;
  }
  const pPr = (blk.match(/<w:pPr>[\s\S]*?<\/w:pPr>/) || [""])[0];
  const numId = (pPr.match(/<w:numId w:val="([^"]*)"/) || [])[1];
  const ilvl = +((pPr.match(/<w:ilvl w:val="([^"]*)"/) || [])[1] || 0);
  const shd = (pPr.match(/<w:shd[^>]*w:fill="([^"]*)"/) || [])[1] || "";
  const rr = runs(blk);
  const t = render(rr);
  if (!t.trim()) {
    out.push("");
    continue;
  }
  const sz = Math.max(0, ...rr.map((r) => r.sz));
  const col = (rr.find((r) => r.col && r.col !== "auto") || {}).col || "";
  let pre = `[${sz || "-"}${col ? "/#" + col : ""}${shd && shd !== "auto" ? "/bg" + shd : ""}] `;
  if (numId !== undefined) pre += "  ".repeat(ilvl) + "- ";
  out.push(pre + t);
}
fs.writeFileSync(process.argv[3], out.join("\n"));
console.log("blocks", out.length);
