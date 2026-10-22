import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { readPackage } from '../lib/canonical-data.mjs';
import {
  planState,
  syncState,
  decodeState,
  boundedBucket,
} from './release-main.mjs';
const releaseFile = fileURLToPath(
  new URL('./release-main.mjs', import.meta.url),
);
for (const args of [
  ['--target', 'production'],
  ['--target', 'production', '--approved-sha', '0'.repeat(40)],
  ['--database-id', 'isolated-override'],
]) {
  const result = spawnSync(process.execPath, [releaseFile, ...args], {
    encoding: 'utf8',
  });
  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /PRODUCTION_MAIN_APPROVAL_REQUIRED|UNSUPPORTED_RELEASE_OVERRIDE/,
  );
}
let reads = 0;
const retryBucket = boundedBucket(
  {
    async get() {
      reads++;
      if (reads === 1) return new Promise(() => {});
      return null;
    },
  },
  { timeoutMs: 5, retries: 1 },
);
assert.equal(await retryBucket.get('isolated-fixture'), null);
assert.equal(reads, 2);
const stalled = boundedBucket(
  { get: () => new Promise(() => {}) },
  { timeoutMs: 5, retries: 0 },
);
await assert.rejects(
  () => stalled.get('isolated-fixture'),
  /REMOTE_R2_READ_TIMEOUT/,
);
const root = process.cwd(),
  pkg = readPackage(root),
  sqlite = new DatabaseSync(':memory:');
for (const f of fs
  .readdirSync('drizzle')
  .filter((f) => f.endsWith('.sql'))
  .sort())
  sqlite.exec(fs.readFileSync('drizzle/' + f, 'utf8'));
const db = {
  prepare(sql) {
    let params = [];
    return {
      bind(...p) {
        params = p;
        return this;
      },
      async first() {
        return sqlite.prepare(sql).get(...params);
      },
      async run() {
        return {
          meta: { changes: Number(sqlite.prepare(sql).run(...params).changes) },
        };
      },
    };
  },
};
const objects = new Map(),
  bucket = {
    async get(key) {
      if (!objects.has(key)) return null;
      const v = objects.get(key),
        bytes = Buffer.from(v.raw);
      return {
        size: bytes.length,
        customMetadata: v.options.customMetadata,
        async text() {
          return bytes.toString();
        },
        async arrayBuffer() {
          return bytes;
        },
      };
    },
    async put(key, raw, options = {}) {
      objects.set(key, { raw, options });
    },
  };
const original = {
  platformUsers: JSON.stringify([
    {
      id: 'fixture',
      name: 'Fixture',
      role: 'admin',
      password: 'isolated-only',
    },
  ]),
  'processEditor:fixture:A': '{"privateDraft":true}',
  backupSettings: '{"enabled":false}',
  maintenanceMode: '0',
  approvalVersions: JSON.stringify([
    { id: 'private-draft', status: 'draft', stages: {} },
  ]),
};
const first = planState(root, original, pkg);
assert.equal(
  JSON.parse(first.values.platformUsers)[0].password,
  'isolated-only',
);
assert.equal(
  first.values['processEditor:fixture:A'],
  original['processEditor:fixture:A'],
);
assert.equal(first.values.backupSettings, original.backupSettings);
assert.ok(
  JSON.parse(first.values.approvalVersions).some(
    (v) => v.id === 'private-draft',
  ),
);
assert.throws(
  () =>
    planState(
      root,
      {
        ...original,
        platformUsers: '[{"id":"DEMO-ADMIN","password":"isolated-only"}]',
      },
      pkg,
    ),
  /DEMO_ID_CONFLICT/,
);
sqlite
  .prepare('INSERT INTO shared_state VALUES (1,1,?,?)')
  .run(JSON.stringify(original), 'fixture');
const synced = await syncState(root, db, bucket, pkg);
assert.equal(synced.changed, true);
assert.equal(synced.images.imported, 205);
assert.equal(synced.bom.rows, 6237);
assert.equal(synced.bom.roots, 330);
const repeated = await syncState(root, db, bucket, pkg);
assert.equal(repeated.changed, false);
assert.equal(repeated.revision, synced.revision);
assert.equal(repeated.images.present, 205);
assert.equal(repeated.images.imported, 0);
const row = sqlite.prepare('SELECT * FROM shared_state').get();
const values = await decodeState(bucket, row.values);
assert.equal(JSON.parse(values.platformUsers).length, 4);
assert.equal(
  values['processEditor:fixture:A'],
  original['processEditor:fixture:A'],
);
const corrupt = structuredClone(values);
corrupt.bomOverrides = '{}';
sqlite
  .prepare('UPDATE shared_state SET "values"=?')
  .run(JSON.stringify(corrupt));
await assert.rejects(
  () => syncState(root, db, bucket, pkg),
  /MANAGED_STAGING_EDIT_CONFLICT/,
);
objects.delete('staging-canonical/latest.json');
await syncState(root, db, bucket, pkg, {
  afterWrite: () => {
    throw Error('fixture failure');
  },
}).then(
  () => assert.fail('must fail'),
  (error) => assert.equal(error.restored, true),
);
assert.equal(
  (
    await decodeState(
      bucket,
      sqlite.prepare('SELECT "values" FROM shared_state').get().values,
    )
  ).bomOverrides,
  '{}',
);
const image = objects.keys().find((k) => k.startsWith('canonical-images/'));
const saved = objects.get(image);
objects.set(image, { ...saved, raw: 'corrupt' });
await assert.rejects(
  () => syncState(root, db, bucket, pkg),
  /LOCAL_IMAGE_HASH_CONFLICT/,
);
objects.set(image, saved);
console.log(
  'PASS: full Canonical/seed, 330 roots/6237 rows, 205 verified images, repeat no change, private state preserved, collisions and corruption fail closed, CAS rollback',
);
objects.delete('staging-canonical/latest.json');
sqlite.prepare('DELETE FROM shared_state').run();
sqlite
  .prepare('INSERT INTO shared_state VALUES (1,1,?,?)')
  .run(JSON.stringify(original), 'fixture');
let racing = false;
const concurrent = {
  ...bucket,
  async get(key) {
    if (!racing && key.startsWith('canonical-images/')) {
      racing = true;
      sqlite
        .prepare('UPDATE shared_state SET revision=2,"values"=? WHERE id=1')
        .run(JSON.stringify({ ...original, concurrentMarker: 'true' }));
    }
    return bucket.get(key);
  },
};
await assert.rejects(
  () => syncState(root, db, concurrent, pkg),
  /STAGING_REVISION_CONFLICT/,
);
assert.equal(
  sqlite.prepare('SELECT revision FROM shared_state').get().revision,
  2,
);
assert.equal(
  JSON.parse(sqlite.prepare('SELECT "values" FROM shared_state').get().values)
    .concurrentMarker,
  'true',
);
sqlite.close();
