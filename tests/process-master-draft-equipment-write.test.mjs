import assert from 'node:assert/strict';
import test from 'node:test';
import {fixture} from './master-ab-auth-phase-fixture.mjs';

const stage='A-CUT';
const item={id:'qa-equipment',number:'QA-1',name:'QA equipment',line:'A',stageCode:stage,kind:'machine-assembly',mediaItems:[]};
const batchCommand=(f,patches,guards=[])=>f.command('save',{moduleAction:'save-local-v1',patches,input:{batches:[{patches,guards}]}});
const manifest=f=>JSON.parse(f.row().values).__processRecords;

test('PROCESS equipment writes preserve unrelated record bodies, history, approval boundaries and exact receipts',async t=>{
  const f=await fixture({scope:'PROCESS',values:{qualityMasterControl:JSON.stringify({workflow:{working:{note:'x'.repeat(4*1024*1024)}}})}});
  t.after(f.close);
  const before=manifest(f);
  const unrelated=JSON.parse(f.objects.get(before.values.qualityMasterControl.key)).workflow.working.__immutableBody;
  const read=f.env.STATE_ARCHIVE.get.bind(f.env.STATE_ARCHIVE);
  let bytes=0;
  f.env.STATE_ARCHIVE.get=async key=>{if(key===unrelated.key)bytes+=f.objects.get(key).length;return read(key);};
  const template=f.flow.working[stage].find(row=>row.presetKey==='machine-assembly');
  const list=[stage,{id:template.id},'equipment'];
  const save=batchCommand(f,[{op:'insert',path:list,value:item}]);
  const saved=await f.request('POST',save);
  assert.equal(saved.status,200,JSON.stringify(saved.body.error));
  assert.equal(manifest(f).values.processMasterData.sha256,before.values.processMasterData.sha256);
  const revision=f.row().revision;
  const replay=await f.request('POST',save);
  assert.deepEqual(replay.body.receipt,saved.body.receipt);assert.equal(f.row().revision,revision);
  const path=[...list,{id:item.id},'name'];
  const edited=await f.request('POST',batchCommand(f,[{op:'set',path,value:'Revised'}],[{path,value:item.name}]));
  assert.equal(edited.status,200,JSON.stringify(edited.body.error));
  const submitted=await f.request('POST',f.command('submit',{expectedRevision:edited.body.control.workflow.revision,savedId:edited.body.receipt.savedId,reason:'Synthetic submission'}));
  assert.equal(submitted.status,200,JSON.stringify(submitted.body.error));
  assert.deepEqual(manifest(f).values.qualityMasterControl,before.values.qualityMasterControl);
  t.diagnostic('Unrelated active body bytes read for Save, replay, edit and Submit: '+bytes);
  assert.equal(bytes,0);
  const decoded=await f.decoded(),master=JSON.parse(decoded.masterDataControl),flow=master.workflowScopes.PROCESS;
  assert.deepEqual(JSON.parse(decoded.processMasterData),master.active.PROCESS);
  assert.deepEqual(flow.cases.find(c=>c.id===flow.pendingId).content[stage].find(t=>t.id===template.id).equipment.at(-1),{...item,name:'Revised'});
  assert.deepEqual(flow.cases.find(c=>c.id==='case0').content,f.flow.cases[0].content);
});

test('PROCESS equipment insert still requires create permission and leaves the revision untouched on denial',async t=>{
  const f=await fixture({scope:'PROCESS',user:{role:'staff',accessOverrides:{'templates.view':true,'templates.edit':true,'templates.save':true,'templates.create':false}}});
  t.after(f.close);
  const template=f.flow.working[stage].find(row=>row.presetKey==='machine-assembly');
  const before=f.row();
  const result=await f.request('POST',batchCommand(f,[{op:'insert',path:[stage,{id:template.id},'equipment'],value:item}]));
  assert.equal(result.status,403);assert.deepEqual(f.row(),before);
});

test('a previously saved draft removing referenced equipment still checks the full consumer set on submit',async t=>{
  const f=await fixture({scope:'PROCESS'});
  t.after(f.close);
  await f.mutateValues(values=>{
    const root=JSON.parse(values.masterDataControl),flow=root.workflowScopes.PROCESS;
    const candidate=structuredClone(flow.working);
    for(const snapshot of [root.active.PROCESS,root.versions.find(v=>v.id==='active').snapshot,flow.active.content]){
      snapshot[stage].find(t=>t.presetKey==='machine-assembly').equipment=[item];
    }
    flow.working=candidate;
    flow.saved={...flow.saves[0],content:candidate};
    values.masterDataControl=JSON.stringify(root);
    values['processEditor:QA:A']=JSON.stringify({stages:{[stage]:[{id:'qa-consumer',machineIds:[item.id]}]}});
  });
  const before=f.row();
  const result=await f.request('POST',f.command('submit',{savedId:'save0',expectedRevision:0,reason:'Synthetic guard check'}));
  assert.equal(result.status,409);
  assert.equal(result.body.error,'PROCESS_MASTER_IN_USE');
  assert.deepEqual(f.row(),before);
});
