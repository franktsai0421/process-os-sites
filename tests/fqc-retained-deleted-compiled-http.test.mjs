// Compiled Miniflare HTTP with the real FQC caller/chooser; synthetic DOM/storage.
// No browser, live account, persistent data or outbound requests. Root builds first.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {setup,clone,choices} from './fqc-conflict-ui-fixture.mjs';
import {createRootEntryFixture} from './root-entry-native-fixture.mjs';

async function stageDeletedConflict(h){
 const form=h.open();
 form.querySelector('[name="name"]').value='Compiled local final deleted payload';
 await form.onsubmit({preventDefault(){},target:form});
 h.ui.c.__fqcTest.openErrorModal('independent');
 const errorForm=h.ui.doc.querySelector('.fqc-modal-form');
 errorForm.querySelector('[name="name"]').value='Compiled independent local error';
 await errorForm.onsubmit({preventDefault(){},target:errorForm});
 await h.ui.c.__fqcTest.deleteItem('item');
 await h.peerSave({isDeleted:true,reason:'Compiled peer-only reason'});
 assert.equal(h.writes().length,0,'form Apply and local deletion stay unsent');
 return clone(await h.f.state());
}

async function compiledFixture(h,{allowDelete=true}={}){
 const state=await h.f.core.readState(),values=Object.fromEntries(Object.entries(state.values));
 if(!allowDelete){
  const users=JSON.parse(values.platformUsers);
  users.find(user=>user.id==='editor').accessOverrides['fqc.delete']=false;
  values.platformUsers=JSON.stringify(users);
 }
 const native=await createRootEntryFixture({syntheticBindings:{PROCESS_IMPORT_ENABLED:'0',PROCESS_SESSION_SECRET:h.f.env.PROCESS_SESSION_SECRET}});
 try{
  for(const sql of fs.readFileSync(new URL('../scripts/session-revocation-schema.sql',import.meta.url),'utf8').replace(/^--.*$/gm,'').split(';').map(value=>value.trim()).filter(value=>/^CREATE (?:TABLE|INDEX) /.test(value)))await native.db.prepare(sql).run();
  const bucket=await native.mf.getR2Bucket('STATE_ARCHIVE');
  const encoded=await h.f.records.encodeRecordValues(bucket,values);
  await native.db.prepare('INSERT INTO shared_state(id,revision,"values",updated_at) VALUES(1,?,?,?)').bind(state.revision,encoded,'synthetic').run();
  const origin=native.url.origin,requests=[];
  const dispatch=(url,options={})=>{
   requests.push({url:String(url),method:options.method||'GET',body:options.body});
   return native.mf.dispatchFetch(new URL(url,origin).href,{...options,headers:{...options.headers,origin,cookie:h.f.cookies.editor}});
  };
  h.ui.c.fetch=(url,options={})=>{
   h.ui.requests.push({url:String(url),method:options.method||'GET',body:options.body});
   return dispatch(url,options);
  };
  return{...native,requests,dispatch};
 }catch(error){await native.close();throw error;}
}

async function readWorkflow(compiled){
 const response=await compiled.dispatch('/api/fqc/workflow?caseMetadata=1');
 assert.equal(response.status,200);
 return(await response.json()).control;
}

// Storage oracle only: use the production decoder with full/default hydration.
// The public workflow response intentionally hides saves; do not alter that API.
async function readStoredFqc(h,compiled){
 const row=await compiled.db.prepare('SELECT "values" FROM shared_state WHERE id=1').first();
 assert(row);
 const bucket=await compiled.mf.getR2Bucket('STATE_ARCHIVE');
 const decoded=await h.f.records.decodeRecordValues(bucket,JSON.parse(row.values));
 return JSON.parse(decoded.values.qualityMasterControl).libraries.fqc;
}

void test('compiled FQC actual comparison/Mine keeps final tombstone, local payload and peer independent fields in one POST',async()=>{
 const h=await setup();let compiled;
 try{
  const before=await stageDeletedConflict(h);
  compiled=await compiledFixture(h);
  const prompts=choices(h,'mine');
  const result=await h.save();
  assert.notEqual(result,false);
  assert.equal(prompts(),1,'one global Mine choice continues this Save');
  assert.equal(h.posts().length,1);
  assert.equal(compiled.requests.filter(request=>request.method==='POST').length,1);
  assert.equal(compiled.requests.filter(request=>request.method==='PUT').length,0);
  const command=JSON.parse(h.posts()[0].body).command;
  assert.equal(command.action,'save');
  assert.equal(result.receipt.operationId,command.operationId);
  assert.equal(command.moduleAction,'save-local-v1');
  assert.equal(command.expectedRevision,before.workflow.revision);
  assert.equal(command.generation,before.workflow.generation);
  assert.equal(command.input.draftVersionId,before.versions.find(version=>version.status==='draft').id);
  assert.deepEqual(command.input.retainDeletedRows,[{collection:'items',id:'item',tombstone:before.workflow.working.items[0]}]);
  assert.equal(command.input.reviveRows,undefined);
  const rowGuard=command.guards.find(guard=>guard.path.length===2&&guard.path[0]==='items'&&guard.path[1].id==='item');
  assert(rowGuard);
  assert.deepEqual(rowGuard.value,before.workflow.working.items[0]);
  const after=await readWorkflow(compiled),saved=after.workflow.saved.content,row=saved.items.find(item=>item.id==='item');
  assert.equal(row.isDeleted,true);
  assert.equal(row.name,'Compiled local final deleted payload');
  assert.equal(row.reason,'Compiled peer-only reason');
  assert.equal(row.id,before.workflow.working.items[0].id);
  assert.equal(row.checkNo,before.workflow.working.items[0].checkNo);
  assert.equal(row.errorId,before.workflow.working.items[0].errorId);
  assert.equal(saved.errors.find(error=>error.id==='independent').name,'Compiled independent local error');
  assert.equal(after.workflow.revision,before.workflow.revision+1);
  assert.equal(after.workflow.saved.id,result.receipt.savedId);
  const stored=await readStoredFqc(h,compiled);
  assert.deepEqual(stored.workflow.saves.find(save=>save.id===before.workflow.saved.id),before.workflow.saved,'compiled Save must not mutate the old immutable saved snapshot');
  assert.equal(stored.workflow.saved.id,result.receipt.savedId);
  assert.deepEqual(stored.workflow.saved.content,saved);
  assert.equal(h.ui.c.__fqcTest.transport().hasUnknown(),false);
  console.log(JSON.stringify({execution:'compiled-Miniflare-HTTP',case:'fqc-retain-deleted-mine',programCommit:compiled.programCommit,buildEntrySha256:compiled.buildEntrySha256,posts:h.posts().length,browser:false,nativeUI:false}));
 }finally{await compiled?.close();h.close();}
});

void test('compiled FQC denies a valid retained-tombstone POST without delete permission and commits no CAS',async()=>{
 const h=await setup();let compiled;
 try{
  const before=await stageDeletedConflict(h),row=before.workflow.working.items[0];
  compiled=await compiledFixture(h,{allowDelete:false});
  const original=await compiled.db.prepare('SELECT revision,"values",updated_at FROM shared_state WHERE id=1').first();
  // A direct valid command tests the server fence; the UI correctly refuses Mine
  // after a fresh delete denial, so it cannot itself reach this HTTP 403 branch.
  const command=h.ui.c.__fqcTest.transport().prepare(before.workflow.generation,'save',{
   moduleAction:'save-local-v1',expectedRevision:before.workflow.revision,
   patches:[{op:'set',path:['items',{id:'item'},'name'],value:'Must not commit'},{op:'set',path:['items',{id:'item'},'isDeleted'],value:true}],
   guards:[{path:['items',{id:'item'},'name'],value:row.name},{path:['items',{id:'item'},'isDeleted'],value:true},{path:['items',{id:'item'}],value:row}],
   input:{matrixCells:[],draftVersionId:before.versions.find(version=>version.status==='draft').id,retainDeletedRows:[{collection:'items',id:'item',tombstone:row}]}
  });
  const response=await compiled.dispatch('/api/fqc/workflow',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({command})});
  assert.equal(response.status,403);
  assert.equal((await response.json()).error,'FORBIDDEN');
  assert.equal(compiled.requests.filter(request=>request.method==='POST').length,1);
  assert.deepEqual(await compiled.db.prepare('SELECT revision,"values",updated_at FROM shared_state WHERE id=1').first(),original,'no business revision/body, Save or receipt may be committed');
  const after=await readWorkflow(compiled);
  assert.equal(after.workflow.revision,before.workflow.revision);
  assert.equal(after.workflow.saved.id,before.workflow.saved.id);
  assert.equal(after.workflow.working.items[0].name,row.name);
  assert.equal(after.workflow.working.items[0].isDeleted,true);
  console.log(JSON.stringify({execution:'compiled-Miniflare-HTTP',case:'fqc-retain-deleted-no-delete',programCommit:compiled.programCommit,buildEntrySha256:compiled.buildEntrySha256,status:response.status,casCommitted:false,browser:false,nativeUI:false}));
 }finally{await compiled?.close();h.close();}
});
