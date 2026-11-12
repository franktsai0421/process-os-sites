import test from 'node:test';import assert from 'node:assert/strict';import path from 'node:path';import {fileURLToPath} from 'node:url';import {workerSource,policySourceLocation} from './helpers/native-worker-source.mjs';
void test('isolated Worker source admits only the two pinned policy query URLs and retains distinct module identity',async()=>{
 const worker=workerSource(),plain=await worker.load('public/process/access-policy.mjs'),versioned=await worker.load('public/process/access-policy.mjs?v=20261110-account-pages1');assert.notEqual(plain,versioned);assert.notEqual(plain.effectiveCells,versioned.effectiveCells);assert.deepEqual([...plain.accessKeys],[...versioned.accessKeys]);
 for(const file of ['public/process/access-policy.mjs?v=wrong','public/process/access-policy.mjs?v=20261110-account-pages1#fragment','public/process/user-access.js?v=20261110-account-pages1'])await assert.rejects(()=>worker.load(file),/SOURCE_EXTENSION_REFUSED/);
 await assert.rejects(()=>worker.load('package.json'),/SOURCE_DIRECTORY_REFUSED/);await assert.rejects(()=>worker.load('../../etc/passwd'),/SOURCE_OUTSIDE_CHECKOUT/);
 const policy=await worker.load('public/process/draft-review-policy.mjs?v=20261110-account-pages1');assert.equal(typeof policy.prepareDraftReviewPolicy,'function');
});

void test('both fixture loaders resolve pinned policy URLs to real files without losing query identity',()=>{
 const root=fileURLToPath(new URL('..',import.meta.url));
 for(const name of ['access-policy','draft-review-policy']){
  const file=path.resolve(root,'public/process/'+name+'.mjs'),plain=policySourceLocation(file),pinned=policySourceLocation(file+'?v=20261110-account-pages1');
  assert.equal(plain.filename,file);assert.equal(plain.moduleKey,file);assert.equal(plain.query,'');
  assert.equal(pinned.filename,file);assert.equal(pinned.moduleKey,file+'?v=20261110-account-pages1');assert.notEqual(pinned.moduleKey,plain.moduleKey);
  for(const suffix of ['?v=wrong','?v=20261110-account-pages1#fragment','?v=20261110-account-pages1&extra=1','?v=wrong.ts'])assert.throws(()=>policySourceLocation(file+suffix),/SOURCE_EXTENSION_REFUSED/);
 }
 assert.throws(()=>policySourceLocation(path.resolve(root,'public/process/user-access.js?v=20261110-account-pages1')),/SOURCE_EXTENSION_REFUSED/);
 assert.throws(()=>policySourceLocation(path.resolve(root,'package.json')),/SOURCE_DIRECTORY_REFUSED/);
 assert.throws(()=>policySourceLocation(path.resolve(root,'../outside.ts')),/SOURCE_OUTSIDE_CHECKOUT/);
 assert.equal(policySourceLocation(path.resolve(root,'lib/user-access')).filename,path.resolve(root,'lib/user-access.ts'));
});
