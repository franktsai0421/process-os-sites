// Native CI acceptance against the compiled Worker and a disposable synthetic database.
import assert from 'node:assert/strict';
import {createHmac, randomBytes} from 'node:crypto';
import {createRequire} from 'node:module';
import {createRootEntryFixture} from './root-entry-native-fixture.mjs';

const endpoint = '/api/routine-fqc';
const iqcEndpoint = '/api/routine-iqc';
const inspection = '/process/?system=quality&view=quality-inspections&rfTab=sources';
const require = createRequire(import.meta.url);
const codes = ['SYN-P1', 'SYN-P2', 'SYN-P3'];
const writers = new Set(['frank', 'routine-reviewer']);
const allowed = new Set(['configure', 'generate', 'request', 'create-plan', 'create-report', 'save', 'submit', 'approve']);
const action = (root, name) => root.locator(`button[data-action="${name}"]:visible`);
const find = (rows, id) => rows.find(row => row.id === id);

export async function seedRoutineCalendarFixture(fixture, secret) {
  const bucket = await fixture.mf.getR2Bucket('STATE_ARCHIVE');
  const load = require('../scripts/ipqc-ab-import-harness.cjs')({STATE_ARCHIVE:bucket});
  const {encodeRecordValues} = load('lib/state-records.ts');
  const {companyDate, nextDate} = load('lib/routine-fqc.ts');
  const today = companyDate();
  const start = today.slice(0, 8) + '01';
  // Approval installs the complete AB routing projection. Use a valid
  // routable catalog even though FQC period generation uses only the products.
  const stage = {code:'A-SYN',name:'Synthetic inspection source stage',machine:'Synthetic',assetNumber:'SYN-FIXTURE',operators:1};
  const products = codes.map(code => ({code,name:code,category:'SYN',line:'A',unit:'pcs',specification:'Synthetic sample',stages:[stage.code]}));
  const ab={products,lines:[{code:'A',name:'Synthetic line',stages:[stage]}],categoryGroups:[{line:'A',name:'SYN'}]};
  const baseItem = {line:'A', category:'SYN', isEnabled:true, description:'Synthetic inspection standard', productCodes:codes};
  const items = [
    {...baseItem, id:'time', checkNo:'TEST-TIME', name:'Synthetic time item', rule:{cadence:'time', timeFrequency:'monthly'}},
    {...baseItem, id:'unresolved', checkNo:'TEST-UNRESOLVED', name:'Synthetic unresolved item', rule:{cadence:'pending_confirmation'}},
  ];
  const version = {id:'approved-synthetic', number:1, status:'approved', createdAt:'2025-01-01T00:00:00.000Z', snapshot:{errors:[],items}};
  const users = [
    ...[...writers].map(id => ({id,name:'Synthetic '+id,role:'admin',primary:id==='frank',enabled:true,authMode:'platform',authEpoch:1})),
    {id:'routine-reader',name:'Synthetic reader',role:'staff',inheritRole:false,enabled:true,authMode:'platform',authEpoch:1,accessOverrides:{'routine.view':true}},
  ];
  const iqcSource={id:'iqc-source',number:1,status:'approved',createdAt:'2025-01-01T00:00:00.000Z',snapshot:{
    categories:[{id:'iqc-category',nameVi:'Synthetic category'}],suppliers:[],
    parts:[{id:'iqc-part',code:'IP1',nameVi:'Synthetic IQC part',categoryId:'iqc-category',supplierIds:[],photos:[],isEnabled:true}],
    errors:[{id:'iqc-error',partCode:'IP1',code:'SYN-ERR'}],
    items:[
      {id:'iqc-item',partCode:'IP1',errorId:'iqc-error',checkNo:'SYN-IQC-TIME',nameVi:'Monthly measurement',isEnabled:true,rules:[{id:'iqc-month',cadence:'time',kind:'month',value:''}]},
      {id:'iqc-batch',partCode:'IP1',errorId:'iqc-error',checkNo:'SYN-IQC-BATCH',nameVi:'Arrival check',isEnabled:true,rules:[{id:'iqc-arrival',cadence:'batch',kind:'fixed_count',value:'1'}]},
    ],
  }};
  const values = {
    iqcMasterControl:JSON.stringify({schemaVersion:1,versions:[iqcSource],activeVersionId:iqcSource.id}),
    platformUsers:JSON.stringify(users), routineFqcEnabled:'1', backupSettings:'{"enabled":false}',
    qualityMasterControl:JSON.stringify({libraries:{fqc:{activeVersionId:version.id,versions:[version]}}}),
    masterDataControl:JSON.stringify({active:{AB:ab,C:{products:[],lines:[]},PROCESS:{}},versions:[]}),
  };
  const raw = await encodeRecordValues(bucket,values);
  await fixture.db.prepare('INSERT INTO shared_state(id,revision,"values",updated_at) VALUES(1,1,?,?)').bind(raw,'synthetic').run();
  function cookie(actor) {
    const payload = Buffer.from(JSON.stringify({version:2,id:actor,sessionType:'platform',authEpoch:1,expires:Date.now()+900000,nonce:'synthetic-calendar'})).toString('base64');
    return payload + '.' + createHmac('sha256',secret).update(payload).digest('hex');
  }
  return {cookie,today,start,tomorrow:nextDate(today)};
}

export async function runRoutineFqcCalendarBrowser() {
  assert.equal(process.env.CI, 'true', 'Use the authorized native CI runner');
  const {chromium} = await import('playwright');
  const secret = randomBytes(32).toString('hex');
  const report = {checks:[], programCommit:process.env.PROCESS_PROGRAM_COMMIT};
  let fixture, browser, activePage, stage = 'isolated fixture';
  const transport = [];
  try {
    fixture = await createRootEntryFixture({syntheticBindings:{PROCESS_IMPORT_ENABLED:'0',PROCESS_SESSION_SECRET:secret}});
    const origin = fixture.url.origin;
    assert.equal(fixture.url.hostname,'127.0.0.1');
    const {cookie,today,start,tomorrow} = await seedRoutineCalendarFixture(fixture,secret);
    report.buildEntrySha256 = fixture.buildEntrySha256;
    stage = 'native Chromium';
    browser = await chromium.launch({headless:true});
    const posted = [], postedIqc = [], blocked = [];
    async function open(actor, viewport) {
      const context = await browser.newContext({serviceWorkers:'block',viewport});
      await context.addCookies([{name:'process_demo',value:cookie(actor),url:origin,httpOnly:true,sameSite:'Lax'}]);
      await context.route('**/*',route=>{
        const req = route.request(), url = new URL(req.url()), method = req.method();
        if (url.origin !== origin) return route.abort();
        if (method === 'GET' || method === 'HEAD') return route.continue();
        const isIqc = url.pathname===iqcEndpoint;
        const body = method==='POST' && (isIqc||url.pathname===endpoint) ? req.postDataJSON() : null;
        const command = body?.action==='draft' ? (isIqc ? body.draft : body.command)?.action : body?.action;
        if (writers.has(actor) && allowed.has(command)) {
          (isIqc ? postedIqc : posted).push({actor,command});
          return route.continue();
        }
        blocked.push({actor,method,path:url.pathname});
        return route.abort();
      });
      const page = await context.newPage();
      page.setDefaultTimeout(18000);
      page.on('response',response=>{
        const url=new URL(response.url());
        if (url.origin!==origin || !url.pathname.startsWith('/api/')) return;
        if (url.pathname!==endpoint && response.status()<400) return;
        transport.push({actor,method:response.request().method(),path:url.pathname,status:response.status(),selector:[...new Set(url.searchParams.keys())]});
        if (transport.length>30) transport.shift();
      });
      return {context,page,root:page.locator('#routine-fqc-root')};
    }
    stage = 'phone viewer authority and pristine state';
    const viewer = await open('routine-reader',{width:390,height:844});
    await viewer.page.goto(origin+inspection,{waitUntil:'domcontentloaded'});
    await viewer.root.locator('.rf-calendar-setup').waitFor();
    assert.equal(await action(viewer.root,'settings').count(),0);
    const refused = await viewer.context.request.get(origin+endpoint+`?preview=1&calendar=2&start=${start}`);
    assert.equal(refused.status(),403);
    assert.equal((await fixture.db.prepare('SELECT revision FROM shared_state WHERE id=1').first()).revision,1);
    await viewer.context.close();
    report.checks.push('phone read-only actor cannot preview calendar or change database');

    stage = 'desktop setup and date-response fence';
    const editor = await open('frank',{width:1280,height:800});
    const {page,root} = editor;
    activePage = page;
    async function read() {
      const response = await editor.context.request.get(origin+endpoint);
      assert.equal(response.status(),200);
      return (await response.json()).control;
    }
    await page.goto(origin+inspection,{waitUntil:'domcontentloaded'});
    await root.locator('.rf-calendar-setup').waitFor();
    assert.deepEqual(posted,[]);
    assert.equal((await read()).startDate,null);
    await action(root,'settings').click();
    const dialog = page.getByRole('dialog',{name:/設定 FQC 開始日期|Đặt ngày bắt đầu FQC/});
    const date = dialog.locator('[name="start"]');
    const preview = dialog.locator('[data-preview]');
    const confirm = dialog.locator('[type="submit"]');
    await date.fill(start);
    assert.equal(await confirm.isDisabled(),true);
    let release, received;
    const held = new Promise(resolve=>{release=resolve;});
    const fetched = new Promise(resolve=>{received=resolve;});
    const isPreview = url => url.pathname===endpoint && url.searchParams.get('preview')==='1';
    const delay = async route => {
      const response = await route.fetch({timeout:15000});
      received();
      await held;
      await route.fulfill({response});
    };
    await page.route(isPreview,delay,{times:1});
    let oldResponse;
    try {
      oldResponse = page.waitForResponse(response=>isPreview(new URL(response.url())));
      await preview.click();
      await Promise.race([fetched, oldResponse.then(()=>{ throw new Error('First preview was not held'); })]);
      await date.fill(tomorrow);
    } finally {
      release();
    }
    assert.equal((await oldResponse).status(),200);
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    assert.equal(await confirm.isDisabled(),true);
    assert.equal((await dialog.locator('.rf-preview').textContent()).trim(),'');
    await date.fill(start);
    const nextResponse = page.waitForResponse(response=>isPreview(new URL(response.url())));
    await preview.click();
    const response = await nextResponse;
    assert.equal(response.status(),200);
    const projection = await response.json();
    assert.deepEqual(projection.jobs.map(job=>job.calendar.productCode).sort(),codes);
    assert.deepEqual(projection.unresolved.map(item=>item.id),['unresolved']);
    await dialog.locator('.rf-preview').getByText(/Synthetic time item · SYN-P1/).waitFor();
    assert.deepEqual(posted,[]);

    stage = 'activation and grouped work';
    await confirm.click();
    await root.locator('.rf-period-group').first().waitFor();
    const state = await read();
    assert.equal(state.startDate,start);
    assert.equal(state.calendarPolicy.version,2);
    assert.deepEqual(posted.map(row=>row.command),['configure','generate']);
    const periods = jobs => jobs.map(job=>[job.id,job.start,job.end,job.calendar.productCode]).sort();
    assert.deepEqual(periods(state.jobs),periods(projection.jobs));
    const target = state.jobs.find(job=>job.calendar.productCode===codes[0]);
    assert(target && target.start===start && target.end>=today);
    assert.equal(await root.locator('.rf-period-group').count(),codes.length);
    await root.locator('.rf-period-group').filter({hasText:codes[0]}).locator('[data-period-toggle]').click();
    const row = root.locator(`[data-period-id="${target.id}"]`);
    await row.waitFor();
    assert.equal(await row.locator('[data-job]').isEnabled(),true);
    await root.locator('.rf-fqc-administration summary').click();
    assert.equal(await action(root,'settings').isDisabled(),true);
    report.checks.push('stale date response disabled; browser starts once; rendered periods equal projected jobs and lock date');


    const reviewer = await open('routine-reviewer',{width:390,height:844});
    async function observeApprovalDispatch() {
      // Audit the real navigation result without changing its route, inputs
      // or error handling. The application normally consumes this Promise.
      await page.evaluate(() => {
        const api=window.ProcessDeliveryNavigation, dispatch=api.approval;
        window.syntheticRoutineApprovalResult=null;
        api.approval=function(...args) {
          api.approval=dispatch;
          const result=dispatch.apply(this,args);
          void result.then(value=>{
            window.syntheticRoutineApprovalResult={
              status:value.status,
              committed:value.committed ?? null,
              error:value.error?.message?.slice(0,160) ?? null,
              frames:value.error?.stack?.split('\n').slice(1,4).map(frame=>{
                const match=frame.match(/\/process\/([a-z0-9_.-]+(?:\?.*?)?):(\d+):(\d+)/i);
                return match ? [match[1].split('?')[0],Number(match[2]),Number(match[3])] : null;
              }) ?? [],
            };
          });
          return result;
        };
      });
    }
    async function submitDocument() {
      await action(document,'save').click();
      await action(document,'submit').click();
      await page.getByRole('dialog',{name:/確認送審|Xác nhận gửi duyệt/}).locator('[type="submit"]').click();
      await action(document,'review').waitFor();
      return read();
    }
    async function review(id, pendingId, selfFence = false) {
      await observeApprovalDispatch();
      await action(document,'review').click();
      const navigationHandle=await page.waitForFunction(()=>window.syntheticRoutineApprovalResult);
      const navigation=await navigationHandle.jsonValue();
      assert.equal(navigation.status,'ready',JSON.stringify(navigation));
      await page.waitForURL(url=>url.searchParams.get('approvalTab')==='routine' &&
        url.searchParams.get('rfDocument')===id && url.searchParams.get('rfCase')===pendingId);
      if (selfFence) {
        const self = page.locator('#review-routine-fqc .rf-approval');
        await self.locator('[data-self-review]').waitFor();
        assert.equal(await action(self,'approve').isDisabled(),true);
      }
      activePage = reviewer.page;
      await reviewer.page.goto(page.url(),{waitUntil:'domcontentloaded'});
      const approval = reviewer.page.locator('#review-routine-fqc .rf-approval');
      await action(approval,'approve').waitFor();
      assert.equal(await approval.locator('[data-self-review]').count(),0);
      await action(approval,'approve').click();
      await approval.waitFor({state:'detached'});
      activePage = page;
      const state = await read();
      const reviewed = find(state.documents,id);
      assert.equal(reviewed.flow.active.id,pendingId);
      assert.equal(find(reviewed.flow.cases,pendingId).result.actor.id,'routine-reviewer');
      return state;
    }

    stage = 'current-period waiver pending and authorized approval';
    await row.locator('[data-period-exempt]').click();
    const document = root.locator('.rf-document');
    await document.locator('[data-field="reason"]').fill('Synthetic current-period waiver');
    assert.equal(await action(document,'submit').isDisabled(),true);
    const pending = await submitDocument();
    const waiver = pending.documents.find(item=>item.requestKind==='skip');
    assert(waiver?.flow.pendingId);
    assert.equal(find(pending.jobs,target.id).completion,null);
    const saved = waiver.flow.saved.id;
    assert.equal(find(waiver.flow.cases,waiver.flow.pendingId).savedId,saved);
    const waived = await review(waiver.id,waiver.flow.pendingId,true);
    assert.equal(find(waived.jobs,target.id).completion.kind,'skip');
    assert(waived.jobs.filter(job=>job.id!==target.id).every(job=>!job.completion), 'approval does not apply to another product');
    assert.deepEqual(posted.map(item=>item.command),['configure','generate','request','save','submit','approve']);
    report.checks.push('only the selected product closes after separate approval in the routine queue; self-confirm defaults locked');


    // Use a separate browser context and IQC records. A failed IQC assertion
    // is reported while still allowing the remaining FQC scenario to run.
    async function verifyIqcWrites() {
      const iqc = await open('frank',{width:390,height:844});
      const iqcReviewer = await open('routine-reviewer',{width:390,height:844});
      const panel = iqc.page.locator('.ri-app:visible');
      const click = (scope,name) => scope.locator(`[data-ri-action="${name}"]:visible`).click();
      const readIqc = async () => {
        const response = await iqc.context.request.get(origin+iqcEndpoint);
        assert.equal(response.status(),200);
        return response.json();
      };
      const fqcBefore = await read();
      try {
        await iqc.page.goto(origin+inspection+'&rfModule=iqc',{waitUntil:'domcontentloaded'});
        const before = await readIqc();
        assert.equal(before.startDate,null);
        assert.equal(before.jobs.length,0);
        await click(panel.locator('.ri-empty'),'configure');
        const setup = iqc.page.locator('dialog.ri-admin-dialog[open]');
        await setup.locator('[name="start"]').fill(today);
        await setup.locator('[name="reason"]').fill('Synthetic IQC start');
        await setup.locator('[name="ack"]').check();
        await setup.locator('[name="confirm"]').fill('START IQC');
        await setup.locator('button[value="confirm"]').click();
        const group = panel.locator('.rf-period-group-toggle');
        await group.waitFor({state:'visible'});
        const generated = await readIqc();
        assert.equal(generated.startDate,today);
        assert.deepEqual(generated.jobs.map(job=>job.source.code),['SYN-IQC-TIME']);
        assert.equal(generated.scheduleDue,false);
        if (await group.getAttribute('aria-expanded')==='false') await group.click();
        await panel.locator(`input[data-ri-pick=${JSON.stringify(generated.jobs[0].id)}]`).check();
        await click(panel,'create-plan');
        await iqc.page.locator('dialog.ri-selection-dialog[open] button[value="confirm"]').click();
        const detail = panel.locator('.rf-document');
        const batch = detail.locator('input[data-ri-key="batchNo"]');
        await click(detail,'add-lot:iqc-part');
        assert.equal(await batch.count(),1);
        await batch.fill('0001');
        await detail.locator('input[data-ri-key="quantity"]').fill('2');
        await click(detail,'add-lot:iqc-part');
        await batch.nth(1).fill('0002');
        await detail.locator('input[data-ri-key="quantity"]').nth(1).fill('3');

        async function sendAndApprove(kind) {
          await click(detail,'save');
          await click(detail,'submit');
          await iqc.page.locator('dialog.ri-submit-dialog[open] button[value="confirm"]').click();
          const review = detail.locator('[data-ri-action^="review:"]');
          await review.waitFor({state:'visible'});
          const pendingIqc = await readIqc();
          const selected = pendingIqc.documents.find(item=>item.kind===kind && item.status==='pending');
          assert(selected?.flow.pendingId);
          assert.equal(pendingIqc.cases.length,0);
          await review.click();
          await iqc.page.waitForURL(url=>url.searchParams.get('approvalTab')==='routine' &&
            url.searchParams.get('rfModule')==='iqc' && url.searchParams.get('riDocument')===selected.id);
          await iqcReviewer.page.goto(iqc.page.url(),{waitUntil:'domcontentloaded'});
          const approval = iqcReviewer.page.locator('.ri-app:visible .rf-approval');
          assert.equal(await approval.locator('[data-ri-self]').count(),0);
          await click(approval,'approve');
          await approval.waitFor({state:'detached'});
          const approvedIqc = await readIqc();
          const approved = find(approvedIqc.documents,selected.id);
          assert.equal(approved.flow.active.id,selected.flow.pendingId);
          assert.equal(approved.status,'approved');
          assert.equal(find(approved.flow.cases,selected.flow.pendingId).result.actor.id,'routine-reviewer');
          return {approved,state:approvedIqc};
        }
        const plan = (await sendAndApprove('plan')).approved;
        assert.deepEqual(plan.flow.active.content.lots.map(lot=>[lot.batchNo,lot.quantity]),[['0001',2],['0002',3]]);
        await iqc.page.goto(origin+inspection+'&rfModule=iqc',{waitUntil:'domcontentloaded'});
        await click(panel,'tab:report');
        await click(panel,`create-report:${plan.id}`);
        const reportRows = detail.locator('[data-ri-inspection]');
        await reportRows.nth(1).waitFor();
        assert.equal(await reportRows.count(),2);
        for (const row of await reportRows.all()) {
          const pass = row.locator('button[data-outcome="pass"]');
          await pass.click();
          assert.equal(await pass.getAttribute('aria-pressed'),'true');
          await row.locator('textarea[data-ri-key="value"]').fill('Synthetic measured pass');
        }
        const {approved,state:finalIqc} = await sendAndApprove('report');
        assert.deepEqual(approved.flow.active.content.inspections.map(item=>[item.batch.batchNo,item.batch.quantity,item.batch.unit,item.outcome]),
          [['0001',2,'pcs','pass'],['0002',3,'pcs','pass']]);
        assert.equal(finalIqc.cases.length,0);
        assert.deepEqual(await read(),fqcBefore,'IQC mutations do not change FQC control');
        assert.deepEqual(postedIqc.map(item=>item.command),['configure','create-plan','save','submit','approve','create-report','save','submit','approve']);
        report.checks.push('IQC browser started schedule and approved a two-batch plan and passing report in the correct routine queue; FQC preserved');
      } finally {
        await iqcReviewer.context.close();
        await iqc.context.close();
      }
    }
    try {
      await verifyIqcWrites();
    } catch (error) {
      report.iqcFailure = {message:String(error.message).replaceAll(secret,'[redacted]').slice(0,320),operations:postedIqc};
    }

    let ordinaryEntries = 0;
    async function tab(name) {
      // Change tabs in the mounted workspace. Coming back from review is an
      // ordinary FQC entry, which intentionally has one schedule generation.
      const before = posted.length;
      const flow = root.locator('.rf-calendar-flow');
      if (await flow.isVisible()) {
        await flow.locator(`[data-tab="${name}"]`).click();
        assert.deepEqual(posted.slice(before),[]);
      } else {
        await page.goto(origin+inspection.replace('rfTab=sources','rfTab='+name),{waitUntil:'domcontentloaded'});
        await flow.waitFor();
        assert.deepEqual(posted.slice(before),[{actor:'frank',command:'generate'}]);
        ordinaryEntries++;
      }
    }
    async function enterReport(planId, outcome) {
      await tab('reports');
      await root.locator(`[data-plan-report="${planId}"]:visible`).click();
      const result = document.locator(`[data-outcome="${outcome}"]`);
      await result.click();
      assert.equal(await result.getAttribute('aria-pressed'),'true');
    }
    async function initialAbnormal(code) {
      await tab('sources');
      const live = await read();
      const job = live.jobs.find(item=>item.calendar?.productCode===code && item.start<=today && item.end>=today && !item.calendar.retestCaseId);
      assert(job,`Authoritative GET lost current work for ${code}`);
      assert.equal(job.id,state.jobs.find(item=>item.calendar.productCode===code)?.id);
      assert.deepEqual([job.planId,job.completion,job.calendar.stopped??null,job.calendar.requestId??null],[null,null,null,null],
        'Authoritative period is still eligible');
      const route = new URL(page.url());
      assert.equal(route.searchParams.get('view'),'quality-inspections');
      assert.equal(route.searchParams.get('rfTab'),'sources');
      assert.notEqual(route.searchParams.get('rfModule'),'iqc');
      const beforeGroups = await root.locator('[data-period-group]').evaluateAll(groups=>groups.map(node=>({
        scope:node.dataset.periodGroup,
        expanded:node.querySelector('[data-period-toggle]')?.getAttribute('aria-expanded')
      })));
      assert(beforeGroups.some(node=>node.scope===job.calendar.scope),
        JSON.stringify({code,revision:live.revision,expectedScope:job.calendar.scope,beforeGroups}));
      const group = root.locator(`[data-period-group=${JSON.stringify(job.calendar.scope)}]`);
      const header = group.locator('[data-period-toggle]');
      const pick = group.locator(`input[data-job=${JSON.stringify(job.id)}]`);
      const expansion = await header.getAttribute('aria-expanded');
      assert(['true','false'].includes(expansion), 'The correct product group exists on the returned page');
      if (expansion==='false') await header.click();
      const snapshot = await group.evaluate(node=>({
        expanded:node.querySelector('[data-period-toggle]')?.getAttribute('aria-expanded'),
        rows:[...node.querySelectorAll('[data-period-id]')].map(row=>[row.dataset.periodId,row.querySelector('input[data-job]')?.disabled]),
      }));
      console.log(JSON.stringify({fqcReturn:{code,revision:live.revision,rfTab:route.searchParams.get('rfTab'),eligible:true,expandedBefore:expansion,...snapshot}}));
      assert.equal(snapshot.expanded,'true','Opening a collapsed product group renders its periods');
      assert(snapshot.rows.some(([id,disabled])=>id===job.id&&disabled===false),'The eligible current job has an enabled checkbox');
      await pick.check();
      assert.equal(await pick.isChecked(),true,'The current period remains selected after repaint');
      await action(root,'create-plan').click();
      await page.getByRole('dialog',{name:/建立檢查計畫|Tạo kế hoạch kiểm tra/}).locator('[type="submit"]').click();
      await document.locator('[data-field="notes"]').fill('Plan for '+code);
      const admission = await submitDocument();
      const plan = admission.documents.find(item=>item.kind==='plan' && !item.requestKind && item.flow.pendingId);
      assert.equal(plan.flow.saved.content.lines[0].jobId,job.id);
      assert.equal(admission.documents.some(item=>item.planId===plan.id),false,'pending plan has no report');
      await review(plan.id,plan.flow.pendingId);
      await enterReport(plan.id,'abnormal');
      await document.locator('[data-result-field="notes"]').fill('Synthetic original abnormal report for '+code);
      const reported = await submitDocument();
      const original = reported.documents.find(item=>item.kind==='report'&&item.planId===plan.id);
      assert(original?.flow.pendingId);
      assert.equal(reported.cases.some(item=>item.originReportId===original.id),false,'pending report does not publish a case');
      const approved = await review(original.id,original.flow.pendingId);
      return {original:find(approved.documents,original.id), item:approved.cases.find(item=>item.originReportId===original.id)};
    }

    stage = 'plan and report approval, then retest returns to report';
    const retestOrigin = await initialAbnormal(codes[1]);
    await tab('cases');
    const retestCase = root.locator(`.rf-list-panel [data-case="${retestOrigin.item.id}"]`);
    await retestCase.click();
    await action(root,'calendar-retest').click();
    await document.locator('[data-field="planStart"]').fill(today);
    await document.locator('[data-field="planEnd"]').fill(today);
    await document.locator('[data-field="reason"]').fill('Synthetic retest after investigation');
    const requested = await submitDocument();
    const retest = requested.documents.find(item=>item.retestApplicationCaseId===retestOrigin.item.id);
    assert(retest?.flow.pendingId);
    assert.equal(find(requested.cases,retestOrigin.item.id).status,retestOrigin.item.status);
    assert.equal(requested.documents.some(item=>item.kind==='report'&&item.planId===retest.id),false);
    await review(retest.id,retest.flow.pendingId);
    await tab('cases');
    await retestCase.waitFor({state:'detached'});
    await enterReport(retest.id,'pass');
    await document.locator('[data-result-field="value"]').fill('Synthetic retest pass');
    const retested = await submitDocument();
    const retestReport = retested.documents.find(item=>item.kind==='report'&&item.planId===retest.id);
    assert(retestReport?.flow.pendingId);
    assert.notEqual(find(retested.cases,retestOrigin.item.id).status,'closed');
    const closed = await review(retestReport.id,retestReport.flow.pendingId);
    assert.equal(find(closed.cases,retestOrigin.item.id).status,'closed');
    assert.deepEqual(find(closed.documents,retestOrigin.original.id).flow.active,retestOrigin.original.flow.active);
    report.checks.push('approved abnormal report routes to case; approved retest opens the report; approved passing retest closes with original unchanged');

    stage = 'disposition applies only after approval with original retained';
    const dispositionOrigin = await initialAbnormal(codes[2]);
    await tab('cases');
    await root.locator(`.rf-list-panel [data-case="${dispositionOrigin.item.id}"]`).click();
    await action(root,'calendar-disposal').click();
    await document.locator('[data-field="reason"]').fill('Synthetic reason for disposition');
    await document.locator('[data-field="disposition"]').fill('Synthetic disposition instructions');
    const disposalPending = await submitDocument();
    const disposal = disposalPending.documents.find(item=>item.kind==='disposal'&&item.caseId===dispositionOrigin.item.id);
    assert(disposal?.flow.pendingId);
    assert.equal(find(disposalPending.cases,dispositionOrigin.item.id).status,dispositionOrigin.item.status);
    const final = await review(disposal.id,disposal.flow.pendingId);
    assert.equal(find(final.cases,dispositionOrigin.item.id).status,'disposed');
    assert.deepEqual(find(final.documents,dispositionOrigin.original.id).flow.active,dispositionOrigin.original.flow.active);
    assert.equal(find(final.cases,retestOrigin.item.id).status,'closed');
    const reviewWrites = posted.length;
    await tab('reports');
    await root.locator('[data-work-state="approved-history"]').click();
    await root.locator(`[data-approved-report][data-timeline-doc="${retestOrigin.original.id}"]`).click();
    const history = page.locator('dialog.rf-timeline-dialog[open]');
    await history.getByText('Synthetic original abnormal report for '+codes[1]).waitFor();
    assert.equal(await history.locator('input,textarea,select').count(),0);
    await history.locator('[data-cancel]').click();
    assert.equal(posted.length,reviewWrites);
    assert.deepEqual(blocked,[]);
    assert.equal(posted.filter(item=>item.command==='generate').length,1+ordinaryEntries);
    assert.deepEqual(posted.filter(item=>item.command!=='generate').map(item=>item.command),[
      'configure','request','save','submit','approve',
      'create-plan','save','submit','approve','create-report','save','submit','approve',
      'request','save','submit','approve','create-report','save','submit','approve',
      'create-plan','save','submit','approve','create-report','save','submit','approve',
      'request','save','submit','approve',
    ]);
    report.checks.push('disposition closes only its own case after approval without rewriting the original report');
    assert.equal(report.iqcFailure,undefined, 'Independent IQC browser write workflow');
    report.status = 'PASS_NATIVE_SYNTHETIC_ROUTINE_FQC_IQC';
    return report;
  } catch (error) {
    const pageState = await activePage?.evaluate(() => {
      const approval = document.querySelector('#approval-panel-routine');
      const fqc = document.querySelector('#review-routine-fqc');
      return {
        view:window.ProcessSync?.destination?.view,
        navigation:document.documentElement.dataset.processNavigationStatus ?? null,
        routineTab:document.querySelector('#approval-tab-routine')?.getAttribute('aria-selected') ?? null,
        routinePanelHidden:approval?.hidden ?? null,
        fqcHidden:fqc?.closest('[data-ri-fqc]')?.hidden ?? null,
        cards:fqc?.querySelectorAll('.rf-review-list button').length ?? 0,
        selected:!!fqc?.querySelector('.rf-review-card.selected'),
        hasConfirm:!!fqc?.querySelector('.rf-approval'),
        hasSelfConfirm:!!fqc?.querySelector('[data-self-review]'),
        fqcHeading:fqc?.querySelector('h2')?.textContent?.slice(0,100) ?? null,
        alert:document.querySelector('#view-root [role="alert"]')?.textContent?.trim().slice(0,160) ?? null,
      };
    }).catch(()=>null);
    console.log(JSON.stringify({stage,checks:report.checks,iqcFailure:report.iqcFailure,pageState,transport}));
    throw new Error(`Routine FQC synthetic browser stage "${stage}": ${String(error.message).replaceAll(secret,'[redacted]').slice(0,450)}`);
  } finally {
    if (browser) await browser.close();
    if (fixture) await fixture.close();
  }
}
