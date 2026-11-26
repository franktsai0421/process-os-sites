import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createProcessMasterFixture} from './process-master-cloud-fixture.mjs';

const fixture=await createProcessMasterFixture();
let browser;
try {
  await fixture.adoptAuthoring();
  await fixture.mutateSyntheticValues(values=>{
    const root=JSON.parse(values.masterDataControl);
    for(const templates of Object.values(root.active.PROCESS)){
      const list=templates.find(row=>row.equipment).equipment;
      const first=list[0];
      while(list.length<91)list.push({...first,id:first.stageCode+'-extra-'+list.length,number:'QA-'+list.length});
    }
    root.versions.find(v=>v.scope==='PROCESS').snapshot=root.active.PROCESS;
    values.masterDataControl=JSON.stringify(root);
    values.processMasterData=JSON.stringify(root.active.PROCESS);
    const flow=JSON.parse(values.processAuthoringControl);
    for(const source of [flow.workflow.active.content,flow.workflow.working]){
      source.workspaces[0].stages['A-CUT'][0].machineIds.push('QA-historical');
    }
    values.processAuthoringControl=JSON.stringify(flow);
  });
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  const {origin}=fixture.url;
  const query='?system=quality&view=data&dataTab=process-master';
  async function login(user){
    const context=await browser.newContext({serviceWorkers:'block'});
    await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
    await context.addInitScript(()=>localStorage.setItem('processUILanguage','zh'));
    const page=await context.newPage();
    page.setDefaultTimeout(15000);
    await page.goto(origin+'/login'+query);
    await page.locator('#id').fill(user);
    await page.locator('#password').fill(fixture.password);
    await page.locator('.site-entry-submit').click();
    await page.locator('#equipment-panel').waitFor();
    return page;
  }
  const detail=(page,id)=>page.request.get(origin+'/api/master/references?scope=PROCESS&kind=equipment&view=detail&id='+encodeURIComponent(id));
  const workflow=async page=>{
    const response=await page.request.get(origin+'/api/master/workflow?scope=PROCESS');
    assert.equal(response.status(),200);
    return (await response.json()).control.workflow;
  };
  async function confirm(page){
    const dialog=page.locator('.vd-confirm[open]');
    await dialog.locator('textarea').fill('Synthetic equipment acceptance');
    await dialog.locator('button[type=submit]').click();
    await dialog.waitFor({state:'detached'});
  }
  const editor=await login('editor');
  await editor.locator('#process-master-new-draft').click();
  await editor.locator('#add-equipment').click();
  // Same display number as two existing machines, including a referenced machine in A.
  await editor.locator('[data-equipment-field=number]').fill('EQ-0');
  await editor.locator('[data-equipment-field=name]').fill('QA draft-only equipment');
  await editor.locator('[data-equipment-save]').click();
  const row=editor.locator('tr[data-equipment-id]').filter({hasText:'QA draft-only equipment'});
  const id=await row.getAttribute('data-equipment-id');
  const cell=p=>p.locator('[data-usage-id="'+id+'"]');
  await cell(editor).getByText('本機新增 · 尚未存稿').waitFor();
  assert.equal((await detail(editor,id)).status(),404);
  await row.locator('[data-equipment-edit]').last().click();
  await editor.locator('.equipment-approved-usage').getByText('本機新增 · 尚未存稿').waitFor();
  await editor.locator('[data-equipment-close]').first().click();
  await editor.locator('#save-master-data').click();
  await cell(editor).getByText('草稿新增 · 尚未核准').waitFor();
  const hasId=snapshot=>Object.values(snapshot).flat().some(t=>t.equipment?.some(e=>e.id===id));
  const saved=await workflow(editor);
  assert.ok(hasId(saved.saved.content));assert.ok(!hasId(saved.active.content));
  assert.equal((await (await detail(editor,id)).json()).draftOnly,true);
  const reopened=await login('editor');
  await cell(reopened).getByText('草稿新增 · 尚未核准').waitFor();
  await reopened.locator('#process-master-submit').click();await confirm(reopened);
  await reopened.waitForFunction(()=>!!MasterDataWorkflow.shared.flow('PROCESS').pendingId);
  const reviewer=await login('reviewer');
  const pending=await workflow(reviewer);
  assert.ok(hasId(pending.cases.find(c=>c.id===pending.pendingId).content));
  assert.ok(!hasId(pending.active.content));
  await reviewer.locator('#process-master-review').click();
  await reviewer.locator('[data-review-action=approve]').click();await confirm(reviewer);
  await reviewer.waitForFunction(()=>!MasterDataWorkflow.shared.flow('PROCESS').pendingId);
  const approved=await login('editor');
  await cell(approved).getByText('無',{exact:true}).waitFor();
  const positive=await (await detail(approved,'A-CUT-EQ-0')).json();
  assert.ok(positive.references.some(r=>r.status==='active'&&r.number==='A-01'));
  for(const other of [id,'C-CUT-EQ-0']){
    const reply=await (await detail(approved,other)).json();
    assert.equal(reply.total,0);assert.equal(reply.draftOnly,undefined);
  }
  assert.ok(hasId((await workflow(approved)).active.content));
  assert.equal((await detail(approved,'QA-unknown-id')).status(),404);
  const reader=await login('reader');
  assert.equal((await detail(reader,id)).status(),403);
  const denied=await reader.request.post(origin+'/api/master/references?scope=PROCESS&kind=equipment',{data:{ids:[id]}});
  assert.equal(denied.status(),403);
  await approved.locator('[data-missing-equipment] summary').click();
  await approved.locator('[data-missing-equipment] li').filter({hasText:'QA-historical'}).waitFor();
  console.log('PASS 182 existing machines, local Apply, explicit Save, fresh-context reload, Submit, independent Approve; same number stays distinct, approved reference preserved, missing history and 403/404 verified');
} finally {
  await browser?.close();
  await fixture.close();
}
