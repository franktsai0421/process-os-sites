// Actual transfer UI/client and actual TS handlers, normal synthetic identities,
// in-memory SQLite/R2 only. No live Site, real records, network or live permission changes.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{createTransferFixture}=require('../scripts/equipment-transfer-fixture.cjs'),{connect}=require('../scripts/test-routine-equipment-isolated-workflow.cjs');
const copy=x=>JSON.parse(JSON.stringify(x)),tick=()=>new Promise(r=>setTimeout(r,5));
async function setup(t,{draft=true,sourceDraft=false}={}){const h=await createTransferFixture();t.after(()=>h.close());await mutate(h,values=>{const users=JSON.parse(values.platformUsers),peer=users.find(u=>u.id==='preview-edit-only');peer.accessOverrides['fqc.view']=true;peer.accessOverrides['fqc.edit']=true;values.platformUsers=JSON.stringify(users);});if(draft)await h.begin('fqc');if(sourceDraft)await h.begin('routine-equipment');const f=await connect(h);return{h,f};}
async function open(f,target='target'){f.test.openTransferModal('source');for(let i=0;!f.test.dialog?.preview&&i<1000;i++)await tick();assert(f.test.dialog?.preview);f.test.dialog.targetEqId=target;}
async function transfer(f,target='target'){await open(f,target);await f.test.executeTransfer('fqc');}
const ownPosts=f=>f.requests.filter(r=>r.path==='/api/fqc/workflow'&&r.method==='POST');
async function state(h){return copy(h.flow(await h.read('fqc')));}
const journal=f=>[...f.storage].filter(([k])=>k.startsWith('routine-equipment-fqc-transfer-v1:'));
async function mutate(h,fn){const s=await h.core.readState();fn(s.values);h.db.prepare('UPDATE shared_state SET "values"=?,revision=revision+1').run(await h.load('lib/state-records.ts').encodeRecordValues(h.env.STATE_ARCHIVE,s.values));}
for(const draft of [true,false])void test(`FQC replacement and all already-applied shared changes save in one CAS; existing draft=${draft}`,async t=>{
 const{h,f}=await setup(t,{draft});if(draft){const before=await state(h),id=before.working.items[0].id;await h.command('fqc','apply',{patches:[{op:'set',path:['items',{id},'description'],value:'Other shared unsaved input'}],guards:[{path:['items',{id},'description'],value:before.working.items[0].description}]},'edit-only');}
 const before=await state(h),equipment=(await h.core.readState()).values.routineEquipmentControl,revision=h.snapshot().row.revision,objects=new Map(h.objects);await transfer(f);assert.equal(f.test.dialog.moduleStatus.fqc,'success',f.test.dialog.moduleMessages.fqc);const after=await state(h);
 assert.equal(after.saved.content.items[0].equipmentId,'target');assert.equal(after.saved.content.items[0].description,draft?'Other shared unsaved input':before.active.content.items[0].description);assert.deepEqual(after.saved.content,after.working);assert.notEqual(after.saved.id,before.saved?.id);assert.deepEqual(after.active,before.active);assert.deepEqual(after.cases,before.cases);assert.equal((await h.core.readState()).values.routineEquipmentControl,equipment);
 assert.deepEqual(ownPosts(f).map(r=>r.action),draft?['save']:['begin-v1','save']);assert.equal(h.snapshot().row.revision,revision+(draft?1:2));assert.equal(journal(f).length,0);for(const[key,bytes]of objects)assert(h.objects.get(key).equals(bytes));
});
void test('a same-field peer change rejects the entire transfer/Save with no partial candidate or fake unknown',async t=>{
 const{h,f}=await setup(t),raw=f.c.fetch;let peer;
 f.c.fetch=async(url,options={})=>{const b=options.body&&JSON.parse(options.body);if(b?.command?.moduleAction==='save-local-v1'){const flow=await state(h),id=flow.working.items[0].id;await h.command('fqc','apply',{patches:[{op:'set',path:['items',{id},'equipmentId'],value:''},{op:'set',path:['items',{id},'tool'],value:'Peer manual'}],guards:[{path:['items',{id},'equipmentId'],value:'source'},{path:['items',{id},'tool'],value:'01'}]},'edit-only');peer=h.snapshot();}return raw(url,options);};
 await transfer(f);assert.equal(f.test.dialog.moduleStatus.fqc,'error');assert.match(f.test.dialog.moduleMessages.fqc,/DEPENDENCY_CHANGED_RECONFIRM/);assert.deepEqual(h.snapshot(),peer);assert.equal(journal(f).length,0);assert.equal(f.c.sharedDraftAccountState().unknown,false);
});
for(const mode of ['receipt-404','receipt-503','readback-503'])void test(`committed FQC Save ${mode} retains exact intent; explicit recovery only GETs original receipt`,async t=>{
 const{h,f}=await setup(t),raw=f.c.fetch;let lost=false,down=true,posts=0;
 f.c.fetch=async(url,options={})=>{const u=new URL(url,'http://fixture'),b=options.body&&JSON.parse(options.body);if(u.pathname==='/api/fqc/workflow'){
  if(u.searchParams.has('operationId')&&down&&mode!=='readback-503')return Response.json({error:'OPERATION_NOT_FOUND'},{status:mode==='receipt-404'?404:503});
  if((options.method||'GET')==='GET'&&!u.searchParams.has('operationId')&&lost&&down&&mode==='readback-503')return Response.json({error:'READ_FAILED'},{status:503});
  if(b?.command?.action==='save'){posts++;const response=await raw(url,options);assert.equal(response.status,200);lost=true;if(mode!=='readback-503')throw Error('Synthetic ACK lost');return response;}
 }return raw(url,options);};
 await transfer(f);assert.equal(f.test.dialog.moduleStatus.fqc,'error');assert.equal(posts,1);const markers=[...f.storage];assert(journal(f).length);const stored=await state(h);assert.equal(stored.saved.content.items[0].equipmentId,'target');
 await f.test.executeTransfer('fqc');assert.equal(posts,1);assert.deepEqual([...f.storage],markers);down=false;f.test.dialog.targetEqId='source';await f.test.executeTransfer('fqc');assert.equal(posts,1);assert.equal(f.test.dialog.moduleStatus.fqc,'success',f.test.dialog.moduleMessages.fqc);assert.equal(journal(f).length,0);assert.deepEqual(await state(h),stored);
});
void test('identified target Begin unknown keeps original identity and intent; recovery cannot continue Save',async t=>{
 const{h,f}=await setup(t,{draft:false}),raw=f.c.fetch;let lose=true,down=true,posts=0;
 f.c.fetch=async(url,options={})=>{const u=new URL(url,'http://fixture'),b=options.body&&JSON.parse(options.body);if(u.pathname==='/api/fqc/workflow'&&u.searchParams.has('operationId')&&down)return Response.json({error:'OPERATION_NOT_FOUND'},{status:404});if(b?.action==='begin-v1'){posts++;const response=await raw(url,options);if(lose){lose=false;throw Error('Begin ACK lost');}return response;}if(b?.command?.action==='save')posts++;return raw(url,options);};
 await transfer(f);const bytes=[...f.storage];assert.equal(posts,1);assert.equal(journal(f).length,1);await f.test.executeTransfer('fqc');assert.deepEqual([...f.storage],bytes);assert.equal(posts,1);down=false;await f.test.executeTransfer('fqc');assert.equal(posts,1);assert.equal(f.test.dialog.moduleStatus.fqc,'idle');assert.match(f.test.dialog.moduleMessages.fqc,/尚未移轉或存取/);assert.equal((await state(h)).saved,null);await f.test.executeTransfer('fqc');assert.equal(posts,2);assert.equal(f.test.dialog.moduleStatus.fqc,'success');
});
void test('read-only recovery after page recreation retains original Save and sends no new POST',async t=>{
 const{h,f}=await setup(t),raw=f.c.fetch;let down=true;
 f.c.fetch=async(url,options={})=>{const u=new URL(url,'http://fixture'),b=options.body&&JSON.parse(options.body);if(u.searchParams.has('operationId')&&down)return Response.json({error:'MISSING'},{status:404});const r=await raw(url,options);if(b?.command?.action==='save')throw Error('ACK lost');return r;};await transfer(f);const markers=[...f.storage],after=await state(h),reopened=await connect(h);for(const[k,v]of markers)reopened.storage.set(k,v);await open(reopened);down=false;await reopened.test.executeTransfer('fqc');assert.equal(ownPosts(reopened).length,0);assert.equal(reopened.test.dialog.moduleStatus.fqc,'success',reopened.test.dialog.moduleMessages.fqc);assert.deepEqual(await state(h),after);assert.equal(journal(reopened).length,0);
});
for(const change of ['permission','disabled-target','pending'])void test(`FQC ${change} race refuses transfer Save without partial state`,async t=>{
 const{h,f}=await setup(t),raw=f.c.fetch;let afterChange;
 f.c.fetch=async(url,options={})=>{const b=options.body&&JSON.parse(options.body);if(b?.command?.moduleAction==='save-local-v1'){
  if(change==='permission')await mutate(h,values=>{const users=JSON.parse(values.platformUsers);users.find(u=>u.id==='preview-editor').accessOverrides['fqc.edit']=false;values.platformUsers=JSON.stringify(users);});
  if(change==='disabled-target')await mutate(h,values=>{const c=JSON.parse(values.routineEquipmentControl);c.versions.find(v=>v.id===c.activeVersionId).equipment.find(e=>e.id==='target').enabled=false;values.routineEquipmentControl=JSON.stringify(c);});
  if(change==='pending'){const flow=await state(h),id=flow.working.items[0].id;await h.command('fqc','apply',{patches:[{op:'set',path:['items',{id},'description'],value:'Peer pending change'}],guards:[{path:['items',{id},'description'],value:flow.working.items[0].description}]});const s=h.flow(await h.command('fqc','save')).saved;await h.command('fqc','submit',{savedId:s.id,reason:'Synthetic pending peer'});}
  afterChange=h.snapshot();
 }return raw(url,options);};await transfer(f);assert.equal(f.test.dialog.moduleStatus.fqc,'error');assert.deepEqual(h.snapshot(),afterChange);assert.equal((await state(h)).working.items[0].equipmentId,'source');
});
void test('a successor generation may confirm the original Save only; it never receives replayed patches',async t=>{
 const{h,f}=await setup(t),raw=f.c.fetch;let advanced=false,posts=0;
 f.c.fetch=async(url,options={})=>{const b=options.body&&JSON.parse(options.body);if(b?.command?.action==='save'){posts++;const response=await raw(url,options),done=await response.clone().json();const c=await h.command('fqc','submit',{savedId:done.receipt.savedId,reason:'Synthetic successor'});await h.command('fqc','approve',{caseId:c.receipt.caseId},'reviewer');advanced=true;return response;}return raw(url,options);};await transfer(f);assert(advanced);assert.equal(posts,1);assert.equal(journal(f).length,0);assert.equal(f.test.dialog.moduleStatus.fqc,'success',f.test.dialog.moduleMessages.fqc);assert.match(f.test.dialog.moduleMessages.fqc,/後續草稿/);const after=await state(h);await f.test.executeTransfer('fqc');assert.equal(posts,1);assert.deepEqual(await state(h),after);
});
void test('journal persistence failure refuses FQC Save before transport',async t=>{const{h,f}=await setup(t),before=h.snapshot();await open(f);const set=f.c.sessionStorage.setItem;f.c.sessionStorage.setItem=(key,value)=>{if(!key.startsWith('routine-equipment-fqc-transfer-v1:'))set(key,value);};await f.test.executeTransfer('fqc');assert.equal(ownPosts(f).length,0);assert.deepEqual(h.snapshot(),before);});

void test('replacement preserves nonempty original quality photos, provenance fields and older saved objects',async t=>{
 const{h,f}=await setup(t),old=await state(h),row=old.working.items[0],photo={name:'Synthetic retained photo',src:'data:image/png;base64,'+require('./photo-fixtures.mjs').pngFixture({width:8,height:8}).toString('base64')};
 await h.command('fqc','apply',{patches:[{op:'set',path:['items',{id:row.id},'mediaItems'],value:[photo]}],guards:[{path:['items',{id:row.id},'mediaItems'],value:row.mediaItems}]});await h.command('fqc','save');const before=await state(h),objects=new Map(h.objects);await transfer(f);const after=await state(h);assert.equal(f.test.dialog.moduleStatus.fqc,'success');assert.deepEqual(after.saved.content.items[0].mediaItems,[photo]);assert.deepEqual(before.saved.content.items[0].mediaItems,[photo]);assert.equal(after.saved.content.items[0].description,before.working.items[0].description);assert.deepEqual(after.active,before.active);for(const[key,bytes]of objects)assert(h.objects.get(key).equals(bytes));
});

void test('FQC replacement neither saves nor discards source equipment local input',async t=>{
 const{h,f}=await setup(t,{sourceDraft:true}),before=(await h.core.readState()).values.routineEquipmentControl;assert(f.test.working);f.test.working.equipment.find(e=>e.id==='source').notes='Local equipment input stays local';await transfer(f);assert.equal(f.test.dialog.moduleStatus.fqc,'success');assert.equal(f.test.working.equipment.find(e=>e.id==='source').notes,'Local equipment input stays local');assert.equal((await h.core.readState()).values.routineEquipmentControl,before);assert.equal(f.requests.filter(r=>r.path==='/api/routine-equipment/workflow'&&r.method==='POST').length,0);
});

for(const allowed of [false,true])void test(`legacy FQC adoption retains the existing permission gate; authorized=${allowed}`,async t=>{
 const{h}=await setup(t,{draft:false});await mutate(h,values=>{if(allowed){const users=JSON.parse(values.platformUsers),editor=users.find(u=>u.id==='preview-editor');editor.role='admin';editor.permissions=['approval.submit'];editor.accessOverrides['approval.submit']=true;values.platformUsers=JSON.stringify(users);}const q=JSON.parse(values.qualityMasterControl),lib=q.libraries.fqc,active=lib.versions.find(v=>v.id===lib.activeVersionId),draft={...copy(active),id:'synthetic-legacy-fqc',status:'draft',revision:1,baseVersionId:lib.activeVersionId,snapshot:copy(active.snapshot)};draft.snapshot.items[0].equipmentId='';draft.snapshot.items[0].tool='Legacy visual text';draft.snapshot.items[0].description='Legacy other applied change';lib.versions.push(draft);delete lib.workflow;values.qualityMasterControl=JSON.stringify(q);});const f=await connect(h),before=h.snapshot();await transfer(f);if(!allowed){assert.equal(f.test.dialog.preview.modules.find(m=>m.moduleId==='fqc').items[0].selectable,false);assert.equal(ownPosts(f).length,0);assert.deepEqual(h.snapshot(),before);return;}assert.equal(f.test.dialog.moduleStatus.fqc,'success',f.test.dialog.moduleMessages.fqc);const after=await state(h);assert.equal(after.saved.content.items[0].equipmentId,'target');assert.equal(after.saved.content.items[0].description,'Legacy other applied change');assert.deepEqual(ownPosts(f).map(r=>r.action),['begin-v1','save']);
});
