import test from 'node:test';
import assert from 'node:assert/strict';
import { decide, gate } from '../scripts/review-routine-ci.mjs';

test('classification only narrows known isolated paths; rename and shared changes run both', () => {
  const f = 'app/api/routine-fqc/page/route.ts';
  const i = 'public/process/routine-iqc.css';
  assert.deepEqual(decide([f]), { fqc: true, iqc: false });
  assert.deepEqual(decide([i]), { fqc: false, iqc: true });
  for (const paths of [[f, i], [f, 'public/process/index.html'], [i, 'lib/process-state.ts'],
    [f, '.github/workflows/routine-test-review.yml'], ['public/process/routine-fqc.css'], ['public/process/routine-fqc.js'], ['public/process/routine-iqc.js'], ['wrong/\n' + f], []])
    assert.deepEqual(decide(paths), { fqc: true, iqc: true });
});

test('stable gate rejects skipped selected jobs, no selection and missing setup proof', () => {
  const common = { identity: 'success', classifier: 'success', common: 'success' };
  const fqc = { fqc: 'true', iqc: 'false' };
  const iqc = { fqc: 'false', iqc: 'true' };
  const both = { fqc: 'true', iqc: 'true' };
  assert.equal(gate(fqc, { ...common, fqc: 'success', iqc: 'skipped' }), true);
  assert.equal(gate(iqc, { ...common, fqc: 'skipped', iqc: 'success' }), true);
  assert.equal(gate(both, { ...common, fqc: 'success', iqc: 'success' }), true);
  for (const result of ['skipped', 'failure', 'cancelled', undefined])
    assert.equal(gate(both, { ...common, fqc: result, iqc: 'success' }), false);
  assert.equal(gate({ fqc: 'false', iqc: 'false' }, { ...common, fqc: 'skipped', iqc: 'skipped' }), false);
  assert.equal(gate(fqc, { ...common, classifier: 'failure', fqc: 'success', iqc: 'skipped' }), false);
  assert.equal(gate(fqc, { ...common, common: 'failure', fqc: 'success', iqc: 'skipped' }), false);
});

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

test('scope CLI checks real head, excludes base-only files and includes both sides of a rename', t => {
  const dir = mkdtempSync(join(tmpdir(), 'routine-ci-scope-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const script = fileURLToPath(new URL('../scripts/review-routine-ci.mjs', import.meta.url));
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();
  const set = (path, data) => {
    const file = join(dir, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, data);
  };
  const commit = label => (git('add', '-A'), git('commit', '-qm', label), git('rev-parse', 'HEAD'));
  git('init', '-q', '-b', 'base');
  git('config', 'user.email', 'review-ci@example.invalid');
  git('config', 'user.name', 'Synthetic review CI');
  const fqc = 'app/api/routine-fqc/page/route.ts';
  const iqc = 'app/api/routine-iqc/photo/route.ts';
  set(fqc, 'baseline');
  commit('fork');
  git('branch', 'head');
  set('shared/base-only.js', 'must not expand the PR scope');
  const base = commit('advance base');
  git('switch', '-q', 'head');
  set(fqc, 'changed');
  const firstHead = commit('FQC');
  const invoke = (head, n) => {
    const out = join(dir, 'out-' + n);
    const summary = out + '-summary';
    const result = spawnSync(process.execPath, [script, 'scope'], { cwd: dir, encoding: 'utf8',
      env: { ...process.env, BASE_SHA: base, HEAD_SHA: head, GITHUB_OUTPUT: out, GITHUB_STEP_SUMMARY: summary } });
    return { result, out: existsSync(out) ? readFileSync(out, 'utf8') : '',
      summary: existsSync(summary) ? readFileSync(summary, 'utf8') : '' };
  };
  const f = invoke(firstHead, 1);
  assert.equal(f.result.status, 0, f.result.stderr);
  assert.equal(f.out, 'fqc=true\niqc=false\n');
  assert.ok(f.summary.includes(firstHead) && f.summary.includes(base));
  mkdirSync(dirname(join(dir, iqc)), { recursive: true });
  renameSync(join(dir, fqc), join(dir, iqc));
  const both = invoke(commit('cross-module rename'), 2);
  assert.equal(both.result.status, 0, both.result.stderr);
  assert.equal(both.out, 'fqc=true\niqc=true\n');
  const wrong = invoke(firstHead, 3);
  assert.notEqual(wrong.result.status, 0);
  assert.equal(wrong.out, '');
});
