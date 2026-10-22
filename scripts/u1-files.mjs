import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const fail = code => { throw Object.assign(new Error(code), { code }); };
export const need = (ok, code) => { if (!ok) fail(code); };
export const sha = value => crypto.createHash('sha256').update(value).digest('hex');
export const stable = v => v === null || typeof v !== 'object' ? JSON.stringify(v) : Array.isArray(v) ? '[' + v.map(stable).join(',') + ']' : '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
export const equal = (a, b) => stable(a) === stable(b);
export const isHash = s => typeof s === 'string' && /^[a-f0-9]{64}$/.test(s);
export function ordinary(p, directory = false) {
  const s = fs.lstatSync(p);
  need(!s.isSymbolicLink() && (directory ? s.isDirectory() : s.isFile() && s.nlink === 1), 'U1_FILE_IDENTITY');
  return s;
}
export function parents(p) {
  let q = path.resolve(p);
  while (true) { ordinary(q, true); const next = path.dirname(q); if (next === q) break; q = next; }
}
export function relative(p) {
  need(typeof p === 'string' && p.length && !p.includes('\\') && !p.includes(':') && !p.includes('\0') && p.split('/').every(x => x && x !== '.' && x !== '..' && !/[<>"|?*]/.test(x)), 'U1_RELATIVE_PATH');
  return p;
}
export function within(root, rel) {
  const p = path.resolve(root, relative(rel));
  need(p.startsWith(path.resolve(root) + path.sep), 'U1_PATH_BOUNDARY');
  return p;
}
const identity = s => [s.dev, s.ino, s.size, s.mtimeMs, s.ctimeMs];
export function readFile(p, max = 256 * 1024 * 1024) {
  parents(path.dirname(p)); const before = ordinary(p); need(before.size <= max, 'U1_FILE_BOUND');
  const fd = fs.openSync(p, fs.constants.O_RDONLY);
  try { const held = fs.fstatSync(fd); need(equal(identity(before), identity(held)), 'U1_FILE_RACE'); const b = fs.readFileSync(fd); need(equal(identity(held), identity(fs.fstatSync(fd))) && equal(identity(held), identity(ordinary(p))) && b.length === held.size, 'U1_FILE_RACE'); return b; }
  finally { fs.closeSync(fd); }
}
export function hashFile(p) {
  parents(path.dirname(p)); const before = ordinary(p), fd = fs.openSync(p, 'r'), hash = crypto.createHash('sha256');
  try { const held = fs.fstatSync(fd); need(equal(identity(before), identity(held)), 'U1_FILE_RACE'); const chunk = Buffer.alloc(1024 * 1024); let bytes = 0, n; while ((n = fs.readSync(fd, chunk, 0, chunk.length, null))) { hash.update(chunk.subarray(0, n)); bytes += n; } need(bytes === held.size && equal(identity(held), identity(fs.fstatSync(fd))) && equal(identity(held), identity(ordinary(p))), 'U1_FILE_RACE'); return { bytes, sha256: hash.digest('hex') }; }
  finally { fs.closeSync(fd); }
}
export function pin(p) { return { path: path.resolve(p), ...hashFile(p) }; }
export function readPin(p, parse = true) {
  need(p && typeof p.path === 'string' && path.isAbsolute(p.path) && isHash(p.sha256) && Number.isSafeInteger(p.bytes), 'U1_INPUT_PIN');
  const b = readFile(p.path); need(b.length === p.bytes && sha(b) === p.sha256, 'U1_INPUT_PIN'); return parse ? JSON.parse(b) : b;
}
export function writeNew(p, b) {
  parents(path.dirname(p)); const fd = fs.openSync(p, 'wx', 0o600);
  try { fs.writeFileSync(fd, b); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  const content = readFile(p); need(sha(content) === sha(b), 'U1_WRITE_VERIFY');
}
export const writeJSON = (p, v) => writeNew(p, Buffer.from(JSON.stringify(v, null, 2) + '\n'));
export function tree(root) {
  parents(root); const rows = [], dirs = [], names = new Set();
  function visit(dir, rel) {
    const before = ordinary(dir, true); dirs.push(rel);
    for (const name of fs.readdirSync(dir).sort()) {
      const r = rel ? rel + '/' + name : name; relative(r); need(!names.has(r.normalize('NFC').toLowerCase()), 'U1_TREE_CASE_COLLISION'); names.add(r.normalize('NFC').toLowerCase());
      const p = path.join(dir, name), s = fs.lstatSync(p); need(!s.isSymbolicLink(), 'U1_TREE_LINK');
      if (s.isDirectory()) visit(p, r); else { ordinary(p); rows.push({ path: r, ...hashFile(p) }); }
      need(rows.length <= 1000000, 'U1_TREE_BOUND');
    }
    const after = ordinary(dir, true); need(equal(identity(before), identity(after)), 'U1_TREE_RACE');
  }
  visit(root, ''); rows.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0); dirs.sort((a,b)=>a<b?-1:a>b?1:0);
  return { rows, directories: dirs, hash: sha(stable({ rows, directories: dirs })), bytes: rows.reduce((n, r) => n + r.bytes, 0) };
}
export function copyTree(source, dest, expected) {
  need(!fs.existsSync(dest), 'U1_DEST_EXISTS'); parents(path.dirname(dest)); fs.mkdirSync(dest);
  for (const rel of expected.directories.filter(Boolean).sort((a, b) => a.split('/').length - b.split('/').length)) fs.mkdirSync(within(dest, rel));
  for (const row of expected.rows) {
    const src = within(source, row.path), out = within(dest, row.path); need(equal(hashFile(src), { bytes: row.bytes, sha256: row.sha256 }), 'U1_COPY_SOURCE_CHANGED');
    parents(path.dirname(src)); parents(path.dirname(out)); const s = ordinary(src), input = fs.openSync(src, 'r'), output = fs.openSync(out, 'wx', 0o600);
    try { const held = fs.fstatSync(input); need(equal(identity(s), identity(held)), 'U1_COPY_RACE'); const chunk = Buffer.alloc(1024 * 1024); let n; while ((n = fs.readSync(input, chunk, 0, chunk.length, null))) { let off = 0; while (off < n) off += fs.writeSync(output, chunk, off, n - off); } fs.fsyncSync(output); need(equal(identity(held), identity(fs.fstatSync(input))) && equal(identity(held), identity(ordinary(src))), 'U1_COPY_RACE'); }
    finally { fs.closeSync(input); fs.closeSync(output); }
    need(equal(hashFile(out), { bytes: row.bytes, sha256: row.sha256 }), 'U1_COPY_VERIFY');
  }
  need(tree(source).hash === expected.hash && tree(dest).hash === expected.hash, 'U1_COPY_FULL_VERIFY');
}
