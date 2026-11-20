import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{fixture}=require('../scripts/test-fqc-feedback-races.cjs');
const fields=form=>[...form.querySelectorAll('input,textarea,select')].map(n=>({name:n.name||n.getAttribute('name')||'',id:n.id||'',type:n.getAttribute('type')||'',value:n.value,checked:n.checked}));
void test('FQC view shares all edit fields including rule, photo notes, equipment and product selection, without writes',async()=>{
 const f=await fixture();f.c.__fqcTest.openItemModal('item');const edit=f.doc.querySelector('.fqc-item-form'),expected=fields(edit);edit.querySelector('[data-close]').click();const before=JSON.stringify(f.library),journal=JSON.stringify([...f.records]),requests=f.requests.length;
 f.c.__fqcTest.openItemModal('item','',false,true);const form=f.doc.querySelector('.fqc-item-readonly');assert(form);assert.deepEqual(fields(form),expected);assert([...form.querySelectorAll('input,textarea,select')].every(n=>n.disabled));assert.equal(form.querySelectorAll('button[type="submit"]').length,0);assert.equal(form.querySelectorAll('[data-photo-remove]').length,0);assert.equal(form.querySelectorAll('[data-photo-note]')[0].value,'Preserve');
 f.c.__fqcTest.openItemModal('item','',false,true);assert.equal(f.doc.querySelectorAll('.fqc-modal-overlay').length,1);await form.onsubmit({preventDefault(){}});assert.equal(JSON.stringify(f.library),before);assert.equal(JSON.stringify([...f.records]),journal);assert.equal(f.requests.length,requests);
 f.rotate();form.querySelector('[data-close]').click();assert(!form.isConnected);assert.equal(f.requests.length,requests);
});
void test('FQC hides matrix controls without selections and keeps GET-only recovery for an unknown save',async()=>{
 const f=await fixture(),panel=()=>f.main.querySelector('.fqc-operation-status');
 assert(panel().hidden);assert(panel().querySelector('#fqc-matrix-discard').hidden);assert(panel().querySelector('#fqc-matrix-reconcile').hidden);
 const baseline=f.requests.filter(r=>r.method==='POST').length,cell=f.main.querySelector('[data-matrix-item]');
 cell.click();assert.equal(panel().hidden,false);assert.equal(panel().querySelector('#fqc-matrix-discard').hidden,false);
 await panel().querySelector('#fqc-matrix-discard').click();
 assert(panel().hidden);assert.equal(f.requests.filter(r=>r.method==='POST').length,baseline,'discarding a local checkbox never writes');
 f.c.__fqcTest.openItemModal('item');const form=f.doc.querySelector('.fqc-item-form');form.querySelector('[name="name"]').value='Synthetic edited';await form.onsubmit({preventDefault(){},target:form});f.setMode('lost');await f.c.__fqcTest.sharedAction('save').catch(()=>{});assert(f.c.__fqcTest.transport().hasUnknown());assert.equal(f.requests.filter(r=>r.method==='POST').length,1);assert(f.main.querySelector('#fqc-check-result'));assert.equal(f.library.workflow.saved,null);
});
void test('FQC read-only approved item can be viewed without editable draft or edit permission in both languages',async()=>{
 const base=await fixture(),control=structuredClone(base.library);delete control.workflow;control.activeVersionId='draft';control.versions[0].status='approved';
 for(const lang of ['zh','vi']){const f=await fixture({initialControl:structuredClone(control),identityUser:{id:'reader',name:'Synthetic reader',role:'staff'}});f.c.hasPermission=key=>key.endsWith('.view');f.doc.documentElement.lang=lang;const before=JSON.stringify(f.library),requests=f.requests.length;f.c.__fqcTest.openItemModal('item','',false,true);const form=f.doc.querySelector('.fqc-item-readonly');assert(form);assert(form.querySelector('[name="name"]').disabled);await form.onsubmit({preventDefault(){}});form.querySelector('[data-close]').click();assert.equal(JSON.stringify(f.library),before);assert.equal(f.requests.length,requests);}
});
