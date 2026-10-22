/* oxlint-disable typescript/no-require-imports -- isolated real handlers. */
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),fixture=require('./ipqc-assignment-fixture.cjs');
(async()=>{const f=await fixture(process.argv[2]),events=[];
try{
 for(const mod of ['ipqc-ab','ipqc-c']){
  const ep='/api/'+mod+'/workflow'+(mod==='ipqc-ab'?'?scope=A%3AINOX':''),read=async()=>{const c=(await f.request('/api/'+mod,'GET',undefined,'a')).body.control;return mod==='ipqc-ab'?c.scopes['A:INOX']:c;};
  let c=await read();const clientId=randomUUID();let sequence=0;
  const command=async(action,fields={},user='a')=>{const r=await f.request(ep,'POST',{command:{generation:c.workflow.generation,operationId:randomUUID(),clientId,sequence:++sequence,action,...fields}},user);events.push({module:mod,action,status:r.status,error:r.body.error});if(r.status===200)c=r.body.control;return r;};
  const ok=async(...args)=>{const r=await command(...args);assert.equal(r.status,200,JSON.stringify(r.body));return r;};
  if(c.workflow?.pendingId)await ok('withdraw',{caseId:c.workflow.pendingId,reason:'Isolated review5 setup'});
  await f.request(ep,'POST',{action:'begin'},'a');c=await read();
  // First prove identical active content can be submitted without inventing a change.
  if(mod==='ipqc-ab'){
   await ok('save');await ok('submit',{savedId:c.workflow.saved.id,reason:'Isolated baseline through normal review'});await ok('approve',{caseId:c.workflow.pendingId,selfReviewConfirmed:true});await f.request(ep,'POST',{action:'begin'},'a');c=await read();
   assert.deepEqual(c.workflow.working,c.workflow.active.content);
   await ok('save');await ok('submit',{savedId:c.workflow.saved.id,reason:'Isolated unchanged-content review'});
   assert.ok(c.workflow.cases.find(x=>x.id===c.workflow.pendingId).contentIssues.issues.some(i=>i.code==='NO_SUBSTANTIVE_CHANGE'));
   await ok('withdraw',{caseId:c.workflow.pendingId,reason:'End isolated unchanged case'});
  }
  const item=c.workflow.working.items.find(i=>!i.deleted&&i.standard);
  await ok('apply',{patches:[{op:'set',path:['items',{id:item.id},'standard'],value:''}]});
  await ok('save');await ok('submit',{savedId:c.workflow.saved.id,reason:'Isolated incomplete standard'});
  const caseId=c.workflow.pendingId;
  assert.equal((await command('approve',{caseId})).body.error,'SELF_REVIEW_CONFIRM_REQUIRED');
  assert.equal((await command('approve',{caseId,selfReviewConfirmed:true},'viewer')).status,403);
  assert.equal((await command('approve',{caseId:'wrong-case',selfReviewConfirmed:true})).status,409);
  assert.equal((await command('save')).body.error,'PENDING_LOCKED');
  await ok('approve',{caseId,selfReviewConfirmed:true});
  assert.equal(c.activeVersionId,caseId);assert.equal(c.workflow.cases.find(x=>x.id===caseId).result.selfReview,true);
 }
 const ep='/api/process-authoring/workflow';let c=(await f.request(ep,'GET')).body.control;
 const workspace={id:JSON.stringify(['INOX','C']),line:'C',category:'INOX',stages:{'A-ASSY':[],'C-CHI':[{id:'review5-c-chi',stageCode:'C-CHI',number:'C-CHI-01',name:'',productCodes:['3060104'],nextIds:[],mode:'human',instructions:'',machineIds:[]}]}};
 assert.equal(c.workflow.working.workspaces.some(w=>w.id===workspace.id),false);
 const insert=async w=>f.request(ep,'POST',{command:{generation:c.workflow.generation,operationId:randomUUID(),clientId:randomUUID(),sequence:1,action:'apply',patches:[{op:'insert',path:['workspaces'],value:w}]}});
 assert.equal((await insert(workspace)).body.error,'STAGE_INVALID');delete workspace.stages['A-ASSY'];
 const r=await insert(workspace);assert.equal(r.status,200,JSON.stringify(r.body));c=r.body.control;
 const cmd=async(action,fields={})=>{const result=await f.request(ep,'POST',{command:{generation:c.workflow.generation,operationId:randomUUID(),clientId:randomUUID(),sequence:1,action,...fields}});if(result.status===200)c=result.body.control;return result;};
 assert.equal((await cmd('save')).status,200);assert.ok(c.workflow.saved.content.workspaces.find(w=>w.id===workspace.id));
 assert.equal((await cmd('apply',{patches:[{op:'set',path:['workspaces',{id:workspace.id},'stages','C-CHI',{id:'review5-c-chi'},'productCodes'],value:['missing-product']}],guards:[{path:['workspaces',{id:workspace.id},'stages','C-CHI',{id:'review5-c-chi'},'productCodes'],value:['3060104']}]})).body.error,'OPERATION_PRODUCT_ROUTE_INVALID');
 events.push({test:'same-category cross-line empty-stage reproduction; allowed-stage insert and Save; invalid product rejected',result:'PASS'});
 const {createSharedDraft,applyDraftCommand}=f.load('lib/shared-draft.ts');
 for(const scope of ['master:AB','master:C','master:PROCESS','iqc','fqc','routine-equipment','tooling']){
  let flow=createSharedDraft(scope,{name:''},'active',randomUUID());let n=0;
  const ctx={actor:{id:'staff',name:'staff',admin:false},at:'isolated',id:randomUUID,allowed:()=>true,structure(){},validate:()=>[{kind:'missing',path:['name'],message:'NAME_REQUIRED'}],semantic:x=>x,activeId:'active'};
  const command=(action,fields={})=>{flow=applyDraftCommand(flow,{generation:flow.generation,operationId:randomUUID(),clientId:'review5-client',sequence:++n,action,...fields},ctx).state;};
  command('save');command('submit',{savedId:flow.saved.id,reason:'Isolated missing and unchanged'});assert.equal(flow.cases[0].contentIssues.issues.length,2);
  command('approve',{caseId:flow.pendingId,selfReviewConfirmed:true});assert.equal(flow.cases[0].result.selfReview,true);
  const bad=createSharedDraft(scope,{name:''},'active',randomUUID());bad.saved={id:'saved',content:{name:''}};
  assert.throws(()=>applyDraftCommand(bad,{generation:bad.generation,operationId:randomUUID(),clientId:'review5-client',sequence:1,action:'submit',savedId:'saved',reason:'test'},{...ctx,validate:()=>[{kind:'error',path:['name'],message:'INVALID_REFERENCE'}]}),e=>e.code==='VALIDATION_FAILED');
 }
 events.push({test:'shared kernel: all module missing/no-change advisories, authorized self-review, invalid-reference errors retained',result:'PASS'});
 console.log(JSON.stringify({result:'PASS',formalWrites:0,events},null,2));
}finally{f.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
