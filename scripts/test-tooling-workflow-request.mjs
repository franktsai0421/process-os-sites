// Actual tooling handlers, SQLite :memory: and R2 Map only. No server/browser/live data.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID, createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import harness from './ipqc-ab-import-harness.cjs';

const db = new DatabaseSync(':memory:'), objects = new Map(), results = [];
for (const file of fs.readdirSync('drizzle').filter(f => f.endsWith('.sql')).sort()) db.exec(fs.readFileSync('drizzle/' + file, 'utf8'));
const env = { PROCESS_SESSION_SECRET: randomUUID(), DB: { prepare(sql) { let args = []; return { bind(...values) { args = values; return this; }, async first() { return db.prepare(sql).get(...args) || null; }, async run() { return { meta: { changes: Number(db.prepare(sql).run(...args).changes) } }; } }; } }, STATE_ARCHIVE: { async put(k, v, options) { objects.set(k, { bytes: Buffer.from(v), options }); }, async head(k) { return objects.has(k) ? {} : null; }, async get(k) { const entry = objects.get(k); if (!entry) return null; const b = entry.bytes; return { text: async () => b.toString(), arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), httpMetadata: entry.options?.httpMetadata, body: new ReadableStream({ start(c) { c.enqueue(b); c.close(); } }) }; } } };
const load = harness(env), core = load('lib/process-state.ts'), tooling = load('lib/tooling.ts'), route = load('app/api/tooling/workflow/route.ts');
const users = ['editor', 'reviewer'].map(id => ({ id, name: 'Synthetic ' + id, role: 'admin', enabled: true }));
const parts = ['one', 'two', 'three'].map((id, i) => ({ id, code: 'SYN-IQC-' + i, nameVi: 'Sản phẩm ' + i, nameZh: '測試產品' + i, categoryId: i === 2 ? 'iqc-cat-b' : 'iqc-cat-a', supplierIds: [i === 1 ? 'iqc-sup-b' : 'iqc-sup-a'], photos: [], isEnabled: true }));
const values = { versionSampleSeed4: 'true', platformUsers: JSON.stringify(users), iqcMasterControl: JSON.stringify({ activeVersionId: 'iqc-approved', versions: [{ id: 'iqc-approved', status: 'approved', snapshot: { parts, categories: [{ id: 'iqc-cat-a', nameVi: 'A' }, { id: 'iqc-cat-b', nameVi: 'B' }], suppliers: [{ id: 'iqc-sup-a', nameVi: 'A' }, { id: 'iqc-sup-b', nameVi: 'B' }], errors: [], items: [] } }] }), unrelatedSentinel: JSON.stringify('MUST_REMAIN_UNCHANGED') };
db.prepare('INSERT INTO shared_state(id,revision,"values",updated_at) VALUES(1,1,?,?)').run(await load('lib/state-records.ts').encodeRecordValues(env.STATE_ARCHIVE, values), 'fixture');
const headers = {};
for (const u of users) headers[u.id] = { Cookie: 'process_demo=' + await core.demoSession(new Request('http://127.0.0.1'), u.id, false), Origin: 'http://127.0.0.1', 'Content-Type': 'application/json' };
let current, sequence = 0, stage = 'synthetic fixture setup';
const expectedCases=[];
async function request(method, body, user = 'editor', query = '') { const start = performance.now(), response = await route[method](new Request('http://127.0.0.1/api/tooling/workflow'+query, { method, headers: headers[user], ...(body ? { body: JSON.stringify(body) } : {}) })), data = await response.json(); results.push({ stage, targets: body?.command?.patches?.map(p => p.path[1]?.id || p.value?.id).filter(Boolean) || [], operation: method === 'GET' ? query?'history read '+query.split('=')[0]:'read' : body.action || body.command.action, status: response.status, milliseconds: +(performance.now() - start).toFixed(3) }); return { status: response.status, data }; }
async function read() { const r = await request('GET'); assert.equal(r.status, 200); current = r.data.control; return current; }
async function begin() { const r = await request('POST', { action: 'begin' }); assert.equal(r.status, 200, JSON.stringify(r.data)); await read(); }
async function command(action, details = {}, user = 'editor', status = 200) { const r = await request('POST', { command: { action, generation: current.workflow.generation, operationId: randomUUID(), clientId: 'synthetic-' + user, sequence: ++sequence, ...(action==='submit'?{expectedRevision:current.workflow.revision}:{}), ...details } }, user); assert.equal(r.status, status, JSON.stringify(r.data)); if (r.status === 200) await read(); return r.data; }
const insert = (collection, value) => ({ op: 'insert', path: [collection], value });
async function update(id, fields, expected = 200) { const old = current.workflow.working.tools.find(t => t.id === id), patches = Object.entries(fields).map(([key, value]) => ({ op: 'set', path: ['tools', { id }, key], value })); return command('apply', { patches, guards: patches.map(p => ({ path: p.path, value: old[p.path[2]] })) }, 'editor', expected); }
const tool = id => ({ id, nameVi: 'Khuôn ' + id, nameZh: '模具 ' + id, categoryId: 'cat-a', assetCode: 'SYN-' + id, specification: '保留業務規格', quantity: 1, unit: 'PCS', manufacturerId: 'mfr', location: { kind: 'internal', holderId: 'holder-a' }, inboundDate: '2026-10-01', inboundDateLost: false, enabled: true, inactiveReason: '', archived: false, archiveReason: '', notes: '', frequencyMonths: 12, photos: [], iqcIds: [] });
await begin();
await command('apply', { patches: [insert('categories', { id: 'cat-a', nameVi: 'Khuôn', nameZh: '模具' }), insert('custodians', { id: 'holder-a', nameVi: 'Planning' }), insert('custodians', { id: 'holder-b', nameVi: 'Production' }), insert('suppliers', { id: 'sup', nameVi: 'Supplier', nameZh: '', erp: 'SYN', addresses: [], phones: [], contacts: [] }), insert('manufacturers', { id: 'mfr', nameVi: 'Maker', nameZh: '', erp: 'SYN-M', addresses: [], phones: [], contacts: [] })] });
await command('apply', { patches: [insert('tools', tool('original-a')), insert('tools', tool('original-b'))] });
await command('save'); await command('submit', { savedId: current.workflow.saved.id, reason: 'Synthetic baseline' }); await command('approve', { caseId: current.workflow.pendingId }, 'reviewer');
const baselineActiveId=current.activeVersionId,baselineActive = structuredClone(current.versions.find(v => v.id === baselineActiveId).snapshot);
stage = 'edit two existing tools';
await begin();
const photoRoute = load('app/api/tooling/photo/route.ts'), photos = [];
async function uploadPhoto(index) {
 const bytes=Buffer.from(index%2 ? 'R0lGODlhAQABAIAAAAD/AP///ywAAAAAAQABAAACAUwAOw==' : 'R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==','base64');
 let start=performance.now();const response=await photoRoute.PUT(new Request('http://127.0.0.1/api/tooling/photo',{method:'PUT',headers:{...headers.editor,'Content-Type':'image/gif'},body:bytes}));assert.equal(response.status,200);const {id}=await response.json();
 results.push({stage,operation:'photo PUT (fixture bytes)',status:response.status,milliseconds:+(performance.now()-start).toFixed(3)});
 start=performance.now();const downloaded=await photoRoute.GET(new Request('http://127.0.0.1/api/tooling/photo?id='+id,{headers:headers.editor}));assert.equal(downloaded.status,200);assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()),bytes);
 results.push({stage,operation:'photo GET (exact stored bytes, not rendering)',status:downloaded.status,milliseconds:+(performance.now()-start).toFixed(3)});return id;
}
for(let index=0;index<2;index++)photos.push(await uploadPhoto(index));
for (const [i, id] of ['original-a', 'original-b'].entries()) { await update(id, { photos: [{ id: photos[i] }], iqcIds: ['one', 'two', 'three'], inboundDate: '', inboundDateLost: true, inspectionFrequency: 'weekly', frequencyMonths: null }); await update(id, { iqcIds: ['one', 'three'], inboundDate: '2026-10-02', inboundDateLost: false }); }
await update('original-a', { inboundDateLost: true }, 422);
await update('original-a', { enabled: false }, 422);
await command('apply', { patches: [insert('tools', { ...tool('empty-disabled'), enabled: false })] }, 'editor', 422);
await update('original-a', { iqcIds: ['not-approved'] }, 422);
await update('original-a', { photos: [{ id: 'f'.repeat(64) }] }, 422);
const iqcRoute = load('app/api/tooling/iqc/route.ts'), iqcResponse = await iqcRoute.GET(new Request('http://127.0.0.1/api/tooling/iqc', { headers: headers.editor })); assert.equal(iqcResponse.status, 200); assert.equal((await iqcResponse.json()).parts.length, 3);
await update('original-a', { enabled: false, inactiveReason: 'Synthetic temporary hold' });
await update('original-a', { enabled: true, inactiveReason: '' });
await update('original-b', { enabled: false, inactiveReason: 'Synthetic inspection hold' });
await update('original-b', { inactiveReason: '  ' }, 422);
await command('apply', { patches: [insert('transfers', { id: 'move-a', toolId: 'original-a', from: { kind: 'internal', holderId: 'holder-a' }, to: { kind: 'external', holderId: 'sup' }, reason: 'Synthetic movement' })] });
await command('apply', { patches: [insert('transfers', { id: 'move-b', toolId: 'original-b', from: { kind: 'internal', holderId: 'holder-a' }, to: { kind: 'external', holderId: 'sup' }, reason: 'Synthetic second-tool movement' })] });
assert.deepEqual(current.workflow.active.content, baselineActive);
stage = 'first manual Save Submit Return edit Save Resubmit Approve';
await command('save'); const savedBeforeReturn = current.workflow.saved.id,firstReturnedContent=structuredClone(current.workflow.saved.content);
await command('submit', { savedId: savedBeforeReturn, reason: 'Synthetic manual Save then Submit' }); const returnedCase = current.workflow.pendingId;
await command('return', { caseId: returnedCase, reason: 'Synthetic return for confirmation' }, 'reviewer');
expectedCases.push({id:returnedCase,status:'returned',savedId:savedBeforeReturn,content:firstReturnedContent});
await update('original-a',{notes:'Synthetic correction after first Return'});await command('save');
assert.notEqual(current.workflow.saved.id,savedBeforeReturn);
const firstApprovedSave=current.workflow.saved.id,firstApprovedContent=structuredClone(current.workflow.saved.content);
await command('submit', { savedId:firstApprovedSave, reason: 'Synthetic Resubmit after edit and manual Save' });const firstApprovedCase=current.workflow.pendingId;await command('approve', { caseId:firstApprovedCase }, 'reviewer');
expectedCases.push({id:firstApprovedCase,status:'approved',savedId:firstApprovedSave,content:firstApprovedContent});
assert.equal(tooling.toolingLocation(current.workflow.active.content, 'original-a').holderId, 'sup');
stage = 'correct approved movements and frequency';
await begin();
await command('apply', { patches: [insert('transfers', { id: 'correction-a', toolId: 'original-a', correctionOf: 'move-a', from: { kind: 'internal', holderId: 'holder-a' }, to: { kind: 'internal', holderId: 'holder-b' }, reason: 'Synthetic correction, original immutable' })] });
await update('original-a', { inspectionFrequency: 'quarterly', frequencyMonths: 3 });
await command('apply', { patches: [insert('transfers', { id: 'correction-b', toolId: 'original-b', correctionOf: 'move-b', from: { kind: 'internal', holderId: 'holder-a' }, to: { kind: 'internal', holderId: 'holder-b' }, reason: 'Synthetic second-tool correction' })] });
await update('original-b', { inspectionFrequency: 'semiannual', frequencyMonths: 6 });
stage = 'two new tools repeat photo/date/enable/IQC/location/frequency/transfer';
for (const [index,id] of ['new-a', 'new-b'].entries()) {
 const photo=await uploadPhoto(index);
 await command('apply', { patches: [insert('tools', { ...tool(id), photos: [{ id:photo }], iqcIds: ['one', 'two', 'three'], location: { kind: 'external', holderId: 'sup' } })] });
 await update(id, {inboundDate:'',inboundDateLost:true,enabled:false,inactiveReason:'Synthetic new-tool hold'});
 await update(id, { iqcIds: ['one','three'],inboundDate:'2026-10-03',inboundDateLost:false,enabled:true,inactiveReason:'',inspectionFrequency: 'monthly', frequencyMonths: 1 });
 await command('apply', { patches: [insert('transfers', { id: 'draft-move-'+id, toolId:id, from: { kind: 'external', holderId: 'sup' }, to: { kind: 'internal', holderId: 'holder-a' }, reason: 'Synthetic new-tool draft movement' })] });
}
stage = 'negative guard: history-linked deletion remains forbidden';
for(const id of ['new-a','new-b']){
 const row=current.workflow.working.tools.find(t=>t.id===id);
 const deletion=await command('apply',{patches:[{op:'remove',path:['tools',{id}]}],guards:[{path:['tools',{id}],value:row}]},'editor',422);
 assert.match(deletion.error,/TOOLING_(HISTORY_DELETE_FORBIDDEN|TRANSFER_INVALID)/);
 assert(current.workflow.working.tools.some(t=>t.id===id));assert(current.workflow.working.transfers.some(t=>t.toolId===id));
}
// Owner-approved path: used tools remain, disabled with a mandatory reason.
stage = 'two used new tools: require reason then disable without removing history';
for(const id of ['new-a','new-b']){
 await update(id,{enabled:false},422);await read();assert.equal(current.workflow.working.tools.find(t=>t.id===id).enabled,true);
 await update(id,{enabled:false,inactiveReason:'Synthetic used-tool hold '+id});
 assert.equal(current.workflow.working.tools.find(t=>t.id===id).inactiveReason,'Synthetic used-tool hold '+id);
 assert(current.workflow.working.transfers.some(t=>t.toolId===id));
}
// Separate owner-approved deletion fixture: never approved, linked or transferred.
stage = 'owner-approved reference-free synthetic deletion';
await command('apply',{patches:[insert('tools',tool('delete-control'))]});
const deletionControl=current.workflow.working.tools.find(t=>t.id==='delete-control');
assert.equal(deletionControl.iqcIds.length,0);assert.equal(current.workflow.working.transfers.some(t=>t.toolId==='delete-control'),false);
assert.equal(current.versions.some(v=>v.status!=='draft'&&v.snapshot.tools.some(t=>t.id==='delete-control')),false);
assert.equal(current.workflow.cases.some(c=>c.content.tools.some(t=>t.id==='delete-control')),false);
await command('apply',{patches:[{op:'remove',path:['tools',{id:'delete-control'}]}],guards:[{path:['tools',{id:'delete-control'}],value:deletionControl}]});
assert.equal(current.workflow.working.tools.some(t=>t.id==='delete-control'),false);
stage = 'second manual Save Submit Return edit Save Resubmit Approve';
await command('save');const secondReturnedSave=current.workflow.saved.id,secondReturnedContent=structuredClone(current.workflow.saved.content);
await command('submit', { savedId:secondReturnedSave, reason: 'Synthetic second snapshot' });const secondReturnedCase=current.workflow.pendingId;
await command('return', { caseId:secondReturnedCase, reason: 'Synthetic second return' }, 'reviewer');
expectedCases.push({id:secondReturnedCase,status:'returned',savedId:secondReturnedSave,content:secondReturnedContent});
await update('new-a',{notes:'Synthetic revision after second Return',inactiveReason:'Synthetic revised used-tool hold after Return'});
await command('save');assert.notEqual(current.workflow.saved.id,secondReturnedSave);
const secondApprovedSave=current.workflow.saved.id,secondApprovedContent=structuredClone(current.workflow.saved.content);
const staleSubmit=await command('submit',{savedId:secondReturnedSave,reason:'Negative stale saved selection'},'editor',409);assert.equal(staleSubmit.error,'SAVED_VERSION_CHANGED_RECONFIRM');
await command('submit', { savedId:secondApprovedSave, reason: 'Synthetic second resubmit after edit and manual Save' });const secondApprovedCase=current.workflow.pendingId;
await command('approve', { caseId:secondApprovedCase }, 'reviewer');
expectedCases.push({id:secondApprovedCase,status:'approved',savedId:secondApprovedSave,content:secondApprovedContent});
assert.equal(current.workflow.active.content.tools.some(t => t.id === 'new-a'), true);
assert.equal(current.workflow.active.content.tools.some(t => t.id === 'delete-control'), false);
assert.equal(current.workflow.active.content.tools.some(t => t.id === 'new-b'), true);
assert.equal(current.workflow.active.content.transfers.find(t => t.id === 'move-a').to.holderId, 'sup');
assert.equal(tooling.toolingLocation(current.workflow.active.content, 'original-a').holderId, 'holder-b');
assert.equal(current.workflow.active.content.transfers.find(t => t.id === 'move-b').to.holderId, 'sup');
assert.equal(tooling.toolingLocation(current.workflow.active.content, 'original-b').holderId, 'holder-b');
assert.equal(current.workflow.active.content.transfers.length,6);
for(const id of ['new-a','new-b']){const row=current.workflow.active.content.tools.find(t=>t.id===id);assert.equal(tooling.toolingLocation(current.workflow.active.content,id).holderId,'holder-a');assert.equal(row.inboundDateLost,false);assert.equal(row.enabled,false);assert(row.inactiveReason.trim());assert.equal(row.frequencyMonths,1);assert.deepEqual(row.iqcIds,['one','three']);}
stage = 'formal version and immutable approval history GET readback';
const historyObjects=()=>[...objects].map(([key,value])=>[key,createHash('sha256').update(value.bytes).digest('hex')]);
const historyRevision=db.prepare('SELECT revision FROM shared_state WHERE id=1').get().revision,historyBefore=historyObjects();
const historical=await request('GET',undefined,'reviewer','?versionId='+encodeURIComponent(baselineActiveId));assert.equal(historical.status,200);assert.deepEqual(historical.data.version.snapshot,baselineActive);assert.equal(historical.data.version.status,'superseded');
const historyList=await request('GET',undefined,'reviewer','?history=1');assert.equal(historyList.status,200);
for(const expected of expectedCases){
 const metadata=historyList.data.cases.find(c=>c.id===expected.id);assert(metadata);assert.equal(metadata.status,expected.status);
 const r=await request('GET',undefined,'reviewer','?caseId='+encodeURIComponent(expected.id));assert.equal(r.status,200);
 assert.equal(r.data.reviewCase.status,expected.status);assert.equal(r.data.reviewCase.savedId,expected.savedId);assert.equal(r.data.reviewCase.actor.id,'editor');assert.equal(r.data.reviewCase.result.actor.id,'reviewer');assert.deepEqual(r.data.reviewCase.content,expected.content);
 const version=await request('GET',undefined,'reviewer','?versionId='+encodeURIComponent(expected.id));assert.equal(version.status,200);assert.deepEqual(version.data.version.snapshot,expected.content);
 assert.equal(version.data.version.status,expected.status==='approved'&&expected.id!==current.activeVersionId?'superseded':expected.status);
}
const formal=await request('GET',undefined,'reviewer','?versionId='+encodeURIComponent(current.activeVersionId));assert.equal(formal.status,200);assert.equal(formal.data.version.status,'approved');assert.deepEqual(formal.data.version.snapshot,current.workflow.active.content);
assert.equal(db.prepare('SELECT revision FROM shared_state WHERE id=1').get().revision,historyRevision);assert.deepEqual(historyObjects(),historyBefore);
assert.equal((await core.readState()).values.unrelatedSentinel, values.unrelatedSentinel);
stage = 'checks metadata and revision fence';
const checksRoute = load('app/api/tooling/checks/route.ts');
const checksResponse = await checksRoute.GET(new Request('http://127.0.0.1/api/tooling/checks', { headers: headers.editor }));
assert.equal(checksResponse.status, 200); const inspection = await checksResponse.json();
assert.equal(inspection.stateRevision, db.prepare('SELECT revision FROM shared_state WHERE id=1').get().revision);
assert.equal(inspection.activeVersionId, current.activeVersionId); assert.equal(inspection.savedId, current.workflow.saved?.id || null);
assert.equal(inspection.iqcVersionId, 'iqc-approved'); assert.equal(inspection.sourceAvailable, true);
const prepare = Reflect.get(env.DB, 'prepare');
env.DB.prepare = function(sql) { if (sql === 'SELECT revision FROM shared_state WHERE id=1 AND revision=?') db.exec('UPDATE shared_state SET revision=revision+1 WHERE id=1'); return prepare.call(this, sql); };
try { const stale = await checksRoute.GET(new Request('http://127.0.0.1/api/tooling/checks', { headers: headers.editor })); assert.equal(stale.status, 409); assert.equal((await stale.json()).error, 'TOOLING_CHECKS_STALE_RETRY'); }
finally { env.DB.prepare = prepare; }

// Existing historical missing reasons remain advisory on unrelated edits. This
// fixture is seeded before its handler loads; no running app or history is edited.
const legacyDb = new DatabaseSync(':memory:');
for (const file of fs.readdirSync('drizzle').filter(f => f.endsWith('.sql')).sort()) legacyDb.exec(fs.readFileSync('drizzle/' + file, 'utf8'));
const legacySnapshot = structuredClone(baselineActive); legacySnapshot.tools[0].enabled = false; legacySnapshot.tools[0].inactiveReason = '';
const legacyValues = { ...values, toolingMasterControl: JSON.stringify({ schemaVersion: 1, activeVersionId: 'legacy-active', versions: [{ id: 'legacy-active', number: 1, status: 'approved', snapshot: legacySnapshot }], reservedCodes: {} }) };
legacyDb.prepare('INSERT INTO shared_state(id,revision,"values",updated_at) VALUES(1,1,?,?)').run(await load('lib/state-records.ts').encodeRecordValues(env.STATE_ARCHIVE, legacyValues), 'legacy-fixture');
const legacyEnv = { ...env, DB: { prepare(sql) { let args = []; return { bind(...values) { args = values; return this; }, async first() { return legacyDb.prepare(sql).get(...args) || null; }, async run() { return { meta: { changes: Number(legacyDb.prepare(sql).run(...args).changes) } }; } }; } } }, legacyRoute = harness(legacyEnv)('app/api/tooling/workflow/route.ts');
let legacyControl;
async function legacyRequest(body, user = 'editor') { const r = await legacyRoute[body ? 'POST' : 'GET'](new Request('http://127.0.0.1/api/tooling/workflow', { method: body ? 'POST' : 'GET', headers: headers[user], ...(body ? { body: JSON.stringify(body) } : {}) })); const data = await r.json(); assert.equal(r.status, 200, JSON.stringify(data)); legacyControl = data.control; return data; }
await legacyRequest({ action: 'begin' }); await legacyRequest();
async function legacyCommand(action, details = {}, user = 'editor') { await legacyRequest({ command: { action, generation: legacyControl.workflow.generation, operationId: randomUUID(), clientId: 'legacy-' + user, sequence: ++sequence, ...(action==='submit'?{expectedRevision:legacyControl.workflow.revision}:{}), ...details } }, user); await legacyRequest(); }
await legacyCommand('apply', { patches: [{ op: 'set', path: ['tools', { id: 'original-a' }, 'notes'], value: 'Unrelated edit retains old missing reason' }], guards: [{ path: ['tools', { id: 'original-a' }, 'notes'], value: '' }] });
await legacyCommand('save'); await legacyCommand('submit', { savedId: legacyControl.workflow.saved.id, reason: 'Legacy reminder remains advisory' }); await legacyCommand('approve', { caseId: legacyControl.workflow.pendingId }, 'reviewer');
assert.equal(legacyControl.workflow.active.content.tools[0].inactiveReason, '');
assert.equal(legacyControl.workflow.active.content.tools[0].enabled, false);
legacyDb.close();
console.log(JSON.stringify({ status: 'PASS_BOUNDED_TOOLING_HANDLER_FLOW', operations: results.length, results, coverage: {existingTools:2,newTools:2,photoUploadAndRead:4,originalTransfers:2,approvedCorrections:2,newToolTransfers:2,manualReviewCycles:2,returnedEditAndManualResave:2,usedNewToolsDisabledWithReasons:2,historyCasesReadBack:4,formalVersionReadBack:true,negativeHistoryDeleteGuard:'both 422, not an approved user step',referenceFreeControlDeletion:200}, legacyPolicy: 'PASS actual Begin/Apply unrelated note/Save/Submit/Approve with preexisting missing disable reason; new disable/blank edit/new disabled tool rejected.', approvedFlow: 'Owner accepted used-tool disable with mandatory reason plus separate never-approved/unreferenced/no-transfer delete; history delete remains 422 as a negative guard, no cascade.', limits: ['Synthetic local handler timing, not page/network latency', 'No browser, native photo rendering, login UI, or live records', 'Photo PUT tests fixture GIF bytes and storage IDs, not native image decoding', 'Submit uses an explicit captured draft revision; permission, CAS and history checks remain covered'] }, null, 2));
db.close();
