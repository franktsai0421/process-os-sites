// Actual IQC master module and workflow route over synthetic SQLite and DOM.
import assert from 'node:assert/strict';
import test from 'node:test';
import { setup } from './iqc-save-choice-fixture.mjs';

async function present(read) {
  for (let i=0;i<20;i++){
    const node=read();
    if(node)return node;
    await new Promise(setImmediate);
  }
  assert.fail('expected IQC control did not render');
}

function confirm(dialog, reason, selfReview=false) {
  dialog.querySelector('textarea').value=reason;
  if(selfReview)dialog.querySelector('input[type="checkbox"]').checked=true;
  dialog.querySelector('form').onsubmit({preventDefault(){}});
}

for(const lang of ['zh','vi'])void test('IQC master '+lang+': exact pending case routes to the database module and failed approval stays visible',async t=>{
  let failApproval=false;
  const h=await setup({common:true,intercept:async(url,options,next)=>{
    if(failApproval&&options.method==='POST'&&JSON.parse(options.body)?.command?.action==='approve')throw Error('TEST_ONLY_NETWORK_FAILURE');
    return next();
  }});
  t.after(h.close);
  h.doc.documentElement.lang=lang;
  h.c.alert=()=>{};
  await h.stage({nameVi:'TEST ONLY IQC review routing',rules:[{id:'test-week',cadence:'time',kind:'week',value:''}]});
  await h.probe.post('save');
  const submitting=h.probe.post('submit');
  const submitDialog=await present(()=>h.doc.querySelector('dialog.vd-confirm'));
  confirm(submitDialog,'TEST ONLY master approval route');
  assert(await submitting);
  const pending=await h.state();
  const caseId=pending.workflow.pendingId;
  assert(caseId);
  assert.equal(pending.activeVersionId,'active');
  const beforeReview=h.posts().length;

  const quality=h.doc.createElement('section');
  quality.id='approval-panel-quality';
  quality.innerHTML=`<div id="review-fqc"></div><button data-review-jump="iqc">IQC</button><div id="review-iqc">${h.c.IQCMasterUI.reviewHTML()}</div>`;
  h.doc.body.append(quality);
  const destinations=[];
  h.c.ProcessDeliveryNavigation={approval:async key=>{
    destinations.push(key);
    return {status:'ready'};
  }};
  quality.querySelector('[data-review-jump="iqc"]').onclick=()=>destinations.push('iqc');
  const link=Array.from(h.main.querySelectorAll('button')).find(node=>node.textContent===(lang==='vi'?'Xem hồ sơ gửi duyệt':'查看送審案件'));
  assert(link);
  await link.click();
  assert.deepEqual(destinations,['quality','iqc']);
  assert.equal(h.posts().length,beforeReview);

  await h.c.IQCMasterUI.bindReview(quality);
  assert.equal(quality.querySelector('#review-fqc [data-iqc-review]'),null);
  const row=quality.querySelector('#review-iqc .quality-review-pending-list [data-iqc-review]');
  assert.equal(row.dataset.iqcReview,caseId);
  await row.click();
  failApproval=true;
  const approve=quality.querySelector('#iqc-review-approve');
  approve.click();
  const confirmDialog=await present(()=>h.doc.querySelector('dialog.vd-confirm'));
  const version=quality.querySelector('#review-iqc .iqc-review-detail h4').textContent;
  assert(confirmDialog.textContent.includes(caseId));
  assert(confirmDialog.textContent.includes(version.match(/IQC V\d+/)[0]));
  approve.click();
  assert.equal(h.doc.querySelectorAll('dialog.vd-confirm').length,1);
  confirm(confirmDialog,'TEST ONLY network failure',true);
  await assert.rejects(h.probe.flight());
  await present(()=>{
    const node=quality.querySelector('[data-iqc-review-operation]');
    return /不要重複送出|không gửi lại/.test(node?.textContent||'')?node:null;
  });
  const attempts=()=>h.posts().filter(req=>JSON.parse(req.body)?.command?.action==='approve');
  assert.equal(attempts().length,1);
  assert.equal(JSON.parse(attempts()[0].body).command.caseId,caseId);
  assert.equal((await h.state()).workflow.pendingId,caseId);
  assert.equal((await h.state()).activeVersionId,'active');

  approve.click();
  await assert.rejects(h.probe.flight());
  await present(()=>/不要重複送出|không gửi lại/.test(quality.querySelector('[data-iqc-review-operation]')?.textContent||''));
  assert.equal(attempts().length,1);
  assert.equal(h.doc.querySelectorAll('dialog.vd-confirm').length,0);
});
