import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {fixture,posts} from './bom-navigation-actual-fixture.mjs';
function departure(f){const source=fs.readFileSync('public/process/version-draft-ui.js','utf8'),helper=source.slice(source.indexOf('  function createDeparture(config){'),source.indexOf('  host.VersionDraftUI='));vm.runInContext(helper.replaceAll('host.','window.')+'\nwindow.VersionDraftUI.createDeparture=createDeparture;',f.box);const root=f.document.createElement('main');root.id='data-content';f.document.body.append(root);const host=f.document.createElement('section');host.className='bw-workspace';root.append(host);return f.box.BOMWorkspace.navigation.departure;}
void test('BOM actual departure abandons only current unsent input, preserving legacy local records and shared state',async()=>{
 const f=await fixture();try{const adapter=departure(f),remote=JSON.stringify(f.remote);f.data.set('process-local-draft-v1:legacy','retained');f.storageCalls.length=0;f.start();f.edit();f.tick();const lease=await adapter.abandon();assert.equal(f.storageCalls.filter(([kind])=>kind==='set'||kind==='remove').length,0);assert.equal(adapter.inspect().state,'departing');assert.equal(f.api.state().pending.length,0);assert.equal(f.api.state().edit,null);assert.equal(JSON.stringify(f.remote),remote);assert.equal(posts(f).length,0);assert.equal(f.data.get('process-local-draft-v1:legacy'),'retained');adapter.closeClean();lease.release();}finally{await f.close();}
});
void test('BOM unidentified legacy command is retained and never reported clean',async()=>{
 const raw='old operation without identity',f=await fixture({legacy:raw});try{const adapter=departure(f);assert.equal(adapter.inspect().state,'unknown');assert.equal(adapter.inspect().canAbandon,false);await assert.rejects(adapter.abandon());assert.equal(posts(f).length,0);assert([...f.data.values()].includes(raw));}finally{await f.close();}
});
for(const damaged of [false,true])void test(`BOM unknown Save ${damaged?'damaged helper blocks departure':'retains sent identity and returns receipt-only'}`,async()=>{
 const f=await fixture({mode:'save-unknown'});try{const adapter=departure(f);f.start();f.edit('itemName','Sent');await assert.rejects(f.save());const flight=f.api.flight(),key=f.session().key,raw=f.data.get(key),command=JSON.stringify(flight.command),markers=[...f.data].filter(([k])=>k.startsWith('shared-draft-receipt-only-v1:'));
  if(damaged){f.data.set(key,'{broken');assert.equal(adapter.inspect().canAbandon,false);await assert.rejects(adapter.abandon());assert.equal(f.api.flight(),flight);assert.equal(posts(f).length,1);return;}
  const lease=await adapter.abandon();assert.equal(adapter.inspect().state,'departing');assert.equal(f.api.flight(),flight);assert.equal(JSON.stringify(flight.command),command);assert.equal(f.data.get(key),raw);assert.deepEqual([...f.data].filter(([k])=>k.startsWith('shared-draft-receipt-only-v1:')),markers);adapter.closeClean();lease.release();f.api.reset();f.delivery();f.mode('ok');await f.api.read();assert.equal(posts(f).length,1);assert.equal(f.api.transport().hasUnknown(),false);assert.equal(f.api.state().control.workflow.saved.content.bom.ROOT[0].itemName,'Sent');assert.equal(f.data.get(key),raw,'historic helper marker awaits explicit settlement');await f.api.settleRecord(key);assert.equal(f.data.has(key),false);assert.equal(posts(f).length,1);
 }finally{await f.close();}
});
