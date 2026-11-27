import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import test from 'node:test';
import {chromium} from 'playwright';
import {createABCFixture} from './ab-c-native-fixture.mjs';

const growthFixture = createRequire(import.meta.url)('../scripts/v3-quality-growth-fixture.cjs');
const modules = [
  {module:'fqc', key:'qualityMasterControl', prefix:'fqc', add:'#fqc-add-item', edit:'[data-edit-item="row0"]', form:'.fqc-item-form', parent:'[data-edit-error="error"]', parentForm:'.fqc-modal-form', approve:'#quality-approve'},
  {module:'iqc', key:'iqcMasterControl', prefix:'iqc', add:'[data-add-item="error0"]', edit:'[data-edit-item="row0"]', form:'#iqc-item-form', parent:'[data-edit-error="error0"]', parentForm:'#iqc-error-form', approve:'#iqc-review-approve'},
  {module:'ipqc-ab', key:'ipqcABMasterControl', prefix:'ipqcab', add:'#ipqcab-add-item', edit:'[data-ab-edit-item="row0"]', form:'.ipqcab-dialog', parent:'[data-ab-edit-error="error0"]', parentForm:'.ipqcab-dialog', approve:'[data-ab-module-action="approve"]'},
  {module:'ipqc-c', key:'ipqcCMasterControl', prefix:'ipqcc', add:'[data-ipqcc-add="item"]', edit:'[data-ipqcc-edit-item="row0"]', form:'#ipqcc-editor', parent:'[data-ipqcc-edit-error="error0"]', parentForm:'#ipqcc-editor', approve:'[data-ipqcc-review="approve"]'},
];
const sharedCode = 'MiXeD Ω / 07 + [x]';
const claimedCode = 'Used / Disabled';
const newCode = '任意 Q+ / λ';
const changedParent = 'Unrelated parent';
const itemField = module => ['fqc','iqc'].includes(module) ? 'checkNo' : 'code';

function secondLine(template) {
  return JSON.parse(JSON.stringify(template),(key,value) => {
    const replacements = {A:'B','A:G':'B:GB',G:'GB',PAB:'PBB'};
    return typeof value === 'string' ? replacements[value] ?? value.replaceAll('A-CUT','B-CUT').replaceAll('A:G','B:GB') : value;
  });
}

function seed(values, target, line) {
  const users = JSON.parse(values.platformUsers);
  users.push({...users.find(u => u.id === 'frank'),id:'reviewer',name:'Synthetic reviewer',primary:false});
  values.platformUsers = JSON.stringify(users);
  for (const config of modules) {
    const fixture = growthFixture(config.module,[{id:'synthetic',bytes:1}],0,1);
    const control = JSON.parse(fixture.values[fixture.key],(k,v) =>
      ['mediaItems','standardPhotos','methodPhotos','photos'].includes(k) ? [] : v);
    if (config.module === 'fqc') {
      const master = JSON.parse(values.masterDataControl);
      const {AB,C} = JSON.parse(fixture.values.masterDataControl).active;
      const b = secondLine(AB);
      for (const key of ['categoryGroups','products','lines']) AB[key].push(...b[key]);
      for (const [scope,snapshot] of Object.entries({AB,C})) {
        master.active[scope] = snapshot;
        master.versions.find(v => v.scope === scope).snapshot = snapshot;
      }
      values.masterDataControl = JSON.stringify(master);
    }
    if (config.module === 'ipqc-ab') control.scopes['B:GB'] = secondLine(control.scopes['A:G']);
    const groups = control.scopes ?? {single:control.libraries?.fqc ?? control};
    for (const [scope,group] of Object.entries(groups)) {
      const field = itemField(config.module);
      const peerScope = config.module === 'ipqc-ab' && scope[0] !== line;
      // Include a disabled item, two historic aliases, and another module already using the desired code.
      const decorate = snapshot => {
        const row = snapshot.items[0];
        if (['iqc','ipqc-c'].includes(config.module)) row.equipmentSnapshot = null;
        if (config.module !== target) row[field] = sharedCode;
        if (peerScope) row[field] = claimedCode;
        if (peerScope) row.isEnabled = false;
        if (config.module !== 'ipqc-ab') {
          const inactive = config.module === 'ipqc-c' ? {notApplicable:true,notApplicableReason:'Synthetic exclusion'} : {isEnabled:false};
          snapshot.items.push({...row,...inactive,id:'disabled',[field]:claimedCode});
        }
        for (const [id,code] of [['alias-one','Legacy.123'],['alias-two',' LEGACY.123 ']]) {
          snapshot.items.push({...row,id,[field]:code});
        }
      };
      for (const v of group.versions) decorate(v.snapshot);
      decorate(group.workflow.working);
      decorate(group.workflow.active.content);
    }
    values[fixture.key] = JSON.stringify(control);
  }
}

for (const language of ['zh','vi']) for (const config of modules) {
  const {module,key,prefix} = config;
  for (const line of module === 'ipqc-ab' ? ['A','B'] : ['']) {
    test(`full item codes through the quality editor, ${module} ${line} ${language}`, async t => {
      const fixture = await createABCFixture({products:1,decorate:values => seed(values,module,line)});
      t.after(() => fixture.close());
      const browser = await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE});
      t.after(() => browser.close());
      const context = await browser.newContext({serviceWorkers:'block',viewport:language === 'vi' ? {width:390,height:844} : {width:1365,height:900}});
      const origin = fixture.url.origin, scope = line === 'B' ? 'B:GB' : 'A:G', field = itemField(module);
      const path = origin+'/process/?system=quality&view=data&dataTab=quality-'+module;
      const approvalUrl = origin+'/api/'+module+'/workflow'+(line?'?module=1':'');
      await context.route('**/*',route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
      await context.addInitScript(lang => localStorage.setItem('processUILanguage',lang),language);
      const actor = id => context.addCookies([{name:'process_demo',value:fixture.cookie(id),url:origin}]);
      await actor('frank');
      const page = await context.newPage();
      page.setDefaultTimeout(12000);
      const raw = () => fixture.db.prepare('SELECT revision,"values" FROM shared_state WHERE id=1').first();
      const decode = async row => fixture.load('lib/process-state.ts').decodeValues(row.values);
      const group = control => line ? control.scopes[scope] : control.libraries?.fqc ?? control;
      const get = async () => JSON.parse((await decode(await raw()))[key]);
      const effective = g => g.versions.find(v => v.id === g.activeVersionId).snapshot;
      const request = (who, url, command) => page.request.post(url,{headers:{Origin:origin,'X-Process-Expected-Actor':who},data:{command}});
      const nextReview = (action,pending) => ({action,caseId:pending.pendingId,generation:pending.generation,operationId:randomUUID(),clientId:'synthetic-review',sequence:1,reason:'Synthetic correction'});
      const response = action => page.waitForResponse(r => r.url().includes('/workflow') && r.request().method()==='POST' && r.request().postDataJSON()?.command?.action===action);
      async function enter() {
        await page.goto(path);
        if (module === 'iqc') await page.locator('[data-select-part=P1]').click();
        if (line === 'B') await page.locator('#ipqcab-line').selectOption('B');
        await page.locator(config.add).waitFor();
      }
      async function openItem(isNew) {
        if (!isNew && module === 'ipqc-c') {
          const details = page.locator('details.ipqcc-item').filter({has:page.locator(config.edit)}).first();
          if (!await details.evaluate(el => el.open)) await details.locator('summary').click();
        }
        await page.locator(isNew ? config.add : config.edit).first().click();
        const form = page.locator(config.form), input = form.locator('[data-quality-item-code]');
        await input.waitFor();
        if (isNew) {
          const name = form.locator('[name=name],[name=nameVi],#ab-standard,[name=standard]').first();
          await name.fill('Synthetic item');
          if (module === 'ipqc-c') await form.locator('[name=ruleCadence]').selectOption('none');
        }
        return {form,input,done:form.locator('button[type=submit],#ab-apply').last()};
      }
      async function save(competingCode) {
        const pattern = '**/workflow*';
        let rejection;
        // A/B begins a module draft first. Inject the conflict only when the actual Save is sent.
        const intercept = async route => {
          const req = route.request();
          if (req.method() !== 'POST' || req.postDataJSON()?.command?.action !== 'save') return route.fallback();
          let answer;
          try {
            await conflictAt(await raw(),competingCode,async () => (answer = await route.fetch()));
            await route.fulfill({response:answer});
          } catch (error) {
            rejection = error;
            if (answer) await route.fulfill({response:answer});
            else await route.fulfill({status:500,body:'Fixture failed'});
          }
        };
        if (competingCode) await page.route(pattern,intercept);
        try {
          const waiting = response('save');
          await page.locator('#'+prefix+'-save').click();
          const saved = await waiting;
          if (rejection) throw rejection;
          assert.equal(saved.status(),competingCode ? 422 : 200,await saved.text());
        } finally {
          if (competingCode) await page.unroute(pattern,intercept);
        }
      }
      async function submit() {
        await page.locator('#'+prefix+'-submit').click();
        const dialog = page.locator('dialog.vd-confirm[open]');
        await dialog.locator('textarea').fill('Synthetic review');
        const waiting = response('submit');
        await dialog.locator('button[type=submit],button.signal').last().click();
        const submitted = await waiting;
        assert.equal(submitted.status(),200,await submitted.text());
        const control = await get();
        return (line ? control.moduleDraft : group(control)).workflow;
      }
      async function close(editor) {
        await editor.done.click();
        await editor.form.waitFor({state:'hidden'});
      }
      async function conflictAt(frozen, targetCode, run) {
        // Inject a competing effective owner at the same base version, in this worker's isolated D1/R2.
        const original = await raw(), bucket = await fixture.mf.getR2Bucket('STATE_ARCHIVE');
        const values = await decode(frozen), control = JSON.parse(values[key]);
        const owner = line ? control.scopes[line === 'A' ? 'B:GB' : 'A:G'] : group(control);
        const addPeer = snapshot => snapshot.items.push({...snapshot.items[0],id:'competing-item',[field]:targetCode.toLowerCase(),isEnabled:false});
        addPeer(effective(owner)); addPeer(owner.workflow.active.content);
        values[key] = JSON.stringify(control);
        const encoded = await fixture.load('lib/state-records.ts').encodeRecordValues(bucket,values);
        const install = (revision,blob) => fixture.db.prepare('UPDATE shared_state SET revision=?,"values"=? WHERE id=1').bind(revision,blob).run();
        await install(frozen.revision,encoded);
        const before = await raw();
        const objects = async () => {
          const entries = []; let cursor;
          do {
            const batch = await bucket.list({cursor});
            entries.push(...batch.objects.map(o => [o.key,o.etag,o.version]));
            cursor = batch.truncated ? batch.cursor : undefined;
          } while (cursor);
          return entries;
        };
        const archive = await objects();
        try {
          const rejected = await run();
          const error = await rejected.json();
          assert.ok([409,422].includes(rejected.status()),JSON.stringify(error));
          assert.equal(error.error,'ITEM_CODE_DUPLICATE',JSON.stringify(error));
          assert.equal(error.details?.occupiedBy,'competing-item',JSON.stringify(error));
          assert.deepEqual(await raw(),before);
          assert.deepEqual(await objects(),archive);
        } finally { await install(original.revision,original.values); }
      }

      await enter();
      const original = group(await get()), originalActive = structuredClone(effective(original));
      const starter = await openItem(true), suggested = await starter.input.inputValue();
      assert.match(suggested,/-02$/);
      await close(starter);
      const manual = await openItem(true);
      assert.notEqual(await manual.input.inputValue(),suggested);
      await manual.input.fill('   '); await manual.done.click();
      assert.ok(await manual.form.isVisible());
      await manual.input.fill('  '+claimedCode.toUpperCase()+'  '); await manual.done.click();
      assert.ok(await manual.form.isVisible());
      const duplicateMessage = await manual.input.evaluate(el=>el.validationMessage);
      assert.match(duplicateMessage,language === 'vi' ? /đã được sử dụng/i : /已被使用/);
      assert.match(duplicateMessage,/Đường kính|Chiều dài|10 mm|disabled|row0/);
      await manual.input.fill('  '+sharedCode+'  '); await close(manual);
      const existing = await openItem(false);
      assert.equal(await existing.input.inputValue(),originalActive.items.find(i=>i.id==='row0')[field]);
      await existing.input.fill(newCode); await close(existing);
      await page.locator(config.parent).click();
      const parent = page.locator(config.parentForm);
      await parent.locator('[name=code],#ab-error-code').fill(changedParent);
      await parent.locator('button[type=submit],#ab-apply').last().click();
      await parent.waitFor({state:'hidden'});
      await save(language === 'zh' ? suggested : newCode);
      const retained = await openItem(false);
      assert.equal(await retained.input.inputValue(),newCode);
      const savedCode = newCode+' saved';
      await retained.input.fill(savedCode); await close(retained);
      await save();
      await enter();
      const edited = group(await get());
      const rows = edited.workflow.working.items;
      assert.equal(rows.find(i=>i.id==='row0')[field],savedCode);
      for (const code of [sharedCode,suggested]) assert.equal(rows.filter(i=>i[field]===code).length,1);
      for (const id of ['alias-one','alias-two']) assert.equal(rows.find(i=>i.id===id)[field],originalActive.items.find(i=>i.id===id)[field]);
      assert.deepEqual(effective(edited),originalActive);
      const reopen = await openItem(false);
      assert.equal(await reopen.input.inputValue(),savedCode); await enter();

      let pending = await submit();
      await actor('viewer');
      const noPermission = await request('viewer',approvalUrl,nextReview('approve',pending));
      assert.equal(noPermission.status(),403);
      await actor('reviewer');
      await conflictAt(await raw(),savedCode,()=>request('reviewer',approvalUrl,nextReview('approve',pending)));
      const correction = language==='zh' ? 'return' : 'withdraw', who = correction==='return' ? 'reviewer' : 'frank';
      await actor(who);
      const corrected = await request(who,approvalUrl,nextReview(correction,pending));
      assert.equal(corrected.status(),200,await corrected.text());
      await actor('frank'); await enter();
      const repair = await openItem(false);
      await repair.input.fill(newCode+' 2'); await close(repair);
      await save(); pending = await submit();
      await actor('reviewer');
      await page.goto(origin+'/process/?system=quality&view=approval&approvalTab=quality');
      await page.locator('[data-review-jump="'+module+'"]').click();
      const panel = page.locator('#review-'+module);
      if (module==='fqc'||module==='iqc') await panel.locator('['+(module==='fqc'?'data-quality-review':'data-iqc-review')+'="'+pending.pendingId+'"]').click();
      else await panel.locator('details[data-case-id="'+pending.pendingId+'"] > summary').click();
      await panel.locator(config.approve).first().click();
      const waiting = response('approve');
      await page.locator('dialog.vd-confirm[open] button[type=submit]').click();
      const approved = await waiting;
      assert.equal(approved.status(),200,await approved.text());
      const after = group(await get());
      assert.equal(effective(after).items.find(i=>i.id==='row0')[field],newCode+' 2');
      assert.equal(effective(after).errors.find(i=>i.id===rows.find(r=>r.id==='row0').errorId).code,changedParent);
      assert.deepEqual(after.versions.find(v=>v.id===original.activeVersionId).snapshot,originalActive);
    });
  }
}
