import assert from 'node:assert/strict';
import test from 'node:test';
import {fixture} from './master-ab-auth-phase-fixture.mjs';
const change=(path,value,before)=>({patches:[{op:'set',path,value}],guards:[{path,value:before}]});
const path=['A-CUT',{id:'A-CUT-FLOW-02'},'name'];
const save=(f,batches,detail={})=>f.command('save',{moduleAction:'save-local-v1',patches:batches.flatMap(b=>b.patches),input:{batches},...detail});
for(const inline of [true,false]){
 void test(`PROCESS ${inline?'inline':'records'} ordered Save is one CAS; exact replay; lifecycle`,async t=>{
  const f=await fixture({scope:'PROCESS',inline});t.after(f.close);const name=f.flow.working['A-CUT'].find(x=>x.id===path[1].id).name;
  const cmd=save(f,[change(path,'第一次',name),change(path,'第二次 Tên máy','第一次')]);const r=await f.request('POST',cmd);assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(f.stats.cas,1);assert.deepEqual(r.body.control.workflow.saved.content,r.body.control.workflow.working);assert.equal(r.body.control.workflow.saved.content['A-CUT'].find(x=>x.id===path[1].id).name,'第二次 Tên máy');
  const row=f.row();f.reset();const replay=await f.request('POST',cmd);assert.equal(replay.status,200);assert.deepEqual(replay.body.receipt,r.body.receipt);assert.deepEqual(f.row(),row);assert.equal(f.stats.cas,0);
  let flow=r.body.control.workflow;const submit=await f.request('POST',f.command('submit',{savedId:flow.saved.id,expectedRevision:flow.revision,reason:'Synthetic review'}));assert.equal(submit.status,200,JSON.stringify(submit.body));const caseId=submit.body.receipt.caseId;
  const locked=await f.request('POST',save(f,[change(path,'Locked','第二次 Tên máy')]));assert.equal(locked.body.error,'PENDING_LOCKED');
  const returned=await f.request('POST',f.command('return',{caseId,reason:'Synthetic return',selfReviewConfirmed:true}));assert.equal(returned.status,200,JSON.stringify(returned.body));flow=returned.body.control.workflow;
  const again=await f.request('POST',f.command('submit',{generation:flow.generation,savedId:flow.saved.id,expectedRevision:flow.revision,reason:'Synthetic resubmit'}));assert.equal(again.status,200,JSON.stringify(again.body));
  const approved=await f.request('POST',f.command('approve',{generation:flow.generation,caseId:again.body.receipt.caseId,selfReviewConfirmed:true}));assert.equal(approved.status,200,JSON.stringify(approved.body));assert.equal(approved.body.control.workflow.active.content['A-CUT'].find(x=>x.id===path[1].id).name,'第二次 Tên máy');
 });
 void test(`PROCESS ${inline?'inline':'records'} different fields merge, stale batch is atomic`,async t=>{
  const f=await fixture({scope:'PROCESS',inline});t.after(f.close);const row=f.flow.working['A-CUT'].find(x=>x.id===path[1].id);
  assert.equal((await f.request('POST',save(f,[change(path,'Peer',row.name)],{clientId:'peer-client'}))).status,200);
  const other=['A-CUT',{id:row.id},'editorType'],r=await f.request('POST',save(f,[change(other,'inspection',row.editorType)]));assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.control.workflow.saved.content['A-CUT'].find(x=>x.id===row.id).name,'Peer');
  const before=f.row(),bad=await f.request('POST',save(f,[change(other,'manual','inspection'),change(path,'Stale',row.name)]));assert.equal(bad.body.error,'DEPENDENCY_CHANGED_RECONFIRM');assert.deepEqual(f.row(),before);
 });
}
for(const gate of ['edit','create','delete','submit'])void test(`PROCESS edit includes save; ${gate} gate stays independent`,async t=>{
 const f=await fixture({scope:'PROCESS',user:{accessOverrides:{'templates.view':true,'templates.edit':true,'templates.save':false,['templates.'+gate]:false}}});t.after(f.close);const original=f.flow.working['A-CUT'][1];let batches=[change(path,'Edited',original.name)];
 if(gate==='create')batches=[{patches:[{op:'insert',path:['A-CUT'],value:{id:'new-template',name:'New',editorType:'custom',mediaItems:[]}}],guards:[]}];
 if(gate==='delete')batches=[{patches:[{op:'remove',path:['A-CUT',{id:original.id}]}],guards:[{path:['A-CUT',{id:original.id}],value:original}]}];
 const r=await f.request('POST',save(f,batches));assert.equal(r.status,gate==='submit'?200:403,JSON.stringify(r.body));
 if(gate==='submit'){const flow=r.body.control.workflow;assert.equal((await f.request('POST',f.command('submit',{savedId:flow.saved.id,reason:'Denied'}))).status,403);}
});
void test('PROCESS template identity/type and parent guards never relax for atomic Save',async t=>{
 const f=await fixture({scope:'PROCESS'});t.after(f.close);const template=f.flow.working['A-CUT'][1];
 for(const [field,value,error]of [['editorType','invalid','PROCESS_TEMPLATE_TYPE_INVALID'],['presetKey','custom','IMMUTABLE_IDENTITY'],['equipment',[],'COLLECTION_REPLACEMENT_FORBIDDEN']]){const before=f.row(),p=['A-CUT',{id:template.id},field],r=await f.request('POST',save(f,[change(p,value,template[field])]));assert.equal(r.body.error,error,JSON.stringify(r.body));assert.deepEqual(f.row(),before);}
});
void test('PROCESS equipment source/parent/removal guards stay atomic across Save',async t=>{
 const f=await fixture({scope:'PROCESS'});t.after(f.close);const parent=['A-CUT',{id:'A-CUT-FLOW-04'},'equipment'],e={id:'synthetic-machine',name:'合成機器',number:'SYN',stageCode:'A-CUT',line:'A',kind:'machine-assembly',mediaItems:[{src:'synthetic-kept.png'}],source:{sheet:'synthetic'}};
 const insert={patches:[{op:'insert',path:parent,value:e}],guards:[]};assert.equal((await f.request('POST',save(f,[insert]))).status,200);
 const before=f.row(),source=[...parent,{id:e.id},'source'],bad=await f.request('POST',save(f,[change(source,{sheet:'rewrite'},e.source)]));assert.equal(bad.body.error,'EQUIPMENT_SOURCE_PROTECTED');assert.deepEqual(f.row(),before);
 const stage=[...parent,{id:e.id},'stageCode'],wrong=await f.request('POST',save(f,[change(stage,'C-WRONG','A-CUT')]));assert.equal(wrong.body.error,'EQUIPMENT_PARENT_INVALID');assert.deepEqual(f.row(),before);
 const removed={patches:[{op:'remove',path:[...parent,{id:e.id}]}],guards:[{path:[...parent,{id:e.id}],value:e}]};await f.mutateValues(v=>{v.approvalVersions=JSON.stringify([{id:'reference-version',status:'approved',line:'A',category:'G',stages:{'A-CUT':[{id:'operation',machineIds:[e.id],name:'Synthetic reference'}]}}]);});const pinned=f.row();const denial=await f.request('POST',save(f,[removed]));assert.equal(denial.body.error,'PROCESS_MASTER_IN_USE');assert.deepEqual(f.row(),pinned);
});
void test('PROCESS linked AB/C pending case still blocks Save without touching original history or receipts',async t=>{
 const f=await fixture({scope:'PROCESS'});t.after(f.close);await f.mutateValues(v=>{const root=JSON.parse(v.masterDataControl);root.workflowScopes.AB={pendingId:'linked-case',cases:[{id:'linked-case',status:'pending',linkedProcess:{scope:'PROCESS'}}]};v.masterDataControl=JSON.stringify(root);});const before=f.row(),r=await f.request('POST',save(f,[change(path,'Denied',f.flow.working['A-CUT'][1].name)]));assert.equal(r.body.error,'LINKED_PROCESS_CASE_PENDING');assert.deepEqual(f.row(),before);
});
