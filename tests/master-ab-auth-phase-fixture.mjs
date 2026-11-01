// Actual production modules; only the Workers DB/R2/crypto ports are instrumented.
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import {DatabaseSync} from 'node:sqlite';
import {webcrypto, createHash, randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const require = createRequire(import.meta.url);
const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const typescript = require(process.env.MASTER_AB_TYPESCRIPT || 'typescript');
const compiled = new Map();
const copy = value => JSON.parse(JSON.stringify(value));
const fixedTime = Date.parse('2026-10-31T12:00:00.000Z');
class FixtureDate extends Date {
  constructor(...args) { super(...(args.length ? args : [fixedTime])); }
  static now() { return fixedTime; }
}
export const sourceRoot = path.resolve(process.env.MASTER_AB_SOURCE_ROOT || repository);
export const isBaseline = process.env.MASTER_AB_EXPECT_BASELINE === '1';
export const productPath = ['products', {id: 'product-a'}, 'name'];

function loadModules(env, emit) {
  const modules = new Map();
  const crypto = {randomUUID: () => webcrypto.randomUUID(), subtle: new Proxy(webcrypto.subtle, {
    get(target, key) {
      if (key === 'digest') return async (algorithm, bytes) => {
        const raw = new TextDecoder().decode(bytes);
        if (raw.startsWith('{"command":')) await emit('fingerprint.before', {raw});
        return target.digest(algorithm, bytes);
      };
      const member = Reflect.get(target, key, target);
      return typeof member === 'function' ? member.bind(target) : member;
    },
  })};
  function load(relative) {
    const filename = path.resolve(sourceRoot, relative);
    if (modules.has(filename)) return modules.get(filename).exports;
    const mod = {exports: {}};
    modules.set(filename, mod);
    if (!compiled.has(filename)) {
      compiled.set(filename, typescript.transpileModule(readFileSync(filename, 'utf8'), {
        compilerOptions: {module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2022, esModuleInterop: true, allowJs: true},
      }).outputText);
    }
    vm.runInNewContext(compiled.get(filename), {
      module: mod, exports: mod.exports, require(id) {
        if (id === 'cloudflare:workers') return {env};
        if (id.startsWith('node:')) return require(id);
        const target = id.startsWith('@/') ? path.resolve(sourceRoot, id.slice(2)) : path.resolve(path.dirname(filename), id);
        if (target.endsWith('.json')) return JSON.parse(readFileSync(target, 'utf8'));
        return load(/\.(ts|mjs|js)$/.test(target) ? target : target + '.ts');
      }, Request, Response, Headers, ReadableStream, URL, URLSearchParams,
      TextEncoder, TextDecoder, atob, btoa, structuredClone, crypto, Date: FixtureDate, console,
    }, {filename});
    return mod.exports;
  }
  return load;
}

export async function fixture(options = {}) {
  assert.ok(existsSync(path.join(sourceRoot, 'app/api/master/workflow/route.ts')));
  const sqlite = new DatabaseSync(':memory:');
  // Public checked-in shared-state and revocation schema; in-memory only.
  // No Site projection, migration tool, live binding or deployment is involved.
  for (const name of ['0000_conscious_skin.sql', '0002_local_feedback_sessions.sql'])
    sqlite.exec(readFileSync(path.join(repository, 'drizzle', name), 'utf8'));
  const objects = new Map(), events = [], hooks = new Map();
  const stats = {sql: 0, state: 0, revocation: 0, revision: 0, cas: 0, other: 0, get: 0, head: 0, put: 0};
  let recording = true;
  async function emit(name, detail = {}) {
    if (!recording) return;
    const event = {name, ...detail};
    events.push(event);
    const handler = hooks.get(name);
    if (handler) await handler(event);
  }
  const env = {
    // Per-fixture, memory-only signing key; never a reusable checked-in credential.
    PROCESS_SESSION_SECRET: randomBytes(32).toString('hex'),
    PROCESS_SESSION_REVOCATION_ENABLED: '1',
    STATE_ARCHIVE: {
      async get(key) {
        if (recording) stats.get++;
        await emit('r2get.before', {key});
        const raw = objects.get(key);
        if (raw === undefined) return null;
        return {text: async () => raw, arrayBuffer: async () => new TextEncoder().encode(raw).buffer};
      },
      async head(key) { if (recording) stats.head++; return objects.has(key) ? {} : null; },
      async put(key, value) {
        if (recording) stats.put++;
        await emit('r2put.before', {key});
        objects.set(key, typeof value === 'string' ? value : new TextDecoder().decode(value));
      },
    },
    DB: {
      prepare(sql) {
        let args = [];
        const category = sql.includes('FROM process_revoked_sessions') ? 'revocation'
          : sql.startsWith('SELECT revision,"values" FROM shared_state') ? 'state'
          : sql.startsWith('SELECT revision FROM shared_state') ? 'revision'
          : sql.startsWith('UPDATE shared_state') ? 'cas' : 'other';
        async function execute(method) {
          if (recording) { stats.sql++; stats[category]++; }
          await emit(category + '.before', {sql, args, count: stats[category]});
          const result = sqlite.prepare(sql)[method](...args);
          await emit(category + '.after', {sql, args, count: stats[category], result});
          return result;
        }
        return {
          bind(...values) { args = values; return this; },
          async first() { return (await execute('get')) || null; },
          async all() { return {success: true, results: await execute('all')}; },
          async run() { return {success: true, meta: {changes: Number((await execute('run')).changes)}}; },
        };
      },
      async batch(statements) {
        sqlite.exec('BEGIN');
        try { const results = []; for (const statement of statements) results.push(await statement.all()); sqlite.exec('COMMIT'); return results; }
        catch (error) { sqlite.exec('ROLLBACK'); throw error; }
      },
    },
  };
  const load = loadModules(env, emit), core = load('lib/process-state.ts'), codec = load('lib/state-records.ts');
  const kernel = load('lib/shared-draft.ts'), wire = load('lib/workflow-wire.ts');
  const route = load('app/api/master/workflow/route.ts');
  const scope = options.scope || 'AB', line = scope === 'C' ? 'C' : 'A', stage = line + '-CUT';
  const product = {id: 'product-a', code: line + '1', name: 'Synthetic product', specification: '10 mm', unit: 'CAI', category: 'G', line, stages: [stage]};
  const catalog = {products: [product], lines: [{id: 'line-a', code: line, name: 'Synthetic line', stages: [{id: 'stage-a', code: stage, name: 'Cut'}]}], categoryGroups: [{id: 'group-a', line, name: 'G'}]};
  const templates = {[stage]: load('lib/master-stage-link.ts').stageDefaultTemplates(stage)};
  const snapshot = scope === 'PROCESS' ? templates : catalog;
  const flow = kernel.createSharedDraft('master:' + scope, snapshot, 'active', 'synthetic-generation');
  const stamp = {actor: {id: 'fixture', name: 'Synthetic operator', admin: true}, at: new FixtureDate().toISOString()};
  flow.saves.push({...stamp, id: 'save0', revision: 0, content: copy(snapshot), contributors: {}});
  flow.cases.push({...stamp, id: 'case0', savedId: 'save0', baseId: 'active', content: copy(snapshot), before: copy(snapshot), reason: 'Synthetic history', status: 'approved', result: {...stamp, reason: 'Approved', selfReview: true}});
  const version = (id, status, content) => ({id, scope, number: id === 'active' ? 1 : 2, status, snapshot: content, revision: 1, creatorId: 'fixture', creatorName: stamp.actor.name, createdAt: stamp.at, updatedAt: stamp.at, history: []});
  const empty = {products: [], lines: [], categoryGroups: []};
  const master = {active: {AB: line === 'A' ? catalog : empty, C: line === 'C' ? catalog : empty, PROCESS: templates}, versions: [version('active', 'approved', snapshot), version('case0', 'superseded', copy(snapshot)), version('shared-' + flow.generation, 'draft', flow.working)], workflowScopes: {[scope]: flow}};
  const user = {id: options.primary ? 'frank' : 'fixture', name: 'Synthetic operator', role: 'admin', enabled: true, authEpoch: 1, accessOverrides: {[scope === 'AB' ? 'ab.restore' : scope === 'C' ? 'c.restore' : 'templates.restore']: true}, ...options.user};
  const values = {masterDataControl: JSON.stringify(master), platformUsers: JSON.stringify([user]), bomOverrides: JSON.stringify({replaceAll: true, data: {[product.code]: []}}), processMasterData: JSON.stringify(templates), ...options.values};
  recording = false;
  sqlite.prepare('INSERT INTO shared_state(id,revision,"values",updated_at) VALUES(1,1,?,?)').run(options.inline ? JSON.stringify(values) : await codec.encodeRecordValues(env.STATE_ARCHIVE, values), stamp.at);
  const origin = 'https://fixture.invalid', url = origin + '/api/master/workflow?scope=' + scope + '&caseMetadata=1&compact=1';
  const token = await core.demoSession(new Request(url), user.id, false, user.authEpoch);
  assert.ok(token, 'real production session signer must create fixture session');
  const headers = {Cookie: core.sessionCookie(new Request(url), token).split(';')[0], Origin: origin, 'Content-Type': 'application/json'};
  recording = true;
  const reset = () => { for (const key of Object.keys(stats)) stats[key] = 0; events.length = 0; };
  const row = () => copy(sqlite.prepare('SELECT * FROM shared_state WHERE id=1').get());
  async function decoded() {
    const before = recording; recording = false;
    try { return await core.decodeValues(row().values); } finally { recording = before; }
  }
  async function mutateValues(transform, bump = true) {
    const before = recording; recording = false;
    try {
      const next = await decoded(); await transform(next);
      sqlite.prepare('UPDATE shared_state SET revision=revision+?,"values"=? WHERE id=1').run(bump ? 1 : 0, options.inline ? JSON.stringify(next) : await codec.encodeRecordValues(env.STATE_ARCHIVE, next));
    } finally { recording = before; }
  }
  function revoke() { sqlite.prepare('INSERT OR REPLACE INTO process_revoked_sessions(token_digest,expires_at,revoked_at) VALUES(?,?,?)').run(createHash('sha256').update(token).digest('hex'), fixedTime + 60_000, fixedTime); }
  async function request(method = 'GET', command, suffix = '', customHeaders = headers) {
    const response = await route[method](new Request(url + suffix, {method, headers: customHeaders, ...(method === 'POST' ? {body: JSON.stringify(command?.action === 'begin' ? command : {command})} : {})}));
    return {status: response.status, body: copy(wire.expandWorkflowPayload(await response.json()))};
  }
  let sequence = 0;
  function command(action = 'apply', detail = {}) {
    sequence++;
    return {operationId: 'synthetic-operation-' + sequence, clientId: 'synthetic-client', sequence, generation: flow.generation, action, ...(action === 'apply' ? {patches: [{op: 'set', path: productPath, value: 'Edited product'}], guards: [{path: productPath, value: product.name}]} : {}), ...detail};
  }
  reset();
  return {scope, user, flow, master: copy(master), values: copy(values), load, core, route, codec, env, sqlite, objects, events, hooks, stats, reset, row, decoded, mutateValues, revoke, request, command, headers, url, close: () => sqlite.close()};
}
