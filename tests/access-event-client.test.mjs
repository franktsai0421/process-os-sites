import test from 'node:test';import assert from 'node:assert/strict';
import {minimalAccessObservation,accessEventModule} from '../public/process/access-event-protocol.mjs';
import {createAccessEventReporter} from '../public/process/access-event-client.mjs';
const event=(id='operation-000001')=>({module:'bom',action:'save',operationId:id,occurredAt:123,phase:'unknown'});
void test('source allowlist excludes dynamic legacy scopes, URLs, duplicate query keys and arbitrary payloads',()=>{
 assert.equal(accessEventModule('/api/fqc/workflow?caseMetadata=1'),'fqc');assert.equal(accessEventModule('/api/master/workflow?scope=AB&caseMetadata=1'),'ab');assert.equal(accessEventModule('/api/ipqc-ab/workflow?module=1'),'ipqc-ab');
 for(const endpoint of ['https://evil.invalid/api/fqc/workflow','/api/ipqc-ab/workflow?scope=A:private','/api/fqc/workflow?token=private','/api/fqc/workflow?caseMetadata=1&caseMetadata=1','/api/master/workflow?scope=AB&other=private'])assert.equal(accessEventModule(endpoint),null);
 for(const extra of [{input:'private'},{receipt:{}},{actorId:'peer'},{photos:[]}])assert.throws(()=>minimalAccessObservation({...event(),...extra}));
});
void test('feature gate prevents persistence and transport; a fresh reporter requires a new observation after re-enabling',async()=>{
 let policy=false,saved;const posts=[],storage=async(mode,value)=>mode==='read'?saved:(saved=structuredClone(value)),request=async(action,body)=>action==='capabilities'?{enabled:policy,reason:'NOT_ENABLED',modules:['bom']}:(posts.push(body),{received:true,verified:false});
 const reporter=createAccessEventReporter({current:()=>true,storage,request});await reporter.observe(event());assert.equal(saved,undefined);assert.equal(posts.length,0);
 policy=true;await reporter.flush();assert.equal(posts.length,0);await reporter.observe(event('still-revoked'));assert.deepEqual(saved,[]);
 const fresh=createAccessEventReporter({current:()=>true,storage,request});await fresh.observe(event('fresh-after-enable'));assert.equal(posts.length,1);assert.equal(posts[0].operationId,'fresh-after-enable');assert.equal(saved[0].acked,true);
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
void test('metadata queue capacity retains old entries and reports the new collection gap',async()=>{
 let saved;const statuses=[];const reporter=createAccessEventReporter({current:()=>true,onStatus:value=>statuses.push(value),storage:async(mode,value)=>mode==='read'?saved:(saved=structuredClone(value)),request:async action=>action==='capabilities'?{enabled:true,modules:['bom']}:{received:true,verified:false}});
 for(let n=0;n<101;n++)await reporter.observe(event('operation-'+String(n).padStart(8,'0')));
 assert.equal(saved.length,100);assert.equal(saved[0].event.operationId,'operation-00000000');assert.equal(saved.at(-1).event.operationId,'operation-00000099');assert.equal(statuses.at(-1),'capacity');
});
void test('first capability failure retains only volatile metadata; reload cannot invent a durable report',async()=>{
 let saved,online=false,owner=true;const statuses=[],posts=[];const port=async(mode,value)=>mode==='read'?saved:(saved=structuredClone(value)),request=async(action,body)=>{if(action==='capabilities'){if(!online)throw Error('offline');return{enabled:true,modules:['bom']};}posts.push(body);return{received:true,verified:false};};
 const first=createAccessEventReporter({current:()=>owner,request,storage:port,onStatus:value=>statuses.push(value)});await first.observe(event('cold-first-operation'));assert.equal(saved,undefined);assert.equal(posts.length,0);assert.equal(statuses.at(-1),'volatile-pending');owner=false;online=true;
 const reloaded=createAccessEventReporter({current:()=>true,request,storage:port});await reloaded.flush();assert.equal(posts.length,0);assert.deepEqual(saved,[]);await assert.rejects(first.flush(),/OWNER_CHANGED/);
});
void test('same-runtime reconnect may send a volatile event only after the capability is verified',async()=>{
 let saved,online=false,posts=0;const reporter=createAccessEventReporter({current:()=>true,storage:async(mode,value)=>mode==='read'?saved:(saved=structuredClone(value)),request:async action=>{if(action==='capabilities'){if(!online)throw Error('offline');return{enabled:true,modules:['bom']};}posts++;return{received:true,verified:false};}});await reporter.observe(event('same-runtime-operation'));assert.equal(saved,undefined);online=true;await reporter.flush();assert.equal(posts,1);assert.equal(saved[0].acked,true);
});
void test('explicit capability denial does not persist new metadata even after an earlier admission',async()=>{
 let saved,denied=false;const statuses=[];const reporter=createAccessEventReporter({current:()=>true,onStatus:value=>statuses.push(value),storage:async(mode,value)=>mode==='read'?saved:(saved=structuredClone(value)),request:async action=>{if(action==='capabilities'){if(denied)throw Error('LOGIN_REQUIRED');return{enabled:true,modules:['bom']};}return{received:true,verified:false};}});await reporter.observe(event('previously-admitted'));const durable=structuredClone(saved);denied=true;await reporter.observe(event('after-login-denial'));assert.deepEqual(saved,durable);assert.equal(statuses.at(-1),'permission-denied');
});
void test('verified bootstrap admission persists a first offline observation without treating it as business success',async()=>{
 let saved,online=false;const posts=[],statuses=[];
 const request=async(action,body)=>{if(action==='capabilities'){if(!online)throw Error('offline');return{enabled:true,modules:['bom']};}posts.push(body);return{received:true,verified:false};};
 const storage=async(mode,value)=>mode==='read'?saved:(saved=structuredClone(value));
 const first=createAccessEventReporter({current:()=>true,bootstrapAdmitted:true,request,storage,onStatus:value=>statuses.push(value)});
 await first.observe(event('first-offline-operation'));assert.equal(saved.length,1);assert.equal(saved[0].acked,false);assert.equal(posts.length,0);assert.equal(statuses.at(-1),'offline');
 online=true;const next=createAccessEventReporter({current:()=>true,bootstrapAdmitted:true,request,storage});await next.flush();assert.equal(posts.length,1);assert.equal(posts[0].operationId,'first-offline-operation');assert.equal(saved[0].acked,true);
 await next.flush();assert.equal(posts.length,1);
});
for(const denial of ['LOGIN_REQUIRED','FORBIDDEN','NOT_ENABLED'])void test('bootstrap admission is revoked after explicit '+denial+'; later observations do not persist',async()=>{
 let saved,mode='enabled',posts=0;const statuses=[],revocations=[];
 const reporter=createAccessEventReporter({current:()=>true,bootstrapAdmitted:true,onStatus:value=>statuses.push(value),onAdmissionRevoked:value=>revocations.push(value),storage:async(kind,value)=>kind==='read'?saved:(saved=structuredClone(value)),request:async action=>{if(action==='capabilities'){if(mode==='enabled')return{enabled:true,modules:['bom']};if(mode==='NOT_ENABLED')return{enabled:false,reason:'NOT_ENABLED',modules:[]};throw Error(mode);}posts++;return{received:true,verified:false};}});
 await reporter.observe(event('before-revocation'));const prior=structuredClone(saved);assert.equal(posts,1);
 mode=denial;await reporter.flush();assert.equal(revocations.length,1);
 await reporter.observe(event('after-revocation'));assert.deepEqual(saved,prior);assert.equal(posts,1);
 assert.equal(statuses.at(-1),denial==='NOT_ENABLED'?'not-enabled':'permission-denied');
 mode='enabled';await reporter.flush();await reporter.observe(event('still-revoked'));assert.deepEqual(saved,prior);assert.equal(posts,1);
});
void test('two cold reporters with disjoint atomic records retain both events after interleaved empty reads',async()=>{
 const rows=new Map(),posts=[];let online=false;
 const storage=async(mode,value)=>{if(mode==='read')return[...rows.values()].map(row=>structuredClone(row));if(mode==='upsert'){const id=value.event.module+':'+value.event.operationId,prior=rows.get(id);rows.set(id,prior||structuredClone(value));return{record:rows.get(id)};}if(mode==='ack'){const id=value.event.module+':'+value.event.operationId;if(value.verified)rows.delete(id);else rows.get(id).acked=true;return{};}throw Error('BAD_STORAGE_MODE');};
 const request=async(action,body)=>{if(action==='capabilities'){if(!online)throw Error('offline');return{enabled:true,modules:['bom']};}posts.push(body);return{received:true,verified:false};};
 const a=createAccessEventReporter({current:()=>true,storage,atomicStorage:true,bootstrapAdmitted:true,request}),b=createAccessEventReporter({current:()=>true,storage,atomicStorage:true,bootstrapAdmitted:true,request});
 await Promise.all([a.observe(event('operation-tab-a')),b.observe(event('operation-tab-b'))]);assert.equal(rows.size,2);assert.equal(posts.length,0);
 online=true;await Promise.all([a.flush(),b.flush()]);assert.deepEqual(posts.map(row=>row.operationId).sort((a,b)=>a.localeCompare(b)),['operation-tab-a','operation-tab-b']);assert([...rows.values()].every(row=>row.acked));
});
