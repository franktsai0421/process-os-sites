import test from 'node:test';import assert from 'node:assert/strict';
import {minimalAccessObservation,accessEventModule} from '../public/process/access-event-protocol.mjs';
import {createAccessEventReporter} from '../public/process/access-event-client.mjs';
const event=(id='operation-000001')=>({module:'bom',action:'save',operationId:id,occurredAt:123,phase:'unknown'});
void test('source allowlist excludes dynamic legacy scopes, URLs, duplicate query keys and arbitrary payloads',()=>{
 assert.equal(accessEventModule('/api/fqc/workflow?caseMetadata=1'),'fqc');assert.equal(accessEventModule('/api/master/workflow?scope=AB&caseMetadata=1'),'ab');assert.equal(accessEventModule('/api/ipqc-ab/workflow?module=1'),'ipqc-ab');
 for(const endpoint of ['https://evil.invalid/api/fqc/workflow','/api/ipqc-ab/workflow?scope=A:private','/api/fqc/workflow?token=private','/api/fqc/workflow?caseMetadata=1&caseMetadata=1','/api/master/workflow?scope=AB&other=private'])assert.equal(accessEventModule(endpoint),null);
 for(const extra of [{input:'private'},{receipt:{}},{actorId:'peer'},{photos:[]}])assert.throws(()=>minimalAccessObservation({...event(),...extra}));
});
void test('retention gate prevents persistence and transport; enabling later sends only allowlisted metadata',async()=>{
 let policy=false,saved;const posts=[];const reporter=createAccessEventReporter({current:()=>true,storage:async(mode,value)=>mode==='read'?saved:(saved=structuredClone(value)),request:async(action,body)=>action==='capabilities'?{enabled:policy,reason:'RETENTION_POLICY_REQUIRED',modules:['bom']}:(posts.push(body),{received:true,verified:false})});
 await reporter.observe(event());assert.equal(saved,undefined);assert.equal(posts.length,0);policy=true;await reporter.flush();assert.equal(posts.length,1);assert.deepEqual(posts[0],event());assert.equal(saved[0].acked,true);
});
void test('offline queue is account owned, bounded and only metadata POSTs retry; receipt proof removes only reporting copy',async()=>{
 let saved,offline=false,posts=0;const statuses=[];const reporter=createAccessEventReporter({current:()=>true,onStatus:value=>statuses.push(value),storage:async(mode,value)=>mode==='read'?saved:(saved=structuredClone(value)),request:async(action,body)=>{if(action==='capabilities')return{enabled:true,modules:['bom']};posts++;if(offline)throw Error('offline');return{received:true,verified:body.phase==='receipt-observed'};}});
 await reporter.observe(event());offline=true;await reporter.observe(event('operation-000002'));assert.equal(saved.length,2);assert.equal(saved[1].acked,false);offline=false;await reporter.flush();assert.equal(saved[1].acked,true);await reporter.observe({...event(),phase:'receipt-observed'});assert.equal(saved.length,1);assert.equal(saved[0].event.operationId,'operation-000002');assert(statuses.includes('sync-failed'));assert.equal(posts,4);
});
void test('account change during a response cannot acknowledge or remove another owner queue',async()=>{
 let saved,current=true,release;const reporter=createAccessEventReporter({current:()=>current,storage:async(mode,value)=>mode==='read'?saved:(saved=structuredClone(value)),request:async action=>action==='capabilities'?{enabled:true,modules:['bom']}:new Promise(resolve=>{release=resolve;})});
 const task=reporter.observe(event());while(!release)await new Promise(resolve=>setImmediate(resolve));current=false;release({received:true,verified:true});await task;assert.equal(saved[0].acked,false);
});
void test('corrupt reporting storage is retained and never triggers transport or business cleanup',async()=>{
 let requests=0,writes=0;const reporter=createAccessEventReporter({current:()=>true,request:()=>{requests++;},storage:async mode=>mode==='read'?{corrupt:true}:writes++});await assert.rejects(reporter.flush(),/QUEUE_INVALID/);assert.equal(requests,0);assert.equal(writes,0);
});
void test('missing module permission cannot be advertised as successfully reported',async()=>{
 const statuses=[];let posts=0;const reporter=createAccessEventReporter({current:()=>true,onStatus:value=>statuses.push(value),storage:async()=>undefined,request:async action=>action==='capabilities'?{enabled:true,modules:[]}:(posts++,{received:true})});await reporter.observe(event());assert.equal(posts,0);assert.equal(statuses.at(-1),'permission-denied');
});
