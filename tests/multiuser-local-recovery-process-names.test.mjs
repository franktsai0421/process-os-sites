// Real PROCESS name binder + real local recovery helpers; isolated DOM/storage/transport ports.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { webcrypto } from 'node:crypto';
import { canvasDOM } from '../scripts/login-reentry-dom.mjs';
const require = createRequire(import.meta.url), ts = require('typescript');
const source = fs.readFileSync(new URL('../public/process/app.js', import.meta.url), 'utf8');
const ast = ts.createSourceFile('app.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const binder = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'bindProcessMasterName').getText(ast);
const helper = fs.readFileSync(new URL('../public/process/local-draft-recovery.js', import.meta.url), 'utf8');
const session = fs.readFileSync(new URL('../public/process/local-draft-recovery-session.js', import.meta.url), 'utf8');
const turn = () => new Promise(setImmediate);
const clone = value => JSON.parse(JSON.stringify(value));
function lockPort() {
  const held = new Set();
  return { held, request(name, _options, fn) { if (held.has(name)) return Promise.resolve(fn(null)); held.add(name); return Promise.resolve(fn({ name })).finally(() => held.delete(name)); } };
}
function fixture(options = {}) {
  const store = options.store || new Map(), locks = options.locks === undefined ? lockPort() : options.locks;
  const { document, events } = canvasDOM();
  const create = document.createElement;
  document.createElement = tag => { const node = create(tag); node.dataset = new Proxy(node.dataset, { set(target, name, value) { target[name] = String(value); node.attrs['data-' + String(name).replace(/[A-Z]/g, c => '-' + c.toLowerCase())] = String(value); return true; } }); return node; };
  let epoch = options.epoch ?? 1, actor = { id: options.actor || 'actor-a' };
  const flow = { generation: 'g1', revision: 1, saved: { id: 's1' }, pendingId: null, working: { CUT: [{ id: 'one', name: 'Original' }] } };
  let permission = { view: true, edit: true }, readHook = null, confirmHook = null, mode = 'ok', sequence = options.sequence ?? 0, unknown = false, quota = false, sendError = null;
  const counters = { posts: 0, reads: 0, receiptReads: 0, fullPaints: 0, writes: 0, removes: [], getKeys: [] }, notices = [], prompts = [], commands = [], timers = new Map();
  let timerSeq = 0;
  const storage = { get length() { return store.size; }, key: i => [...store.keys()][i] ?? null, getItem(key) { counters.getKeys.push(key); return store.get(key) ?? null; }, setItem(key, raw) { counters.writes++; if (quota) throw Object.assign(Error('quota'), { name: 'QuotaExceededError' }); store.set(key, raw); }, removeItem(key) { counters.removes.push(key); store.delete(key); }, clear() { throw Error('UNRELATED_STORAGE_CLEAR'); } };
  const client = { hasUnknown: () => unknown, permission: key => permission[key] };
  const result = command => ({ receipt: { operationId: command.operationId, generation: command.generation, revision: flow.revision, savedId: flow.saved.id, caseId: null, unchanged: false }, control: { workflow: clone(flow) }, permissions: { ...permission } });
  const shared = { rejectionCapability: () => null, isConfirmedRejection: () => false, flow: () => flow, client: () => client, discardRejected: () => !unknown,
    load: async () => { counters.reads++; await readHook?.(counters.reads); },
    readRecovery: async () => { counters.reads++; await readHook?.(counters.reads); return { control: { workflow: clone(flow) }, permissions: { ...permission } }; },
    preparePatch: (_scope, patches, guards) => ({ action: 'apply', generation: flow.generation, operationId: 'operation-' + (++sequence), patches, guards }),
    finishPreparedPatch: async (_scope, _command, response) => response,
    dispatchPreparedPatch: async (_scope, command, options) => { assert.equal(options.assertDispatch(command), true); if (sendError?.notSent) throw sendError; counters.posts++; commands.push(clone(command)); if (sendError) throw sendError; if (mode === 'unknown') { unknown = true; throw Error('RESULT_UNKNOWN_CHECK_BEFORE_RETRY'); } for (const patch of command.patches) flow.working[patch.path[0]].find(row => row.id === patch.path[1].id).name = patch.value; flow.revision++; return result(command); },
    receiptRecovery: async (_scope, reference) => { counters.receiptReads++; if (mode === '404') throw Object.assign(Error('OPERATION_NOT_FOUND'), { status: 404 }); counters.reads++; await readHook?.(counters.reads); unknown = false; const answer = result(reference); if (mode === 'bad-receipt') answer.receipt.operationId = 'wrong'; return answer; },
  };
  const window = events({ MasterDataWorkflow: { shared }, ProcessSync: { identity: actor, identityGeneration: () => epoch }, crypto: webcrypto, navigator: { locks }, localStorage: storage, sessionStorage: storage,
    setTimeout(fn) { const id = ++timerSeq; timers.set(id, fn); return id; }, clearTimeout(id) { timers.delete(id); }, sharedDraftErrorMessage: error => error.message });
  const box = vm.createContext({ window, document, TextEncoder, Uint8Array, setTimeout: window.setTimeout, clearTimeout: window.clearTimeout, confirm: text => { prompts.push(text); return confirmHook ? confirmHook() : true; }, toast: text => notices.push(text), updateProcessSharedStatus: () => counters.fullPaints++, editableProcessMasterData: () => flow.pendingId || permission.edit !== true ? null : flow.working, processMasterCatalogMatches: snapshot => Object.values(snapshot).flat() });
  vm.runInContext(helper, box); vm.runInContext(session, box); vm.runInContext('const processMasterNameBindings=new Set();\n' + binder, box);
  const template = document.createElement('section'); template.className = 'master-template'; template.dataset.templateKey = 'preset';
  const label = document.createElement('label'); label.className = 'template-name-field';
  const input = document.createElement('input'); input.value = 'Original'; label.append(input); template.append(label); document.body.append(template); box.bindProcessMasterName(input);
  const fill = (value, composing = false) => { input.value = value; input.oninput({ isComposing: composing }); };
  const tick = () => { const pending = [...timers.values()]; timers.clear(); pending.forEach(fn => fn()); };
  const close = async () => { window.dispatchEvent({ type: 'pagehide' }); await turn(); };
  return { input, window, document, store, locks, storage, counters, notices, prompts, commands, fill, tick, close, flow: () => flow, read: hook => readHook = hook, confirm: hook => confirmHook = hook, mode: value => mode = value, reject: error => sendError = error, quota: value => quota = value, permissions: value => permission = { ...permission, ...value }, epoch: value => epoch = value, actor: id => { actor = { id }; window.ProcessSync.identity = actor; }, records: () => (input.processMasterNameListRecovery()?.items || []).map(item => ({ ...item, ...JSON.parse(store.get(item.key) || '{}') })) };
}
async function savedSource(options) {
  const f = fixture(options); await turn(); f.fill('我的名稱 / tên cũ'); f.tick(); const record = f.records().find(item => item.kind === 'local'); assert(record); await f.close(); return { f, record };
}
void test('100 typed edits use no GET/POST/full repaint and only one debounced storage write', async () => {
  const f = fixture(); await turn(); for (let i = 0; i < 100; i++) f.fill('Name ' + i);
  assert.equal(f.counters.writes, 0); assert.equal(f.counters.posts, 0); assert.equal(f.counters.reads, 0); assert.equal(f.counters.fullPaints, 0);
  f.tick(); assert.equal(f.counters.writes, 1); await f.close();
});
void test('startup/preview do not hydrate; explicit historical-epoch restore performs exactly two GETs and no POST', async () => {
  const { f, record } = await savedSource({ epoch: 7 }); const next = fixture({ store: f.store, locks: f.locks, epoch: 1 }); await turn();
  assert.equal(next.input.value, 'Original'); assert.equal(next.counters.reads, 0); assert.equal((await next.input.processMasterNamePreviewRecovery(record.key)).payload.desired, '我的名稱 / tên cũ');
  assert.equal(next.counters.reads, 0); await next.input.processMasterNameRestoreRecovery(record.key);
  assert.equal(next.input.value, '我的名稱 / tên cũ'); assert.equal(next.counters.reads, 2); assert.equal(next.counters.posts, 0); await next.close();
});
for (const [name, change, pattern] of [
  ['base revision', f => f.flow().revision++, /BASE_CONFLICT/],
  ['generation', f => f.flow().generation = 'g2', /DEPENDENCY_CHANGED/],
  ['edit permission', f => f.permissions({ edit: false }), /DEPENDENCY_CHANGED|FORBIDDEN/],
  ['view permission', f => f.permissions({ view: false }), /FORBIDDEN|VIEW_PERMISSION/],
  ['pending review', f => f.flow().pendingId = 'case', /DEPENDENCY_CHANGED|PENDING/],
]) {
  void test(`restore refuses current ${typeof name === 'string' ? name : 'fixture'} change without replacing input`, async () => {
    const { f, record } = await savedSource(), next = fixture({ store: f.store, locks: f.locks }); await turn(); next.read(() => change(next));
    await assert.rejects(next.input.processMasterNameRestoreRecovery(record.key), pattern); assert.equal(next.input.value, 'Original'); assert.equal(next.counters.posts, 0); assert(f.store.has(record.key)); await next.close();
  });
}
for (const [name, change, pattern] of [
  ['new local input', f => f.fill('Newer input'), /LOCAL_CHANGED/],
  ['live epoch', f => f.epoch(2), /DEPENDENCY_CHANGED/],
  ['account', f => f.actor('actor-b'), /DEPENDENCY_CHANGED/],
  ['saved ID', f => f.flow().saved.id = 's2', /DRAFT_REVISION_CHANGED/],
  ['second-read edit permission', f => f.read(() => f.permissions({ edit: false })), /DEPENDENCY_CHANGED|FORBIDDEN/],
]) {
  void test(`confirmation cannot overwrite after ${typeof name === 'string' ? name : 'fixture'} changes`, async () => {
    const { f, record } = await savedSource(), next = fixture({ store: f.store, locks: f.locks }); await turn(); next.confirm(() => { change(next); return true; });
    await assert.rejects(next.input.processMasterNameRestoreRecovery(record.key), pattern); assert.notEqual(next.input.value, '我的名稱 / tên cũ'); assert.equal(next.counters.posts, 0); await next.close();
  });
}
void test('IME starting during first restore read prevents confirmation and preserves composing text', async () => {
  const { f, record } = await savedSource(), next = fixture({ store: f.store, locks: f.locks }); await turn();
  next.read(() => { next.input.dispatchEvent({ type: 'compositionstart' }); next.fill('正在組字', true); });
  await assert.rejects(next.input.processMasterNameRestoreRecovery(record.key), /LOCAL_CHANGED/); assert.equal(next.prompts.length, 0); assert.equal(next.input.value, '正在組字'); await next.close();
});
void test('Cancel after preview neither restores nor performs second GET', async () => {
  const { f, record } = await savedSource(), next = fixture({ store: f.store, locks: f.locks }); await turn(); next.confirm(() => false);
  assert.equal(await next.input.processMasterNameRestoreRecovery(record.key), false); assert.equal(next.counters.reads, 1); assert.equal(next.input.value, 'Original'); assert(f.store.has(record.key)); await next.close();
});
void test('active source runtime cannot be restored or discarded by another tab', async () => {
  const f = fixture(); await turn(); f.fill('Live input'); f.tick(); const record = f.records()[0], next = fixture({ store: f.store, locks: f.locks }); await turn();
  await assert.rejects(next.input.processMasterNameRestoreRecovery(record.key), /RECOVERY_IN_USE/);
  await assert.rejects(next.input.processMasterNameDiscardRecovery(record.key), /RECOVERY_IN_USE/); assert(f.store.has(record.key)); assert.equal(next.counters.reads, 0); await f.close(); await next.close();
});
void test('unclaimed/no-Web-Locks source cannot be read even by a lock-capable receiver', async () => {
  const { f, record } = await savedSource({ locks: null }), next = fixture({ store: f.store }); await turn();
  await assert.rejects(next.input.processMasterNamePreviewRecovery(record.key), /SOURCE_LEASE_UNAVAILABLE/);
  await assert.rejects(next.input.processMasterNameRestoreRecovery(record.key), /SOURCE_LEASE_UNAVAILABLE/); assert(f.store.has(record.key)); await next.close();
});
void test('another actor does not read any private recovery value', async () => {
  const { f, record } = await savedSource(), next = fixture({ store: f.store, locks: f.locks, actor: 'actor-b' }); await turn(); next.counters.getKeys.length = 0;
  assert.equal(next.records().length, 0); await assert.rejects(next.input.processMasterNamePreviewRecovery(record.key), /NOT_OWNED/); assert(!next.counters.getKeys.includes(record.key)); await next.close();
});
void test('unknown reload offers only original receipt, keeps 404 unknown and never POSTs again', async () => {
  const f = fixture(); await turn(); f.fill('Uncertain'); f.mode('unknown'); await assert.rejects(f.input.processMasterNameApply(), /RESULT_UNKNOWN/); const record = f.records().find(item => item.kind === 'unknown'); assert(record); await f.close();
  const next = fixture({ store: f.store, locks: f.locks }); await turn(); next.mode('404');
  assert.equal(next.input.value, 'Original'); assert.equal((await next.input.processMasterNamePreviewRecovery(record.key)).payload, undefined);
  await assert.rejects(next.input.processMasterNameReceiptRecovery(record.key), /OPERATION_NOT_FOUND/); assert(f.store.has(record.key)); assert.equal(next.counters.posts, 0);
  next.mode('ok'); next.flow().revision = 2; await next.input.processMasterNameReceiptRecovery(record.key); assert.equal(f.store.has(record.key), false); assert.equal(next.counters.posts, 0); await next.close();
});
void test('malformed receipt cannot settle unknown marker', async () => {
  const f = fixture(); await turn(); f.fill('Uncertain'); f.mode('unknown'); await assert.rejects(f.input.processMasterNameApply()); const record = f.records().find(item => item.kind === 'unknown'); f.mode('bad-receipt'); f.flow().revision = 2;
  await assert.rejects(f.input.processMasterNameReceiptRecovery(record.key), /TERMINAL_RECEIPT_REQUIRED/); assert(f.store.has(record.key)); assert.equal(f.counters.posts, 1); await f.close();
});
void test('quota while preparing receipt stops dispatch and preserves prior record plus input', async () => {
  const f = fixture(); await turn(); f.fill('Before'); f.tick(); const before = new Map(f.store); f.quota(true); f.fill('Later');
  await assert.rejects(f.input.processMasterNameApply(), /QUOTA|STORAGE/); assert.equal(f.counters.posts, 0); assert.equal(f.input.value, 'Later'); assert.deepEqual(f.store, before); await f.close();
});
void test('recovery dialog uses text-only preview, explicit controls and closes without a request', async () => {
  const { f, record } = await savedSource(), next = fixture({ store: f.store, locks: f.locks }); await turn(); next.input.processMasterNameShowRecovery();
  const dialog = next.document.querySelector('dialog'); assert(dialog); assert.doesNotMatch(dialog.textContent, /恢復至本機/); assert.doesNotMatch(dialog.textContent, /放棄此記錄/); assert.equal(next.counters.reads, 0);
  const buttons = dialog.querySelectorAll('button'); await buttons.find(button => button.textContent.includes(record.runtimeId)).click(); assert.match(dialog.querySelector('pre').textContent, /我的名稱/); assert.match(dialog.textContent, /恢復至本機/); assert.match(dialog.textContent, /放棄此記錄/);
  buttons.at(-1).click(); assert.equal(next.document.querySelector('dialog'), null); assert.equal(next.counters.posts, 0); await next.close();
});
void test('legacy session record remains byte-identical and is unsupported without reading its content', async () => {
  const key = 'process:master-name:v1:'+JSON.stringify(['actor-a','PROCESS','g1','preset']), raw = JSON.stringify({ version:1,actor:'actor-a',generation:'g1',key:'preset',desired:'Legacy',baseline:[{path:['CUT',{id:'one'},'name'],value:'Original'}] }), store = new Map([[key,raw]]);
  const f = fixture({ store }); await turn(); assert.equal(f.input.value, 'Original'); f.input.processMasterNameShowRecovery(); const dialog=f.document.querySelector('dialog');
  assert.match(dialog.textContent,/舊版暫存沒有獨占鎖證據/); assert.equal(dialog.querySelector('pre').textContent,''); assert(!f.counters.getKeys.includes(key)); assert.equal(store.get(key),raw); assert.equal(f.counters.posts,0); await f.close();
});

for (const [name, error] of [
  ['missing request ID', Object.assign(Error('DEPENDENCY_CHANGED_RECONFIRM'), { status:409, details:{path:['CUT',{id:'one'},'name']} })],
  ['wrong guard path', Object.assign(Error('DEPENDENCY_CHANGED_RECONFIRM'), { status:409, requestId:'12345678-1234-4234-8234-123456789abc', details:{path:['CUT',{id:'other'},'name']} })],
  ['proxy 403', Object.assign(Error('Forbidden'), { status:403 })],
  ['404', Object.assign(Error('OPERATION_NOT_FOUND'), { status:404 })],
]) {
  void test(`unproven ${typeof name === 'string' ? name : 'fixture'} never clears a dispatched name marker or re-POSTs`, async () => {
    const f=fixture();await turn();f.fill('My input');f.reject(error);await assert.rejects(f.input.processMasterNameApply());
    const marker=f.records().find(item=>item.kind==='unknown');assert(marker);await assert.rejects(f.input.processMasterNameReview(),/UNKNOWN_OPERATION/);await assert.rejects(f.input.processMasterNameApply());
    assert.equal(f.counters.posts,1);assert.equal(f.input.value,'My input');assert(f.store.has(marker.key));await f.close();
  });
}
void test('proven guard rejection returns only this name batch to local without retrying',async()=>{
  const f=fixture();await turn();f.fill('My input');f.reject(Object.assign(Error('DEPENDENCY_CHANGED_RECONFIRM'),{status:409,requestId:'12345678-1234-4234-8234-123456789abc',details:{path:['CUT',{id:'one'},'name']}}));
  await assert.rejects(f.input.processMasterNameApply(),/DEPENDENCY_CHANGED/);assert.equal(f.records().some(item=>item.kind==='unknown'),false);f.tick();assert.equal(f.records().some(item=>item.kind==='local'),true);assert.equal(f.counters.posts,1);assert.equal(f.input.value,'My input');await f.close();
});
void test('proven pre-dispatch refusal returns local input without making a POST',async()=>{
  const f=fixture();await turn();f.fill('My input');f.reject(Object.assign(Error('PREVIOUS_OPERATION_UNKNOWN'),{notSent:true}));
  await assert.rejects(f.input.processMasterNameApply());assert.equal(f.counters.posts,0);assert.equal(f.records().some(item=>item.kind==='unknown'),false);f.tick();assert.equal(f.records().some(item=>item.kind==='local'),true);await f.close();
});
void test('delivery invalidation closes an already visible recovery preview',async()=>{
  const {f,record}=await savedSource(),next=fixture({store:f.store,locks:f.locks});await turn();next.input.processMasterNameShowRecovery();assert(next.document.querySelector('dialog'));
  next.actor('actor-b');next.window.dispatchEvent({type:'process-delivery-invalidated'});assert.equal(next.document.querySelector('dialog'),null);assert.equal(next.counters.posts,0);assert(f.store.has(record.key));await next.close();
});

const bridgeSource=fs.readFileSync(new URL('../public/process/master-shared-client.js',import.meta.url),'utf8');
function bridgeFixture(){
  let epoch=1,posts=0,reads=0,hook=null;
  const owner={id:'actor-a'},flow={generation:'g1',revision:1,working:{CUT:[{id:'one',name:'Original'}]},saved:{id:'s1'}},control={versions:[],active:{},workflowScopes:{PROCESS:flow}};
  const response={receipt:{operationId:'command-1',generation:'g1',revision:2,savedId:'s1',caseId:null,unchanged:false},control:{versions:[],workflow:{...flow,revision:2}},permissions:{view:true,edit:true}};
  const client={permission:()=>true,rejectionCapability:()=>null,prepareRecovery:(generation,details)=>({...details,generation,action:'apply',operationId:'command-1'}),sendPrepared:async()=>{posts++;await hook?.();return response;},read:async()=>{reads++;await hook?.();return response;},receipt:async()=>{reads++;await hook?.();return response;}};
  const window={ProcessSync:{identity:owner,identityGeneration:()=>epoch},createSharedDraftClient:()=>client};
  vm.runInNewContext(bridgeSource,{window,document:{documentElement:{lang:'zh'},querySelector:()=>null}});
  const bridge=window.createMasterSharedBridge({control});return{bridge,window,client,control,response,epoch:()=>epoch++,hook:fn=>hook=fn,posts:()=>posts,reads:()=>reads};
}
void test('actual bridge prepares without network, sends through existing client once and retains exact receipt',async()=>{
  const f=bridgeFixture(),command=f.bridge.preparePatch('PROCESS',[{op:'set',path:['CUT',{id:'one'},'name'],value:'Mine'}],[{path:['CUT',{id:'one'},'name'],value:'Original'}]);assert.equal(f.posts(),0);assert.equal(f.reads(),0);
  const [first,second]=await Promise.all([f.bridge.sendPreparedPatch('PROCESS',command),f.bridge.sendPreparedPatch('PROCESS',command)]);assert.equal(f.posts(),1);assert.equal(first.receipt.operationId,'command-1');assert.equal(second.receipt.operationId,'command-1');
});
void test('actual prepared bridge rejects mutated command before dispatch',async()=>{
  const f=bridgeFixture(),command=f.bridge.preparePatch('PROCESS',[],[]);command.operationId='changed';await assert.rejects(f.bridge.sendPreparedPatch('PROCESS',command),error=>error.notSent===true);assert.equal(f.posts(),0);
});
void test('actual prepared bridge fences late same-account epoch ACK',async()=>{
  const f=bridgeFixture(),command=f.bridge.preparePatch('PROCESS',[],[]),before=JSON.stringify(f.control);f.hook(()=>f.epoch());await assert.rejects(f.bridge.sendPreparedPatch('PROCESS',command),/ACCOUNT_CHANGED/);assert.equal(JSON.stringify(f.control),before);
});
void test('actual recovery bridge uses unconditional read and exact receipt followed by authoritative readback',async()=>{
  const f=bridgeFixture();await f.bridge.readRecovery('PROCESS');assert.equal(f.reads(),1);const result=await f.bridge.receiptRecovery('PROCESS',{operationId:'command-1',generation:'g1'});assert.equal(f.reads(),3);assert.equal(result.control.workflow.revision,2);assert.equal(f.posts(),0);
});
void test('actual recovery bridge rejects wrong receipt and stale readback',async()=>{
  for(const kind of ['wrong','stale']){const f=bridgeFixture();if(kind==='wrong')f.response.receipt.operationId='other';else f.response.control.workflow.revision=0;
    await assert.rejects(f.bridge.receiptRecovery('PROCESS',{operationId:'command-1',generation:'g1'}),/RECOVERY_READBACK_REQUIRED/);assert.equal(f.posts(),0);
  }
});

void test('receipt recovery after reload updates this clean field to authoritative latest name',async()=>{
  const f=fixture();await turn();f.fill('Committed');f.mode('unknown');await assert.rejects(f.input.processMasterNameApply());const marker=f.records().find(item=>item.kind==='unknown');await f.close();
  const next=fixture({store:f.store,locks:f.locks});await turn();next.flow().working.CUT[0].name='Committed';next.flow().revision=2;
  await next.input.processMasterNameReceiptRecovery(marker.key);assert.equal(next.input.value,'Committed');assert.equal(next.counters.posts,0);await next.close();
});
void test('explicit discard cancels only this queued reader before removing owned local record',async()=>{
  const f=fixture();await turn();f.fill('Old local');f.tick();f.fill('Latest local');f.input.processMasterNameDiscard();f.tick();assert.equal(f.input.value,'Original');assert.equal(f.records().length,0);assert.equal(f.counters.posts,0);await f.close();
});
void test('debounced quota failure is immediately visible in the small name status, without POST',async()=>{
  const f=fixture();await turn();f.quota(true);f.fill('RAM only');f.tick();assert.match(f.document.querySelector('[data-name-state]').textContent,/存檔未完成/);assert.equal(f.counters.posts,0);assert.equal(f.input.value,'RAM only');await f.close();
});

for(const action of ['send','read','receipt']){
  for(const change of ['generation','revision']){
    void test(`production bridge ${action} cannot adopt late ${change} rollback`,async()=>{
      const f=bridgeFixture(),command=f.bridge.preparePatch('PROCESS',[],[]);
      const newer={...f.control.workflowScopes.PROCESS,generation:change==='generation'?'g2':'g1',revision:9};
      f.hook(()=>{f.control.workflowScopes.PROCESS=newer;});
      const request=action==='send'?f.bridge.sendPreparedPatch('PROCESS',command):action==='read'?f.bridge.readRecovery('PROCESS'):f.bridge.receiptRecovery('PROCESS',{operationId:'command-1',generation:'g1'});
      await assert.rejects(request,/ACCOUNT_CHANGED|RECOVERY_READBACK_REQUIRED/);
      assert.equal(f.control.workflowScopes.PROCESS,newer);assert.equal(f.control.workflowScopes.PROCESS.revision,9);assert.equal(f.posts(),action==='send'?1:0);
    });
  }
}
void test('production bridge detects generation mutation in place while a name ACK is pending',async()=>{
  const f=bridgeFixture(),command=f.bridge.preparePatch('PROCESS',[],[]);f.hook(()=>{f.control.workflowScopes.PROCESS.generation='g2';f.control.workflowScopes.PROCESS.revision=9;});
  await assert.rejects(f.bridge.sendPreparedPatch('PROCESS',command),/ACCOUNT_CHANGED|RECOVERY_READBACK_REQUIRED/);assert.equal(f.control.workflowScopes.PROCESS.generation,'g2');assert.equal(f.control.workflowScopes.PROCESS.revision,9);
});
void test('production bridge delayed receipt with wrong identity does not adopt its readback',async()=>{
  const f=bridgeFixture(),before=JSON.stringify(f.control);f.response.receipt.operationId='wrong';await assert.rejects(f.bridge.receiptRecovery('PROCESS',{operationId:'command-1',generation:'g1'}),/RECOVERY_READBACK_REQUIRED/);assert.equal(JSON.stringify(f.control),before);assert.equal(f.reads(),1);
});
void test('typing during historical receipt readback cannot be silently replaced or rebased',async()=>{
  const f=fixture();await turn();f.fill('Committed');f.mode('unknown');await assert.rejects(f.input.processMasterNameApply());const marker=f.records().find(item=>item.kind==='unknown');await f.close();
  const next=fixture({store:f.store,locks:f.locks});await turn();next.read(()=>next.fill('New input'));
  await assert.rejects(next.input.processMasterNameReceiptRecovery(marker.key),/LOCAL_CHANGED/);assert.equal(next.input.value,'New input');assert(f.store.has(marker.key));assert.equal(next.counters.posts,0);await next.close();
});
void test('valid JSON with another template baseline cannot restore into this name editor',async()=>{
  const {f,record}=await savedSource(),raw=JSON.parse(f.store.get(record.key));raw.payload.baseline[0].path[1].id='another-template';f.store.set(record.key,JSON.stringify(raw));
  const next=fixture({store:f.store,locks:f.locks});await turn();next.flow().working.CUT.push({id:'another-template',name:'Original'});
  await assert.rejects(next.input.processMasterNameRestoreRecovery(record.key),/INVALID_NAME_RECOVERY/);assert.equal(next.input.value,'Original');assert.equal(next.counters.posts,0);assert.equal(next.counters.reads,0);assert(f.store.has(record.key));await next.close();
});
void test('oversized module name remains in RAM and is not saved as a non-restorable local payload',async()=>{
  const f=fixture();await turn();f.fill('名'.repeat(5000));assert.equal(f.counters.writes,0);f.tick();assert.equal(f.counters.writes,0);assert.equal(f.records().length,0);assert.equal(f.input.value.length,5000);assert.match(f.document.querySelector('[data-name-state]').textContent,/存檔未完成/);await f.close();
});
for(const permissionChange of ['edit','pending'])void test(`explicit historical local discard remains possible after ${permissionChange} lock, with view permission`,async()=>{
  const {f,record}=await savedSource(),next=fixture({store:f.store,locks:f.locks});await turn();if(permissionChange==='edit')next.permissions({edit:false});else next.flow().pendingId='pending-case';
  await next.input.processMasterNameDiscardRecovery(record.key);assert.equal(f.store.has(record.key),false);assert.equal(next.input.value,'Original');assert.equal(next.counters.posts,0);assert.equal(next.counters.reads,0);await next.close();
});
void test('historical unknown B cannot replace input, baseline or session while own command A is unresolved',async()=>{
  const f=fixture();await turn();f.fill('Historical B');f.mode('unknown');await assert.rejects(f.input.processMasterNameApply());const markerB=f.records().find(item=>item.kind==='unknown');await f.close();
  const next=fixture({store:f.store,locks:f.locks,sequence:10});await turn();next.fill('Current A');next.mode('unknown');await assert.rejects(next.input.processMasterNameApply());const markerA=next.records().find(item=>item.key!==markerB.key&&item.kind==='unknown');assert(markerA);
  await assert.rejects(next.input.processMasterNameReceiptRecovery(markerB.key),/DIFFERENT_OPERATION_UNRESOLVED/);assert.equal(next.input.value,'Current A');assert.equal(next.counters.receiptReads,0);assert(next.store.has(markerA.key));assert(next.store.has(markerB.key));await assert.rejects(next.input.processMasterNameApply());assert.equal(next.counters.posts,1);
  next.mode('ok');next.flow().working.CUT[0].name='Current A';next.flow().revision=2;await next.input.processMasterNameReceiptRecovery(markerA.key);assert.equal(next.input.value,'Current A');assert.equal(next.store.has(markerA.key),false);assert(next.store.has(markerB.key));
  next.fill('Next A');await next.input.processMasterNameApply();assert.equal(next.commands.at(-1).guards[0].value,'Current A');assert.equal(next.counters.posts,2);await next.close();
});
