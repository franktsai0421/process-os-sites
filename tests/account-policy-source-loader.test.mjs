import test from 'node:test';import assert from 'node:assert/strict';import {workerSource} from './helpers/native-worker-source.mjs';
void test('isolated Worker source admits only the two pinned policy query URLs and retains distinct module identity',async()=>{
 const worker=workerSource(),plain=await worker.load('public/process/access-policy.mjs'),versioned=await worker.load('public/process/access-policy.mjs?v=20261110-account-pages1');assert.notEqual(plain,versioned);assert.notEqual(plain.effectiveCells,versioned.effectiveCells);assert.deepEqual([...plain.accessKeys],[...versioned.accessKeys]);
 for(const file of ['public/process/access-policy.mjs?v=wrong','public/process/access-policy.mjs?v=20261110-account-pages1#fragment','public/process/user-access.js?v=20261110-account-pages1'])await assert.rejects(()=>worker.load(file),/SOURCE_EXTENSION_REFUSED/);
 await assert.rejects(()=>worker.load('package.json'),/SOURCE_DIRECTORY_REFUSED/);await assert.rejects(()=>worker.load('../../etc/passwd'),/SOURCE_OUTSIDE_CHECKOUT/);
 const policy=await worker.load('public/process/draft-review-policy.mjs?v=20261110-account-pages1');assert.equal(typeof policy.prepareDraftReviewPolicy,'function');
});
