import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createProcessMasterFixture} from './process-master-cloud-fixture.mjs';
const report={status:'PENDING',cases:[],api:[],isolated:true};let fixture;
try{
 fixture=await createProcessMasterFixture();const origin=fixture.url.origin,cookies=new Map();let sequence=0;
 async function request(path,actor='frank',body){
  const at=performance.now(),response=await fixture.mf.dispatchFetch(origin+path,{method:body?'POST':'GET',headers:{...(cookies.has(actor)?{Cookie:cookies.get(actor)}:{}),Origin:origin,'Content-Type':'application/json',Connection:'close'},...(body?{body:JSON.stringify(body)}:{})});
  const value=await response.json();report.api.push({path:path.split('?')[0],action:body?.action||body?.command?.action||'GET',actor,status:response.status,ms:Math.round(performance.now()-at)});return{status:response.status,value};
 }
 for(const actor of fixture.users){const r=await fixture.mf.dispatchFetch(origin+'/api/platform-login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({id:actor.id,password:fixture.password})});assert.equal(r.status,200);cookies.set(actor.id,r.headers.get('Set-Cookie').split(';')[0]);}
 const endpoint='/api/master/workflow?scope=PROCESS';
 assert.equal((await request(endpoint,'other-admin')).status,200);
 const read=async actor=>{const r=await request(endpoint,actor);assert.equal(r.status,200,JSON.stringify(r.value));return r.value.control.workflow;};
 const run=async(actor,action,detail={})=>{const f=await read(actor);return request(endpoint,actor,{command:{operationId:randomUUID(),clientId:'native-'+actor,sequence:++sequence,generation:f.generation,action,...detail}});};
 const check=(name)=>report.cases.push({name,status:'PASS'});
 assert.equal((await request(endpoint,'reader',{action:'begin'})).status,403);
 assert.equal((await request(endpoint,'denied')).status,403);check('direct API denies view and begin to restricted actors');
 assert.equal((await request(endpoint,'editor',{action:'begin'})).status,200);
 for(const action of ['begin','apply','save','submit','withdraw','return','approve'])assert.equal((await run('reader',action,{savedId:'missing',caseId:'missing',reason:'permission test',patches:[],guards:[]})).status,403,action);
 check('read-only actor denied all mutation commands');

 const edit=(await read('editor'));const path=['A-CUT',{id:'A-CUT-CUSTOM-1'},'name'];
 const result=await run('editor','apply',{patches:[{op:'set',path,value:'Saved synthetic flow'}],guards:[{path,value:edit.working['A-CUT'].find(t=>t.id==='A-CUT-CUSTOM-1').name}]});assert.equal(result.status,200);
 assert.equal(result.value.control.workflow.saved,null);check('Apply changes working only');
 const saved=await run('editor','save');assert.equal(saved.status,200);const savedId=saved.value.control.workflow.saved.id;
 const submit=await run('editor','submit',{savedId,reason:'Synthetic acceptance'});assert.equal(submit.status,200);const caseId=submit.value.receipt.caseId;
 assert.equal((await run('editor','apply',{patches:[{op:'set',path,value:'blocked'}],guards:[{path,value:'Saved synthetic flow'}]})).status,409);
 assert.equal((await run('editor','approve',{caseId})).status,403);check('pending locks and reviewer permissions enforced server-side');
 assert.equal((await run('editor','withdraw',{caseId,reason:'Synthetic withdrawal'})).status,200);
 const retry=await run('editor','submit',{savedId:(await read('editor')).saved.id,reason:'Same saved content'});assert.equal(retry.status,200);check('withdraw and unchanged saved resubmit');
 const returned=await run('reviewer','return',{caseId:retry.value.receipt.caseId,reason:'Synthetic return'});assert.equal(returned.status,200);
 const again=await run('editor','submit',{savedId:(await read('editor')).saved.id,reason:'Resubmit after return'});assert.equal(again.status,200);
 const approved=await run('reviewer','approve',{caseId:again.value.receipt.caseId});assert.equal(approved.status,200);
 assert.equal(approved.value.control.versions.find(v=>v.id===approved.value.control.activeVersionId).snapshot['A-CUT'].find(t=>t.id==='A-CUT-CUSTOM-1').name,'Saved synthetic flow');
 check('reviewer return, resubmit, approve and effective readback');
 assert.equal((await request(endpoint,'frank',{action:'begin'})).status,200);
 const working=(await read('frank')).working;
 for(const [kind,id,path]of [
 ['template','fixture-custom-0',['A-CUT',{id:'A-CUT-CUSTOM-0'}]],
 ['equipment','A-CUT-EQ-0',['A-CUT',{id:'A-CUT-machine-assembly'},'equipment',{id:'A-CUT-EQ-0'}]]
 ]){
  if(typeof kind!=='string'||typeof id!=='string')throw Error('Invalid test target');
  const refs=await request('/api/master/references?scope=PROCESS&kind='+String(kind)+'&id='+String(id));assert.equal(refs.status,200);assert.ok(refs.value.total>0);assert.ok(refs.value.references.some(r=>r.operationId==='reference-operation'));
  const value=path.reduce((v,k)=>typeof k==='string'?v[k]:v.find(row=>row.id===k.id),working);
  const deleted=await run('frank','apply',{patches:[{op:'remove',path}],guards:[{path,value}]});assert.equal(deleted.status,409);assert.equal(deleted.value.error,'PROCESS_MASTER_IN_USE');
 }
 check('template and equipment live references block direct API removal with concrete lookup');
 const privateRefs=await request('/api/master/references?scope=PROCESS&kind=template&id=fixture-custom-0','reader');
 assert.equal(privateRefs.status,200);assert.ok(privateRefs.value.total>0);assert.deepEqual(privateRefs.value.references,[]);check('reference detail does not leak editor content to template-only readers');
 const freePath=['A-CUT',{id:'A-CUT-CUSTOM-2'}],free=working['A-CUT'].find(t=>t.id==='A-CUT-CUSTOM-2');
 const freeDelete=await run('frank','apply',{patches:[{op:'remove',path:freePath}],guards:[{path:freePath,value:free}]});assert.equal(freeDelete.status,200);assert.ok(!freeDelete.value.control.workflow.working['A-CUT'].some(t=>t.id===free.id));assert.ok(freeDelete.value.control.workflow.active.content['A-CUT'].some(t=>t.id===free.id));check('unreferenced deletion changes working and preserves effective history');
 const current=await read('frank'),p=['A-CUT',{id:'A-CUT-CUSTOM-3'},'name'],before=current.working['A-CUT'].find(t=>t.id==='A-CUT-CUSTOM-3').name;
 const command={operationId:randomUUID(),clientId:'retry-fixture',sequence:1,generation:current.generation,action:'apply',patches:[{op:'set',path:p,value:'One write'}],guards:[{path:p,value:before}]};
 const first=await request(endpoint,'frank',{command}),replay=await request(endpoint,'frank',{command});assert.equal(first.status,200);assert.equal(replay.status,200);assert.equal(replay.value.revision,first.value.revision);check('same operation retry is idempotent without a second revision');
 const stale=await run('frank','apply',{patches:[{op:'set',path:p,value:'Stale overwrite'}],guards:[{path:p,value:before}]});assert.equal(stale.status,409);check('stale field guard preserves newer changes');
 
 const raceId='A-CUT-CUSTOM-4',racePath=['A-CUT',{id:raceId}],raceBefore=(await read('frank')).working['A-CUT'].find(t=>t.id===raceId);
 assert.equal((await request('/api/master/references?scope=PROCESS&kind=template&id=fixture-custom-4')).value.total,0);
 await fixture.mutateSyntheticValues(values=>{const versions=JSON.parse(values.approvalVersions);versions[0].stages['A-CUT'].push({id:'concurrent-reference',number:'A-02',name:'Concurrent',templateId:raceId,productCodes:['A1']});values.approvalVersions=JSON.stringify(versions);});
 const race=await run('frank','apply',{patches:[{op:'remove',path:racePath}],guards:[{path:racePath,value:raceBefore}]});assert.equal(race.status,409);assert.equal(race.value.error,'PROCESS_MASTER_IN_USE');check('reference added after frontend lookup is rejected by fresh mutation state');
 assert.ok((await read('frank')).working['A-CUT'].some(t=>t.id===raceId));
 const removalSaved=await run('frank','save');assert.equal(removalSaved.status,200);
 const removalSubmitted=await run('frank','submit',{savedId:removalSaved.value.control.workflow.saved.id,reason:'Deletion candidate'});assert.equal(removalSubmitted.status,200);
 await fixture.mutateSyntheticValues(values=>{const versions=JSON.parse(values.approvalVersions);versions[0].stages['A-CUT'].push({id:'review-time-reference',number:'A-03',name:'New reference before approval',templateId:'A-CUT-CUSTOM-2',productCodes:['A1']});values.approvalVersions=JSON.stringify(versions);});
 assert.equal((await run('reviewer','approve',{caseId:removalSubmitted.value.receipt.caseId})).status,409);
 assert.equal((await run('frank','withdraw',{caseId:removalSubmitted.value.receipt.caseId,reason:'Resolve new reference'})).status,200);
 assert.equal((await run('frank','submit',{savedId:(await read('frank')).saved.id,reason:'Still referenced'})).status,409);
 check('new references before approval and resubmission are rechecked; effective catalog remains intact');
 report.status='PASS';
}catch(error){report.status='FAIL';report.error=error.message;report.stack=error.stack;}
finally{await fixture?.close();console.log(JSON.stringify(report));}
process.exitCode=report.status==='PASS'?0:1;
