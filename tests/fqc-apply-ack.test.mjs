import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const fixture=createRequire(import.meta.url)('../scripts/fqc-apply-fixture.cjs');
const route='/api/fqc/workflow?caseMetadata=1&compact=1';
const ack=route+'&projection=fqc-apply-ack-v1';
const edit=(value='Changed',before='Synthetic error')=>({patches:[{op:'set',path:['errors',{id:'error'},'name'],value}],guards:[{path:['errors',{id:'error'},'name'],value:before}]});
const counts=f=>({sql:f.events.filter(e=>e.kind==='read'||e.kind==='sql').map(e=>e.sql),get:f.events.filter(e=>e.kind==='get').length,put:f.events.filter(e=>e.kind==='put').length});
async function setup(options){const f=await fixture(options),a=f.realm(),begun=await a.client.begin();return{f,a,generation:begun.control.workflow.generation};}
void test('FQC Apply wire is only an ACK; complete fresh terminal GET still owns settlement',async()=>{
 const{f,a,generation}=await setup();try{f.requests.length=0;const result=await a.client.command(generation,'apply',edit());
 assert.equal(f.requests.length,2);const[post,get]=f.requests;
 assert.equal(post.method,'POST');assert.equal(post.url,ack);assert.equal(post.result.projection,'fqc-apply-ack-v1');assert(Number.isSafeInteger(post.result.revision));assert.deepEqual(Object.keys(post.result.receipt).sort((a,b)=>a.localeCompare(b)),['caseId','generation','operationId','revision','savedId','unchanged']);assert.equal(post.result.receipt.savedId,null);assert.equal(result.control.workflow.saved,null);assert.equal(a.c.SharedDraftDeparture.owns(result.control.workflow),true);assert(!('control'in post.result));assert(!('permissions'in post.result));assert(!('wireVersion'in post.result));
 assert.equal(get.method,'GET');assert.equal(get.url,route);assert.equal(get.result.wireVersion,1);assert.equal(result.control.workflow.working.errors[0].name,'Changed');assert.equal(result.permissions.view,true);assert(a.client.verifiedReadback(result,result.receipt.operationId));assert.equal(a.client.verifiedApplyAuthority(result,result.receipt.operationId),null);assert.equal(a.client.hasUnknown(),false);
 }finally{f.close();}
});
void test('new FQC transport remains compatible with the exact old full-response server',async()=>{
 const{f,a,generation}=await setup({baseline:true});try{f.requests.length=0;const result=await a.client.command(generation,'apply',edit());assert.equal(f.requests.length,2);assert.equal(f.requests[0].result.wireVersion,1);assert(f.requests[0].result.control);assert.equal(result.control.workflow.working.errors[0].name,'Changed');assert.equal(a.client.hasUnknown(),false);}finally{f.close();}
});
for(const selected of [route,route+'&projection=other',route+'&projection=fqc-apply-ack-v1&projection=fqc-apply-ack-v1','/api/fqc/workflow?caseMetadata=1&projection=fqc-apply-ack-v1',ack+'&compact=1',ack+'&caseMetadata=1',ack+'&scope=fqc'])void test('nonexact or old projection keeps full response: '+selected,async()=>{
 const{f,a,generation}=await setup();try{const command=a.client.prepare(generation,'apply',edit());const response=await f.call(selected,{method:'POST',body:JSON.stringify({command})});assert.equal(response.status,200);const body=await response.json();assert(body.control);assert(!('projection'in body));assert(body.receipt);assert.equal((await f.state()).workflow.working.errors[0].name,'Changed');}finally{f.close();}
});
void test('Begin, Save, receipt GET and terminal GET are not Apply ACK projections',async()=>{
 const{f,a,generation}=await setup();try{const begin=await f.call(ack,{method:'POST',body:JSON.stringify({action:'begin'})});assert((await begin.json()).control);await a.client.command(generation,'apply',edit());const command=a.client.prepare(generation,'save'),save=await f.call(ack,{method:'POST',body:JSON.stringify({command})});const body=await save.json();assert(body.control);assert(!('projection'in body));const read=await f.call(ack),readBody=await read.json();assert(readBody.control);assert(!('projection'in readBody));const receipt=await f.call(ack+'&operationId='+command.operationId);assert.deepEqual(Object.keys(await receipt.json()),['receipt']);}finally{f.close();}
});
void test('projected Apply replay preserves receipt and fresh replay authorization without another CAS',async()=>{
 const{f,a,generation}=await setup();try{const command=a.client.prepare(generation,'apply',edit()),result=await a.client.sendPrepared(command),before=f.db.prepare('SELECT * FROM shared_state').get();f.events.length=0;const replay=await f.call(ack,{method:'POST',body:JSON.stringify({command})});const body=await replay.json();assert.equal(replay.status,200);assert.equal(body.projection,'fqc-apply-ack-v1');assert.equal(body.unchanged,true);assert.deepEqual(body.receipt,result.receipt);assert(!('control'in body));assert.deepEqual(f.db.prepare('SELECT * FROM shared_state').get(),before);assert(!f.events.some(e=>e.kind==='sql'&&e.sql.startsWith('UPDATE shared_state')));f.revoke();const denied=await f.call(ack,{method:'POST',body:JSON.stringify({command})});assert.equal(denied.status,401);assert.equal((await denied.json()).error,'LOGIN_REQUIRED');}finally{f.close();}
});
for(const fault of ['body','structure','encode','late-revocation'])void test('ACK projection preserves full-route fault effects: '+fault,async()=>{
 const outputs=[];for(const selected of [route,ack]){const{f,a,generation}=await setup();try{const command=a.client.prepare(generation,'apply',edit()),before=f.db.prepare('SELECT * FROM shared_state').get();if(fault==='body')f.hooks.get=()=>{throw Error('SYNTHETIC_BODY_UNAVAILABLE');};if(fault==='structure')command.patches[0].value=42;if(fault==='encode')f.hooks.put=()=>{throw Error('SYNTHETIC_ENCODE_UNAVAILABLE');};if(fault==='late-revocation'){let revoked=false;f.hooks.put=()=>{if(!revoked){revoked=true;f.revoke();}};}
 f.events.length=0;const response=await f.call(selected,{method:'POST',body:JSON.stringify({command})}),body=await response.json();assert(response.status>=400);if(body.requestId!==undefined)assert.match(body.requestId,/^[0-9a-f-]{36}$/i);assert(!('projection'in body));assert.deepEqual(f.db.prepare('SELECT * FROM shared_state').get(),before);outputs.push({status:response.status,error:body.error,details:body.details,hasRequestId:Object.hasOwn(body,'requestId'),counts:counts(f)});
 }finally{f.close();}}assert.deepEqual(outputs[1],outputs[0]);
});
for(const mode of ['permission','missing','lower-revision'])void test('valid ACK cannot settle without current full terminal proof: '+mode,async()=>{
 const{f,a,generation}=await setup();try{let posts=0;a.intercept(async(url,options,send)=>{if(options.method==='POST'){posts++;return send();}if(url.includes('operationId='))return Response.json({error:'OPERATION_NOT_FOUND'},{status:404});if(mode==='permission')return Response.json({error:'FORBIDDEN'},{status:403});const response=await send(),body=await response.json();if(mode==='missing')delete body.control;else body.control.workflow.revision=0;return Response.json(body);});
 await assert.rejects(a.client.command(generation,'apply',edit()));assert.equal(posts,1);assert.equal(a.client.hasUnknown(),true);assert.equal((await f.state()).workflow.working.errors[0].name,'Changed');await assert.rejects(a.client.command(generation,'save'));assert.equal(posts,1);
 }finally{f.close();}
});

for(const mode of ['wrong-operation','wrong-generation','missing-receipt','owner-change'])void test('untrusted or stale Apply ACK cannot erase its marker: '+mode,async()=>{
 const{f,a,generation}=await setup();try{let posts=0;a.intercept(async(url,options,send)=>{if(options.method!=='POST')return Response.json({error:'OPERATION_NOT_FOUND'},{status:404});posts++;const response=await send(),body=await response.json();if(mode==='wrong-operation')body.receipt.operationId='unrelated-operation';if(mode==='wrong-generation')body.receipt.generation='unrelated-generation';if(mode==='missing-receipt')delete body.receipt;if(mode==='owner-change')a.rotate();return Response.json(body);});
 await assert.rejects(a.client.command(generation,'apply',edit()));assert.equal(posts,1);assert.equal(a.client.hasUnknown(),true);assert.equal(a.session.size,1);assert.equal((await f.state()).workflow.working.errors[0].name,'Changed');await assert.rejects(async()=>a.client.command(generation,'apply',edit('Second','Changed')));assert.equal(posts,1);assert.equal(a.session.size,1);
 }finally{f.close();}
});
