import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { randomUUID, webcrypto } from 'node:crypto';

// Full actual UI + default shared client + production draft/AB kernels. Only
// DOM rendering, poll scheduling, and the in-memory HTTP boundary are synthetic.
const require = createRequire(import.meta.url);
const load = require('../scripts/ipqc-ab-import-harness.cjs')();
const { createSharedDraft, applyDraftCommand } = load('lib/shared-draft.ts');
const { abWorkflowAdapter } = load('lib/ipqc-ab-workflow.ts');
const sourcePath = process.env.AB_CREATE_UNKNOWN_SOURCE || 'public/process/ipqc-ab.js';
const source = fs.readFileSync(sourcePath, 'utf8');
const shared = fs.readFileSync(process.env.AB_CREATE_UNKNOWN_SHARED_SOURCE || 'public/process/shared-draft-client.js', 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const storage = () => { const values = new Map(); return { get length() { return values.size; }, key: n => [...values.keys()][n] ?? null,
  getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) }; };
const item = (id = 'item-1') => ({ id, code: 'A-QA-01-L01-01', errorId: 'error-1', standard: 'Initial standard', methodText: 'Initial method',
  inspectionMode: 'visual', equipmentId: '', equipmentSnapshot: null, isEnabled: true, rules: [], standardPhotos: [], methodPhotos: [],
  productCodes: [], sourceRows: [], sourceTool: '', sourceMethod: '', sourceFrequency: '', reason: '', deleted: false });
const catalog = { groups: [{ line: 'A', name: 'QA', defaultStages: ['S01'] }],
  products: ['P1', 'P2'].map(code => ({ code, name: code, line: 'A', category: 'QA', stages: ['S01'] })),
  stages: [{ line: 'A', code: 'S01', name: 'Synthetic stage' }] };

async function fixture(text = source, { twoScopes = false } = {}) {
  const content = { errors: [{ id: 'error-1', code: 'A-QA-01-L01', name: 'Synthetic error', line: 'A', group: 'QA', stageCode: 'S01', sourceRows: [], deleted: false }], items: [item()] };
  const localCatalog = clone(catalog); if (twoScopes) localCatalog.groups.push({ line: 'A', name: 'QB', defaultStages: ['S01'] });
  const secondContent = clone(content); secondContent.errors[0].group = 'QB'; secondContent.errors[0].code = 'A-QB-01-L01'; secondContent.items[0].code = 'A-QB-01-L01-01';
  let secondFlow = createSharedDraft('ipqc-ab:A:QB', secondContent, null, 'generation-QB');
  let flow = createSharedDraft('ipqc-ab:A:QA', content, null, 'generation-1'), revision = 10;
  let moduleFlow = createSharedDraft('ipqc-ab:module', { scopes: { 'A:QA': clone(content) }, bases: { 'A:QA': null } }, null, 'module-generation');
  let requestId = () => randomUUID(), failure = null, uploadHold = null, postReply = value => value, hold = null, beforeCommit = () => {}, getHold = null, pollTask = null, receiptOnly = false, paintChecks = 0, readReply = (_url, value) => ({ value, status: 200 }), losePost = false;
  const calls = [];
  const permissions = Object.fromEntries(['view', 'edit', 'save', 'submit', 'withdraw', 'approve', 'return', 'history', 'delete', 'create', 'restore'].map(key => [key, true]));
  const project = current => ({ activeVersionId: current.active.id, workflow: clone(current), versions: [{ id: 'shared-' + current.generation, number: 1,
    status: current.pendingId ? 'pending' : 'draft', revision: current.revision, snapshot: clone(current.working), history: [], creatorId: 'owner', creatorName: 'Synthetic', createdAt: 'fixture', updatedAt: 'fixture' }] });
  const root = () => ({ schemaVersion: 1, scopes: { 'A:QA': { line: 'A', group: 'QA', ...project(flow) }, ...(twoScopes ? { 'A:QB': { line: 'A', group: 'QB', ...project(secondFlow) } } : {}) },
    moduleDraft: project(moduleFlow), source: null, reservedErrorCodes: [], reservedItemCodes: [] });
  const body = () => ({ control: root(), catalog: clone(localCatalog), equipment: [], revision });
  const fields = {
    '#ab-standard': { value: content.items[0].standard }, '#ab-method': { value: content.items[0].methodText },
    '#ab-mode': { value: 'visual' }, '#ab-enabled': { checked: true }, '#ab-error-name': { value: content.errors[0].name },
  };
  let visibleFields = fields;
  const dialog={setAttribute(){},querySelector:()=>({focus(){}})};
  const node=tag=>({tag,children:[],setAttribute(){},append(child){this.children.push(child);},prepend(child){this.children.unshift(child);}}),page=node('page');
  const modalBody = {dataset:{},scrollTop:0,closest:()=>dialog, querySelector: selector => selector === '[name="ab-mode"]:checked' ? fields['#ab-mode'] : fields[selector] || null,
    querySelectorAll: () => [] };
  const buttons = ['P1', 'P2'].map(code => ({ checked: false, disabled: false, dataset: { abMatrixItem: 'item-1', abMatrixProduct: code },
    addEventListener(_event, callback) { this.change = callback; } }));
  const retry = {}, receiptQuery = {}, close = { addEventListener(_event, callback) { this.click = callback; } };
  const groupSelect = { addEventListener(_event, callback) { this.change = callback; } };
  const createCheck = { addEventListener(_event, callback) { this.click = callback; } };
  const apply = { addEventListener(_event, callback) { this.click = callback; } };
  const host = { isConnected: true, dataset: { activeTab: 'quality-ipqc-ab' }, contains: () => false,
    querySelector: selector => selector === '#ipqcab-page' ? page : selector === '.ipqcab-dialog-body' ? (visibleFields === fields ? modalBody : null) : selector === '[data-ab-access-retry]' ? retry : selector === '[data-ab-receipt-query]' ? (host.markup?.includes('data-ab-receipt-query') ? receiptQuery : null) : selector === '[data-ab-create-check]' ? (host.markup?.includes('data-ab-create-check') ? createCheck : null) : selector === '#ab-apply' ? apply : selector === '#ipqcab-group' ? groupSelect : visibleFields[selector] || null,
    querySelectorAll: selector => selector === '[data-ab-close]' ? [close] : selector === '[data-ab-matrix-item]' ? buttons : [], childNodes: [{ fields }],
    replaceChildren(...nodes) { this.childNodes = nodes; visibleFields = nodes[0]?.fields || {}; this.markup = ''; },
    get innerHTML() { return this.markup || ''; }, set innerHTML(value) { this.markup = value; this.childNodes = [{fields}]; visibleFields = value.includes('ipqcab-page') ? fields : {};page.children=[]; } };
  const window = { addEventListener() {}, dispatchEvent() {}, scrollTo() {}, confirm: () => true,
    ProcessIPQC:{referenceMarkup:()=>'',mountReferences:async()=>{}}, VersionDraftUI: {t:value=>value,mount(){},preserveView: () => () => {}, confirmReview: async () => ({ reason: 'Synthetic review', selfReviewConfirmed: true }) } };
  const box = { window, document: { documentElement: { lang: 'zh' }, createElement:node,contains: () => { paintChecks++; return true; }, visibilityState: 'visible', activeElement: null,
    querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, removeEventListener() {} },
    crypto: webcrypto, AbortController, Request, Response, Headers, URL, URLSearchParams, TextEncoder, TextDecoder,
    structuredClone, setTimeout, clearTimeout, setInterval: () => 1, clearInterval() {},
    MutationObserver: class { observe() {} }, CustomEvent: class {}, toast() {}, sessionStorage: storage(), localStorage: storage(),
    location: new URL('https://fixture.invalid/process/'), epoch: 1, delivery: 1,
    async fetch(url, options = {}) {
      if(options.method==='PUT'){
        calls.push({method:'PUT',url}); const held=uploadHold; uploadHold=null; held.started.resolve(); await held.release.promise;
        return Response.json({id:'a'.repeat(64)});
      }
      const parsed = new URL(url, 'https://fixture.invalid'), sent = options.body ? JSON.parse(options.body) : null;
      const call = { method: options.method || 'GET', url, body: sent, requestBytes: Buffer.byteLength(options.body || '') }; calls.push(call);
      if (!sent) {
        if (getHold?.predicate(parsed)) { const held = getHold; getHold = null; held.started.resolve(); await held.release.promise; }
        const value = parsed.pathname === '/api/ipqc-ab' ? body() : parsed.searchParams.has('permissions') ? {permissions,revision} : { control: parsed.searchParams.has('module') ? project(moduleFlow) : project(parsed.searchParams.get('scope') === 'A:QB' ? secondFlow : flow), permissions, revision };
        const reply = readReply(parsed, value); call.responseBytes = Buffer.byteLength(JSON.stringify(reply.value)); return Response.json(reply.value, { status: reply.status });
      }
      let value, responseStatus = 200;
      try {
        await Promise.resolve(beforeCommit(sent));
        const base = { actor: { id: 'owner', name: 'Synthetic', admin: true }, at: '2026-10-31T00:00:00Z', id: randomUUID,
          allowed: () => true, activeId: null, semantic: value => value, structure() {}, validate: () => [] };
        if (sent.action === 'begin') {
          flow = createSharedDraft(flow.scope, flow.working, null, randomUUID()); revision++;
          value = { control: project(flow), permissions, revision };
        } else if (parsed.searchParams.has('module')) {
          if (sent.command.action === 'save') moduleFlow.working = { scopes: { 'A:QA': clone(flow.working) }, bases: { 'A:QA': null } };
          const applied = applyDraftCommand(moduleFlow, sent.command, base); moduleFlow = applied.state; revision++;
          value = { control: project(moduleFlow), permissions, revision, receipt: clone(applied.receipt) };
        } else {
          const requestScope = parsed.searchParams.get('scope') || 'A:QA', adapter = abWorkflowAdapter(requestScope), control = adapter.parse(JSON.stringify(root()));
          const state = { revision, values: { masterDataControl: JSON.stringify({ active: { AB: { products: localCatalog.products,
            categoryGroups: localCatalog.groups, lines: [{ code: 'A', stages: [{ code: 'S01', name: 'Synthetic' }] }] } } }), routineEquipmentControl: JSON.stringify({activeVersionId:'equipment-approved',versions:[{id:'equipment-approved',status:'approved',equipment:[{id:'equipment-1',assetCode:'EQ1',pieceMark:'1',name:'Synthetic equipment'},{id:'equipment-2',assetCode:'EQ2',pieceMark:'2',name:'Next equipment'}]}]}) } };
          const context = adapter.context(control, state, base);
          const applied = adapter.apply(control, sent.command, context); if (requestScope === 'A:QB') secondFlow = applied.state; else flow = applied.state; revision++;
          value = { control: project(applied.state), permissions, revision, receipt: clone(applied.receipt) };
        }
      } catch (error) { value = { error: error.code || error.message, details: error.details, requestId: requestId() }; responseStatus = error.status || 500; }
      value = postReply(value, sent);
      if (receiptOnly && value.receipt) { delete value.control; receiptOnly = false; }
      call.status = responseStatus; call.responseBytes = Buffer.byteLength(JSON.stringify(value));
      if (hold) { const held = hold; hold = null; held.started.resolve(); await held.release.promise; }
      if (losePost) { losePost = false; throw Error('Synthetic lost ACK'); }
      if(failure){const fault=failure;failure=null;if(fault==='throw-status')throw Object.assign(Error('Synthetic proxy failure'),{status:409});return Response.json({error:'Synthetic proxy failure'},{status:fault});}
      return Response.json(value, { status: responseStatus });
    },
  };
  window.ProcessSync = { identity: { id: 'owner', name: 'Synthetic', role: 'admin' }, requiresReload: false,
    identityGeneration: () => box.epoch, captureDelivery: () => box.delivery, isCurrentDelivery: value => value === box.delivery };
  const context = vm.createContext(box);
  vm.runInContext(shared, context, { filename: 'shared-draft-client.js' });
  window.createForegroundPoll = () => ({ capture: () => 1, isCurrent: value => value === 1,
    schedule: task => { pollTask = task; }, cancel() {} });
  const anchor = '  window.IPQCABUI = {'; assert.equal(text.split(anchor).length, 2);
  const hook = `__test:{draw,writeShared,save,moduleSave,load,bind,upload,transport,moduleTransport,scheduleRefresh,reconfirmRetainedDelivery:typeof reconfirmRetainedDelivery==='undefined'?null:reconfirmRetainedDelivery,
    init(value,page){control=value.control;catalog=value.catalog;equipment=[];revision=value.revision;host=page;line='A';group='QA';stage='S01';errorId='error-1';versionId=opened().id;working=clone(opened().snapshot);},
    get(){return{line,group,stage,errorId,versionId,control,revision,working,busy,message,modal,modalBase,viewer,host,accessBlocked,privateQuarantine,client:sharedClient,localBatch:typeof localBatch==='undefined'?null:localBatch};},
    advanceAttempt(){mutationSequence++;},dropCreateProof(){if(typeof createdReservations!=='undefined')createdReservations.delete(localBatch.created);},replaceReservation(){localBatch={...localBatch,created:{...localBatch.created}};},setStage(value){stage=value;},setViewer(value){viewer=value;},setWorking(value){working=value;},setModal(value){modal=value;modalBase=clone(opened().snapshot);modalGeneration=scope().workflow.generation;},
    replacePendingOperation(){const old=pendingOperations.get(sharedClient);pendingOperations.set(sharedClient,{...old,operationId:'new-original-operation'});},setRevision(value){revision=value;},setHost(value){host=value;},setScope(value){group=value;},setClient(value){sharedClient=value;},setBusy(value){busy=value;}
  },`;
  vm.runInContext(text.replace(anchor, anchor + hook), context, { filename: sourcePath });
  const ui = window.IPQCABUI.__test; await window.IPQCABUI.mount(host); assert.ok(ui.get().control); ui.bind(); const initialReads=clone(calls); calls.length = 0;
  return { ui, box, window, host, page, initialReads, fields, apply, createCheck, close, retry, receiptQuery, groupSelect, buttons, calls, permissions,
    requestId: callback => { requestId=callback; }, postReply: callback => { postReply = callback; }, failAfterCommit: value => { failure=value; }, holdUpload() { const value={started:deferred(),release:deferred()};uploadHold=value;return value; }, readReply: callback => { readReply = callback; }, losePost: () => { losePost = true; }, modulePending: () => { moduleFlow.pendingId = 'pending-module'; },
    state: (scope = 'A:QA') => clone(scope === 'A:QB' ? secondFlow : flow), root, body, paintChecks: () => paintChecks, receiptOnly: () => { receiptOnly = true; },
    holdPost() { const value = { started: deferred(), release: deferred() }; hold = value; return value; },
    holdGet(predicate) { const value = { predicate, started: deferred(), release: deferred() }; getHold = value; return value; },
    beforeCommit: callback => { beforeCommit = callback; },
    peer(callback) { callback(flow); revision++; },
    poll: async () => { ui.scheduleRefresh(); assert(pollTask); await pollTask(); },
    reset: () => window.IPQCABUI.navigation.reset(),
  };
}

// Fixture above keeps the complete production caller/default client/AB adapter
// and draft kernel. Synthetic DOM and HTTP projections are not route/native QA.
function openCreate(f, kind) {
  if (kind === 'item') {
    const temporary = item('temp-exact'); f.ui.get().working.items.push(temporary);
    f.ui.setModal({ type: 'item', id: temporary.id }); f.fields['#ab-standard'].value = 'Sent created standard';
  } else { f.ui.setModal({ type: 'new-error', name: 'Sent created error' }); f.fields['#ab-error-name'].value = 'Sent created error'; }
}
const posts = f => f.calls.filter(call => call.method === 'POST');

// This caller fixture obtains real adapter/kernel errors but supplies their
// requestId at the synthetic HTTP envelope. Actual route UUID/pre-CAS authority
// is covered separately by the transport owner's actual-route test suite.
const recoveryKeys = f => Array.from({length:f.box.sessionStorage.length},(_,index)=>f.box.sessionStorage.key(index)).filter(key=>key.startsWith('shared-draft-v3-operation:'));
const callerCreated = f => f.ui.get().localBatch?.created;


function terminalReply(f,url,value){return url.searchParams.has('operationId')?{status:200,value:{receipt:clone(f.state().receipts[url.searchParams.get('operationId')].result)}}:{status:200,value};}
function terminal(f){f.readReply((url,value)=>terminalReply(f,url,value));}
function unavailable(f){f.readReply((url,value)=>url.searchParams.has('operationId')?{status:404,value:{error:'OPERATION_NOT_FOUND'}}:{status:200,value});}
function checkButton(f){assert.ok(f.host.innerHTML.includes('data-ab-create-check'),'visible modal recovery button');return f.createCheck;}
function reads(f){return f.calls.filter(call=>call.method==='GET');}
function projection(f){const s=f.ui.get();return {control:s.control,revision:s.revision,working:s.working,base:s.localBatch.base,modal:s.modal,selection:[s.line,s.group,s.stage,s.errorId,s.versionId]};}
function unchanged(f,old){const s=f.ui.get();assert.equal(s.control,old.control);assert.equal(s.revision,old.revision);assert.equal(s.working,old.working);assert.equal(s.localBatch.base,old.base);assert.deepEqual([s.line,s.group,s.stage,s.errorId,s.versionId],old.selection);}
async function lost(f,kind='item',{auto=false}={}){openCreate(f,kind);f.ui.draw();if(auto)terminal(f);else unavailable(f);f.losePost();await f.apply.click();assert.ok(callerCreated(f));assert.equal(f.ui.get().client.hasUnknown(),!auto);f.calls.length=0;}
function assertCheckCalls(f){assert.equal(posts(f).length,0);assert.equal(reads(f).length,3);assert.equal(reads(f).filter(call=>new URL(call.url,'https://fixture.invalid').searchParams.has('operationId')).length,1);}

function receiptButton(f){return f.page.children.flatMap(node=>node.children||[]).find(node=>node.tag==='button'&&node.textContent==='查詢上次操作');}
for(const kind of ['item','error'])void test(`bound modal ${kind} original receipt plus fresh projection maps latest input with 3 GET and manual next Apply`,async()=>{
 const f=await fixture();await lost(f,kind);terminal(f);
 const old=projection(f),op=callerCreated(f).operationId,id=kind+'-'+op,hold=f.holdGet(url=>url.pathname==='/api/ipqc-ab');
 const work=checkButton(f).click();await hold.started.promise;
 f.fields[kind==='item'?'#ab-standard':'#ab-error-name'].value='Latest typed while projection pending';
 assert.equal(posts(f).length,0);hold.release.resolve();assert.equal(await work,true);assertCheckCalls(f);
 assert.equal(f.ui.get().working,old.working);assert.equal(f.ui.get().modal,old.modal);assert.equal(f.ui.get().modal.id,id);assert.equal(callerCreated(f),undefined);
 const list=kind==='item'?'items':'errors',field=kind==='item'?'standard':'name';
 assert.equal(f.ui.get().working[list].find(row=>row.id===id)[field],'Latest typed while projection pending');
 assert.equal(f.ui.get().localBatch.base[list].find(row=>row.id===id)[field],kind==='item'?'Sent created standard':'Sent created error');
 f.calls.length=0;await f.apply.click();assert.equal(posts(f).length,1);assert.equal(reads(f).length,0);assert.equal(posts(f)[0].body.command.moduleAction,undefined);assert.equal(f.state().working[list].find(row=>row.id===id)[field],'Latest typed while projection pending');
});
void test('auto-recovered receipt-only still exposes a bound mapping check although marker is already clear',async()=>{
 const f=await fixture();await lost(f,'item',{auto:true});assert.equal(recoveryKeys(f).length,0);
 const op=callerCreated(f).operationId;assert.equal(await checkButton(f).click(),true);assertCheckCalls(f);assert.equal(f.ui.get().modal.id,'item-'+op);assert.equal(callerCreated(f),undefined);
});
void test('existing visible status receipt button also maps the original RAM reservation',async()=>{
 const f=await fixture();await lost(f);terminal(f);const button=receiptButton(f);assert.ok(button);assert.equal(await button.onclick(),true);assertCheckCalls(f);assert.equal(callerCreated(f),undefined);
});
void test('receipt 404 keeps original input, marker, reservation and retry button; later terminal query maps',async()=>{
 const f=await fixture();await lost(f);const old=projection(f),reservation=callerCreated(f);assert.equal(await checkButton(f).click(),false);
 unchanged(f,old);assert.equal(callerCreated(f),reservation);assert.equal(f.ui.get().client.hasUnknown(),true);assert.equal(recoveryKeys(f).length,1);assert.equal(reads(f).length,1);assert.equal(posts(f).length,0);checkButton(f);
 terminal(f);f.calls.length=0;assert.equal(await checkButton(f).click(),true);assertCheckCalls(f);
});
void test('terminal receipt followed by failed projection retains visible retry without transport unknown',async()=>{
 const f=await fixture();await lost(f);f.readReply((url,value)=>url.pathname==='/api/ipqc-ab'?{status:503,value:{error:'Synthetic unavailable'}}:terminalReply(f,url,value));
 const old=projection(f);assert.equal(await checkButton(f).click(),false);unchanged(f,old);assert.equal(f.ui.get().client.hasUnknown(),false);checkButton(f);
 terminal(f);f.calls.length=0;assert.equal(await checkButton(f).click(),true);assertCheckCalls(f);
});
void test('mapped Cancel keeps confirmed server row and cancels only unsent input',async()=>{
 const f=await fixture();await lost(f);f.fields['#ab-standard'].value='Unsent later';terminal(f);await checkButton(f).click();const id=f.ui.get().modal.id;
 await f.close.click();assert.equal(f.ui.get().modal,null);assert.equal(f.ui.get().working.items.find(row=>row.id===id).standard,'Sent created standard');assert.ok(f.state().working.items.find(row=>row.id===id));assert.equal(posts(f).length,0);
});
void test('mapping preserves working/item/photo-array aliases held by an asynchronous upload',async()=>{
 const f=await fixture();await lost(f);terminal(f);const old=projection(f),row=old.working.items.find(row=>row.id==='temp-exact'),photos=row.standardPhotos,held=f.holdUpload();
 const upload=f.ui.upload([{name:'Synthetic',type:'image/png'}],'standard');await held.started.promise;
 assert.equal(await checkButton(f).click(),true);assert.equal(f.ui.get().working,old.working);assert.equal(f.ui.get().working.items.find(value=>value.id===f.ui.get().modal.id),row);assert.equal(row.standardPhotos,photos);
 held.release.resolve();await upload;assert.equal(photos.length,1);assert.equal(photos[0].id,'a'.repeat(64));assert.equal(f.ui.get().localBatch.base.items.find(value=>value.id===row.id).standardPhotos.length,0);
});
void test('B plus exact created row never replaces unsent pre-dispatch guards with sent S or peer projection',async()=>{
 const f=await fixture();f.ui.get().working.items[0].reason='Private pre-dispatch';await lost(f);f.peer(flow=>{flow.working.items[0].reason='Peer value';flow.revision++;});terminal(f);
 assert.equal(await checkButton(f).click(),true);assert.equal(f.ui.get().localBatch.base.items[0].reason,'');assert.equal(f.ui.get().working.items[0].reason,'Private pre-dispatch');
 f.calls.length=0;await f.apply.click();assert.equal(posts(f).length,1);assert.equal(posts(f)[0].status,409);assert.equal(f.state().working.items[0].reason,'Peer value');assert.equal(f.ui.get().working.items[0].reason,'Private pre-dispatch');
});
const corruptions={
 'missing created row':(s,id)=>{s.workflow.working.items=s.workflow.working.items.filter(row=>row.id!==id);},
 'duplicate created row':(s,id)=>{s.workflow.working.items.push(clone(s.workflow.working.items.find(row=>row.id===id)));},
 'deleted created row':(s,id)=>{s.workflow.working.items.find(row=>row.id===id).deleted=true;},
 'peer changed sent editable field':(s,id)=>{s.workflow.working.items.find(row=>row.id===id).standard='Peer newer standard';},
 'wrong parent':(s,id)=>{s.workflow.working.items.find(row=>row.id===id).errorId='other-parent';},
 'noncanonical allocated code':(s,id)=>{s.workflow.working.items.find(row=>row.id===id).code='A-QA-01-L01-00';},
 'items not array':s=>{s.workflow.working.items={};},
 'errors missing':s=>{delete s.workflow.working.errors;},
 'new generation':s=>{s.workflow.generation='other-generation';},
 'group pending':s=>{s.workflow.pendingId='pending-case';},
 'lower revision':s=>{s.workflow.revision=0;},
};
for(const [name,corrupt] of Object.entries(corruptions))void test(`precommit ${name} refuses model adoption and never recreates`,async()=>{
 const f=await fixture();await lost(f);const old=projection(f),reservation=callerCreated(f),id='item-'+reservation.operationId;
 f.readReply((url,value)=>{
   const reply=terminalReply(f,url,value);if(url.pathname==='/api/ipqc-ab'){const s=reply.value.control.scopes['A:QA'];corrupt(s,id);s.versions[0].snapshot=clone(s.workflow.working);s.versions[0].revision=s.workflow.revision;}return reply;
 });
 f.fields['#ab-standard'].value='Latest private next input';assert.equal(await checkButton(f).click(),false);unchanged(f,old);assert.equal(callerCreated(f),reservation);assert.equal(f.ui.get().modal.id,'temp-exact');assert.equal(f.ui.get().busy,false);
 await f.apply.click();assert.equal(posts(f).length,0);assert.equal(f.ui.get().working.items.find(row=>row.id==='temp-exact').standard,'Latest private next input');
});
for(const name of ['module pending','view false','edit false','permissions malformed','scope fallback'])void test(`fresh ${name} does not grant mapping or replace local baseline`,async()=>{
 const f=await fixture();await lost(f);const old=projection(f),reservation=callerCreated(f),client=f.ui.get().client;
 f.readReply((url,value)=>{const reply=terminalReply(f,url,value);
  if(url.pathname==='/api/ipqc-ab'&&name==='module pending')reply.value.control.moduleDraft.workflow.pendingId='pending-module';
  if(url.pathname==='/api/ipqc-ab'&&name==='scope fallback')reply.value.catalog.groups=[];
  if(url.searchParams.has('permissions')){if(name==='permissions malformed')reply.value={permissions:{view:true},revision:11};if(name==='view false')reply.value.permissions={...reply.value.permissions,view:false};if(name==='edit false')reply.value.permissions={...reply.value.permissions,edit:false};}
  return reply;});
 assert.equal(await checkButton(f).click(),false);unchanged(f,old);assert.equal(callerCreated(f),reservation);assert.equal(f.ui.get().client,client);assert.equal(posts(f).length,0);assert.equal(reads(f).length,3);
});
for(const name of ['operation','generation','unchanged','revision'])void test(`wrong receipt ${name} cannot authorize mapping`,async()=>{
 const f=await fixture();await lost(f);const old=projection(f),reservation=callerCreated(f);
 f.readReply((url,value)=>{const reply=terminalReply(f,url,value);if(url.searchParams.has('operationId')){const r=reply.value.receipt;if(name==='operation')r.operationId='other-operation';if(name==='generation')r.generation='other-generation';if(name==='unchanged')r.unchanged=true;if(name==='revision')r.revision=0;}return reply;});
 assert.equal(await checkButton(f).click(),false);unchanged(f,old);assert.equal(callerCreated(f),reservation);await f.apply.click();assert.equal(posts(f).length,0);
});
void test('receipt permission denial preserves private input and uses existing hidden-modal quarantine, not restore',async()=>{
 const f=await fixture();await lost(f);const old=projection(f);f.readReply(()=>({status:403,value:{error:'FORBIDDEN'}}));
 assert.equal(await checkButton(f).click(),false);unchanged(f,old);assert.equal(posts(f).length,0);assert.ok(callerCreated(f));
});
void test('projection permission denial preserves RAM and fences create with existing quarantine',async()=>{
 const f=await fixture();await lost(f);const old=projection(f);f.fields['#ab-standard'].value='Typed before deny';
 f.readReply((url,value)=>url.searchParams.has('permissions')?{status:403,value:{error:'FORBIDDEN'}}:terminalReply(f,url,value));
 assert.equal(await checkButton(f).click(),false);unchanged(f,old);assert.equal(f.ui.get().modal,null);assert.ok(f.ui.get().privateQuarantine);assert.equal(f.ui.get().working.items.find(row=>row.id==='temp-exact').standard,'Typed before deny');assert.ok(callerCreated(f));assert.equal(posts(f).length,0);
});
const ownerChanges={actor:f=>{f.window.ProcessSync.identity={id:'other',role:'admin'};},'same-id actor object':f=>{f.window.ProcessSync.identity={...f.window.ProcessSync.identity};},epoch:f=>{f.box.epoch++;},delivery:f=>{f.box.delivery++;},tab:f=>{f.host.dataset.activeTab='other-tab';},disconnected:f=>{f.host.isConnected=false;},modal:f=>{f.ui.setModal({type:'new-error',name:'Other modal'});},client:f=>{f.ui.setClient({});},lifecycle:f=>{f.reset();},reservation:f=>{f.ui.replaceReservation();},operation:f=>{f.ui.replacePendingOperation();}};
for(const [name,change] of Object.entries(ownerChanges))void test(`late ${name} rejects the old explicit recovery without mapping or clearing its fence`,async()=>{
 const f=await fixture();await lost(f);terminal(f);const old=projection(f),reservation=callerCreated(f),held=f.holdGet(url=>url.pathname==='/api/ipqc-ab');
 const action=checkButton(f).click();await held.started.promise;change(f);held.release.resolve();assert.equal(await action,false);
 assert.equal(old.working.items.find(row=>row.id==='temp-exact').id,'temp-exact');assert.equal(old.base.items.length,1);assert.equal(posts(f).length,0);
 if(!['lifecycle','reservation'].includes(name))assert.equal(callerCreated(f),reservation);if(!['lifecycle','modal'].includes(name))assert.equal(f.ui.get().modal,old.modal);
});
void test('newer model revision while fresh read is pending rejects staged model without painting over newer input',async()=>{
 const f=await fixture();await lost(f);terminal(f);const old=projection(f),held=f.holdGet(url=>url.pathname==='/api/ipqc-ab'),paints=f.paintChecks();
 const action=checkButton(f).click();await held.started.promise;f.ui.setRevision(999);held.release.resolve();assert.equal(await action,false);assert.equal(f.ui.get().revision,999);assert.equal(f.ui.get().control,old.control);assert.equal(f.paintChecks(),paints);assert.ok(callerCreated(f));
});
void test('failed receipt still captures newest same-owner DOM before its own repaint',async()=>{
 const f=await fixture();await lost(f);const held=f.holdGet(url=>url.searchParams.has('operationId')),action=checkButton(f).click();await held.started.promise;f.fields['#ab-standard'].value='Newest DOM on failed receipt';held.release.resolve();assert.equal(await action,false);
 assert.equal(f.ui.get().working.items.find(row=>row.id==='temp-exact').standard,'Newest DOM on failed receipt');assert.ok(f.host.innerHTML.includes('Newest DOM on failed receipt'));assert.equal(posts(f).length,0);
});
for(const auto of [false,true])void test(`delivery change requires existing explicit 2 GET gate before exact 3 GET recovery (auto=${auto})`,async()=>{
 const f=await fixture();await lost(f,'item',{auto});const old=projection(f),originalOwner=f.ui.get().localBatch.owner,stale=checkButton(f).click;
 f.fields['#ab-standard'].value='Detached original DOM';f.box.delivery++;assert.equal(await stale(),false);assert.equal(f.calls.length,0);
 await f.apply.click();assert.ok(f.ui.get().accessBlocked);assert.ok(f.host.innerHTML.includes('data-ab-access-retry'));assert.equal(f.calls.length,0);terminal(f);
 await f.retry.onclick();assert.equal(reads(f).length,2);assert.equal(posts(f).length,0);f.calls.length=0;
 if(auto)assert.equal(await checkButton(f).click(),true);else{assert.ok(f.host.innerHTML.includes('data-ab-receipt-query'));assert.equal(await f.receiptQuery.onclick(),true);}
 assertCheckCalls(f);assert.equal(f.ui.get().working,old.working);assert.equal(f.ui.get().working.items.find(row=>row.id===f.ui.get().modal.id).standard,'Detached original DOM');assert.equal(f.ui.get().localBatch.owner.delivery,f.box.delivery);assert.equal(originalOwner.delivery,1);assert.equal(f.ui.get().localBatch.base.items[0].standard,'Initial standard');
});
for(const [name,change] of Object.entries(ownerChanges).filter(([name])=>!['lifecycle','modal','reservation','operation'].includes(name)))void test(`changed ${name} before explicit click grants no receipt request`,async()=>{
 const f=await fixture();await lost(f);const button=checkButton(f).click;change(f);assert.equal(await button(),false);assert.equal(f.calls.length,0);
});
void test('no original RAM proof cannot reconstruct mapping from session command or successful public receipt',async()=>{
 const f=await fixture();await lost(f);assert.equal(recoveryKeys(f).length,1);f.ui.dropCreateProof();f.ui.draw();assert.equal(f.host.innerHTML.includes('data-ab-create-check'),false);terminal(f);
 const button=receiptButton(f);assert.ok(button);await button.onclick();assert.ok(callerCreated(f));assert.equal(f.ui.get().modal.id,'temp-exact');assert.equal(posts(f).length,0);
});
for(const kind of ['item','error'])void test(`nested load completion microtask preserves ${kind} newest DOM and same-owner RAM mutation`,async()=>{
 const f=await fixture();await lost(f,kind);terminal(f);const field=f.fields[kind==='item'?'#ab-standard':'#ab-error-name'];let value=field.value,scheduled=false;
 Object.defineProperty(field,'value',{configurable:true,get(){if(!scheduled){scheduled=true;queueMicrotask(()=>{value='Newest after staged capture';f.ui.get().working.items[0].reason='New RAM after staged capture';});}return value;},set(next){value=next;}});
 assert.equal(await checkButton(f).click(),true);const id=f.ui.get().modal.id,list=kind==='item'?'items':'errors',key=kind==='item'?'standard':'name';assert.equal(f.ui.get().working[list].find(row=>row.id===id)[key],'Newest after staged capture');assert.equal(f.ui.get().working.items[0].reason,'New RAM after staged capture');assert.ok(f.host.innerHTML.includes('Newest after staged capture'));assert.equal(f.ui.get().localBatch.base.items[0].reason,'');assertCheckCalls(f);
});
void test('latest local equipment choice is not stamped with the old sent selection snapshot',async()=>{
 const f=await fixture();openCreate(f,'item');const row=f.ui.get().working.items.find(row=>row.id==='temp-exact');row.equipmentId='equipment-1';row.inspectionMode='equipment';row.equipmentSnapshot={id:'equipment-1',assetCode:'EQ1',pieceMark:'1',name:'Synthetic equipment'};f.fields['#ab-mode'].value='equipment';f.ui.draw();unavailable(f);f.losePost();await f.apply.click();f.calls.length=0;
 row.equipmentId='equipment-2';row.equipmentSnapshot={id:'equipment-2',assetCode:'EQ2',pieceMark:'2',name:'Next equipment'};terminal(f);assert.equal(await checkButton(f).click(),true);assert.equal(row.equipmentId,'equipment-2');assert.equal(row.equipmentSnapshot.id,'equipment-2');assert.equal(f.ui.get().localBatch.base.items.find(value=>value.id===row.id).equipmentId,'equipment-1');assertCheckCalls(f);
});
void test('input during held original create ACK remains in the same row when later unknown mapping is checked',async()=>{
 const f=await fixture();openCreate(f,'item');f.ui.draw();unavailable(f);f.losePost();const held=f.holdPost(),action=f.apply.click();await held.started.promise;f.fields['#ab-standard'].value='Typed during original flight';held.release.resolve();await action;terminal(f);f.calls.length=0;
 assert.equal(await checkButton(f).click(),true);assert.equal(f.ui.get().working.items.find(row=>row.id===f.ui.get().modal.id).standard,'Typed during original flight');assertCheckCalls(f);
});
const normalized=value=>JSON.stringify(value).replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g,'00000000-0000-0000-0000-000000000000');
async function normalCreate(text,kind){const f=await fixture(text);openCreate(f,kind);f.ui.draw();assert.equal(f.calls.length,0);await f.apply.click();assert.equal(posts(f).length,1);assert.equal(reads(f).length,0);return {request:normalized(posts(f)[0].body),requestBytes:posts(f)[0].requestBytes,responseBytes:posts(f)[0].responseBytes};}
for(const kind of ['item','error'])void test(`ordinary ${kind} create remains 1 POST 0 GET with no input request`,async()=>{await normalCreate(source,kind);});
const baselinePath=process.env.AB_CREATE_UNKNOWN_BASELINE;
if(baselinePath)void test('explicit paired baseline ordinary create request content/counts/bytes stay equal',async t=>{
 const baseline=fs.readFileSync(baselinePath,'utf8');for(const kind of ['item','error']){const old=await normalCreate(baseline,kind),current=await normalCreate(source,kind);assert.deepEqual(current,old);t.diagnostic(JSON.stringify({kind,posts:1,gets:0,...current,request:undefined}));}
});
void test('query after trusted rejection cleanup quota does not strand its explicit cleanup retry',async()=>{
 const f=await fixture();openCreate(f,'item');f.fields['#ab-mode'].value='equipment';f.ui.draw();const remove=f.box.sessionStorage.removeItem;let quota=true;
 f.box.sessionStorage.removeItem=key=>{if(quota&&key.startsWith('shared-draft-v3-operation:'))throw Error('Synthetic cleanup quota');remove(key);};
 await f.apply.click();assert.equal(posts(f)[0].status,422);assert.ok(callerCreated(f));unavailable(f);f.calls.length=0;assert.equal(await checkButton(f).click(),false);assert.equal(reads(f).length,1);
 quota=false;f.fields['#ab-mode'].value='visual';await f.apply.click();assert.equal(callerCreated(f),undefined,'original private rejection cleanup still retryable');assert.equal(posts(f).length,0);await f.apply.click();assert.equal(posts(f).length,1);assert.equal(posts(f)[0].status,200);
});
if(baselinePath)void test('explicit paired ordinary Apply and module Save retain request counts and bytes',async t=>{
 const baseline=fs.readFileSync(baselinePath,'utf8');
 async function measure(text,action){const f=await fixture(text);if(action==='apply'){f.ui.get().working.items[0].standard='Ordinary scalar';await f.ui.save('apply');}else await f.ui.moduleSave('save');return f.calls.map(({method,requestBytes,responseBytes})=>({method,requestBytes,responseBytes}));}
 for(const action of ['apply','save']){const before=await measure(baseline,action),after=await measure(source,action);assert.deepEqual(after,before);assert.equal(after.filter(call=>call.method==='POST').length,1);assert.equal(after.filter(call=>call.method==='GET').length,action==='apply'?0:3);t.diagnostic(JSON.stringify({action,calls:after}));}
});
for(const boundary of ['query in flight','changed epoch','superseded attempt','replaced reservation'])void test(`trusted cleanup after query remains fenced for ${boundary}`,async()=>{
 const f=await fixture();openCreate(f,'item');f.fields['#ab-mode'].value='equipment';f.ui.draw();const remove=f.box.sessionStorage.removeItem;let quota=true;
 f.box.sessionStorage.removeItem=key=>{if(quota&&key.startsWith('shared-draft-v3-operation:'))throw Error('Synthetic cleanup quota');remove(key);};await f.apply.click();const reservation=callerCreated(f);assert.ok(reservation);unavailable(f);f.calls.length=0;
 const held=f.holdGet(url=>url.searchParams.has('operationId')),query=checkButton(f).click();await held.started.promise;quota=false;
 if(boundary==='query in flight'){await f.apply.click();assert.equal(callerCreated(f),reservation);assert.equal(posts(f).length,0);}
 if(boundary==='changed epoch')f.box.epoch++;
 if(boundary==='superseded attempt')f.ui.advanceAttempt();
 if(boundary==='replaced reservation')f.ui.replaceReservation();
 held.release.resolve();assert.equal(await query,false);
 if(boundary!=='query in flight'){await f.apply.click();assert.ok(callerCreated(f));assert.equal(posts(f).length,0);assert.equal(f.state().working.items.length,1);}
});
void test('detached blocked-query intent cannot switch from mapped A to newer B on the same client',async()=>{
 const f=await fixture();await lost(f);f.box.delivery++;await f.apply.click();terminal(f);await f.retry.onclick();
 const oldHandler=f.receiptQuery.onclick;assert.equal(await oldHandler(),true);await f.close.click();await f.ui.save('apply');assert.equal(callerCreated(f),undefined);
 await lost(f,'error');f.box.delivery++;await f.apply.click();terminal(f);await f.retry.onclick();const next=callerCreated(f),fresh=f.receiptQuery.onclick;assert.ok(next);f.calls.length=0;
 assert.equal(await oldHandler(),false);assert.equal(f.calls.length,0);assert.equal(callerCreated(f),next);assert.equal(await fresh(),true);assertCheckCalls(f);assert.equal(f.ui.get().modal.id,'error-'+next.operationId);
});
void test('detached blocked-query intent cannot inherit a newer delivery grant even for the same operation',async()=>{
 const f=await fixture();await lost(f);f.box.delivery++;await f.apply.click();terminal(f);await f.retry.onclick();const oldHandler=f.receiptQuery.onclick,reservation=callerCreated(f);
 f.box.delivery++;await f.retry.onclick();const fresh=f.receiptQuery.onclick;f.calls.length=0;
 assert.equal(await oldHandler(),false);assert.equal(f.calls.length,0);assert.equal(callerCreated(f),reservation);assert.equal(await fresh(),true);assertCheckCalls(f);
});
