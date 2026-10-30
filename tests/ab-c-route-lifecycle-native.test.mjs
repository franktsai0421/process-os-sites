import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {createABCFixture} from './ab-c-native-fixture.mjs';
const f=await createABCFixture({withAuthoring:true});let sequence=0;const checks=[];
const req=async(endpoint,body)=>{const response=await f.mf.dispatchFetch(f.url.origin+endpoint,{method:body?'POST':'GET',headers:{Cookie:'process_demo='+f.cookie(),Origin:f.url.origin,'Content-Type':'application/json',Connection:'close'},...(body?{body:JSON.stringify(body)}:{})});const value=await response.json();assert.equal(response.status,200,JSON.stringify(value));return value;};
const master=scope=>'/api/master/workflow?scope='+scope,editor='/api/process-authoring/workflow';
const get=async endpoint=>(await req(endpoint)).control;
const cmd=async(endpoint,action,detail={})=>req(endpoint,{command:{action,generation:(await get(endpoint)).workflow.generation,operationId:randomUUID(),clientId:'route-cycle',sequence:++sequence,...detail}});
const decode=async()=>{const row=await f.db.prepare('SELECT "values" FROM shared_state WHERE id=1').first();return(await f.load('lib/state-records.ts').decodeRecordValues(await f.mf.getR2Bucket('STATE_ARCHIVE'),JSON.parse(row.values))).values;};
try{
 await req(editor,{action:'begin'});const staleEditor=(await get(editor)).workflow;
 const before=JSON.parse((await decode()).processAuthoringControl),original=JSON.stringify(before.workflow.working);
 for(const scope of ['AB','C']){
  const line=scope==='AB'?'A':'C',url=master(scope);
  for(const suffixes of [['A','B','C'],['A','B','C','D'],['A','B','C','D','E'],['D','C','B','A','E']]){
   await req(url,{action:'begin'});const flow=(await get(url)).workflow,g=flow.working.categoryGroups.find(g=>g.name==='GROUP-1'),path=['categoryGroups',{id:g.id},'defaultStages'],stages=suffixes.map(s=>line+'-'+s),prior=JSON.stringify(JSON.parse((await decode()).masterDataControl).active[scope].categoryGroups);
   await cmd(url,'apply',{patches:[{op:'set',path,value:stages}],guards:[{path,value:g.defaultStages},{path:['products'],value:flow.working.products},{path:['lines'],value:flow.working.lines}]});
   const saved=await cmd(url,'save');assert.equal(JSON.stringify(JSON.parse((await decode()).masterDataControl).active[scope].categoryGroups),prior,'Apply and Save cannot change effective canvas');
   const submitted=await cmd(url,'submit',{savedId:saved.control.workflow.saved.id,reason:'Synthetic route cycle'});await cmd(url,'approve',{caseId:submitted.control.workflow.pendingId,selfReviewConfirmed:true});
   const state=await decode();assert.deepEqual(JSON.parse(state.masterDataControl).active[scope].categoryGroups.find(g=>g.name==='GROUP-1').defaultStages,stages);assert.equal(JSON.stringify(JSON.parse(state.processAuthoringControl).workflow.working),original,'route never rewrites hidden editor payload');
  }
  for(const suffixes of [['A','B','C','D'],['A','B','C']]){
   await req(url,{action:'begin'});const flow=(await get(url)).workflow,p=flow.working.products[0],path=['products',{id:p.id},'stages'];
   await cmd(url,'apply',{patches:[{op:'set',path,value:suffixes.map(s=>line+'-'+s)}],guards:[{path,value:p.stages}]});
   const saved=await cmd(url,'save'),submitted=await cmd(url,'submit',{savedId:saved.control.workflow.saved.id,reason:'Synthetic product route'});await cmd(url,'approve',{caseId:submitted.control.workflow.pendingId,selfReviewConfirmed:true});
   assert.deepEqual(JSON.parse((await decode()).masterDataControl).active[scope].products[0].stages,suffixes.map(s=>line+'-'+s));
  }
  await req(url,{action:'begin'});const flow=(await get(url)).workflow,l=flow.working.lines[0],stage=l.stages.find(s=>s.code===line+'-D'),path=['lines',{id:l.id},'stages',{id:stage.id},'name'];
  await cmd(url,'apply',{patches:[{op:'set',path,value:'Renamed stable D'}],guards:[{path,value:stage.name}]});const saved=await cmd(url,'save'),submitted=await cmd(url,'submit',{savedId:saved.control.workflow.saved.id,reason:'Rename stage'});await cmd(url,'approve',{caseId:submitted.control.workflow.pendingId,selfReviewConfirmed:true});
  assert.equal(JSON.stringify(JSON.parse((await decode()).processAuthoringControl).workflow.working),original);checks.push(scope+' product ABC→ABCD→ABC and stage rename preserve stable editor content');
  checks.push(scope+' approved ABCD→ABC→ABCD→ABCDE and reorder; working canvas and product exceptions retained');
 }
 // A writer who opened the canvas before catalog approval can save its own
 // guarded operation field, but cannot write the independently approved route.
 const w=staleEditor.working.workspaces[0],op=w.stages['A-D'][0],path=['workspaces',{id:w.id},'stages','A-D',{id:op.id},'name'];await cmd(editor,'apply',{patches:[{op:'set',path,value:'Old canvas editor new name'}],guards:[{path,value:op.name}]});await cmd(editor,'save');
 const state=await decode();assert.deepEqual(JSON.parse(state.masterDataControl).active.AB.categoryGroups[0].defaultStages,['D','C','B','A','E'].map(s=>'A-'+s));assert.equal(JSON.parse(state.processAuthoringControl).workflow.saved.content.workspaces[0].stages['A-D'][0].x,125);checks.push('old canvas writer preserves independently approved group route');
 console.log(JSON.stringify({status:'PASS_AB_C_ROUTE_LIFECYCLE_NATIVE',checks,programCommit:f.programCommit,buildEntrySha256:f.buildEntrySha256}));
}finally{await f.close();}
