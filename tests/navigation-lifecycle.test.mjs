import test from 'node:test';import assert from 'node:assert/strict';
import {createNavigationCoordinator,navigationKey} from '../public/process/navigation-lifecycle.mjs';
const turn=()=>new Promise(r=>setImmediate(r));
void test('a blocked later intent cancels an uncommitted older navigation even after edits become clean',async()=>{
 const f=fixture(),old=f.coordinator.navigate({view:'editor'});
 f.allow(false);
 assert.equal((await f.coordinator.navigate({view:'player'})).status,'blocked');
 assert.equal(f.reads[0].c.signal.aborted,true);
 assert.equal(f.coordinator.pending(),false);
 f.allow(true);f.reads[0].resolve({});
 assert.equal((await old).status,'superseded');
 assert.equal(f.coordinator.current().view,'dashboard');
 assert.equal(f.events.some(e=>e[0]==='commit'),false);
});
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
void test('blocked duplicate intent does not reuse an older pending destination',async()=>{
 const f=fixture(),target={view:'editor'},old=f.coordinator.navigate(target);
 f.allow(false);assert.equal((await f.coordinator.navigate(target)).status,'blocked');
 f.allow(true);f.reads[0].resolve({});assert.equal((await old).status,'superseded');
 assert.equal(f.reads.length,1);assert.equal(f.coordinator.current().view,'dashboard');
});
void test('blocked departure preserves readiness of an already committed page',async()=>{
 const f=fixture(),ready=deferred();f.ready(()=>ready.promise);
 const old=f.coordinator.navigate({view:'editor'});f.reads[0].resolve({});await turn();
 f.allow(false);assert.equal((await f.coordinator.navigate({view:'player'})).status,'blocked');
 assert.equal(f.reads[0].c.signal.aborted,false);
 ready.resolve();assert.equal((await old).status,'ready');assert.equal(f.coordinator.current().view,'editor');
});
function fixture(){const reads=[],events=[];let allowed=true,owner={id:'actor',epoch:1},ready=async()=>{};const initial={view:'dashboard',system:'process'};
 const coordinator=createNavigationCoordinator({initial,canLeave:()=>allowed,owner:()=>owner,pending:t=>events.push(['pending',t?.view||null]),prepare:(target,c)=>{const q=deferred();reads.push({...q,target,c});return q.promise;},validate:p=>{if(p.invalid)throw Error('INVALID_PROJECTION');},commit:(p,t,c,o)=>{events.push(['commit',t.view,o.history]);return t;},ready:(t,c)=>ready(t,c),complete:t=>events.push(['ready',t.view]),failure:(e,s)=>events.push(['error',e.message,s.committed])});return{coordinator,reads,events,allow:v=>allowed=v,owner:v=>owner=v,ready:v=>ready=v};}
void test('keeps current source until preparation, then commit precedes true readiness',async()=>{const f=fixture(),q=deferred();f.ready(()=>q.promise);const done=f.coordinator.navigate({view:'editor'},{history:'push'});assert.equal(f.coordinator.current().view,'dashboard');assert(!f.events.some(e=>e[0]==='commit'));f.reads[0].resolve({});await turn();assert.equal(f.coordinator.current().view,'editor');assert(!f.events.some(e=>e[0]==='ready'));q.resolve();assert.equal((await done).status,'ready');});
void test('dirty before request blocks without fetching or discarding source',async()=>{const f=fixture();f.allow(false);assert.equal((await f.coordinator.navigate({view:'editor'})).status,'blocked');assert.equal(f.reads.length,0);assert.equal(f.coordinator.current().view,'dashboard');});
void test('edits begun during preparation block commit and retain source',async()=>{const f=fixture(),p=f.coordinator.navigate({view:'editor'});f.allow(false);f.reads[0].resolve({});assert.equal((await p).status,'blocked');assert(!f.events.some(e=>e[0]==='commit'));});
void test('A→B→A supersession aborts old read and cannot commit late data/history',async()=>{const f=fixture(),a=f.coordinator.navigate({view:'editor'}),b=f.coordinator.navigate({view:'player'});assert(f.reads[0].c.signal.aborted);f.reads[1].resolve({});await b;f.reads[0].resolve({});assert.equal((await a).status,'superseded');assert.deepEqual(f.events.filter(e=>e[0]==='commit').map(e=>e[1]),['player']);});
for(const change of [{id:'other',epoch:1},{id:'actor',epoch:2},null])void test('account or same-id generation change refuses pending projection '+JSON.stringify(change),async()=>{const f=fixture(),p=f.coordinator.navigate({view:'editor'});f.owner(change);f.reads[0].resolve({});assert.equal((await p).status,'superseded');assert(!f.events.some(e=>e[0]==='commit'));});
void test('preparation or validation failure keeps source and does not fabricate ready',async()=>{for(const invalid of [true,false]){const f=fixture(),p=f.coordinator.navigate({view:'editor'});if(invalid)f.reads[0].resolve({invalid:true});else f.reads[0].reject(Error('NETWORK'));assert.equal((await p).status,'error');assert.equal(f.coordinator.current().view,'dashboard');assert(!f.events.some(e=>e[0]==='ready'||e[0]==='commit'));}});
void test('post-commit target failure stays explicit, never restores stale source projection',async()=>{const f=fixture();f.ready(async()=>{throw Error('TARGET_READ_FAILED');});const p=f.coordinator.navigate({view:'editor'});f.reads[0].resolve({});assert.equal((await p).status,'error');assert.equal(f.coordinator.current().view,'editor');assert.deepEqual(f.events.at(-2),['error','TARGET_READ_FAILED',true]);});
void test('superseded target readiness cannot mark later destination ready',async()=>{const f=fixture(),q=deferred();f.ready(t=>t.view==='editor'?q.promise:Promise.resolve());const a=f.coordinator.navigate({view:'editor'});f.reads[0].resolve({});await turn();const b=f.coordinator.navigate({view:'player'});f.reads[1].resolve({});await b;q.resolve();assert.equal((await a).status,'superseded');assert.deepEqual(f.events.filter(e=>e[0]==='ready').map(e=>e[1]),['player']);});
void test('all approval panels and system context are distinct without changing public URLs',()=>{assert.equal(new Set(['master','process','quality','routine'].map(approvalTab=>navigationKey({view:'approval',approvalTab,system:'process'}))).size,4);assert.notEqual(navigationKey({view:'approval',system:'process'}),navigationKey({view:'approval',system:'quality'}));});

void test('owner object mutation cannot rewrite the captured identity epoch',async()=>{const owner={id:'actor',epoch:1},f=fixture();f.owner(owner);const p=f.coordinator.navigate({view:'editor'});owner.epoch++;f.reads[0].resolve({});assert.equal((await p).status,'superseded');assert(!f.events.some(e=>e[0]==='commit'));});
for(const step of ['dispose','install','history'])void test('throw during '+step+' is past point-of-no-return, never stale source rollback',async()=>{let failure;const c=createNavigationCoordinator({initial:{view:'dashboard'},owner:()=>({id:'a',epoch:1}),canLeave:()=>true,prepare:async()=>({}),commit(){throw Error(step);},ready:async()=>{},failure:(_e,state)=>{failure=state;}});const r=await c.navigate({view:'player'});assert.equal(r.committed,true);assert.equal(failure.committed,true);assert.equal(failure.current.view,'player');assert.equal(c.current().view,'player');});

void test('identical pending route intents reuse one read and one commit',async()=>{const f=fixture(),a=f.coordinator.navigate({view:'player'},{history:'push'}),b=f.coordinator.navigate({view:'player'},{history:'push'});assert.equal(a,b);assert.equal(f.reads.length,1);f.reads[0].resolve({});await Promise.all([a,b]);assert.equal(f.events.filter(e=>e[0]==='commit').length,1);});
void test('duplicate route pop entries have distinct transaction ownership, not click dedupe',async()=>{const f=fixture(),a=f.coordinator.navigate({view:'player'},{history:'pop',index:2,url:'https://fixture.invalid/?view=player'}),b=f.coordinator.navigate({view:'player'},{history:'pop',index:0,url:'https://fixture.invalid/?view=player'});assert.notEqual(a,b);assert.equal(f.reads.length,2);assert(f.reads[0].c.signal.aborted);f.reads[1].resolve({});await b;f.reads[0].resolve({});assert.equal((await a).status,'superseded');});
