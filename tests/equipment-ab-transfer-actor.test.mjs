// Actual UI/shared client/TS routes; synthetic identities and SQLite/R2 only.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{createTransferFixture}=require('../scripts/equipment-transfer-fixture.cjs'),{connect}=require('../scripts/test-routine-equipment-isolated-workflow.cjs');
const tick=()=>new Promise(r=>setTimeout(r,5)),copy=x=>JSON.parse(JSON.stringify(x));
async function setup(t){const h=await createTransferFixture();t.after(()=>h.close());const f=await connect(h);delete h.sessions.editor['X-Process-Expected-Actor'];return{h,f};}
async function open(f){f.test.openTransferModal('source');for(let i=0;!f.test.dialog?.preview&&i<1000;i++)await tick();assert(f.test.dialog?.preview);f.test.dialog.targetEqId='target';}
const flow=async h=>copy(h.flow(await h.read('ipqc-ab','editor','&scope=A%3AG-A')));
void test('AB transfer supplies captured actor without session fixture injecting it and retains immutable data',async t=>{
 const{h,f}=await setup(t),before=await flow(h),raw=f.c.fetch,headers=[];f.c.ProcessSync.platformHeaders=()=>({'X-Process-Expected-Actor':'wrong-live-platform-actor'});
 f.c.fetch=async(url,options={})=>{if(String(url).startsWith('/api/ipqc-ab/workflow')&&options.method==='POST')headers.push(new Headers(options.headers).get('X-Process-Expected-Actor'));return raw(url,options);};
 await open(f);const owner=f.test.dialog.owner.actorId;await f.test.executeTransfer('ipqcAB');assert.equal(f.test.dialog.moduleStatus.ipqcAB,'success',f.test.dialog.moduleMessages.ipqcAB);assert(headers.length>0);assert(headers.every(value=>value===owner));const after=await flow(h);assert.equal(after.working.items[0].equipmentId,'target');assert.deepEqual(after.saved,before.saved);assert.deepEqual(after.active,before.active);assert.deepEqual(after.cases,before.cases);
});
for(const drift of ['actor','delivery','epoch'])void test('AB transfer '+drift+' drift stops before POST',async t=>{
 const{h,f}=await setup(t);await open(f);const before=h.snapshot(),posts=f.posts().length;if(drift==='actor')f.rotateActor();if(drift==='delivery')f.rotateDelivery();if(drift==='epoch')f.rotateEpoch();await f.test.executeTransfer('ipqcAB');assert.equal(f.posts().length,posts);assert.deepEqual(h.snapshot(),before);
});
void test('AB header callback retains dialog owner after live actor changes; runtime fence remains closed',async t=>{
 const{f}=await setup(t),create=f.c.createSharedDraftClient;let captured;f.c.createSharedDraftClient=options=>{if(options.endpoint.startsWith('/api/ipqc-ab/workflow'))captured=options;return create(options);};await open(f);const owner=f.test.dialog.owner.actorId;await f.test.executeTransfer('ipqcAB');assert(captured);const posts=f.posts().length;f.rotateActor();assert.equal(captured.headers()['X-Process-Expected-Actor'],owner);assert.equal(captured.actorId,owner);await f.test.executeTransfer('ipqcAB');assert.equal(f.posts().length,posts);
});
for(const invalid of [undefined,'another-actor'])void test('backend still refuses '+String(invalid)+' expected actor atomically',async t=>{
 const{h,f}=await setup(t),raw=f.c.fetch;f.c.fetch=(url,options={})=>{if(String(url).startsWith('/api/ipqc-ab/workflow')&&options.method==='POST'){const headers=new Headers(options.headers);if(invalid===undefined)headers.delete('X-Process-Expected-Actor');else headers.set('X-Process-Expected-Actor',invalid);return raw(url,{...options,headers:Object.fromEntries(headers)});}return raw(url,options);};await open(f);const before=h.snapshot();await f.test.executeTransfer('ipqcAB');assert.equal(f.test.dialog.moduleStatus.ipqcAB,'error');assert(f.posts().some(r=>r.path==='/api/ipqc-ab/workflow'&&r.status===403));assert.deepEqual(h.snapshot(),before);
});
