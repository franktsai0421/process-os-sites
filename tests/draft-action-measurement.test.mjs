import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {summarizeActions, requiredClick, captureRequests, measureAction} from './draft-action-measurement.mjs';

const sample = (cycle, ms = cycle) => ({action: 'save', cycle, ms, layer: 'CI_SYNTHETIC_BROWSER', status: 'PASS', stateVerified: true, mandatoryClick: true, networkComplete: true, requests: {GET: 1, POST: 1, requestBytes: 10, responseBytes: 100}});
void test('five independent complete samples, median/max and slow maximum remain distinct', () => {
  const rows = [sample(1, 100), sample(2, 1100), sample(3, 400), sample(4, 300), sample(5, 200)];
  const [summary] = summarizeActions(rows, ['save']);
  assert.equal(summary.status, 'PASS_FUNCTION_MEASURED'); assert.equal(summary.medianMs, 300); assert.equal(summary.maxMs, 1100);
  assert.equal(summary.medianOver1000ms, false); assert.equal(summary.maxOver1000ms, true); assert.equal(summary.requests.length, 5);
});
void test('not run and incomplete actions retain null timing, not zero or function-only speed', () => {
  for (const rows of [[], [sample(1)], Array.from({length: 4}, (_, i) => sample(i + 1))]) {
    const [summary] = summarizeActions(rows, ['save']); assert.equal(summary.medianMs, null); assert.equal(summary.maxMs, null); assert.equal(summary.status, 'NOT_COMPLETE');
  }
});
void test('a failed fifth case never becomes a four-sample success', () => {
  const rows = Array.from({length: 4}, (_, i) => sample(i + 1)); rows.push({...sample(5), status: 'FAIL', ms: null});
  const [summary] = summarizeActions(rows, ['save']); assert.equal(summary.status, 'FAIL'); assert.equal(summary.medianMs, null);
});
for (const [name, value] of [['layer', 'API_VM'], ['stateVerified', false], ['mandatoryClick', false], ['networkComplete', false], ['ms', NaN]]) {
  void test('reject false UI completion evidence: ' + name, () => {
    assert.throws(() => summarizeActions([{...sample(1), [name]: value}], ['save']));
  });
}
void test('duplicate/missing scenario identity cannot inflate coverage', () => {
  assert.throws(() => summarizeActions([sample(1), sample(1)], ['save']));
  assert.throws(() => summarizeActions([{...sample(1), action: 'not-registered'}], ['save']));
  assert.throws(() => summarizeActions([], ['save', 'save'])); assert.throws(() => summarizeActions([], ['save'], 1));
});
for (const [name, values] of [['missing', [0, true, true]], ['ambiguous', [2, true, true]], ['hidden', [1, false, true]], ['disabled', [1, true, false]]]) {
  void test('mandatory control rejects ' + name + ' instead of exists-then-skip', async () => {
    let clicked = 0, evaluated = 0;
    const target = {count: async () => values[0], isVisible: async () => values[1], isEnabled: async () => values[2], click: async () => { clicked++; }};
    await assert.rejects(requiredClick({locator: () => target, evaluate: async () => { evaluated++; }}, '#required'));
    assert.equal(clicked, 0); assert.equal(evaluated, 0);
  });
}
void test('request accounting stores only safe metadata, excludes other origins and stops its window', async () => {
  const page = new EventEmitter(), stop = captureRequests(page, 'https://fixture.invalid');
  const req = (url, method = 'GET', body = '') => ({url: () => url, method: () => method, postData: () => body});
  const accepted = req('https://fixture.invalid/api/example?private=do-not-record', 'POST', '{"reason":"synthetic"}');
  page.emit('request', accepted); page.emit('request', req('https://elsewhere.invalid/api/example')); page.emit('request', req('https://fixture.invalid/process/app.js'));
  page.emit('response', {request: () => accepted, status: () => 200, body: async () => Buffer.from('synthetic response')});
  const result = await stop(); assert.equal(result.networkComplete, true); assert.equal(result.requests.POST, 1); assert.equal(result.requests.responseBytes, 18);
  assert.equal(result.requests.rows[0].path, '/api/example'); assert.equal(JSON.stringify(result).includes('private'), false); assert.equal(JSON.stringify(result).includes('reason'), false);
  assert.equal(result.requests.rows[0].clientTiming, null); assert.equal(result.requests.rows[0].serverTiming, null);
  assert.equal(page.listenerCount('request'), 0); assert.equal(page.listenerCount('response'), 0); await assert.rejects(stop());
});
void test('available client phases and Server-Timing remain separate observable evidence', async () => {
  const page = new EventEmitter(), stop = captureRequests(page, 'https://fixture.invalid');
  const request = {url: () => 'https://fixture.invalid/api/workflow', method: () => 'GET', postData: () => null,
    timing: () => ({startTime: 100, domainLookupStart: -1, responseStart: 3000, responseEnd: 3001, unrelated: 'never-copy'})};
  page.emit('request', request);
  page.emit('response', {request: () => request, status: () => 200, body: async () => Buffer.from('{}'), headerValue: async name => { assert.equal(name, 'server-timing'); return 'synthetic;dur=2'; }});
  const result = await stop(), row = result.requests.rows[0];
  assert.deepEqual(row.clientTiming, {startTime: 100, domainLookupStart: -1, responseStart: 3000, responseEnd: 3001});
  assert.equal(row.serverTiming, 'synthetic;dur=2'); assert.equal(row.responseBytes, 2);
  assert.equal(Object.hasOwn(row, 'databaseMs'), false); assert.equal(Object.hasOwn(row, 'cpuMs'), false);
});
void test('in-flight request without final response is incomplete, not a zero-byte success', async () => {
  const page = new EventEmitter(), stop = captureRequests(page, 'https://fixture.invalid', {responseDeadlineMs: 1});
  page.emit('request', {url: () => 'https://fixture.invalid/api/pending', method: () => 'GET', postData: () => null});
  const result = await stop(); assert.equal(result.networkComplete, false); assert.equal(result.requests.rows[0].responseBytes, null);
});
void test('request window closes at UI-ready but its existing responses are drained', async () => {
  const page = new EventEmitter(), stop = captureRequests(page, 'https://fixture.invalid', {responseDeadlineMs: 1000});
  const request = {url: () => 'https://fixture.invalid/api/workflow', method: () => 'GET', postData: () => null};
  page.emit('request', request); const resultPromise = stop();
  page.emit('request', {url: () => 'https://fixture.invalid/api/later', method: () => 'GET', postData: () => null});
  page.emit('response', {request: () => request, status: () => 200, body: async () => Buffer.from('{}')});
  const result = await resultPromise; assert.equal(result.networkComplete, true); assert.equal(result.requests.GET, 1); assert.equal(result.requests.responseBytes, 2);
});
void test('missing required button produces an explicit failed measurement, not a skipped row', async () => {
  const page = new EventEmitter(); page.locator = () => ({count: async () => 0}); const samples = [];
  await assert.rejects(measureAction({page, origin: 'https://fixture.invalid', action: 'begin', cycle: 1, selector: '#begin', ready: async () => {}, verify: async () => {}, samples}));
  assert.equal(samples.length, 1); assert.equal(samples[0].status, 'FAIL'); assert.equal(samples[0].ms, null); assert.equal(samples[0].mandatoryClick, false);
});


async function disabledBackgroundCase({action = 'return-confirm', method = 'GET', path = '/api/routine-fqc', status = 404,
  body = '{"error":"FQC_NOT_ENABLED"}', failed = false, bodyThrows = false, postCount = 1, policy = {}, expectedPost = 1, omitPostAssertion = false, verifyThrows = false} = {}) {
  const page = new EventEmitter(), samples = []; let verified = 0;
  page.evaluate = async () => 25;
  page.locator = () => ({count: async () => 1, isVisible: async () => true, isEnabled: async () => true, click: async () => {
    for (const entry of [...Array.from({length: postCount}, () => ({method: 'POST', path: '/api/process-authoring/workflow', status: 200, body: '{}'})), {method, path, status, body, failed, bodyThrows}]) {
      const req = {url: () => 'https://fixture.invalid' + entry.path, method: () => entry.method, postData: () => entry.method === 'POST' ? '{}' : null,
        timing: () => ({startTime: 100, responseStart: 20, responseEnd: 21})};
      page.emit('request', req);
      page.emit('response', {request: () => req, status: () => entry.status, body: async () => { if (entry.bodyThrows) throw Error('BODY_UNAVAILABLE'); return Buffer.from(entry.body); }});
      if (entry.failed) page.emit('requestfailed', req);
    }
  }});
  const run = measureAction({page, origin: 'https://fixture.invalid', action, cycle: 1, selector: '#confirm', ready: async () => {},
    verify: async () => { verified++; if (verifyThrows) throw Error('STATE_NOT_CORRECT'); }, samples, expectedPost: omitPostAssertion ? undefined : expectedPost,
    disabledRoutineBackground: policy === null ? undefined : {seedDisabled: true, before: true, current: async () => true, ...policy}});
  return {run, samples, verified: () => verified};
}
for (const action of ['return-confirm', 'approve-confirm']) void test('exact observed disabled badge response is counted, not dropped: ' + action, async () => {
  const f = await disabledBackgroundCase({action}); await f.run;
  const row = f.samples[0]; assert.equal(row.status, 'PASS'); assert.equal(row.stateVerified, true); assert.equal(f.verified(), 1);
  assert.equal(row.requests.POST, 1); assert.equal(row.requests.GET, 1); assert.equal(row.requests.responseBytes, 29); assert.equal(row.requests.requestBytes, 2);
  assert.equal(row.requests.rows[1].status, 404); assert.equal(row.requests.rows[1].observedBodyContract, 'FQC_NOT_ENABLED_ONLY');
  assert.equal(row.requests.rows[1].classification, 'EXPECTED_DISABLED_BACKGROUND'); assert.equal(row.requests.rows[1].clientTiming.responseEnd, 21);
});
for (const [name, options] of [
  ['default strict collector', {policy: null}], ['wrong phase', {action: 'save'}], ['no post assertion', {omitPostAssertion: true}],
  ['enabled or unknown fixture', {policy: {seedDisabled: false}}], ['wrong initial reviewer page', {policy: {before: false}}],
  ['late actor or page change', {policy: {current: async () => false}}], ['missing current probe', {policy: {current: null}}],
  ['wrong endpoint', {path: '/api/process-authoring/workflow'}], ['receipt query', {path: '/api/routine-fqc?operationId=original'}],
  ['availability query', {path: '/api/routine-fqc?availability=1'}], ['wrong method', {method: 'POST'}],
  ['unknown 404', {body: '{"error":"OPERATION_NOT_FOUND"}'}], ['server 500', {status: 500}], ['forbidden 403', {status: 403}],
  ['extra body field', {body: '{"error":"FQC_NOT_ENABLED","secret":"DO_NOT_REPORT"}'}], ['wrong code type', {body: '{"error":["FQC_NOT_ENABLED"]}'}],
  ['duplicate key', {body: '{"error":"OTHER","error":"FQC_NOT_ENABLED"}'}],
  ['bare code', {body: '"FQC_NOT_ENABLED"'}], ['malformed body', {body: '{'}], ['oversized body', {body: ' '.repeat(65) + '{"error":"FQC_NOT_ENABLED"}'}],
  ['network failure', {failed: true}], ['body read failure', {bodyThrows: true}], ['wrong POST count contract', {expectedPost: 0}], ['additional POST', {postCount: 2}], ['missing POST', {postCount: 0}],
]) {
  if (typeof name !== 'string') throw Error('INVALID_TEST_CASE_NAME');
  void test('disabled background exception refuses ' + name, async () => {
  const f = await disabledBackgroundCase(options); await assert.rejects(f.run);
  assert.equal(f.samples[0].status, 'FAIL'); assert.equal(f.samples[0].ms, null); assert.equal(f.verified(), 0);
  assert.equal(JSON.stringify(f.samples).includes('DO_NOT_REPORT'), false);
  });
}
void test('expected badge response never substitutes for authoritative state validation', async () => {
  const f = await disabledBackgroundCase({verifyThrows: true}); await assert.rejects(f.run, /STATE_NOT_CORRECT/);
  assert.equal(f.verified(), 1); assert.equal(f.samples[0].status, 'FAIL'); assert.equal(f.samples[0].ms, null);
});

void test('Begin-v1 keeps both authority GETs and raw transfer costs in the measured window', async () => {
  const page = new EventEmitter(), stop = captureRequests(page, 'https://fixture.invalid');
  const payload = JSON.stringify({action: 'begin-v1', begin: {operationId: 'private-operation-id', basis: {openVersionId: 'private-version'}}});
  for (const [method, data] of [['GET', null], ['POST', payload], ['GET', null]]) {
    const req = {url: () => 'https://fixture.invalid/api/fqc/workflow?caseMetadata=1', method: () => method, postData: () => data};
    page.emit('request', req);page.emit('response', {request: () => req, status: () => 200, body: async () => Buffer.from('{}')});
  }
  const result = await stop();
  assert.equal(result.networkComplete, true);assert.equal(result.requests.POST, 1);assert.equal(result.requests.GET, 2);
  assert.equal(result.requests.requestBytes, Buffer.byteLength(payload));assert.equal(result.requests.responseBytes, 6);
  assert.deepEqual(result.requests.rows.map(row => row.beginProtocol), [null, 'begin-v1', null]);assert.equal(JSON.stringify(result).includes('private-'), false);
});
