/* oxlint-disable typescript/no-require-imports -- Actual routes; synthetic persisted policy in memory storage only. */
const assert=require('node:assert/strict'),fixture=require('./test-master-page-runtime.cjs');
const {accessKeys}=require('../public/process/access-policy.mjs');
const copy=value=>JSON.parse(JSON.stringify(value)),results=[];
(async()=>{
 for(const record of [false,true]){
  const f=await fixture(record),mode=record?'records':'inline';
  try{
   const users=JSON.parse(f.values.platformUsers),writer=users.find(row=>row.id==='writer'),reviewer=users.find(row=>row.id==='reviewer');
   writer.accessOverrides=Object.fromEntries(accessKeys.map(key=>[key,['lines.view','lines.edit','lines.approve'].includes(key)]));reviewer.accessOverrides['approval.approve']=false;
   const policy={schemaVersion:2,primaryAdminId:'frank',draftReviewPolicy:'page-v1',audit:[]};
   await f.install({...f.values,platformUsers:JSON.stringify(users),processAccessControl:JSON.stringify(policy)});
   let control=await f.begin('LINES');assert.equal(control.workflow.scope,'master:LINES');assert.equal((await f.send('AB')).status,403);assert.equal((await f.send('C')).status,403);
   results.push({name:mode+' lines-only role can reach its owner API without AB/C product access',status:'PASS'});
   const current=await f.send('LINES');assert.equal(current.body.permissions.edit,true);assert.equal(current.body.permissions.save,true);assert.equal(current.body.permissions.approve,false);assert.equal(current.body.permissions.submit,true);assert.equal(current.body.permissions.withdraw,true);
   const path=['AB','lines',{id:'line-A'},'name'];let response=await f.send('LINES',{command:f.save(control,[{patches:[{op:'set',path,value:'Role-edited line'}],guards:[{path,value:'A'}]}])});assert.equal(response.status,200,JSON.stringify(response.body));control=response.body.control;
   assert.equal(control.workflow.saved.content.AB.lines[0].name,'Role-edited line');assert.equal(JSON.parse((await f.core.readState()).values.platformUsers).find(row=>row.id==='writer').accessOverrides['lines.save'],false,'effective transaction Save must not rewrite the stored grant');
   results.push({name:mode+' new LINES edit includes atomic Save without persisting a derived grant',status:'PASS'});
   const submit=async()=>{const response=await f.send('LINES',{command:f.command(control,'submit',{expectedRevision:control.workflow.revision,savedId:control.workflow.saved.id,reason:'Synthetic role submit'})});assert.equal(response.status,200,JSON.stringify(response.body));control=response.body.control;};
   await submit();let before=copy(await f.readRoot());response=await f.send('LINES',{command:f.command(control,'approve',{caseId:control.workflow.pendingId,reason:'Module grant is not high approval',selfReviewConfirmed:true})});assert.equal(response.status,403,JSON.stringify(response.body));assert.deepEqual(await f.readRoot(),before);
   results.push({name:mode+' module review grant maps to submit/correction but cannot perform final approval',status:'PASS'});
   response=await f.send('LINES',{command:f.command(control,'return',{caseId:control.workflow.pendingId,reason:'Own correction is allowed'})});assert.equal(response.status,200,JSON.stringify(response.body));control=response.body.control;assert.equal(control.workflow.pendingId,null);
   results.push({name:mode+' author can return own pending case for correction without self-approval authority',status:'PASS'});
   await submit();before=copy(await f.readRoot());response=await f.send('LINES',{command:f.command(control,'approve',{caseId:control.workflow.pendingId,reason:'No retained high grant'})},'reviewer');assert.equal(response.status,403,JSON.stringify(response.body));assert.deepEqual(await f.readRoot(),before);
   const state=await f.core.readState(),updatedUsers=JSON.parse(state.values.platformUsers),target=updatedUsers.find(row=>row.id==='reviewer');target.accessOverrides['approval.approve']=true;
   const updatedPolicy={...policy,audit:[{id:'synthetic-high-grant',actor:{id:'frank',role:'admin'},target:'reviewer',action:'update-user',before:{accessOverrides:{'approval.approve':false}},after:{accessOverrides:{'approval.approve':true}}}]};
   await f.install({...state.values,platformUsers:JSON.stringify(updatedUsers),processAccessControl:JSON.stringify(updatedPolicy)},state.revision+1);
   const caseId=control.workflow.pendingId;before=copy(await f.readRoot());
   f.hook(async()=>{const fresh=await f.core.readState(),revoked=JSON.parse(fresh.values.platformUsers);revoked.find(row=>row.id==='reviewer').accessOverrides['approval.approve']=false;await f.install({...fresh.values,platformUsers:JSON.stringify(revoked)},fresh.revision+1);});
   response=await f.send('LINES',{command:f.command(control,'approve',{caseId,reason:'Synthetic CAS revocation must win'})},'reviewer');assert.equal(response.status,403,JSON.stringify(response.body));assert.deepEqual(await f.readRoot(),before);assert.equal((await f.readRoot()).workflowScopes.LINES.pendingId,caseId);
   results.push({name:mode+' revocation of the high grant at CAS retries with fresh policy and cannot publish approval',status:'PASS'});
   const fresh=await f.core.readState(),regranted=JSON.parse(fresh.values.platformUsers);regranted.find(row=>row.id==='reviewer').accessOverrides['approval.approve']=true;
   await f.install({...fresh.values,platformUsers:JSON.stringify(regranted),processAccessControl:JSON.stringify({...updatedPolicy,audit:[...updatedPolicy.audit,{...updatedPolicy.audit[0],id:'synthetic-regrant'}]})},fresh.revision+1);
   response=await f.send('LINES',{command:f.command(control,'approve',{caseId,reason:'Synthetic independently authorized approval'})},'reviewer');assert.equal(response.status,200,JSON.stringify(response.body));control=response.body.control;assert.equal(control.activeVersionId,caseId);assert.equal((await f.readRoot()).active.LINES.AB.lines[0].name,'Role-edited line');
   results.push({name:mode+' retained explicit high grant permits independent final approval',status:'PASS'});
   control=await f.begin('LINES');before=copy(await f.readRoot());response=await f.send('LINES',{command:f.command(control,'withdraw',{caseId,reason:'Approved cases cannot be withdrawn'})});assert.equal(response.status,409,JSON.stringify(response.body));assert.notEqual(response.body.error,'BEGIN_REQUIRED');assert.deepEqual(await f.readRoot(),before);
   results.push({name:mode+' module correction cannot withdraw an approved immutable version',status:'PASS'});
  }finally{f.close();}
 }
 console.log(JSON.stringify({status:'PASS',results,scope:'Actual owner routes; synthetic signed users/persisted policy; SQLite :memory:/Map R2 only; no real ACL or activation'},null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
