// Complete production caller and shared receipt helpers; synthetic in-memory HTTP.
// Save is one atomic save-local-v1 command, not the retired Apply then Save flow.
import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture as durableFixture} from './fixtures/routine-fqc-durable.mjs';
function fixture(){
 const f=durableFixture(),first=f.api.getData().control.documents[0],second=structuredClone(first);
 second.id='second';second.flow.generation='second-generation';
 f.remote.control.documents.push(structuredClone(second));f.api.getData().control.documents.push(second);
 return {...f,first,second,change:()=>{f.api.buffer(first).title='mine';},save:()=>f.api.save(first),commands:()=>f.calls.filter(c=>c.method==='POST').map(c=>JSON.parse(c.body))};
}
void test('routine actual Save atomically saves own buffer then confirms exact saved document before clearing it',async()=>{
 const f=fixture();f.change();await f.save();assert.deepEqual(f.methods(),['GET','POST','GET']);
 const [body]=f.commands();assert.equal(body.command.action,'save');assert.equal(body.command.moduleAction,'save-local-v1');assert.equal(body.command.guards[0].value,'Original');
 assert.equal(f.remote.control.documents[0].flow.saved.content.title,'mine');assert.equal(f.api.s.buffers.has('doc'),false);
});
void test('routine Save pins original document even if selection changes while atomic Save awaits',async()=>{
 const f=fixture();f.change();const prior=structuredClone(f.remote.control.documents[1]);f.afterPost(()=>{f.api.s.selected='second';});await f.save();
 assert.deepEqual(f.commands().map(x=>x.documentId),['doc']);assert.deepEqual(f.remote.control.documents[1],prior);
});
void test('routine newer local input remains after the captured batch is saved',async()=>{
 const f=fixture();f.change();f.afterPost(()=>{f.api.s.buffers.get('doc').title='newer local';});await f.save();
 assert.equal(f.api.s.buffers.get('doc').title,'newer local');assert.equal(f.remote.control.documents[0].flow.saved.content.title,'mine');assert.equal(f.api.s.bases.get('doc').title,'mine');assert.equal(f.api.dirty(f.api.getData().control.documents[0]),true);assert.equal(f.posts(),1);
});
for(const change of ['identity','epoch','delivery','generation'])void test('routine late '+change+' during atomic Save cannot erase local input or issue another write',async()=>{
 const f=fixture();f.change();f.afterPost(()=>{if(change==='identity')f.sync.identity={id:'other'};if(change==='epoch')f.epoch();if(change==='delivery')f.delivery();if(change==='generation')f.api.getData().control.documents[0].flow.generation='replaced';});
 await assert.rejects(f.save(),/DELIVERY_SUPERSEDED|ACCOUNT_CHANGED|STALE_GENERATION/);assert.equal(f.posts(),1);assert.equal(f.api.s.buffers.get('doc').title,'mine');
});
void test('routine unknown atomic Save retains exact input and does not replay on retry',async()=>{
 const f=fixture();f.change();f.setMode('lost');await assert.rejects(f.save());const receipt=JSON.stringify([...f.store.map]);assert.equal(f.api.s.buffers.get('doc').title,'mine');assert(f.api.s.retry);
 await assert.rejects(f.api.postOwned(f.api.s.retry));assert.equal(f.posts(),1);assert.equal(JSON.stringify([...f.store.map]),receipt);
});
void test('routine superseded saved snapshot after acknowledgement keeps input and blocks successful Save',async()=>{
 const f=fixture();f.change();f.afterRead(()=>{if(f.posts()){const d=f.remote.control.documents[0];d.flow.saved={...d.flow.saved,id:'peer-save',content:{...d.flow.saved.content,notes:'peer saved'}};}});
 await assert.rejects(f.save(),/ROUTINE_RECEIPT_READBACK_REQUIRED/);assert.equal(f.api.s.buffers.get('doc').title,'mine');assert.equal(f.posts(),1);
});
void test('routine later unsaved remote input does not replace the exact confirmed saved snapshot',async()=>{
 const f=fixture();f.change();f.afterRead(()=>{if(f.posts())f.remote.control.documents[0].flow.working.notes='new remote change';});await f.save();
 const flow=f.api.getData().control.documents[0].flow;assert.equal(flow.working.notes,'new remote change');assert.equal(flow.saved.content.notes,'');assert.equal(flow.saved.content.title,'mine');assert.equal(f.posts(),1);
});
void test('routine independent Save-only permission can save shared data, but cannot publish a local edit',async()=>{
 const f=fixture();f.remote.permissions.edit=false;f.api.getData().permissions.edit=false;await f.save();assert.deepEqual(f.commands().map(x=>x.command.action),['save']);
 const g=fixture();g.change();g.remote.permissions.edit=false;g.api.getData().permissions.edit=false;await assert.rejects(g.save(),/FORBIDDEN/);assert.equal(g.posts(),0);
});
