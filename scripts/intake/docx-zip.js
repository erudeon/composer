/**
 * `docx-zip.js` — WHAT A FILE ACTUALLY IS, AND ONE ENTRY OUT OF IT, WITH NOTHING INSTALLED.
 *
 * A `.docx` is a zip. `unzip` reads one and `open-docx.js` uses it, but the two steps that run BEFORE a
 * working folder exists cannot: preflight runs on a file somebody just sent, and `identify.mjs` runs
 * over a folder nobody wants unpacked. Both need to look inside without writing anything to disk, and
 * both used to answer "what is this file" separately.
 *
 * Dependency-free on purpose. This is the first thing to touch a file and the least that should be
 * assumed at that moment is an `npm install`.
 */
"use strict";

/** What the first bytes say the file is, whatever it is called. THE EXTENSION IS NOT EVIDENCE. */
function sniff(buf) {
  const hex = (n) => buf.toString("hex", 0, n);
  if (buf.length >= 4 && buf.toString("latin1", 0, 4) === "%PDF") return "pdf";
  if (buf.length >= 4 && hex(4) === "504b0304") return "zip";
  if (buf.length >= 8 && hex(8) === "d0cf11e0a1b11ae1") return "ole";
  if (buf.length >= 3 && hex(3) === "ffd8ff") return "jpeg";
  if (buf.length >= 8 && hex(8) === "89504e470d0a1a0a") return "png";
  if (buf.length >= 5 && buf.toString("latin1", 0, 5) === "{\\rtf")
    return "rtf";
  if (buf.length >= 4 && buf.toString("latin1", 0, 4) === "GIF8") return "gif";
  if (buf.length >= 4 && hex(4) === "25215053") return "ps";
  return "unknown";
}

/**
 * One entry out of a zip, by name, as a string. `null` when it is not there or will not inflate.
 *
 * Reads the end-of-central-directory record backwards, which is the only reliable way in: a local file
 * header may carry zeroed sizes when the writer streamed the entry, and Word does exactly that.
 */
function entry(buf, wanted) {
  const zlib = require("node:zlib");
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) return null;
  let count;
  let at;
  try {
    count = buf.readUInt16LE(eocd + 10);
    at = buf.readUInt32LE(eocd + 16);
  } catch {
    return null;
  }
  for (let i = 0; i < count; i += 1) {
    if (at + 46 > buf.length || buf.readUInt32LE(at) !== 0x02014b50)
      return null;
    const method = buf.readUInt16LE(at + 10);
    const compressed = buf.readUInt32LE(at + 20);
    const nameLen = buf.readUInt16LE(at + 28);
    const extraLen = buf.readUInt16LE(at + 30);
    const commentLen = buf.readUInt16LE(at + 32);
    const localAt = buf.readUInt32LE(at + 42);
    const name = buf.toString("latin1", at + 46, at + 46 + nameLen);
    if (name === wanted) {
      // The LOCAL header's own name and extra lengths, which differ from the central directory's.
      const localNameLen = buf.readUInt16LE(localAt + 26);
      const localExtraLen = buf.readUInt16LE(localAt + 28);
      const from = localAt + 30 + localNameLen + localExtraLen;
      const bytes = buf.subarray(from, from + compressed);
      try {
        return method === 0
          ? bytes.toString("utf8")
          : zlib.inflateRawSync(bytes).toString("utf8");
      } catch {
        return null;
      }
    }
    at += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

/**
 * Every entry in the central directory: its name, and the two sizes the archive DECLARES for it.
 *
 * Declared, which is the point. It is read before a byte is written anywhere, so a caller can decide
 * whether to unpack at all.
 */
function entries(buf) {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) return [];
  const out = [];
  let count;
  let at;
  try {
    count = buf.readUInt16LE(eocd + 10);
    at = buf.readUInt32LE(eocd + 16);
  } catch {
    return [];
  }
  for (let i = 0; i < count; i += 1) {
    if (at + 46 > buf.length || buf.readUInt32LE(at) !== 0x02014b50) break;
    const compressed = buf.readUInt32LE(at + 20);
    const uncompressed = buf.readUInt32LE(at + 24);
    const nameLen = buf.readUInt16LE(at + 28);
    const extraLen = buf.readUInt16LE(at + 30);
    const commentLen = buf.readUInt16LE(at + 32);
    out.push({
      name: buf.toString("latin1", at + 46, at + 46 + nameLen),
      compressed,
      uncompressed,
    });
    at += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

/**
 * IS THIS ARCHIVE SAFE TO UNPACK? Answered from the central directory, before anything is written.
 *
 * A `.docx` is a file somebody SENT us, and `unzip` will faithfully write whatever it is told to. Two
 * shapes do damage and both are visible in the directory without decompressing a byte:
 *
 *   - A DECOMPRESSION BOMB. A megabyte of zeros compresses to nothing and expands to a gigabyte, and
 *     the only symptom is a full disk on the operator's own laptop.
 *   - AN ENTRY THAT WALKS OUT of the folder, or that is an absolute path. Info-ZIP refuses these, so
 *     this is a second lock on a door that is already locked rather than the only one: worth having,
 *     because "the tool we shell out to happens to refuse it" is not a property this repo controls.
 *
 * Returns null when it is fine, or a sentence saying what is wrong.
 */
const MAX_UNPACKED = 512 * 1024 * 1024;
const MAX_RATIO = 200;

function unsafeToUnpack(buf) {
  const all = entries(buf);
  const total = all.reduce((n, e) => n + e.uncompressed, 0);
  if (total > MAX_UNPACKED) {
    return (
      `it declares ${(total / 1024 / 1024).toFixed(0)} MB unpacked, over the ${MAX_UNPACKED / 1024 / 1024} MB limit. ` +
      `The largest real summary in the catalogue is 19 MB, so this is not one.`
    );
  }
  if (buf.length > 0 && total / buf.length > MAX_RATIO && total > 64 * 1024 * 1024) {
    return (
      `it expands ${Math.round(total / buf.length)} times, from ${(buf.length / 1024).toFixed(0)} KB to ` +
      `${(total / 1024 / 1024).toFixed(0)} MB. That is the shape of a decompression bomb, not a document.`
    );
  }
  for (const e of all) {
    if (e.name.startsWith("/") || /(^|[\\/])\.\.([\\/]|$)/.test(e.name)) {
      return `it holds an entry named "${e.name}", which points outside the folder it would be unpacked into.`;
    }
  }
  return null;
}

/** Every entry NAME in a zip. Cheap, and it is how the media beside a document is counted. */
function names(buf) {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) return [];
  const out = [];
  let count;
  let at;
  try {
    count = buf.readUInt16LE(eocd + 10);
    at = buf.readUInt32LE(eocd + 16);
  } catch {
    return [];
  }
  for (let i = 0; i < count; i += 1) {
    if (at + 46 > buf.length || buf.readUInt32LE(at) !== 0x02014b50) break;
    const nameLen = buf.readUInt16LE(at + 28);
    const extraLen = buf.readUInt16LE(at + 30);
    const commentLen = buf.readUInt16LE(at + 32);
    out.push(buf.toString("latin1", at + 46, at + 46 + nameLen));
    at += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

module.exports = { sniff, entry, names, entries, unsafeToUnpack };
