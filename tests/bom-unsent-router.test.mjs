// Actual BOM closure, departure adapter, navigation coordinator and router.
// Synthetic DOM, destination projection, storage and HTTP only. No browser claim.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as coordinatorModule from '../public/process/navigation-lifecycle.mjs';
import * as policy from '../public/process/delivery-purpose.mjs';
import {fixture,posts,gets,domain,clone,turn} from './bom-navigation-actual-fixture.mjs';
const source=fs.readFileSync(new URL('../public/process/delivery-navigation.js',import.meta.url),'utf8').replace(/import\('\.\/navigation-lifecycle\.mjs\?v=[^']+'\)/,'Promise.resolve(coordinatorModule)');
async function router({allowReload=false,...options}={}){
 let reloads=0;
 const f=await fixture({...options,realDepartureUI:true}),b=f.box,d=f.document,s=b.ProcessSync;
 const records=[];f.setHook((key,value)=>{if(key.startsWith('process-local-draft-v2:'))records.push(JSON.parse(value));});let confirms=0,dialogs=0;const create=d.createElement;d.createElement=tag=>{if(tag==='dialog')dialogs++;return create(tag);};b.confirm=()=>{confirms++;return false;};
 const root=d.createElement('main');root.id='view-root';d.body.append(root);
 const mount=()=>{const content=d.createElement('section');content.id='data-content';content.dataset.activeTab='bom';const host=d.createElement('section');host.className='bw-workspace';content.append(host);root.append(content);};mount();
 b.location={origin:'https://fixture.invalid',pathname:'/process/',href:'https://fixture.invalid/process/?view=data&dataTab=bom&system=process',get search(){return new URL(this.href).search;},reload(){if(!allowReload)throw Error('UNEXPECTED_RELOAD');reloads++;}};
 b.history={state:{},replaceState(state,_title,url){this.state=state;b.location.href=String(url);},pushState(state,_title,url){this.state=state;b.location.href=String(url);},go(){throw Error('UNEXPECTED_HISTORY_GO');}};
 b.state={view:'data',dataTab:'bom',approvalTab:'master'};b.coordinatorModule=coordinatorModule;b.ProcessDeliveryPurpose=policy;
 Object.assign(s,{deliveryProjection:true,destination:{view:'data',dataTab:'bom',system:'process'},async prepareDestination(target){return{destination:target};},validateDestination(){},commitDestination(handle){f.delivery();this.destination=handle.destination;this.catalog={};}});
 b.ProcessRuntimeProjection={install(){}};b.MasterDataWorkflow={resetProjection(){}};b.ProcessDataTabs={async readyForDestination(){if(s.destination.dataTab==='bom')await f.api.read();}};
 b.navigate=()=>{if(s.destination.dataTab==='bom')mount();};b.render=()=>{};b.toast=value=>{throw Error('Unexpected router toast: '+value);};
 vm.runInContext(source,b);await b.ProcessDeliveryNavigation.initialized;
 const nav=b.ProcessDeliveryNavigation;
 return Object.assign(f,{nav,records,reloads:()=>reloads,confirms:()=>confirms,dialogs:()=>dialogs,async go(view,tab,{expectError=false}={}){assert.equal(nav.navigate(view,tab),true);for(let n=0;n<30;n++){await turn();if(nav.current().view===view&&nav.current().dataTab===(tab||null)&&d.documentElement.dataset.processNavigationStatus===(expectError?'error':'ready'))return;}assert.fail('Router failed to settle: '+JSON.stringify({current:nav.current(),departure:b.BOMWorkspace.navigation.departure.inspect(),dialogs}));}});
}
function noUnsentStorage(f){for(const record of f.records){assert.equal(record.kind,'unknown','only sent receipt metadata may be persisted');assert(record.receipt.operationId);assert(record.receipt.generation);for(const key of ['payload','editor','pending','batch','editing','groups','patches'])assert.equal(record[key],undefined,'no unsent '+key);}}
function noPrompts(f){assert.equal(f.confirms(),0);assert.equal(f.dialogs(),0);}
function unload(f){const e={type:'beforeunload',prevented:false,preventDefault(){this.prevented=true;}};f.box.dispatchEvent(e);assert.equal(e.prevented,false);assert.equal(e.returnValue,undefined);}
const six={itemName:'Unsent name',specification:'Unsent spec',unit:'set',quantity:'7',denominator:'3',waste:'2'};
function typeSix(f){f.start(1);for(const [field,value]of Object.entries(six))f.edit(field,value,1);}
function importBatch(f){const sheets=[{name:'BOM',rows:[domain.columns,['ROOT','0','','ROOT','Original','Spec','pc','1','1','0'],['ROOT','1','10','PART','Imported only in RAM','Part spec','ea','2','1','3'],['ROOT','2','20','DEEP','Deep','Deep spec','kg','','','']]}];const incoming=domain.parseMatrices(sheets),batch=domain.compare(f.api.editor(),incoming);for(const change of batch.changes)change.decision='accept';Object.assign(batch,{sheets,file:'synthetic.xlsx'});f.api.setBatch(batch);}
for(const kind of ['unfinished six fields','completed pending batch','unapplied import','applied import'])void test('actual router silently abandons '+kind+' and repeated reentry never restores',async()=>{
 const f=await router();try{const original=clone(f.remote.saved.content.bom);for(let repeat=0;repeat<2;repeat++){
  if(kind.includes('import')){importBatch(f);if(kind==='applied import')await f.api.finishImport();}else{typeSix(f);if(kind==='completed pending batch')await f.finish();}
  assert.equal(f.api.dirty(),true,'dirty remains meaningful before departure');f.tick();noUnsentStorage(f);unload(f);assert.equal(posts(f).length,0);
  await f.go('dashboard');noPrompts(f);assert.equal(posts(f).length,0,'departure does not autosave');assert.equal(f.api.state().edit,null);assert.equal(f.api.state().batch,null);assert.equal(f.api.state().pending.length,0);
  await f.go('data','bom');assert.deepEqual(clone(f.api.editor()),original);assert.equal(f.api.dirty(),false);noUnsentStorage(f);noPrompts(f);
 }}finally{await f.close();}
});
void test('actual router explicit Save still commits six fields and reentry reads saved content',async()=>{
 const f=await router();try{typeSix(f);assert(f.api.dirty());await f.save();assert.equal(posts(f).length,1);assert.equal(posts(f)[0].body.command.action,'save');assert.equal(f.api.dirty(),false);await f.go('dashboard');await f.go('data','bom');for(const [field,value]of Object.entries(six))assert.equal(f.api.editor().ROOT[1][field],value);noUnsentStorage(f);noPrompts(f);}finally{await f.close();}
});
void test('actual router durable UNKNOWN silently leaves but 404/reentry only queries original receipt',async()=>{
 const f=await router({mode:'save-unknown'});try{typeSix(f);await assert.rejects(f.save());const sent=clone(posts(f)[0].body.command),before=[...f.data];assert.equal(f.api.transport().hasUnknown(),true);unload(f);await f.go('dashboard');noPrompts(f);assert.equal(posts(f).length,1);for(const [key,value]of before)assert.equal(f.data.get(key),value,'sent markers retained');
  await f.go('data','bom',{expectError:true});assert.equal(posts(f).length,1);const lookups=gets(f).filter(c=>new URL(c.url,'https://fixture.invalid').searchParams.has('operationId'));assert(lookups.length>0);for(const call of lookups)assert.equal(new URL(call.url,'https://fixture.invalid').searchParams.get('operationId'),sent.operationId);
  await assert.rejects(f.save());assert.equal(posts(f).length,1,'404 must never resend');assert(f.api.transport().hasUnknown());noUnsentStorage(f);noPrompts(f);
 }finally{await f.close();}
});
void test('actual beforeunload/pagehide drops ordinary RAM without storage or mutation',async()=>{
 const f=await router();try{typeSix(f);unload(f);f.box.dispatchEvent({type:'pagehide'});await turn();assert.equal(f.api.state().pending.length,0);assert.equal(f.api.state().edit,null);assert.equal(f.api.state().batch,null);assert.equal(f.api.dirty(),false);assert.equal(posts(f).length,0);noUnsentStorage(f);noPrompts(f);}finally{await f.close();}
});
void test('pagehide during explicit Save drops unsent buffers but retains exact sent command',async()=>{
 const f=await router();let release;const held=new Promise(resolve=>release=resolve);try{
  typeSix(f);f.hook(async call=>{if(call.body?.command)await held;});const saving=f.save().then(value=>({value}),error=>({error}));for(let n=0;n<30&&!posts(f).length;n++)await turn();assert.equal(posts(f).length,1);const sent=clone(posts(f)[0].body.command);
  f.box.dispatchEvent({type:'pagehide'});await turn();const current=f.api.state();assert.equal(current.edit,null);assert.equal(current.batch,null);assert.equal(current.pending.length,0);assert(!JSON.stringify(current.editor).includes('Unsent name'),'visible unsent editor released');
  assert.deepEqual(clone(f.api.flight().command),sent,'exact sent command remains owned, not a rebuilt editor payload');const retained=JSON.stringify({flight:f.api.flight(),isolated:f.api.isolated(),saveCommand:current.saveCommand});assert(retained.includes(sent.operationId),'sent operation retained until result is known');assert(retained.includes(sent.expectedGeneration||sent.generation),'sent generation retained');
  for(const item of f.api.isolated())for(const key of ['editor','pending','batch','edit'])assert(!item[key]||Array.isArray(item[key])&&item[key].length===0,'no unsent '+key+' in retained flight');
  release();const outcome=await saving;if(outcome.error)assert.match(outcome.error.message,/OWNER_CHANGED|SUPERSEDED|CONTEXT_CHANGED/);assert.equal(posts(f).length,1);noUnsentStorage(f);noPrompts(f);
 }finally{release?.();await f.close();}
});
for(const condition of ['missing recovery helper','recovery storage quota'])void test('actual router RAM typing/departure survives '+condition+' while explicit Save fails closed',async()=>{
 const f=await router(condition==='missing recovery helper'?{omitRecoveryHelper:true}:{});try{
  if(condition==='recovery storage quota')f.setHook((key,_value)=>{if(key.startsWith('process-local-draft-'))throw Error('SYNTHETIC_QUOTA');});
  typeSix(f);assert(f.api.dirty());f.tick();unload(f);await f.go('dashboard');await f.go('data','bom');assert.equal(f.api.dirty(),false);assert.equal(f.api.editor().ROOT[1].itemName,'Part');typeSix(f);await assert.rejects(f.save(),/RECOVERY_|STORAGE_WRITE_FAILED/);assert.equal(posts(f).length,0);noPrompts(f);noUnsentStorage(f);
 }finally{await f.close();}
});
void test('standalone old local payload stays byte-for-byte, cannot restore/discard, and no background poll is introduced',async()=>{
 const f=await router();try{const key='process-local-draft-v1:legacy',raw=JSON.stringify({kind:'local',payload:{itemName:'Old unsent'}});f.data.set(key,raw);await assert.rejects(f.api.restoreRecord(key,async()=>true),/UNSENT_RECOVERY_DISABLED/);await assert.rejects(f.api.discardRecord(key,async()=>true),/UNSENT_RECOVERY_DISABLED/);typeSix(f);for(let i=0;i<5;i++)f.tick();assert.equal(f.calls.length,0);await f.go('dashboard');await f.go('data','bom');assert.equal(f.data.get(key),raw);assert.equal(f.api.editor().ROOT[1].itemName,'Part');assert.equal(posts(f).length,0);noPrompts(f);
  const product=fs.readFileSync(new URL('../public/process/bom-workspace.js',import.meta.url),'utf8');assert.doesNotMatch(product,/createForegroundPoll|foregroundPoll\.schedule|function pollTick/);
 }finally{await f.close();}
});
for(const unknown of [false,true])void test('actual persisted pagehide/pageshow forces reload; '+(unknown?'UNKNOWN retains original receipt only':'unsent form is never restored'),async()=>{
 const f=await router({allowReload:true,mode:unknown?'save-unknown':'ok'});let reopened;try{
  typeSix(f);let sent,markers;
  if(unknown){await assert.rejects(f.save());sent=clone(posts(f)[0].body.command);markers=[...f.data];f.edit('specification','LATER_UNSENT_NEVER_RETAIN',1);}
  f.box.dispatchEvent({type:'pageshow',persisted:false});assert.equal(f.reloads(),0);
  const calls=f.calls.length;f.box.dispatchEvent({type:'pagehide',persisted:true});await turn();
  assert.equal(f.api.state().edit,null);assert.equal(f.api.state().batch,null);assert.equal(f.api.state().pending.length,0);
  assert(!JSON.stringify(f.api.isolated()).includes('LATER_UNSENT_NEVER_RETAIN'));assert(!JSON.stringify(f.api.flight()).includes('LATER_UNSENT_NEVER_RETAIN'));
  if(unknown){assert.deepEqual(clone(f.api.flight().command),sent);for(const [key,value]of markers)assert.equal(f.data.get(key),value);}
  f.box.dispatchEvent({type:'pageshow',persisted:true});assert.equal(f.reloads(),1);assert.equal(f.calls.length,calls,'bfcache handler reloads, never writes or looks up inline');noPrompts(f);noUnsentStorage(f);
  // A fresh VM represents reload after the real handler requests it. The test
  // does not claim native BFCache scheduling or lock lifecycle acceptance.
  reopened=await fixture({data:f.data,remote:f.remote,receiptStore:f.receipts,mode:unknown?'save-unknown':'ok',allowInitFailure:unknown});
  const initial=reopened.initialCalls;assert.equal(initial.filter(call=>call.method==='POST').length,0);
  if(unknown){const lookups=initial.filter(call=>new URL(call.url,'https://fixture.invalid').searchParams.has('operationId'));assert(lookups.length);for(const call of lookups){const params=new URL(call.url,'https://fixture.invalid').searchParams;assert.equal(params.get('operationId'),sent.operationId);assert(markers.some(([,raw])=>raw.includes(sent.operationId)&&raw.includes(sent.generation)),'original generation remains in durable receipt marker');}assert(reopened.api.transport().hasUnknown());assert(!JSON.stringify(reopened.api.state()).includes('LATER_UNSENT_NEVER_RETAIN'));await assert.rejects(reopened.api.read(),/OPERATION_NOT_FOUND/);assert.equal(posts(reopened).length,0);}
  else{assert.equal(reopened.api.dirty(),false);assert.equal(reopened.api.editor().ROOT[1].itemName,'Part');}
 }finally{await reopened?.close();await f.close();}
});
