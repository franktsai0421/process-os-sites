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

const changesOf=command=>command.localChanges || command.input?.scopes?.flatMap(s=>s.changes) || [command];
const patchesOf=command=>changesOf(command).flatMap(change=>change.patches||[]);
const guardsOf=command=>changesOf(command).flatMap(change=>change.guards||[]);
async function fixture({ moduleId = 'fqc', editable = true, scopes = ['A:G'], pause = '', rejectScope = '', openTransfer = true, establishInputOwner = false } = {}) {
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
  for(const row of rows)row.effectiveReference={versionId:'active',versionNumber:1,status:'approved',itemId:row.itemId,scope:row.scopeKey,checkNo:row.code,itemName:row.name};
  const preview = { revision, referenceSourceId:'source', modules: [{ moduleId, connected: true, transferDraft:editable?'ready':'open-required', workflow: { editable, generation: 'quality-gen' }, items: rows }], pending: [] };
  const timers = new Map(); let timer = 0;
  const c = { ...dom, console: { error() {}, warn() {} }, crypto: webcrypto, URL, URLSearchParams, Response, AbortController, AbortSignal, structuredClone, Map, Set, Promise, JSON, Date, Math, Intl, Number, Error,
    location: { href: 'https://synthetic.invalid/process/', pathname: '/process/', origin: 'https://synthetic.invalid' }, CSS: { escape: String }, scrollX: 0, scrollY: 0, scrollTo() {}, requestAnimationFrame() {},
    setTimeout(fn, ms) { timers.set(++timer, { fn, ms }); return timer; }, clearTimeout(id) { timers.delete(id); }, setInterval() {}, clearInterval() {},
    hasPermission: () => allowed, confirm: () => true, alert: value => notices.push(value), toast: value => notices.push(value),
    localStorage: { getItem: key => key === 'qualityMasterControl' ? JSON.stringify({ libraries: { fqc: { versions: [] } } }) : null, setItem() {}, removeItem() {} },
    sessionStorage: { get length(){return storage.size;},key:index=>[...storage.keys()][index]??null,getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    ProcessSync: { pendingState:()=>({dirty:0,inFlight:false,paused:false,blocked:false}), identity: copy(actor), identityGeneration: () => epoch, captureDelivery: () => ({ delivery }), isCurrentDelivery: token => token.delivery === delivery, platformHeaders: () => ({ 'Content-Type': 'application/json', 'X-Test-Actor': c.ProcessSync.identity.id }), requiresReload: false, refresh: async () => {}, flush: async () => { if (pause === 'flush') { paused.resolve(); await wait.promise; } return true; } },
    VersionDraftUI: { mount() {}, date: () => 'synthetic-date', t: value => value, updateSync() {}, updateSaved() {} }
  };
  c.window = c; dom.events(c);
  const respond = (body, status = 200) => Response.json(body,{status});
  let fqcRevision=1,fqcDraft=editable,fqcSaved=null,previewReads=0;
  const fqcReceipts=new Map();
  const fqcData=()=>{
    const items=preview.modules[0].items.map(row=>({id:row.itemId,equipmentId:fqcDraft?row.draftEquipmentId:row.activeEquipmentId,tool:fqcDraft?row.draftTool:row.activeTool,inspectionMode:fqcDraft?row.draftInspectionMode:row.activeInspectionMode}));
    return {revision,permissions:{view:allowed,edit:allowed,save:allowed,create:allowed,delete:allowed,submit:allowed,withdraw:allowed,approve:allowed,return:allowed,history:allowed},control:{activeVersionId:null,versions:fqcDraft?[{id:'quality-draft',status:'draft',revision:fqcRevision,baseVersionId:null,snapshot:{items}}]:[],workflow:{scope:moduleId==='ipqc-ab'?'ipqc-ab:module':moduleId,generation:'quality-gen',revision:fqcRevision,pendingId:null,baseId:null,saved:fqcSaved,active:{id:null,content:{items:[]}},working:{items}}}};
  };
  Object.assign(preview.modules[0],{activeVersion:null,openVersion:editable?{id:'quality-draft',status:'draft',revision:1}:null});
  if(moduleId==='ipqc-ab')preview.modules[0].scopes=scopes.map(key=>({scopeKey:key,connected:true,workflow:{generation:'scope-gen',editable},activeVersion:null,items:rows.filter(row=>row.scopeKey===key)}));
  c.fetch = async (url, options = {}) => {
    const parsed = new URL(url, c.location.origin), method = options.method || 'GET', body = options.body ? JSON.parse(options.body) : null;
    calls.push({ path: parsed.pathname, query: parsed.search, method, actor: options.headers?.['X-Test-Actor'], body });
    if (parsed.pathname === '/api/quality-equipment-replacement') {
      previewReads++;
      if (pause === 'preview' || (previewReads===2 && pause==='preflight')) { paused.resolve(); await wait.promise; }
      return respond(preview);
    }
    if(parsed.pathname==='/api/'+moduleId+'/workflow'){
      if(method==='GET')return parsed.searchParams.has('operationId')?respond(fqcReceipts.get(parsed.searchParams.get('operationId'))||{error:'OPERATION_NOT_FOUND'},fqcReceipts.has(parsed.searchParams.get('operationId'))?200:404):respond(fqcData());
      if(body.action==='begin-v1'){
        if(pause==='begin'){paused.resolve();await wait.promise;}fqcDraft=true;fqcRevision++;revision++;
        for(const row of preview.modules[0].items){row.openStatus='draft';row.openVersionId='quality-draft';row.draftEquipmentId=row.activeEquipmentId;row.draftTool=row.activeTool;}
        preview.revision=revision;preview.modules[0].workflow.editable=true;preview.modules[0].openVersion={id:'quality-draft',status:'draft',revision:fqcRevision};
        const receipt={operationId:body.begin.operationId,generation:'quality-gen',revision:fqcRevision,savedId:null,caseId:null,unchanged:false},result={...fqcData(),receipt,operationKind:'begin-v1'};fqcReceipts.set(receipt.operationId,result);return respond(result);
      }
      const command=body.command;
      if(pause==='save-ack'){paused.resolve();await wait.promise;}
      const rejected=rejectScope&&command.input?.scopes?.find(scope=>scope.scope===rejectScope);
      if(rejected)return respond({
        requestId:webcrypto.randomUUID(),error:'DEPENDENCY_CHANGED_RECONFIRM',
        details:{scope:rejected.scope,path:rejected.changes[0].guards[0].path}
      },409);
      if(command.equipmentTransferOpen){fqcDraft=true;preview.modules[0].transferDraft='ready';}
      fqcRevision++;revision++;preview.revision=revision;
      for(const patch of patchesOf(command)){const row=preview.modules[0].items.find(row=>row.itemId===patch.path[1].id);row[patch.path[2]==='tool'?'draftTool':patch.path[2]==='inspectionMode'?'draftInspectionMode':'draftEquipmentId']=patch.value;}
      fqcSaved={id:'synthetic-saved-'+command.operationId,revision:fqcRevision,content:copy(fqcData().control.workflow.working)};
      const receipt={operationId:command.operationId,generation:command.generation,revision:fqcRevision,savedId:fqcSaved.id,caseId:null,unchanged:false},result={...fqcData(),receipt};fqcReceipts.set(receipt.operationId,result);return respond(result);
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
  const hook = `window.__equipmentIntentTest = { targetFqcClient, render, deleteEquipment, deleteNode, openNodeDialog, confirmNodeDialog, openEditEquipment, executeTransfer, loadTransferPreview, openTransferModal, queryAllQualityReferences, loadEquipmentReferences, equipmentReferencesSectionHTML, cancelRead(){equipmentEditRequest++;}, writeShared, read, enterExistingDraft, refreshOpenEquipmentReferences, invalidateEquipmentReferences, get refs(){return equipmentRefCache;}, get readUnavailable(){return readUnavailable;}, get working(){return working;}, get message(){return message;}, get dialog(){return transferDialog;}, install(model){host=document.querySelector('#data-content');control=model;controlActor=identity().id;revision=10;selectedVersionId=open()?.id||active()?.id||'';selectedCategory='cat';selectedSubcategory='sub';selectedGroup='group';working=open()?.status==='draft'?snapshotOf(open()):null;syncBase=working&&clone(working);syncGeneration=control.workflow?.generation||null;if(${establishInputOwner})rememberInputOwner();}, replaceDialog(){transferDialog=null;}, bumpVersion(){selectedVersionId='different-selected-version';}, get model(){return control;}};`;
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
async function check(name, fn) {
  const start=performance.now();
  let timer,status='PASS',error;
  try {
    const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Scenario did not settle')),30000);});
    await Promise.race([fn(),deadline]);
  } catch (cause) {
    status='FAIL';error=cause.message;
  } finally { clearTimeout(timer); }
  const result={name,status,...(error?{error}:{}),isolatedHandlerMs:+(performance.now()-start).toFixed(2)};
  results.push(result);console.log(JSON.stringify(result));
}

module.exports = { fixture, tick, copy };
if (require.main === module) (async () => {
  await check('preview distinguishes loading, incomplete, zero, referenced and locked', async () => {
    const f = await fixture({pause:'preview'});
    const rendered = () => f.host.querySelector('#routine-transfer-backdrop').textContent;
    assert.match(rendered(), /查詢中/);
    assert.doesNotMatch(rendered(), /直接引用 0/);
    f.preview.modules.push({moduleId:'iqc',connected:false,items:[]},
      {moduleId:'ipqc-ab',connected:true,items:[]},
      {moduleId:'ipqc-c',connected:true,items:[{id:'locked',itemId:'locked',activeEquipmentId:'source',draftEquipmentId:'',selectable:false,effectiveReference:{versionId:'v',versionNumber:1,status:'approved',itemId:'locked',scope:'',checkNo:'Locked'}}]});
    f.release();
    await f.tick();
    for (const message of [/模組未接入或資料不完整/, /直接引用 0 筆，可選 0 筆/, /直接引用 1 筆，可選 0 筆/, /直接引用 1 筆，可選 1 筆/]) assert.match(rendered(),message);
    f.test.dialog.previewError='Synthetic read failure';
    f.test.render();
    assert.match(rendered(),/查詢失敗/);
    assert.doesNotMatch(rendered(),/直接引用 0/);
    assert.equal(f.writes().length,0);
  });
  for (const moduleId of ['fqc', 'iqc', 'ipqc-c', 'ipqc-ab']) for (const editable of [true, false]) await check(`${moduleId} ${editable ? 'editable' : 'new'} draft uses its confirmed guarded transaction`, async () => {
    const f = await fixture({ moduleId, editable }), before = JSON.stringify(f.test.model); await f.execute();
    const writes = f.writes(), commands = writes.filter(row => row.body.command);
    assert.equal(commands.length, 1); assert.equal(commands[0].body.command.action, 'save');
    assert.equal(writes.length,1);assert.equal(commands[0].body.command.equipmentTransferOpen,editable?undefined:true);
    assert(guardsOf(commands[0].body.command).length); assert(patchesOf(commands[0].body.command).some(patch => patch.value === 'target'));
    assert.equal(JSON.stringify(f.test.model), before, 'source equipment active/draft/history remain unchanged');
    assert.match(f.test.dialog.moduleMessages[uiKey(moduleId)], /已移轉並存取/);
  });
  for(const field of ['dirty','inFlight','paused','blocked'])await check('pending local '+field+' prevents transfer',async()=>{
    const f=await fixture();f.c.ProcessSync.pendingState=()=>({[field]:field==='dirty'?1:true});
    await f.execute();assert.equal(f.writes().length,0);assert.match(f.test.dialog.moduleMessages.fqc,/同步中的變更/);
  });
  for (const change of ['actor', 'epoch', 'delivery', 'requiresReload', 'close', 'version', 'target']) await check(`pending reference preflight ${change} invalidates transfer before POST`, async () => {
    const f = await fixture({ pause: 'preflight' }), task = f.execute(); await f.paused;
    if (change === 'actor') f.rotateActor(); if (change === 'epoch') f.rotateEpoch(); if (change === 'delivery') f.rotateDelivery(); if (change === 'requiresReload') f.c.ProcessSync.requiresReload = true;
    if (change === 'close') f.close(); if (change === 'version') f.test.bumpVersion(); if (change === 'target') f.test.dialog.targetEqId = 'other';
    f.release(); await task; assert.equal(f.writes().length, 0, 'stale intent must not begin/apply');
  });
  await check('Atomic Save ACK after dialog close does not send a second write', async () => { const f = await fixture({ editable: false, pause: 'save-ack' }), task = f.execute(); await f.paused; f.close(); f.release(); await task; assert.equal(f.writes().length,1);assert.equal(f.writes()[0].body.command.action,'save'); });
  await check('duplicate or concurrent transfer entry is single flight', async () => { const f = await fixture({ pause: 'preflight' }), first = f.execute(); await f.paused; const second = f.execute(); f.release(); await Promise.all([first, second]); assert.equal(f.writes().filter(row => row.body.command).length, 1); });
  await check('draft-only equipment can still be explicitly selected and saved',async()=>{
    const f=await fixture({moduleId:'fqc',pause:'preview'});
    const row=f.preview.modules[0].items[0];
    Object.assign(row,{activeEquipmentId:'other',effectiveReference:null,draftEquipmentId:'source',openStatus:'draft',openVersionId:'quality-draft'});
    f.release();await tick();
    const extra=f.host.querySelector('[data-transfer-extra="fqc"]');assert(extra && !extra.open);
    assert.match(f.host.querySelector('.routine-transfer-module-head').textContent,/直接引用 0 筆，可選 0 筆/);
    assert.equal(f.test.dialog.selection.fqc.size,0);
    extra.open=true;const check=extra.querySelector('[data-transfer-check]');check.checked=true;check.onchange();
    assert(f.test.dialog.selection.fqc.has(row.id));await f.execute();
    assert.equal(f.writes().filter(call=>call.body?.command?.action==='save').length,1);
  });
  await check('fresh pending/stale preview requires explicit reconfirmation and zero POST', async () => { const f = await fixture(); f.preview.modules[0].items[0].selectable = false; await f.execute(); assert.equal(f.writes().length, 0); assert.match(f.test.dialog.moduleMessages.fqc, /草稿或資料修訂已變更/); });
  for(const moduleId of ['fqc','iqc','ipqc-ab','ipqc-c']){
    for(const visual of (['iqc','ipqc-ab'].includes(moduleId)?[false,true]:[false])){
      await check(moduleId+' protects a concurrently '+(visual?'visual':'cleared')+' equipment choice',async()=>{
        const f=await fixture({moduleId}),row=f.preview.modules[0].items[0],key=uiKey(moduleId);
        row.draftEquipmentId='';if(visual)row.draftInspectionMode='visual';
        await f.test.loadTransferPreview();let message;f.c.confirm=text=>{message=text;return false;};
        await f.execute();assert.equal(f.writes().length,0);assert.match(message,visual?/目視/:/已清空檢具/);
        assert(message.includes(row.code)&&message.includes('SYN-target')&&message.includes('保留目前'));
        assert.equal(row.draftEquipmentId,'');f.c.confirm=()=>true;await f.execute();
        const command=f.writes().find(call=>call.body?.command)?.body.command;
        assert.equal(command?.action,'save');
        assert(guardsOf(command).some(g=>g.path.at(-1)==='equipmentId' && g.value===''));
        if(visual)assert(guardsOf(command).some(g=>g.path.at(-1)==='inspectionMode' && g.value==='visual'));
        assert.match(f.test.dialog.moduleMessages[key],/已移轉並存取草稿/);
      });
    }
  }
  for(const moduleId of ['fqc','iqc','ipqc-ab','ipqc-c']){
    await check(moduleId+' keeps edits to a different field and a different item',async()=>{
      const f=await fixture({moduleId}),items=f.preview.modules[0].items,row=items[0];
      row.name='Latest shared name';
      const sibling={...row,id:row.scopeKey?JSON.stringify([row.scopeKey,'sibling']):'sibling',itemId:'sibling',effectiveReference:{...row.effectiveReference,itemId:'sibling'},name:'Other shared edit',draftEquipmentId:'other'};
      items.push(sibling);await f.execute();
      const command=f.writes().find(call=>call.body?.command)?.body.command;
      assert(command && patchesOf(command).length);
      const fields=moduleId==='fqc'?['equipmentId','tool']:moduleId==='ipqc-c'?['equipmentId']:['equipmentId','inspectionMode'];
      assert(patchesOf(command).every(p=>p.path[1].id===row.itemId && fields.includes(p.path[2])));
      assert.equal(row.name,'Latest shared name');assert.equal(sibling.draftEquipmentId,'other');assert.equal(sibling.name,'Other shared edit');
    });
  }
  await check('unavailable target is rejected before Begin', async () => { const f = await fixture({ moduleId: 'iqc', editable: false }); f.test.dialog.targetEqId = 'missing'; await f.execute(); assert.equal(f.writes().length, 0); });
  await check('AB named scope conflict rejects its entire module Save',async()=>{
    const f=await fixture({moduleId:'ipqc-ab',scopes:['A:G','B:G'],rejectScope:'B:G'});await f.execute();assert.equal(f.test.dialog.moduleStatus.ipqcAB,'error');
    assert(!f.test.dialog.moduleMessages.ipqcAB.includes('已移轉並存取'));assert.equal(f.writes().filter(r=>r.body?.command?.action==='save').length,1);
  });
  await check('late preview from old identity does not populate new actor UI', async () => { const f = await fixture({ pause: 'preview' }); await f.paused; f.rotateEpoch(); f.release(); await tick(); assert.equal(f.test.dialog.preview, null); assert.equal(f.writes().length, 0); });
  await check('display uses one common revision; strict destructive check stays sequential', async () => {
    for (const strict of [false, true]) {
      const f = await fixture(), pending = [], dispatched = [];
      f.c.fetch = url => { dispatched.push(String(url)); return new Promise(resolve => pending.push({ url: String(url), resolve })); };
      let done = false; const task = f.test.queryAllQualityReferences('source', { strict }).then(() => { done = true; });
      await tick(); const initial = dispatched.length;
      while (!done) { for (const request of pending.splice(0)) request.resolve({ ok: true, json: async () => request.url.includes('replacement') ? { modules: [], pending: [] } : request.url.includes('ipqc-ab') ? { control: { scopes: {} } } : { control: { versions: [] } } }); await tick(); }
      await task; assert.equal(initial,1);assert.equal(dispatched.length,strict?4:1);
    }
  });
  await check('duplicate display read is single flight with independent per-module failures', async () => {
    const f = await fixture({ openTransfer: false }); const pending = [], urls = [];
    f.c.fetch = url => { urls.push(String(url)); return new Promise(resolve => pending.push({ url: String(url), resolve })); };
    const a = f.test.loadEquipmentReferences('source', { renderAfter: false }), b = f.test.loadEquipmentReferences('source', { renderAfter: false });
    await tick(); assert.equal(urls.length, 1);
    for(const request of pending)request.resolve({ok:true,json:async()=>f.preview});
    const [first, second] = await Promise.all([a,b]); assert.equal(first, second); assert(first.iqc.unavailable); assert(first.ipqcC.unavailable); assert(first.ipqcAB.unavailable);
    assert.match(f.test.equipmentReferencesSectionHTML('source','edit'), /查詢未完成/); assert.equal(urls.length, 1);
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
    const f=await fixture({moduleId,editable:false});
    const endpoint=moduleId==='ipqc-ab'?'/api/ipqc-ab/workflow?scope=A%3AG&caseMetadata=1':'/api/'+moduleId+'/workflow?caseMetadata=1';
    const key='routine-equipment-target-begin:synthetic-editor:'+endpoint,marker=JSON.stringify({actorId:'synthetic-editor',endpoint,recovery});
    f.storage.set(key,marker);await f.execute();await f.execute();assert.equal(f.writes().length,0);assert.equal(f.storage.get(key),marker);assert.equal(f.test.dialog.moduleStatus[uiKey(moduleId)],'error');
  });
  for(const moduleId of ['fqc','iqc','ipqc-c','ipqc-ab'])for (const change of ['close','epoch','delivery']) await check(moduleId+' target queued submit drains then '+change+' prevents transfer Apply',async()=>{
    const f=await fixture({moduleId,scopes:['B:G']}), raw=f.c.fetch; let release,started;
    const gate=new Promise(resolve=>{release=resolve;}), waiting=new Promise(resolve=>{started=resolve;});
    f.c.fetch=async(url,options={})=>{if(String(url).includes('permissions=1')){started();await gate;return {ok:true,status:200,json:async()=>({permissions:{view:true,edit:true,submit:true},otherReviewerAvailable:true})};}return raw(url,options);};
    const client=f.c.createSharedDraftClient({endpoint:moduleId==='ipqc-ab'?'/api/ipqc-ab/workflow?scope=B%3AG&caseMetadata=1':`/api/${moduleId}/workflow?caseMetadata=1`,actorId:'synthetic-editor',headers:()=>({'Content-Type':'application/json'})});
    const queued=client.command('quality-gen','submit',{savedId:'previous-saved',reason:'synthetic'}).catch(()=>{});await waiting;
    const task=f.execute();await tick();await tick();if(change==='close')f.close();if(change==='epoch')f.rotateEpoch();if(change==='delivery')f.rotateDelivery();release();await queued;await task;
    assert.equal(f.writes().filter(row=>['apply','save'].includes(row.body.command?.action)).length,0);
  });
  for(const invalidation of ['successful-transfer','reference-event'])await check(invalidation+' invalidates pre-write in-flight reference reads',async()=>{
    const f=await fixture({moduleId:'iqc'}),raw=f.c.fetch,pending=[];let reads=0,hold=true;
    f.c.fetch=async(url,options={})=>{if((options.method||'GET')==='GET'&&!String(url).includes('/workflow')){
      if(String(url).includes('/api/quality-equipment-replacement'))reads++;
      if(hold)return new Promise(resolve=>pending.push({url:String(url),resolve}));
    }return raw(url,options);};
    const stale=f.test.loadEquipmentReferences('source',{renderAfter:false});await tick();assert.equal(pending.length,1);hold=false;
    if(invalidation==='successful-transfer')await f.execute();else {await f.test.refreshOpenEquipmentReferences();await f.test.loadEquipmentReferences('source',{renderAfter:false});}
    assert.equal(reads,invalidation==='successful-transfer'?3:2);
    for(const request of pending)request.resolve({ok:true,json:async()=>request.url.includes('replacement')?{modules:[],pending:[]}:request.url.includes('ipqc-ab')?{control:{scopes:{}}}:{control:{versions:[{id:'stale-before-transfer',status:'draft',snapshot:{items:[{id:'old',equipmentId:'source'}]}}]}}});
    await stale;const cached=f.test.refs.get('source');assert(!cached?.iqc?.draft.some(row=>row.versionId==='stale-before-transfer'));
  });
  await check('AB multi-scope Save uses one atomic guarded command',async()=>{
    const f=await fixture({moduleId:'ipqc-ab',scopes:['A:G','B:G']});await f.execute();const writes=f.writes().filter(r=>r.body?.command);assert.equal(writes.length,1);assert.equal(writes[0].body.command.action,'save');assert.deepEqual(writes[0].body.command.input.scopes.map(s=>s.scope),['A:G','B:G']);
  });
  for(const moduleId of ['fqc','iqc','ipqc-c','ipqc-ab'])await check(moduleId+' already matching target does not resend Apply or Begin',async()=>{
    const f=await fixture({moduleId}),row=f.preview.modules[0].items[0];row.draftEquipmentId='target';row.draftTool='02';row.savedChoice={id:'existing-save',equipmentId:'target',mode:'equipment',tool:'02'};await f.test.loadTransferPreview();await f.execute();
    assert.equal(f.writes().length,0);assert.match(f.test.dialog.moduleMessages[uiKey(moduleId)],/已相同 1/);
  });
  for(const field of ['draftInspectionMode','draftTool'])await check('same equipment still repairs selected '+field+' with original guard',async()=>{
    const moduleId=field==='draftTool'?'fqc':'iqc',f=await fixture({moduleId}),row=f.preview.modules[0].items[0];row.draftEquipmentId='target';row[field]='manual';await f.test.loadTransferPreview();await f.execute();
    const command=f.writes().find(row=>row.body.command).body.command;assert.equal(command.action,'save');assert(guardsOf(command).some(row=>row.value==='manual'));
  });
  for(const moduleId of ['fqc','iqc','ipqc-c','ipqc-ab'])await check(moduleId+' stale target generation rejects before POST',async()=>{
    const f=await fixture({moduleId});(moduleId==='ipqc-ab'?f.preview.modules[0].scopes[0]:f.preview.modules[0]).workflow.generation='peer-generation';await f.execute();assert.equal(f.writes().length,0);assert.match(f.test.dialog.moduleMessages[uiKey(moduleId)],/世代/);
  });
  for(const rawMarker of ['{invalid',JSON.stringify({actorId:'synthetic-editor',scope:'fqc',endpoint:'/api/fqc/workflow?caseMetadata=1',intent:'other',generation:null,activeVersionId:null})])await check('unidentified target marker remains byte-identical through departure',async()=>{
    const f=await fixture(),key='routine-equipment-target-begin:synthetic-editor:/api/fqc/workflow?caseMetadata=1';f.storage.set(key,rawMarker);await f.execute();assert.equal(f.writes().length,0);assert.equal(f.storage.get(key),rawMarker);
    // Actual local cleanup may discard the dialog, never its already-sent evidence.
    await f.c.RoutineEquipmentUI.navigation.canLeave();f.c.RoutineEquipmentUI.navigation.reset();assert.equal(f.storage.get(key),rawMarker);
  });
  await check('target Begin marker must persist before dispatch',async()=>{
    for(const moduleId of ['fqc','iqc']){const f=await fixture({moduleId,editable:false});f.c.sessionStorage.setItem=()=>{};await f.execute();assert.equal(f.writes().length,0);assert.match(f.test.dialog.moduleMessages[uiKey(moduleId)],/待確認/);}
  });
  for(const moduleId of ['fqc','iqc','ipqc-c','ipqc-ab'])await check(moduleId+' matching current target cannot bypass unknown Apply or 404 receipt',async()=>{
    const f=await fixture({moduleId}),raw=f.c.fetch;let posts=0;
    f.c.fetch=async(url,options={})=>{const u=new URL(url,f.c.location.origin),body=options.body&&JSON.parse(options.body);if(u.searchParams.has('operationId'))return Response.json({error:'OPERATION_NOT_FOUND'},{status:404});if(body?.command?.action===('save')){
      posts++;await raw(url,options);const row=f.preview.modules[0].items[0];row.draftEquipmentId='target';row.draftTool='02';throw Error('Synthetic committed ACK lost');
    }return raw(url,options);};
    await f.execute();const marker=[...f.storage];assert(marker.length);await f.test.loadTransferPreview();await f.execute();assert.equal(posts,1);assert.deepEqual([...f.storage],marker);assert.equal(f.test.dialog.moduleStatus[uiKey(moduleId)],'unknown');
  });
  await check('AB same-scope failure preserves a previously saved row',async()=>{
    const f=await fixture({moduleId:'ipqc-ab',rejectScope:'A:G'}),entry=f.preview.modules[0],first=entry.items[0];entry.items.push({...copy(first),id:JSON.stringify(['A:G','other']),itemId:'other',effectiveReference:{...first.effectiveReference,itemId:'other'}});first.draftEquipmentId='target';first.savedChoice={id:'previous',equipmentId:'target',mode:'equipment'};
    await f.test.loadTransferPreview();f.test.dialog.selection.ipqcAB.add(JSON.stringify(['A:G','other']));await f.execute();assert.equal(f.test.dialog.moduleStatus.ipqcAB,'error');
    const cmd=f.writes().find(row=>row.body.command).body.command;assert(patchesOf(cmd).every(patch=>patch.path[1].id==='other'));
  });
  const summary = { status: results.every(row => row.status === 'PASS') ? 'PASS_BOUNDED_TRANSFER_INTENT' : 'FAIL_BOUNDED_TRANSFER_INTENT', cases: results.length, passed: results.filter(row => row.status === 'PASS').length, failed: results.filter(row => row.status === 'FAIL').length, source, hashes: Object.fromEntries(['routine-equipment.js', 'shared-draft-client.js'].map(name => [name, createHash('sha256').update(read(name)).digest('hex')])), results,
    limits: ['Actual unmodified frontend functions and shared transport run in synthetic DOM/HTTP, not actual server authorization or CAS acceptance', 'Fixture requests are in-memory; no browser, network, live records, native render/page-load or assistive-technology claim', 'Timings are isolated JavaScript handler durations only; waits and fixture setup are included'] };
  console.log(JSON.stringify(summary)); if (summary.failed) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
