// Actual bridge + shared transport + production handlers. Only browser ports and
// isolated SQLite/R2 bindings are synthetic; no private fixture snapshots.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {webcrypto} from 'node:crypto';
import {fixture as apiFixture} from './master-ab-auth-phase-fixture.mjs';
async function fixture({scope='PROCESS',disk=new Map(),api}={}){
 const f=api||await apiFixture({scope}),calls=[],control={active:{},versions:[]},events=new Map();let mode='',form=false;
 const box={window:null,crypto:webcrypto,URL,URLSearchParams,Request,Response,Headers,AbortController,TextEncoder,performance,console,setTimeout,clearTimeout,location:{origin:'https://fixture.invalid',pathname:'/process/'},document:{documentElement:{lang:'zh'},body:{style:{}},querySelector:()=>form?{}:null,querySelectorAll:()=>[]},ProcessSync:{identity:f.user,identityGeneration:()=>1,captureDelivery:()=>1,isCurrentDelivery:v=>v===1,platformHeaders:()=>f.headers},addEventListener(name,fn){const list=events.get(name)||[];list.push(fn);events.set(name,list);},sessionStorage:{get length(){return disk.size;},key:i=>[...disk.keys()][i]??null,getItem:k=>disk.get(k)??null,setItem:(k,v)=>disk.set(k,v),removeItem:k=>disk.delete(k)}};box.window=box;
 box.fetch=async(url,options)=>{
  const body=options.body&&JSON.parse(options.body);calls.push({url,method:options.method,body});
  if(mode==='missing'&&url.includes('operationId='))return Response.json({error:'OPERATION_NOT_FOUND'},{status:404});
  const response=await f.route[options.method](new Request(new URL(url,'https://fixture.invalid'),{...options,headers:f.headers}));
  if((mode==='lost'||mode==='lost-begin')&&body)throw Error('Synthetic lost ACK');return response;
 };
 vm.createContext(box);for(const p of ['shared-draft-client.js','master-shared-client.js'])vm.runInContext(fs.readFileSync('public/process/'+p,'utf8'),box);
 const bridge=box.createMasterSharedBridge({control,processLocalSave:true});await bridge.load(scope);
 return {f,box,bridge,control,disk,calls,scope,draft:()=>control.versions.find(v=>v.scope===scope&&v.status==='draft'),mode:v=>mode=v,form:v=>form=v,emit:name=>{for(const fn of events.get(name)||[])fn({});},posts:()=>calls.filter(c=>c.method==='POST')};
}

const path=['A-CUT',{id:'A-CUT-FLOW-02'},'name'];
const name=x=>x.draft().snapshot['A-CUT'][1].name;
async function stage(x,value){const before=name(x);return x.bridge.patch('PROCESS',[{op:'set',path,value}],[{path,value:before}]);}
void test('PROCESS local forms + poll + names: no POST until one atomic Save',async t=>{
 const x=await fixture();t.after(x.f.close);const row=x.f.row();await stage(x,'First');await stage(x,'第二次 Tên');assert.equal(x.posts().length,0);assert.deepEqual(x.f.row(),row);await x.bridge.load('PROCESS');assert.equal(name(x),'第二次 Tên');await assert.rejects(x.bridge.submit('PROCESS'),/UNSAVED_CHANGES/);const saved=await x.bridge.execute('PROCESS','save');assert.equal(x.posts().length,1);assert.equal(saved.control.workflow.saved.content['A-CUT'][1].name,'第二次 Tên');assert.deepEqual(saved.control.workflow.saved.content,saved.control.workflow.working);assert.equal(x.disk.size,0);assert(!x.bridge.localDirty('PROCESS'));
});
void test('PROCESS lost Save ACK retains bounded marker across reload, 404 means unknown, GET-only settlement',async t=>{
 const x=await fixture();t.after(x.f.close);await stage(x,'Lost saved');x.mode('lost');const fetch=x.box.fetch;x.box.fetch=(url,opt)=>url.includes('operationId=')?Promise.resolve(Response.json({error:'OPERATION_NOT_FOUND'},{status:404})):fetch(url,opt);await assert.rejects(x.bridge.execute('PROCESS','save'));const marker=[...x.disk];assert(marker.length);assert.equal(x.posts().length,1);
 x.bridge.discardLocal('PROCESS');const y=await fixture({disk:x.disk,api:x.f});y.mode('missing');await assert.rejects(y.bridge.recover('PROCESS'),/OPERATION_NOT_FOUND/);assert.deepEqual([...x.disk],marker);assert.equal(y.posts().length,0);y.mode('');await y.bridge.recover('PROCESS');assert.equal(y.posts().length,0);assert.equal(y.disk.size,0);assert.equal(y.control.workflowScopes.PROCESS.saved.content['A-CUT'][1].name,'Lost saved');
});
void test('PROCESS unknown Begin is durable and cannot bind to new generation',async t=>{
 const x=await fixture();t.after(x.f.close);x.mode('lost-begin');await assert.rejects(x.bridge.execute('PROCESS','begin'));const marker=[...x.disk];assert(marker.length);const y=await fixture({disk:x.disk,api:x.f});y.mode('missing');await assert.rejects(y.bridge.recover('PROCESS'),/OPERATION_NOT_FOUND/);assert.deepEqual([...x.disk],marker);await x.f.mutateValues(v=>{const r=JSON.parse(v.masterDataControl);r.workflowScopes.PROCESS.generation='next-generation';v.masterDataControl=JSON.stringify(r);});y.mode('');await assert.rejects(y.bridge.recover('PROCESS'),/BEGIN_GENERATION_CHANGED/);assert.deepEqual([...x.disk],marker);assert.equal(y.posts().length,0);
});
void test('PROCESS Save response retains edits typed after captured cut',async t=>{
 const x=await fixture();t.after(x.f.close);await stage(x,'Captured');let release,arrived;const gate=new Promise(r=>release=r),sent=new Promise(r=>arrived=r),fetch=x.box.fetch;x.box.fetch=async(url,opt)=>{const r=await fetch(url,opt);if(opt.body&&JSON.parse(opt.body).command?.action==='save'){arrived();await gate;}return r;};const task=x.bridge.execute('PROCESS','save');await sent;await stage(x,'Later');release();await task;assert.equal(x.control.workflowScopes.PROCESS.saved.content['A-CUT'][1].name,'Captured');assert.equal(name(x),'Later');assert(x.bridge.localDirty('PROCESS'));assert.equal(x.posts().length,1);await x.bridge.execute('PROCESS','save');assert.equal(x.control.workflowScopes.PROCESS.saved.content['A-CUT'][1].name,'Later');assert.equal(x.posts().length,2);
});
void test('PROCESS different-field peer poll remains visible without rebasing original same-field guard',async t=>{
 const x=await fixture();t.after(x.f.close);const original=name(x);await stage(x,'Mine');const p=['A-CUT',{id:'A-CUT-FLOW-02'},'editorType'];assert.equal((await x.f.request('POST',x.f.command('apply',{patches:[{op:'set',path:p,value:'inspection'}],guards:[{path:p}],clientId:'peer-client'}))).status,200);await x.bridge.load('PROCESS');assert.equal(x.draft().snapshot['A-CUT'][1].editorType,'inspection');assert.equal(name(x),'Mine');assert.equal(x.posts().length,0);assert.equal((await x.f.request('POST',x.f.command('apply',{patches:[{op:'set',path,value:'Peer'}],guards:[{path,value:original}],clientId:'peer-client'}))).status,200);await x.bridge.load('PROCESS');const row=x.f.row();await assert.rejects(x.bridge.execute('PROCESS','save'),/DEPENDENCY_CHANGED/);assert.deepEqual(x.f.row(),row);assert(x.bridge.localDirty('PROCESS'));assert.equal(x.bridge.client('PROCESS').hasUnknown(),false);
});
void test('PROCESS stale owner/generation never sends; local discard preserves committed state',async t=>{
 const x=await fixture();t.after(x.f.close);await stage(x,'Mine');const before=x.f.row();x.bridge.discardLocal('PROCESS');assert.deepEqual(x.f.row(),before);assert(!x.bridge.localDirty('PROCESS'));await stage(x,'Stale');await x.f.mutateValues(v=>{const r=JSON.parse(v.masterDataControl);r.workflowScopes.PROCESS.generation='next-generation';v.masterDataControl=JSON.stringify(r);});await x.bridge.load('PROCESS');await assert.rejects(x.bridge.execute('PROCESS','save'),/STALE_GENERATION/);assert.equal(x.posts().length,0);
});
void test('PROCESS raw names typed while Submit confirmation is open cannot submit the older saved snapshot',async t=>{
 const x=await fixture();t.after(x.f.close);await stage(x,'Saved');await x.bridge.execute('PROCESS','save');let answer;const dialog=new Promise(r=>answer=r);x.box.captureSharedDraftSubmission=()=>({savedId:x.control.workflowScopes.PROCESS.saved.id,expectedRevision:x.control.workflowScopes.PROCESS.revision});x.box.VersionDraftUI={reasonFor:()=>'',masterChanges:()=>[],confirmSubmit:()=>dialog};x.box.ProcessMasterVersioning={departureNames:{dirty:()=>false}};const count=x.posts().length,pending=x.bridge.submit('PROCESS');x.box.ProcessMasterVersioning.departureNames.dirty=()=>true;answer('Synthetic reason');await assert.rejects(pending,/UNSAVED_CHANGES/);assert.equal(x.posts().length,count);
});
void test('PROCESS local insertion proof never treats a missing server target or existing entity as new',async t=>{
 const x=await fixture();t.after(x.f.close);assert.equal(x.bridge.isLocalProcessInsert('template','manual'),false);assert.equal(x.bridge.isLocalProcessInsert('equipment','missing'),false);
 const newTemplate={id:'local-template',catalogKey:'local-key',name:'New template',editorType:'custom',mediaItems:[]};await x.bridge.patch('PROCESS',[{op:'insert',path:['A-CUT'],value:newTemplate}],[]);assert.equal(x.bridge.isLocalProcessInsert('template','local-key'),true);assert.equal(x.bridge.isLocalProcessInsert('template','manual'),false);
 const parent=['A-CUT',{id:'A-CUT-FLOW-04'},'equipment'],machine={id:'local-machine',number:'LOCAL',name:'Local machine',stageCode:'A-CUT',line:'A',kind:'machine-assembly',mediaItems:[]};await x.bridge.patch('PROCESS',[{op:'insert',path:parent,value:machine}],[]);assert.equal(x.bridge.isLocalProcessInsert('equipment',machine.id),true);assert.equal(x.posts().length,0);
 await x.bridge.execute('PROCESS','save');assert.equal(x.bridge.isLocalProcessInsert('template','local-key'),false);assert.equal(x.bridge.isLocalProcessInsert('equipment',machine.id),false);
});
