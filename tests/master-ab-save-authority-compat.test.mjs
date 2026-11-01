// Real Save route; synthetic, ephemeral SQLite/R2/session fixtures only.
// May also be run against exact main via MASTER_AB_SOURCE_ROOT for paired proof.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {saveFixture, copy, hash, manifest, installEnvelope, assertUnrelatedPreserved, masterReads, canonical, saveBaselineAdmission} from './master-ab-save-record-benchmark.mjs';
import {isBaseline} from './master-ab-auth-phase-fixture.mjs';

const results = [], paired = process.argv.includes('--paired');
if (paired) {
  assert.equal(process.argv[2], '--paired');
  const admitted = saveBaselineAdmission(process.argv.slice(3));
  const baseline = admitted.root, script = fileURLToPath(import.meta.url), repository = path.resolve(path.dirname(script), '..');
  const candidateCommit = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: repository, encoding: 'utf8'}).trim(), candidateTree = execFileSync('git', ['rev-parse', 'HEAD^{tree}'], {cwd: repository, encoding: 'utf8'}).trim();
  assert.equal(execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], {cwd: repository, encoding: 'utf8'}).trim(), '', 'candidate tracked source must be clean');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'master-save-authority-compat-'));
  try {
    const run = (root, expectedBaseline) => {
      const report = path.join(directory, expectedBaseline ? 'baseline.json' : 'candidate.json');
      execFileSync(process.execPath, ['--max-old-space-size=384', '--test', script], {cwd: repository, env: {...process.env, MASTER_AB_SOURCE_ROOT: root, MASTER_AB_EXPECT_BASELINE: expectedBaseline ? '1' : '0', MASTER_AB_COMPAT_REPORT: report}, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024});
      return JSON.parse(fs.readFileSync(report, 'utf8'));
    };
    const before = run(baseline, true), after = run(repository, false), healthy = value => value.filter(row => row.result);
    assert.equal(healthy(before).length, 10); assert.equal(healthy(after).length, 10);
    for (let i = 0; i < 10; i++) {
      const a = healthy(before)[i], b = healthy(after)[i]; assert.equal(a.kind, b.kind); assert.equal(a.primary, b.primary);
      assert.equal(canonical(a.result), canonical(b.result), a.kind + ': full DTO/decoded state parity');
    }
    assert.deepEqual(saveBaselineAdmission(process.argv.slice(3)), admitted);
    assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], {cwd: repository, encoding: 'utf8'}).trim(), candidateCommit);
    assert.equal(execFileSync('git', ['rev-parse', 'HEAD^{tree}'], {cwd: repository, encoding: 'utf8'}).trim(), candidateTree);
    assert.equal(execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], {cwd: repository, encoding: 'utf8'}).trim(), '', 'candidate changed during paired run');
    console.log(JSON.stringify({status: 'PASS_AUTHORITY_COMPATIBILITY_PAIRS', baselineMode: admitted.mode, baselineCommit: admitted.commit, baselineTree: admitted.tree, candidateCommit, candidateTree, healthyPairs: 10, baseline: before.map(({result, ...metadata}) => ({...metadata, status: result?.response.status ?? metadata.status})), candidate: after.map(({result, ...metadata}) => ({...metadata, status: result?.response.status ?? metadata.status})), limitations: ['Real route synthetic fixtures, not deployed/browser timing.', 'Malformed authority and actual body-ref policy cases intentionally do not assert baseline status equality.']}, null, 2));
  } finally {fs.rmSync(directory, {recursive: true, force: true});}
}
if (!paired) {
for (const primary of [false, true]) for (const kind of ['absent-users-mirror', 'absent-maintenance-mirror', 'stale-users-mirror', 'literal-user-name', 'literal-role-description']) test('Save authority compatibility ' + kind + ' primary=' + primary, async t => {
  const f = await saveFixture({primary}); t.after(f.close);
  if (kind.startsWith('literal-')) await f.mutateValues(values => {
    if (kind === 'literal-user-name') {const users = JSON.parse(values.platformUsers); users[0].name = '__immutableBody'; values.platformUsers = JSON.stringify(users);}
    else {const overrides = JSON.parse(values.processRoleTemplateOverrides); overrides.admin = {description: '__immutableBody'}; values.processRoleTemplateOverrides = JSON.stringify(overrides);}
  }, false);
  const envelope = manifest(f);
  if (kind === 'absent-users-mirror') delete envelope.platformUsers;
  if (kind === 'absent-maintenance-mirror') delete envelope.maintenanceMode;
  if (kind === 'stale-users-mirror') envelope.platformUsers = '[]';
  installEnvelope(f, envelope);
  const before = f.row(), objects = [...f.objects], command = f.command('save', {expectedRevision: 3}); f.reset();
  const response = await f.request('POST', command);
  assert.equal(response.status, 200, JSON.stringify(response.body)); assert.equal(f.stats.cas, 1);
  if (!isBaseline) {
    assertUnrelatedPreserved(f, before, objects);
    const after = manifest(f); assert.equal(after.platformUsers, envelope.platformUsers); assert.equal(after.maintenanceMode, envelope.maintenanceMode);
  }
  const counters = {...f.stats};
  results.push({kind, primary, counters, result: {response: copy(response), decoded: copy(await f.decoded()), revision: f.row().revision}});
});

for (const kind of ['mirror-cannot-grant', 'nested-authority-body', 'malformed-users-inline', 'malformed-maintenance-inline']) test('Save authority compatibility keeps fail-closed ' + kind, async t => {
  const f = await saveFixture(); t.after(f.close);
  const envelope = manifest(f); let forbiddenKey;
  if (kind === 'mirror-cannot-grant') {
    // A privileged-looking inline mirror cannot replace the authoritative users ref.
    const raw = '[]', sha256 = hash(raw), ref = {key: 'state-records/v1/' + sha256 + '.json', sha256};
    f.objects.set(ref.key, raw); envelope.__processRecords.values.platformUsers = ref;
  }
  if (kind === 'nested-authority-body') {
    const body = JSON.stringify({private: 'Synthetic authority body must not be fetched'}), sha256 = hash(body);
    const ref = {key: 'state-records/v1/' + sha256 + '.json', sha256}; forbiddenKey = ref.key; f.objects.set(ref.key, body);
    const raw = JSON.stringify({admin: {description: {__immutableBody: ref}}}), aggregateSha = hash(raw);
    envelope.__processRecords.values.processRoleTemplateOverrides = {key: 'state-records/v1/' + aggregateSha + '.json', sha256: aggregateSha};
    f.objects.set(envelope.__processRecords.values.processRoleTemplateOverrides.key, raw);
  }
  if (kind === 'malformed-users-inline') envelope.platformUsers = '{broken';
  if (kind === 'malformed-maintenance-inline') envelope.maintenanceMode = '{broken';
  installEnvelope(f, envelope); const before = f.row(), objects = [...f.objects]; f.reset();
  const response = await f.request('POST', f.command('save', {expectedRevision: 3}));
  // The new required-authority policy deliberately tightens malformed inline and
  // actual body references; these are not healthy baseline-parity cases.
  if (isBaseline && kind !== 'mirror-cannot-grant') {results.push({kind, baselinePolicyObservation: true, status: response.status}); return;}
  assert.ok(response.status >= 400, JSON.stringify(response.body)); assert.deepEqual(f.row(), before); assert.deepEqual([...f.objects], objects);
  assert.equal(f.stats.put, 0); assert.equal(f.stats.cas, 0);
  if (!isBaseline) {assert.equal(masterReads(f), 0); if (forbiddenKey) assert.ok(!f.events.some(e => e.name === 'r2get.before' && e.key === forbiddenKey));}
  assert.equal(response.body.control, undefined); assert.equal(response.body.receipt, undefined);
  results.push({kind, status: response.status, counters: {...f.stats}});
});

test('Save missing selected state cannot fall through to a newly initialized second row', async t => {
  const f = await saveFixture(); t.after(f.close); const before = f.row();
  f.sqlite.prepare('DELETE FROM shared_state WHERE id=1').run();
  f.hooks.set('state.after', () => {if (!f.sqlite.prepare('SELECT id FROM shared_state WHERE id=1').get()) f.sqlite.prepare('INSERT INTO shared_state(id,revision,"values",updated_at) VALUES(1,?,?,?)').run(before.revision, before.values, '2026-10-31T12:00:00.000Z');});
  f.reset(); const response = await f.request('POST', f.command('save', {expectedRevision: 3}));
  assert.equal(response.status, 500); assert.equal(f.stats.state, 1); assert.equal(f.stats.get, 0); assert.equal(f.stats.revocation, 0); assert.equal(f.stats.put, 0); assert.equal(f.stats.cas, 0);
  assert.equal(response.body.control, undefined); assert.equal(response.body.receipt, undefined);
});

test.after(() => {if (process.env.MASTER_AB_COMPAT_REPORT) fs.writeFileSync(process.env.MASTER_AB_COMPAT_REPORT, JSON.stringify(results, null, 2) + '\n');});
}
