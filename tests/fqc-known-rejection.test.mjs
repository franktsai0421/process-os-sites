import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const fixture=createRequire(import.meta.url)('../scripts/fqc-apply-fixture.cjs');
const field=(collection,id,key,value,before)=>({patches:[{op:'set',path:[collection,{id},key],value}],guards:[{path:[collection,{id},key],value:before}]});
const row=f=>f.db.prepare('SELECT * FROM shared_state').get();
async function removed(f,g,collection){
 const peer=f.realm('other'),current=(await peer.client.read()).control.workflow.working;
 const paths=[['items',{id:'item'},'isDeleted'],...(collection==='errors'?[['errors',{id:'error'},'isDeleted']]:[])];
 await peer.client.command(g,'apply',{patches:paths.map(path=>({op:'set',path,value:true})),guards:paths.map(path=>({path,value:current[path[0]].find(row=>row.id===path[1].id)[path[2]]}))});
}
for(const kind of ['deleted-error','deleted-item','deleted-parent-insert','missing-parent-edit'])void test(`actual pre-CAS FQC ${kind} rejection clears only the matching unknown marker`,async()=>{
 const f=await fixture(),a=f.realm();try{
  const begun=await a.client.begin(),g=begun.control.workflow.generation;
  if(kind!=='missing-parent-edit')await removed(f,g,kind==='deleted-item'?'items':'errors');
  const detail=kind==='deleted-parent-insert'?{patches:[{op:'insert',path:['items'],value:{...f.snapshot().items[0],id:'new-item'}}]}:
   kind==='missing-parent-edit'?field('items','item','errorId','missing-parent','error'):
   kind==='deleted-error'?field('errors','error','name','Rejected edit','Synthetic error'):field('items','item','name','Rejected edit','Synthetic item');
  const command=a.client.prepare(g,'apply',detail),before=row(f),requests=f.requests.length;
  const error=await a.client.sendPrepared(command).then(()=>assert.fail('must reject'),error=>error);
  assert.equal(error.message,kind.includes('parent')?'ERROR_PARENT_INVALID':'ENTITY_REMOVED_OR_AMBIGUOUS');
  assert.equal(error.status,kind.includes('parent')?422:409);assert.match(error.requestId,/^[0-9a-f-]{36}$/i);
  assert.deepEqual(row(f),before,'rejected operation must not reach shared-state CAS');
  assert.equal(a.client.hasUnknown(),false);assert(a.client.isConfirmedRejection(error,command));assert.equal(a.session.size,0);
  const calls=f.requests.slice(requests);assert.equal(calls.filter(r=>r.method==='POST').length,1);assert.equal(calls.filter(r=>r.url.includes('operationId=')).length,0,'known refusal must not enter nonexistent-receipt recovery');
  const receipt=await f.call('/api/fqc/workflow?operationId='+command.operationId);assert.equal(receipt.status,404);assert.equal((await receipt.json()).error,'OPERATION_NOT_FOUND');
 }finally{f.close();}
});
for(const [code,status]of [['ENTITY_REMOVED_OR_AMBIGUOUS',409],['ERROR_PARENT_INVALID',422]])void test(`unproven original ${code} response remains unknown`,async()=>{
 const f=await fixture(),a=f.realm();try{
  const begun=await a.client.begin();let posts=0;
  a.intercept((url,options,send)=>{if(options.method==='POST'){posts++;return Response.json({error:code},{status});}return send();});
  await assert.rejects(a.client.command(begun.control.workflow.generation,'apply',field('errors','error','name','Unconfirmed','Synthetic error')),error=>error.message===code);
  const bytes=[...a.session];assert(a.client.hasUnknown());await assert.rejects(a.client.resolveUnknown(),/OPERATION_NOT_FOUND/);assert.deepEqual([...a.session],bytes);assert.equal(posts,1);assert.equal((await f.state()).workflow.working.errors[0].name,'Synthetic error');
 }finally{f.close();}
});
for(const [code,status]of [['ENTITY_REMOVED_OR_AMBIGUOUS',409],['ERROR_PARENT_INVALID',422]])void test(`receipt GET ${code} cannot reclassify a committed lost response as failure`,async()=>{
 const f=await fixture(),a=f.realm();try{
  const begun=await a.client.begin();let posts=0;
  a.intercept(async(url,options,send)=>{if(options.method==='POST'){posts++;await send();throw Error('SYNTHETIC_ACK_LOST');}if(url.includes('operationId='))return Response.json({error:code,requestId:'12345678-1234-4234-8234-123456789abc'},{status});return send();});
  await assert.rejects(a.client.command(begun.control.workflow.generation,'apply',field('errors','error','name','Committed','Synthetic error')),/RESULT_UNKNOWN/);
  const bytes=[...a.session];assert(a.client.hasUnknown());await assert.rejects(a.client.resolveUnknown(),error=>error.message===code);assert.deepEqual([...a.session],bytes);assert.equal(posts,1);assert.equal((await f.state()).workflow.working.errors[0].name,'Committed');
 }finally{f.close();}
});
