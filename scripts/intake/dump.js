const fs = require("fs"),
  zlib = require("zlib");
const buf = fs.readFileSync(process.argv[2]);
const out = process.argv[3];
fs.mkdirSync(out, { recursive: true });
// find "N G obj" occurrences
const s = buf.toString("latin1");
const re = /(\d+)\s+(\d+)\s+obj\b/g;
let m,
  objs = [];
while ((m = re.exec(s))) {
  objs.push({ num: +m[1], gen: +m[2], start: m.index, bodyStart: re.lastIndex });
}
console.log("objects found:", objs.length);
let idx = [];
for (let i = 0; i < objs.length; i++) {
  const o = objs[i];
  const end = i + 1 < objs.length ? objs[i + 1].start : s.length;
  const body = s.slice(o.bodyStart, end);
  const sIdx = body.indexOf("stream");
  let dictPart = sIdx >= 0 ? body.slice(0, sIdx) : body;
  let rec = { num: o.num, dict: dictPart.trim().slice(0, 600) };
  if (sIdx >= 0) {
    let ds = o.bodyStart + sIdx + 6;
    if (s[ds] === "\r") ds++;
    if (s[ds] === "\n") ds++;
    const eIdx = body.indexOf("endstream", sIdx);
    let de = o.bodyStart + eIdx;
    let raw = buf.slice(ds, de);
    let dat = raw;
    if (/FlateDecode/.test(dictPart)) {
      try {
        dat = zlib.inflateSync(raw);
      } catch (e) {
        try {
          dat = zlib.inflateRawSync(raw);
        } catch (e2) {
          dat = Buffer.from("INFLATE_FAIL " + e.message);
        }
      }
    }
    fs.writeFileSync(out + "/obj_" + o.num + ".bin", dat);
    rec.streamLen = dat.length;
  }
  idx.push(rec);
}
fs.writeFileSync(
  out + "/_index.txt",
  idx.map((r) => `### obj ${r.num} len=${r.streamLen || 0}\n${r.dict}`).join("\n\n"),
);
