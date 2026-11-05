// Actual bridge + shared transport + production handlers. Only browser ports and
// isolated SQLite/R2 bindings are synthetic; no private fixture snapshots.
import test from 'node:test';import assert from 'node:assert/strict';
import {fixture} from './abc-local-bridge-fixture.mjs';
for(const scope of ['AB','C']){
 for(const lost of [false,true])void test(`${scope} actual-handler ${lost?'lost':'normal'} Save ACK uses only necessary authoritative reads`,async t=>{
  const x=await fixture({scope});t.after(x.f.close);x.draft().snapshot.products[0].name='Counted Save';await x.bridge.execute(scope,'apply');x.calls.length=0;x.f.reset();if(lost)x.mode('lost');
  const result=await x.bridge.execute(scope,'save'),requests=x.calls.map(c=>c.method==='POST'?'POST':new URL(c.url,'https://fixture.invalid').searchParams.has('operationId')?'receipt GET':'full GET');
  t.diagnostic(JSON.stringify({scope,lost,requests,recovered:result.recovered===true,cas:x.f.stats.cas}));
  assert.deepEqual(requests,lost?['POST','receipt GET','full GET']:['POST','full GET']);assert.equal(result.recovered===true,lost);assert.equal(x.f.stats.cas,1);
  assert.equal(result.permissions.view,true);assert.equal(result.receipt.operationId,x.posts()[0].body.command.operationId);assert.equal(result.control.workflow.saved.content.products[0].name,'Counted Save');assert.equal(x.bridge.localDirty(scope),false);assert.equal(x.bridge.client(scope).hasUnknown(),false);assert.equal(x.disk.size,0);
 });
 for(const failure of ['view revoked','session revoked','read unavailable','generation changed','wrong receipt','identity replaced','epoch changed','delivery changed'])void test(`${scope} Save readback ${failure} retains the original sent command`,async t=>{
  const x=await fixture({scope});t.after(x.f.close);x.draft().snapshot.products[0].name='Retained Save';await x.bridge.execute(scope,'apply');x.calls.length=0;x.f.reset();
  const beforeFlow=JSON.stringify(x.control.workflowScopes[scope]),sentClient=x.bridge.client(scope),fetch=x.box.fetch;let marker,committed,refuseRead=false;
  x.box.fetch=async(url,options)=>{
   const receipt=new URL(url,'https://fixture.invalid').searchParams.has('operationId');
   if(refuseRead&&options.method==='GET'&&!receipt){x.calls.push({url,method:options.method});return Response.json({error:'SYNTHETIC_READ_UNAVAILABLE'},{status:503});}
   let response=await fetch(url,options);
   if(options.method==='POST'){
    const ack=await response.clone().json();assert.equal(response.status,200);assert.equal(ack.permissions,undefined);marker=[...x.disk];committed=x.f.row();
    if(failure==='view revoked')await x.f.mutateValues(v=>{const users=JSON.parse(v.platformUsers);users[0].accessOverrides[scope==='AB'?'ab.view':'c.view']=false;v.platformUsers=JSON.stringify(users);});
    if(failure==='session revoked')x.f.revoke();
    if(failure==='read unavailable')refuseRead=true;
    if(failure==='generation changed')await x.f.mutateValues(v=>{const root=JSON.parse(v.masterDataControl);root.workflowScopes[scope].generation='successor-generation';v.masterDataControl=JSON.stringify(root);});
    if(failure==='identity replaced')x.box.ProcessSync.identity={...x.f.user};
    if(failure==='epoch changed')x.box.ProcessSync.identityGeneration=()=>2;
    if(failure==='delivery changed')x.box.ProcessSync.isCurrentDelivery=()=>false;
   }
   if(failure==='wrong receipt'&&(options.method==='POST'||receipt)){const body=await response.json();body.receipt.operationId='wrong-operation';response=Response.json(body,{status:response.status});}
   return response;
  };
  await assert.rejects(x.bridge.execute(scope,'save'),/RESULT_UNKNOWN|ACCOUNT_CHANGED|BEGIN_OWNER_CHANGED/);assert(marker);assert.deepEqual([...x.disk],marker);assert.equal(x.posts().length,1);assert.equal(x.f.stats.cas,1);assert(x.bridge.localDirty(scope));
  const sent=x.posts()[0].body.command;assert(x.disk.values().next().value.includes(sent.operationId));assert(sentClient.hasUnknown());assert.equal(JSON.stringify(x.control.workflowScopes[scope]),beforeFlow);assert.equal(x.draft().snapshot.products[0].name,'Retained Save');
  for(const c of x.calls.filter(c=>c.method==='GET'&&new URL(c.url,'https://fixture.invalid').searchParams.has('operationId')))assert.equal(new URL(c.url,'https://fixture.invalid').searchParams.get('operationId'),sent.operationId);
  if(['view revoked','session revoked'].includes(failure))assert.equal(x.bridge.client(scope).permission('view'),false);
  await assert.rejects(x.bridge.execute(scope,'save'),/UNKNOWN_OPERATION_CHECK_REQUIRED/);assert.equal(x.posts().length,1);assert.deepEqual([...x.disk],marker);
  if(['read unavailable','wrong receipt'].includes(failure)){assert.deepEqual(x.f.row(),committed);x.box.fetch=fetch;const posts=x.posts().length;await x.bridge.recover(scope);assert.equal(x.posts().length,posts);assert.equal(x.disk.size,0);assert.equal(x.control.workflowScopes[scope].saved.content.products[0].name,'Retained Save');}
 });
 void test(`${scope} successful Save settles with fresh view while revoked edit/save cannot write again`,async t=>{
  const x=await fixture({scope});t.after(x.f.close);x.draft().snapshot.products[0].name='Committed before revocation';await x.bridge.execute(scope,'apply');x.calls.length=0;
  const fetch=x.box.fetch;x.box.fetch=async(url,options)=>{const response=await fetch(url,options);if(options.method==='POST')await x.f.mutateValues(v=>{const users=JSON.parse(v.platformUsers),prefix=scope==='AB'?'ab':'c';for(const key of ['edit','save'])users[0].accessOverrides[prefix+'.'+key]=false;v.platformUsers=JSON.stringify(users);});return response;};
  const result=await x.bridge.execute(scope,'save');assert.equal(result.permissions.view,true);assert.equal(result.permissions.edit,false);assert.equal(result.permissions.save,false);assert.equal(x.disk.size,0);assert.equal(x.bridge.client(scope).permission('save'),false);await assert.rejects(x.bridge.execute(scope,'save'),/FORBIDDEN/);assert.equal(x.posts().length,1);
 });
 void test(`${scope} newer permission denial supersedes a late successful Save readback`,async t=>{
  const x=await fixture({scope});t.after(x.f.close);x.draft().snapshot.products[0].name='Sent before denial';await x.bridge.execute(scope,'apply');x.calls.length=0;
  const beforeFlow=JSON.stringify(x.control.workflowScopes[scope]),fetch=x.box.fetch;let marker,first=true;x.box.fetch=async(url,options)=>{const response=await fetch(url,options);if(options.method==='POST')marker=[...x.disk];
   if(options.method==='GET'&&!new URL(url,'https://fixture.invalid').searchParams.has('operationId')&&!new URL(url,'https://fixture.invalid').searchParams.has('permissions')&&first){first=false;await x.f.mutateValues(v=>{const users=JSON.parse(v.platformUsers);users[0].accessOverrides[scope==='AB'?'ab.view':'c.view']=false;v.platformUsers=JSON.stringify(users);});await assert.rejects(x.bridge.client(scope).permissions(),e=>e.status===403);}
   return response;};
  await assert.rejects(x.bridge.execute(scope,'save'),/RESULT_UNKNOWN/);assert.deepEqual([...x.disk],marker);assert.equal(x.posts().length,1);assert.equal(x.bridge.client(scope).permission('view'),false);assert(x.bridge.localDirty(scope));assert.equal(JSON.stringify(x.control.workflowScopes[scope]),beforeFlow);
 });
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
void test('local new/renamed product deletion resolves the authoritative reference code, never a guessed new code',async t=>{
 const x=await fixture();t.after(x.f.close);const product=x.draft().snapshot.products[0];product.code='Renamed';await x.bridge.execute('AB','apply');assert.equal(x.bridge.productReferenceCode('AB',product),'A1');
 const inserted={...product,id:'locally-inserted',code:'LOCAL-NEW'};x.draft().snapshot.products.push(inserted);await x.bridge.execute('AB','apply');assert.equal(x.bridge.productReferenceCode('AB',inserted),null);assert.equal(x.posts().length,0);
});
void test('unknown Save with a changed generation preserves sent command and receipt-only lock',async t=>{
 const x=await fixture();t.after(x.f.close);x.draft().snapshot.products[0].name='Sent';await x.bridge.execute('AB','apply');x.mode('lost');const fetch=x.box.fetch;x.box.fetch=(url,opt)=>url.includes('operationId=')?Promise.resolve(Response.json({error:'OPERATION_NOT_FOUND'},{status:404})):fetch(url,opt);await assert.rejects(x.bridge.execute('AB','save'));
 const marker=[...x.disk];await x.f.mutateValues(v=>{const root=JSON.parse(v.masterDataControl);root.workflowScopes.AB.generation='different-generation';v.masterDataControl=JSON.stringify(root);});const next=await fixture({disk:x.disk,api:x.f});await assert.rejects(next.bridge.recover('AB'),/SAVE_READBACK_REQUIRED/);assert.deepEqual([...next.disk],marker);assert.equal(next.posts().length,0);
});
void test('a late successful Save ACK cannot replace a newer authoritative poll with an older projection',async t=>{
 const x=await fixture();t.after(x.f.close);x.draft().snapshot.products[0].name='Own saved name';await x.bridge.execute('AB','apply');
 let release,arrived;const gate=new Promise(r=>release=r),sent=new Promise(r=>arrived=r),fetch=x.box.fetch;
 x.box.fetch=async(url,options)=>{const response=await fetch(url,options);if(options.body&&JSON.parse(options.body).command?.action==='save'){arrived();await gate;}return response;};
 const task=x.bridge.execute('AB','save');await sent;
 const path=['products',{id:'product-a'},'specification'],peer=await x.f.request('POST',x.f.command('apply',{patches:[{op:'set',path,value:'New peer specification'}],guards:[{path,value:'10 mm'}],clientId:'late-peer-client'}));assert.equal(peer.status,200);
 await x.bridge.load('AB');const revision=x.control.workflowScopes.AB.revision;release();await task;
 assert.equal(x.control.workflowScopes.AB.revision,revision);assert.equal(x.draft().snapshot.products[0].specification,'New peer specification');assert.equal(x.draft().snapshot.products[0].name,'Own saved name');assert.equal(x.bridge.localDirty('AB'),false);
});
