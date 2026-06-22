// Minimal dependency-free ZIP writer (STORE / no compression). Used to bundle
// several CSVs into one download — browsers block multiple simultaneous file
// downloads, so per-term files go into a single .zip the user unzips into N CSVs.
import { saveBlob } from './csv'

export interface ZipEntry { name: string; content: string }

function crc32(bytes: Uint8Array): number {
  let crc = ~0
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i]
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return (~crc) >>> 0
}

const u16 = (n: number) => new Uint8Array([n & 0xff, (n >>> 8) & 0xff])
const u32 = (n: number) => new Uint8Array([n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff])

function concat(parts: Uint8Array[]): Uint8Array {
  const len = parts.reduce((a, p) => a + p.length, 0)
  const out = new Uint8Array(len)
  let off = 0
  for (const p of parts) { out.set(p, off); off += p.length }
  return out
}

export function buildZip(entries: ZipEntry[]): Blob {
  const enc = new TextEncoder()
  const locals: Uint8Array[] = []
  const centrals: Uint8Array[] = []
  let offset = 0

  for (const e of entries) {
    const nameBytes = enc.encode(e.name)
    const data = enc.encode(e.content)
    const crc = crc32(data)

    const local = concat([
      u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(crc), u32(data.length), u32(data.length),
      u16(nameBytes.length), u16(0), nameBytes, data,
    ])
    locals.push(local)

    centrals.push(concat([
      u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(crc), u32(data.length), u32(data.length),
      u16(nameBytes.length), u16(0), u16(0), u16(0), u16(0), u32(0),
      u32(offset), nameBytes,
    ]))
    offset += local.length
  }

  const centralSize = centrals.reduce((a, c) => a + c.length, 0)
  const end = concat([
    u32(0x06054b50), u16(0), u16(0), u16(entries.length), u16(entries.length),
    u32(centralSize), u32(offset), u16(0),
  ])

  return new Blob([...locals, ...centrals, end] as BlobPart[], { type: 'application/zip' })
}

/** Build the zip and trigger a single download. */
export function downloadZip(zipName: string, entries: ZipEntry[]): void {
  saveBlob(buildZip(entries), zipName)
}
