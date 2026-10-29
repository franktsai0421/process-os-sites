// Same fixture against independent normal checkouts; no alternate resolver or live service.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createHash, randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import harness from './ipqc-ab-import-harness.cjs';
import {toolingIsolatedSnapshot, toolingIsolatedIqc} from './tooling-isolated-fixture.mjs';

const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const metrics = () => ({sqlReads: 0, sqlWrites: 0, r2Gets: 0, r2GetBytes: 0, r2Heads: 0, r2Puts: 0, r2PutBytes: 0});
const boundSources = ['lib/tooling.ts', 'lib/tooling-workflow.ts', 'lib/state-records.ts', 'lib/versioned-shared-workflow.ts', 'lib/shared-draft.ts', 'lib/workflow-wire.ts', 'lib/process-state.ts', 'scripts/ipqc-ab-import-harness.cjs', 'app/api/tooling/checks/route.ts'];

async function emit(count, compact = true) {
  const db = new DatabaseSync(':memory:'), objects = new Map(); let currentMetrics = metrics(), currentKeys = [];
  for (const file of fs.readdirSync('drizzle').filter(n => n.endsWith('.sql')).sort()) db.exec(fs.readFileSync('drizzle/' + file, 'utf8'));
  const env = {PROCESS_SESSION_SECRET: randomUUID(), DB: {prepare(sql) {let args = []; return {bind(...a) {args = a; return this;}, async first() {currentMetrics.sqlReads++; return db.prepare(sql).get(...args) || null;}, async run() {currentMetrics.sqlWrites++; return {meta: {changes: Number(db.prepare(sql).run(...args).changes)}};}};}}, STATE_ARCHIVE: {async put(k, v) {const b = Buffer.from(v); currentMetrics.r2Puts++; currentMetrics.r2PutBytes += b.length; objects.set(k, b);}, async head(k) {currentMetrics.r2Heads++; return objects.has(k) ? {} : null;}, async get(k) {currentMetrics.r2Gets++; currentKeys.push(k); const b = objects.get(k); if (!b) return null; currentMetrics.r2GetBytes += b.length; return {text: async () => b.toString(), arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), body: new ReadableStream({start(c) {c.enqueue(b); c.close();}})};}}};
  const load = harness(env), core = load('lib/process-state.ts'), draft = load('lib/shared-draft.ts'), records = load('lib/state-records.ts');
  const snapshot = toolingIsolatedSnapshot(count), users = ['editor', 'reviewer'].map(id => ({id: 'synthetic-' + id, name: 'Synthetic ' + id, role: 'admin', enabled: true}));
  const version = {id: 'SYN-TOOLING-ACTIVE', number: 1, status: 'approved', snapshot, revision: 1, creatorId: users[0].id, creatorName: users[0].name, createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z', history: []};
  const control = {schemaVersion: 1, activeVersionId: version.id, versions: [version], reservedCodes: {}, workflow: draft.createSharedDraft('tooling', snapshot, version.id, 'SYN-GENERATION')};
  const values = {versionSampleSeed4: 'true', platformUsers: JSON.stringify(users), toolingMasterControl: JSON.stringify(control), iqcMasterControl: JSON.stringify(toolingIsolatedIqc()), unrelatedAux: JSON.stringify({note: 'Unrelated body must retain its original mutation fault policy', pad: 'U'.repeat(128 * 1024)})};
  const raw = await records.encodeRecordValues(env.STATE_ARCHIVE, values);
  db.prepare('INSERT INTO shared_state(id,revision,"values",updated_at) VALUES(1,1,?,?)').run(raw, 'fixture');
  const headers = {}; for (const user of users) headers[user.id] = {Cookie: 'process_demo=' + await core.demoSession(new Request('http://127.0.0.1'), user.id, false), Origin: 'http://127.0.0.1', 'Content-Type': 'application/json'};
  const route = load('app/api/tooling/workflow/route.ts'), checks = load('app/api/tooling/checks/route.ts'), wire = load('lib/workflow-wire.ts'), actions = []; let current, sequence = 0;
  async function request(name, method, body, actor = users[0].id, target = route) {
    const currentRefs = JSON.parse(db.prepare('SELECT "values" FROM shared_state WHERE id=1').get().values).__processRecords.values; currentMetrics = metrics(); currentKeys = []; global.gc?.(); const heapBefore = process.memoryUsage().heapUsed, started = performance.now();
    const response = await target[method](new Request('http://127.0.0.1/api/tooling/' + (target === checks ? 'checks' : 'workflow?caseMetadata=1' + (compact ? '&compact=1' : '')), {method, headers: headers[actor] || {}, ...(body ? {body: JSON.stringify(body)} : {})}));
    const text = await response.text(), data = wire.expandWorkflowPayload(JSON.parse(text)), elapsedMs = performance.now() - started, heapGrowthBytes = process.memoryUsage().heapUsed - heapBefore;
    const closure = Object.fromEntries(Object.entries(currentRefs).map(([key, ref]) => [key, currentKeys.filter(k => k === ref.key).length]));
    const row = {name, status: response.status, error: data.error || null, metrics: currentMetrics, responseBytes: Buffer.byteLength(text), elapsedMs, observedHeapGrowthBytes: heapGrowthBytes, recordKeysRead: closure, uniqueR2Keys: new Set(currentKeys).size};
    if (data.control) {current = data.control; row.workingHash = hash(current.workflow.working); row.activeHash = hash(current.workflow.active.content); row.caseStatuses = current.workflow.cases.map(c => c.status); row.workingTools = current.workflow.working.tools.length; row.workingTransfers = current.workflow.working.transfers.length;}
    if (target === checks) {
      if(response.ok){assert.equal(data.savedId,current.workflow.saved?.id||null);assert.equal(data.generation,current.workflow.generation);assert.equal(data.revision,current.workflow.revision);assert.equal(data.activeVersionId,current.activeVersionId);assert.equal(data.stateRevision,db.prepare('SELECT revision FROM shared_state WHERE id=1').get().revision);}
      // Save IDs are server-random across processes; verify the exact current
      // source ID above before replacing only that token for paired hashing.
      row.checksVerifiedBodyHash=hash(response.ok?{...data,savedId:data.savedId?'CURRENT_VERIFIED_SAVED_ID':null}:data);
    }
    if (target === checks && response.ok) {row.issuesHash = hash({working: data.working, saved: data.saved}); row.issueCount = data.working.length + (data.saved?.length || 0);}
    return row;
  }
  const check = async (...args) => {const row = await request(...args); assert.equal(row.status, 200, row.name + ': ' + row.error); actions.push(row); return row;};
  const command = (action, details = {}, actor = users[0].id) => check(action, 'POST', {command: {action, generation: current.workflow.generation, operationId: '00000000-0000-4000-8000-' + String(++sequence).padStart(12, '0'), clientId: 'SYN-' + actor, sequence, ...details}}, actor);
  const inspect = async (name, actor=users[0].id) => {const row=await request(name,'GET',undefined,actor,checks);actions.push(row);return row;};
  await check('entry','GET'); await inspect('initial-unsaved'); await check('begin','POST',{action:'begin'});
  await command('apply',{patches:[{op:'set',path:['tools',{id:'SYN-TOOL-1'},'nameZh'],value:''}],guards:[{path:['tools',{id:'SYN-TOOL-1'},'nameZh'],value:snapshot.tools[1].nameZh}]});
  await inspect('changed-unsaved'); await command('save'); await inspect('saved-equal');
  await command('apply',{patches:[{op:'set',path:['tools',{id:'SYN-TOOL-1'},'nameVi'],value:''}],guards:[{path:['tools',{id:'SYN-TOOL-1'},'nameVi'],value:snapshot.tools[1].nameVi}]});
  await inspect('saved-distinct');
  const unauth=await inspect('unauthenticated','absent');assert.equal(unauth.status,403);
  const currentRaw=db.prepare('SELECT "values" FROM shared_state WHERE id=1').get().values, refs=JSON.parse(currentRaw).__processRecords.values;
  for(const [key,status] of [['unrelatedAux',200],['toolingMasterControl',503],['iqcMasterControl',200]]){
   const original=objects.get(refs[key].key);objects.set(refs[key].key,Buffer.from('CORRUPT_SYNTHETIC'));
   const row=await inspect(key+'-fault');assert.equal(row.status,status);objects.set(refs[key].key,original);
  }
  const originalGet=env.STATE_ARCHIVE.get.bind(env.STATE_ARCHIVE);let revoked=false;
  env.STATE_ARCHIVE.get=async key=>{if(key===refs.iqcMasterControl.key&&!revoked){revoked=true;db.prepare('UPDATE shared_state SET revision=revision+1 WHERE id=1').run();}return originalGet(key);};
  const stale=await inspect('revision-drift');assert.equal(stale.status,409);assert.equal(stale.error,'TOOLING_CHECKS_STALE_RETRY');
  env.STATE_ARCHIVE.get=originalGet;
  const finalRaw=db.prepare('SELECT "values" FROM shared_state WHERE id=1').get().values;assert.equal(finalRaw,currentRaw,'checks do not write or remove data/history');
  db.close();return {fixture:{tools:count,transfers:snapshot.transfers.length},sourceHashes:Object.fromEntries(boundSources.map(name=>[name,createHash('sha256').update(fs.readFileSync(name)).digest('hex')])),actions};
}
if(process.argv[2]==='--emit')console.log(JSON.stringify(await emit(Number(process.argv[3]||366))));
else{
 const baseline=path.resolve(process.argv[2]),candidate=process.cwd(),file=fileURLToPath(import.meta.url),pairs=[];
 for(const count of [366,1000]){
  const pair={count};for(const [label,cwd] of [['baseline',baseline],['candidate',candidate]]){const child=spawnSync(process.execPath,['--expose-gc',file,'--emit',String(count)],{cwd,encoding:'utf8',maxBuffer:8*1024*1024});assert.equal(child.status,0,child.stderr);pair[label]=JSON.parse(child.stdout);}
  for(const name of boundSources.filter(n=>n!=='app/api/tooling/checks/route.ts'))assert.equal(pair.baseline.sourceHashes[name],pair.candidate.sourceHashes[name],'shared source fence '+name);
  const semantic=x=>x.actions.map(({elapsedMs:_time,observedHeapGrowthBytes:_heap,...row})=>row);
  assert.deepEqual(semantic(pair.baseline),semantic(pair.candidate),'checks exact-source-verified response hashes / action hashes / IO parity');pairs.push(pair);
 }
 console.log(JSON.stringify({status:'PASS_TOOLING_CHECKS_ROUTE_PAIRS',pairs,limits:['Actual authenticated handlers, synthetic memory SQLite/R2 only','No browser, hosted timing or Worker memory-limit acceptance']},null,2));
}
