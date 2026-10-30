import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { validateConfig } from '../scripts/benchmark/preview-smoke.mjs';
const input = {
  origin: 'http://127.0.0.1:12345',
  isolationConfirmed: true,
  account: 'synthetic',
  password: 'SENSITIVE_SENTINEL',
  expectedTitle: 'synthetic-preview',
  expectedComposition: 'synthetic-version',
  equipmentCount: 40,
  photoWidth: 640,
};

test('local preview requires explicit isolation and a bare loopback origin', () => {
  assert.equal(validateConfig(input).origin, input.origin);
  assert.equal(
    validateConfig({ ...input, origin: 'http://[::1]:12345' }).origin,
    'http://[::1]:12345',
  );
  for (const origin of [
    'https://example.invalid',
    'http://example.invalid:12345',
    'http://127.0.0.1:12345/path',
    'http://127.0.0.1:12345/?secret=x',
    'http://user:secret@127.0.0.1:12345',
    'http://127.0.0.1',
  ]) {
    assert.throws(() => validateConfig({ ...input, origin }));
  }
  assert.throws(() => validateConfig({ ...input, isolationConfirmed: false }));
});

test('bad configuration emits no credentials, URL or raw error before loading browser dependencies', () => {
  const result = spawnSync(
    process.execPath,
    ['scripts/benchmark/preview-smoke.mjs'],
    {
      input: JSON.stringify({
        ...input,
        origin: 'https://SENSITIVE_SENTINEL.invalid',
      }),
      encoding: 'utf8',
    },
  );
  assert.equal(result.status, 1);
  assert.deepEqual(JSON.parse(result.stdout), {
    status: 'FAIL',
    code: 'PREVIEW_SMOKE_CHECK_FAILED',
  });
  assert.equal(result.stderr, '');
  assert(!result.stdout.includes('SENSITIVE_SENTINEL'));
});
