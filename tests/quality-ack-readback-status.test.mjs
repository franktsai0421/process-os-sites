import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {setup as iqcFixture} from './iqc-save-choice-fixture.mjs';
const require=createRequire(import.meta.url),{fixture:equipmentFixture}=require('../scripts/equipment-atomic-fixture.cjs'),gate=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
for(const fail of [false,true])void test(`equipment Begin qualified receipt with ${fail?'failed':'delayed'} readback is distinct from unknown and only queries original receipt`,async()=>{
 const h=await equipmentFixture();let release;try{
  await h.mutate(values=>{const c=JSON.parse(values.routineEquipmentControl);delete c.workflow;c.versions=c.versions.filter(v=>v.status!=='draft');values.routineEquipmentControl=JSON.stringify(c);});
  const f=await h.connect(),send=f.c.fetch,held=gate(),started=gate();release=held.resolve;let ack=false,block=true;
  f.c.fetch=async(url,options={})=>{const body=options.body&&JSON.parse(options.body);if(block&&ack&&(!options.method||options.method==='GET')&&!String(url).includes('operationId=')){started.resolve();await held.promise;if(fail)throw Error('READBACK_DOWN');}const result=await send(url,options);if(body?.action==='begin-v1')ack=true;return result;};
  const before=h.requests.filter(r=>r.method==='POST').length,pending=f.test.writeShared('begin');await started.promise;f.test.render();assert.match(f.host.textContent,/原操作收據已確認/);assert(!f.host.textContent.includes('結果未知／同步失敗'));
  await f.test.writeShared('begin');assert.equal(h.requests.filter(r=>r.method==='POST').length,before+1);held.resolve();const result=await pending;
  if(fail){assert.equal(result,null);assert.match(f.host.textContent,/原操作收據已確認/);const button=f.host.querySelector('#routine-begin-recheck');assert(button);assert.equal(button.disabled,false);block=false;await f.test.enterExistingDraft();assert.equal(h.requests.filter(r=>r.method==='POST').length,before+1);assert(f.test.model.workflow?.generation);assert(!f.host.querySelector('#routine-begin-recheck'));}
  else {assert(result);assert(f.test.model.workflow?.generation);assert(!f.host.querySelector('#routine-begin-recheck'));assert(!f.c.sharedDraftAccountState().queued);}
 }finally{release?.();h.close();}
});
for(const fail of [false,true])void test(`IQC actual Withdraw original receipt with ${fail?'failed':'delayed'} readback preserves saved content and restores same-page draft without another POST`,async()=>{
 let ack=false,block=false,hide=fail;const held=gate(),started=gate();let h;
 try{
  h=await iqcFixture({common:true,intercept:async(url,options,send)=>{const body=options.body&&JSON.parse(options.body);if(block&&ack&&(!options.method||options.method==='GET')&&!url.includes('operationId=')){started.resolve();await held.promise;if(hide)throw Error('READBACK_DOWN');}const result=await send();if(body?.command?.action==='withdraw')ack=true;return result;}});
  h.c.alert=()=>{};h.c.VersionDraftUI.confirmSubmit=async()=> 'Synthetic reason';h.c.VersionDraftUI.confirmReview=async()=>({reason:'Synthetic reason',selfReviewConfirmed:false});
  await h.stage({nameVi:'Persisted before withdrawal'});await h.probe.post('save');await h.probe.post('submit');const before=await h.state(),count=h.posts().length;block=true;
  const pending=h.probe.post('withdraw');const settled=pending.then(value=>({value}),error=>({error}));await started.promise;h.probe.render();assert(!h.main.textContent.includes('結果未知／同步失敗'));assert.equal(h.probe.transport().confirmedOperation().action,'withdraw');assert.equal((await h.state()).workflow.pendingId,null);
  held.resolve();const result=await settled;
  if(fail){assert(result.error);assert.match(h.main.textContent,/原操作收據已確認/);hide=false;block=false;await h.probe.checkOperation();}
  else {assert.equal(result.error,undefined,result.error?.message);assert(result.value);}
  const after=await h.state();assert.equal(h.posts().length,count+1);assert.deepEqual(after.workflow.saved.content,before.workflow.saved.content);assert.equal(after.workflow.pendingId,null);assert.equal(h.probe.get().control.workflow.pendingId,null);assert.equal(h.probe.get().ui.busy,false);assert.equal(h.probe.transport().hasUnknown(),false);assert(h.main.querySelector('#iqc-save'));assert(!h.main.querySelector('#iqc-withdraw'));
 }finally{held.resolve();h?.close();}
});
void test('HTTP 200 with a mismatched Begin receipt never reports confirmed; original receipt recovery sends no additional Begin',async()=>{
 const h=await equipmentFixture();try{await h.mutate(values=>{const c=JSON.parse(values.routineEquipmentControl);delete c.workflow;c.versions=c.versions.filter(v=>v.status!=='draft');values.routineEquipmentControl=JSON.stringify(c);});const f=await h.connect(),send=f.c.fetch;let tamper=true;
 f.c.fetch=async(url,options={})=>{const response=await send(url,options);if(tamper&&options.method==='POST'&&JSON.parse(options.body).action==='begin-v1'){const body=await response.json();body.receipt.operationId='00000000-0000-4000-8000-000000000000';return Response.json(body);}return response;};
 const before=h.requests.filter(r=>r.method==='POST').length;assert.equal(await f.test.writeShared('begin'),null);assert(!f.host.textContent.includes('原操作收據已確認'));assert(f.host.querySelector('#routine-begin-recheck'));tamper=false;await f.test.enterExistingDraft();assert.equal(h.requests.filter(r=>r.method==='POST').length,before+1);assert(f.test.model.workflow?.generation);
 }finally{h.close();}
});
