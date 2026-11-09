import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {workerSource} from './helpers/native-worker-source.mjs';
void test('native source fixture loads real policy/identity/workflow/feedback without dependencies or network',async()=>{
 const source=workerSource({PROCESS_SESSION_SECRET:randomUUID()});
 const users=await source.load('lib/user-access.ts');assert.equal(typeof users.effectiveAccess,'function');
 const core=await source.load('lib/process-state.ts');assert.equal(typeof core.readState,'function');
 const workflow=await source.load('lib/versioned-shared-workflow.ts');assert.equal(typeof workflow.versionedWorkflowRoute,'function');
 const feedback=await source.load('lib/web-feedback.ts');assert.equal(typeof feedback.handleFeedback,'function');
 assert(source.loadedModules.every(name=>!name.includes('node_modules')));
});
void test('native source fixture refuses entries outside the checkout and non-source extensions',async()=>{
 const source=workerSource();await assert.rejects(()=>source.load('../outside.ts'),/SOURCE_OUTSIDE_CHECKOUT/);await assert.rejects(()=>source.load('lib/synthetic.json'),/SOURCE_EXTENSION_REFUSED/);await assert.rejects(()=>source.load('tests/native-worker-source.test.mjs'),/SOURCE_DIRECTORY_REFUSED/);
});
