// Dependency-free UTF-8 STORE ZIP. Bounded exports are assembled off the UI thread.
export const utf8 = (value: string) => new TextEncoder().encode(value);
export async function sha256(bytes: Uint8Array) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer)), b => b.toString(16).padStart(2, '0')).join('');
}
const crcTable=Uint32Array.from({length:256},(_,value)=>{
  let crc=value;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^(0xedb88320&-(crc&1));return crc>>>0;
});
function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (let i=0;i<bytes.length;i++)crc=(crc>>>8)^crcTable[(crc^bytes[i])&255];
  return (crc ^ 0xffffffff) >>> 0;
}
export function zipFiles(files: {path: string; bytes: Uint8Array}[]) {
  const parts: Uint8Array[] = [], central: Uint8Array[] = []; let offset = 0, centralSize = 0;
  for (const file of files) {
    const name = utf8(file.path), crc = crc32(file.bytes), local = new Uint8Array(30 + name.length), lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0x800, true); lv.setUint16(12, 33, true);
    lv.setUint32(14, crc, true); lv.setUint32(18, file.bytes.length, true); lv.setUint32(22, file.bytes.length, true); lv.setUint16(26, name.length, true); local.set(name, 30);
    const c = new Uint8Array(46 + name.length), cv = new DataView(c.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x800, true); cv.setUint16(14, 33, true);
    cv.setUint32(16, crc, true); cv.setUint32(20, file.bytes.length, true); cv.setUint32(24, file.bytes.length, true); cv.setUint16(28, name.length, true); cv.setUint32(42, offset, true); c.set(name, 46);
    parts.push(local, file.bytes); central.push(c); offset += local.length + file.bytes.length; centralSize += c.length;
  }
  const end = new Uint8Array(22), ev = new DataView(end.buffer); ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true); ev.setUint32(12, centralSize, true); ev.setUint32(16, offset, true);
  const result = new Uint8Array(offset + centralSize + end.length); let cursor = 0;
  for (const p of [...parts, ...central, end]) { result.set(p, cursor); cursor += p.length; } return result;
}
