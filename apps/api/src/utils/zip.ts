// Minimal dependency-free ZIP writer (STORE / no compression) — same format
// as apps/web/lib/zip.ts, adapted for Node Buffers instead of browser
// Blob/string content, since a database file and uploaded images are
// binary. Used by the offline backup endpoint.
export interface ZipEntry {
  name: string
  content: Buffer
}

function crc32(bytes: Buffer): number {
  let crc = ~0
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i]
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return (~crc) >>> 0
}

function u16(n: number): Buffer {
  return Buffer.from([n & 0xff, (n >>> 8) & 0xff])
}
function u32(n: number): Buffer {
  return Buffer.from([n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff])
}

export function buildZip(entries: ZipEntry[]): Buffer {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0

  for (const entry of entries) {
    const nameBytes = Buffer.from(entry.name, 'utf8')
    const data = entry.content
    const crc = crc32(data)

    const local = Buffer.concat([
      u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(crc), u32(data.length), u32(data.length),
      u16(nameBytes.length), u16(0), nameBytes, data,
    ])
    locals.push(local)

    centrals.push(Buffer.concat([
      u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(crc), u32(data.length), u32(data.length),
      u16(nameBytes.length), u16(0), u16(0), u16(0), u16(0), u32(0),
      u32(offset), nameBytes,
    ]))
    offset += local.length
  }

  const centralSize = centrals.reduce((a, c) => a + c.length, 0)
  const end = Buffer.concat([
    u32(0x06054b50), u16(0), u16(0), u16(entries.length), u16(entries.length),
    u32(centralSize), u32(offset), u16(0),
  ])

  return Buffer.concat([...locals, ...centrals, end])
}
