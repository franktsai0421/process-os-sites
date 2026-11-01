// Static/orchestration contracts only. This does not execute Chromium or fill UI timings.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {processBrowserActions, runProcessDraftBrowser} from './process-draft-lifecycle-browser.mjs';
import {summarizeActions} from './draft-action-measurement.mjs';

void test('process browser manifest names every required first-batch action explicitly', () => {
  assert.deepEqual(processBrowserActions, [
    'begin', 'local-apply', 'sync-current-canvas', 'save', 'submit-open', 'submit-confirm',
    'withdraw-open', 'withdraw-confirm', 'resubmit-open', 'resubmit-confirm',
    'review-return-open', 'return-open', 'return-confirm', 'returned-submit-open', 'returned-submit-confirm',
    'review-approve-open', 'approve-open', 'approve-confirm',
  ]);
  assert.equal(Object.isFrozen(processBrowserActions), true);
  const unrun = summarizeActions([], processBrowserActions);
  assert.equal(unrun.length, 18); assert(unrun.every(row => row.status === 'NOT_COMPLETE' && row.medianMs === null && row.samples === 0));
});
void test('local blocked browser capability is not retried by this acceptance entry', async () => {
  const before = process.env.CI;
  try { process.env.CI = 'false'; await assert.rejects(runProcessDraftBrowser(), /authorized CI/); }
  finally { if (before === undefined) delete process.env.CI; else process.env.CI = before; }
});
void test('first browser batch uses actual compiled fixture and real UI, no conditional skip or direct POST driver', () => {
  const source = fs.readFileSync(new URL('./process-draft-lifecycle-browser.mjs', import.meta.url), 'utf8');
  assert(source.includes("await import('./root-entry-native-fixture.mjs')"));
  assert(source.includes('cycle <= REQUIRED_SAMPLES'));
  assert.doesNotMatch(source, /if\s*\([^\n]*\.count\(\)/);
  assert.doesNotMatch(source, /route\.fulfill\(|route\.fetch\(|dispatchFetch\(|page\.request\.|fetch\(/);
  assert(source.includes("assert.equal(nativeConfirmations.length, 1"));
  assert(source.includes('assert.deepEqual(pending.contentIssues?.issues || [], seed.expectedContentIssues'));
  assert(source.includes("assert.equal(row.result.contentIssuesConfirmed, true)"));
  assert(source.includes("url.pathname === '/api/process-authoring/workflow'"));
});
