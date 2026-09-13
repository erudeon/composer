// Extract the lecture PDF into paragraphs, keeping bold/italic, bullet level and
// de-hyphenating words the typesetter broke across a line.
const fs = require("fs");
const dir = process.argv[2];

/**
 * The running footer of THIS document, as a regex source in `FOOTER_RE`.
 *
 * Everything at footer size that does not match is reported instead of dropped. Without it the filter
 * is a guess, and a guess about page furniture removed real content the last time this ran.
 */
const FOOTER_RE = process.env.FOOTER_RE ? new RegExp(process.env.FOOTER_RE) : null;

function loadCMap(f) {
  const t = fs.readFileSync(f, "latin1");
  const map = {};
  let m;
  const bf = /beginbfchar([\s\S]*?)endbfchar/g;
  while ((m = bf.exec(t))) {
    const pr = /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g;
    let p;
    while ((p = pr.exec(m[1]))) {
      let dst = "";
      for (let i = 0; i < p[2].length; i += 4) dst += String.fromCharCode(parseInt(p[2].substr(i, 4), 16));
      map[parseInt(p[1], 16)] = dst;
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
const PAGES = [5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 27];
const all = [];
for (let pi = 0; pi < PAGES.length; pi++) {
  const c = fs.readFileSync(dir + "/obj_" + PAGES[pi] + ".bin", "latin1");
  let font = null,
    size = 0,
    x = 0,
    y = 0;
  const runs = [];
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
    const srcStr = m[9] || m[10];
    if (m[9]) {
      const hx = /<([0-9a-fA-F]+)>/g;
      let h;
      while ((h = hx.exec(srcStr))) {
        const hs = h[1];
        for (let i = 0; i + 4 <= hs.length; i += 4) {
          const code = parseInt(hs.substr(i, 4), 16);
          s += FONTS[font] && FONTS[font].cmap[code] !== undefined ? FONTS[font].cmap[code] : "";
        }
      }
    } else s = srcStr.slice(1, -1);
    if (s) runs.push({ x, y, size, style: FONTS[font] ? FONTS[font].style : "", t: s });
  }
  const byY = new Map();
  for (const r of runs) {
    const k = Math.round(r.y * 2) / 2;
    if (!byY.has(k)) byY.set(k, []);
    byY.get(k).push(r);
  }
  const lines = [];
  for (const yk of [...byY.keys()].sort((a, b) => a - b)) {
    const rs = byY.get(yk).sort((a, b) => a.x - b.x);
    let txt = "",
      prev = null;
    for (const r of rs) {
      if (prev && r.x - prev.x > prev.t.length * prev.size * 0.3 + 1.5) txt += " ";
      let t = r.t;
      /*
       * BOLD-ITALIC BECOMES BOLD, and this is the one place to fix it.
       *
       * The lesson dialect carries ONE mark per span, so `***word***` is stored as bold text reading
       * `*word*` — asterisks and all — and that is what the student reads. This extractor emitted the
       * three-asterisk form, both published courses shipped hundreds of them, and the manifest lint now
       * refuses the construct outright (`no-nested-emphasis`). Bold is what a document means by
       * bold-italic anyway: the emphasis is the point, the second marker is typography.
       */
      if (r.style === "BI" || r.style === "B") t = "**" + t + "**";
      else if (r.style === "I") t = "*" + t + "*";
      txt += t;
      prev = r;
    }
    txt = txt.replace(/\*\*\*\*/g, "").replace(/\*\*(\s*)\*\*/g, "$1");
    lines.push({ y: yk, x: rs[0].x, size: Math.max(...rs.map((r) => r.size)), text: txt });
  }
  all.push(lines);
}

// --- group lines into paragraphs ---
const SIZE = {
  26.7: "title",
  22.0: "h1",
  14.9: "h2",
  13.3: "smart",
  12.5: "sub",
  11.7: "toc",
  10.7: "label",
  9.6: "footer",
};
const out = [];
const notes = [];
for (let pi = 0; pi < all.length; pi++) {
  const lines = all[pi];
  let cur = null;
  const flush = () => {
    if (cur) {
      out.push(cur);
      cur = null;
    }
  };
  for (let i = 0; i < lines.length; i++) {
    const L = lines[i];
    const kind = SIZE[+L.size.toFixed(1)] || "body";
    if (kind === "footer") {
      // The running footer belongs to THIS document, not to this tool, so it is passed in as FOOTER_RE.
      // Anything at footer size that does NOT match is reported rather than dropped: a footer filter
      // that silently eats real text is the failure this guards, and it ate eleven lines once —
      // including an article heading and an answer-key entry.
      if (FOOTER_RE && !FOOTER_RE.test(L.text.replace(/\*/g, ""))) {
        notes.push(`p${pi + 1}: unexpected footer-size text: ${L.text}`);
      }
      continue;
    }
    const plain = L.text.replace(/\*/g, "");
    const bullet = /^\s*[•◦]\s/.test(plain) ? (L.x >= 100 ? 2 : 1) : /^\s*\d+\.\s/.test(plain) ? 1 : 0;
    const gap = i > 0 ? L.y - lines[i - 1].y : 99;
    const starts =
      kind !== "body" || bullet > 0 || gap > 20 || (cur && cur.x !== L.x && Math.abs(cur.x - L.x) > 6 && !cur.cont);
    if (starts) {
      flush();
      cur = { page: pi + 1, kind, bullet, x: L.x, text: L.text.trim(), cont: false };
    } else {
      let prev = cur.text;
      // de-hyphenate: the typesetter's U+2010 at a line end joins the word
      if (/‐$/.test(prev)) cur.text = prev.replace(/‐$/, "") + L.text.trim();
      else cur.text = prev + " " + L.text.trim();
    }
    if (cur) cur.cont = true;
  }
  flush();
}
const rendered = out.map((p) => {
  let t = p.text.replace(/\s{2,}/g, " ").trim();
  t = t.replace(/^[•◦]\s*/, "").trim();
  const ind = p.bullet === 2 ? "  - " : p.bullet === 1 ? "- " : "";
  const pre =
    p.kind === "title"
      ? "# "
      : p.kind === "h1"
        ? "# "
        : p.kind === "h2"
          ? "## "
          : p.kind === "smart"
            ? "## "
            : p.kind === "label"
              ? "@@ "
              : p.kind === "sub"
                ? "~ "
                : p.kind === "toc"
                  ? "· "
                  : "";
  return `[p${p.page}|${p.kind}] ${pre}${ind}${t}`;
});
fs.writeFileSync(process.argv[3], rendered.join("\n"));
console.log("paragraphs", out.length);
if (notes.length) console.log("NOTES:\n" + notes.join("\n"));
const hy = rendered.filter((r) => /‐/.test(r));
console.log("remaining U+2010:", hy.length);
hy.forEach((h) => console.log("  " + h.slice(0, 120)));
