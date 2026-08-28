// scripts/ico-pack.mjs
// Minimal multi-size PNG-in-ICO encoder.
//
// Each image must be PNG-encoded (Windows Vista+ accepts PNG payloads in ICO).
// Writes a single .ico file containing every input image.

export function icoPack(buffers, sizes) {
  if (buffers.length !== sizes.length) {
    throw new Error(`buffers/sizes length mismatch: ${buffers.length} vs ${sizes.length}`);
  }

  const headerSize = 6 + 16 * buffers.length;
  const offsets = [];
  let cursor = headerSize;
  for (let i = 0; i < buffers.length; i += 1) {
    offsets.push(cursor);
    cursor += buffers[i].length;
  }

  const total = cursor;
  const out = Buffer.alloc(total);
  let p = 0;

  // ICONDIR
  out.writeUInt16LE(0, p); p += 2; // reserved
  out.writeUInt16LE(1, p); p += 2; // type 1 = icon
  out.writeUInt16LE(buffers.length, p); p += 2; // image count

  // ICONDIRENTRY × N
  for (let i = 0; i < buffers.length; i += 1) {
    const size = sizes[i];
    const buf = buffers[i];
    out.writeUInt8(size === 256 ? 0 : size, p); p += 1; // width (0 = 256)
    out.writeUInt8(size === 256 ? 0 : size, p); p += 1; // height
    out.writeUInt8(0, p); p += 1; // color count (palette, 0 when true-color)
    out.writeUInt8(0, p); p += 1; // reserved
    out.writeUInt16LE(1, p); p += 2; // color planes
    out.writeUInt16LE(32, p); p += 2; // bits per pixel
    out.writeUInt32LE(buf.length, p); p += 4; // bytes in resource
    out.writeUInt32LE(offsets[i], p); p += 4; // offset from start
  }

  // PNG payloads
  for (const buf of buffers) {
    buf.copy(out, p);
    p += buf.length;
  }

  return out;
}