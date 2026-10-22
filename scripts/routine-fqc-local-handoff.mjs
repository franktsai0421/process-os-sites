// Explicit local integration: only enable the feature, never import test state.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { connect, hash } from './ipqc-ab-local-context.mjs';
const task = path.resolve('.wrangler/local-only/routine-fqc-3040');
const backup = path.resolve('.local-backups/routine-fqc-3000-20261007-before');
const isolation = JSON.parse(
  fs.readFileSync(path.join(task, 'isolation.json')),
);
const files = (root) =>
  fs
    .readdirSync(root, { recursive: true })
    .filter((f) => fs.statSync(path.join(root, f)).isFile());
const readDb = (file) => {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    assert.equal(
      db.prepare('PRAGMA integrity_check').get().integrity_check,
      'ok',
    );
    return db
      .prepare('SELECT revision,"values" FROM shared_state WHERE id=1')
      .get();
  } finally {
    db.close();
  }
};
const savedD1 = files(backup).find(
  (f) =>
    f.includes('d1') && f.endsWith('.sqlite') && !f.endsWith('metadata.sqlite'),
);
assert.ok(savedD1);
const pinned = readDb(path.join(backup, savedD1)),
  before = readDb(isolation.sourceDb);
const client = await connect('http://127.0.0.1:3000');
if (!process.argv.includes('--enable')) {
  assert.equal(
    before.values,
    pinned.values,
    'Daily data changed; do not use an older integration baseline',
  );
  const contentFiles = files(backup),
    rfile = contentFiles.find(
      (f) =>
        f.includes('r2') &&
        f.endsWith('.sqlite') &&
        !f.endsWith('metadata.sqlite'),
    );
  const rdb = new DatabaseSync(path.join(backup, rfile), { readOnly: true });
  assert.equal(
    rdb.prepare('PRAGMA integrity_check').get().integrity_check,
    'ok',
  );
  const objects = rdb.prepare('SELECT key,blob_id,size FROM _mf_objects').all();
  rdb.close();
  const objectsByKey = new Map(objects.map((o) => [o.key, o])),
    byName = new Map(contentFiles.map((f) => [path.basename(f), f])),
    checked = new Set();
  function bytes(key) {
    const o = objectsByKey.get(key);
    assert.ok(o, 'Missing referenced R2 object');
    const f = byName.get(o.blob_id);
    assert.ok(f, 'Missing R2 blob');
    return fs.readFileSync(path.join(backup, f));
  }
  function verify(value) {
    if (!value || typeof value !== 'object') return;
    if (
      typeof value.key === 'string' &&
      /^(state-records\/v1|state-chunks\/v1|snapshots)\//.test(value.key) &&
      typeof value.sha256 === 'string'
    ) {
      if (checked.has(value.key)) return;
      const b = bytes(value.key);
      assert.equal(hash(b), value.sha256);
      checked.add(value.key);
      verify(JSON.parse(b));
      return;
    }
    for (const child of Object.values(value)) verify(child);
  }
  verify(JSON.parse(pinned.values));
  for (const o of objects) {
    assert.ok(byName.has(o.blob_id));
    assert.equal(
      fs.statSync(path.join(backup, byName.get(o.blob_id))).size,
      o.size,
    );
  }
  for (const f of ['session.json', 'wrangler.json'])
    fs.copyFileSync(path.join('.wrangler/local-only', f), path.join(backup, f));
  const manifest = {
    at: new Date().toISOString(),
    revision: pinned.revision,
    files: files(backup).map((f) => ({
      path: f.replaceAll('\\', '/'),
      sha256: hash(fs.readFileSync(path.join(backup, f))),
      bytes: fs.statSync(path.join(backup, f)).size,
    })),
  };
  fs.writeFileSync(
    path.join(backup, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
  );
  // Reconstruct a separate D1 copy. R2 is read only from the retained backup.
  const restored = path.join(task, 'restored-backup-check.sqlite');
  assert.ok(
    !fs.existsSync(restored),
    'Do not overwrite an earlier restore check',
  );
  fs.copyFileSync(path.join(backup, savedD1), restored);
  assert.deepEqual(readDb(restored), pinned);
  const now = readDb(isolation.sourceDb);
  assert.equal(now.values, pinned.values);
  const actual = await client.request('/api/shared-state');
  assert.equal(actual.revision, pinned.revision);
  const result = {
    status: 'PASS',
    at: new Date().toISOString(),
    backup: path.relative(process.cwd(), backup),
    revision: pinned.revision,
    files: manifest.files.length,
    bytes: manifest.files.reduce((n, f) => n + f.bytes, 0),
    r2Objects: objects.length,
    verifiedReferences: checked.size,
    integrity: 'PASS',
    isolatedD1Restore: 'PASS',
    dailyDatabaseRestored: false,
    detail:
      'Recovered completed snapshot after temporary 3000 outage; pinned D1 equals current daily state, R2 references and all blob sizes verified; all backup files SHA256 indexed; session/config retained privately. Separate restored D1 read equals the original snapshot.',
  };
  fs.writeFileSync(
    path.join(task, 'backup-verification.json'),
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
} else {
  const acceptance = JSON.parse(
    fs.readFileSync('docs/routine-fqc/evidence/acceptance-summary.json'),
  );
  assert.equal(
    acceptance.rows.filter((r) => r.id !== 'FQC-38' && r.status === 'PASS')
      .length,
    37,
  );
  const verified = JSON.parse(
    fs.readFileSync(path.join(task, 'backup-verification.json')),
  );
  assert.equal(verified.status, 'PASS');
  assert.equal(before.revision, verified.revision);
  assert.equal(before.values, pinned.values);
  const raw = JSON.parse(before.values);
  assert.equal(raw.__processRecords.values.routineFqcControl, undefined);
  const manifest = JSON.parse(
    fs.readFileSync(path.join(backup, 'manifest.json')),
  );
  for (const f of manifest.files)
    assert.equal(hash(fs.readFileSync(path.join(backup, f.path))), f.sha256);
  const result = await client.request('/api/routine-fqc', {
    action: 'enable',
    operationId: crypto.randomUUID(),
  });
  assert.equal(result.enabled, true);
  const after = readDb(isolation.sourceDb),
    updated = JSON.parse(after.values);
  const changed = Object.keys(updated.__processRecords.values).filter(
    (k) =>
      JSON.stringify(updated.__processRecords.values[k]) !==
      JSON.stringify(raw.__processRecords.values[k]),
  );
  const normalized = structuredClone(updated);
  delete normalized.routineFqcEnabled;
  delete normalized.__processRecords.values.routineFqcEnabled;
  assert.deepEqual(normalized, raw, 'Only the FQC enable flag may change');
  const fqc = await client.request('/api/routine-fqc');
  assert.equal(fqc.control.startDate, null);
  assert.equal(fqc.control.documents.length, 0);
  assert.equal(fqc.control.jobs.length, 0);
  assert.equal(fqc.control.cases.length, 0);
  const e = {
    id: 'FQC-38',
    status: 'PASS',
    at: new Date().toISOString(),
    beforeRevision: before.revision,
    afterRevision: after.revision,
    changedRecordKeys: changed,
    allOtherStoredValuesIdentical: true,
    usersIdentical: raw.platformUsers === updated.platformUsers,
    testControlTransferred: false,
    startDate: null,
    documents: 0,
    jobs: 0,
    cases: 0,
    backup: verified.backup,
    detail:
      'Authenticated existing Local Admin enabled FQC through its CAS API; every preexisting stored value/pointer and users are byte-identical. No isolated control, schedule start, report or photo was imported. Separate backed-up D1 reconstruction and R2 integrity verified.',
  };
  fs.writeFileSync(
    path.join(task, 'integration-evidence.json'),
    JSON.stringify(e, null, 2),
  );
  console.log(JSON.stringify(e));
}
