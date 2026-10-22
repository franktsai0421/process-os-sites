import fs from 'node:fs/promises';
import path from 'node:path';

// Explicit Local-only helper. Never accepts a remote base URL.
const base = 'http://127.0.0.1:3000';
const api = `${base}/api/routine-equipment?manage=1`;
const root = process.cwd();
const source = JSON.parse(await fs.readFile(path.join(root, 'public/process/routine-source.json'), 'utf8'));
if (source.equipment.length !== 119 || source.issues.length !== 37) throw Error('Source counts differ');
const before = await fetch(api).then(response => response.json());
if (!Number.isInteger(before.revision)) throw Error('Local API unavailable');
if (before.control?.source?.sha256 === source.sha256) {
  console.log('Local equipment source already imported; no rows overwritten.');
} else {
let next = 0;
const worker = async () => {
  while (next < source.equipment.length) {
    const index = next++;
    const item = source.equipment[index];
    const bytes = await fs.readFile(path.join(root, 'public', item.photoSource.webPath.slice(1)));
    const response = await fetch(`${base}/api/routine-equipment/photo?manage=1`, {
      method: 'PUT', headers: { 'Content-Type': 'image/webp' }, body: bytes,
    });
    const uploaded = await response.json();
    if (!response.ok || uploaded.id !== item.photoSource.webSha256)
      throw Error(`Photo upload mismatch at Excel row ${item.sourceRow}: ${uploaded.error || response.status}`);
    item.photoId = uploaded.id;
  }
};
await Promise.all(Array.from({ length: 6 }, worker));
const response = await fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ action: 'import', baseRevision: before.revision, source }) });
const result = await response.json();
if (!response.ok || !result.control) throw Error(result.error || `Import HTTP ${response.status}`);
console.log(JSON.stringify({ imported: result.control.versions.find(version => version.status === 'draft')?.equipment.length,
  photos: source.equipment.length, issues: result.control.issues.length, status: 'draft',
  activeVersionId: result.control.activeVersionId, revision: result.revision }));
}
