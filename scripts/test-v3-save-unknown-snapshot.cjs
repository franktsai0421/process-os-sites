/* oxlint-disable typescript/no-require-imports -- Actual workflow handlers, synthetic SQLite/R2 and production transport. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {DatabaseSync} = require('node:sqlite');
const {randomUUID, webcrypto} = require('node:crypto');
const harness = require('./ipqc-ab-import-harness.cjs');
const db = new DatabaseSync(':memory:'), objects = new Map();
for (const file of fs.readdirSync('drizzle').filter(name => name.endsWith('.sql')).sort()) db.exec(fs.readFileSync(path.join('drizzle', file), 'utf8'));
const env = {PROCESS_SESSION_SECRET: randomUUID(), DB: {prepare(sql) {
  let args = [];
  return {bind(...values) {args = values; return this;}, async first() {return db.prepare(sql).get(...args) || null;},
    async run() {return {meta: {changes: Number(db.prepare(sql).run(...args).changes)}};}};
}}, STATE_ARCHIVE: {async put(key, value) {objects.set(key, value);}, async head(key) {return objects.has(key) ? {} : null;},
  async get(key) {return objects.has(key) ? {text: async () => String(objects.get(key))} : null;}}};
const load = harness(env), core = load('lib/process-state.ts'), conversion = load('lib/process-authoring-conversion.ts');
const api = load('app/api/process-authoring/workflow/route.ts');
const url = 'http://fixture/api/process-authoring/workflow', storage = new Map(), calls = [];
let headers, loseSaveAck = true, receiptUnavailable = true;
const sessionStorage = {getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key)};
async function dispatch(input, options = {}) {
  const request = new Request(new URL(input, url), {...options, headers: options.headers || headers});
  const operation = options.body ? JSON.parse(options.body).command : null;
  calls.push({method: request.method, action: operation?.action, receipt: new URL(request.url).searchParams.has('operationId')});
  if (request.method === 'GET' && new URL(request.url).searchParams.has('operationId') && receiptUnavailable) throw Error('RECEIPT_TEMPORARILY_UNAVAILABLE');
  const response = await (request.method === 'POST' ? api.POST(request) : api.GET(request));
  if (operation?.action === 'save' && loseSaveAck) {
    assert.equal(response.status, 200); loseSaveAck = false; throw Error('ACK_LOST_AFTER_COMMIT');
  }
  return response;
}
function client() {
  const window = {ProcessSync: {identity: {id: 'qa-save'}}, addEventListener() {}};
  const context = {window, document: {documentElement: {lang: 'zh-TW'}, querySelectorAll: () => []}, sessionStorage,
    crypto: webcrypto, fetch: dispatch, AbortController, setTimeout, clearTimeout, URL, URLSearchParams, console};
  vm.createContext(context); vm.runInContext(fs.readFileSync('public/process/shared-draft-client.js', 'utf8'), context);
  return window.createSharedDraftClient({endpoint: '/api/process-authoring/workflow', actorId: 'qa-save', headers: () => headers});
}
(async () => {
  try {
    const op = {id: 'qa-op', name: 'Before', stageCode: 'A-CUT', productCodes: ['QA-X'], nextIds: [], instructionSteps: [{text: 'Do', standard: 'Check'}]};
    const versions = [{id: 'qa-old', number: 1, category: 'QA-G', line: 'A', status: 'approved', stages: {'A-CUT': [op]}}];
    const users = [{id: 'qa-save', name: 'Synthetic save actor', role: 'admin', enabled: true, inheritRole: false,
      lines: ['A', 'B', 'C'], views: ['editor', 'approval'], permissions: ['approval.submit', 'approval.withdraw', 'approval.approve', 'approval.reject', 'approval.compare', 'master.delete']}];
    const values = {platformUsers: JSON.stringify(users), approvalVersions: JSON.stringify(versions),
      masterDataControl: JSON.stringify({active: {AB: {products: [{code: 'QA-X', line: 'A', category: 'QA-G', stages: ['A-CUT']}], lines: [{code: 'A', stages: [{code: 'A-CUT'}]}]}, C: {products: [], lines: []}}}),
      bomOverrides: JSON.stringify({replaceAll: true, data: {'QA-X': []}})};
    values.processAuthoringControl = JSON.stringify(conversion.authoringControlFromPlan(await conversion.prepareProcessAuthoringConversion(values, 1)));
    db.prepare('INSERT INTO shared_state(id,revision,"values",updated_at) VALUES(1,1,?,?)').run(JSON.stringify(values), 'fixture');
    headers = {Cookie: 'process_demo=' + await core.demoSession(new Request(url), 'qa-save', false), Origin: 'http://fixture', 'Content-Type': 'application/json'};
    const c = client(), first = await c.read(), generation = first.control.workflow.generation;
    const rowPath = ['workspaces', {id: JSON.stringify(['QA-G', 'A'])}, 'stages', 'A-CUT', {id: 'qa-op'}, 'name'];
    await c.command(generation, 'apply', {patches: [{op: 'set', path: rowPath, value: 'Saved cutoff'}]});
    await assert.rejects(c.command(generation, 'save'), /RESULT_UNKNOWN_CHECK_BEFORE_RETRY/);
    assert.equal(c.hasUnknown(), true); assert.equal(storage.size, 1);
    const retained = JSON.parse([...storage.values()][0]); assert.equal(retained.action, 'save');
    const committed = await (await api.GET(new Request(url, {headers}))).json();
    const saved = committed.control.workflow.saved;
    assert.equal(saved.content.workspaces[0].stages['A-CUT'][0].name, 'Saved cutoff');
    const history = await (await api.GET(new Request(url + '?uiHistory=1', {headers}))).json();
    assert.equal(history.saves.rows.filter(row => row.id === saved.id).length, 1);
    const revision = db.prepare('SELECT revision FROM shared_state WHERE id=1').get().revision;
    const reopened = client(); assert.equal(reopened.hasUnknown(), true); receiptUnavailable = false;
    const recovered = await reopened.resolveUnknown(); assert.equal(recovered.receipt.operationId, retained.operationId);
    assert.equal(reopened.hasUnknown(), false); assert.equal(storage.size, 0);
    const reloaded = await reopened.read(); assert.equal(reloaded.control.workflow.saved.id, saved.id);
    assert.equal(JSON.stringify(reloaded.control.workflow.saved.content), JSON.stringify(saved.content));
    assert.equal(db.prepare('SELECT revision FROM shared_state WHERE id=1').get().revision, revision);
    assert.equal(calls.filter(call => call.method === 'POST' && call.action === 'save').length, 1);
    await reopened.command(generation, 'apply', {patches: [{op: 'set', path: rowPath, value: 'Later unsaved working'}]});
    const later = await reopened.read(); assert.equal(later.control.workflow.working.workspaces[0].stages['A-CUT'][0].name, 'Later unsaved working');
    assert.equal(later.control.workflow.saved.id, saved.id); assert.equal(JSON.stringify(later.control.workflow.saved.content), JSON.stringify(saved.content));
    console.log(JSON.stringify({status: 'PASS', cases: ['actual Save commits before lost ACK', 'unknown operation retained and not reported as success',
      'reopened production transport resolves exact own operation receipt', 'saved ID/body/cutoff persist without duplicate Save or revision change',
      'later working edit cannot overwrite immutable saved snapshot'], scope: 'Production API and client, in-memory SQLite/R2; not real-browser reload or cross-computer acceptance', networkTargets: 0}));
  } finally {db.close();}
})().catch(error => {console.error(error); process.exitCode = 1;});
