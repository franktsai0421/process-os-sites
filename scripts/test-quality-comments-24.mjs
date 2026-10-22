import {createRequire as __esmFactory} from 'node:module';
import {fileURLToPath as __esmPath} from 'node:url';
const __esmOldFilename=__esmPath(new URL("./test-quality-comments-24.cjs",import.meta.url));
const __esmRequire=__esmFactory(__esmOldFilename);
const isolatedTestTarget_20261010=__esmRequire('./require-isolated-test-target.cjs')();
/* oxlint-disable typescript/no-require-imports -- Isolated CommonJS browser/Workers fixture. */
// Uses actual Local source reads, but every business write goes to in-memory D1/R2.
const assert=__esmRequire('node:assert/strict'),fs=__esmRequire('node:fs'),path=__esmRequire('node:path');
const {DatabaseSync}=__esmRequire('node:sqlite');
const {randomUUID,createHash}=__esmRequire('node:crypto');
const {chromium}=__esmRequire('playwright');
const harness=__esmRequire('./ipqc-ab-import-harness.cjs');
const base=isolatedTestTarget_20261010, output=path.resolve('.wrangler/local-only/quality-comments-24');
const clone=value=>JSON.parse(JSON.stringify(value));
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jM1sAAAAASUVORK5CYII=','base64');
const digest=value=>createHash('sha256').update(value).digest('hex');
async function run(browser,width,source) {
  const db=new DatabaseSync(':memory:');
  for(const name of fs.readdirSync('drizzle').filter(n=>n.endsWith('.sql')).sort())db.exec(fs.readFileSync(path.join('drizzle',name),'utf8'));
  const values=clone(source.values),objects=new Map();
  // Make editable test copies only. The actual Local pending/active records are untouched.
  for(const key of ['iqcMasterControl','ipqcCMasterControl']) {
    const control=JSON.parse(values[key]);
    const current=control.versions.find(v=>['draft','pending'].includes(v.status));
    if(current)current.status='draft';
    else {const active=control.versions.find(v=>v.id===control.activeVersionId);control.versions.push({...clone(active),id:'test-draft-'+key,status:'draft',revision:1,baseVersionId:active.id,number:active.number+1,history:[]});}
    values[key]=JSON.stringify(control);
  }
  const fqc=JSON.parse(values.qualityMasterControl);
  for(const v of fqc.libraries.fqc.versions)if(v.status==='pending')v.status='draft';
  if(!fqc.libraries.fqc.versions.some(v=>v.status==='draft')){
    const active=fqc.libraries.fqc.versions.find(v=>v.id===fqc.libraries.fqc.activeVersionId);
    fqc.libraries.fqc.versions.push({...clone(active),id:'test-fqc-draft',status:'draft',revision:1,history:[]});
  }
  values.qualityMasterControl=JSON.stringify(fqc);
  const env={PROCESS_SESSION_SECRET:randomUUID(),DEMO_LOGIN_ENABLED:'true',DB:{prepare(sql){let args=[];return {bind(...v){args=v;return this;},async first(){return db.prepare(sql).get(...args)||null;},async all(){return {results:db.prepare(sql).all(...args)};},async run(){return {meta:{changes:Number(db.prepare(sql).run(...args).changes)}};}};}},STATE_ARCHIVE:{async put(k,v,options){objects.set(k,{value:v,options});},async head(k){return objects.has(k)?{}:null;},async get(k){const row=objects.get(k);if(!row)return null;const bytes=Buffer.from(row.value);return {body:bytes,text:async()=>bytes.toString(),httpMetadata:row.options?.httpMetadata};}}};
  db.prepare('INSERT INTO shared_state(id,revision,"values",updated_at) VALUES(1,1,?,?)').run(JSON.stringify(values),'fixture');
  const load=harness(env),core=load('lib/process-state.ts');
  const cookie='process_demo='+await core.demoSession(new Request(base),'demo-admin',true);
  const handlers=Object.fromEntries(['iqc','ipqc-ab','ipqc-c','routine-equipment','quality-equipment-replacement'].map(name=>[name,load(`app/api/${name}/route.ts`)]));
  const workflow=load('app/api/ipqc-c/workflow/route.ts');
  const iqcWorkflow=load('app/api/iqc/workflow/route.ts');
  const abWorkflow=load('app/api/ipqc-ab/workflow/route.ts');
  const fqcWorkflow=load('app/api/fqc/workflow/route.ts'),equipmentWorkflow=load('app/api/routine-equipment/workflow/route.ts');
  const activeBefore={iqc:JSON.parse(values.iqcMasterControl).activeVersionId,c:JSON.parse(values.ipqcCMasterControl).activeVersionId,ab:Object.fromEntries(Object.entries(JSON.parse(values.ipqcABMasterControl).scopes).map(([k,s])=>[k,s.activeVersionId]))};
  const context=await browser.newContext({viewport:{width,height:844},isMobile:width===390,hasTouch:width===390});
  // This historical regression deliberately exercises the retained Chinese preference.
  // The V3 workflow browser suite separately exercises Vietnamese-first rendering.
  await context.addInitScript(()=>localStorage.setItem('processUILanguage','zh'));
  const page=await context.newPage(),errors=[],writes=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/process/');await page.locator('[data-quick-login="admin"]').click();await page.locator('#main-nav').waitFor();
  await page.route('**/api/**',async route=>{
    const original=route.request(),url=new URL(original.url()),method=original.method(),name=url.pathname.split('/')[2];
    if(url.pathname==='/api/shared-state'){
      let state=await core.readState();
      if(method==='POST'){
        const body=original.postDataJSON();
        if(body.baseRevision!==state.revision)return route.fulfill({status:409,json:{error:'fixture revision conflict'}});
        const next={...state.values,...body.updates};
        db.prepare('UPDATE shared_state SET revision=revision+1,"values"=? WHERE id=1').run(await core.encodeValues(next));
        writes.push('shared-state');state=await core.readState();
      }
      return route.fulfill({status:200,json:{...source,revision:state.revision,values:state.values}});
    }
    if(handlers[name] && url.pathname===`/api/${name}`){
      const request=new Request(url,{method,headers:{Cookie:cookie,Origin:base,'Content-Type':'application/json'},...(method!=='GET'?{body:original.postData()}: {})});
      const result=await handlers[name][method](request);
      if(method==='POST')writes.push(name+':'+original.postDataJSON().action+':'+result.status);
      return route.fulfill({status:result.status,contentType:'application/json',body:await result.text()});
    }
    if(['/api/ipqc-c/workflow','/api/iqc/workflow','/api/ipqc-ab/workflow','/api/fqc/workflow','/api/routine-equipment/workflow'].includes(url.pathname)){
      const result=await (name==='fqc'?fqcWorkflow:name==='routine-equipment'?equipmentWorkflow:name==='ipqc-ab'?abWorkflow:name==='iqc'?iqcWorkflow:workflow)[method](new Request(url,{method,headers:{Cookie:cookie,Origin:base,'Content-Type':'application/json'},...(method!=='GET'?{body:original.postData()}:{})}));
      if(method==='POST')writes.push(name+'-workflow:'+result.status);
      return route.fulfill({status:result.status,contentType:'application/json',body:await result.text()});
    }
    if(['iqc','ipqc-ab','ipqc-c'].includes(name)&&url.pathname.endsWith('/photo')){
      if(method==='PUT'){
        const bytes=original.postDataBuffer(),id=digest(bytes);objects.set(`${name}/photos/${id}`,{value:bytes});
        writes.push(name+':photo');return route.fulfill({status:200,json:{id,url:`/api/${name}/photo?id=${id}`}});
      }
      const row=objects.get(`${name}/photos/${url.searchParams.get('id')}`);
      if(row)return route.fulfill({status:200,contentType:'image/png',body:row.value});
    }
    // Reject any unforeseen business mutation instead of leaking it to Local.
    if(!['GET','HEAD'].includes(method))throw Error('Unmocked write: '+url.pathname);
    return route.continue();
  });
  const goto=async tab=>{await page.goto(`${base}/process/?system=quality&view=data&dataTab=quality-${tab}`);await page.locator('#data-content').waitFor();};
  const shot=async label=>{await page.screenshot({path:path.join(output,`${label}-${width}.png`)});};
  const layout=async selector=>{
    assert.ok(await page.locator(selector).first().evaluate(n=>n.scrollWidth<=n.clientWidth+1),selector+' overflow');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'page overflow');
  };
  const stateControl=async key=>JSON.parse((await core.readState()).values[key]);
  try {
    for(const tab of ['AB','C','line-admin','process-master','users','backups']) {
      await page.goto(`${base}/process/?system=process&view=data&dataTab=${tab}`);
      await page.locator('#data-content').waitFor();
      assert.equal(await page.locator('#master-import,#master-export,#master-line-import,#master-line-export,#import-process-master,#export-process-master,#backup-tab,#open-user-backups').count(),0,'retired daily entry: '+tab);
      assert.notEqual(await page.locator('#data-content').getAttribute('data-active-tab'),'backups');
    }
    await page.goto(`${base}/process/?system=process&view=data&dataTab=bom`);await page.locator('#bom-excel-import').waitFor();assert.equal(await page.locator('#bom-excel-all').count(),1);
    await goto('fqc');await page.locator('.matrix-cell:not(:disabled)').first().waitFor();
    const cell=page.locator('.matrix-cell:not(:disabled)').first(),itemId=await cell.getAttribute('data-matrix-item'),code=await cell.getAttribute('data-matrix-product'),before=await cell.getAttribute('aria-pressed');
    await cell.click();await page.waitForFunction(()=>!document.querySelector('#fqc-save')?.disabled);
    await page.waitForFunction(({id,code,before})=>document.querySelector(`[data-matrix-item="${id}"][data-matrix-product="${code}"]`)?.getAttribute('aria-pressed')!==before,{id:itemId,code,before});
    assert.equal(await page.locator('.fqc-item-form').count(),0);
    await page.reload();await page.locator(`[data-matrix-item="${itemId}"][data-matrix-product="${code}"]`).waitFor();
    assert.notEqual(await page.locator(`[data-matrix-item="${itemId}"][data-matrix-product="${code}"]`).getAttribute('aria-pressed'),before);
    await page.locator(`[data-edit-item="${itemId}"]`).click();
    const checkbox=page.locator(`.fqc-item-form input[name="product"][value="${code}"]`);
    assert.equal(await checkbox.isChecked(),before!=='true');
    await shot('fqc-matrix-editor');await page.keyboard.press('Escape');

    await goto('iqc');await page.locator('#iqc-add-part').waitFor();
    assert.equal(await page.locator('#iqc-preview,#iqc-import').count(),0);
    const list=page.locator('.iqc-part-list');await list.evaluate(n=>n.scrollTop=300);const scroll=await list.evaluate(n=>n.scrollTop);
    await page.locator('.iqc-part').nth(5).dispatchEvent('click');assert.equal(await list.evaluate(n=>n.scrollTop),scroll);
    for(const [kind,id] of [['suppliers','iqc-manage-suppliers'],['categories','iqc-manage-categories']]) {
      await page.locator('#'+id).click();await page.locator('#iqc-list-new').fill('Test '+kind);await page.locator('#iqc-list-add').click();
      const row=page.locator('[data-row-id]').filter({hasText:'Test '+kind});await row.locator('[data-row-edit]').click();await row.locator('[data-row-name]').fill('Test '+kind+' edited');
      await page.locator('#iqc-list-save').click();await page.locator('#iqc-managed-rows').waitFor({state:'detached'});
      assert.ok((await stateControl('iqcMasterControl')).versions.find(v=>v.status==='draft').snapshot[kind].some(r=>r.nameVi==='Test '+kind+' edited'));
      await page.locator('#'+id).click();let prompts=0;const confirm=async dialog=>{prompts++;await dialog.accept();};page.on('dialog',confirm);
      await page.locator('[data-row-id]').filter({hasText:'Test '+kind+' edited'}).locator('[data-row-remove]').click();page.off('dialog',confirm);assert.equal(prompts,2);
      await page.locator('#iqc-list-save').click();await page.locator('#iqc-managed-rows').waitFor({state:'detached'});
    }
    await page.locator('#iqc-add-part').click();const form=page.locator('#iqc-part-form');
    await form.locator('[name="code"]').fill('TEST24-'+width);await form.locator('[name="nameVi"]').fill('Linh kiện thử');
    await form.locator('[name="categoryId"]').selectOption({index:1});await page.locator('#iqc-part-add-supplier').click();await page.locator('[data-supplier-index="0"]').selectOption({index:1});
    await page.locator('#iqc-part-add-supplier').click();await page.locator('[data-supplier-index="1"]').selectOption({index:2});
    await page.locator('#iqc-part-file').setInputFiles({name:'part.png',mimeType:'image/png',buffer:png});await page.locator('#iqc-part-photos img').waitFor();
    await form.locator('[type="submit"]').click();await form.waitFor({state:'detached'});await page.reload();await page.locator(`[data-select-part="TEST24-${width}"]`).click();
    await page.locator('#iqc-add-error').click();assert.match(await page.locator('#iqc-error-form input[readonly]').inputValue(),new RegExp(`TEST24-${width}-IQC-L1`));
    await page.locator('#iqc-error-form [name="nameVi"]').fill('Lỗi thử');await page.locator('#iqc-error-form [type="submit"]').click();await page.locator('#iqc-error-form').waitFor({state:'detached'});
    await page.locator('[data-add-item]').click();assert.match(await page.locator('.iqc-parent-error').innerText(),/Lỗi thử/);
    await page.locator('#iqc-item-form [name="nameVi"]').fill('Kiểm tra thử');await page.locator('#iqc-item-form [name="methodVi"]').fill('Quan sát');await page.locator('[data-rule-value]').fill('0.25');
    await page.locator('#iqc-rule-add').click();await page.locator('[data-rule-value]').last().fill('0.05');
    await page.locator('.iqc-item-form-body').evaluate(n=>n.scrollTop=n.scrollHeight);await layout('.iqc-item-form-body');
    assert.ok(await page.locator('#iqc-item-form [type="submit"]').isVisible());await shot('iqc-rules');
    await page.locator('#iqc-item-form [type="submit"]').click();await page.locator('#iqc-item-form').waitFor({state:'detached'});

    await goto('ipqc-ab');await page.locator('[data-ab-edit-item]').first().click();
    await layout('.ipqcab-dialog-body');await page.locator('.ipqcab-dialog-body').evaluate(n=>n.scrollTop=220);
    const abScroll=await page.locator('.ipqcab-dialog-body').evaluate(n=>n.scrollTop);
    await page.locator('#ab-add-rule').dispatchEvent('click');assert.equal(await page.locator('.ipqcab-dialog-body').evaluate(n=>n.scrollTop),abScroll);
    await page.locator('#ab-select-equipment').click();
    for(const id of ['category','subcategory','group'])await page.locator('#ab-equipment-'+id).selectOption({index:1});
    const choice=page.locator('[data-ab-choose-equipment]:not(:disabled):visible').first();await choice.waitFor();const eqId=await choice.getAttribute('data-ab-choose-equipment');await choice.click();
    assert.ok(await page.locator('.ipqcab-selected-equipment').isVisible());assert.equal(await page.locator('[name="ab-mode"][value="equipment"]').isChecked(),true);
    await page.locator('.ipqcab-product-editor').scrollIntoViewIfNeeded();await shot('ipqc-ab-products');await page.locator('#ab-apply').click();await page.locator('.ipqcab-overlay').waitFor({state:'detached'});
    await page.reload();await page.locator('[data-ab-edit-item]').first().click();assert.ok(await page.locator('.ipqcab-selected-equipment').isVisible());
    await page.locator('[data-ab-close]').first().click();
    const abRefs=await page.evaluate(id=>window.RoutineEquipmentUI.getEquipmentReferences(id,{refresh:true}),eqId);assert.ok(abRefs.ipqcAB.draft.length>0);

    await goto('ipqc-c');await page.locator('[data-ipqcc-add="item"]').click();
    assert.equal((await page.locator('#ipqcc-editor > header h3').textContent()).replace(/\s/g,''),'新增檢查項目','explicit Chinese preference is retained under V3');
    const editor=page.locator('#ipqcc-editor');assert.equal(await editor.locator('[name="reason"],[name="tool"],[name="method"],[name="notApplicable"],[name="notApplicableReason"]').count(),0);
    assert.ok(await editor.evaluate(n=>n.querySelector('.ipqcc-checks').compareDocumentPosition(n.querySelector('[name="standard"]'))&Node.DOCUMENT_POSITION_FOLLOWING));
    assert.ok(await editor.evaluate(n=>n.querySelector('[name="description"]').compareDocumentPosition(n.querySelector('.ipqcc-photo-editor'))&Node.DOCUMENT_POSITION_FOLLOWING));
    await editor.locator('[name="standard"]').fill('12.00 ± 0.01 mm');await editor.locator('[name="description"]').fill('Đo bằng dụng cụ');await editor.locator('[name="aqlValue"]').fill('0.25');
    await page.locator('#ipqcc-photo-input').setInputFiles([{name:'check.png',mimeType:'image/png',buffer:png}]);await page.locator('.ipqcc-photo-row').waitFor();
    await editor.locator('[name="inspectionMode"][value="equipment"]').check();await page.locator('#ipqcc-equipment-dialog').waitFor();
    for(const field of ['category','subcategory','group'])await page.locator(`[data-ipqcc-filter="${field}"]`).selectOption({index:1});
    const cEq=page.locator('[data-ipqcc-equipment]:not(:disabled):visible').first();const cEqId=await cEq.getAttribute('data-ipqcc-equipment');await cEq.click();
    assert.ok(await editor.locator('.ipqcc-selected-equipment').isVisible());await layout('#ipqcc-editor .ipqcc-dialog-body');await shot('ipqc-c-editor');await editor.locator('.ipqcc-dialog-body').evaluate(n=>n.scrollTop=0);await shot('ipqc-c-context');
    await editor.locator('[type="submit"]').click();await editor.waitFor({state:'detached'});
    assert.ok(writes.includes('ipqc-c-workflow:200'),JSON.stringify(writes));await page.reload();await page.locator('[data-ipqcc-edit-item]').last().click();
    assert.equal(await page.locator('#ipqcc-editor [name="standard"]').inputValue(),'12.00 ± 0.01 mm');assert.equal(await page.locator('.ipqcc-photo-row').count(),1);assert.ok(await page.locator('#ipqcc-editor .ipqcc-selected-equipment').isVisible());
    await page.locator('#ipqcc-cancel').click();
    const cRefs=await page.evaluate(id=>window.RoutineEquipmentUI.getEquipmentReferences(id,{refresh:true}),cEqId);assert.ok(cRefs.ipqcC.draft.length>0);
    await page.locator('[data-ipqcc-edit-error]').first().click();assert.equal(await page.locator('#ipqcc-editor [name="reason"]').count(),0);await layout('#ipqcc-editor .ipqcc-dialog-body');await shot('ipqc-c-error');await page.locator('#ipqcc-cancel').click();
    // Follow-up comments 1-6: display, scoped replacement and line-first status.
    const cResponse=await handlers['ipqc-c'].GET(new Request(base+'/api/ipqc-c',{headers:{Cookie:cookie}}));
    const cCatalog=await cResponse.json();
    assert.ok(cCatalog.equipmentGroups.every(group=>! /^(獨立|候選)[／/]/.test(group.name)));
    const routine=await stateControl('routineEquipmentControl'),effective=routine.versions.find(v=>v.id===routine.activeVersionId);
    for(const eq of cCatalog.equipment)assert.equal(eq.available,effective.equipment.find(row=>row.id===eq.id).enabled!==false);
    assert.ok(await page.locator('.ipqcc-equipment-preview').last().isVisible());
    if(cCatalog.equipment.find(row=>row.id===cEqId)?.photoId)assert.equal(await page.locator('.ipqcc-equipment-preview').last().locator('img').count(),1);
    await page.locator('.ipqcc-equipment-preview').last().scrollIntoViewIfNeeded();
    await page.waitForFunction(()=>[...document.querySelectorAll('.ipqcc-equipment-preview img')].every(img=>img.complete&&img.naturalWidth>0));
    await layout('.ipqcc-card:last-child');await shot('followup-c-thumbnail');
    await goto('ipqc-ab');await page.locator('.ipqcab-equipment-preview').first().waitFor();
    await layout('.ipqcab-item');await page.locator('.ipqcab-equipment-preview').first().scrollIntoViewIfNeeded();
    await page.waitForFunction(()=>[...document.querySelectorAll('.ipqcab-equipment-preview img')].every(img=>img.complete&&img.naturalWidth>0));
    await shot('followup-ab-card');
    const equipmentLink=await page.locator('.ipqcab-equipment-preview').first().getAttribute('href');
    const sourceEq=new URL(base+equipmentLink).searchParams.get('equipmentId');
    const available=effective.equipment.filter(row=>row.enabled!==false && row.id!==sourceEq);
    assert.ok(available.length>=2);const targetEq=available[0],manualEq=available[1];
    // Simulate a manual draft choice only inside this disposable D1, so no extra
    // override checkbox is needed, but its replacement must be explicitly confirmed.
    const fixture=await core.readState(),iqcFixture=JSON.parse(fixture.values.iqcMasterControl);
    const iqcActive=iqcFixture.versions.find(v=>v.id===iqcFixture.activeVersionId);
    const iqcDraft=iqcFixture.versions.find(v=>v.status==='draft');
    const activeItem=iqcActive.snapshot.items.find(item=>!item.isDeleted&&!item.deleted);
    const draftItem=iqcDraft.snapshot.items.find(item=>item.id===activeItem.id);
    activeItem.equipmentId=sourceEq;draftItem.equipmentId=manualEq.id;draftItem.inspectionMode='equipment';
    if(iqcFixture.workflow){const row=iqcFixture.workflow.working.items.find(item=>item.id===activeItem.id);row.equipmentId=manualEq.id;row.inspectionMode='equipment';row.equipmentSnapshot={id:manualEq.id};}
    fixture.values.iqcMasterControl=JSON.stringify(iqcFixture);
    db.prepare('UPDATE shared_state SET revision=revision+1,"values"=? WHERE id=1').run(await core.encodeValues(fixture.values));
    await page.goto(base+equipmentLink);await page.locator('#routine-view-dismiss').waitFor();
    assert.ok((await page.locator('.routine-view-dialog').innerText()).includes('IPQC-AB'));
    await page.locator('#routine-view-dismiss').click();await page.locator(`[data-equipment-transfer="${sourceEq}"]`).click();
    await page.locator('#routine-confirm-transfer-ipqc-ab').waitFor();
    await page.waitForFunction(()=>document.querySelectorAll('[data-transfer-check="ipqcAB"]').length>0);
    assert.equal(await page.locator('[data-transfer-override]').count(),0);
    await page.locator('#routine-target-eq-select').selectOption(targetEq.id);
    await layout('.routine-transfer-dialog');await page.locator('#routine-confirm-transfer-ipqc-ab').scrollIntoViewIfNeeded();await shot('followup-ab-transfer');
    const confirmations=[];const accept=async dialog=>{confirmations.push(dialog.message());await dialog.accept();};page.on('dialog',accept);
    await page.locator('#routine-confirm-transfer-ipqc-ab').click();
    await page.waitForFunction(()=>document.querySelector('.routine-transfer-module-card.success #routine-confirm-transfer-ipqc-ab') || [...document.querySelectorAll('.routine-transfer-mod-msg')].some(n=>n.textContent.includes('已套用 1')));
    const changedAB=await stateControl('ipqcABMasterControl');
    assert.ok(Object.values(changedAB.scopes).some(scope=>scope.versions.some(v=>v.status==='draft'&&v.snapshot.items.some(item=>item.equipmentId===targetEq.id))));
    await page.locator('#routine-confirm-transfer-iqc').click();
    await page.waitForFunction(()=>[...document.querySelectorAll('.routine-transfer-mod-msg')].some(n=>n.textContent.includes('已套用 1')));
    assert.ok(confirmations.some(message=>message.includes('草稿已改選其他檢具')));
    // Wait for the actual dedicated handler receipt, not another module's message.
    await page.waitForFunction(()=>document.querySelector('.routine-transfer-module-card.success #routine-confirm-transfer-iqc')===null && [...document.querySelectorAll('.routine-transfer-module-card.success')].some(n=>n.textContent.includes('IQC 進料')));
    page.off('dialog',accept);
    const changedIQC=await stateControl('iqcMasterControl');
    assert.equal(changedIQC.versions.find(v=>v.status==='draft').snapshot.items.find(item=>item.id===draftItem.id).equipmentId,targetEq.id);
    await page.locator('#routine-transfer-dismiss').click();
    const cBeforeTransfer=await stateControl('ipqcCMasterControl'),cCreated=cBeforeTransfer.workflow.working.items.find(item=>item.standard==='12.00 ± 0.01 mm');
    assert.ok(cCreated);const cTarget=effective.equipment.find(row=>row.enabled!==false&&row.id!==cCreated.equipmentId);
    await page.goto(`${base}/process/?system=quality&view=data&dataTab=quality-routine-equipment&equipmentId=${encodeURIComponent(cCreated.equipmentId)}`);
    await page.locator('#routine-view-dismiss').click();await page.locator(`[data-equipment-transfer="${cCreated.equipmentId}"]`).click();
    await page.locator('[data-transfer-check="ipqcC"]').first().waitFor();
    for(const check of await page.locator('[data-transfer-check="ipqcC"]:not(:disabled)').all())await check.uncheck();
    await page.locator(`[data-transfer-check="ipqcC"][value="${cCreated.id}"]`).check();
    await page.locator('#routine-target-eq-select').selectOption(cTarget.id);
    page.on('dialog',accept);await page.locator('#routine-confirm-transfer-ipqc-c').click();
    await page.waitForFunction(()=>[...document.querySelectorAll('.routine-transfer-mod-msg')].some(n=>n.textContent.includes('尚未手動儲存')));
    page.off('dialog',accept);
    const cTransferred=await stateControl('ipqcCMasterControl');assert.deepEqual(cTransferred.workflow.saved,cBeforeTransfer.workflow.saved);assert.deepEqual(cTransferred.workflow.active,cBeforeTransfer.workflow.active);
    assert.equal(cTransferred.workflow.working.items.find(item=>item.id===cCreated.id).equipmentId,cTarget.id);
    assert.deepEqual(cTransferred.workflow.working.items.find(item=>item.id===cCreated.id).mediaItems,cCreated.mediaItems);
    await layout('.routine-transfer-dialog');await shot('v3-c-transfer-unsaved');await page.locator('#routine-transfer-dismiss').click();
    await page.goto(base+'/process/?system=process&view=productStatus');await page.locator('#status-line-select').waitFor();
    const editorBefore=await page.evaluate(()=>JSON.stringify({category:state.category,line:state.editorLine,productCode:state.productCode,workspace:state.editorByCategory}));
    for(const code of ['A','B','C']) {
      await page.locator('#status-line-select').selectOption(code);
      await page.locator('#status-product-select').waitFor();
      const selection=await page.evaluate(()=>({line:state.statusLine,category:state.statusCategory,code:state.statusProductCode,
        options:[...document.querySelector('#status-product-select').options].map(option=>({code:option.value,text:option.textContent})),
        products:statusProducts().map(product=>({...product,effectiveLine:routeFor(product.code)?.line || product.line})),shown:document.querySelector('.status-product-meta')?.textContent}));
      assert.equal(selection.line,code);assert.ok(selection.products.every(product=>product.effectiveLine===code));
      assert.ok(selection.options.every(option=>{const product=selection.products.find(row=>row.code===option.code);return product&&option.text.includes(product.name)&&(!product.specification||option.text.includes(product.specification));}));
      assert.ok(selection.shown.includes(selection.code));
      const categories=await page.locator('#status-category-select option').evaluateAll(options=>options.map(option=>option.value));
      await page.locator('#status-category-select').selectOption(categories.at(-1));
      const products=await page.locator('#status-product-select option').evaluateAll(options=>options.map(option=>option.value));
      assert.ok(products.length>0);
      await page.locator('#status-product-select').selectOption(products.at(-1));
      const chosen=await page.evaluate(()=>({line:state.statusLine,category:state.statusCategory,code:state.statusProductCode,
        matching:statusProducts().every(product=>product.category===state.statusCategory),shown:document.querySelector('.status-product-meta')?.textContent}));
      assert.equal(chosen.line,code);assert.equal(chosen.category,categories.at(-1));assert.equal(chosen.code,products.at(-1));
      assert.equal(chosen.matching,true);assert.ok(chosen.shown.includes(chosen.code));
    }
    assert.equal(await page.evaluate(()=>JSON.stringify({category:state.category,line:state.editorLine,productCode:state.productCode,workspace:state.editorByCategory})),editorBefore);
    await layout('.status-filters');await shot('followup-status-filters');
    await page.locator('.top-language-switch').click();
    assert.ok((await page.locator('.status-filters').innerText()).includes('Mã / tên / quy cách'));
    await layout('.status-filters');await page.locator('.top-language-switch').click();
    const iqcAfter=await stateControl('iqcMasterControl'),cAfter=await stateControl('ipqcCMasterControl'),abAfter=await stateControl('ipqcABMasterControl');
    assert.equal(iqcAfter.activeVersionId,activeBefore.iqc);assert.equal(cAfter.activeVersionId,activeBefore.c);assert.deepEqual(Object.fromEntries(Object.entries(abAfter.scopes).map(([k,s])=>[k,s.activeVersionId])),activeBefore.ab);
    assert.deepEqual(errors,[]);return {width,pass:true,isolatedWrites:writes.length,checks:'24-comment regression + 6 follow-ups: display labels/enabled, C thumbnail, AB card/deep-link/scoped transfer, confirm-only override, A/B/C status filters/specs/workspace preserved/bilingual, active unchanged'};
  } finally {await context.close();db.close();}
}
(async()=>{
  fs.mkdirSync(output,{recursive:true});
  const login=await fetch(base+'/api/platform-login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({demoRole:'admin'})});assert.equal(login.status,200);
  const cookie=login.headers.get('set-cookie').split(';')[0],headers={Cookie:cookie};
  const source=await (await fetch(base+'/api/shared-state',{headers})).json();
  const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{channel:'chrome'})});
  try {for(const width of [1366,390])console.log(JSON.stringify(await run(browser,width,source)));}
  finally {await browser.close();}
  const after=await (await fetch(base+'/api/shared-state',{headers})).json();
  for(const key of ['qualityMasterControl','iqcMasterControl','ipqcABMasterControl','ipqcCMasterControl','routineEquipmentControl'])assert.equal(digest(after.values[key]),digest(source.values[key]),'Real Local business key changed: '+key);
  console.log('PASS actual Local business keys unchanged; all mutations were isolated');
})().catch(error=>{console.error(error);process.exitCode=1;});
