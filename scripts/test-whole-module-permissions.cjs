/* oxlint-disable typescript/no-require-imports -- isolated production handlers; no listening port. */
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),fixture=require('./ipqc-assignment-fixture.cjs');
const modules=[['AB master','/api/master/workflow?scope=AB'],['C master','/api/master/workflow?scope=C'],['Process master','/api/master/workflow?scope=PROCESS'],['FQC','/api/fqc/workflow'],['IQC','/api/iqc/workflow'],['Equipment','/api/routine-equipment/workflow'],['IPQC-AB','/api/ipqc-ab/workflow?module=1'],['IPQC-C','/api/ipqc-c/workflow'],['Process authoring','/api/process-authoring/workflow'],['Tooling','/api/tooling/workflow']];
(async()=>{const f=await fixture(process.argv[2]),seq={};try{for(const [name,endpoint]of modules.filter(([name])=>!process.argv[3]||process.argv[3].split(',').includes(name))){
 const call=(body,user='employee')=>f.request(endpoint,body?'POST':'GET',body||undefined,user);
 const ok=r=>{assert.equal(r.status,200,name+': '+JSON.stringify(r.body));return r.body;};
 const send=async(action,fields={},user='employee')=>{const r=ok(await call(null,user)),flow=r.control?.workflow||r.workflow;return call({command:{operationId:randomUUID(),clientId:'matrix-'+user,generation:flow.generation,sequence:seq[user]=(seq[user]||0)+1,action,expectedRevision:flow.revision,input:{stateRevision:r.revision},...fields}},user);};
 ok(await call({action:'begin'}));const start=ok(await call(null));assert.equal(start.permissions.edit,true);assert.equal(start.permissions.approve,false);
 const saved=ok(await send('save')),submit=ok(await send('submit',{savedId:saved.control.workflow.saved.id,reason:'Isolated permission matrix '+name})),caseId=submit.receipt.caseId;
 assert.equal((await send('save')).body.error,'PENDING_LOCKED');assert.equal((await send('approve',{caseId,selfReviewConfirmed:true})).status,403);
 ok(await send('withdraw',{caseId,reason:'ADMIN 2 cross-account withdrawal'},'admin2'));
 const next=ok(await send('save',{},'admin')),second=ok(await send('submit',{savedId:next.control.workflow.saved.id,reason:'Isolated explicit self-review '+name},'admin')),secondId=second.receipt.caseId;
 assert.equal((await send('approve',{caseId:secondId},'admin')).body.error,'SELF_REVIEW_CONFIRM_REQUIRED');
 const issueCase=second.control.workflow.cases.find(c=>c.id===secondId),acknowledgedContentIssues=issueCase.contentIssues?.issues||[];
 const approved=ok(await send('approve',{caseId:secondId,selfReviewConfirmed:true,reason:'Explicit isolated self-review',acknowledgedContentIssues},'admin'));
 assert.equal(approved.control.workflow.cases.find(c=>c.id===secondId).result.selfReview,true);
 ok(await call({action:'begin'},'admin2'));const admin2Save=ok(await send('save',{},'admin2'));
 const third=ok(await send('submit',{savedId:admin2Save.control.workflow.saved.id,reason:'Isolated ADMIN 2 save and submit '+name},'admin2'));
 ok(await send('withdraw',{caseId:third.receipt.caseId,reason:'Module-access employee withdrawal'},'employee'));
 const employeeSave=ok(await send('save')),fourth=ok(await send('submit',{savedId:employeeSave.control.workflow.saved.id,reason:'Isolated cross-account approval '+name}));
 const finalCase=fourth.control.workflow.cases.find(c=>c.id===fourth.receipt.caseId);
 ok(await send('approve',{caseId:fourth.receipt.caseId,reason:'ADMIN 2 cross-account review',acknowledgedContentIssues:finalCase.contentIssues?.issues||[]},'admin2'));
 assert.equal((await call(null,'disabled')).status,403);console.log('PASS '+name+': employee edit/whole-save/submit; lock; no approval grant; ADMIN cross-withdraw; explicit self-review; disabled rejection');
 }}finally{f.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
