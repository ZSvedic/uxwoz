// A zip file of stored (uncompressed) entries: local headers, then the central directory. No Node or Bun APIs.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

/** The CRC-32 of some bytes, as zip wants it. */
export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** A file in the zip: its path (forward slashes) and its text or bytes. */
export interface ZipFile { name: string; data: string | Uint8Array }

/** The files as one zip, stored without compression; names are UTF-8 (flag bit 11). */
export function zip(files: ZipFile[], date = new Date()): Uint8Array<ArrayBuffer> {
  const enc = new TextEncoder()
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1)
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  const parts: Uint8Array[] = [], central: Uint8Array[] = []
  let offset = 0
  for (const f of files) {
    const name = enc.encode(f.name), data = typeof f.data === 'string' ? enc.encode(f.data) : f.data
    const crc = crc32(data)
    // The fields a local header and a central entry share, from "version needed" to the name's length.
    const common = (v: DataView, at: number) => {
      v.setUint16(at, 20, true); v.setUint16(at + 2, 0x0800, true); v.setUint16(at + 4, 0, true)
      v.setUint16(at + 6, time, true); v.setUint16(at + 8, day, true); v.setUint32(at + 10, crc, true)
      v.setUint32(at + 14, data.length, true); v.setUint32(at + 18, data.length, true); v.setUint16(at + 22, name.length, true)
    }
    const local = new Uint8Array(30 + name.length), lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true)
    common(lv, 4)
    local.set(name, 30)
    const entry = new Uint8Array(46 + name.length), cv = new DataView(entry.buffer)
    cv.setUint32(0, 0x02014b50, true)
    cv.setUint16(4, 20, true)
    common(cv, 6)
    cv.setUint32(42, offset, true)
    entry.set(name, 46)
    parts.push(local, data)
    central.push(entry)
    offset += local.length + data.length
  }
  const size = central.reduce((n, c) => n + c.length, 0)
  const end = new Uint8Array(22), ev = new DataView(end.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true)
  ev.setUint32(12, size, true); ev.setUint32(16, offset, true)
  const out = new Uint8Array(offset + size + 22)
  let at = 0
  for (const p of [...parts, ...central, end]) { out.set(p, at); at += p.length }
  return out
}
