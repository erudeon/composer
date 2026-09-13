const fs = require("fs");
const dir = process.argv[2];
// --- load ToUnicode CMaps ---
function loadCMap(f) {
  const t = fs.readFileSync(f, "latin1");
  const map = {};
  const bf = /beginbfchar([\s\S]*?)endbfchar/g;
  let m;
  while ((m = bf.exec(t))) {
    const pr = /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g;
    let p;
    while ((p = pr.exec(m[1]))) {
      let dst = "";
      for (let i = 0; i < p[2].length; i += 4) dst += String.fromCharCode(parseInt(p[2].substr(i, 4), 16));
      map[parseInt(p[1], 16)] = dst;
    }
  }
  const br = /beginbfrange([\s\S]*?)endbfrange/g;
  while ((m = br.exec(t))) {
    const pr = /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g;
    let p;
    while ((p = pr.exec(m[1]))) {
      const lo = parseInt(p[1], 16),
        hi = parseInt(p[2], 16),
        d0 = parseInt(p[3], 16);
      for (let c = lo; c <= hi; c++) map[c] = String.fromCharCode(d0 + (c - lo));
    }
  }
  return map;
}
const FONTS = {
  KVPWBI: { cmap: loadCMap(dir + "/obj_72.bin"), style: "B" },
  KSBEEV: { cmap: loadCMap(dir + "/obj_76.bin"), style: "" },
  COIOFS: { cmap: loadCMap(dir + "/obj_80.bin"), style: "I" },
  UDUIRV: { cmap: loadCMap(dir + "/obj_84.bin"), style: "BI" },
};
const pages = [5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 27];
let all = [];
for (let pi = 0; pi < pages.length; pi++) {
  const c = fs.readFileSync(dir + "/obj_" + pages[pi] + ".bin", "latin1");
  let font = null,
    size = 0,
    x = 0,
    y = 0,
    runs = [];
  const tok =
    /\/([A-Z]{6})\s+([\d.]+)\s+Tf|([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+Tm|(\[[^\]]*\])\s*TJ|(\([^)]*\))\s*Tj/g;
  let m;
  while ((m = tok.exec(c))) {
    if (m[1]) {
      font = m[1];
      size = parseFloat(m[2]);
      continue;
    }
    if (m[3] !== undefined) {
      x = parseFloat(m[7]);
      y = parseFloat(m[8]);
      continue;
    }
    let s = "";
    const src = m[9] || m[10];
    if (m[9]) {
      const hx = /<([0-9a-fA-F]+)>/g;
      let h;
      while ((h = hx.exec(src))) {
        const hs = h[1];
        for (let i = 0; i + 4 <= hs.length; i += 4) {
          const code = parseInt(hs.substr(i, 4), 16);
          s += FONTS[font] && FONTS[font].cmap[code] !== undefined ? FONTS[font].cmap[code] : "";
        }
      }
      // detect wide negative kerns as spaces
    } else {
      s = src.slice(1, -1);
    }
    if (s) runs.push({ x, y, size, style: FONTS[font] ? FONTS[font].style : "", t: s });
  }
  // group into lines by y
  const lines = new Map();
  for (const r of runs) {
    const k = Math.round(r.y * 2) / 2;
    if (!lines.has(k)) lines.set(k, []);
    lines.get(k).push(r);
  }
  const ys = [...lines.keys()].sort((a, b) => a - b);
  let out = [];
  for (const yk of ys) {
    const rs = lines.get(yk).sort((a, b) => a.x - b.x);
    let txt = "",
      prev = null;
    for (const r of rs) {
      if (prev && r.x - prev.x > prev.t.length * prev.size * 0.3 + 1.5) txt += " ";
      let t = r.t;
      if (r.style.includes("B") && r.style.includes("I")) t = "***" + t + "***";
      else if (r.style === "B") t = "**" + t + "**";
      else if (r.style === "I") t = "*" + t + "*";
      txt += t;
      prev = r;
    }
    out.push({ y: yk, x: rs[0].x, size: Math.max(...rs.map((r) => r.size)), text: txt });
  }
  all.push({ page: pi + 1, lines: out });
}
let txt = "";
for (const p of all) {
  txt += "\n\n========== PAGE " + p.page + " ==========\n";
  for (const l of p.lines) txt += `[s=${l.size.toFixed(1)} x=${l.x.toFixed(0)}] ${l.text}\n`;
}
fs.writeFileSync(process.argv[3], txt);
console.log("pages", all.length, "chars", txt.length);
