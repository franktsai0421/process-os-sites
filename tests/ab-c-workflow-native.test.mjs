import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createABCFixture} from './ab-c-native-fixture.mjs';
const fixture=await createABCFixture({includeOutsider:true}),checks=[];let sequence=0;
const request=async(scope,body,actor='frank',query='')=>{
 const response=await fixture.mf.dispatchFetch(fixture.url.origin+'/api/master/workflow?scope='+scope+query,{method:body?'POST':'GET',headers:{Cookie:'process_demo='+fixture.cookie(actor),Origin:fixture.url.origin,'Content-Type':'application/json',Connection:'close'},...(body?{body:JSON.stringify(body)}:{})});
 return {status:response.status,body:await response.json()};
};
const check=async(name,fn)=>{await fn();checks.push(name);};
async function get(scope){const r=await request(scope);assert.equal(r.status,200,JSON.stringify(r.body));return r.body.control;}
async function command(scope,action,details={},actor='frank'){
 const control=await get(scope);return request(scope,{command:{action,generation:control.workflow.generation,operationId:randomUUID(),clientId:'isolated-'+actor,sequence:++sequence,...details}},actor);
}
const ok=r=>{assert.equal(r.status,200,JSON.stringify(r.body));return r.body;};
try {
 for(const scope of ['AB','C']){
  const prefix=scope==='AB'?'A':'C';
  await check(scope+' viewer denied direct Begin and reference API',async()=>{assert.equal((await request(scope,{action:'begin'},'viewer')).status,403);assert.equal((await request(scope,null,'viewer','&references='+prefix+'001')).status,403);});
  await check(scope+' viewer cannot write lifecycle commands and outsider cannot view',async()=>{
   assert.equal((await request(scope,null,'outsider')).status,403);ok(await request(scope,{action:'begin'}));
   for(const action of ['apply','save','submit','withdraw','return','approve']){const result=await request(scope,{command:{action,generation:(await get(scope)).workflow.generation,operationId:randomUUID(),clientId:'denied',sequence:1,patches:[]}},'viewer');assert.equal(result.status,403,action+': '+JSON.stringify(result.body));}
  });
  await check(scope+' Begin, Apply and Save have distinct persisted results',async()=>{
   ok(await request(scope,{action:'begin'}));const before=(await get(scope)).workflow.working.products[0],path=['products',{id:before.id},'name'];
   const applied=ok(await command(scope,'apply',{patches:[{op:'set',path,value:'Changed '+scope}],guards:[{path,value:before.name}]}));assert.equal(applied.control.workflow.saved,null);
   const saved=ok(await command(scope,'save'));assert.equal(saved.control.workflow.saved.content.products[0].name,'Changed '+scope);assert.equal((await get(scope)).workflow.saved.id,saved.control.workflow.saved.id);
  });
  await check(scope+' Submit, return, resubmit, withdraw, resubmit and approve preserve fixed content',async()=>{
   const submit=async()=>ok(await command(scope,'submit',{savedId:(await get(scope)).workflow.saved.id,reason:'Synthetic review'}));
   let result=await submit();let id=result.control.workflow.pendingId;
   assert.equal((await command(scope,'save')).status,409);
   ok(await command(scope,'return',{caseId:id,reason:'Synthetic return',selfReviewConfirmed:true}));
   result=await submit();id=result.control.workflow.pendingId;ok(await command(scope,'withdraw',{caseId:id,reason:'Synthetic withdrawal'}));
   result=await submit();id=result.control.workflow.pendingId;ok(await command(scope,'approve',{caseId:id,selfReviewConfirmed:true}));
   const control=await get(scope);assert.equal(control.activeVersionId,id);assert.equal(control.versions.find(v=>v.id===id).snapshot.products[0].name,'Changed '+scope);assert.equal(control.workflow.cases.length,3);
  });
  await check(scope+' stale field guard rejects a second writer without overwriting first ACK',async()=>{
   ok(await request(scope,{action:'begin'}));const product=(await get(scope)).workflow.working.products[0],path=['products',{id:product.id},'name'];
   ok(await command(scope,'apply',{patches:[{op:'set',path,value:'First writer'}],guards:[{path,value:product.name}]}));
   const rejected=await command(scope,'apply',{patches:[{op:'set',path,value:'Stale writer'}],guards:[{path,value:product.name}]},'writer');assert.equal(rejected.status,409);assert.equal((await get(scope)).workflow.working.products[0].name,'First writer');
  });
  await check(scope+' unused product deletion succeeds; category cannot cascade-delete its members',async()=>{
   const before=(await get(scope)).workflow.working,product=before.products[1],path=['products',{id:product.id}];
   assert.equal((await request(scope,null,'frank','&references='+product.code)).body.total,0);
   ok(await command(scope,'apply',{patches:[{op:'remove',path}],guards:[{path,value:product}]}));
   const group=before.categoryGroups[0],groupPath=['categoryGroups',{id:group.id}];
   const rejected=await command(scope,'apply',{patches:[{op:'remove',path:groupPath}],guards:[{path:groupPath,value:group}]});assert.equal(rejected.status,409);assert.equal(rejected.body.error,'CATALOG_IN_USE');
  });
 }
 await check('new reference after preflight blocks product deletion and preserves historical payload',async()=>{
  const scope='AB',before=(await get(scope)).workflow.working,product=before.products[2],path=['products',{id:product.id}];
  assert.equal((await request(scope,null,'frank','&references='+product.code)).body.total,0);
  const row=await fixture.db.prepare('SELECT revision,"values" FROM shared_state WHERE id=1').first();
  const bucket=await fixture.mf.getR2Bucket('STATE_ARCHIVE'),records=fixture.load('lib/state-records.ts'),state=await records.decodeRecordValues(bucket,JSON.parse(row.values));
  state.values.approvalVersions=JSON.stringify([{id:'retained-history',status:'superseded',category:'GROUP-1',line:'A',stages:{'A-D':[{id:'protected-node',productCodes:[product.code],bomSelections:{},mediaItems:[{src:'synthetic.png'}],x:10,y:20,nextIds:[]}]}}]);
  await fixture.db.prepare('UPDATE shared_state SET revision=?,"values"=? WHERE id=1').bind(row.revision+1,await records.encodeRecordValues(bucket,state.values)).run();
  const result=await command(scope,'apply',{patches:[{op:'remove',path}],guards:[{path,value:product}]});assert.equal(result.status,409);assert.equal(result.body.error,'CATALOG_IN_USE');assert(result.body.details.total>0);assert((await get(scope)).workflow.working.products.some(p=>p.code===product.code));
 });
 console.log(JSON.stringify({status:'PASS_AB_C_NATIVE_WORKFLOW',checks,cases:checks.length,programCommit:process.env.PROCESS_PROGRAM_COMMIT,buildEntrySha256:fixture.buildEntrySha256,realData:false}));
}finally{await fixture.close();}
