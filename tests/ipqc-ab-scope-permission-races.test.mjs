// Actual AB controller/transport/handlers, private SQLite/R2, deterministic permission-reply gates.
import test from 'node:test';
import assert from 'node:assert/strict';
import {setup,writes} from './ipqc-ab-local-browser-fixture.mjs';
async function pendingScopeReply(s){
 await s.page.evaluate(()=>{
  const client=__ABTest.transport(),permissions=client.permissions;
  window.__scopeReplySettled=false;
  client.permissions=async function(...args){try{return await permissions.apply(this,args);}finally{setTimeout(()=>{window.__scopeReplySettled=true;},0);}};
 });
 const held=s.hold(r=>r.method==='GET'&&new URL(r.url,'https://fixture').searchParams.has('permissions')&&new URL(r.url,'https://fixture').searchParams.get('scope')==='A:G');
 await s.page.locator('#ipqcab-line').selectOption('A');await held.started;
 await s.page.locator('#ipqcab-begin').click();
 await s.page.locator('#ipqcab-add-error').click();await s.page.locator('#ab-error-name').fill('晚到權限仍須保留 / Giữ nội dung');
 const input=await s.page.locator('#ab-error-name').elementHandle();
 return{input,release:async()=>{held.release();await s.page.waitForFunction(()=>window.__scopeReplySettled);}};
}
void test('a scope permission reply cannot erase a new error typed while the read is pending',{timeout:30000},async()=>{
 const s=await setup({controllerHooks:true});try{
 const before=s.f.snapshot(),pending=await pendingScopeReply(s);await pending.release();
 assert.equal(await s.page.locator('#ab-error-name').inputValue(),'晚到權限仍須保留 / Giữ nội dung');
 assert.equal(writes(s).length,0);assert.deepEqual(s.f.snapshot(),before);
 await s.page.locator('#ab-apply').click();await s.page.locator('#ipqcab-add-item').waitFor();
 assert.equal((await s.page.evaluate(()=>__ABTest.view().working.errors.at(-1))).name,'晚到權限仍須保留 / Giữ nội dung');assert.equal(writes(s).length,0);assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});
for(const fault of ['actor','same-id actor','epoch','delivery','generation','host'])void test('a late scope permission reply has no private-input side effects after '+fault,{timeout:30000},async()=>{
 const s=await setup({controllerHooks:true});try{
 const before=s.f.snapshot(),pending=await pendingScopeReply(s);
 await s.page.evaluate(fault=>{if(fault==='actor')ProcessSync.identity={...ProcessSync.identity,id:'other'};else if(fault==='same-id actor')ProcessSync.identity={...ProcessSync.identity};else if(fault==='epoch')ProcessSync._epoch++;else if(fault==='delivery')ProcessSync._delivery++;else if(fault==='host')__ABTest.replaceHost();else {const scopes=__ABTest.view().control.scopes;scopes['A:G']={...scopes['A:G'],workflow:{...scopes['A:G']?.workflow,generation:'synthetic-other-generation'}};}},fault);
 await pending.release();assert.equal(await pending.input.evaluate(input=>input.isConnected),true,'stale completion must not repaint or read the private form');
 assert.equal(await s.page.locator('#ab-error-name').inputValue(),'晚到權限仍須保留 / Giữ nội dung');assert.equal(await s.page.evaluate(()=>__ABTest.view().modal.name),'','stale response must not copy input into model');
 assert.equal(writes(s).length,0);assert.deepEqual(s.f.snapshot(),before);assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});

for(const status of [403,503])void test('a current scope permission '+status+' retains unsent private input and never writes',{timeout:30000},async()=>{
 const s=await setup({controllerHooks:true});try{
 const before=s.f.snapshot(),pending=await pendingScopeReply(s);
 s.transform(r=>new URL(r.url,'https://fixture').searchParams.has('permissions')?{status,body:{error:'SYNTHETIC_PERMISSION_READ_FAILED'}}:null);
 await pending.release();
 assert.equal(await s.page.locator('#ab-error-name').inputValue(),'晚到權限仍須保留 / Giữ nội dung');
 assert.equal(writes(s).length,0);assert.deepEqual(s.f.snapshot(),before);assert.deepEqual(s.errors,[]);
 if(status===403)assert.equal(await s.page.locator('#ab-apply').isEnabled(),false,'fresh denial must still close the edit gate');
 }finally{await s.close();}
});
