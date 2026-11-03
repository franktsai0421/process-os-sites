import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),fixture=require('../scripts/fqc-apply-fixture.cjs'),{fixture:uiFixture}=require('../scripts/test-fqc-feedback-races.cjs');
void test('confirmed receipt clears FQC failure state and retained error form sends a new guarded Apply',async()=>{
 const f=await fixture();let lost=false,hidden=false;
 try{
  const initial=await(await f.call('/api/fqc/workflow?caseMetadata=1')).json();
  const ui=await uiFixture({initialControl:initial.control,identityUser:{id:'editor',name:'Synthetic editor',role:'staff'},send:async(url,options)=>{
   if(hidden&&String(url).includes('operationId='))return Response.json({error:'OPERATION_NOT_FOUND'},{status:404});
   const response=await f.call(url,options);if(lost&&options.method==='POST'){lost=false;throw Error('SYNTHETIC_ACK_LOST');}return response;
  }});
  await ui.c.__fqcTest.sharedAction('begin');ui.c.__fqcTest.openErrorModal('error');
  const form=ui.doc.querySelector('.fqc-modal-form'),input=form.querySelector('[name="name"]');input.value='Committed';lost=true;hidden=true;
  await form.onsubmit({preventDefault(){},target:form});assert(ui.c.__fqcTest.transport().hasUnknown());assert(ui.c.__fqcTest.ui.lastError);
  const count=f.requests.filter(r=>r.method==='POST').length;input.value='Retained after lookup';hidden=false;
  await ui.main.querySelector('#fqc-check-result').click();for(let i=0;i<1000&&(ui.c.__fqcTest.transport().hasUnknown()||ui.c.__fqcTest.ui.saving);i++)await new Promise(resolve=>setTimeout(resolve,5));await new Promise(setImmediate);assert.equal(ui.c.__fqcTest.ui.lastError,null,JSON.stringify({saving:ui.c.__fqcTest.ui.saving,unknown:ui.c.__fqcTest.transport().hasUnknown(),requests:ui.requests.map(r=>r.url),toasts:ui.toasts}));assert.equal(ui.c.__fqcTest.transport().hasSyncFailures(),false);assert.equal(input.value,'Retained after lookup');assert.equal(f.requests.filter(r=>r.method==='POST').length,count);
  await form.onsubmit({preventDefault(){},target:form});assert.equal(f.requests.filter(r=>r.method==='POST').length,count+1);assert.equal((await f.state()).workflow.working.errors[0].name,'Retained after lookup');
 }finally{f.close();}
});
