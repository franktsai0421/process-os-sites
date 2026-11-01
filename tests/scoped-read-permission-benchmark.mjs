// Paired real production GETs: frozen scoped-closure b625 versus request-local
// permission phase. Synthetic SQL waits are not deployed Worker/UI latency.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {sourceRoot} from './master-ab-auth-phase-fixture.mjs';
import {workflowFixture, routes, selectors, authKeys, routePath, get, dispatch, copy, hash, canonical, manifest, installEnvelope, installLegacyStorage, reads, businessReads, assertReadOnly, resourceCounter} from './scoped-workflow-read-benchmark.mjs';

const script = fileURLToPath(import.meta.url), repository = path.resolve(path.dirname(script), '..');
export const closureCommit = 'b62526ce3e471e5da8658896beaf786e06af6839';
const baselineSnapshotSHA = 'a2ec8dae0990c9d84236f5cdca9b819af74a7db749b58f3b26e05828741623e5';
function verifiedSnapshot(root) {
  const proof = createRequire(import.meta.url)('../scripts/scoped-read-phase-baseline.cjs').verifySnapshot(root);
  assert.equal(proof.kind, 'baseline-bytes'); assert.equal(proof.originalLocalCheckpoint, closureCommit); assert.equal(proof.snapshotSha256, baselineSnapshotSHA);
  return proof;
}
const mainCommit = '268a8e49ec751bb6849033e20a27d30194aad67c';
export const roleProfiles = [
  {id: 'admin', user: {}},
  {id: 'primary-overrides-deny', primary: true, user: {accessOverrides: {'ipqc-c.view': false, 'routine.view': false, 'ipqc-c.restore': false}}},
  {id: 'rd', user: {role: 'rd'}},
  {id: 'staff', user: {role: 'staff'}},
  {id: 'view-only', user: {role: 'staff', inheritRole: false, accessOverrides: {'ipqc-c.view': true, 'routine.view': true}}},
  {id: 'view-settings-no-edit', user: {role: 'staff', inheritRole: false, accessOverrides: {'ipqc-c.view': true, 'routine.view': true, 'routine.settings': true}}},
  {id: 'view-save-no-edit', user: {role: 'staff', inheritRole: false, accessOverrides: {'ipqc-c.view': true, 'routine.view': true, 'ipqc-c.save': true, 'routine.save': true}}},
  {id: 'restore-no-create-delete', user: {role: 'staff', inheritRole: false, accessOverrides: {'ipqc-c.view': true, 'ipqc-c.edit': true, 'ipqc-c.restore': true, 'ipqc-c.create': false, 'ipqc-c.delete': false, 'routine.view': true, 'routine.edit': true}}},
  {id: 'approve-no-revoke', user: {role: 'staff', inheritRole: false, accessOverrides: {'routine.view': true, 'routine.approve': true, 'ipqc-c.view': true}}},
  {id: 'admin-edit-explicit-deny', user: {accessOverrides: {'ipqc-c.edit': false, 'routine.edit': false}}},
  {id: 'admin-view-explicit-deny', user: {accessOverrides: {'ipqc-c.view': false, 'routine.view': false}}},
  {id: 'inconsistent-view-denied-edit-granted', user: {role: 'staff', inheritRole: false, accessOverrides: {'ipqc-c.view': false, 'ipqc-c.edit': true, 'routine.view': false, 'routine.edit': true}}},
  {id: 'custom-role', user: {role: 'synthetic-role'}, values: {processCustomRoles: JSON.stringify([{id: 'synthetic-role', name: 'Synthetic custom role', lines: [], views: [], permissions: [], access: {'ipqc-c.view': true, 'routine.view': true, 'routine.settings': true}}])}},
  {id: 'unknown-role', user: {role: 'unknown-synthetic-role'}},
  {id: 'disabled', user: {enabled: false}},
  {id: 'deleted', user: {deletedAt: '2026-10-31T11:00:00Z'}},
  {id: 'template-view-denied', values: {processRoleTemplateOverrides: JSON.stringify({admin: {access: {'ipqc-c.view': false, 'routine.view': false}}})}},
  {id: 'literal-reference-text', user: {name: '__immutableBody'}, values: {processRoleTemplateOverrides: JSON.stringify({admin: {description: '__immutableBody'}})}},
];
export async function phaseFixture(profile = roleProfiles[0]) {return workflowFixture({user: profile.user, primary: profile.primary, values: profile.values});}
export function requestFor(f, name, query = '', method = 'GET') {return new Request('https://fixture.invalid/api/' + routePath(name) + query, {method, headers: f.headers});}
export async function selectedPhase(f, name, query = '') {
  const request = requestFor(f, name, query), reader = f.load('lib/scoped-workflow-read.ts');
  const state = await reader.readScopedWorkflowState(request, name === 'ipqc-c' ? 'ipqc-c-workflow' : 'routine-fqc');
  return {request, state, phase: reader.scopedWorkflowPermissionPhase(request, state), module: reader};
}
export async function healthyRoleOracle(f, name) {
  const state = await f.core.readState({keys: authKeys}), request = requestFor(f, name);
  const rights = await f.load('lib/versioned-shared-workflow.ts').workflowAccess(request, state);
  return name === 'ipqc-c' ? {...rights,
    restore: rights.edit && await f.load('lib/draft-restore-access.ts').restoreAllowed(request, state),
    create: rights.edit && await f.core.can(request, state, 'ipqc-c.create'),
    delete: rights.edit && await f.core.can(request, state, 'ipqc-c.delete'),
  } : {...rights,
    settings: rights.view && await f.core.can(request, state, 'routine.settings'),
    revoke: rights.approve && await f.core.can(request, state, 'approval.revoke'),
    revise: rights.edit && await f.core.can(request, state, 'approval.revise'),
  };
}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function sqlWait(f, ms) {
  // Every actual fixture SQL category, not a substituted route or auth result.
  if (ms) for (const kind of ['state', 'revocation', 'revision', 'cas', 'other']) f.hooks.set(kind + '.before', () => delay(ms));
}
async function sample(name, latency, cycle) {
  const f = await phaseFixture();
  try {
    const before = f.row(), objects = [...f.objects], originalDecoded = copy(await f.decoded());
    const resources = resourceCounter(f); sqlWait(f, latency); f.reset();
    const startedAtUtc = new Date().toISOString(), cpu = process.cpuUsage(), started = performance.now();
    const response = await dispatch(f, name), responseReturnedMs = performance.now() - started;
    const text = await response.text(), elapsedMs = performance.now() - started, used = process.cpuUsage(cpu), endedAtUtc = new Date().toISOString();
    const measuredResources = {...resources}, counters = {...f.stats}, getOrder = reads(f), body = JSON.parse(text);
    assert.equal(response.status, 200, text); assertReadOnly(f, before, objects);
    for (const field of ['activeGet', 'activeBody', 'activeText']) assert.equal(measuredResources[field], 0);
    // Snapshot counters before the untimed complete-state oracle.
    const decoded = copy(await f.decoded()); assert.deepEqual(decoded, originalDecoded);
    return {name, cycle, mode: latency ? 'API_VM_SYNTHETIC_SQL_WAIT' : 'API_VM_NO_INJECTED_WAIT', injectedPerSqlMs: latency,
      startedAtUtc, endedAtUtc, elapsedMs, responseReturnedMs, cpuUserMs: used.user / 1000, cpuSystemMs: used.system / 1000,
      requestCount: 1, requestBytes: 0, responseBytes: Buffer.byteLength(text), counters, resources: measuredResources, getOrder,
      result: {status: response.status, headers: [...response.headers], body, decoded, revision: f.row().revision}};
  } finally {f.close();}
}
async function contract(f, name, kind, query = '', method = 'GET') {
  const before = f.row(), objects = [...f.objects]; f.reset();
  const result = await get(f, name, query, f.headers, method); assertReadOnly(f, before, objects);
  const counters = {...f.stats}, getOrder = reads(f);
  const businessGetCount = manifest(f).__processRecords ? businessReads(f).length : null;
  result.decoded = copy(await f.decoded());
  return {name, kind, query, method, result, counters, getOrder, businessGetCount};
}
async function contracts(name, kind) {
  const reports = [];
  if (kind === 'selectors') for (const query of selectors[name]) {
    const f = await phaseFixture(); try {reports.push(await contract(f, name, 'selector', query));} finally {f.close();}
  }
  if (kind === 'roles') for (const profile of roleProfiles) {
    const f = await phaseFixture(profile);
    try {
      for (const query of name === 'ipqc-c' ? ['', '?restoreSaveId=ipqc-save', '?operationId=ipqc-operation'] : ['', '?preview=1', '?search-preview=1', '?operationId=routine-operation', '?export=routine-document']) reports.push(await contract(f, name, 'role:' + profile.id, query));
    } finally {f.close();}
  }
  if (kind === 'compatibility') for (const mode of ['head', 'inline', 'legacy-r2', 'legacy-chunks', 'unsupported-envelope']) {
    const f = await workflowFixture({inline: mode === 'inline'});
    try {
      if (mode.startsWith('legacy-')) await installLegacyStorage(f, mode);
      if (mode === 'unsupported-envelope') {const envelope = manifest(f); envelope.syntheticUnsupportedExtension = true; installEnvelope(f, envelope);}
      reports.push(await contract(f, name, mode, '', mode === 'head' ? 'HEAD' : 'GET'));
    } finally {f.close();}
  }
  return reports;
}
const sourceFiles = ['lib/process-state.ts', 'lib/scoped-workflow-read.ts', 'lib/draft-restore-access.ts', 'lib/state-records.ts', 'lib/versioned-shared-workflow.ts', 'app/api/ipqc-c/workflow/route.ts', 'app/api/routine-fqc/route.ts'];
const harnessFiles = ['tests/scoped-read-permission-benchmark.mjs', 'tests/scoped-workflow-read-benchmark.mjs', 'tests/master-ab-auth-phase-fixture.mjs', 'scripts/scoped-read-phase-baseline.cjs', 'scripts/scoped-read-phase-baseline.json', 'scripts/scoped-read-permission-source-contract.cjs', 'scripts/scoped-fqc-integration-source-contract.cjs'];
const sourceInfo = () => {
  const proof = process.env.PHASE_BASELINE_BYTES === '1' ? verifiedSnapshot(sourceRoot) : null;
  return {sourceKind: proof ? 'baseline-bytes' : 'git-checkout', sourceCommit: proof ? null : execFileSync('git', ['rev-parse', 'HEAD'], {cwd: sourceRoot, encoding: 'utf8'}).trim(),
    ...(proof ? {baselineSnapshotSHA: proof.snapshotSha256, baselineProvenance: proof} : {}),
    sourceHashes: Object.fromEntries(sourceFiles.map(file => [file, fs.existsSync(path.join(sourceRoot, file)) ? hash(fs.readFileSync(path.join(sourceRoot, file))) : null])),
    harnessHashes: Object.fromEntries(harnessFiles.map(file => [file, hash(fs.readFileSync(path.join(repository, file)))]))};
};
async function child(name, phase, latency) {
  const scopeDiagnostics = [], info = console.info; console.info = (...args) => {assert.equal(args[0], '[record-read-scope]'); assert.equal(args.length, 2); scopeDiagnostics.push(JSON.parse(args[1]));};
  try {
    const samples = [], cases = [];
    if (phase === 'samples') for (let cycle = 1; cycle <= 7; cycle++) samples.push(await sample(name, latency, cycle));
    else cases.push(...await contracts(name, phase));
    return {...sourceInfo(), invocation: {name, phase, latency}, samples, contracts: cases, scopeDiagnostics, processResources: {maxRssKiB: process.resourceUsage().maxRSS, heapUsedBytes: process.memoryUsage().heapUsed, rssBytes: process.memoryUsage().rss}};
  } finally {console.info = info;}
}
const summarize = values => ({median: [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)], max: Math.max(...values)});
function compare(before, after, main, baselineProof) {
  if (baselineProof.kind === 'baseline-bytes') {assert.equal(before.sourceKind, 'baseline-bytes'); assert.equal(before.sourceCommit, null); assert.equal(before.baselineSnapshotSHA, baselineSnapshotSHA); assert.deepEqual(before.baselineProvenance, baselineProof);}
  else {assert.equal(baselineProof.kind, 'git-checkout'); assert.equal(before.sourceKind, 'git-checkout'); assert.equal(before.sourceCommit, closureCommit);} assert.equal(before.samples.length, 28); assert.equal(after.samples.length, 28);
  assert.deepEqual(before.harnessHashes, after.harnessHashes);
  for (let index = 0; index < before.samples.length; index++) {
    const a = before.samples[index], b = after.samples[index];
    assert.deepEqual([a.name, a.cycle, a.mode], [b.name, b.cycle, b.mode]); assert.equal(canonical(a.result), canonical(b.result), 'complete DTO/headers/decoded-state parity');
    assert.equal(a.responseBytes, b.responseBytes); assert.deepEqual(a.getOrder, b.getOrder, 'same R2 reference order, no new fetch/reordering');
    for (const key of ['state', 'revision', 'cas', 'other', 'get', 'head', 'put']) assert.equal(a.counters[key], b.counters[key], key);
    assert.equal(b.counters.state, 1); assert.equal(b.counters.revocation, 4); assert.equal(b.counters.sql, 5);
    assert.ok(b.counters.sql < a.counters.sql); assert.equal(b.resources.readBytes, a.resources.readBytes); assert.equal(b.resources.writeBytes, 0);
  }
  assert.equal(before.contracts.length, after.contracts.length);
  for (let index = 0; index < before.contracts.length; index++) {
    const a = before.contracts[index], b = after.contracts[index]; assert.deepEqual([a.name, a.kind, a.query, a.method], [b.name, b.kind, b.query, b.method]);
    assert.equal(canonical(a.result), canonical(b.result), 'full role/selector/legacy parity ' + b.name + '/' + b.kind + b.query);
    assert.deepEqual(a.getOrder, b.getOrder, 'contract R2 unchanged');
    if (['head', 'inline', 'legacy-r2', 'legacy-chunks', 'unsupported-envelope'].includes(b.kind)) assert.deepEqual(a.counters, b.counters, 'legacy/auto-HEAD exact counters');
    if (b.kind === 'selector' && b.query.includes('permissions=1')) {assert.equal(b.counters.sql, 3); assert.equal(b.counters.revocation, 2); assert.equal(b.businessGetCount, 0);}
  }
  if (main) {
    assert.equal(main.sourceCommit, mainCommit); assert.deepEqual(main.harnessHashes, after.harnessHashes); assert.equal(main.contracts.length, after.contracts.length);
    for (let index = 0; index < main.contracts.length; index++) {const a = main.contracts[index], b = after.contracts[index]; assert.deepEqual([a.name, a.kind, a.query, a.method], [b.name, b.kind, b.query, b.method]); assert.equal(canonical(a.result), canonical(b.result), 'original main healthy-data DTO parity');}
  }
  const rows = routes.flatMap(name => [0, 12].map(latency => {
    const summarizeGroup = source => {const group = source.samples.filter(s => s.name === name && s.injectedPerSqlMs === latency); assert.equal(group.length, 7); return {elapsedMs: summarize(group.map(s => s.elapsedMs)), cpuUserMs: summarize(group.map(s => s.cpuUserMs)), cpuSystemMs: summarize(group.map(s => s.cpuSystemMs)), counters: group[0].counters, resources: group[0].resources, responseBytes: group[0].responseBytes};};
    return {name, injectedPerSqlMs: latency, samplesPerSource: 7, before: summarizeGroup(before), after: summarizeGroup(after)};
  }));
  return {status: 'PASS_PINNED_SCOPED_PERMISSION_PHASE_PAIRS', baselineCommit: baselineProof.kind === 'baseline-bytes' ? null : closureCommit, baselineProvenance: baselineProof, totalTimedSamples: 56, rows, before, after, ...(main ? {originalMainHealthyContracts: main} : {}), limitations: [
    'Actual production route in Node VM, not native Worker, network or browser click-to-ready latency.',
    '12ms is injected before each fixture SQL statement. It is not an estimate of real D1 latency; no R2 wait is injected.',
    'Fresh checks reverify the signed session and revocation against the same selected authority snapshot, not a later DB authority row.',
    'CPU and memory include harness/GC; report all regressions rather than treating reduced SQL as universal latency improvement.',
    'Current two GETs return buffered JSON. No streamed POST or generic master stream claims.',
  ]};
}
// Bound output allocation to one full DTO/sample at a time. The complete
// contracts remain in the report; do not digest-away the equality oracle.
function writeReport(report) {
  const write = value => fs.writeSync(1, value);
  const writeSource = source => {
    write('{'); let first = true;
    for (const [key, value] of Object.entries(source)) {
      if (!first) write(','); first = false; write(JSON.stringify(key) + ':');
      if (key === 'contracts' || key === 'samples') {
        write('['); for (let index = 0; index < value.length; index++) {if (index) write(','); write(JSON.stringify(value[index]));} write(']');
      } else write(JSON.stringify(value));
    }
    write('}');
  };
  write('{'); let first = true;
  for (const [key, value] of Object.entries(report)) {
    if (!first) write(','); first = false; write(JSON.stringify(key) + ':');
    if (['before', 'after', 'originalMainHealthyContracts'].includes(key)) writeSource(value); else write(JSON.stringify(value));
  }
  write('}\n');
}
function pinned(root, commit) {
  assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim(), commit);
  assert.equal(execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], {cwd: root, encoding: 'utf8'}).trim(), '', 'baseline tracked source must be clean');
}
if (process.argv[1] && path.resolve(process.argv[1]) === script) {
  const arg = key => process.argv[process.argv.indexOf(key) + 1];
  if (process.argv.includes('--child')) console.log(JSON.stringify(await child(arg('--route'), arg('--phase'), Number(arg('--latency') || 0))));
  else {
    const bytesMode = process.argv.includes('--baseline-bytes');
    assert.notEqual(bytesMode, process.argv.includes('--baseline'), 'exactly one --baseline <clean b625 checkout> or --baseline-bytes <verified snapshot> required');
    const baseline = path.resolve(arg(bytesMode ? '--baseline-bytes' : '--baseline'));
    const baselineProof = bytesMode ? verifiedSnapshot(baseline) : (pinned(baseline, closureCommit), {kind: 'git-checkout', sourceCommit: closureCommit});
    const mainRoot = process.argv.includes('--main-baseline') ? path.resolve(arg('--main-baseline')) : null; if (mainRoot) pinned(mainRoot, mainCommit);
    const evidenceDirectory = process.env.PHASE_REPORT_DIRECTORY; if (evidenceDirectory) fs.mkdirSync(evidenceDirectory, {recursive: true});
    const reuseReports = process.argv.includes('--reuse-reports'); assert.ok(!reuseReports || evidenceDirectory, '--reuse-reports requires PHASE_REPORT_DIRECTORY');
    const collected = {before: {samples: [], contracts: [], scopeDiagnostics: [], processResources: []}, after: {samples: [], contracts: [], scopeDiagnostics: [], processResources: []}, ...(mainRoot ? {main: {samples: [], contracts: [], scopeDiagnostics: [], processResources: []}} : {})};
    const run = (source, root, name, phase, latency) => {
      const reportPath = evidenceDirectory && path.join(evidenceDirectory, [source, name, phase, latency].join('-') + '.json');
      const raw = reuseReports && fs.existsSync(reportPath) ? fs.readFileSync(reportPath, 'utf8') : execFileSync(process.execPath, ['--max-old-space-size=384', script, '--child', '--route', name, '--phase', phase, '--latency', String(latency)], {cwd: repository, env: {...process.env, MASTER_AB_SOURCE_ROOT: root, PHASE_BASELINE_BYTES: source === 'before' && bytesMode ? '1' : '0'}, encoding: 'utf8', maxBuffer: 40 * 1024 * 1024});
      if (reportPath) fs.writeFileSync(reportPath, raw);
      const report = JSON.parse(raw); assert.deepEqual(report.invocation, {name, phase, latency});
      assert.deepEqual(report.sourceHashes, Object.fromEntries(sourceFiles.map(file => [file, fs.existsSync(path.join(root, file)) ? hash(fs.readFileSync(path.join(root, file))) : null])));
      assert.deepEqual(report.harnessHashes, Object.fromEntries(harnessFiles.map(file => [file, hash(fs.readFileSync(path.join(repository, file)))])));
      assert.equal(report.sourceKind, source === 'before' && bytesMode ? 'baseline-bytes' : 'git-checkout');
      assert.equal(report.sourceCommit, source === 'before' && bytesMode ? null : execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim());
      const target = collected[source];
      if (target.sourceHashes) {assert.deepEqual(target.sourceHashes, report.sourceHashes); assert.deepEqual(target.harnessHashes, report.harnessHashes); assert.equal(target.sourceCommit, report.sourceCommit); assert.equal(target.sourceKind, report.sourceKind); assert.equal(target.baselineSnapshotSHA, report.baselineSnapshotSHA); assert.deepEqual(target.baselineProvenance, report.baselineProvenance);}
      for (const key of ['sourceKind', 'sourceCommit', 'sourceHashes', 'harnessHashes', 'baselineSnapshotSHA', 'baselineProvenance']) if (report[key] !== undefined) target[key] = report[key];
      for (const key of ['samples', 'contracts', 'scopeDiagnostics']) target[key].push(...report[key]); target.processResources.push({name, phase, latency, ...report.processResources});
    };
    let turn = 0;
    for (const name of routes) for (const latency of [0, 12]) {
      const order = turn % 2 ? ['after', 'before'] : ['before', 'after']; turn += 1;
      for (const source of order) run(source, source === 'before' ? baseline : repository, name, 'samples', latency);
    }
    for (const name of routes) for (const phase of ['selectors', 'roles', 'compatibility']) {
      for (const source of ['before', 'after']) run(source, source === 'before' ? baseline : repository, name, phase, 0);
      if (mainRoot) run('main', mainRoot, name, phase, 0);
    }
    writeReport(compare(collected.before, collected.after, collected.main, baselineProof));
  }
}
