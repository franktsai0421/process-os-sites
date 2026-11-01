// Socket-free production route fixture. Only Workers DB/R2 ports are synthetic.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {DatabaseSync} from 'node:sqlite';
import {webcrypto, randomBytes, createHash} from 'node:crypto';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const compiled = new Map();
const clone = value => JSON.parse(JSON.stringify(value));
export const processLifecycleEndpoint = 'https://lifecycle.synthetic.invalid/api/process-authoring/workflow?caseMetadata=1&compact=1';

// Pure seed construction: inject the real shared-draft kernel's createSharedDraft.
// A compiled/browser harness can use the same values without starting this fixture.
export function buildProcessDraftLifecycleSeed(createSharedDraft, {cycle = 1, password = 'Synthetic-lifecycle-only-2026!'} = {}) {
  assert.equal(typeof createSharedDraft, 'function');
  assert.ok(Number.isInteger(cycle) && cycle >= 1 && cycle <= 5);
  const ids = {workspace: JSON.stringify(['Synthetic Lifecycle', 'A']), stage: 'A-LIFE', product: 'LIFE-A1', entry: 'life-entry', operation: 'life-manual', exit: 'life-exit', active: 'life-active-' + cycle, generation: 'life-generation-' + cycle};
  const ops = ['view', 'create', 'edit', 'delete', 'save', 'submit', 'withdraw', 'approve', 'return', 'restore'];
  const actor = (id, role, allowed) => ({id, name: 'Synthetic ' + id, role, enabled: true, authMode: 'platform', authEpoch: 1, password,
    inheritRole: false, lines: ['A'], views: ['editor', 'approval'], permissions: [],
    accessOverrides: Object.fromEntries(ops.map(op => ['editor.' + op, allowed.includes(op)]))});
  const actors = {
    editor: actor('life-editor', 'staff', ['view', 'create', 'edit', 'delete', 'save', 'submit', 'withdraw']),
    reviewer: actor('life-reviewer', 'rd', ['view', 'approve', 'return']),
    reader: actor('life-reader', 'staff', ['view']),
  };
  // Destination entry is explicit; this does not grant editor mutation cells.
  actors.reviewer.accessOverrides['approval.view'] = true;
  const operation = (id, name, editorType, nextIds, x) => ({id, name, stageCode: ids.stage, editorType, mode: 'human', productCodes: editorType === 'manual' ? [ids.product] : [], nextIds, x, y: 100,
    instructionSteps: [{text: 'Perform synthetic lifecycle check', standard: 'Synthetic standard satisfied'}], mediaItems: []});
  const initialContent = {workspaces: [{id: ids.workspace, category: 'Synthetic Lifecycle', line: 'A', stages: {[ids.stage]: [
    operation(ids.entry, 'Synthetic entry', 'entry', [ids.operation], 0),
    operation(ids.operation, 'Synthetic lifecycle operation', 'manual', [ids.exit], 120),
    operation(ids.exit, 'Synthetic exit', 'exit', [], 360),
  ]}}]};
  const at = '2026-11-01T00:00:00.000Z';
  const version = {id: ids.active, number: 1, status: 'approved', revision: 0, snapshot: clone(initialContent), baseVersionId: null,
    creatorId: actors.reviewer.id, creatorName: actors.reviewer.name, createdAt: at, updatedAt: at, history: []};
  const control = {activeVersionId: ids.active, versions: [version], workflow: createSharedDraft('process:platform', initialContent, ids.active, ids.generation)};
  const templates = {[ids.stage]: ['entry', 'manual', 'exit'].map(presetKey => ({id: 'life-template-' + presetKey, presetKey, presetVersion: 'synthetic-v1', name: 'Synthetic ' + presetKey, mode: 'human', mediaItems: []}))};
  const catalog = {products: [{id: 'life-product', code: ids.product, name: 'Synthetic lifecycle product', line: 'A', category: 'Synthetic Lifecycle', unit: 'pcs', stages: [ids.stage]}],
    lines: [{id: 'life-line', code: 'A', name: 'Synthetic line', stages: [{id: 'life-stage', code: ids.stage, name: 'Synthetic lifecycle stage'}]}], categoryGroups: [{id: 'life-category', line: 'A', name: 'Synthetic Lifecycle'}]};
  const masterActive = {AB: catalog, C: {products: [], lines: [], categoryGroups: []}, PROCESS: templates};
  // The initial approval destination reads each already-authorized master scope.
  // Its real adapter requires an approved version matching the active snapshot.
  const masterVersions = Object.entries(masterActive).map(([scope, snapshot]) => ({...version,
    id: 'life-master-' + scope + '-' + cycle, scope, snapshot: clone(snapshot)}));
  const values = {platformUsers: JSON.stringify(Object.values(actors)), masterDataControl: JSON.stringify({active: masterActive, versions: masterVersions}),
    processMasterData: JSON.stringify(templates), bomOverrides: JSON.stringify({replaceAll: true, data: {[ids.product]: []}}), processAuthoringControl: JSON.stringify(control)};
  // Current validator excludes product-free endpoints from its target-ID set.
  // Keep this inherited advisory explicit rather than weakening approval consent.
  const expectedContentIssues = [{kind: 'missing', path: ['workspaces', {id: ids.workspace}, 'stages', ids.stage, {id: ids.operation}], message: 'CONNECTION_TARGET_MISSING'}];
  return {values, actors, ids, initialContent, expectedContentIssues, initialControl: clone(control), contentBytes: Buffer.byteLength(JSON.stringify(initialContent)), seedBytes: Buffer.byteLength(JSON.stringify(values)), endpoint: processLifecycleEndpoint};
}

function productionLoader(env) {
  const ts = require(process.env.PROCESS_LIFECYCLE_TYPESCRIPT || 'typescript'), cache = new Map();
  // A production runtime has one Error/SyntaxError realm. Per-module contexts
  // would incorrectly turn imported Error instances into unknown route errors.
  const context = vm.createContext({Request, Response, Headers, ReadableStream, URL, URLSearchParams, TextEncoder, TextDecoder,
    crypto: webcrypto, Date, atob, btoa, structuredClone, console});
  function load(relative) {
    const filename = path.resolve(root, relative);
    if (cache.has(filename)) return cache.get(filename).exports;
    const mod = {exports: {}}; cache.set(filename, mod);
    if (!compiled.has(filename)) compiled.set(filename, ts.transpileModule(readFileSync(filename, 'utf8'), {
      compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, allowJs: true},
    }).outputText);
    const evaluate = vm.runInContext('(function(module, exports, require) {\n' + compiled.get(filename) + '\n})', context, {filename});
    evaluate(mod, mod.exports, id => {
      if (id === 'cloudflare:workers') return {env};
      if (id.startsWith('node:')) return require(id);
      const target = id.startsWith('@/') ? path.resolve(root, id.slice(2)) : path.resolve(path.dirname(filename), id);
      if (target.endsWith('.json')) return JSON.parse(readFileSync(target, 'utf8'));
      return load(/\.(ts|mjs|js)$/.test(target) ? target : target + '.ts');
    });
    return mod.exports;
  }
  return load;
}

export async function createProcessDraftLifecycleFixture({cycle = 1, storage = 'records-v1', reviewerApprovalView = true, reviewerLegacyApprovalView = true, masterBaselines = 'matching'} = {}) {
  assert.ok(['records-v1', 'inline'].includes(storage));
  const sqlite = new DatabaseSync(':memory:'), objects = new Map(), measurements = [];
  for (const name of ['0000_conscious_skin.sql', '0002_local_feedback_sessions.sql']) sqlite.exec(readFileSync(path.join(root, 'drizzle', name), 'utf8'));
  let recording = false;
  const counters = {sql: 0, stateRead: 0, revocation: 0, earlyRevision: 0, cas: 0, committed: 0, other: 0, r2get: 0, r2head: 0, r2put: 0, r2getBytes: 0, r2putBytes: 0};
  const reset = () => { for (const key of Object.keys(counters)) counters[key] = 0; };
  const env = {PROCESS_SESSION_SECRET: randomBytes(32).toString('hex'), PROCESS_SESSION_REVOCATION_ENABLED: '1',
    STATE_ARCHIVE: {
      async get(key) {
        const raw = objects.get(key);
        if (recording) { counters.r2get++; counters.r2getBytes += raw === undefined ? 0 : Buffer.byteLength(raw); }
        return raw === undefined ? null : {text: async () => raw, arrayBuffer: async () => new TextEncoder().encode(raw).buffer};
      },
      async head(key) { if (recording) counters.r2head++; return objects.has(key) ? {} : null; },
      async put(key, value) {
        const raw = typeof value === 'string' ? value : new TextDecoder().decode(value);
        if (recording) { counters.r2put++; counters.r2putBytes += Buffer.byteLength(raw); }
        objects.set(key, raw);
      },
    },
    DB: {prepare(sql) {
      let args = [];
      const category = sql.includes('FROM process_revoked_sessions') ? 'revocation' : sql.startsWith('SELECT revision,"values" FROM shared_state') ? 'stateRead'
        : sql.startsWith('SELECT revision FROM shared_state') ? 'earlyRevision' : sql.startsWith('UPDATE shared_state') ? 'cas' : 'other';
      function execute(method) {
        if (recording) { counters.sql++; counters[category]++; }
        const result = sqlite.prepare(sql)[method](...args);
        if (recording && category === 'cas' && method === 'run') counters.committed += Number(result.changes);
        return result;
      }
      return {bind(...values) { args = values; return this; }, async first() { return execute('get') || null; }, async all() { return {success: true, results: execute('all')}; }, async run() { return {success: true, meta: {changes: Number(execute('run').changes)}}; }};
    }, async batch(statements) {
      sqlite.exec('BEGIN');
      try { const result = []; for (const statement of statements) result.push(await statement.all()); sqlite.exec('COMMIT'); return result; }
      catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    }},
  };
  const load = productionLoader(env), kernel = load('lib/shared-draft.ts'), seed = buildProcessDraftLifecycleSeed(kernel.createSharedDraft, {cycle});
  assert.ok(['matching', 'missing', 'mismatched'].includes(masterBaselines));
  if (masterBaselines !== 'matching') {
    const master = JSON.parse(seed.values.masterDataControl);
    if (masterBaselines === 'missing') master.versions = []; // Reproduce the original CI seed exactly.
    else for (const version of master.versions) {
      if (version.scope === 'PROCESS') version.snapshot[seed.ids.stage][0].name = 'Different synthetic approved template';
      else version.snapshot.lines.push({id: 'different-synthetic-line', code: 'B', name: 'Different synthetic line', stages: []});
    }
    seed.values.masterDataControl = JSON.stringify(master);
    seed.seedBytes = Buffer.byteLength(JSON.stringify(seed.values));
  }
  // Only the negative/legacy bootstrap probes alter their own synthetic actor.
  if (reviewerApprovalView !== true || !reviewerLegacyApprovalView) {
    assert.ok([true, false, null].includes(reviewerApprovalView));
    if (reviewerApprovalView === null) delete seed.actors.reviewer.accessOverrides['approval.view'];
    else seed.actors.reviewer.accessOverrides['approval.view'] = reviewerApprovalView;
    if (!reviewerLegacyApprovalView) seed.actors.reviewer.views = seed.actors.reviewer.views.filter(view => view !== 'approval');
    seed.values.platformUsers = JSON.stringify(Object.values(seed.actors));
    seed.seedBytes = Buffer.byteLength(JSON.stringify(seed.values));
  }
  const core = load('lib/process-state.ts'), codec = load('lib/state-records.ts'), wire = load('lib/workflow-wire.ts'), route = load('app/api/process-authoring/workflow/route.ts');
  const encoded = storage === 'records-v1' ? await codec.encodeRecordValues(env.STATE_ARCHIVE, seed.values) : JSON.stringify(seed.values);
  sqlite.prepare('INSERT INTO shared_state VALUES(1,1,?,?)').run(encoded, 'synthetic-lifecycle');
  const headers = {};
  for (const [alias, actor] of Object.entries(seed.actors)) {
    const token = await core.demoSession(new Request(seed.endpoint), actor.id, false, actor.authEpoch);
    assert.ok(token, 'production signer creates synthetic platform session');
    headers[alias] = {Origin: new URL(seed.endpoint).origin, 'Content-Type': 'application/json', Cookie: core.sessionCookie(new Request(seed.endpoint), token).split(';')[0]};
  }
  const row = () => clone(sqlite.prepare('SELECT revision,"values",updated_at FROM shared_state WHERE id=1').get());
  async function inspect() {
    const old = recording; recording = false;
    try { const values = await core.decodeValues(row().values); return {values, control: JSON.parse(values.processAuthoringControl)}; }
    finally { recording = old; }
  }
  const sequences = {};
  function command(action, flow, details = {}, actor = 'editor') {
    const sequence = sequences[actor] = (sequences[actor] || 0) + 1;
    return {operationId: `life-c${cycle}-${actor}-${sequence}-${action}`, clientId: 'life-client-' + actor, sequence, generation: flow.generation, expectedRevision: flow.revision, action, ...details};
  }
  async function request({method = 'GET', actor = 'editor', body, suffix = '', label = method, discardResponse = false, target = 'workflow'} = {}) {
    assert.ok(headers[actor]);
    const readTargets = {
      bootstrap: ['app/api/process-bootstrap/route.ts', '/api/process-bootstrap'],
      ...Object.fromEntries(['AB', 'C', 'PROCESS'].map(scope => ['master-' + scope,
        ['app/api/master/workflow/route.ts', '/api/master/workflow?scope=' + scope + '&caseMetadata=1&compact=1']])),
      bom: ['app/api/bom/workflow/route.ts', '/api/bom/workflow?caseMetadata=1&reviewMetadata=1&compact=1'],
    };
    assert.ok(target === 'workflow' || Object.hasOwn(readTargets, target));
    if (target !== 'workflow') assert.equal(method, 'GET');
    const selectedRoute = target === 'workflow' ? route : load(readTargets[target][0]);
    const raw = body === undefined ? undefined : JSON.stringify(body), url = (target === 'workflow' ? seed.endpoint : new URL(seed.endpoint).origin + readTargets[target][1]) + suffix;
    reset(); recording = true;
    const started = performance.now();
    try {
      const response = await selectedRoute[method](new Request(url, {method, headers: {...headers[actor], ...(target === 'bootstrap' ? {'X-Process-Media': 'deferred-v1'} : {})}, ...(raw === undefined ? {} : {body: raw})}));
      const text = await response.text(), elapsedMs = performance.now() - started;
      measurements.push({cycle, label, method, actor, target, requestCount: 1, requestBytes: raw === undefined ? 0 : Buffer.byteLength(raw), responseBytes: Buffer.byteLength(text), status: response.status,
        syntheticInProcessMs: Math.round(elapsedMs * 1000) / 1000, responseDiscarded: discardResponse, ...counters});
      if (discardResponse) return undefined;
      return {status: response.status, body: clone(wire.expandWorkflowPayload(JSON.parse(text)))};
    } finally { recording = false; }
  }
  const send = (cmd, actor = 'editor', options = {}) => request({method: 'POST', actor, body: {command: cmd}, suffix: cmd.action === 'apply' && cmd.source?.startsWith('canvas-v2:') ? '&channel=canvas-v2' : '', label: cmd.action, ...options});
  const fieldPath = field => ['workspaces', {id: seed.ids.workspace}, 'stages', seed.ids.stage, {id: seed.ids.operation}, field];
  const apply = (flow, field, before, after, actor = 'editor') => command('apply', flow, {source: 'canvas-v2:' + JSON.stringify([seed.ids.workspace, seed.ids.stage]),
    patches: [{op: 'set', path: fieldPath(field), value: after}], guards: [{path: fieldPath(field), value: before}]}, actor);
  return {seed, load, core, row, inspect, objects, measurements, counters, command, request, send, apply,
    seedDigest: createHash('sha256').update(JSON.stringify(seed.values)).digest('hex'), close: () => sqlite.close()};
}
