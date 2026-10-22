/* oxlint-disable typescript/no-require-imports -- isolated Workers handlers, no server or business writes. */
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),fixture=require('./ipqc-assignment-fixture.cjs');
const source=process.argv[2];if(!source)throw Error('Captured isolated source required');
(async()=>{const f=await fixture(source),endpoint='/api/ipqc-ab/workflow?module=1',seq={};
 if(process.env.V3_STORAGE==='records'){const state=await f.core.readState();f.db.prepare('UPDATE shared_state SET "values"=?').run(await f.load('lib/state-records.ts').encodeRecordValues(f.env.STATE_ARCHIVE,state.values));}
 const request=(body,user='admin')=>f.request(endpoint,body?'POST':'GET',body||undefined,user);
 const command=async(action,details={},user='admin')=>{const read=await request(null,user);assert.equal(read.status,200,JSON.stringify(read.body));const flow=read.body.control.workflow;return{operationId:randomUUID(),generation:flow.generation,clientId:'client-'+user,sequence:seq[user]=(seq[user]||0)+1,action,expectedRevision:flow.revision,input:{stateRevision:read.body.revision},...details};};
 const send=async(action,details={},user='admin')=>request({command:await command(action,details,user)},user);
 const good=r=>{assert.equal(r.status,200,JSON.stringify(r.body));return r.body;};
 try{
  good(await request({action:'begin'},'employee'));console.log('PASS employee module access without approval permission');
  const before=await f.core.readState(),count=Object.keys(JSON.parse(before.values.ipqcABMasterControl).scopes).length;
  const save=good(await send('save',{},'employee'));assert.equal(Object.keys(save.control.workflow.saved.content.scopes).length,count);console.log('PASS atomic Save contains every existing group');
  const frozen=JSON.stringify(save.control.workflow.saved.content);
  const stale=await command('save',{},'admin');stale.input.stateRevision--;const rejected=await request({command:stale});assert.equal(rejected.body.error,'MODULE_CHANGED_RECONFIRM');assert.equal((await f.core.readState()).revision,save.revision);console.log('PASS concurrent state conflict makes no partial write');
  const subCommand=await command('submit',{savedId:save.control.workflow.saved.id,reason:'Isolated full module acceptance'},'employee');
  const submit=good(await request({command:subCommand},'employee'));assert.equal(JSON.stringify(submit.control.workflow.cases.at(-1).content),frozen);
  const replay=good(await request({command:subCommand},'employee'));assert.equal(replay.revision,submit.revision);console.log('PASS fixed saved snapshot / replay receipt');
  const denied=await send('approve',{caseId:submit.receipt.caseId,selfReviewConfirmed:true},'employee');assert.equal(denied.status,403);console.log('PASS employee receives no approval authority');
  const locked=await f.request('/api/ipqc-ab/workflow?scope=A%3ABORUAXE1021','POST',{action:'begin'},'admin2');assert.equal(locked.body.error,'PENDING_LOCKED');console.log('PASS module pending locks every group');
  const approved=good(await send('approve',{caseId:submit.receipt.caseId,reason:'Isolated ADMIN cross-account approval'},'admin2'));
  const root=JSON.parse((await f.core.readState()).values.ipqcABMasterControl);assert.ok(Object.values(root.scopes).every(s=>s.activeVersionId===approved.control.activeVersionId));assert.equal(root.moduleDraft.workflow.cases.at(-1).result.actor.id,'admin2');console.log('PASS one cross-account approval / every group source projection');
  good(await request({action:'begin'}));const next=good(await send('save'));const case2=good(await send('submit',{savedId:next.control.workflow.saved.id,reason:'Isolated self-review check'}));
  assert.equal((await send('approve',{caseId:case2.receipt.caseId})).body.error,'SELF_REVIEW_CONFIRM_REQUIRED');
  const approved2=good(await send('approve',{caseId:case2.receipt.caseId,selfReviewConfirmed:true,reason:'Explicit isolated self-review'}));assert.equal(approved2.control.workflow.cases.at(-1).result.selfReview,true);console.log('PASS explicit self-review audit / no-change advisory');
  const projectedRoot=JSON.parse((await f.core.readState()).values.ipqcABMasterControl);
  projectedRoot.scopes['isolated-later-member']={activeVersionId:null,versions:[]};
  for(const oldCase of projectedRoot.moduleDraft.workflow.cases)Object.defineProperty(oldCase,'content',{get(){throw Error('Completed historical body unexpectedly expanded');}});
  const adapter=f.load('lib/ipqc-ab-module-workflow.ts').abModuleWorkflowAdapter();
  const moduleControl=adapter.parse('{}',projectedRoot);adapter.serializeModel(moduleControl);
  assert.equal(projectedRoot.scopes['isolated-later-member'].versions.length,0);console.log('PASS later group does not expand or receive old completed cases');
  assert.equal((await request(null,'disabled')).status,403);console.log('PASS disabled account rejected');
  // A bad member must fail the complete immutable submission, never submit its
  // valid siblings. Mutate only this disposable in-memory fixture.
  good(await request({action:'begin'}));
  const badState=await f.core.readState(),badRoot=JSON.parse(badState.values.ipqcABMasterControl);
  const badScope=Object.values(badRoot.scopes).find(s=>s.workflow?.working?.items.some(i=>!i.deleted&&i.isEnabled));
  assert.ok(badScope);badScope.workflow.working.items.find(i=>!i.deleted&&i.isEnabled).productCodes.push('isolated-invalid-product');
  badState.values.ipqcABMasterControl=JSON.stringify(badRoot);
  f.db.prepare('UPDATE shared_state SET "values"=?').run(JSON.stringify(badState.values));
  const badSave=good(await send('save')),beforeInvalid=await f.core.readState();
  const invalid=await send('submit',{savedId:badSave.control.workflow.saved.id,reason:'One invalid group must fail the whole case'});
  assert.equal(invalid.body.error,'VALIDATION_FAILED');
  const afterInvalid=await f.core.readState();assert.equal(afterInvalid.revision,beforeInvalid.revision);assert.deepEqual(afterInvalid.values,beforeInvalid.values);
  console.log('PASS one invalid member rejects whole submission with no sibling/state writes');
 }finally{f.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
