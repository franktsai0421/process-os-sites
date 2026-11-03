import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),fixture=require('../scripts/fqc-apply-fixture.cjs'),{fixture:uiFixture}=require('../scripts/test-fqc-feedback-races.cjs');
for(const kind of ['error','item','batch'])void test(`legacy ${kind} Begin rejection and cancel never publish form input into the page model`,async()=>{
 const ui=await uiFixture({legacy:true}),before=JSON.stringify(ui.library),fetch=ui.c.fetch;
 let begins=0;const stored=[];
 ui.c.fetch=async(url,options={})=>{if(options.method==='POST'&&JSON.parse(options.body).action==='begin'){begins++;return Response.json({error:'FORBIDDEN'},{status:403});}return fetch(url,options);};
 ui.c.localStorage.setItem=(key,value)=>stored.push({key,value});
 if(kind==='error')ui.c.__fqcTest.openErrorModal('error');else if(kind==='item')ui.c.__fqcTest.openItemModal('item');else ui.c.__fqcTest.openExistingModal('SYN-P');
 const form=ui.doc.querySelector('.fqc-modal-form'),input=form.querySelector('[name="name"]');
 if(input)input.value='Rejected input must remain form-only';else form.querySelectorAll('input[type="checkbox"]').forEach(node=>node.checked=true);
 await form.onsubmit({preventDefault(){},target:form});
 assert.equal(begins,1);assert.equal(ui.c.__fqcTest.ui.lastError,'FORBIDDEN');assert.equal(JSON.stringify(ui.library),before);
 if(input)assert.equal(input.value,'Rejected input must remain form-only');
 form.querySelector('[data-close]').click();assert.equal(JSON.stringify(ui.library),before);
 for(const {value}of stored)assert.equal(JSON.stringify(JSON.parse(value).libraries.fqc),before,'legacy rollback storage must also retain the unchanged model');
});
void test('confirmed receipt clears FQC failure state and retained error form sends a new guarded Apply',async()=>{
 const f=await fixture();let lost=false,hidden=false;
 try{
  const initial=await(await f.call('/api/fqc/workflow?caseMetadata=1')).json();
  const ui=await uiFixture({initialControl:initial.control,identityUser:{id:'editor',name:'Synthetic editor',role:'staff'},send:async(url,options)=>{
   if(hidden&&String(url).includes('operationId='))return Response.json({error:'OPERATION_NOT_FOUND'},{status:404});
   const response=await f.call(url,options);if(lost&&options.method==='POST'){lost=false;throw Error('SYNTHETIC_ACK_LOST');}return response;
  }});
  assert.equal(ui.c.sharedDraftErrorMessage('RESULT_UNKNOWN_CHECK_BEFORE_RETRY'),'RESULT_UNKNOWN_CHECK_BEFORE_RETRY','FQC-only guidance must not change another module shared display contract');
  await ui.c.__fqcTest.sharedAction('begin');ui.c.__fqcTest.openErrorModal('error');
  const form=ui.doc.querySelector('.fqc-modal-form'),input=form.querySelector('[name="name"]');input.value='Committed';lost=true;hidden=true;
  await form.onsubmit({preventDefault(){},target:form});assert(ui.c.__fqcTest.transport().hasUnknown());assert(ui.c.__fqcTest.ui.lastError);
  const count=f.requests.filter(r=>r.method==='POST').length;input.value='Retained after lookup';hidden=false;
  await ui.main.querySelector('#fqc-check-result').click();for(let i=0;i<1000&&(ui.c.__fqcTest.transport().hasUnknown()||ui.c.__fqcTest.ui.saving);i++)await new Promise(resolve=>setTimeout(resolve,5));await new Promise(setImmediate);assert.equal(ui.c.__fqcTest.ui.lastError,null,JSON.stringify({saving:ui.c.__fqcTest.ui.saving,unknown:ui.c.__fqcTest.transport().hasUnknown(),requests:ui.requests.map(r=>r.url),toasts:ui.toasts}));assert.equal(ui.c.__fqcTest.transport().hasSyncFailures(),false);assert.equal(input.value,'Retained after lookup');assert.equal(f.requests.filter(r=>r.method==='POST').length,count);
  await form.onsubmit({preventDefault(){},target:form});assert.equal(f.requests.filter(r=>r.method==='POST').length,count+1);assert.equal((await f.state()).workflow.working.errors[0].name,'Retained after lookup');
 }finally{f.close();}
});
