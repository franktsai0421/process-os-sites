// Actual BOM UI/helper/session/primary transport; synthetic DOM/storage/fetch.
// No server/browser/network. Unknown results are resolved only by original receipt.
import assert from 'node:assert/strict';
import {fixture,posts,gets} from '../tests/bom-navigation-actual-fixture.mjs';
const f=await fixture(),host=f.document.createElement('section'),link=f.document.createElement('a');host.className='bw-workspace';f.document.body.append(host,link);let confirms=0;f.box.confirm=()=>{confirms++;return false;};
const row=()=>f.api.state().editor.ROOT[1],start=()=>f.start(1),dirty=()=>f.api.dirty();
const event=type=>({type,prevented:false,preventDefault(){this.prevented=true;}});
const leave=()=>{const e=event('click');e.target=link;f.document.dispatchEvent(e);return e.prevented;};
const unload=()=>{const e=event('beforeunload');f.box.dispatchEvent(e);return e.prevented;};
try{
 assert.equal(dirty(),false);assert.equal(leave(),false);assert.equal(unload(),false);start();assert.equal(dirty(),false);assert.equal(leave(),false);assert.equal(confirms,0);
 f.edit('itemName','修改',1);assert.equal(dirty(),true);assert.equal(leave(),true);assert.equal(unload(),true);await f.save();assert.deepEqual(posts(f).map(e=>e.body.command.action),['apply','save']);assert.equal(gets(f).length,1);assert.equal(dirty(),false);assert.equal(leave(),false);assert.equal(f.remote.saved.content.bom.ROOT[1].itemName,'修改');await f.api.read();assert.equal(row().itemName,'修改');assert.equal(dirty(),false);
 start();f.edit('itemName','未存',1);f.mode('save-unknown');await assert.rejects(f.save());assert.equal(f.api.state().pending.length,0);assert(f.api.state().saveCommand);assert.equal(dirty(),true);assert.equal(leave(),true);assert.equal(row().itemName,'未存');const postCount=posts(f).length,key=f.session().key;
 await assert.rejects(f.save(),/UNKNOWN/);await assert.rejects(f.api.settleRecord(key),/OPERATION_NOT_FOUND/);assert.equal(posts(f).length,postCount);f.mode('ok');await f.api.settleRecord(key);assert.equal(posts(f).length,postCount);assert.equal(f.api.state().saveCommand,null);assert.equal(dirty(),false);assert.equal(f.remote.saved.content.bom.ROOT[1].itemName,'未存');
 f.api.setBatch({changes:[{decision:'keep'}]});await assert.rejects(f.save(),/尚未套用/);assert.equal(posts(f).length,postCount);assert.equal(dirty(),true);assert.equal(leave(),true);f.document.documentElement.lang='vi';await assert.rejects(f.save(),/chưa được áp dụng/);f.document.documentElement.lang='zh';
 f.api.setBatch({changes:[]});assert.equal(dirty(),false);await f.save();assert.equal(f.api.state().batch,null);
 start();f.remote.working.bom.ROOT[1].itemName='別人已存';f.remote.saved.content=structuredClone(f.remote.working);f.remote.revision++;await f.api.read();assert.equal(f.api.state().edit,null);assert.equal(row().itemName,'別人已存');assert.equal(dirty(),false);
 start();f.edit('itemName','我的未存',1);await f.api.read();assert.equal(row().itemName,'我的未存');assert.equal(dirty(),true);
 const pending=await fixture();try{pending.remote.pendingId='locked';await pending.api.read();assert.equal(pending.api.dirty(),false);await assert.rejects(pending.save(),/FORBIDDEN/);assert.equal(posts(pending).length,0);}finally{await pending.close();}
 const unknown=await fixture({mode:'unknown'});try{unknown.start();unknown.edit();await assert.rejects(unknown.save());assert.equal(unknown.api.dirty(),true);assert(unknown.api.transport().hasUnknown());const n=posts(unknown).length;await assert.rejects(unknown.save(),/UNKNOWN/);assert.equal(posts(unknown).length,n);}finally{await unknown.close();}
 const rejected=await fixture({mode:'invalid422'});try{rejected.start();rejected.edit();await assert.rejects(rejected.save());assert.equal(rejected.api.transport().hasUnknown(),false);assert.equal(rejected.api.transport().hasSyncFailures(),true);assert.equal(rejected.api.dirty(),true);assert.equal(posts(rejected).length,1);}finally{await rejected.close();}
 await assert.rejects(fixture({omitRecoveryHelper:true}),/RECOVERY_HELPER_UNAVAILABLE/);await assert.rejects(fixture({incompleteStorage:true}),/RECOVERY_RECORD_INVALID/);
 console.log('PASS BOM actual-stack navigation: clean/edit/leave/unload, Save, original-receipt-only lost Save/404, imports/localization, peer/newer input, pending, missing helper/storage fail closed; no browser or timing claim');
}finally{await f.close();}
