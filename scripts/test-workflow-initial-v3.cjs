/* oxlint-disable typescript/no-require-imports -- initial version acceptance uses isolated current-schema legacy fixtures. */
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { randomUUID } = require('node:crypto');
const harness = require('./ipqc-ab-import-harness.cjs');
const quality = require('./v3-quality-growth-fixture.cjs');
const master = require('./v3-master-permission-fixture.cjs');

(async () => {
  for (const moduleId of ['fqc', 'iqc', 'ipqc-ab', 'ipqc-c', 'routine-equipment', 'authoring', 'master-AB', 'master-C', 'master-PROCESS']) {
    const db = new DatabaseSync(':memory:'), objects = new Map();
    try {
      db.exec('CREATE TABLE shared_state(id INTEGER PRIMARY KEY,revision INTEGER,"values" TEXT,updated_at TEXT);CREATE TABLE state_backups(id TEXT PRIMARY KEY,revision INTEGER,"values" TEXT,reason TEXT,actor TEXT,created_at TEXT)');
      const env = { PROCESS_SESSION_SECRET: randomUUID(), STATE_ARCHIVE: {
        async put(key, value) { objects.set(key, value); },
        async get(key) { return objects.has(key) ? { text: async () => objects.get(key) } : null; },
        async head(key) { return objects.has(key) ? {} : null; },
      }, DB: { prepare(sql) { let args = []; return {
        bind(...values) { args = values; return this; },
        async first() { return db.prepare(sql).get(...args) || null; },
        async run() { return { meta: { changes: Number(db.prepare(sql).run(...args).changes) } }; },
      }; } } };
      const f = moduleId.startsWith('master-') || moduleId === 'authoring' ? master(moduleId) : quality(moduleId, [{ id: 'a'.repeat(64), bytes: 1 }], 0, 3);
      let control = JSON.parse(f.values[f.key]);
      const isMaster = moduleId.startsWith('master-');
      const scope = moduleId === 'fqc' ? control.libraries.fqc : moduleId === 'ipqc-ab' ? control.scopes['A:G'] : control;
      const initial = JSON.parse(JSON.stringify(scope.versions.find(version => version.status === 'draft')));
      initial.id = 'legacy-initial-draft'; initial.number = moduleId === 'fqc' ? 'V1' : 1;
      scope.versions = [initial]; scope.activeVersionId = null; delete scope.workflow;
      if (isMaster) delete control.workflowScopes;
      if(moduleId==='authoring'){
        const workspace=initial.snapshot.workspaces[0],raw=JSON.stringify([{id:'legacy-initial-draft',status:'draft',category:workspace.category,line:workspace.line,stages:workspace.stages}]);
        const conversion=harness()('lib/process-authoring-conversion.ts'),plan=await conversion.prepareProcessAuthoringConversion({approvalVersions:raw},1);
        assert.equal(plan.ready,true);assert.equal(plan.recoveryValues.approvalVersions,raw);
        assert.equal(plan.preservedSavedDrafts.length,1);
        control=conversion.authoringControlFromPlan(plan);
        f.values.approvalVersions=raw;
      }
      f.values[f.key] = JSON.stringify(control);
      const password = randomUUID();
      f.url = f.url.replace('caseMetadata=1', 'caseMetadata=0');
      f.values.platformUsers = JSON.stringify(['a', 'b'].map(id => ({ id, name: id, password, enabled: true, role: 'admin' })));
      const load = harness(env), api = load('app/api/' + (f.api || moduleId) + '/workflow/route.ts');
      db.prepare('INSERT INTO shared_state VALUES(1,1,?,?)').run(await load('lib/state-records.ts').encodeRecordValues(env.STATE_ARCHIVE, f.values), 'fixture');
      const sessions = {};
      for (const id of ['a', 'b']) {
        const response = await load('app/api/platform-login/route.ts').POST(new Request('http://fixture/api/platform-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, password }) }));
        assert.equal(response.status, 200);
        sessions[id] = { Cookie: response.headers.get('set-cookie').split(';')[0], Origin: 'http://fixture', 'Content-Type': 'application/json' };
      }
      assert.notEqual(sessions.a.Cookie, sessions.b.Cookie);
      let sequence = 0;
      const request = async (who, body, status = 200) => {
        const response = await api[body ? 'POST' : 'GET'](new Request(f.url, { method: body ? 'POST' : 'GET', headers: sessions[who], ...(body ? { body: JSON.stringify(body) } : {}) }));
        const value = await response.json(); assert.equal(response.status, status, moduleId + ' ' + JSON.stringify(value)); return value;
      };
      if (isMaster) {
        const before = db.prepare('SELECT * FROM shared_state').get();
        const response = await request('a', { action: 'begin' }, 409);
        assert.equal(response.error, 'MASTER_EFFECTIVE_BASELINE_CONFLICT');
        assert.deepEqual(db.prepare('SELECT * FROM shared_state').get(), before);
        console.log(JSON.stringify({ moduleId, result: 'PASS_EXISTING_BASELINE_REQUIRED', checks: ['missing approved source is rejected without inventing a first formal version'], localWrites: 0 }));
        continue;
      }
      const begun = await request('a', { action: 'begin' });
      let flow = begun.control.workflow;
      if(moduleId==='authoring'){assert.ok(flow.active.id.startsWith('legacy-baseline:'));assert.equal(flow.active.content.workspaces.length,0);}
      else assert.equal(flow.active.id, null);
      const initialBase=flow.active.id;
      assert.equal(flow.saved, null);
      const originalWorking = flow.working;
      const command = async (who, action, detail = {}, status = 200) => request(who, { command: { action, generation: flow.generation, clientId: 'initial-' + who, sequence: ++sequence, operationId: randomUUID(), ...detail } }, status);
      await command('a', 'submit', { reason: 'Chưa lưu' }, 409);
      flow = (await command('b', 'save')).control.workflow;
      assert.deepEqual(flow.saved.content, originalWorking);
      const savedId = flow.saved.id;
      flow = (await command('a', 'save')).control.workflow;
      assert.equal(flow.saved.id, savedId, 'no-op save preserves first successful save');
      flow = (await command('a', 'submit', { savedId, reason: 'Lập phiên bản chính thức đầu tiên' })).control.workflow;
      const caseId = flow.pendingId;
      assert.equal(flow.cases.at(-1).baseId, initialBase);
      assert.deepEqual(flow.cases.at(-1).content, originalWorking, 'initial publication requires no fabricated edit');
      flow = (await command('b', 'approve', { caseId })).control.workflow;
      assert.equal(flow.active.id, caseId); assert.deepEqual(flow.active.content, originalWorking);
      const reopenedBody = await request('b'), reopened = reopenedBody.control?.workflow || reopenedBody.workflow;
      if(moduleId==='ipqc-c'){
        assert.equal(reopened.activeId,flow.active.id);
        const formalResponse=await load('app/api/ipqc-c/route.ts').GET(new Request(f.url.replace('/workflow',''),{headers:sessions.b}));
        assert.equal(formalResponse.status,200);const formalBody=await formalResponse.json();
        assert.deepEqual(formalBody.control.versions.find(version=>version.id===flow.active.id).snapshot,originalWorking);
      }else assert.deepEqual(reopened.active, flow.active);
      flow = (await request('a', { action: 'begin' })).control.workflow;
      flow = (await command('a', 'save')).control.workflow;
      const unchanged = await command('a', 'submit', { savedId: flow.saved.id, reason: 'Không có thay đổi' }, 422);
      assert.equal(unchanged.error, 'NO_SUBSTANTIVE_CHANGE');
      const persisted = JSON.parse((await load('lib/process-state.ts').readState()).values[f.key]);
      const library = moduleId === 'fqc' ? persisted.libraries.fqc : moduleId === 'ipqc-ab' ? persisted.scopes['A:G'] : persisted;
      const original = library.versions.find(version => version.id === initial.id);
      if(moduleId==='authoring')assert.equal((await load('lib/process-state.ts').readState()).values.approvalVersions,f.values.approvalVersions);
      else assert.deepEqual(moduleId === 'routine-equipment' ? original.equipment : original.snapshot, moduleId === 'routine-equipment' ? initial.equipment : initial.snapshot);
      console.log(JSON.stringify({ moduleId, result: 'PASS_FIRST_FORMAL_VERSION', checks: ['legacy draft retained', 'explicit initial save', 'same content first submission', 'separate reviewer', 'reopen formal content', 'subsequent net-zero denied'], localWrites: 0 }));
    } finally { db.close(); }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
