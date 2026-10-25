import test from 'node:test';
import assert from 'node:assert/strict';
import {loginDestination, loginIntent} from '../lib/login-destination.mjs';

test('known login intentions are local navigation, never roles or credentials', () => {
  assert.equal(loginDestination('?next=/setup/import'), '/setup/import');
  assert.equal(loginDestination('?system=quality&view=data&dataTab=quality-iqc'), '/process/index.html?system=quality&view=data&dataTab=quality-iqc');
  assert.equal(loginDestination('?system=process&view=player&line=C&stage=C-CUT'), '/process/index.html?system=process&view=player&line=C&stage=C-CUT');
  assert.equal(loginDestination('?system=process&role=admin&authMode=platform'), '/process/index.html?system=process');
});
test('arbitrary redirects, duplicate values and cross-line stages are rejected', () => {
  for (const next of ['https://evil.example/', '//evil.example/', '/_sites/private', '/setup/import?next=x']) {
    assert.equal(loginDestination('?next=' + encodeURIComponent(next)), '/process/index.html');
  }
  assert.equal(loginDestination('?next=/setup/import&next=/setup/import'), '/process/index.html');
  assert.equal(loginIntent('?system=process&system=quality&view=player&line=A&stage=C-CUT').toString(), 'system=process&view=player&line=A');
  assert.equal(loginIntent('?view=player&line=A&stage=A-%3Cscript%3E').has('stage'), false);
  assert.equal(loginIntent('?system=quality&view=editor').has('view'), false);
});
