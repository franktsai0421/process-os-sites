/* In-process actual handlers, normal synthetic logins and private SQLite/R2.
 * No HTTP server, browser, production credentials, business data or ACL changes.
 * Legacy compatibility projection is derived from normal-created approvals; it
 * is not a claim that a legacy business lifecycle ran.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { randomUUID, createHash } = require('node:crypto');
const source = path.resolve(process.env.IPQCC_OPERATION_SOURCE_ROOT || path.join(__dirname, '..'));
process.chdir(source);
const loader = require(path.join(source, 'scripts/ipqc-ab-import-harness.cjs'));
const { accessKeys } = require(path.join(source, 'public/process/access-policy.mjs'));
const json = value => JSON.parse(JSON.stringify(value));
const hash = value => createHash('sha256').update(value).digest('hex');

const ops = ['view', 'create', 'edit', 'delete', 'save', 'submit', 'withdraw', 'restore'];
const modules = ['ipqc-c', 'equipment', 'c', 'ab', 'lines', 'templates', 'approval'];
const c = (...operations) => operations.map(operation => 'ipqc-c.' + operation);
const allowed = {
  editor: modules.flatMap(name => ops.map(operation => name + '.' + operation)),
  reviewer: modules.flatMap(name => ['view', 'approve', 'return'].map(operation => name + '.' + operation)),
  'module-reviewer': c('view','approve','return'),
  viewer: ['equipment.view', ...c('view')],
  'edit-only': ['equipment.view', ...c('view', 'edit', 'withdraw')],
  'save-only': ['equipment.view', ...c('view', 'save')],
  'submit-only': ['equipment.view', ...c('view', 'submit')],
  'edit-save': ['equipment.view', ...c('view', 'edit', 'save')],
  'edit-submit': ['equipment.view', ...c('view', 'edit', 'submit')],
  'delete-only': ['equipment.view', ...c('view', 'delete', 'submit')],
  'edit-delete': ['equipment.view', ...c('view', 'edit', 'delete')],
  'no-view': ['equipment.view', 'approval.view', ...c('edit', 'save', 'submit', 'approve', 'return', 'delete')],
  revocable: ['equipment.view', ...c('view', 'edit', 'save', 'submit')],
};
async function fixture(projection = {}) {
  const db = new DatabaseSync(':memory:'), objects = new Map(), trace = [];
  for (const file of fs.readdirSync('drizzle').filter(file => file.endsWith('.sql')).sort())
    db.exec(fs.readFileSync(path.join('drizzle', file), 'utf8'));
  const env = { PROCESS_SESSION_SECRET: randomUUID(),
    DB: { prepare(sql) { let args = []; return {
      bind(...values) { args = values; return this; },
      async first() { return db.prepare(sql).get(...args) || null; },
      async all() { return { success: true, results: db.prepare(sql).all(...args) }; },
      async run() {
        if (/\b(INSERT|UPDATE|DELETE)\b.*state_backups/i.test(sql)) throw Error('BACKUP_WRITE_FORBIDDEN');
        return { meta: { changes: Number(db.prepare(sql).run(...args).changes) } };
      },
    }; }, async batch(statements) { db.exec('BEGIN'); try { const results = []; for (const statement of statements) results.push(await statement.all()); db.exec('COMMIT'); return results; } catch (error) { db.exec('ROLLBACK'); throw error; } } },
    STATE_ARCHIVE: {
      async put(key, value) { objects.set(key, Buffer.from(value)); },
      async head(key) { return objects.has(key) ? {} : null; },
      async get(key) { const bytes = objects.get(key); return bytes ? {
        text: async () => bytes.toString(),
        arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
        body: new ReadableStream({ start(controller) { controller.enqueue(bytes); controller.close(); } }),
      } : null; },
      async delete() { throw Error('R2_DELETE_FORBIDDEN'); },
    },
  };
  const load = loader(env), core = load('lib/process-state.ts'), wire = load('lib/workflow-wire.ts');
  const password = randomUUID(), sessions = {}, sequence = {};
  const users = Object.entries(allowed).map(([id, keys]) => ({ id: 'preview-' + id, name: 'Synthetic ' + id,
    role: id === 'admin' ? 'admin' : 'staff', enabled: true, inheritRole: false, authEpoch: 1,
    password, lines: ['A', 'B', 'C'], views: ['data', 'approval'],
    permissions: [],
    accessOverrides: Object.fromEntries(accessKeys.map(key => [key, keys.includes(key)])),
  }));
  const values = { ...projection, platformUsers: JSON.stringify(users) };
  db.prepare('INSERT INTO shared_state(id,revision,"values",updated_at) VALUES(1,1,?,?)').run(
    await load('lib/state-records.ts').encodeRecordValues(env.STATE_ARCHIVE, values), 'synthetic');
  for (const user of users) {
    const response = await load('app/api/platform-login/route.ts').POST(new Request('http://fixture/api/platform-login', {
      method: 'POST', headers: { Origin: 'http://fixture', 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: user.id, password }),
    }));
    assert.equal(response.status, 200, response.status === 200 ? '' : await response.text());
    sessions[user.id.slice(8)] = { Cookie: response.headers.get('set-cookie').split(';')[0], Origin: 'http://fixture', 'Content-Type': 'application/json' };
    trace.push({ endpoint: 'platform-login', method: 'POST', actor: user.id, status: response.status });
  }
  const flow = body => body.control?.workflow || body.workflow;
  async function call(endpoint, method = 'GET', body, who = 'editor', expected = 200, query = '') {
    const response = await load('app/api/' + endpoint + '/route.ts')[method](new Request('http://fixture/api/' + endpoint + query, {
      method, headers: sessions[who], ...(body ? { body: JSON.stringify(body) } : {}),
    }));
    const data = wire.expandWorkflowPayload(await response.json());
    trace.push({ endpoint, method, action: body?.command?.action || body?.action, who, status: response.status });
    assert.equal(response.status, expected, endpoint + ' ' + method + ': ' + JSON.stringify(data).slice(0,240));
    return data;
  }
  const read = (module, who = 'editor', query = '') => call(module + '/workflow', 'GET', undefined, who, 200, '?caseMetadata=1' + query);
  const begin = (module, who = 'editor', expected = 200, query = '') => call(module + '/workflow', 'POST', { action: 'begin' }, who, expected, '?caseMetadata=1' + query);
  async function command(module, action, detail = {}, who = 'editor', expected = 200, query = '') {
    const before = await read(module, 'editor', query), state = flow(before);
    const command = { operationId: randomUUID(), clientId: 'preview-' + who, sequence: sequence[who] = (sequence[who] || 0) + 1,
      generation: state.generation, expectedRevision: state.revision, action, ...detail, input: { stateRevision: before.revision, ...detail.input } };
    return call(module + '/workflow', 'POST', { command }, who, expected, '?caseMetadata=1' + query);
  }
  async function promote(module, query = '') {
    const saved = flow(await command(module, 'save', {}, 'editor', 200, query)).saved;
    const submitted = await command(module, 'submit', { savedId: saved.id, reason: 'Synthetic preview fixture' }, 'editor', 200, query);
    await command(module, 'approve', { caseId: submitted.receipt.caseId }, 'reviewer', 200, query);
    return submitted.receipt.caseId;
  }
  const snapshot = () => ({ row: { ...db.prepare('SELECT * FROM shared_state').get() }, objects: [...objects].map(([key, bytes]) => [key, hash(bytes)]) });
  async function preview(who = 'editor', expected = 200) {
    const before = snapshot();
    const result = await call('quality-equipment-replacement', 'GET', undefined, who, expected, '?sourceId=source');
    assert.deepEqual(snapshot(), before, 'preview must be read-only'); return result;
  }
  return { db, objects, env, sessions, load, core, flow, call, read, begin, command, promote, snapshot, preview, trace, close: () => db.close() };
}
module.exports = { fixture, json, source };
