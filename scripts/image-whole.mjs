/**
 * IS THIS PICTURE FILE WHOLE, by its own end marker. Plain bytes, no decoder, no dependency.
 *
 * A JPEG ends in the EOI marker FF D9, a PNG in its IEND chunk, a GIF in the trailer 3B. A file cut off
 * part-way keeps its header, so it still sniffs as its format and still reports a size, and every cheap
 * check passes it; drawn, it has a grey bottom half. That is what a picture looks like after being
 * emitted as base64 by a model whose output was cut off, and the retries shrink it until one fits: on
 * 16-18 September 2026 it left 65 pictures on production as thumbnails, cut-off files and noise.
 *
 * The platform's upload door decodes the whole file and refuses one that is not whole (its message says
 * "not a whole file"). This is the cheap half of the same question, asked BEFORE the bytes leave the
 * machine, so the refusal names the file while the author is still at the keyboard. It cannot see a
 * file garbled in the middle that still ends correctly; the door can, and the contact sheet can.
 *
 * Answers `null` for anything that is not one of the three formats the door accepts, `true` or `false`
 * otherwise. Trailing zero bytes after a JPEG's EOI are tolerated: some writers pad.
 */
const PNG_IEND = Buffer.from([0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);

export function imageWholeByMarkers(buf) {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let end = buf.length;
    while (end > 2 && buf[end - 1] === 0x00) end -= 1;
    return buf[end - 2] === 0xff && buf[end - 1] === 0xd9;
  }
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return buf.subarray(buf.length - 8).equals(PNG_IEND);
  }
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) {
    return buf[buf.length - 1] === 0x3b;
  }
  return null;
}
