import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync('public/process/process-editor.js','utf8');
const slice=(start,end)=>{assert.equal(source.split(start).length,2);const a=source.indexOf(start),b=source.indexOf(end,a);assert(a>=0&&b>a);return source.slice(a,b);};
const forms=slice(' function formOwner(){',' function closeRequest(){')+slice(' const formDeparture={',' host.ProcessOpenOperation=');
const journalBox={structuredClone};vm.runInNewContext(fs.readFileSync('public/process/canvas-local.js','utf8'),journalBox);
function fixture(){
 const shared={workspaces:[{id:'workspace',stages:{A:[{id:'one',stageCode:'A',name:'saved',x:80,y:90,nextIds:[],productCodes:['P1'],ipqcAssignments:[],mediaItems:[]},{id:'other',stageCode:'A',name:'other user'}]}}]};
 const journal=new journalBox.CanvasJournal(shared),calls=[];let allowed=true,workspaceKey='G:A',generation='g1',epoch=1,delivery=1;
 const button={disabled:false,textContent:''},error={textContent:''},local={operation(...args){calls.push('local-operation');return journal.operation(...args);},clearForm(...args){calls.push('clear-form');delete journal.forms[JSON.stringify(args)];}};
 const box={JSON,Error,Set,copy:structuredClone,key:()=>workspaceKey,flow:()=>({generation}),can:()=>allowed,t:zh=>zh,issueText:e=>e.message,localCanvas:()=>local,render:()=>calls.push('render'),toast:()=>calls.push('toast'),dismissibleDialogs:new Set(),host:{ProcessSync:{identity:{id:'editor'},identityGeneration:()=>epoch,captureDelivery:()=>delivery,isCurrentDelivery:x=>x===delivery},ProcessNavigationForms:{acknowledge:()=>calls.push('acknowledge')},ProcessAuthoringV3:{sync(){throw Error('NO_HIDDEN_SYNC');}}},modal:null};
 vm.createContext(box);vm.runInContext(forms+'\nglobalThis.departure=formDeparture;',box);
 const dialog={open:true,isConnected:true,inert:false,querySelector:s=>s==='#apply-operation'?button:error,close(){calls.push('close');this.open=false;this.isConnected=false;box.modal=null;}};
 const original=structuredClone(shared.workspaces[0].stages.A[0]),m=box.modal={dialog,workspace:'workspace',original,draft:structuredClone(original),isNew:false,scroll:{basic:235},owner:box.formOwner()};
 return{box,m,dialog,button,error,calls,journal,shared,local,setAllowed:v=>allowed=v,setKey:v=>workspaceKey=v,setGeneration:v=>generation=v,setEpoch:v=>epoch=v,setDelivery:v=>delivery=v};
}
void test('leave Save never completes or publishes a dirty form; full inputs and scroll survive',async()=>{
 const f=fixture();Object.assign(f.m.draft,{name:'latest',productCodes:['P1','P2'],ipqcAssignments:[{itemId:'quality'}],mediaItems:[{src:'synthetic'}]});const before=structuredClone(f.m.draft),release=f.box.departure.freeze();
 await assert.rejects(f.box.departure.saveApply(),/CANVAS_MANUAL_SYNC_REQUIRED/);assert.deepEqual(f.m.draft,before);assert.equal(f.journal.counts().fields,0);assert.equal(f.shared.workspaces[0].stages.A[0].name,'saved');assert.equal(f.dialog.open,true);assert.deepEqual(f.m.scroll,{basic:235});assert.equal(f.calls.length,0);release();assert.equal(f.dialog.inert,false);
});
void test('explicit completion updates only the local journal, not shared data or another block',async()=>{
 const f=fixture();f.m.draft.name='mine';assert.equal(await f.box.apply(),true);assert.equal(f.journal.project('workspace','A')[0].name,'mine');assert.equal(f.shared.workspaces[0].stages.A[0].name,'saved');assert.equal(f.journal.project('workspace','A')[1].name,'other user');assert.equal(f.calls.filter(x=>x==='local-operation').length,1);assert.equal(f.dialog.open,false);
});
void test('local dependency conflict keeps all form inputs and newer local content',async()=>{
 const f=fixture();f.journal.edit('workspace','A',[{id:'one',f:'name',value:'new local'}]);f.m.draft.name='older form';assert.equal(await f.box.apply(),false);assert.match(f.error.textContent,/DEPENDENCY_CHANGED/);assert.equal(f.journal.project('workspace','A')[0].name,'new local');assert.equal(f.m.draft.name,'older form');assert.equal(f.dialog.open,true);
});
for(const change of ['identity','generation','delivery','workspace','reload'])void test('stale '+change+' form cannot publish or modify the local journal',async()=>{
 const f=fixture();f.m.draft.name='unsent';if(change==='identity')f.setEpoch(2);if(change==='generation')f.setGeneration('g2');if(change==='delivery')f.setDelivery(2);if(change==='workspace')f.setKey('other');if(change==='reload')f.box.host.ProcessSync.requiresReload=true;
 assert.equal(await f.box.apply(),false);assert.equal(f.box.departure.inspect().state,'blocked');assert.equal(f.journal.counts().fields,0);assert.equal(f.dialog.open,true);assert.equal(f.m.draft.name,'unsent');assert.equal(f.calls.length,0);
});
void test('content completion never sneaks in form coordinate/link edits',async()=>{
 const f=fixture();f.m.draft.name='content';f.m.draft.x=999;f.m.draft.nextIds=['other'];assert.equal(await f.box.apply(),true);const local=f.journal.project('workspace','A')[0];assert.equal(local.x,80);assert.deepEqual([...local.nextIds],[]);assert.equal(local.name,'content');
});
void test('readonly input is retained; clean readonly dialogs can close without mutation',async()=>{
 const f=fixture();f.setAllowed(false);assert.equal(await f.box.departure.saveApply(),true);f.m.draft.name='blocked';assert.equal(await f.box.apply(),false);await assert.rejects(f.box.departure.saveApply(),/CANVAS_MANUAL_SYNC_REQUIRED/);assert.throws(()=>f.box.departure.closeClean(),/EDITOR_FORM_APPLY_REQUIRED/);assert.equal(f.journal.counts().fields,0);f.box.departure.discardLocal();assert.equal(f.dialog.open,false);
});
for(const flag of ['uploading','saving'])void test(flag+' blocks departure and completion without clearing inputs',async()=>{
 const f=fixture();f.m[flag]=true;f.m.draft.name='retain';assert.equal(f.box.departure.inspect().state,'busy');assert.equal(await f.box.apply(),false);await assert.rejects(f.box.departure.saveApply(),/EDITOR_FORM_BUSY/);assert.throws(()=>f.box.departure.discardLocal(),/EDITOR_FORM_BUSY/);assert.equal(f.dialog.open,true);assert.equal(f.journal.counts().fields,0);
});
void test('nested departure locks release once and preserve preexisting inert',async()=>{
 const f=fixture();f.dialog.inert=true;f.m.draft.name='locked';const a=f.box.departure.freeze(),b=f.box.departure.freeze();assert.equal(await f.box.apply(),false);a();a();assert.equal(f.m.departureLocked,true);b();assert.equal(f.m.departureLocked,false);assert.equal(f.dialog.inert,true);assert.equal(f.calls.length,0);
});
void test('only owned clean viewers close, never a foreign dialog',()=>{
 const f=fixture(),album={open:true,close(){this.open=false;}},foreign={open:true};f.box.dismissibleDialogs.add(album);assert(f.box.departure.ownsDialog(album));assert(!f.box.departure.ownsDialog(foreign));f.box.departure.closeClean();assert.equal(album.open,false);assert.equal(foreign.open,true);
});
void test('new blank blocks count as dirty and repeat local completion does not duplicate',async()=>{
 const f=fixture();f.m.isNew=true;f.m.original={...f.m.original,id:'new',name:'new'};f.m.draft=structuredClone(f.m.original);assert.equal(f.box.departure.inspect().state,'dirty');await assert.rejects(f.box.departure.saveApply(),/CANVAS_MANUAL_SYNC_REQUIRED/);assert.equal(await f.box.apply({keepOpen:true}),true);assert.equal(f.m.isNew,false);assert.equal(f.dialog.open,true);f.m.draft.name='second';assert.equal(await f.box.apply({keepOpen:true}),true);assert.equal(f.journal.project('workspace','A').filter(x=>x.id==='new').length,1);assert.equal(f.journal.project('workspace','A').find(x=>x.id==='new').name,'second');assert.equal(f.shared.workspaces[0].stages.A.length,2);
});
void test('discard releases current form before queued native close without touching shared content',()=>{
 const f=fixture();f.m.draft.name='discard';let queued=false;f.dialog.close=()=>{f.dialog.open=false;queued=true;};f.box.departure.discardLocal();assert(queued);assert.equal(f.box.modal,null);assert.equal(f.box.departure.inspect().state,'clean');assert.equal(f.shared.workspaces[0].stages.A[0].name,'saved');assert.equal(f.journal.counts().fields,0);
});
