// Exact production GET handlers, synthetic in-memory SQLite/R2 and ephemeral
// session signer only. Not a browser, network server or deployed Worker test.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {fixture, sourceRoot} from './master-ab-auth-phase-fixture.mjs';

const script = fileURLToPath(import.meta.url), repository = path.resolve(path.dirname(script), '..');
// Historical measurements keep their original baseline. The deployed 848 main
// is a separate explicit mode, never a caller-supplied arbitrary commit.
export const baselineCommit = '268a8e49ec751bb6849033e20a27d30194aad67c';
const baselineModes = {
  '--baseline': {mode: 'historical-main-268a', commit: baselineCommit},
  '--baseline-main848': {mode: 'public-main-848be13', commit: '848be13da54c7ae747bcdd96df19e01129fe980a', tree: '39c8c63d040322842312605aaaac778ecd937b2e'},
};
export const routes = ['ipqc-c', 'routine'];
export const authKeys = ['platformUsers', 'processCustomRoles', 'processRoleTemplateOverrides', 'processAccessControl', 'maintenanceMode'];
export const businessKeys = { 'ipqc-c': ['ipqcCMasterControl'], routine: ['routineFqcEnabled', 'routineFqcControl', 'qualityMasterControl', 'masterDataControl'] };
export const copy = value => JSON.parse(JSON.stringify(value));
export const hash = value => createHash('sha256').update(value).digest('hex');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
export function canonical(value) {
  const identities = new Map();
  return JSON.stringify(value).replace(/\b[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\b/g, id => {
    if (!identities.has(id)) identities.set(id, 'UUID-' + identities.size);
    return identities.get(id);
  });
}
export const routePath = name => name === 'ipqc-c' ? 'ipqc-c/workflow' : 'routine-fqc';
export async function workflowFixture(options = {}) {
  const f = await fixture({inline: options.inline, primary: options.primary, user: options.user, values: {
    processCustomRoles: '[]', processRoleTemplateOverrides: '{}', processAccessControl: '{}', maintenanceMode: '0',
    toolingMasterControl: JSON.stringify({versions: [{id: 'unrelated-tooling-draft', status: 'draft', snapshot: {note: 'Synthetic unrelated tooling. '.repeat(2048)}}]}),
    routineEquipmentControl: JSON.stringify({versions: [{id: 'unrelated-equipment-draft', status: 'draft', equipment: [{id: 'equipment-a', name: 'Synthetic unrelated equipment. '.repeat(1024)}]}]}),
    syntheticRetainedSentinel: JSON.stringify({working: {note: 'Synthetic unrelated retained content. '.repeat(1024)}}),
    ...options.values,
  }});
  const kernel = f.load('lib/shared-draft.ts'), ipqc = f.load('lib/ipqc-c.ts'), routine = f.load('lib/routine-fqc.ts');
  const snapshot = {errors: [{id: 'error-c', code: 'C-C1-CUT-L1', productCode: 'C1', stageCode: 'C-CUT', name: 'Synthetic defect', note: '', reason: ''}],
    items: [{id: 'item-c', code: 'C-C1-CUT-L1-01', errorId: 'error-c', productCode: 'C1', stageCode: 'C-CUT', standard: 'Synthetic standard', cpkEnabled: false, standardEnabled: true, description: 'Synthetic description', tool: '', method: '', frequency: '', note: '', reason: '', mediaItems: []}]};
  const flow = kernel.createSharedDraft('ipqc-c', snapshot, 'ipqc-active', 'ipqc-synthetic-generation');
  const actor = {id: f.user.id, name: 'Synthetic operator', admin: true}, at = '2026-10-31T12:00:00.000Z';
  const historical = copy(snapshot); historical.items[0].description = 'Synthetic historical description';
  const saved = {id: 'ipqc-save', revision: 0, actor, at, content: historical, contributors: {}};
  flow.saved = copy(saved); flow.saves.push(copy(saved));
  flow.cases.push({id: 'ipqc-case', savedId: saved.id, baseId: 'ipqc-active', actor, at, reason: 'Synthetic history', status: 'approved', before: copy(snapshot), content: copy(historical), result: {actor, at, reason: 'Synthetic approval', selfReview: true}});
  flow.receipts['ipqc-operation'] = {actorId: actor.id, fingerprint: JSON.stringify({action: 'apply'}), result: {operationId: 'ipqc-operation', action: 'apply', generation: flow.generation, revision: 0}};
  flow.receipts['ipqc-foreign'] = {...copy(flow.receipts['ipqc-operation']), actorId: 'peer'};
  const version = (id, number, status, content) => ({id, number, status, snapshot: copy(content), revision: 0, creatorId: actor.id, creatorName: actor.name, createdAt: at, updatedAt: at, history: []});
  const legacy = copy(snapshot); legacy.items[0].description = 'Synthetic legacy description';
  const control = {...ipqc.emptyIpqcControl(), activeVersionId: 'ipqc-active', workflow: flow, versions: [
    version('ipqc-legacy', 0, 'superseded', legacy), version('ipqc-active', 1, 'approved', snapshot),
    version('ipqc-case', 2, 'superseded', historical), version('shared-' + flow.generation, 3, 'draft', snapshot),
  ]};
  await f.mutateValues(values => {
    const users = JSON.parse(values.platformUsers);
    users[0].accessOverrides = {'ipqc-c.restore': true, ...users[0].accessOverrides}; values.platformUsers = JSON.stringify(users);
    values.ipqcCMasterControl = JSON.stringify(control);
    const routineControl = routine.parseRoutine();
    const content = {title: 'Synthetic formal plan', date: '2026-10-31', notes: '', lines: [], reason: '', disposition: '', evidence: []};
    const routineFlow = kernel.createSharedDraft('routine:plan', content, 'routine-active', 'routine-generation');
    routineFlow.saves.push({id: 'routine-save', revision: 0, actor, at, content: {...content, notes: 'Synthetic old notes'}, contributors: {}});
    routineFlow.cases.push({id: 'routine-case', savedId: 'routine-save', baseId: 'routine-active', actor, at, reason: 'Synthetic routine history', status: 'approved', before: copy(content), content: {...content, notes: 'Synthetic old notes'}, result: {actor, at, reason: 'Synthetic approval', selfReview: true}});
    routineControl.documents.push({id: 'routine-document', number: 'SYNTHETIC-PLAN', kind: 'plan', planId: null, caseId: null, correctionOf: null, createdAt: at, owner: actor, flow: routineFlow});
    routineControl.receipts['routine-operation'] = {actorId: actor.id, fingerprint: 'synthetic', result: {documentId: 'routine-document'}};
    routineControl.receipts['routine-foreign'] = {...copy(routineControl.receipts['routine-operation']), actorId: 'peer'};
    values.routineFqcEnabled = '1'; values.routineFqcControl = JSON.stringify(routineControl);
    values.qualityMasterControl = JSON.stringify({libraries: {
      fqc: {activeVersionId: 'quality-active', versions: [{id: 'quality-active', number: 1, status: 'approved', reviewedAt: '2026-10-30T00:00:00Z', snapshot: {errors: [], items: [{id: 'routine-item', name: 'Synthetic weekly inspection', checkNo: 'QA-1', line: 'A', category: 'G', isEnabled: true, productCodes: ['A1'], rule: {cadence: 'time', timeFrequency: 'weekly'}}]}}]},
      syntheticSibling: {activeVersionId: 'sibling-active', versions: [{id: 'sibling-active', status: 'approved', snapshot: {note: 'Required quality aggregate sibling body'}}]},
    }});
    const master = JSON.parse(values.masterDataControl); master.active.C = {products: [{id: 'product-c', code: 'C1', name: 'Required master C sibling'}], lines: [], categoryGroups: []};
    values.masterDataControl = JSON.stringify(master);
    if (options.transform) options.transform(values);
  }, false);
  f.load('app/api/ipqc-c/workflow/route.ts'); f.load('app/api/routine-fqc/route.ts');
  f.reset();
  const close = f.close;
  // Do not retain fixture-owned VM graphs in node:test teardown callbacks or
  // benchmark result objects. Only native JSON-detached results leave a sample.
  f.close = () => {close(); f.hooks.clear(); f.events.length = 0; for (const key of Object.keys(f)) delete f[key];};
  return f;
}
export const manifest = f => JSON.parse(f.row().values);
export const aggregate = (f, key) => JSON.parse(f.objects.get(manifest(f).__processRecords.values[key].key));
export function installEnvelope(f, envelope, revision = f.row().revision) {
  f.sqlite.prepare('UPDATE shared_state SET revision=?,"values"=? WHERE id=1').run(revision, JSON.stringify(envelope));
}
export function replaceRawAggregate(f, key, raw, mirror = true) {
  const envelope = manifest(f), sha256 = hash(raw), ref = {key: 'state-records/v1/' + sha256 + '.json', sha256};
  f.objects.set(ref.key, raw); envelope.__processRecords.values[key] = ref;
  if (mirror && ['platformUsers', 'maintenanceMode'].includes(key)) envelope[key] = raw;
  installEnvelope(f, envelope); return ref;
}
export function replaceAggregate(f, key, transform) {
  const next = aggregate(f, key); transform(next); return replaceRawAggregate(f, key, JSON.stringify(next));
}
export async function installLegacyStorage(f, mode) {
  const values = copy(await f.decoded());
  if (mode === 'legacy-r2') {
    const raw = JSON.stringify(values), sha256 = hash(raw), key = 'snapshots/' + sha256 + '.json';
    f.objects.set(key, raw); installEnvelope(f, {__processR2: {key, sha256}, platformUsers: values.platformUsers, maintenanceMode: values.maintenanceMode});
  } else if (mode === 'legacy-chunks') {
    const raw = await f.load('lib/state-chunks.ts').encodeChunkedValues(f.env.STATE_ARCHIVE, values);
    installEnvelope(f, JSON.parse(raw));
  } else throw Error('Unknown synthetic legacy storage');
}
export function faultRef(f, ref, fault) {
  if (fault === 'missing') f.objects.delete(ref.key);
  else if (fault === 'corrupt') f.objects.set(ref.key, 'corrupt');
  else throw Error('faultRef requires missing or corrupt');
}
export function reads(f) {return f.events.filter(e => e.name === 'r2get.before').map(e => e.key);}
export function businessReads(f) {
  const values = manifest(f).__processRecords.values;
  const authRefs = new Set(authKeys.map(key => values[key]?.key).filter(Boolean));
  return reads(f).filter(key => !authRefs.has(key));
}
export function assertReadOnly(f, before, objects) {
  assert.deepEqual(f.row(), before); assert.deepEqual([...f.objects], objects);
  assert.equal(f.stats.put, 0); assert.equal(f.stats.cas, 0); assert.equal(f.stats.head, 0);
}
export async function dispatch(f, name, query = '', headers = f.headers, method = 'GET') {
  return f.load('app/api/' + routePath(name) + '/route.ts').GET(new Request('https://fixture.invalid/api/' + routePath(name) + query, {headers, method}));
}
export async function get(f, name, query = '', headers = f.headers, method = 'GET') {
  const response = await dispatch(f, name, query, headers, method);
  return {status: response.status, headers: [...response.headers], body: await response.json()};
}
export function resourceCounter(f, latency = 0) {
  const totals = {readBytes: 0, writeBytes: 0, activeGet: 0, peakGet: 0, activeBody: 0, peakBody: 0, activeText: 0, peakText: 0, cancelledBodies: 0};
  const bucket = f.env.STATE_ARCHIVE, getObject = bucket.get.bind(bucket), put = bucket.put.bind(bucket);
  bucket.get = async key => {
    totals.activeGet++; totals.peakGet = Math.max(totals.peakGet, totals.activeGet);
    try {
      if (latency) await delay(latency);
      const value = await getObject(key); if (!value) return value;
      totals.activeBody++; totals.peakBody = Math.max(totals.peakBody, totals.activeBody);
      let consumed = false;
      const close = () => {if (!consumed) {consumed = true; totals.activeBody--;}};
      const consume = async () => {totals.activeText++; totals.peakText = Math.max(totals.peakText, totals.activeText); try {const raw = await value.text(); totals.readBytes += Buffer.byteLength(raw); return raw;} finally {totals.activeText--; close();}};
      return {size: Buffer.byteLength(f.objects.get(key)), text: consume, arrayBuffer: async () => new TextEncoder().encode(await consume()).buffer, body: {cancel: async () => {totals.cancelledBodies++; close();}}};
    } finally {totals.activeGet--;}
  };
  bucket.put = async (key, raw) => {totals.writeBytes += Buffer.byteLength(raw); return put(key, raw);};
  return totals;
}
// Explicit query-precedence cases are separate from simple selector coverage.
export const selectors = {
  'ipqc-c': ['', '?permissions=1', '?uiHistory=1', '?uiHistory=1&uiVersionId=ipqc-case', '?uiHistory=1&versionBefore=missing', '?history=cases', '?history=cases&before=missing', '?caseId=missing', '?caseId=ipqc-case', '?versionId=ipqc-active', '?versionId=ipqc-legacy', '?versionId=missing', '?legacyHistory=1', '?legacyHistory=1&before=missing', '?legacyVersionId=ipqc-legacy', '?legacyVersionId=missing', '?restoreSaveId=missing', '?restoreSaveId=ipqc-save', '?operationId=missing', '?operationId=ipqc-operation', '?operationId=ipqc-foreign', '?since=ipqc-synthetic-generation:0', '?since=stale',
    '?permissions=1&versionId=missing', '?uiHistory=1&versionId=missing', '?versionId=ipqc-active&legacyHistory=1', '?legacyHistory=1&restoreSaveId=missing', '?restoreSaveId=ipqc-save&history=cases', '?history=cases&caseId=missing', '?caseId=ipqc-case&operationId=missing', '?operationId=ipqc-operation&since=ipqc-synthetic-generation:0'],
  routine: ['', '?availability=1', '?search-preview=1', '?preview=1', '?operationId=missing', '?operationId=routine-operation', '?operationId=routine-foreign', '?export=missing', '?export=routine-document',
    '?availability=1&search-preview=1&preview=1&operationId=missing&export=missing', '?search-preview=1&preview=1&operationId=missing', '?preview=1&operationId=missing', '?operationId=routine-operation&export=missing'],
};
async function sample(name, latency, cycle) {
  const f = await workflowFixture();
  try {
    const before = f.row(), oldObjects = [...f.objects], beforeDecoded = copy(await f.decoded());
    const resources = resourceCounter(f, latency); f.reset();
    const startedAtUtc = new Date().toISOString(), cpu = process.cpuUsage(), start = performance.now();
    const response = await dispatch(f, name), vmResponseReturnedMs = performance.now() - start;
    const text = await response.text(), elapsedMs = performance.now() - start, usedCPU = process.cpuUsage(cpu), endedAtUtc = new Date().toISOString();
    const measuredResources = {...resources}, counters = {...f.stats}, getOrder = reads(f), body = JSON.parse(text);
    assert.equal(response.status, 200, text); assertReadOnly(f, before, oldObjects);
    for (const key of ['activeGet', 'activeBody', 'activeText']) assert.equal(measuredResources[key], 0, key);
    // All resource snapshots precede this untimed full-decoded-state oracle.
    const decoded = copy(await f.decoded()); assert.deepEqual(decoded, beforeDecoded);
    return {name, cycle, startedAtUtc, endedAtUtc, mode: latency ? 'API_VM_SYNTHETIC_R2_WAIT' : 'API_VM_NO_INJECTED_WAIT', injectedR2GetMs: latency,
      elapsedMs, vmResponseReturnedMs, cpuUserMs: usedCPU.user / 1000, cpuSystemMs: usedCPU.system / 1000,
      requestCount: 1, requestBytes: 0, responseBytes: Buffer.byteLength(text), counters, resources: measuredResources, getOrder,
      result: {status: response.status, headers: [...response.headers], body, decoded, finalRevision: f.row().revision}};
  } finally {f.close();}
}
async function contracts(name) {
  const reports = [];
  for (const query of selectors[name]) {
    const f = await workflowFixture();
    try {const before = f.row(), objects = [...f.objects]; f.reset(); const result = await get(f, name, query); assertReadOnly(f, before, objects); const counters = {...f.stats}, getOrder = reads(f), businessGetCount = businessReads(f).length; result.decoded = copy(await f.decoded()); reports.push({name, kind: 'selector', query, result, counters, getOrder, businessGetCount});} finally {f.close();}
  }
  for (const mode of ['no-cookie', 'forged-headers', 'revoked', 'no-view', 'view-only', 'inline', 'legacy-r2', 'legacy-chunks', 'unsupported-envelope', 'missing-platform-mirror', 'stale-platform-mirror', 'literal-authority', 'head', 'disabled', 'missing-target']) {
    const f = await workflowFixture({inline: mode === 'inline', user: mode === 'view-only' ? {role: 'staff', inheritRole: false, accessOverrides: {[name + '.view']: true}} : undefined});
    try {
      let headers = f.headers;
      if (mode.startsWith('legacy-')) await installLegacyStorage(f, mode);
      if (mode === 'no-cookie') headers = {};
      if (mode === 'forged-headers') headers = {'oai-authenticated-user-id': 'forged', 'x-process-admin-id': 'frank'};
      if (mode === 'revoked') f.revoke();
      if (mode === 'missing-platform-mirror' || mode === 'stale-platform-mirror') {const envelope = manifest(f); if (mode === 'missing-platform-mirror') delete envelope.platformUsers; else envelope.platformUsers = '[]'; installEnvelope(f, envelope);}
      if (mode === 'unsupported-envelope') {const envelope = manifest(f); envelope.syntheticUnsupportedExtension = true; installEnvelope(f, envelope);}
      if (mode === 'literal-authority') await f.mutateValues(values => {const users = JSON.parse(values.platformUsers); users[0].name = '__immutableBody'; values.platformUsers = JSON.stringify(users); values.processRoleTemplateOverrides = JSON.stringify({admin: {description: '__immutableBody'}});}, false);
      if (mode === 'no-view') await f.mutateValues(values => {const users = JSON.parse(values.platformUsers); users[0].accessOverrides[name + '.view'] = false; values.platformUsers = JSON.stringify(users);}, false);
      if (mode === 'disabled') await f.mutateValues(values => {values.routineFqcEnabled = '0';}, false);
      if (mode === 'missing-target') {const envelope = manifest(f); for (const key of businessKeys[name]) delete envelope.__processRecords.values[key]; installEnvelope(f, envelope);}
      const queries = mode === 'view-only' ? name === 'routine' ? ['', '?preview=1', '?search-preview=1', '?export=routine-document', '?operationId=routine-operation'] : ['', '?uiHistory=1', '?history=cases', '?caseId=ipqc-case', '?restoreSaveId=ipqc-save', '?operationId=ipqc-operation'] : mode === 'disabled' && name === 'routine' ? ['', '?availability=1'] : [''];
      for (const query of queries) {const before = f.row(), objects = [...f.objects]; f.reset(); const result = await get(f, name, query, headers, mode === 'head' ? 'HEAD' : 'GET'); assertReadOnly(f, before, objects); const counters = {...f.stats}, getOrder = reads(f), businessGetCount = mode === 'inline' || mode.startsWith('legacy-') ? null : businessReads(f).length; result.decoded = copy(await f.decoded()); reports.push({name, kind: mode, query, result, counters, getOrder, businessGetCount});}
    } finally {f.close();}
  }
  return reports;
}
async function faultPolicies(name) {
  const reports = [];
  for (const target of ['aggregate', 'body']) for (const fault of ['missing', 'corrupt', 'malformed-json']) {
    const f = await workflowFixture();
    try {
      const key = 'toolingMasterControl';
      if (target === 'aggregate') {
        if (fault === 'malformed-json') replaceRawAggregate(f, key, '{broken'); else faultRef(f, manifest(f).__processRecords.values[key], fault);
      } else {
        const ref = aggregate(f, key).versions[0].snapshot.__immutableBody;
        if (fault === 'malformed-json') {const raw = '{broken', sha256 = hash(raw), next = {key: 'state-records/v1/' + sha256 + '.json', sha256}; f.objects.set(next.key, raw); replaceAggregate(f, key, model => {model.versions[0].snapshot = {__immutableBody: next};});}
        else faultRef(f, ref, fault);
      }
      const before = f.row(), objects = [...f.objects]; f.reset(); const result = await get(f, name); assertReadOnly(f, before, objects);
      reports.push({name, target, fault, status: result.status, error: result.body.error ?? null, counters: {...f.stats}, excludedAggregateReads: reads(f).filter(keyRead => keyRead === manifest(f).__processRecords.values[key].key).length});
    } finally {f.close();}
  }
  if (name === 'routine') {
    const f = await workflowFixture();
    try {
      replaceRawAggregate(f, 'routineFqcEnabled', '{broken');
      const before = f.row(), objects = [...f.objects]; f.reset(); const result = await get(f, name); assertReadOnly(f, before, objects);
      reports.push({name, target: 'required-enabled-aggregate', fault: 'malformed-json', status: result.status, error: result.body.error ?? null, counters: {...f.stats}, excludedAggregateReads: null});
    } finally {f.close();}
  }
  return reports;
}
const sourceFiles = ['lib/scoped-workflow-read.ts', 'lib/process-state.ts', 'lib/state-records.ts', 'lib/versioned-shared-workflow.ts', 'app/api/ipqc-c/workflow/route.ts', 'app/api/routine-fqc/route.ts'];
const provenance = () => ({harnessHashes: Object.fromEntries(['tests/scoped-workflow-read-benchmark.mjs', 'tests/master-ab-auth-phase-fixture.mjs', 'scripts/scoped-fqc-integration-source-contract.cjs'].map(file => [file, hash(fs.readFileSync(path.join(repository, file)))])), sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], {cwd: sourceRoot, encoding: 'utf8'}).trim(), sourceTree: execFileSync('git', ['rev-parse', 'HEAD^{tree}'], {cwd: sourceRoot, encoding: 'utf8'}).trim(), sourceHashes: Object.fromEntries(sourceFiles.map(file => [file, fs.existsSync(path.join(sourceRoot, file)) ? hash(fs.readFileSync(path.join(sourceRoot, file))) : null]))});
async function child(name, latency) {
  const scopeDiagnostics = [], originalInfo = console.info;
  console.info = (...args) => {assert.equal(args[0], '[record-read-scope]'); assert.equal(args.length, 2); scopeDiagnostics.push(JSON.parse(args[1]));};
  try {
    const samples = [], pairedContracts = [], policies = [];
    if (process.argv.includes('--contracts')) {pairedContracts.push(...await contracts(name)); policies.push(...await faultPolicies(name));}
    else for (let cycle = 1; cycle <= 7; cycle++) samples.push(await sample(name, latency, cycle));
    return {...provenance(), samples, contracts: pairedContracts, faultPolicies: policies, scopeDiagnostics, processResources: {maxRssKiB: process.resourceUsage().maxRSS, finalHeapUsedBytes: process.memoryUsage().heapUsed, finalRssBytes: process.memoryUsage().rss}};
  } finally {console.info = originalInfo;}
}
const summarize = values => ({median: [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)], max: Math.max(...values)});
function compare(baseline, candidate, baselineSpec) {
  assert.equal(baseline.sourceCommit, baselineSpec.commit); if (baselineSpec.tree) assert.equal(baseline.sourceTree, baselineSpec.tree); assert.deepEqual(baseline.harnessHashes, candidate.harnessHashes, 'both sources use exactly the same harness'); assert.equal(baseline.samples.length, 28); assert.equal(candidate.samples.length, 28);
  for (let index = 0; index < baseline.samples.length; index++) {
    const a = baseline.samples[index], b = candidate.samples[index];
    assert.equal(a.name, b.name); assert.equal(a.cycle, b.cycle); assert.equal(a.mode, b.mode);
    assert.equal(canonical(a.result), canonical(b.result), 'complete DTO/headers/decoded-state parity ' + a.name);
    assert.equal(a.requestBytes, b.requestBytes); assert.equal(a.responseBytes, b.responseBytes);
    for (const key of ['state', 'revision', 'cas', 'head', 'put', 'other']) assert.equal(a.counters[key], b.counters[key], key);
    assert.equal(a.counters.sql, a.name === 'ipqc-c' ? 14 : 12, 'pinned main ordinary cell checks');
    assert.equal(a.counters.revocation, a.name === 'ipqc-c' ? 13 : 11);
    assert.equal(b.counters.sql, 5, 'one selected snapshot and four fresh fences');
    assert.equal(b.counters.revocation, 4);
    assert.ok(b.counters.get < a.counters.get); assert.ok(b.resources.readBytes < a.resources.readBytes);
  }
  assert.equal(baseline.contracts.length, candidate.contracts.length);
  for (let index = 0; index < baseline.contracts.length; index++) {
    const a = baseline.contracts[index], b = candidate.contracts[index];
    assert.deepEqual([a.name, a.kind, a.query], [b.name, b.kind, b.query]);
    assert.equal(canonical(a.result), canonical(b.result), 'selector/role/legacy parity ' + a.name + '/' + a.kind + '/' + a.query);
    if (['no-cookie', 'forged-headers', 'revoked', 'no-view'].includes(b.kind) || b.name === 'ipqc-c' && b.query.includes('permissions=1')) assert.equal(b.businessGetCount, 0, 'no preauthorization business reads');
    if (b.name === 'ipqc-c' && b.query.includes('permissions=1')) {assert.equal(a.counters.sql, 14); assert.equal(a.counters.revocation, 13); assert.equal(b.counters.sql, 3); assert.equal(b.counters.revocation, 2);}
    if (b.kind === 'head') assert.deepEqual(b.counters, a.counters, 'auto-HEAD retains ordinary full-read cost and authority checks');

  }
  assert.equal(candidate.faultPolicies.length, 13);
  for (let index = 0; index < candidate.faultPolicies.length; index++) {
    const a = baseline.faultPolicies[index], b = candidate.faultPolicies[index];
    assert.deepEqual([a.name, a.target, a.fault], [b.name, b.target, b.fault]);
    if (b.target === 'required-enabled-aggregate') {assert.equal(a.status, 404); assert.equal(b.status, 503); continue;}
    assert.equal(b.status, 200); assert.equal(b.excludedAggregateReads, 0);
    // Unmarked malformed aggregate JSON already succeeds in the old decoder.
    assert.equal(a.status, a.target === 'aggregate' && a.fault === 'malformed-json' ? 200 : 503);
  }
  const rows = routes.flatMap(name => [0, 12].map(latency => {
    const summarizeSamples = samples => {const selected = samples.filter(s => s.name === name && s.injectedR2GetMs === latency); assert.equal(selected.length, 7); return {elapsedMs: summarize(selected.map(s => s.elapsedMs)), cpuUserMs: summarize(selected.map(s => s.cpuUserMs)), cpuSystemMs: summarize(selected.map(s => s.cpuSystemMs)), counters: selected[0].counters, resources: selected[0].resources, responseBytes: selected[0].responseBytes};};
    return {name, injectedR2GetMs: latency, samplesPerSource: 7, baseline: summarizeSamples(baseline.samples), candidate: summarizeSamples(candidate.samples)};
  }));
  return {status: 'PASS_SCOPED_WORKFLOW_READ_PAIRED_ROUTES', baselineCommit: baselineSpec.commit, baselineTree: baseline.sourceTree, baselineMode: baselineSpec.mode, totalTimedSamples: 56, rows, baseline, candidate, limitations: [
    'In-process production GET handlers, not a deployed Worker, HTTPS endpoint or browser click-to-ready time.',
    '12ms is an artificial wait per R2 GET, not a live-latency estimate; CPU/maxRSS include the harness.',
    'Exactly one D1 snapshot is selected; supported GETs retain four fresh revocation fences (permissions-only two), with same-snapshot authority semantics.',
    'Routine reads complete required quality/master aggregates: other scopes inside them are not isolated.',
    'Unsupported envelopes and legacy storage preserve their ordinary full-read compatibility path and do not claim aggregate fault isolation.',
    'Unrelated-corruption policy pairs are separate from healthy DTO parity. Complete decoded-state oracles run only after resource snapshots.',
  ]};
}
if (process.argv[1] && path.resolve(process.argv[1]) === script) {
  if (process.argv.includes('--child')) console.log(JSON.stringify(await child(process.argv[process.argv.indexOf('--route') + 1], Number(process.argv[process.argv.indexOf('--latency') + 1] || 0))));
  else {
    const flags = process.argv.slice(2), baselineSpec = Object.hasOwn(baselineModes, flags[0]) ? baselineModes[flags[0]] : undefined;
    assert.ok(flags.length === 2 && baselineSpec && flags[1] && !flags[1].startsWith('--'), 'exactly --baseline <clean 268a checkout> or --baseline-main848 <clean 848 checkout> required');
    const beforeRoot = path.resolve(flags[1]);
    assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], {cwd: beforeRoot, encoding: 'utf8'}).trim(), baselineSpec.commit);
    if (baselineSpec.tree) assert.equal(execFileSync('git', ['rev-parse', 'HEAD^{tree}'], {cwd: beforeRoot, encoding: 'utf8'}).trim(), baselineSpec.tree);
    assert.equal(execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], {cwd: beforeRoot, encoding: 'utf8'}).trim(), '', 'baseline tracked source must be clean');
    const reports = {baseline: {samples: [], contracts: [], faultPolicies: [], scopeDiagnostics: [], processResources: []}, candidate: {samples: [], contracts: [], faultPolicies: [], scopeDiagnostics: [], processResources: []}};
    // Isolated disjoint child processes bound VM retention without raising heap.
    // Alternate source order per route/mode rather than timing every before first.
    let turn = 0;
    for (const name of routes) for (const phase of [0, 12, 'contracts']) {
      const order = turn % 2 ? ['candidate', 'baseline'] : ['baseline', 'candidate']; turn += 1;
      for (const source of order) {
        const root = source === 'baseline' ? beforeRoot : repository;
        const args = ['--max-old-space-size=384', script, '--child', '--route', name, '--latency', String(phase === 'contracts' ? 0 : phase), ...(phase === 'contracts' ? ['--contracts'] : [])];
        const report = JSON.parse(execFileSync(process.execPath, args, {cwd: repository, env: {...process.env, MASTER_AB_SOURCE_ROOT: root}, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024}));
        const target = reports[source];
        if (target.sourceHashes) {assert.deepEqual(target.sourceHashes, report.sourceHashes, 'source changed during paired benchmark'); assert.equal(target.sourceCommit, report.sourceCommit, 'source commit changed during paired benchmark'); assert.equal(target.sourceTree, report.sourceTree, 'source tree changed during paired benchmark'); assert.deepEqual(target.harnessHashes, report.harnessHashes, 'harness changed during paired benchmark');}
        target.harnessHashes = report.harnessHashes;
        target.sourceCommit = report.sourceCommit; target.sourceTree = report.sourceTree; target.sourceHashes = report.sourceHashes;
        for (const key of ['samples', 'contracts', 'faultPolicies', 'scopeDiagnostics']) target[key].push(...report[key]);
        target.processResources.push({name, phase, ...report.processResources});
      }
    }
    console.log(JSON.stringify(compare(reports.baseline, reports.candidate, baselineSpec), null, 2));
  }
}
