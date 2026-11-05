// Actual bridge + shared transport + production handlers. Only browser ports and
// isolated SQLite/R2 bindings are synthetic; no private fixture snapshots.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {webcrypto} from 'node:crypto';
import {fixture as apiFixture} from './master-ab-auth-phase-fixture.mjs';
async function fixture({scope='AB',disk=new Map(),api}={}){
 const f=api||await apiFixture({scope}),calls=[],control={active:{},versions:[]},events=new Map();let mode='',form=false;
 const box={window:null,crypto:webcrypto,URL,URLSearchParams,Request,Response,Headers,AbortController,TextEncoder,performance,console,setTimeout,clearTimeout,location:{origin:'https://fixture.invalid',pathname:'/process/'},document:{documentElement:{lang:'zh'},body:{style:{}},querySelector:()=>form?{}:null,querySelectorAll:()=>[]},ProcessSync:{identity:f.user,identityGeneration:()=>1,captureDelivery:()=>1,isCurrentDelivery:v=>v===1,platformHeaders:()=>f.headers},addEventListener(name,fn){const list=events.get(name)||[];list.push(fn);events.set(name,list);},sessionStorage:{get length(){return disk.size;},key:i=>[...disk.keys()][i]??null,getItem:k=>disk.get(k)??null,setItem:(k,v)=>disk.set(k,v),removeItem:k=>disk.delete(k)}};box.window=box;
 box.fetch=async(url,options)=>{
  const body=options.body&&JSON.parse(options.body);calls.push({url,method:options.method,body});
  if(mode==='missing'&&url.includes('operationId='))return Response.json({error:'OPERATION_NOT_FOUND'},{status:404});
  const response=await f.route[options.method](new Request(new URL(url,'https://fixture.invalid'),{...options,headers:f.headers}));
  if((mode==='lost'||mode==='lost-begin')&&body)throw Error('Synthetic lost ACK');return response;
 };
 vm.createContext(box);for(const p of ['shared-draft-client.js','master-shared-client.js'])vm.runInContext(fs.readFileSync('public/process/'+p,'utf8'),box);
 const bridge=box.createMasterSharedBridge({control});await bridge.load(scope);
 return {f,box,bridge,control,disk,calls,scope,draft:()=>control.versions.find(v=>v.scope===scope&&v.status==='draft'),mode:v=>mode=v,form:v=>form=v,emit:name=>{for(const fn of events.get(name)||[])fn({});},posts:()=>calls.filter(c=>c.method==='POST')};
}
for(const scope of ['AB','C']){
 void test(`${scope} local completions, poll, ordered guards, one Save and clean discard`,async t=>{
  const x=await fixture({scope});t.after(x.f.close);const original=x.f.row();x.draft().snapshot.products[0].name='First';await x.bridge.execute(scope,'apply');x.draft().snapshot.products[0].name='Second';await x.bridge.execute(scope,'apply');
  assert.equal(x.posts().length,0);assert.deepEqual(x.f.row(),original);assert(x.bridge.localDirty(scope));await x.bridge.load(scope);assert.equal(x.draft().snapshot.products[0].name,'Second');
  await assert.rejects(x.bridge.submit(scope),/UNSAVED_CHANGES_SAVE_REQUIRED/);x.calls.length=0;const saved=await x.bridge.execute(scope,'save');assert.equal(x.posts().length,1);assert.equal(saved.control.workflow.saved.content.products[0].name,'Second');assert(!x.bridge.localDirty(scope));assert.equal(x.disk.size,0);
  const sent=x.posts()[0].body.command;assert.equal(sent.input.batches.length,2);assert.equal(sent.input.batches[0].guards[0].value,'Synthetic product');assert.equal(sent.input.batches[1].guards[0].value,'First');
  x.draft().snapshot.products[0].name='Discard';await x.bridge.execute(scope,'apply');x.bridge.discardLocal(scope);assert.equal(x.draft().snapshot.products[0].name,'Second');assert(!x.bridge.localDirty(scope));
 });
 void test(`${scope} unknown Save retains exact sent operation/basis across reopen and 404; GET-only recovery`,async t=>{
  const x=await fixture({scope});t.after(x.f.close);x.draft().snapshot.products[0].name='Lost';await x.bridge.execute(scope,'apply');x.mode('lost');
  // Hide only receipt GET after the synthetic committed POST has lost its ACK.
  const fetch=x.box.fetch;x.box.fetch=async(url,opt)=>url.includes('operationId=')?Response.json({error:'OPERATION_NOT_FOUND'},{status:404}):fetch(url,opt);
  await assert.rejects(x.bridge.execute(scope,'save'),/RESULT_UNKNOWN/);const marker=[...x.disk];assert.equal(x.posts().length,1);assert(x.bridge.localDirty(scope));assert(x.bridge.client(scope).hasUnknown());
  x.bridge.discardLocal(scope);const y=await fixture({scope,disk:x.disk,api:x.f});y.mode('missing');await assert.rejects(y.bridge.recover(scope),/OPERATION_NOT_FOUND/);assert.deepEqual([...x.disk],marker);assert.equal(y.posts().length,0);
  y.mode('');await y.bridge.recover(scope);assert.equal(y.posts().length,0);assert.equal(y.disk.size,0);assert.equal(y.control.workflowScopes[scope].saved.content.products[0].name,'Lost');
 });
 void test(`${scope} unknown Begin never retries or binds to a later generation`,async t=>{
  const x=await fixture({scope});t.after(x.f.close);x.mode('lost-begin');await assert.rejects(x.bridge.execute(scope,'begin'),/lost ACK/);const marker=[...x.disk];assert.equal(x.posts().length,1);
  const y=await fixture({scope,disk:x.disk,api:x.f});y.mode('missing');await assert.rejects(y.bridge.recover(scope),/OPERATION_NOT_FOUND/);assert.deepEqual([...y.disk],marker);assert.equal(y.posts().length,0);
  await x.f.mutateValues(v=>{const root=JSON.parse(v.masterDataControl);root.workflowScopes[scope].generation='later-generation';v.masterDataControl=JSON.stringify(root);});y.mode('');await assert.rejects(y.bridge.recover(scope),/BEGIN_GENERATION_CHANGED/);assert.deepEqual([...y.disk],marker);assert.equal(y.posts().length,0);
 });
 void test(`${scope} open form cannot save; generation change retains original local baseline`,async t=>{
  const x=await fixture({scope});t.after(x.f.close);x.form(true);await assert.rejects(x.bridge.execute(scope,'save'),/UNAPPLIED_CHANGES/);assert.equal(x.posts().length,0);x.form(false);
  x.draft().snapshot.products[0].name='Local';await x.bridge.execute(scope,'apply');await x.f.mutateValues(v=>{const root=JSON.parse(v.masterDataControl);root.workflowScopes[scope].generation='new-generation';v.masterDataControl=JSON.stringify(root);});await x.bridge.load(scope);
  await assert.rejects(x.bridge.execute(scope,'save'),/STALE_GENERATION/);assert.equal(x.posts().length,0);assert.equal(x.draft().snapshot.products[0].name,'Local');assert(x.bridge.localDirty(scope));
 });
}
