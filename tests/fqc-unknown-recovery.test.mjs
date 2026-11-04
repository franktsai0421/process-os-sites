import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),fixture=require('../scripts/fqc-apply-fixture.cjs'),{fixture:uiFixture}=require('../scripts/test-fqc-feedback-races.cjs');
for(const kind of ['error','item','batch'])void test(`legacy ${kind} input stays local until Save; rejected Begin preserves staged input`,async()=>{
 const ui=await uiFixture({legacy:true}),fetch=ui.c.fetch;let begins=0;const stored=[];
 ui.c.fetch=async(url,options={})=>{if(options.method==='POST'&&JSON.parse(options.body).action==='begin'){begins++;return Response.json({error:'FORBIDDEN'},{status:403});}return fetch(url,options);};
 ui.c.localStorage.setItem=(key,value)=>stored.push({key,value});
 if(kind==='error')ui.c.__fqcTest.openErrorModal('error');else if(kind==='item')ui.c.__fqcTest.openItemModal('item');else ui.c.__fqcTest.openExistingModal('SYN-P');
 const form=ui.doc.querySelector('.fqc-modal-form'),input=form.querySelector('[name="name"]');
 if(input)input.value='Retained local input';else form.querySelectorAll('input[type="checkbox"]').forEach(node=>node.checked=true);
 await form.onsubmit({preventDefault(){},target:form});assert.equal(begins,0);assert.equal(form.isConnected,false);assert.equal(stored.length,0,'local edits never write the legacy shared store');
 const staged=JSON.stringify(ui.library);await assert.rejects(ui.c.__fqcTest.sharedAction('save'),/FORBIDDEN/);assert.equal(begins,1);assert.equal(ui.c.__fqcTest.ui.lastError,'FORBIDDEN');assert.equal(JSON.stringify(ui.library),staged);assert.equal(stored.length,0);
});
void test('confirmed Save receipt clears failure without re-send; next local edit needs a new explicit Save',async()=>{
 const f=await fixture();let lost=false,hidden=false;
 try{
  const initial=await(await f.call('/api/fqc/workflow?caseMetadata=1')).json();
  const ui=await uiFixture({initialControl:initial.control,identityUser:{id:'editor',name:'Synthetic editor',role:'staff'},send:async(url,options)=>{
   if(hidden&&String(url).includes('operationId='))return Response.json({error:'OPERATION_NOT_FOUND'},{status:404});
   const response=await f.call(url,options);if(lost&&options.method==='POST'){lost=false;throw Error('SYNTHETIC_ACK_LOST');}return response;
  }});
  assert.equal(ui.c.sharedDraftErrorMessage('RESULT_UNKNOWN_CHECK_BEFORE_RETRY'),'RESULT_UNKNOWN_CHECK_BEFORE_RETRY');
  await ui.c.__fqcTest.sharedAction('begin');ui.c.__fqcTest.openErrorModal('error');
  let form=ui.doc.querySelector('.fqc-modal-form');form.querySelector('[name="name"]').value='Committed';
  const before=f.requests.filter(r=>r.method==='POST').length;await form.onsubmit({preventDefault(){},target:form});assert.equal(f.requests.filter(r=>r.method==='POST').length,before);
  lost=true;hidden=true;await assert.rejects(ui.c.__fqcTest.sharedAction('save'),/RESULT_UNKNOWN/);assert(ui.c.__fqcTest.transport().hasUnknown());assert(ui.c.__fqcTest.ui.lastError);
  const count=f.requests.filter(r=>r.method==='POST').length;await assert.rejects(ui.c.__fqcTest.sharedAction('save'),/UNKNOWN/);assert.equal(f.requests.filter(r=>r.method==='POST').length,count);hidden=false;
  await ui.main.querySelector('#fqc-check-result').click();for(let i=0;i<1000&&(ui.c.__fqcTest.transport().hasUnknown()||ui.c.__fqcTest.ui.saving);i++)await new Promise(resolve=>setTimeout(resolve,5));await new Promise(setImmediate);
  assert.equal(ui.c.__fqcTest.ui.lastError,null);assert.equal(ui.c.__fqcTest.transport().hasSyncFailures(),false);assert.equal(f.requests.filter(r=>r.method==='POST').length,count);assert.equal((await f.state()).workflow.saved.content.errors[0].name,'Committed');
  ui.c.__fqcTest.openErrorModal('error');form=ui.doc.querySelector('.fqc-modal-form');form.querySelector('[name="name"]').value='Edited after lookup';await form.onsubmit({preventDefault(){},target:form});assert.equal(f.requests.filter(r=>r.method==='POST').length,count);
  await ui.c.__fqcTest.sharedAction('save');assert.equal(f.requests.filter(r=>r.method==='POST').length,count+1);assert.equal((await f.state()).workflow.saved.content.errors[0].name,'Edited after lookup');
 }finally{f.close();}
});
