import assert from 'node:assert/strict';
import test from 'node:test';
import {fixture} from './master-ab-auth-phase-fixture.mjs';

for (const action of ['apply', 'save']) {
  void test('AB replay keeps exact ' + action + ' response with the terminal and scoped-Save pre-body identity fences', async t => {
    const f = await fixture(); t.after(f.close);
    const command = f.command(action), first = await f.request('POST', command);
    assert.equal(first.status, 200, JSON.stringify(first.body));
    const before = f.row(), objects = [...f.objects]; f.reset();
    const replay = await f.request('POST', command);
    assert.equal(replay.status, 200, JSON.stringify(replay.body));
    assert.equal(replay.body.unchanged, true);
    assert.equal(replay.body.revision, first.body.revision);
    assert.deepEqual(replay.body.receipt, first.body.receipt);
    assert.deepEqual(replay.body.control, first.body.control);
    assert.equal(replay.body.requestId, undefined);
    assert.deepEqual(f.row(), before); assert.deepEqual([...f.objects], objects);
    assert.equal(f.stats.state, 1); assert.equal(f.stats.revocation, action === 'save' ? 4 : 3);
    assert.equal(f.stats.sql, action === 'save' ? 5 : 4); assert.equal(f.stats.revision, 0);
    assert.equal(f.stats.cas, 0); assert.equal(f.stats.put, 0); assert.equal(f.stats.head, 0);
  });
}

for (const failure of ['session revocation', 'revocation storage failure']) {
  void test('AB replay terminal gate denies ' + failure + ' after fingerprint without disclosing control', async t => {
    const f = await fixture(); t.after(f.close);
    const command = f.command(), first = await f.request('POST', command);
    assert.equal(first.status, 200, JSON.stringify(first.body));
    const before = f.row(), objects = [...f.objects]; f.reset();
    let fingerprinted = false;
    f.hooks.set('fingerprint.before', () => {
      fingerprinted = true;
      if (failure === 'session revocation') f.revoke();
    });
    f.hooks.set('revocation.before', () => {
      if (fingerprinted && failure === 'revocation storage failure') throw Error('SYNTHETIC_REPLAY_REVOCATION_FAILURE');
    });
    const replay = await f.request('POST', command);
    assert.equal(fingerprinted, true);
    assert.equal(replay.status, 401, JSON.stringify(replay.body));
    assert.equal(replay.body.error, 'LOGIN_REQUIRED');
    assert.equal(replay.body.control, undefined); assert.equal(replay.body.receipt, undefined);
    assert.deepEqual(f.row(), before); assert.deepEqual([...f.objects], objects);
    assert.equal(f.stats.cas, 0); assert.equal(f.stats.put, 0); assert.equal(f.stats.head, 0);
  });
}

for (const scope of ['C', 'PROCESS']) {
  void test('non-AB ' + scope + ' replay retains the existing authorization path', async t => {
    const f = await fixture({scope}); t.after(f.close);
    const command = f.command('save'), first = await f.request('POST', command);
    assert.equal(first.status, 200, JSON.stringify(first.body));
    const before = f.row(), objects = [...f.objects]; f.reset();
    const replay = await f.request('POST', command);
    assert.equal(replay.status, 200, JSON.stringify(replay.body));
    assert.deepEqual(replay.body.control, first.body.control);
    assert.deepEqual(replay.body.receipt, first.body.receipt);
    assert.equal(f.stats.revocation, 13); assert.equal(f.stats.sql, 14);
    assert.equal(f.stats.cas, 0); assert.equal(f.stats.put, 0);
    assert.deepEqual(f.row(), before); assert.deepEqual([...f.objects], objects);
  });
}
