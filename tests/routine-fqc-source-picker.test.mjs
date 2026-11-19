import test from 'node:test';
import assert from 'node:assert/strict';
import {manualUI,posted} from './fixtures/routine-fqc-manual-ui.mjs';
function setup(){
 const f=manualUI(),d=f.api.getData();
 const a={id:'a',name:'Same name',code:'A1',line:'A',category:'Cat1',enabled:true,cadence:'time',frequency:'monthly',productCodes:['P1','P2']};
 const b={...a,id:'b',code:'B1',line:'B',category:'Cat2',productCodes:['P2']};
 d.catalog.items=[a,b,{...a,id:'batch',cadence:'batch'},{...a,id:'off',enabled:false},{...a,id:'unknown',frequency:'custom'}];
 d.sources=[a,b].map(i=>({...i,products:i.productCodes.map(code=>({code,name:code})),version:'1',description:'',errorCode:''}));
 d.control.jobs=d.sources.map(i=>({id:i.id+'@period',itemId:i.id,source:i,start:'2026-10-01',end:'2026-10-31',planId:null,completion:null}));
 f.api.s.tab='sources';f.paint();return f;
}
void test('native source tab filters categories and multi-product scope, excludes batch, keeps distinct IDs',()=>{
 const f=setup();assert(f.root.querySelector('[data-tab="sources"]'));
 assert.equal(f.root.querySelectorAll('[data-job]').length,2);
 assert(!f.root.textContent.includes('batch'));
 assert(f.root.textContent.includes('已停用'));assert(f.root.textContent.includes('頻率待確認'));
 const product=f.root.querySelector('[data-source-filter="sourceProduct"]');product.value='P2';product.onchange();assert.equal(f.root.querySelectorAll('[data-job]').length,2);
 const line=f.root.querySelector('[data-source-filter="sourceLine"]');line.value='B';line.onchange();assert.equal(f.root.querySelectorAll('[data-job]').length,1);
 assert.equal(f.root.querySelector('[data-job]').dataset.job,'b@period');assert.equal(posted(f).length,0);
});
void test('repeated product selections reuse existing job IDs and join original plan selection without writes',async()=>{
 const f=setup();let box=f.root.querySelector('[data-job="a@period"]');box.checked=true;box.onchange();
 box=f.root.querySelector('[data-job="a@period"]');box.checked=true;box.onchange();assert.equal(f.api.s.checked.size,1);
 const button=f.button('add-source-jobs');await button.click();assert.equal(f.api.s.tab,'jobs');assert.deepEqual([...f.api.s.checked],['a@period']);assert.equal(f.api.getData().control.jobs.length,2);assert.equal(posted(f).length,0);
 assert.equal(f.button('create-plan').disabled,false);await button.onclick();assert.equal(posted(f).length,0);
});
void test('assigned or completed jobs and revoked editing cannot be selected for addition',()=>{
 const f=setup(),d=f.api.getData();d.control.jobs[0].planId='existing';d.control.jobs[1].completion={};f.paint();assert.equal(f.root.querySelectorAll('[data-job]').length,0);
 d.control.jobs[0].planId=null;d.permissions.edit=false;f.paint();assert(f.root.querySelector('[data-job]').disabled);assert(f.button('add-source-jobs').disabled);
 f.document.documentElement.lang='vi';f.paint();assert(f.root.textContent.includes('Hạng mục cần kiểm tra'));
});

void test('legacy FQC keeps explicit Update and schedule settings for its established entry',()=>{
 const f=setup();assert(f.button('update-current'));assert(f.button('settings'));
 f.api.s.tab='jobs';f.paint();assert(f.button('update-current'));assert(f.button('settings'));
 f.api.s.module='1';f.paint();assert(f.button('settings'));assert.equal(f.button('update-current'),null);
});
