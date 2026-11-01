// Actual Master AB Save route, synthetic in-memory SQLite/R2 only.
// No listener, hosted traffic, account creation or browser timing.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {fixture, sourceRoot} from './master-ab-auth-phase-fixture.mjs';

const script = fileURLToPath(import.meta.url), repository = path.resolve(path.dirname(script), '..');
export const baselineCommit = '268a8e49ec751bb6849033e20a27d30194aad67c';
export function saveBaselineAdmission(argv) {
  const main848 = argv[0] === '--baseline-main848';
  assert.ok(argv.length === 2 && ['--baseline', '--baseline-main848'].includes(argv[0]) && argv[1], 'Exactly one pinned baseline mode/path required');
  const root = path.resolve(argv[1]), commit = main848 ? '848be13da54c7ae747bcdd96df19e01129fe980a' : baselineCommit;
  const tree = main848 ? '39c8c63d040322842312605aaaac778ecd937b2e' : '2285d85d1a74e5b10ca575b5fe4505863d33f51f';
  assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim(), commit, 'Wrong baseline commit');
  assert.equal(execFileSync('git', ['rev-parse', 'HEAD^{tree}'], {cwd: root, encoding: 'utf8'}).trim(), tree, 'Wrong baseline tree');
  assert.equal(execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], {cwd: root, encoding: 'utf8'}).trim(), '', 'baseline tracked source must be clean');
  return {root, commit, tree, mode: main848 ? 'PUBLIC_MAIN_848' : 'PUBLIC_MAIN_268'};
}
export const copy = value => JSON.parse(JSON.stringify(value));
export const hash = value => createHash('sha256').update(value).digest('hex');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const uuidPattern = /\b[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\b/g;
export function canonical(value) {
  const ids = new Map();
  return JSON.stringify(value).replace(uuidPattern, id => {
    if (!ids.has(id)) ids.set(id, 'UUID-' + ids.size);
    return ids.get(id);
  });
}
export async function saveFixture(options = {}) {
  const f = await fixture({user: options.user, primary: options.primary, inline: options.inline, scope: options.scope,
    values: {processCustomRoles: '[]', processRoleTemplateOverrides: '{}', processAccessControl: '{}', maintenanceMode: '0',
      toolingMasterControl: JSON.stringify({versions: [{id: 'synthetic-unrelated-draft', status: 'draft', snapshot: {note: 'Synthetic unrelated tooling body. '.repeat(2048)}}]}),
      routineEquipmentControl: JSON.stringify({versions: [{id: 'synthetic-equipment-draft', status: 'draft', snapshot: {note: 'Synthetic unrelated equipment body. '.repeat(1024)}}]}),
      syntheticRetainedSentinel: JSON.stringify({working: {note: 'Synthetic unrelated retained body. '.repeat(1024)}}),
      ...options.values}});
  await f.mutateValues(values => {
    const root = JSON.parse(values.masterDataControl), flow = root.workflowScopes[f.scope];
    if (f.scope === 'AB') {
      flow.working.products[0].name = 'Synthetic unsaved AB product';
      flow.revision = 3;
      flow.contributors = {'synthetic-change': {actor: {id: f.user.id, name: f.user.name}, at: '2026-10-31T12:00:00.000Z'}};
      const draft = root.versions.find(v => v.id === 'shared-' + flow.generation);
      draft.snapshot = copy(flow.working); draft.revision = flow.revision;
      if (options.saved) {
        flow.saved = {id: 'synthetic-current-save', revision: 3, actor: {id: f.user.id, name: f.user.name}, at: '2026-10-31T12:00:00.000Z', content: copy(flow.working), contributors: {}};
        flow.saves.push(copy(flow.saved));
      }
    }
    values.masterDataControl = JSON.stringify(root);
  }, false);
  f.reset();
  // node:test retains registered teardown callbacks. Break the fixture/module
  // graph after close so many independent VM fixtures do not remain reachable.
  const close = f.close;
  f.close = () => {close(); f.hooks.clear(); f.events.length = 0; for (const key of Object.keys(f)) delete f[key];};
  return f;
}
export function manifest(f) {return JSON.parse(f.row().values);}
export function aggregate(f, key = 'masterDataControl') {return JSON.parse(f.objects.get(manifest(f).__processRecords.values[key].key));}
export function immutableRef(f, select, key = 'masterDataControl') {return select(aggregate(f, key)).__immutableBody;}
export function installEnvelope(f, envelope, revision = f.row().revision) {
  f.sqlite.prepare('UPDATE shared_state SET revision=?,"values"=? WHERE id=1').run(revision, JSON.stringify(envelope));
}
export function replaceAggregate(f, key, transform) {
  const envelope = manifest(f), raw = f.objects.get(envelope.__processRecords.values[key].key), next = transform(JSON.parse(raw));
  const serialized = JSON.stringify(next), sha256 = hash(serialized), ref = {key: 'state-records/v1/' + sha256 + '.json', sha256};
  f.objects.set(ref.key, serialized); envelope.__processRecords.values[key] = ref; installEnvelope(f, envelope);
}
export function assertUnrelatedPreserved(f, before, objects) {
  const prior = JSON.parse(before.values), after = manifest(f);
  for (const [key, ref] of Object.entries(prior.__processRecords.values)) if (key !== 'masterDataControl') assert.deepEqual(after.__processRecords.values[key], ref, 'unrelated ref ' + key);
  assert.deepEqual(after.__processRecords.legacySources, prior.__processRecords.legacySources);
  assert.deepEqual(after.__processRecords.allocations, prior.__processRecords.allocations);
  assert.equal(after.platformUsers, prior.platformUsers); assert.equal(after.maintenanceMode, prior.maintenanceMode);
  for (const [key, raw] of objects) assert.equal(f.objects.get(key), raw, 'old immutable object bytes');
}
export function masterReads(f) {
  const ref = manifest(f).__processRecords.values.masterDataControl;
  return f.events.filter(e => e.name === 'r2get.before' && e.key === ref.key).length;
}
export function resourceCounter(f, latency = 0) {
  const totals = {readBytes: 0, writeBytes: 0, activeGet: 0, peakGet: 0, activeBody: 0, peakBody: 0, cancelledBodies: 0};
  const bucket = f.env.STATE_ARCHIVE, get = bucket.get.bind(bucket), put = bucket.put.bind(bucket);
  bucket.get = async key => {
    totals.activeGet++; totals.peakGet = Math.max(totals.peakGet, totals.activeGet);
    try {
      if (latency) await delay(latency);
      const value = await get(key); if (!value) return value;
      totals.activeBody++; totals.peakBody = Math.max(totals.peakBody, totals.activeBody);
      let consumed = false;
      const close = () => {if (!consumed) {consumed = true; totals.activeBody--;}};
      return {size: Buffer.byteLength(f.objects.get(key)), text: async () => {try {const raw = await value.text(); totals.readBytes += Buffer.byteLength(raw); return raw;} finally {close();}},
        body: {cancel: async () => {totals.cancelledBodies++; close();}}};
    } finally {totals.activeGet--;}
  };
  bucket.put = async (key, raw) => {totals.writeBytes += Buffer.byteLength(raw); return put(key, raw);};
  return totals;
}
async function sample(cycle, latency) {
  const f = await saveFixture();
  try {
    const before = f.row(), oldObjects = [...f.objects], command = f.command('save', {expectedRevision: 3, reason: 'Synthetic manual save'});
    const requestBody = JSON.stringify({command}), resources = resourceCounter(f, latency); f.reset();
    const cpu = process.cpuUsage(), start = performance.now();
    const response = await f.route.POST(new Request(f.url, {method: 'POST', headers: f.headers, body: requestBody}));
    const vmResponseReturnedMs = performance.now() - start, text = await response.text(), elapsedMs = performance.now() - start;
    const cpuUsed = process.cpuUsage(cpu), body = JSON.parse(text), measuredResources = {...resources}, counters = {...f.stats};
    assert.equal(response.status, 200, text); assert.equal(resources.activeGet, 0); assert.equal(resources.activeBody, 0);
    assertUnrelatedPreserved(f, before, oldObjects);
    const decoded = copy(await f.decoded());
    return {cycle, injectedR2GetMs: latency, mode: latency ? 'API_VM_SYNTHETIC_R2_WAIT' : 'API_VM_NO_INJECTED_WAIT',
      requestCount: 1, requestBytes: Buffer.byteLength(requestBody), responseBytes: Buffer.byteLength(text), elapsedMs, vmResponseReturnedMs,
      cpuUserMs: cpuUsed.user / 1000, cpuSystemMs: cpuUsed.system / 1000, counters, resources: measuredResources,
      result: {status: response.status, headers: [...response.headers], body, decoded, finalRevision: f.row().revision}};
  } finally {f.close();}
}
const summarize = values => ({median: [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)], max: Math.max(...values)});
async function legacyContracts() {
  const results = [];
  for (const kind of ['legacy-missing-ids', 'active-id-fallback', 'active-id-existing-fallback', 'unknown-root-metadata', 'legacy-inline', 'unsupported-envelope', 'full-reply']) {
    const f = await saveFixture();
    try {
      if (['legacy-missing-ids', 'active-id-fallback', 'active-id-existing-fallback', 'unknown-root-metadata'].includes(kind)) await f.mutateValues(values => {
        const root = JSON.parse(values.masterDataControl), flow = root.workflowScopes.AB;
        if (kind === 'legacy-missing-ids') {
          const removeIds = catalog => {for (const key of ['products', 'lines', 'categoryGroups']) for (const row of catalog[key] || []) {delete row.id; if (key === 'lines') for (const stage of row.stages || []) delete stage.id;}};
          for (const catalog of [root.active.AB, ...root.versions.filter(v => v.scope === 'AB').map(v => v.snapshot), flow.active.content, flow.working, ...flow.saves.map(s => s.content), ...flow.cases.flatMap(c => [c.before, c.content])]) removeIds(catalog);
        }
        if (kind === 'active-id-fallback') flow.active.id = 'legacy-stale-active-pointer';
        if (kind === 'active-id-existing-fallback') flow.active.id = 'case0';
        if (kind === 'unknown-root-metadata') root.syntheticRetainedMetadata = {name: 'unchanged metadata', version: 1};
        values.masterDataControl = JSON.stringify(root);
      }, false);
      if (kind === 'legacy-inline') {
        const values = copy(await f.decoded()); f.sqlite.prepare('UPDATE shared_state SET "values"=? WHERE id=1').run(JSON.stringify(values));
      }
      if (kind === 'unsupported-envelope') {const envelope = manifest(f); envelope.syntheticUnsupportedExtension = true; installEnvelope(f, envelope);}
      const target = new URL(f.url); if (kind === 'full-reply') target.searchParams.delete('caseMetadata');
      const command = f.command('save', {expectedRevision: 3}), before = f.row(); f.reset();
      const response = await f.route.POST(new Request(target, {method: 'POST', headers: f.headers, body: JSON.stringify({command})})), body = await response.json();
      // Original projectSharedVersion cannot write a nonexistent active ID;
      // preserve that observed failure rather than "fixing" it in scoped Save.
      assert.equal(response.status, kind === 'active-id-fallback' ? 500 : 200, kind + ': ' + JSON.stringify(body));
      if (kind === 'active-id-fallback') {assert.deepEqual(f.row(), before); assert.equal(f.stats.cas, 0); assert.equal(f.stats.put, 0);}
      const counters = {...f.stats}, decoded = copy(await f.decoded());
      results.push({kind, counters, result: {status: response.status, headers: [...response.headers], body, decoded, revision: f.row().revision}});
    } finally {f.close();}
  }
  return results;
}
async function faultContracts() {
  const results = [], scoped = fs.existsSync(path.join(sourceRoot, 'lib/master-ab-save-record-mutation.ts'));
  for (const target of ['aggregate', 'body']) for (const fault of ['missing', 'corrupt', 'malformed-json']) {
    const f = await saveFixture();
    try {
      const key = 'toolingMasterControl', ref = target === 'aggregate' ? manifest(f).__processRecords.values[key] : immutableRef(f, model => model.versions[0].snapshot, key);
      if (fault === 'missing') f.objects.delete(ref.key);
      else if (fault === 'corrupt') f.objects.set(ref.key, 'corrupt');
      else {
        const raw = '{broken', sha256 = hash(raw), next = {key: 'state-records/v1/' + sha256 + '.json', sha256};
        f.objects.set(next.key, raw);
        if (target === 'aggregate') {const envelope = manifest(f); envelope.__processRecords.values[key] = next; installEnvelope(f, envelope);}
        else replaceAggregate(f, key, model => {model.versions[0].snapshot = {__immutableBody: next}; return model;});
      }
      const before = f.row(), objects = [...f.objects]; f.reset();
      const reply = await f.request('POST', f.command('save', {expectedRevision: 3}));
      // A legacy unmarked string is not parsed by the ordinary reader either.
      // Record this existing success instead of inventing a pre-change failure.
      const succeeds = scoped || target === 'aggregate' && fault === 'malformed-json';
      assert.equal(reply.status, succeeds ? 200 : 500, target + '/' + fault);
      assertUnrelatedPreserved(f, before, objects);
      if (!succeeds) {assert.deepEqual(f.row(), before); assert.equal(f.stats.put, 0); assert.equal(f.stats.cas, 0);}
      else assert.equal(reply.body.control.workflow.saved.content.products[0].name, 'Synthetic unsaved AB product');
      results.push({target, fault, status: reply.status, error: reply.body.error ?? null, counters: {...f.stats},
        excludedAggregateReads: f.events.filter(e => e.name === 'r2get.before' && e.key === JSON.parse(before.values).__processRecords.values[key].key).length,
        unrelatedRefsAndOldBytesPreserved: true});
    } finally {f.close();}
  }
  return results;
}
async function child() {
  const samples = [], contracts = [], faultPolicies = [], scopeDiagnostics = [], originalInfo = console.info;
  console.info = (...args) => {
    assert.equal(args.length, 2, 'unexpected production diagnostic shape');
    assert.equal(args[0], '[record-read-scope]');
    const entry = JSON.parse(args[1]);
    assert.deepEqual(Object.keys(entry).sort(), ['policy', 'required', 'revision', 'unverifiedAggregates']);
    assert.equal(entry.policy, 'master-ab-save-v1');
    assert.ok(Number.isSafeInteger(entry.revision) && Number.isSafeInteger(entry.unverifiedAggregates));
    scopeDiagnostics.push(entry);
  };
  try {
    if (!process.argv.includes('--contracts-only')) for (const latency of [0, 12]) for (let cycle = 1; cycle <= 7; cycle++) samples.push(await sample(cycle, latency));
    contracts.push(...await legacyContracts());
    faultPolicies.push(...await faultContracts());
  } finally {console.info = originalInfo;}
  return {sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], {cwd: sourceRoot, encoding: 'utf8'}).trim(),
    sourceTree: execFileSync('git', ['rev-parse', 'HEAD^{tree}'], {cwd: sourceRoot, encoding: 'utf8'}).trim(),
    sourceHashes: Object.fromEntries(['lib/process-state.ts', 'lib/state-records.ts', 'lib/master-ab-save-record-mutation.ts', 'lib/master-workflow.ts', 'lib/versioned-shared-workflow.ts'].map(file => {
      const location = path.join(sourceRoot, file); return [file, fs.existsSync(location) ? hash(fs.readFileSync(location)) : null];
    })),
    samples, contracts, faultPolicies, scopeDiagnostics, processResources: {maxRssKiB: process.resourceUsage().maxRSS, finalHeapUsedBytes: process.memoryUsage().heapUsed}};
}
function compare(baseline, candidate, admitted) {
  assert.equal(baseline.sourceCommit, admitted.commit); assert.equal(baseline.sourceTree, admitted.tree); assert.equal(baseline.samples.length, 14); assert.equal(candidate.samples.length, 14);
  for (let i = 0; i < 14; i++) {
    const a = baseline.samples[i], b = candidate.samples[i];
    assert.equal(a.cycle, b.cycle); assert.equal(a.mode, b.mode);
    assert.equal(canonical(a.result), canonical(b.result), 'complete healthy-data DTO and persisted decoded state');
    for (const key of ['state', 'revision', 'cas', 'put', 'head']) assert.equal(a.counters[key], b.counters[key], key);
    assert.ok(b.counters.get < a.counters.get, 'scoped Save must remove unrelated R2 GETs');
    assert.equal(a.responseBytes, b.responseBytes); assert.equal(a.requestBytes, b.requestBytes);
  }
  assert.equal(baseline.contracts.length, 7); assert.equal(candidate.contracts.length, 7);
  for (let i = 0; i < 7; i++) {
    assert.equal(candidate.contracts[i].kind, baseline.contracts[i].kind);
    assert.equal(canonical(candidate.contracts[i].result), canonical(baseline.contracts[i].result), 'legacy/full-reply actual route parity: ' + baseline.contracts[i].kind);
  }
  assert.equal(baseline.faultPolicies.length, 6); assert.equal(candidate.faultPolicies.length, 6);
  for (let i = 0; i < 6; i++) {
    assert.equal(candidate.faultPolicies[i].target, baseline.faultPolicies[i].target);
    assert.equal(candidate.faultPolicies[i].fault, baseline.faultPolicies[i].fault);
    assert.equal(candidate.faultPolicies[i].excludedAggregateReads, 0);
  }
  const rows = [0, 12].map(latency => {
    const a = baseline.samples.filter(s => s.injectedR2GetMs === latency), b = candidate.samples.filter(s => s.injectedR2GetMs === latency);
    return {injectedR2GetMs: latency, samples: 7,
      baseline: {elapsedMs: summarize(a.map(s => s.elapsedMs)), counters: a[0].counters, resources: a[0].resources},
      candidate: {elapsedMs: summarize(b.map(s => s.elapsedMs)), counters: b[0].counters, resources: b[0].resources}};
  });
  return {status: 'PASS_MASTER_AB_SAVE_PINNED_ROUTE_PAIRS', baselineMode: admitted.mode, baselineCommit: admitted.commit, baselineTree: admitted.tree, rows, baseline, candidate,
    limitations: ['Actual production route in a VM, not deployed Worker, HTTPS or click-to-ready time.',
      '12ms R2 GET delay is synthetic, not estimated live latency. CPU/GC/maxRSS include the test harness.',
      'Authorization may intentionally add a fresh pre-business fence; report SQL tradeoff without claiming every counter falls.',
      'Unrelated-corruption policy differences are tested separately and excluded from healthy DTO parity.']};
}
if (process.argv[1] && path.resolve(process.argv[1]) === script) {
  if (process.argv.includes('--child')) console.log(JSON.stringify(await child()));
  else {
    const admitted = saveBaselineAdmission(process.argv.slice(2));
    const candidateCommit = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: repository, encoding: 'utf8'}).trim();
    const candidateTree = execFileSync('git', ['rev-parse', 'HEAD^{tree}'], {cwd: repository, encoding: 'utf8'}).trim();
    assert.equal(execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], {cwd: repository, encoding: 'utf8'}).trim(), '', 'candidate tracked source must be clean');
    const run = root => JSON.parse(execFileSync(process.execPath, ['--max-old-space-size=384', script, '--child'], {cwd: repository, env: {...process.env, MASTER_AB_SOURCE_ROOT: root}, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024}));
    const before = run(admitted.root), after = run(repository);
    assert.equal(after.sourceCommit, candidateCommit); assert.equal(after.sourceTree, candidateTree);
    assert.deepEqual(saveBaselineAdmission(process.argv.slice(2)), admitted);
    assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], {cwd: repository, encoding: 'utf8'}).trim(), candidateCommit);
    assert.equal(execFileSync('git', ['rev-parse', 'HEAD^{tree}'], {cwd: repository, encoding: 'utf8'}).trim(), candidateTree);
    assert.equal(execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], {cwd: repository, encoding: 'utf8'}).trim(), '', 'candidate changed during paired run');
    console.log(JSON.stringify(compare(before, after, admitted), null, 2));
  }
}
