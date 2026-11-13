/* oxlint-disable typescript/no-require-imports -- Actual production routes, only isolated SQLite/Map R2. */
const assert=require('node:assert/strict'),fixture=require('./test-master-page-runtime.cjs');
const copy=value=>JSON.parse(JSON.stringify(value)),checks=[];
(async()=>{
 for(const record of [false,true]){
  const f=await fixture(record);try{
   const sendProcess=async body=>{const response=await f.legacy[body?'POST':'GET'](new Request(f.base+'/api/master/workflow?scope=PROCESS&caseMetadata=1',{method:body?'POST':'GET',headers:{cookie:f.cookies.writer,origin:f.base,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}));return{status:response.status,body:await response.json()};};
   const loaded=await sendProcess();let process=(await sendProcess({action:'begin-v1',begin:{operationId:crypto.randomUUID(),basis:f.load('lib/workflow-begin.ts').beginBasis(loaded.body.control)}})).body.control;
   const path=['A-1',{id:'A-1-FLOW-02'},'name'];let response=await sendProcess({command:f.save(process,[{patches:[{op:'set',path,value:'PROCESS separate draft'}],guards:[{path,value:process.workflow.working['A-1'][1].name}]}])});assert.equal(response.status,200,JSON.stringify(response.body));process=response.body.control;
   let lines=await f.begin('LINES');response=await f.send('LINES',{command:f.save(lines,[{patches:[{op:'insert',path:['AB','lines',{id:'line-A'},'stages'],value:{id:'new-stage',code:'A-NEW',name:'Independent topology'}}],guards:[]}])});assert.equal(response.status,200,JSON.stringify(response.body));lines=response.body.control;
   const newTemplates=copy(f.load('lib/master-stage-link.ts').stageCatalogTemplates('A-NEW',f.root.active.PROCESS)),patch={op:'set',path:['A-NEW'],value:newTemplates};
   let before=await f.readRoot();response=await sendProcess({command:f.save(process,[{patches:[patch],guards:[{path:[],value:process.workflow.working}]}])});assert.equal(response.status,422,JSON.stringify(response.body));assert.equal(response.body.error,'STAGE_INVALID');assert.deepEqual(await f.readRoot(),before);
   response=await f.send('LINES',{command:f.command(lines,'submit',{expectedRevision:lines.workflow.revision,savedId:lines.workflow.saved.id,reason:'Independent LINES submit'})});assert.equal(response.status,200,JSON.stringify(response.body));lines=response.body.control;
   // Preserve a genuine old-format linked-case shape, never activate it.
   let root=await f.readRoot();const oldLink=f.load('lib/master-stage-link.ts').stageProcessLink({...f.root,active:{...f.root.active,__old:{lines:f.root.active.LINES.AB.lines.concat(f.root.active.LINES.C.lines)}}},'__old',{lines:lines.workflow.saved.content.AB.lines.concat(lines.workflow.saved.content.C.lines)},{});
   // This fixture intentionally has a PROCESS draft: old coupling would refuse it.
   assert.equal(root.workflowScopes.PROCESS.saved.content['A-1'][1].name,'PROCESS separate draft');
   root.workflowScopes.LINES.cases.at(-1).linkedProcess=oldLink;const state=await f.core.readState();await f.install({...state.values,masterDataControl:JSON.stringify(root)},state.revision+1);before=await f.readRoot();
   response=await f.send('LINES',{command:f.command(lines,'approve',{caseId:lines.workflow.pendingId,reason:'Cannot publish old cross-page body'})},'reviewer');assert.equal(response.status,409,JSON.stringify(response.body));assert.equal(response.body.error,'MASTER_LEGACY_LINK_REQUIRES_WITHDRAWAL');assert.deepEqual(await f.readRoot(),before);
   response=await f.send('LINES',{command:f.command(lines,'withdraw',{caseId:lines.workflow.pendingId,reason:'Keep old linked case, resubmit independently'})});assert.equal(response.status,200,JSON.stringify(response.body));lines=response.body.control;
   response=await f.send('LINES',{command:f.command(lines,'submit',{expectedRevision:lines.workflow.revision,savedId:lines.workflow.saved.id,reason:'Separate LINES only'})});assert.equal(response.status,200,JSON.stringify(response.body));lines=response.body.control;assert.equal(lines.workflow.cases.at(-1).linkedProcess,undefined);
   response=await f.send('LINES',{command:f.command(lines,'approve',{caseId:lines.workflow.pendingId,reason:'Independent reviewer'})},'reviewer');assert.equal(response.status,200,JSON.stringify(response.body));root=await f.readRoot();assert.deepEqual(root.workflowScopes.PROCESS,before.workflowScopes.PROCESS);assert.deepEqual(root.active.PROCESS,before.active.PROCESS);
   process=(await sendProcess()).body.control;const batches=[{patches:[patch],guards:[{path:[],value:process.workflow.working}]}];
   const current=await f.core.readState(),users=JSON.parse(current.values.platformUsers);users[0].accessOverrides['templates.create']=false;await f.install({...current.values,platformUsers:JSON.stringify(users)},current.revision+1);before=await f.readRoot();response=await sendProcess({command:f.save(process,batches)});assert.equal(response.status,403,JSON.stringify(response.body));assert.deepEqual(await f.readRoot(),before);
   users[0].accessOverrides['templates.create']=true;await f.install({...current.values,platformUsers:JSON.stringify(users),masterDataControl:JSON.stringify(before)},current.revision+2);
   response=await sendProcess({command:f.save(process,batches)});assert.equal(response.status,200,JSON.stringify(response.body));process=response.body.control;
   before=await f.readRoot();response=await sendProcess({command:f.command(process,'restore',{restoreSaveId:process.workflow.saved.id,expectedRevision:process.workflow.revision})});assert.equal(response.status,409,JSON.stringify(response.body));assert.equal(response.body.error,'APPROVED_HISTORY_READ_ONLY');assert.deepEqual(await f.readRoot(),before);
   for(const kind of ['process-body','process-pointer','lines-mirror']){
    const changed=copy(before);if(kind==='process-body')changed.active.PROCESS['A-1'][0].name='Not approved';if(kind==='process-pointer')changed.workflowScopes.PROCESS.active.id='not-approved';if(kind==='lines-mirror')changed.active.AB.lines[0].stages.push({id:'forged',code:'A-FORGED',name:'Forged mirror'});
    const state=await f.core.readState();await f.install({...state.values,masterDataControl:JSON.stringify(changed)},state.revision+1);
    if(kind==='lines-mirror'){const raw=await sendProcess();assert.equal(raw.status,200,JSON.stringify(raw.body));const patch={op:'set',path:['A-FORGED'],value:newTemplates};const denied=await sendProcess({command:f.save(raw.body.control,[{patches:[patch],guards:[{path:[],value:raw.body.control.workflow.working}]}])});assert.equal(denied.status,422);assert.equal(denied.body.error,'STAGE_INVALID');}else{const denied=await sendProcess();assert.equal(denied.status,409);assert.equal(denied.body.error,'PROCESS_EFFECTIVE_BASELINE_CONFLICT');}
    assert.deepEqual(await f.readRoot(),changed);
   }
   checks.push({record,status:'PASS',checks:'independent drafts; approved-only topology; create permission; old linked case refusal/withdraw/resubmit; no history restore; original PROCESS approval pointer; forged compatibility mirror refused'});
  }finally{f.close();}
 }
 console.log(JSON.stringify({status:'PASS',checks},null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
