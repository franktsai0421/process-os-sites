import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {createRequire} from 'node:module';
import {createOwnedDraftLedger} from '../public/process/owned-draft-ledger.mjs';
const {createSharedDraft,applyDraftCommand}=createRequire(import.meta.url)('../scripts/ipqc-ab-import-harness.cjs')({})('lib/shared-draft.ts');
const clientSource=fs.readFileSync(new URL('../public/process/shared-draft-client.js',import.meta.url),'utf8');
const copy=v=>structuredClone(v),field=['rows',{id:'row-a'},'name'];
function fixture(){
 const session=new Map(),receipts=new Map(),requests=[];let state=createSharedDraft('process:platform',{rows:[{id:'row-a',name:'saved'}]},null,'generation-recovery'),number=0,phase='normal',denyMarkerWrite=false,denyMarkerRemove=false;
 const context={actor:{id:'frank',name:'Frank',admin:true},at:'synthetic',id:()=>`generated-${++number}`,allowed:()=>true,structure:()=>{},validate:()=>[],semantic:v=>v,activeId:null};
 const storage={getItem:key=>session.get(key)??null,setItem(key,value){if(denyMarkerWrite&&key.startsWith('process-owned-revert-v1:'))throw Error('QUOTA');session.set(key,value);},removeItem(key){if(denyMarkerRemove&&key.startsWith('process-owned-revert-v1:'))throw Error('STORAGE_DENIED');session.delete(key);}};
 const payload=()=>({revision:state.revision,control:{workflow:copy(state)},permissions:{view:true,edit:true,save:true,submit:true,delete:true}});
 function realm(){
  let timer=0;const host={window:null,document:{documentElement:{lang:'zh'},body:{style:{}},querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){}},location:{origin:'https://fixture.invalid',pathname:'/process/'},sessionStorage:storage,structuredClone,console,performance,crypto:webcrypto,URL,URLSearchParams,AbortController,Response,setTimeout:()=>++timer,clearTimeout(){},addEventListener(){},ProcessSync:{identity:{id:'frank'},requiresReload:false,platformHeaders:()=>({'Content-Type':'application/json'}),captureDelivery:()=>1,isCurrentDelivery:id=>id===1}};
  host.window=host;host.fetch=async(url,options={})=>{
   const post=options.method==='POST',query=new URL(url,'https://fixture.invalid').searchParams;requests.push({method:options.method,url});
   if(post){const command=JSON.parse(options.body).command;if(phase==='lost-uncommitted')throw Error('NETWORK_LOST');const result=applyDraftCommand(state,command,context);state=result.state;receipts.set(command.operationId,copy(result.receipt));if(phase==='lost-committed')throw Error('NETWORK_LOST');return Response.json({...payload(),receipt:result.receipt});}
   if(query.has('operationId')){if(phase.startsWith('lost-'))return Response.json({error:'LOOKUP_UNAVAILABLE'},{status:503});const receipt=receipts.get(query.get('operationId'));return receipt?Response.json({receipt}):Response.json({error:'OPERATION_NOT_FOUND'},{status:404});}
   return Response.json(payload());
  };
  vm.runInNewContext(clientSource,host,{filename:'shared-draft-client.js'});const client=host.createSharedDraftClient({endpoint:'/api/process-authoring/workflow?caseMetadata=1',actorId:'frank',headers:()=>({'Content-Type':'application/json'})});
  const ledger=createOwnedDraftLedger({actorId:'frank',scope:'process:platform',recoveryStorage:storage});let view;
  const adopt=result=>{view=result.control.workflow;ledger.observe(view);return result;};
  return {client,ledger,adopt,get view(){return view;},async load(){return adopt(await client.read());},async own(){return adopt(await ledger.command(client,state.generation,'apply',{patches:[{op:'set',path:field,value:'mine'}],guards:[{path:field,value:'saved'}]},()=>view));}};
 }
 return {realm,storage,session,requests,phase(value){phase=value;},denyWrite(value){denyMarkerWrite=value;},denyRemove(value){denyMarkerRemove=value;},get state(){return state;},get posts(){return requests.filter(r=>r.method==='POST').length;},async start(){const app=realm();await app.client.command(state.generation,'save');await app.load();await app.own();return app;}};
}
void test('real transport reload finds inverse marker, clears exact unknown by receipt, and never retransmits',async()=>{
 const f=fixture(),before=await f.start();f.phase('lost-committed');await assert.rejects(before.ledger.discard(before.client),/UNKNOWN/);assert(before.client.hasUnknown());assert(before.ledger.hasRevertRecovery());const posts=f.posts;
 const reloaded=f.realm();await reloaded.load();assert(reloaded.client.hasUnknown());assert(reloaded.ledger.hasRevertRecovery());await assert.rejects(reloaded.ledger.resolve(reloaded.client,'retryUnknown'));assert.equal(f.posts,posts);
 f.phase('normal');const result=await reloaded.ledger.recoverDiscard(reloaded.client);assert.equal(result.ownedRevertNeedsReview,true);assert.equal(reloaded.client.hasUnknown(),false);assert.equal(reloaded.ledger.hasRevertRecovery(),false);assert.equal(reloaded.ledger.inspect().canSave,true);assert.equal(reloaded.ledger.inspect().canDiscard,false);assert.equal(before.view.working.rows[0].name,'mine');assert.equal(f.state.working.rows[0].name,'saved');assert.equal(f.posts,posts);
 await reloaded.ledger.resolve(reloaded.client,'retryUnknown');assert.equal(f.posts,posts);assert(![...f.session.keys()].some(k=>k.startsWith('shared-draft-v3-operation:')||k.startsWith('process-owned-revert-v1:')));
});
void test('real transport reload with 404 keeps unknown/marker and blocks generic retry POST',async()=>{
 const f=fixture(),before=await f.start();f.phase('lost-uncommitted');await assert.rejects(before.ledger.discard(before.client),/UNKNOWN/);const reloaded=f.realm(),posts=f.posts;await reloaded.load();f.phase('normal');await assert.rejects(reloaded.ledger.recoverDiscard(reloaded.client),/OPERATION_NOT_FOUND/);
 await assert.rejects(reloaded.ledger.resolve(reloaded.client,'retryUnknown'));assert.equal(f.posts,posts);assert(reloaded.client.hasUnknown());assert(reloaded.ledger.hasRevertRecovery());assert.equal(reloaded.ledger.inspect().canSave,false);assert.equal(f.state.working.rows[0].name,'mine');
});
void test('real transport marker storage failure performs zero inverse POST',async()=>{
 const f=fixture(),app=await f.start(),posts=f.posts;f.denyWrite(true);await assert.rejects(app.ledger.discard(app.client),/尚未送出任何放棄/);assert.equal(f.posts,posts);assert.equal(app.client.hasUnknown(),false);assert.equal(f.state.working.rows[0].name,'mine');
});
void test('real transport confirmed receipt but marker cleanup failure remains read-only until storage recovers',async()=>{
 const f=fixture(),app=await f.start();f.phase('lost-committed');await assert.rejects(app.ledger.discard(app.client));const reloaded=f.realm(),posts=f.posts;f.phase('normal');f.denyRemove(true);await assert.rejects(reloaded.ledger.recoverDiscard(reloaded.client),/安全離頁紀錄/);assert.equal(reloaded.client.hasUnknown(),false);assert(reloaded.ledger.hasRevertRecovery());await assert.rejects(reloaded.ledger.resolve(reloaded.client,'retryUnknown'));assert.equal(f.posts,posts);
 f.denyRemove(false);const result=await reloaded.ledger.recoverDiscard(reloaded.client);assert.equal(result.ownedRevertNeedsReview,true);assert.equal(reloaded.ledger.hasRevertRecovery(),false);assert.equal(f.posts,posts);
});

void test('generic unknown retry and same prepared ID only read receipts; 404 never retransmits',async()=>{
 const f=fixture(),app=f.realm();await app.load();f.phase('lost-uncommitted');const command=app.client.prepare(f.state.generation,'apply',{patches:[{op:'set',path:field,value:'never committed'}],guards:[{path:field,value:'saved'}]});
 await assert.rejects(app.client.sendPrepared(command),/UNKNOWN/);const posts=f.posts;f.phase('normal');await assert.rejects(app.client.retryUnknown(),/OPERATION_NOT_FOUND/);await assert.rejects(app.client.sendPrepared(command),/OPERATION_NOT_FOUND/);assert.equal(f.posts,posts);assert(app.client.hasUnknown());assert.equal(f.state.working.rows[0].name,'saved');
});
void test('generic retry recovers a committed unknown by the exact receipt without another POST',async()=>{
 const f=fixture(),app=f.realm();await app.load();f.phase('lost-committed');await assert.rejects(app.client.command(f.state.generation,'apply',{patches:[{op:'set',path:field,value:'committed'}],guards:[{path:field,value:'saved'}]}),/UNKNOWN/);const posts=f.posts;f.phase('normal');const result=await app.client.retryUnknown();assert(result.receipt.operationId);assert.equal(app.client.hasUnknown(),false);assert.equal(f.posts,posts);assert.equal(f.state.working.rows[0].name,'committed');
});
