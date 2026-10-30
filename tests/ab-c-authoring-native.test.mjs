import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createABCFixture} from './ab-c-native-fixture.mjs';
const f=await createABCFixture({withAuthoring:true});let sequence=0;const checks=[];
const request=async body=>{const response=await f.mf.dispatchFetch(f.url.origin+'/api/process-authoring/workflow',{method:body?'POST':'GET',headers:{Cookie:'process_demo='+f.cookie(),Origin:f.url.origin,'Content-Type':'application/json',Connection:'close'},...(body?{body:JSON.stringify(body)}:{})});return{status:response.status,body:await response.json()};};
const ok=r=>{assert.equal(r.status,200,JSON.stringify(r.body));return r.body;};
const get=async()=>ok(await request()).control;
const command=async(action,detail={})=>request({command:{action,generation:(await get()).workflow.generation,operationId:randomUUID(),clientId:'authoring-test',sequence:++sequence,...detail}});
try{
 ok(await request({action:'begin'}));
 for(const line of ['A','C']){
  const flow=(await get()).workflow,w=flow.working.workspaces.find(w=>w.line===line),op=w.stages[line+'-D'][0],path=['workspaces',{id:w.id},'stages',line+'-D',{id:op.id},'name'];
  ok(await command('apply',{patches:[{op:'set',path,value:'Updated retained '+line}],guards:[{path,value:op.name}]}));
  let invalid=await command('apply',{patches:[{op:'insert',path:['workspaces',{id:w.id},'stages',line+'-D'],value:{...op,id:line+'-new'}}]});
  assert.equal(invalid.status,422);assert.equal(invalid.body.error,'OPERATION_PRODUCT_ROUTE_INVALID');
  const bomPath=['workspaces',{id:w.id},'stages',line+'-D',{id:op.id},'bomSelections'];
  invalid=await command('apply',{patches:[{op:'set',path:bomPath,value:{[line+'001']:['new-part']}}],guards:[{path:bomPath,value:{}}]});assert.equal(invalid.status,422);assert.equal(invalid.body.error,'OPERATION_PRODUCT_ROUTE_INVALID');
  checks.push(line+' retain old invalid reference; reject new product and BOM reference');
 }
 const saved=ok(await command('save'));const submitted=ok(await command('submit',{savedId:saved.control.workflow.saved.id,reason:'Route removed; reviewer decides'}));
 const pending=submitted.control.workflow.cases.find(c=>c.id===submitted.control.workflow.pendingId);
 assert(pending);assert(JSON.stringify(pending).includes('PRODUCT_ROUTE_CHANGED'));
 ok(await command('approve',{caseId:pending.id,selfReviewConfirmed:true,acknowledgedContentIssues:pending.contentIssues.issues}));
 const final=await get();for(const line of ['A','C']){const op=final.workflow.active.content.workspaces.find(w=>w.line===line).stages[line+'-D'][0];assert.deepEqual(op.productCodes,[line+'001']);assert.equal(op.x,125);assert.equal(op.y,175);}
 checks.push('visible route advisory permits fixed submission and reviewer approval; old nodes retained');
 console.log(JSON.stringify({status:'PASS_AB_C_AUTHORING_NATIVE',checks,programCommit:f.programCommit,buildEntrySha256:f.buildEntrySha256,realData:false}));
}finally{await f.close();}
