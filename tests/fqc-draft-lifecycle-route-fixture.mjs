// Socket-free production FQC route fixture. Only Workers DB/R2 ports are synthetic.
// Pure seed construction is shared with the separately executed native browser runner.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {DatabaseSync} from 'node:sqlite';
import {webcrypto, randomBytes, createHash} from 'node:crypto';
import {accessKeys} from '../public/process/access-policy.mjs';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const compiled = new Map();
const clone = value => JSON.parse(JSON.stringify(value));
export const fqcLifecycleEndpoint = 'https://lifecycle.synthetic.invalid/api/fqc/workflow?caseMetadata=1&compact=1';

export function buildFqcDraftLifecycleSeed(createSharedDraft, {cycle = 1, password = 'Synthetic-fqc-lifecycle-only-2026!'} = {}) {
  assert.equal(typeof createSharedDraft, 'function');
  assert.ok(Number.isInteger(cycle) && cycle >= 1 && cycle <= 5);
  const ids = {error: 'fqc-life-error', item: 'fqc-life-item', newError: 'fqc-life-new-error', newItem: 'fqc-life-new-item',
    product: 'FQC-LIFE-A1', product2: 'FQC-LIFE-A2', category: 'FQC Lifecycle', line: 'A', equipment: 'fqc-life-equipment',
    active: 'fqc-life-active-' + cycle, generation: 'fqc-life-generation-' + cycle, masterAB: 'fqc-life-master-AB-' + cycle};
  const actor = (id, role, allowed, review = false) => ({id, name: 'Synthetic ' + id, role, enabled: true, authMode: 'platform', authEpoch: 1, password,
    inheritRole: false, lines: ['A'], views: review ? ['data', 'approval'] : ['data'],
    // Actual legacy review UI and advisory read these aliases; module writes
    // are independently denied by the complete explicit operation matrix below.
    permissions: review ? ['approval.approve', 'approval.reject'] : [],
    accessOverrides: Object.fromEntries(accessKeys.map(key => [key, allowed.includes(key)]))});
  const dependencies = ['ab.view', 'equipment.view'];
  const actors = {
    editor: actor('fqc-life-editor', 'staff', [...dependencies, ...['view', 'create', 'edit', 'delete', 'save', 'submit', 'withdraw'].map(op => 'fqc.' + op)]),
    reviewer: actor('fqc-life-reviewer', 'rd', [...dependencies, 'c.view', 'templates.view', 'bom.view', 'approval.view', 'approval.approve', 'approval.return', 'fqc.view', 'fqc.approve', 'fqc.return'], true),
    reader: actor('fqc-life-reader', 'staff', [...dependencies, 'fqc.view']),
  };
  const initialContent = {errors: [{id: ids.error, code: 'LIFE-FQC-L01', name: 'Synthetic lifecycle error', category: ids.category, line: ids.line, isDeleted: false}],
    items: [{id: ids.item, checkNo: 'LIFE-FQC-L1-01', name: 'Synthetic lifecycle item', description: 'Inspect synthetic surface', category: ids.category, line: ids.line,
      errorId: ids.error, tool: '目視檢查', equipmentId: null, equipmentSnapshot: null, productCodes: [], productRefs: [], mediaItems: [], isEnabled: true,
      rule: {cadence: 'none'}, isMonthly: false, isQuarterly: false, isYearly: false, isCustomPeriod: false, customPeriodText: '', reason: '', note: '', isDeleted: false}]};
  const at = '2026-11-01T00:00:00.000Z';
  const version = {id: ids.active, number: 1, status: 'approved', revision: 0, snapshot: clone(initialContent), baseVersionId: null,
    creatorId: actors.reviewer.id, creatorName: actors.reviewer.name, createdAt: at, updatedAt: at, history: []};
  const control = {activeVersionId: ids.active, versions: [version], workflow: createSharedDraft('fqc', initialContent, ids.active, ids.generation)};
  const catalog = {products: [ids.product, ids.product2].map((code, index) => ({id: 'fqc-life-product-' + (index + 1), code, name: 'Synthetic lifecycle product ' + (index + 1), specification: 'Synthetic only', line: ids.line, category: ids.category, unit: 'pcs', stages: []})),
    lines: [{id: 'fqc-life-line', code: ids.line, name: 'Synthetic line', stages: []}], categoryGroups: [{id: 'fqc-life-category', line: ids.line, name: ids.category, defaultStages: []}]};
  const masterActive = {AB: catalog, C: {products: [], lines: [], categoryGroups: []}, PROCESS: {}};
  // Match every master scope that the reviewer may read when opening the real
  // approval shell. Never add grants in response to a readiness error.
  const masterVersions = Object.entries(masterActive).map(([scope, snapshot]) => ({...version,
    id: 'fqc-life-master-' + scope + '-' + cycle, scope, snapshot: clone(snapshot)}));
  const equipment = {id: ids.equipment, assetCode: 'SYN-001', pieceMark: '01', groupId: 'fqc-life-equipment-group',
    categoryId: 'fqc-life-equipment-category', subcategoryId: 'fqc-life-equipment-subcategory', name: 'Synthetic caliper', nameVi: 'Thước tổng hợp',
    calibrationMethod: 'none', calibratedAt: '', expiresAt: '', enabled: true, confirmed: true, spec: 'Synthetic 0–10 mm', unit: 'pcs'};
  const equipmentVersion = {...version, id: 'fqc-life-equipment-active-' + cycle, equipment: [equipment],
    categories: [{id: equipment.categoryId, code: 'SYN', name: 'Synthetic equipment'}],
    subcategories: [{id: equipment.subcategoryId, categoryId: equipment.categoryId, name: 'Synthetic inspection'}],
    groups: [{id: equipment.groupId, categoryId: equipment.categoryId, subcategoryId: equipment.subcategoryId, name: 'Synthetic caliper'}], issues: []};
  delete equipmentVersion.snapshot;
  const values = {platformUsers: JSON.stringify(Object.values(actors)), processCustomRoles: '[]', processRoleTemplateOverrides: '{}', processAccessControl: '{}', maintenanceMode: '0',
    masterDataControl: JSON.stringify({active: masterActive, versions: masterVersions}), processMasterData: '{}',
    bomOverrides: JSON.stringify({replaceAll: true, data: {[ids.product]: [], [ids.product2]: []}}),
    qualityMasterControl: JSON.stringify({schemaVersion: 1, libraries: {fqc: control}}),
    routineEquipmentControl: JSON.stringify({schemaVersion: 1, activeVersionId: equipmentVersion.id, versions: [equipmentVersion], source: null, issues: [], reservedMarks: {'SYN-001': ['01']}})};
  return {values, actors, ids, initialContent, initialControl: clone(control), expectedContentIssues: [],
    contentBytes: Buffer.byteLength(JSON.stringify(initialContent)), seedBytes: Buffer.byteLength(JSON.stringify(values)), endpoint: fqcLifecycleEndpoint};
}

function productionLoader(env) {
  const ts = require(process.env.FQC_LIFECYCLE_TYPESCRIPT || 'typescript'), cache = new Map();
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

export async function createFqcDraftLifecycleFixture({cycle = 1, storage = 'records-v1'} = {}) {
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
  const load = productionLoader(env), kernel = load('lib/shared-draft.ts'), seed = buildFqcDraftLifecycleSeed(kernel.createSharedDraft, {cycle});
  const core = load('lib/process-state.ts'), codec = load('lib/state-records.ts'), wire = load('lib/workflow-wire.ts'), route = load('app/api/fqc/workflow/route.ts');
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
    try { const values = await core.decodeValues(row().values); return {values, control: JSON.parse(values.qualityMasterControl).libraries.fqc}; }
    finally { recording = old; }
  }
  const sequences = {};
  function command(action, flow, details = {}, actor = 'editor') {
    const sequence = sequences[actor] = (sequences[actor] || 0) + 1;
    return {operationId: `fqc-life-c${cycle}-${actor}-${sequence}-${action}`, clientId: 'fqc-life-client-' + actor, sequence, generation: flow.generation, expectedRevision: flow.revision, action, ...details};
  }
  async function request({method = 'GET', actor = 'editor', body, suffix = '', label = method, discardResponse = false, target = 'workflow'} = {}) {
    assert.ok(headers[actor]);
    const readTargets = {
      bootstrap: ['app/api/process-bootstrap/route.ts', '/api/process-bootstrap'],
      ...Object.fromEntries(['AB', 'C', 'PROCESS'].map(scope => ['master-' + scope,
        ['app/api/master/workflow/route.ts', '/api/master/workflow?scope=' + scope + '&caseMetadata=1&compact=1']])),
      bom: ['app/api/bom/workflow/route.ts', '/api/bom/workflow?caseMetadata=1&reviewMetadata=1&compact=1'],
      'ab-catalog': ['app/api/master/workflow/route.ts', '/api/master/workflow?scope=AB&catalog=effective&compact=1'],
      equipment: ['app/api/routine-equipment/route.ts', '/api/routine-equipment?catalog=effective'],
      'equipment-review': ['app/api/routine-equipment/route.ts', '/api/routine-equipment?caseMetadata=1'],
      'equipment-permissions': ['app/api/routine-equipment/workflow/route.ts', '/api/routine-equipment/workflow?caseMetadata=1&compact=1&permissions=1'],
      'tooling-review': ['app/api/tooling/workflow/route.ts', '/api/tooling/workflow?caseMetadata=1&compact=1'],
      'iqc-review': ['app/api/iqc/workflow/route.ts', '/api/iqc/workflow?caseMetadata=1&compact=1&projection=iqc-edit-v1'],
      'ipqc-c-review': ['app/api/ipqc-c/route.ts', '/api/ipqc-c?caseMetadata=1'],
      'ipqc-ab-review': ['app/api/ipqc-ab/route.ts', '/api/ipqc-ab?caseMetadata=1&equipment=deferred'],
      'ipqc-ab-permissions': ['app/api/ipqc-ab/workflow/route.ts', '/api/ipqc-ab/workflow?scope=' + encodeURIComponent('A:' + seed.ids.category) + '&caseMetadata=1&compact=1&permissions=1'],
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
      measurements.push({execution: 'routeVM', cycle, label, method, actor, target, url: new URL(url).pathname + new URL(url).search, requestCount: 1, requestBytes: raw === undefined ? 0 : Buffer.byteLength(raw), responseBytes: Buffer.byteLength(text), status: response.status,
        syntheticInProcessMs: Math.round(elapsedMs * 1000) / 1000, responseDiscarded: discardResponse, ...counters});
      if (discardResponse) return undefined;
      return {status: response.status, body: clone(wire.expandWorkflowPayload(JSON.parse(text)))};
    } finally { recording = false; }
  }
  // Apply opts into the actual modern ACK. Callers must perform a fresh GET;
  // an ACK intentionally cannot be passed off as a full authoritative readback.
  const send = (cmd, actor = 'editor', options = {}) => request({method: 'POST', actor, body: {command: cmd},
    suffix: cmd.action === 'apply' ? '&projection=fqc-apply-ack-v1' : '', label: cmd.action, ...options});
  const fieldPath = (collection, id, field) => [collection, {id}, field];
  const apply = (flow, collection, id, field, before, after, actor = 'editor') => command('apply', flow, {
    patches: [{op: 'set', path: fieldPath(collection, id, field), value: after}],
    guards: [{path: fieldPath(collection, id, field), value: before}]}, actor);
  const setFields = (flow, collection, id, fields, actor = 'editor') => {
    const current = flow.working[collection].find(row => row.id === id);
    assert.ok(current, 'existing synthetic entity');
    return command('apply', flow, {patches: Object.entries(fields).map(([field, value]) => ({op: 'set', path: fieldPath(collection, id, field), value})),
      guards: Object.keys(fields).map(field => ({path: fieldPath(collection, id, field), value: current[field]}))}, actor);
  };
  const insert = (flow, collection, value, actor = 'editor') => command('apply', flow, {patches: [{op: 'insert', path: [collection], value}]}, actor);
  return {seed, load, core, row, inspect, readState: inspect, objects, measurements, counters, command, request, call: request, send, apply, setFields, insert,
    seedDigest: createHash('sha256').update(JSON.stringify(seed.values)).digest('hex'), close: () => sqlite.close()};
}
