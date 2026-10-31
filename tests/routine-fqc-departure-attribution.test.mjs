import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {randomUUID, webcrypto} from 'node:crypto';

// Execute production receipt kernel, transport, observation, and departure
// predicate. Only the in-memory HTTP/store boundary is synthetic.
const require=createRequire(import.meta.url),load=require('../scripts/ipqc-ab-import-harness.cjs')();
const {createSharedDraft}=load('lib/shared-draft.ts');
const {emptyRoutine,executeRoutine}=load('lib/routine-fqc.ts');
const shared=fs.readFileSync('public/process/shared-draft-client.js','utf8');
const routine=fs.readFileSync('public/process/routine-fqc.js','utf8');
const helper=fs.readFileSync('public/process/version-draft-ui.js','utf8');
const coordinator=helper.slice(helper.indexOf('  function createDeparture(config){'),helper.indexOf('  host.VersionDraftUI='));
const configStart=routine.indexOf('window.VersionDraftUI.createDeparture('),configEnd=routine.indexOf('});},',configStart);
assert(configStart>=0&&configEnd>configStart);
const departureConfig=routine.slice(configStart+'window.VersionDraftUI.createDeparture('.length,configEnd+1);
const part=(from,to)=>{
 const a=routine.indexOf(from),b=routine.indexOf(to,a);assert(a>=0&&b>a);return routine.slice(a,b);
};
const code=[part('  const routineReceiptPrefix=', '  let inFlightMutation='),part('  async function read(', '  const issueNames ='),
 part('  async function postOwned(command) {','  async function refresh('),
 part('  const departureSharedOwned=','  window.RoutineFQCUI ='),
 'this.departureSharedOwned=departureSharedOwned;this.departureDocuments=departureDocuments;'].join('\n');
const clone=value=>JSON.parse(JSON.stringify(value));
function fixture(){
 const records=new Map(),storage={get length(){return records.size;},key:i=>[...records.keys()][i]??null,getItem:k=>records.get(k)??null,setItem:(k,v)=>records.set(k,v),removeItem:k=>records.delete(k)};
 const control=emptyRoutine();control.revision=100;
 for(const id of ['a','b'])control.documents.push({id,kind:'plan',flow:createSharedDraft('routine-fqc:'+id,
  {title:'Initial '+id,date:'2026-10-30',notes:'',reason:'',disposition:'',evidence:[],lines:[]},null,'generation-'+id)});
 let server=control;
 const context={actor:{id:'owner',name:'Synthetic',admin:true},at:'2026-10-30T00:00:00Z',today:'2026-10-30',allowed:()=>true,settings:true,revoke:true,revise:true};
 function tab(){
  let epoch=1,delivery=1,sequence=0,mode='ok',afterPost=()=>{},afterReceipt=()=>{},alterResult=value=>value;
  const calls=[],confirmed=[],clientId=randomUUID(),s={buffers:new Map(),bases:new Map()};
  const sync={identity:{id:'owner'},identityGeneration:()=>epoch,captureDelivery:()=>delivery,isCurrentDelivery:value=>value===delivery};
  const box={window:{ProcessSync:sync,localStorage:storage,addEventListener(){}},document:{documentElement:{lang:'zh'}},crypto:webcrypto,AbortController,setTimeout,clearTimeout,
   endpoint:'/api/routine-fqc',s,data:{identity:{id:'owner'},permissions:{view:true,save:true,edit:true},revision:1000+server.revision,control:clone(server)},id:randomUUID,t:zh=>zh,
   clone,root:{isConnected:true,inert:false},inFlightMutation:0,status:d=>d.flow.pendingId?'pending':'draft',
   readPause:{capture:()=>1,denied(){},success(){}},
   docs:()=>box.data.control.documents,dirty:d=>s.buffers.has(d.id),
   async fetch(url,options={}){
    calls.push({url,method:options.method||'GET',body:options.body});
    if(options.method==='POST'){
     if(mode==='rejected')return Response.json({error:'PENDING_LOCKED',requestId:randomUUID()},{status:409});
     const body=JSON.parse(options.body),next=clone(server);
     let result;
     try{result=executeRoutine(next,body,[],context);}catch(error){return Response.json({error:error.code||error.message,requestId:randomUUID()},{status:error.status||500});}
     server=next;await Promise.resolve(afterPost(body,result));
     if(mode==='lost')throw Error('LOST_RESPONSE');
     return Response.json({result:alterResult(clone(result)),revision:server.revision,requestId:randomUUID()});
    }
    const operationId=new URL(url,'https://fixture.invalid').searchParams.get('operationId');
    if(operationId){
     if(mode==='lost')return Response.json({error:'OPERATION_NOT_FOUND'},{status:404});
     await Promise.resolve(afterReceipt());
     return Response.json({result:alterResult(clone(server.receipts[operationId]?.result)),revision:server.revision});
    }
    return Response.json({identity:{id:'owner'},permissions:{view:true,save:true,edit:true},revision:1000+server.revision,control:clone(server)});
   },
  };
  vm.createContext(box);vm.runInContext(shared,box);vm.runInContext(code,box);
  vm.runInContext(coordinator.replaceAll('host.','window.')+'\nthis.departure=createDeparture('+departureConfig+');',box);
  const hook=box.window.SharedDraftDeparture,confirm=hook.confirmed;
  hook.confirmed=(...args)=>{confirmed.push(args);return confirm(...args);};
  const doc=(id='a')=>box.data.control.documents.find(d=>d.id===id);
  const command=(action='apply',{documentId='a',...extra}={})=>{
   const operationId=randomUUID();return{action:'draft',documentId,operationId,command:{action,operationId,clientId,sequence:++sequence,generation:doc(documentId).flow.generation,...extra}};
  };
  const apply=async(title='Mine',documentId='a')=>{const result=await box.postOwned(command('apply',{documentId,
   patches:[{op:'set',path:['title'],value:title}],guards:[{path:['title'],value:doc(documentId).flow.working.title}]}));box.data=await box.read();return result;};
  return{box,s,sync,hook,calls,confirmed,doc,command,apply,
   poll:async()=>{box.data=await box.read();},post:body=>box.postOwned(body),owns:()=>box.departureSharedOwned(doc()),
   mode:value=>mode=value,afterPost:fn=>afterPost=fn,afterReceipt:fn=>afterReceipt=fn,alterResult:fn=>alterResult=fn,
   changeEpoch:()=>epoch++,changeDelivery:()=>delivery++};
 }
 return{tab,get server(){return server;}};
}

void test('same-account tabs: only actual non-no-op Apply receipt owns departure, not reads or polling',async()=>{
 const f=fixture(),writer=f.tab(),reader=f.tab();await writer.poll();await reader.poll();
 assert.equal(writer.owns(),false);assert.equal(reader.owns(),false);
 const receipt=await writer.apply();assert.equal(receipt.unchanged,false);assert.equal(writer.confirmed.length,1);
 assert.deepEqual(Object.keys(writer.confirmed[0][2]),['receipt'],'never pass aggregate control revision as document revision');
 assert.equal(writer.owns(),true,'stale local state cannot suppress the confirmed Apply');
 await writer.poll();await reader.poll();assert.equal(writer.owns(),true);assert.equal(reader.owns(),false);
 await reader.poll();assert.equal(reader.owns(),false);assert.equal(reader.confirmed.length,0);
 assert.equal(reader.calls.every(call=>call.method==='GET'),true);
});

void test('no-op Apply, Save, generate and disabled document restore never create tab writes',async()=>{
 const f=fixture(),writer=f.tab(),reader=f.tab();await writer.poll();await writer.apply();await reader.poll();
 const noop=await reader.apply('Mine');assert.equal(noop.unchanged,true);assert.equal(reader.owns(),false);
 await reader.post(reader.command('save',{expectedRevision:reader.doc().flow.revision}));await reader.poll();
 await reader.post({action:'generate'});await reader.poll();
 await assert.rejects(reader.post({action:'restore-document',documentId:'a',expectedRevision:reader.box.data.control.revision}),/RESTORE_DISABLED/);
 assert.equal(reader.confirmed.length,0);assert.equal(reader.owns(),false);
});

void test('an observed Save covers this tab receipt even if another same-account tab subsequently changes the document',async()=>{
 const f=fixture(),writer=f.tab(),other=f.tab();await writer.poll();await writer.apply();await writer.poll();await other.poll();
 const ownRevision=writer.doc().flow.revision;
 await other.post(other.command('save',{expectedRevision:other.doc().flow.revision}));await other.poll();
 assert.equal(other.doc().flow.saved.revision,ownRevision);
 await other.apply('Other tab after Save');await writer.poll();
 assert.notEqual(writer.doc().flow.saved.content.title,writer.doc().flow.working.title);
 assert.equal(writer.owns(),false);assert.equal(other.owns(),true);
});

void test('actual history restore kernel receipt owns only the requesting tab and document',async()=>{
 const f=fixture(),writer=f.tab();await writer.poll();await writer.apply('First');await writer.poll();
 await writer.post(writer.command('save',{expectedRevision:writer.doc().flow.revision}));await writer.poll();const savedId=writer.doc().flow.saved.id;
 await writer.apply('Second');await writer.poll();await writer.post(writer.command('save',{expectedRevision:writer.doc().flow.revision}));await writer.poll();assert.equal(writer.owns(),false);
 const receipt=await writer.post(writer.command('restore',{expectedRevision:writer.doc().flow.revision,restoreSaveId:savedId}));assert.equal(receipt.unchanged,false);await writer.poll();
 const reader=f.tab();await reader.poll();assert.equal(writer.owns(),true);assert.equal(reader.owns(),false);
 assert.equal(writer.box.departureSharedOwned(writer.doc('b')),false);
});

void test('unknown Apply retains local input, then attributes only its exact receipt without another POST',async()=>{
 const f=fixture(),writer=f.tab();await writer.poll();writer.s.buffers.set('a',{title:'Retained'});writer.mode('lost');
 await assert.rejects(writer.apply());const original=writer.s.retry,owner=writer.s.retryDeparture;assert(original);assert.equal(writer.confirmed.length,0);
 await assert.rejects(writer.post(original),/OPERATION_NOT_FOUND/);assert.equal(writer.s.retry,original);assert.equal(writer.s.retryDeparture,owner);
 writer.mode('ok');await writer.post(original);await writer.poll();assert.equal(writer.s.retry,null);assert.equal(writer.s.retryDeparture,null);assert.equal(writer.confirmed.length,1);
 assert.equal(writer.calls.filter(call=>call.method==='POST').length,1);assert.equal(writer.s.buffers.get('a').title,'Retained');assert.equal(writer.owns(),true);
 assert.equal(writer.calls.filter(call=>call.url.includes('operationId=')).every(call=>call.url.endsWith(original.operationId)),true);
});

for(const change of ['actor','epoch','delivery','generation','scope','document'])void test('late '+change+' cannot attribute the old Apply to the current document',async()=>{
 const f=fixture(),writer=f.tab();await writer.poll();const original=clone(writer.doc().flow);
 writer.afterPost(()=>{if(change==='actor'){writer.box.data.identity.id='other';writer.sync.identity={id:'other'};}
  if(change==='epoch')writer.changeEpoch();if(change==='delivery')writer.changeDelivery();
  if(change==='generation')writer.doc().flow.generation='new-generation';if(change==='scope')writer.doc().flow.scope='routine-fqc:other';
  if(change==='document')writer.box.data.control.documents=[];});
 await assert.rejects(writer.apply(),/ACCOUNT_CHANGED_REOPEN_REQUIRED|ROUTINE_RECEIPT_READBACK_REQUIRED/);
 assert.equal(writer.confirmed.length,0);assert.equal(writer.hook.owns(original),false);
});

for(const change of ['generation','scope'])void test('receipt-only recovery retains the original '+change+' fence',async()=>{
 const f=fixture(),writer=f.tab();await writer.poll();writer.mode('lost');await assert.rejects(writer.apply());const original=writer.s.retry,flow=clone(writer.doc().flow);
 if(change==='generation')writer.doc().flow.generation='new-generation';else writer.doc().flow.scope='routine-fqc:other';
 writer.mode('ok');await writer.post(original);assert.equal(writer.confirmed.length,0);assert.equal(writer.hook.owns(flow),false);
 assert.equal(writer.calls.filter(call=>call.method==='POST').length,1);
});

for(const invalid of ['operationId','generation','revision','unchanged'])void test('malformed '+invalid+' response cannot become attribution evidence',async()=>{
 const f=fixture(),writer=f.tab();await writer.poll();writer.alterResult(result=>({...result,[invalid]:invalid==='revision'?'1':invalid==='unchanged'?undefined:'wrong'}));
 await assert.rejects(writer.apply(),/INVALID_OPERATION_RECEIPT/);const original=writer.s.retry;assert(original,'unknown remains a departure barrier');assert.equal(writer.box.departure.inspect().state,'unknown');await assert.rejects(writer.box.departure.save());await assert.rejects(writer.box.departure.discard());assert.equal(writer.confirmed.length,0);assert.equal(writer.owns(),false);
 await assert.rejects(writer.post(original),/INVALID_OPERATION_RECEIPT/);assert.equal(writer.s.retry,original);
 writer.alterResult(result=>result);await writer.post(original);await writer.poll();assert.equal(writer.s.retry,null);assert.equal(writer.owns(),true);assert.equal(writer.calls.filter(call=>call.method==='POST').length,1);
});

void test('legacy/malformed flow keeps conservative fallback and local input still includes its document',async()=>{
 const f=fixture(),writer=f.tab();await writer.poll();writer.doc().flow.working.title='Legacy';writer.doc().flow.contributors={field:{actor:{id:123}}};
 delete writer.doc().flow.scope;assert.equal(writer.owns(),true);
 writer.doc().flow.contributors={field:{actor:{id:'other'}}};assert.equal(writer.owns(),false);
 writer.s.buffers.set('a',{title:'Local'});assert.equal(writer.box.departureDocuments().length,1);assert.equal(writer.calls.filter(call=>call.method==='POST').length,0);
});

void test('mismatched document scope cannot borrow another document receipt',async()=>{
 const f=fixture(),writer=f.tab();await writer.poll();await writer.apply('Mine in B','b');await writer.poll();
 const malformed=writer.doc();malformed.flow.scope='routine-fqc:b';malformed.flow.generation=writer.doc('b').flow.generation;
 malformed.flow.working.title='Someone else';malformed.flow.contributors={field:{actor:{id:'other'}}};
 assert.equal(writer.owns(),false);assert.equal(writer.box.departureSharedOwned(writer.doc('b')),true);
});


void test('first POST registers its exact document even before a state read',async()=>{
 const f=fixture(),writer=f.tab();assert.equal(writer.hook.owns(writer.doc().flow),null);
 await writer.apply();assert.equal(writer.owns(),true);assert.equal(writer.confirmed.length,1);
});

void test('duplicate late receipt cannot retire a newer unknown command',async()=>{
 const f=fixture(),writer=f.tab();await writer.poll();writer.mode('lost');await assert.rejects(writer.apply());const old=writer.s.retry;
 writer.mode('ok');const release=[];writer.afterReceipt(()=>new Promise(resolve=>release.push(resolve)));
 const first=writer.post(old),second=writer.post(old);await new Promise(resolve=>setImmediate(resolve));assert.equal(release.length,2);
 release[0]();await first;await writer.poll();writer.mode('lost');await assert.rejects(writer.apply('New command'));const newer=writer.s.retry,newerOwner=writer.s.retryDeparture;assert.notEqual(newer.operationId,old.operationId);
 writer.mode('ok');release[1]();await assert.rejects(second,/ACCOUNT_CHANGED_REOPEN_REQUIRED/);assert.equal(writer.s.retry,newer);assert.equal(writer.s.retryDeparture,newerOwner);
 writer.afterReceipt(()=>{});await writer.post(newer);await writer.poll();assert.equal(writer.s.retry,null);assert.equal(writer.calls.filter(call=>call.method==='POST').length,2);
});
for(const action of ['apply','restore'])void test(`routine non-no-op ${action} revision zero cannot clear POST or receipt-only unknown`,async()=>{
 const f=fixture(),writer=f.tab();await writer.poll();
 if(action==='restore'){await writer.post(writer.command('save',{expectedRevision:writer.doc().flow.revision}));await writer.poll();await writer.apply('Changed');await writer.poll();}
 const command=writer.command(action,action==='apply'?{patches:[{op:'set',path:['title'],value:'Mine'}],guards:[{path:['title'],value:writer.doc().flow.working.title}]}:{expectedRevision:writer.doc().flow.revision,restoreSaveId:writer.doc().flow.saved.id});
 writer.alterResult(result=>({...result,revision:0,unchanged:false}));await assert.rejects(writer.post(command),/INVALID_OPERATION_RECEIPT/);const original=writer.s.retry;assert.equal(original.operationId,command.operationId);
 await assert.rejects(writer.post(original),/INVALID_OPERATION_RECEIPT/);assert.equal(writer.s.retry,original);
 const posts=writer.calls.filter(call=>call.method==='POST').length;writer.alterResult(result=>result);await writer.post(original);await writer.poll();assert.equal(writer.s.retry,null);assert.equal(writer.calls.filter(call=>call.method==='POST').length,posts);
});
void test('routine legitimate no-op revision zero remains valid and never claims a write',async()=>{const writer=fixture().tab();await writer.poll();const result=await writer.apply('Initial a');assert.equal(result.revision,0);assert.equal(result.unchanged,true);assert.equal(writer.s.retry,null);assert.equal(writer.owns(),false);});
