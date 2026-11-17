import test from 'node:test';import assert from 'node:assert/strict';import {busyC,gate} from './quality-office-c-busy-fixture.mjs';
for(const lang of ['zh','vi']){
 for(const mode of ['success','readback','unknown'])void test('C processing disables moved Save/Submit and admits no second command '+lang+' '+mode,async t=>{
  const c=await busyC(t,{lang,mode}),input=c.area.querySelector('#retained-input'),task=c.api.writeShared('save');await c.started.promise;assert(c.api.get().busy);assert(c.buttons().every(b=>b.disabled&&b.getAttribute('aria-busy')==='true'));assert.equal(c.area.querySelector('#retained-input'),input);assert.equal(input.value,'typed');const posts=c.posts().length;await c.api.writeShared('save');await c.api.writeShared('submit');assert.equal(c.posts().length,posts);c.held.resolve();await task;assert.equal(c.api.get().busy,false);assert.equal(c.posts().length,1);
  if(mode==='unknown'){assert(c.api.sharedTransport().hasUnknown());assert(c.buttons().every(b=>b.disabled),'UNKNOWN retains original write barrier');c.receiptUp();await c.api.checkPreviousOperation();assert.equal(c.posts().length,1,'recovery is GET-only');assert.equal(c.api.sharedTransport().hasUnknown(),false);}
  assert(c.buttons().every(b=>!b.disabled&&b.getAttribute('aria-busy')===null));
 });
 void test('C pre-dispatch error and canceled Submit restore allowed buttons without retry '+lang,async t=>{
  const c=await busyC(t,{lang}),client=c.api.sharedTransport(),flush=client.flush.bind(client);let fail=true;client.flush=async()=>{if(fail){fail=false;throw Error('SYNTHETIC_PREFLIGHT_DOWN');}return flush();};const before=c.f.snapshot();await c.api.writeShared('save');assert.match(c.api.get().message,/SYNTHETIC_PREFLIGHT_DOWN/);assert.equal(c.posts().length,0);assert(c.buttons().every(b=>!b.disabled));assert.deepEqual(c.f.snapshot(),before);
  const answer=gate(),entered=gate();c.box.VersionDraftUI.confirmSubmit=async()=>{entered.resolve();await answer.promise;return null;};const pending=c.api.writeShared('submit');await entered.promise;assert(c.buttons().every(b=>b.disabled));await c.api.writeShared('save');await c.api.writeShared('submit');assert.equal(c.posts().length,0);answer.resolve();await pending;assert(c.buttons().every(b=>!b.disabled));assert.deepEqual(c.f.snapshot(),before);
 });
}

for(const lang of ['zh','vi'])void test('C re-entry waits for the original transport and unlocks only its current allowed buttons '+lang,async t=>{
 const c=await busyC(t,{lang}),task=c.api.writeShared('save');await c.started.promise;await c.box.IPQCCUI.mount(c.area);assert.equal(c.api.get().busy,false);assert(c.api.sharedTransport().hasUnknown());assert(c.buttons().every(b=>b.disabled));assert.equal(c.posts().length,1);c.held.resolve();await task;for(let i=0;i<100&&c.buttons().some(b=>b.disabled);i++)await new Promise(setImmediate);assert.equal(c.api.sharedTransport().hasUnknown(),false);assert(c.buttons().every(b=>!b.disabled));assert.equal(c.posts().length,1,'re-entry observes the original queue without another POST');
});
