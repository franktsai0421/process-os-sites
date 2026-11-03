import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
const transport=fs.readFileSync('public/process/shared-draft-client.js','utf8');
const ui=fs.readFileSync('public/process/version-draft-ui.js','utf8');
const helper=ui.slice(ui.indexOf('  function createDeparture(config){'),ui.indexOf('  host.VersionDraftUI='));
function fixture(memory=new Map(),guardAccessResults=false){
 const calls=[],events={},state={local:true,epoch:1,ready:true,peerChange:false,phase:'missing',access:true};
 const document={documentElement:{lang:'zh-TW'}},root={inert:false};
 const window={ProcessSync:{identity:{id:'A'},identityGeneration:()=>state.epoch,requiresReload:false},addEventListener:(name,fn)=>events[name]=fn};
 const context=vm.createContext({window,host:window,document,crypto:webcrypto,AbortController,setTimeout,clearTimeout,sessionStorage:{getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)},fetch:async(url,options)=>{
  calls.push({url,options});if(options.body)throw Error('lost response');
  if(url.includes('operationId=')){if(state.phase==='missing')return Response.json({error:'OPERATION_NOT_FOUND'},{status:404});const command=JSON.parse(calls.find(c=>c.options.body).options.body).command;return Response.json({receipt:{operationId:command.operationId,generation:command.generation,revision:7,savedId:null,caseId:null,unchanged:false}});}
  return Response.json({permissions:{view:state.access,edit:state.access,save:state.access}});
 }});
 vm.runInContext(transport,context);const create=endpoint=>window.createSharedDraftClient({endpoint,actorId:'A',headers:()=>({}),guardAccessResults});
 const clients=[create('/api/master-data/workflow?scope=AB'),create('/api/ipqc-ab/workflow')];
 const config={root:()=>root,context:()=>['AB'],local:()=>state.local,unknown:()=>clients.some(c=>c.hasUnknown()),unknownTransports:()=>state.peerChange?[clients[0]]:clients,unknownReady:()=>state.ready,discardUnknown(){state.local=false;},closeClean(){},current:()=>true};
 const adapter=vm.runInContext(helper+'\ncreateDeparture;',context)(config);
 const start=async(i=0)=>{await clients[i].read();await assert.rejects(clients[i].command('g','apply',{patches:[{op:'set',path:['name'],value:'sent'}]}),/RESULT_UNKNOWN/);};
 return {window,state,clients,adapter,root,memory,calls,events,start,config};
}
void test('legacy unknown can abandon only local inputs, browse, then settle original late receipt without another POST',async()=>{
 const f=fixture();await f.start();const bytes=[...f.memory],posts=()=>f.calls.filter(c=>c.options.body).length;
 assert.equal(f.adapter.inspect().canAbandon,true);const lease=await f.adapter.abandon();
 assert.equal(f.state.local,false);assert.equal(f.adapter.inspect().state,'departing');assert.equal(f.root.inert,true);
 f.adapter.closeClean();lease.release();assert.equal(f.root.inert,false);assert.equal(f.adapter.covered(),true);assert.equal(f.window.sharedDraftDepartureBlocked(),false);
 assert.equal(f.clients[0].hasUnknown(),true);assert.deepEqual([...f.memory],bytes);assert.equal(posts(),1);
 await assert.rejects(f.clients[0].command('g','apply',{patches:[]}),/PREVIOUS_OPERATION_UNKNOWN/);
 await assert.rejects(f.clients[0].retryUnknown());assert.deepEqual([...f.memory],bytes);assert.equal(posts(),1);
 f.state.phase='committed';await f.clients[0].retryUnknown();assert.equal(f.clients[0].hasUnknown(),false);assert.equal(f.memory.size,0);assert.equal(posts(),1);
});
void test('two unknown transports are jointly covered, another unowned scope still blocks',async()=>{
 const f=fixture();await f.start(0);await f.start(1);assert.equal(f.adapter.otherDraftsPending(),false);
 const lease=await f.adapter.abandon();assert.equal(f.window.sharedDraftDepartureBlocked(),false);lease.release();assert.equal(f.window.sharedDraftDepartureBlocked(),true);
 f.state.peerChange=true;assert.equal(f.adapter.otherDraftsPending(),true);
});
for(const change of ['marker','identity','epoch','pagehide','reload','permissions'])void test(change+' invalidates navigation coverage without removing operation bytes',async()=>{
 const f=fixture();await f.start();const lease=await f.adapter.abandon();f.adapter.closeClean();lease.release();
 if(change==='marker')f.memory.set([...f.memory.keys()][0],'altered');
 if(change==='identity')f.window.ProcessSync.identity={id:'A'};
 if(change==='epoch')f.state.epoch++;
 if(change==='pagehide')f.events.pagehide();
 if(change==='reload')f.window.ProcessSync.requiresReload=true;
 if(change==='permissions'){f.state.access=false;await f.clients[0].permissions();}
 assert.equal(f.adapter.covered(),false);assert.equal(f.window.sharedDraftDepartureBlocked(),true);assert(f.memory.size>0);assert(f.clients[0].hasUnknown());
});
for(const change of ['local','ready','peers'])void test('late '+change+' before commit refuses departure and retains unknown',async()=>{
 const f=fixture();await f.start();const bytes=[...f.memory],lease=await f.adapter.abandon();
 if(change==='local')f.state.local=true;if(change==='ready')f.state.ready=false;if(change==='peers')f.state.peerChange=true;
 assert.notEqual(f.adapter.inspect().state,'departing');assert.throws(()=>f.adapter.closeClean());lease.release();assert.deepEqual([...f.memory],bytes);assert.equal(f.window.sharedDraftDepartureBlocked(),true);
});
void test('reload restores original unknown lock without restoring discarded local input or navigation exception',async()=>{
 const f=fixture();await f.start();const lease=await f.adapter.abandon();f.adapter.closeClean();lease.release();
 const next=fixture(f.memory);next.state.local=false;assert(next.clients[0].hasUnknown());assert.equal(next.window.sharedDraftDepartureBlocked(),true);assert.equal(next.adapter.covered(),false);
 await assert.rejects(next.clients[0].command('g','apply',{patches:[]}),/PREVIOUS_OPERATION_UNKNOWN/);assert.equal(next.calls.length,0);
});
void test('storage read failure and absent verified access refuse departure',async()=>{
 const f=fixture();await f.start();const raw=[...f.memory];f.memory.clear();assert.equal(f.adapter.inspect().canAbandon,false);for(const [k,v]of raw)f.memory.set(k,v);
 const next=fixture(f.memory);assert.equal(next.adapter.inspect().canAbandon,false);assert(next.clients[0].hasUnknown());
});
void test('projection cache reset preserves navigation-only coverage; a later view denial invalidates it',async()=>{
 const f=fixture();await f.start();const lease=await f.adapter.abandon();f.adapter.closeClean();lease.release();f.clients[0].invalidateReadState();
 assert.equal(f.adapter.covered(),true);assert(f.clients[0].hasUnknown());await assert.rejects(f.clients[0].command('g','apply',{patches:[]}));
 f.state.access=false;await f.clients[0].permissions();assert.equal(f.adapter.covered(),false);
});
for(const guarded of [false,true])void test(`observed view denial retires navigation across reset/grant (guarded=${guarded})`,async()=>{
 const f=fixture(new Map(),guarded);await f.start();const bytes=[...f.memory],lease=await f.adapter.abandon();f.adapter.closeClean();lease.release();
 f.state.access=false;await f.clients[0].permissions();assert.equal(f.adapter.covered(),false);
 f.clients[0].invalidateReadState();assert.equal(f.adapter.covered(),false);assert.equal(f.window.sharedDraftDepartureBlocked(),true);
 f.state.access=true;await f.clients[0].permissions();assert.equal(f.adapter.covered(),false);assert.equal(f.window.sharedDraftDepartureBlocked(),true);
 assert.deepEqual([...f.memory],bytes);assert(f.clients[0].hasUnknown());assert.equal(f.calls.filter(c=>c.options.body).length,1);
 const fresh=await f.adapter.abandon();f.adapter.closeClean();fresh.release();assert.equal(f.adapter.covered(),true);
});
