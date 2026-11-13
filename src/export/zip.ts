// Minimal ZIP writer: no folders, no encryption, no ZIP64 (each file and the
// archive must stay under 4 GB). Entries are stored as-is or deflated with the
// browser's CompressionStream('deflate-raw').

export interface ZipEntry {
  name: string;
  data: Uint8Array<ArrayBuffer>;
  /** Deflate this entry. Leave off for already-compressed data (PNG, JPEG). */
  compress?: boolean;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

async function deflateRaw(data: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob([data]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** MS-DOS date and time fields, as used by ZIP headers. */
function dosDateTime(d: Date): { time: number; date: number } {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((Math.max(d.getFullYear(), 1980) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

export async function zip(entries: ZipEntry[]): Promise<Blob> {
  const encoder = new TextEncoder();
  const { time, date } = dosDateTime(new Date());
  const parts: BlobPart[] = [];
  const central: Uint8Array<ArrayBuffer>[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const crc = crc32(entry.data);
    const packed = entry.compress ? await deflateRaw(entry.data) : entry.data;
    const method = entry.compress ? 8 : 0;

    const local = new DataView(new ArrayBuffer(30 + name.length));
    local.setUint32(0, 0x04034b50, true); // local file header signature
    local.setUint16(4, 20, true); // version needed
    local.setUint16(6, 0x0800, true); // flags: UTF-8 names
    local.setUint16(8, method, true);
    local.setUint16(10, time, true);
    local.setUint16(12, date, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, packed.length, true);
    local.setUint32(22, entry.data.length, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true); // extra length
    new Uint8Array(local.buffer).set(name, 30);
    parts.push(local.buffer, packed);

    const cd = new DataView(new ArrayBuffer(46 + name.length));
    cd.setUint32(0, 0x02014b50, true); // central directory signature
    cd.setUint16(4, 20, true); // version made by
    cd.setUint16(6, 20, true); // version needed
    cd.setUint16(8, 0x0800, true);
    cd.setUint16(10, method, true);
    cd.setUint16(12, time, true);
    cd.setUint16(14, date, true);
    cd.setUint32(16, crc, true);
    cd.setUint32(20, packed.length, true);
    cd.setUint32(24, entry.data.length, true);
    cd.setUint16(28, name.length, true);
    // extra length, comment length, disk number, internal and external attributes stay 0
    cd.setUint32(42, offset, true); // local header offset
    new Uint8Array(cd.buffer).set(name, 46);
    central.push(new Uint8Array(cd.buffer));

    offset += 30 + name.length + packed.length;
  }

  const centralSize = central.reduce((s, c) => s + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); // end of central directory signature
  end.setUint16(8, entries.length, true); // entries on this disk
  end.setUint16(10, entries.length, true); // entries in total
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true); // central directory offset

  return new Blob([...parts, ...central, end.buffer], { type: 'application/zip' });
}
