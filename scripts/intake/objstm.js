const fs = require("fs");
const d = fs.readFileSync(process.argv[2], "latin1");
const first = parseInt(process.argv[3], 10),
  n = parseInt(process.argv[4], 10);
const hdr = d.slice(0, first).trim().split(/\s+/).map(Number);
let out = [];
for (let i = 0; i < n; i++) {
  const num = hdr[2 * i],
    off = hdr[2 * i + 1];
  const nextOff = i + 1 < n ? hdr[2 * i + 3] : d.length - first;
  out.push("##OBJ " + num + "\n" + d.slice(first + off, first + nextOff).trim());
}
fs.writeFileSync(process.argv[5], out.join("\n\n"));
console.log("wrote", n, "objects");
