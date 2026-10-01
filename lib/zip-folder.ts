type ZipFile = { name: string; bytes: Uint8Array };

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c >>> 0;
}

function crc32(data: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosTime(date: Date) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

/**
 * A zip whose files all live inside `folder`, so opening it shows one folder
 * of images rather than loose files.
 */
export function zipFolder(folder: string, files: ZipFile[]) {
  const now = dosTime(new Date());
  const encoder = new TextEncoder();
  const entries = files.map((file) => {
    const path = encoder.encode(`${folder}/${file.name}`);
    return { path, bytes: file.bytes, crc: crc32(file.bytes) };
  });
  const localSize = entries.reduce((sum, entry) => sum + 30 + entry.path.length + entry.bytes.length, 0);
  const centralSize = entries.reduce((sum, entry) => sum + 46 + entry.path.length, 0);
  const out = new Uint8Array(localSize + centralSize + 22);
  const view = new DataView(out.buffer);
  let offset = 0;
  const locals: number[] = [];

  for (const entry of entries) {
    locals.push(offset);
    view.setUint32(offset, 0x04034b50, true);
    view.setUint16(offset + 4, 20, true);
    view.setUint16(offset + 8, 0, true);
    view.setUint16(offset + 10, now.time, true);
    view.setUint16(offset + 12, now.day, true);
    view.setUint32(offset + 14, entry.crc, true);
    view.setUint32(offset + 18, entry.bytes.length, true);
    view.setUint32(offset + 22, entry.bytes.length, true);
    view.setUint16(offset + 26, entry.path.length, true);
    out.set(entry.path, offset + 30);
    out.set(entry.bytes, offset + 30 + entry.path.length);
    offset += 30 + entry.path.length + entry.bytes.length;
  }

  const centralStart = offset;
  entries.forEach((entry, i) => {
    view.setUint32(offset, 0x02014b50, true);
    view.setUint16(offset + 4, 20, true);
    view.setUint16(offset + 6, 20, true);
    view.setUint16(offset + 10, 0, true);
    view.setUint16(offset + 12, now.time, true);
    view.setUint16(offset + 14, now.day, true);
    view.setUint32(offset + 16, entry.crc, true);
    view.setUint32(offset + 20, entry.bytes.length, true);
    view.setUint32(offset + 24, entry.bytes.length, true);
    view.setUint16(offset + 28, entry.path.length, true);
    view.setUint32(offset + 42, locals[i], true);
    out.set(entry.path, offset + 46);
    offset += 46 + entry.path.length;
  });

  view.setUint32(offset, 0x06054b50, true);
  view.setUint16(offset + 8, entries.length, true);
  view.setUint16(offset + 10, entries.length, true);
  view.setUint32(offset + 12, offset - centralStart, true);
  view.setUint32(offset + 16, centralStart, true);
  return out;
}
