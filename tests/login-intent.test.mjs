import test from 'node:test';
import assert from 'node:assert/strict';
import {loginDestination, loginIntent} from '../lib/login-destination.mjs';

void test('known login intentions are local navigation, never roles or credentials', () => {
  assert.equal(loginDestination('?next=/setup/import'), '/setup/import');
  assert.equal(loginDestination('?system=quality&view=data&dataTab=quality-iqc'), '/process/index.html?system=quality&view=data&dataTab=quality-iqc');
  assert.equal(loginDestination('?system=process&view=player&line=C&stage=C-CUT'), '/process/index.html?system=process&view=player&line=C&stage=C-CUT');
  assert.equal(loginDestination('?system=process&role=admin&authMode=platform'), '/process/index.html?system=process');
});
void test('arbitrary redirects, duplicate values and cross-line stages are rejected', () => {
  for (const next of ['https://evil.example/', '//evil.example/', '/_sites/private', '/setup/import?next=x']) {
    assert.equal(loginDestination('?next=' + encodeURIComponent(next)), '/process/index.html');
  }
  assert.equal(loginDestination('?next=/setup/import&next=/setup/import'), '/process/index.html');
  assert.equal(loginIntent('?system=process&system=quality&view=player&line=A&stage=C-CUT').toString(), 'system=process&view=player&line=A');
  assert.equal(loginIntent('?view=player&line=A&stage=A-%3Cscript%3E').has('stage'), false);
  assert.equal(loginIntent('?system=quality&view=editor').has('view'), false);
});
void test('all approval tabs survive login in both systems as enumerated display intent', () => {
  for (const system of ['process', 'quality']) for (const tab of ['master', 'process', 'quality', 'routine']) {
    const query = `system=${system}&view=approval&approvalTab=${tab}`;
    assert.equal(loginDestination(query + '&role=admin&next=https://bad.invalid&rfCase=untrusted'), '/process/index.html?' + query);
  }
});
void test('approval intent drops unknown, repeated and non-approval tab parameters', () => {
  for (const value of ['', '__proto__', 'process&approvalTab=quality', 'process&approvalTab=process', '%3Cscript%3E']) {
    assert.equal(loginDestination('system=process&view=approval&approvalTab=' + value), '/process/index.html?system=process&view=approval');
  }
  for (const view of ['dashboard', 'data', 'editor', 'player']) assert.equal(loginIntent(`system=process&view=${view}&approvalTab=process`).has('approvalTab'), false);
  assert.equal(loginIntent('system=process&view=approval&view=data&approvalTab=process').has('approvalTab'), false);
});
