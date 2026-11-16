// Actual equipment page events/client/kernel/adapter; synthetic photo I/O only.
import test from 'node:test';import assert from 'node:assert/strict';import {fixture} from '../scripts/equipment-save-choice-fixture.mjs';
const tick=()=>new Promise(setImmediate);
for(const language of ['zh','vi'])void test('equipment '+language+' photo completion stays local-unsaved until explicit Save persists its reference',async()=>{
 const f=await fixture({hold:''});try{
  f.c.document.documentElement.lang=language;assert(await f.explicitSave());const saved=f.state().saved.content.equipment[0].photoId,posts=f.posts().length;f.p.edit();
  const file={size:2,type:'image/png',arrayBuffer:async()=>Uint8Array.of(1,2).buffer},field=f.host.querySelector('#routine-photo-input');field.files=[file];field.dispatchEvent({type:'change',target:field});
  assert.equal(f.calls.filter(c=>c.method==='PUT').length,0);assert.equal(f.posts().length,posts);assert.equal(f.state().saved.content.equipment[0].photoId,saved);assert.match(f.host.querySelector('#routine-shared-status').textContent,/本地|cục bộ/);
  f.host.querySelector('#routine-form-apply').click();await tick();assert.equal(f.p.editId,'');assert.equal(f.posts().length,posts);assert.equal(f.calls.filter(c=>c.method==='PUT').length,0);assert.match(f.host.querySelector('#routine-shared-status').textContent,/本地|cục bộ/);assert(!/已持久化|lưu bền vững/.test(f.host.querySelector('#routine-shared-status').textContent));
  assert(await f.explicitSave());assert.equal(f.posts().length,posts+1);assert.equal(f.calls.filter(c=>c.method==='PUT').length,1);assert.notEqual(f.state().saved.content.equipment[0].photoId,saved);assert.equal(f.p.photos.size,0);assert.match(f.host.querySelector('#routine-shared-status').textContent,/已持久化|lưu bền vững/);
 }finally{f.close();}
});
