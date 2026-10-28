// Full product JavaScript in an isolated synthetic DOM; no browser or business writes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto, createHash } = require('node:crypto');
const { performance } = require('node:perf_hooks');
const { pathToFileURL } = require('node:url');

const source = path.resolve(process.env.PROCESS_TEST_SOURCE || '.');
const read = name => fs.readFileSync(path.join(source, 'public/process', name), 'utf8');
const copy = value => JSON.parse(JSON.stringify(value));
const tick = () => new Promise(setImmediate);
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const actor = { id: 'synthetic-editor', name: 'Synthetic editor', role: 'admin' };
const uiKey = moduleId => moduleId === 'ipqc-ab' ? 'ipqcAB' : moduleId === 'ipqc-c' ? 'ipqcC' : moduleId;

async function fixture({ moduleId = 'fqc', editable = true, scopes = ['A:G'], pause = '', rejectScope = '', openTransfer = true } = {}) {
  const { canvasDOM } = await import(pathToFileURL(path.join(source, 'scripts/login-reentry-dom.mjs')).href);
  const dom = canvasDOM(), document = dom.document;
  document.getElementById = id => document.querySelector('#' + id);
  const host = document.createElement('main'); host.id = 'data-content'; host.dataset.activeTab = 'quality-routine-equipment'; document.body.append(host);
  let epoch = 1, delivery = 1, revision = 10, allowed = true;
  const calls = [], notices = [], storage = new Map(), wait = deferred(), paused = deferred();
  const tool = (id, name) => ({ id, assetCode: 'SYN-' + id, pieceMark: id === 'source' ? '01' : '02', name, unit: '支', enabled: true, confirmed: true, groupId: 'group', categoryId: 'cat', subcategoryId: 'sub', photoId: 'a'.repeat(64) });
  const snapshot = { equipment: [tool('source', 'Synthetic source'), tool('target', 'Synthetic target'), tool('other', 'Synthetic other')], categories: [{ id: 'cat', code: 'C01', name: 'Synthetic category' }], subcategories: [{ id: 'sub', categoryId: 'cat', name: 'Synthetic subcategory' }], groups: [{ id: 'group', categoryId: 'cat', subcategoryId: 'sub', name: 'Synthetic group' }], issues: [] };
  const control = { schemaVersion: 1, activeVersionId: 'active', reservedMarks: {}, issues: [], versions: [{ id: 'active', number: 1, status: 'approved', history: [], ...copy(snapshot) }, { id: 'draft', number: 2, status: 'draft', history: [], ...copy(snapshot) }], workflow: { generation: 'equipment-gen', revision: 1, working: copy(snapshot), cases: [], saved: null } };
  const rows = (moduleId === 'ipqc-ab' ? scopes : ['']).map((scopeKey, index) => ({ id: scopeKey ? JSON.stringify([scopeKey, 'item']) : 'item', itemId: 'item', scopeKey, code: 'SYN-' + index, name: 'Synthetic item', selectable: true, activeEquipmentId: 'source', draftEquipmentId: editable ? 'source' : '', activeInspectionMode: 'equipment', draftInspectionMode: editable ? 'equipment' : '', activeTool: '01', draftTool: editable ? '01' : '', openStatus: editable ? 'draft' : '', openVersionId: editable ? 'quality-draft' : '' }));
  const preview = { revision, modules: [{ moduleId, connected: true, workflow: { editable, generation: 'quality-gen' }, items: rows }], pending: [] };
  const timers = new Map(); let timer = 0;
  const c = { ...dom, console: { error() {}, warn() {} }, crypto: webcrypto, URL, URLSearchParams, Response, AbortController, AbortSignal, structuredClone, Map, Set, Promise, JSON, Date, Math, Intl, Number, Error,
    location: { href: 'https://synthetic.invalid/process/', pathname: '/process/', origin: 'https://synthetic.invalid' }, CSS: { escape: String }, scrollX: 0, scrollY: 0, scrollTo() {}, requestAnimationFrame() {},
    setTimeout(fn, ms) { timers.set(++timer, { fn, ms }); return timer; }, clearTimeout(id) { timers.delete(id); }, setInterval() {}, clearInterval() {},
    hasPermission: () => allowed, confirm: () => true, alert: value => notices.push(value), toast: value => notices.push(value),
    localStorage: { getItem: key => key === 'qualityMasterControl' ? JSON.stringify({ libraries: { fqc: { versions: [] } } }) : null, setItem() {}, removeItem() {} },
    sessionStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    ProcessSync: { identity: copy(actor), identityGeneration: () => epoch, captureDelivery: () => ({ delivery }), isCurrentDelivery: token => token.delivery === delivery, platformHeaders: () => ({ 'Content-Type': 'application/json', 'X-Test-Actor': c.ProcessSync.identity.id }), requiresReload: false, refresh: async () => {}, flush: async () => { if (pause === 'flush') { paused.resolve(); await wait.promise; } return true; } },
    VersionDraftUI: { mount() {}, date: () => 'synthetic-date', t: value => value, updateSync() {}, updateSaved() {} }
  };
  c.window = c; dom.events(c);
  const respond = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => copy(body) });
  c.fetch = async (url, options = {}) => {
    const parsed = new URL(url, c.location.origin), method = options.method || 'GET', body = options.body ? JSON.parse(options.body) : null;
    calls.push({ path: parsed.pathname, query: parsed.search, method, actor: options.headers?.['X-Test-Actor'], body });
    if (parsed.pathname === '/api/quality-equipment-replacement') {
      if (pause === 'preview') { paused.resolve(); await wait.promise; }
      return respond(preview);
    }
    if (parsed.pathname.endsWith('/workflow') && method === 'POST') {
      if (body.action === 'begin') { if (pause === 'begin') { paused.resolve(); await wait.promise; } return respond({ revision, control: { workflow: { generation: 'quality-gen' } } }); }
      if (parsed.searchParams.get('scope') === rejectScope && rejectScope) return respond({ error: 'DEPENDENCY_CHANGED_RECONFIRM' }, 409);
      const command = body.command;
      return respond({ revision: ++revision, receipt: { operationId: command.operationId, generation: command.generation, revision, savedId: null, caseId: null, unchanged: false } });
    }
    if (parsed.pathname === '/api/ipqc-ab') return respond({ control: { scopes: {} } });
    return respond({ control: { activeVersionId: null, versions: [] } });
  };
  vm.createContext(c); vm.runInContext(read('shared-draft-client.js'), c);
  const hook = `window.__equipmentIntentTest = { render, deleteEquipment, deleteNode, openNodeDialog, confirmNodeDialog, openEditEquipment, executeTransfer, loadTransferPreview, openTransferModal, queryAllQualityReferences, loadEquipmentReferences, equipmentReferencesSectionHTML, cancelRead(){equipmentEditRequest++;}, writeShared, read, enterExistingDraft, refreshOpenEquipmentReferences, invalidateEquipmentReferences, get refs(){return equipmentRefCache;}, get readUnavailable(){return readUnavailable;}, get working(){return working;}, get message(){return message;}, get dialog(){return transferDialog;}, install(model){host=document.querySelector('#data-content');control=model;controlActor=identity().id;revision=10;selectedVersionId=open()?.id||active()?.id||'';selectedCategory='cat';selectedSubcategory='sub';selectedGroup='group';working=open()?.status==='draft'?snapshotOf(open()):null;syncBase=working&&clone(working);syncGeneration=control.workflow?.generation||null;}, replaceDialog(){transferDialog=null;}, bumpVersion(){selectedVersionId='different-selected-version';}, get model(){return control;}};`;
  vm.runInContext(read('routine-equipment.js').replace(/\}\)\(\);\s*$/, hook + '})();'), c);
  c.__equipmentIntentTest.install(control); c.__equipmentIntentTest.render(); if(openTransfer)c.__equipmentIntentTest.openTransferModal('source');
  if (pause !== 'preview') await tick();
  const test = c.__equipmentIntentTest;
  if (test.dialog) test.dialog.targetEqId = 'target';
  const writes = () => calls.filter(call => call.method === 'POST');
  return { c, test, host, calls, writes, notices, preview, storage, paused: paused.promise, release: () => wait.resolve(), execute: () => test.executeTransfer(uiKey(moduleId)),
    rotateActor() { c.ProcessSync.identity = { ...actor, id: 'synthetic-other' }; }, rotateEpoch() { epoch++; }, rotateDelivery() { delivery++; }, revoke() { allowed = false; }, close() { host.querySelector('#routine-transfer-close')?.click(); }, tick };
}

const results = [];
async function check(name, fn) { const start = performance.now(); try { await fn(); results.push({ name, status: 'PASS', isolatedHandlerMs: +(performance.now() - start).toFixed(2) }); } catch (error) { results.push({ name, status: 'FAIL', error: error.message, isolatedHandlerMs: +(performance.now() - start).toFixed(2) }); } console.log(JSON.stringify(results.at(-1))); }

module.exports = { fixture, tick, copy };
if (require.main === module) (async () => {
  for (const moduleId of ['fqc', 'iqc', 'ipqc-c', 'ipqc-ab']) for (const editable of [true, false]) await check(`${moduleId} ${editable ? 'editable' : 'new'} draft uses guarded Apply only`, async () => {
    const f = await fixture({ moduleId, editable }), before = JSON.stringify(f.test.model); await f.execute();
    const writes = f.writes(), commands = writes.filter(row => row.body.command);
    assert.equal(commands.length, 1); assert.equal(commands[0].body.command.action, 'apply');
    assert.equal(writes.filter(row => row.body.action === 'begin').length, !editable ? 1 : 0);
    assert(commands[0].body.command.guards.length); assert(commands[0].body.command.patches.some(patch => patch.value === 'target'));
    assert.equal(JSON.stringify(f.test.model), before, 'source equipment active/draft/history remain unchanged');
    assert.match(f.test.dialog.moduleMessages[uiKey(moduleId)], /尚未手動儲存/);
  });
  for (const change of ['actor', 'epoch', 'delivery', 'requiresReload', 'close', 'version', 'target']) await check(`pending flush ${change} invalidates transfer before POST`, async () => {
    const f = await fixture({ pause: 'flush' }), task = f.execute(); await f.paused;
    if (change === 'actor') f.rotateActor(); if (change === 'epoch') f.rotateEpoch(); if (change === 'delivery') f.rotateDelivery(); if (change === 'requiresReload') f.c.ProcessSync.requiresReload = true;
    if (change === 'close') f.close(); if (change === 'version') f.test.bumpVersion(); if (change === 'target') f.test.dialog.targetEqId = 'other';
    f.release(); await task; assert.equal(f.writes().length, 0, 'stale intent must not begin/apply');
  });
  await check('Begin ACK after dialog close does not send Apply', async () => { const f = await fixture({ editable: false, pause: 'begin' }), task = f.execute(); await f.paused; f.close(); f.release(); await task; assert.equal(f.writes().filter(row => row.body.command).length, 0); });
  await check('duplicate or concurrent transfer entry is single flight', async () => { const f = await fixture({ pause: 'flush' }), first = f.execute(); await f.paused; const second = f.execute(); f.release(); await Promise.all([first, second]); assert.equal(f.writes().filter(row => row.body.command).length, 1); });
  await check('fresh pending/stale preview requires explicit reconfirmation and zero POST', async () => { const f = await fixture(); f.preview.modules[0].items[0].selectable = false; await f.execute(); assert.equal(f.writes().length, 0); assert.match(f.test.dialog.moduleMessages.fqc, /項目已變更/); });
  await check('unavailable target is rejected before Begin', async () => { const f = await fixture({ moduleId: 'iqc', editable: false }); f.test.dialog.targetEqId = 'missing'; await f.execute(); assert.equal(f.writes().length, 0); });
  await check('AB partial conflict retains exact scope and successful unsaved result', async () => { const f = await fixture({ moduleId: 'ipqc-ab', scopes: ['A:G', 'B:G'], rejectScope: 'B:G' }); await f.execute(); assert.match(f.test.dialog.moduleMessages.ipqcAB, /已套用 1/); assert.match(f.test.dialog.moduleMessages.ipqcAB, /衝突 1/); assert.match(f.test.dialog.moduleMessages.ipqcAB, /B:G \/ item/); assert.match(f.test.dialog.moduleMessages.ipqcAB, /尚未手動儲存/); });
  await check('late preview from old identity does not populate new actor UI', async () => { const f = await fixture({ pause: 'preview' }); await f.paused; f.rotateEpoch(); f.release(); await tick(); assert.equal(f.test.dialog.preview, null); assert.equal(f.writes().length, 0); });
  await check('display reference reads dispatch together; strict destructive check stays sequential', async () => {
    for (const strict of [false, true]) {
      const f = await fixture(), pending = [], dispatched = [];
      f.c.fetch = url => { dispatched.push(String(url)); return new Promise(resolve => pending.push({ url: String(url), resolve })); };
      let done = false; const task = f.test.queryAllQualityReferences('source', { strict }).then(() => { done = true; });
      await tick(); const initial = dispatched.length;
      while (!done) { for (const request of pending.splice(0)) request.resolve({ ok: true, json: async () => request.url.includes('replacement') ? { modules: [], pending: [] } : request.url.includes('ipqc-ab') ? { control: { scopes: {} } } : { control: { versions: [] } } }); await tick(); }
      await task; assert.equal(initial, strict ? 1 : 4); assert.equal(dispatched.length, 4);
    }
  });
  await check('duplicate display read is single flight with independent per-module failures', async () => {
    const f = await fixture({ openTransfer: false }); const pending = [], urls = [];
    f.c.fetch = url => { urls.push(String(url)); return new Promise(resolve => pending.push({ url: String(url), resolve })); };
    const a = f.test.loadEquipmentReferences('source', { renderAfter: false }), b = f.test.loadEquipmentReferences('source', { renderAfter: false });
    await tick(); assert.equal(urls.length, 4);
    for(const request of pending) request.resolve({ ok: !request.url.includes('iqc'), status: 403, json: async () => request.url.includes('replacement') ? { modules: [], pending: [] } : {} });
    const [first, second] = await Promise.all([a,b]); assert.equal(first, second); assert(first.iqc.unavailable); assert(first.ipqcC.unavailable); assert(first.ipqcAB.unavailable);
    assert.match(f.test.equipmentReferencesSectionHTML('source','edit'), /查詢未完成/); assert.equal(urls.length, 4);
  });
  for(const change of ['actor','epoch','delivery','version','cancel']) await check('display read '+change+' drops stale cache completion', async () => {
    const f = await fixture({ openTransfer: false }); const pending=[];
    f.c.fetch = url => new Promise(resolve=>pending.push({url:String(url),resolve}));
    const task=f.test.loadEquipmentReferences('source',{renderAfter:false}); await tick();
    if(change==='actor')f.rotateActor();if(change==='epoch')f.rotateEpoch();if(change==='delivery')f.rotateDelivery();if(change==='version')f.test.bumpVersion();if(change==='cancel')f.test.cancelRead();
    for(const request of pending)request.resolve({ok:true,json:async()=>request.url.includes('replacement')?{modules:[],pending:[]}:request.url.includes('ipqc-ab')?{control:{scopes:{}}}:{control:{versions:[]}}});
    await task;assert.equal(f.test.refs.has('source'),false);assert.equal(f.writes().length,0);
  });
  for (const moduleId of ['fqc','iqc','ipqc-c','ipqc-ab']) for (const recovery of ['matching','other-creator','wrong-scope','pending','read-failure']) await check(`${moduleId} target Begin unknown ${recovery}: no blind retry or automatic Apply`, async()=>{
    const f=await fixture({moduleId,editable:false}), raw=f.c.fetch; let begin=0,commands=0,reads=0;
    const scope=moduleId==='ipqc-ab'?'ipqc-ab:A:G':moduleId;
    f.c.fetch=async(url, options={})=>{
      const method=options.method||'GET', body=options.body&&JSON.parse(options.body);
      if(method==='POST'&&body.action==='begin'){begin++;throw Object.assign(Error('signal is aborted without reason'),{name:'AbortError'});}
      if(method==='POST'&&body.command)commands++;
      if(method==='GET'&&String(url).includes('/workflow')){
        reads++; if(recovery==='read-failure')return {ok:false,status:503,json:async()=>({error:'READ_FAILED'})};
        return {ok:true,status:200,json:async()=>({revision:11,permissions:{view:true,edit:true},control:{activeVersionId:null,versions:[{id:'shared-quality-gen',status:'draft',baseVersionId:null,creatorId:recovery==='other-creator'?'other':'synthetic-editor',snapshot:{items:[]}}],workflow:{scope:recovery==='wrong-scope'?'other':scope,generation:'quality-gen',active:{id:null},baseId:null,working:{items:[]},pendingId:recovery==='pending'?'case':null}}})};
      }
      return raw(url,options);
    };
    await f.execute(); assert.equal(begin,1);assert.equal(commands,0);assert.equal(f.storage.size,1);
    await f.execute(); assert.equal(begin,1);assert.equal(commands,0);assert.equal(reads,2);
    assert.equal(f.storage.size,recovery==='matching'?0:1);
    assert.match(f.test.dialog.moduleMessages[uiKey(moduleId)],recovery==='matching'?/尚未移轉/:/尚未確認/);
  });
  for(const moduleId of ['fqc','iqc','ipqc-c','ipqc-ab'])for (const change of ['close','epoch','delivery']) await check(moduleId+' target queued submit drains then '+change+' prevents transfer Apply',async()=>{
    const f=await fixture({moduleId,scopes:['B:G']}), raw=f.c.fetch; let release,started;
    const gate=new Promise(resolve=>{release=resolve;}), waiting=new Promise(resolve=>{started=resolve;});
    f.c.fetch=async(url,options={})=>{if(String(url).includes('permissions=1')){started();await gate;return {ok:true,status:200,json:async()=>({permissions:{view:true,edit:true,submit:true},otherReviewerAvailable:true})};}return raw(url,options);};
    const client=f.c.createSharedDraftClient({endpoint:moduleId==='ipqc-ab'?'/api/ipqc-ab/workflow?scope=B%3AG&caseMetadata=1':`/api/${moduleId}/workflow?caseMetadata=1`,actorId:'synthetic-editor',headers:()=>({'Content-Type':'application/json'})});
    const queued=client.command('quality-gen','submit',{savedId:'previous-saved',reason:'synthetic'}).catch(()=>{});await waiting;
    const task=f.execute();await tick();await tick();if(change==='close')f.close();if(change==='epoch')f.rotateEpoch();if(change==='delivery')f.rotateDelivery();release();await queued;await task;
    assert.equal(f.writes().filter(row=>row.body.command?.action==='apply').length,0);
  });
  for(const invalidation of ['successful-transfer','reference-event'])await check(invalidation+' invalidates pre-write in-flight reference reads',async()=>{
    const f=await fixture({moduleId:'iqc'}),raw=f.c.fetch,pending=[];let reads=0,hold=true;
    f.c.fetch=async(url,options={})=>{if((options.method||'GET')==='GET'&&!String(url).includes('/workflow')){
      if(String(url)==='/api/iqc')reads++;
      if(hold)return new Promise(resolve=>pending.push({url:String(url),resolve}));
    }return raw(url,options);};
    const stale=f.test.loadEquipmentReferences('source',{renderAfter:false});await tick();assert.equal(pending.length,4);hold=false;
    if(invalidation==='successful-transfer')await f.execute();else {await f.test.refreshOpenEquipmentReferences();await f.test.loadEquipmentReferences('source',{renderAfter:false});}
    assert.equal(reads,2);
    for(const request of pending)request.resolve({ok:true,json:async()=>request.url.includes('replacement')?{modules:[],pending:[]}:request.url.includes('ipqc-ab')?{control:{scopes:{}}}:{control:{versions:[{id:'stale-before-transfer',status:'draft',snapshot:{items:[{id:'old',equipmentId:'source'}]}}]}}});
    await stale;assert(!f.test.refs.get('source').iqc.draft.some(row=>row.versionId==='stale-before-transfer'));
  });
  for(const uncertainScope of ['A:G','B:G'])await check('AB '+uncertainScope+' uncertain Apply stops later scopes and retains confirmed partial success',async()=>{
    const f=await fixture({moduleId:'ipqc-ab',scopes:['A:G','B:G','B:H']}),raw=f.c.fetch,posts=[];
    f.c.fetch=async(url,options={})=>{const u=new URL(url,f.c.location.origin),body=options.body&&JSON.parse(options.body);
      if(body?.command?.action==='apply'){posts.push(u.searchParams.get('scope'));if(u.searchParams.get('scope')===uncertainScope)throw Object.assign(Error('signal is aborted without reason'),{name:'AbortError'});}
      if(u.searchParams.has('operationId'))return {ok:false,status:503,json:async()=>({error:'RECEIPT_UNAVAILABLE'})};return raw(url,options);};
    await f.execute();assert.deepEqual(posts,uncertainScope==='A:G'?['A:G']:['A:G','B:G']);assert(f.storage.size>0);
    assert.match(f.test.dialog.moduleMessages.ipqcAB,/RESULT_UNKNOWN_CHECK_BEFORE_RETRY/);assert.match(f.test.dialog.moduleMessages.ipqcAB,/B:H \/ item: 前一範圍需先唯讀核對，本次未執行/);
    assert.match(f.test.dialog.moduleMessages.ipqcAB,uncertainScope==='A:G'?/已套用 0/:/已套用 1/);
  });
  const summary = { status: results.every(row => row.status === 'PASS') ? 'PASS_BOUNDED_TRANSFER_INTENT' : 'FAIL_BOUNDED_TRANSFER_INTENT', cases: results.length, passed: results.filter(row => row.status === 'PASS').length, failed: results.filter(row => row.status === 'FAIL').length, source, hashes: Object.fromEntries(['routine-equipment.js', 'shared-draft-client.js'].map(name => [name, createHash('sha256').update(read(name)).digest('hex')])), results,
    limits: ['Actual unmodified frontend functions and shared transport run in synthetic DOM/HTTP, not actual server authorization or CAS acceptance', 'Fixture requests are in-memory; no browser, network, live records, native render/page-load or assistive-technology claim', 'Timings are isolated JavaScript handler durations only; waits and fixture setup are included'] };
  console.log(JSON.stringify(summary)); if (summary.failed) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
