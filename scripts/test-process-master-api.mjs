import {createRequire as __esmFactory} from 'node:module';
import {fileURLToPath as __esmPath} from 'node:url';
const __esmOldFilename=__esmPath(new URL("./test-process-master-api.cjs",import.meta.url));
const __esmRequire=__esmFactory(__esmOldFilename);
process.chdir(process.env.ACTUAL_SOURCE || process.cwd());
const fs = __esmRequire('node:fs');
const path = __esmRequire('node:path');
const vm = __esmRequire('node:vm');
const assert = __esmRequire('node:assert/strict');
const ts = __esmRequire('typescript');
const { DatabaseSync } = __esmRequire('node:sqlite');

const db = new DatabaseSync(':memory:');
for (const name of fs.readdirSync('drizzle').filter(n=>n.endsWith('.sql')).sort()) db.exec(fs.readFileSync(path.join('drizzle',name),'utf8'));
const env = { PROCESS_SESSION_SECRET:crypto.randomUUID(), DEMO_LOGIN_ENABLED:"true",
  DB: {
    prepare(sql) {
      let args = [];
      return {
        bind(...values) {
          args = values;
          return this;
        },
        async run() {
          const result = db.prepare(sql).run(...args);
          return { meta: { changes: Number(result.changes) } };
        },
        async first() {
          return db.prepare(sql).get(...args) || null;
        },
        async all() {
          return { results: db.prepare(sql).all(...args) };
        },
      };
    },
  },
};
const presets = [
  'entry',
  'manual',
  'manual-inspection',
  'machine-assembly',
  'exit',
];
const catalog = (withCustom) => ({
  A1: [
    ...presets.map((presetKey, index) => ({
      id: `A1-${index + 1}`,
      name: presetKey,
      presetKey,
      mediaItems: [],
    })),
    ...(withCustom ? [{ id: 'A1-CUSTOM', name: 'Custom', mediaItems: [] }] : []),
  ],
});
const ab = {
  products: [{ code: 'P1', name: 'Product', stages: ['A1'] }],
  lines: [{ code: 'A', stages: [{ code: 'A1' }] }],
};
const c = { products: [], lines: [] };
const oldProcess = catalog(true);
const nextProcess = catalog(false);
const version = (id, number, status, snapshot) => ({
  id,
  scope: 'PROCESS',
  number,
  status,
  snapshot,
  creatorId: 'admin',
  creatorName: 'Admin',
  createdAt: '2026-09-10T00:00:00.000Z',
  updatedAt: '2026-09-10T00:00:00.000Z',
  history: [],
  warnings: [],
});
const priorMaster = {
  active: { AB: ab, C: c, PROCESS: oldProcess },
  versions: [
    version('PROCESS-1', 1, 'approved', oldProcess),
    version('PROCESS-2', 2, 'pending', nextProcess),
  ],
};
const seed = {
  revision: 1,
  values: {
    platformUsers: JSON.stringify([
      {
        id: 'qa-admin',
        name: 'Admin',
        role: 'admin',
        password: 'secret',
        enabled: true,
        permissions: ['*'],
        views: ['data', 'approval'],
      },
    ]),
    processCustomRoles: '[]',
    processRoleTemplateOverrides: '{}',
    masterDataControl: JSON.stringify(priorMaster),
    processMasterData: JSON.stringify(oldProcess),
  },
};
db.prepare('INSERT INTO shared_state(id,revision,"values",updated_at) VALUES(1,?,?,?)').run(seed.revision,JSON.stringify(seed.values),'fixture');

function productionLoader(runtimeCrypto=crypto){
 const cache=new Map();
 function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file);const mod={exports:{}};cache.set(file,mod.exports);
 const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 vm.runInNewContext(js,{module:mod,exports:mod.exports,require(id){if(id==='cloudflare:workers')return{env};if(id.startsWith('node:'))return __esmRequire(id);const target=id.startsWith('@/')?path.resolve(id.slice(2)):path.resolve(path.dirname(file),id);if(target.endsWith('.json'))return JSON.parse(fs.readFileSync(target,'utf8'));if(target.endsWith('.mjs'))return __esmRequire(target);return load(target.endsWith('.ts')?target:target+'.ts')},Request,Response,Headers,ReadableStream,URL,crypto:runtimeCrypto,TextEncoder,TextDecoder,atob,btoa,structuredClone,console,Date});
 cache.set(file,mod.exports);return mod.exports;
 }return load;
}

const load=productionLoader();

(async () => {
  const api = load(path.resolve('app/api/shared-state/route.ts'));
  const login=load(path.resolve('app/api/platform-login/route.ts'));
  const signed=await login.POST(new Request('https://example.test/api/platform-login',{method:'POST',headers:{Origin:'https://example.test','Content-Type':'application/json'},body:JSON.stringify({id:'qa-admin',password:'secret'})}));
  assert.equal(signed.status,200,'production platform login must return a signed session');
  const headers={Origin:'https://example.test','Content-Type':'application/json',Cookie:signed.headers.get('set-cookie').split(';')[0]};
  const request = (updates, baseRevision) =>
    new Request('https://example.test/api/shared-state', {
      method: 'POST',
      headers,
      body: JSON.stringify({ updates, baseRevision }),
    });

  const snapshotBeforeMalformed = JSON.stringify(db.prepare('SELECT * FROM shared_state').all());
  const backupsBeforeMalformed = JSON.stringify(db.prepare('SELECT * FROM state_backups').all());
  for (const payload of [null, 42, 'invalid', [], {updates:[]}, {updates:null}]) {
    const malformedBody = await api.POST(new Request('https://example.test/api/shared-state', {
      method:'POST', headers, body:JSON.stringify(payload),
    }));
    assert.equal(malformedBody.status,400,'malformed shared-state body must return 400');
    assert.equal(JSON.stringify(db.prepare('SELECT * FROM shared_state').all()),snapshotBeforeMalformed,'malformed body must not mutate state');
    assert.equal(JSON.stringify(db.prepare('SELECT * FROM state_backups').all()),backupsBeforeMalformed,'malformed body must not create backups');
  }

  const approvedMaster = JSON.parse(JSON.stringify(priorMaster));
  approvedMaster.active.PROCESS = nextProcess;
  approvedMaster.versions[0].status = 'superseded';
  approvedMaster.versions[1].status = 'approved';
  approvedMaster.versions[1].reviewedAt = '2026-09-10T01:00:00.000Z';
  const approval = await api.POST(
    request(
      {
        masterDataControl: JSON.stringify(approvedMaster),
        processMasterData: JSON.stringify(nextProcess),
      },
      1,
    ),
  );
  assert.equal(approval.status, 200);
  const approvedState = await approval.json();
  assert.deepEqual(
    JSON.parse(approvedState.values.processMasterData),
    nextProcess,
  );

  const bypass = await api.POST(
    request({ processMasterData: JSON.stringify(oldProcess) }, 2),
  );
  assert.equal(bypass.status, 403);
  assert.match((await bypass.json()).error, /先送審並由主管核准/);

  const malformed = JSON.parse(JSON.stringify(approvedMaster));
  malformed.versions.push(
    version('PROCESS-3', 3, 'draft', {
      A1: [{ id: 'ONLY-ONE', name: 'incomplete', presetKey: 'entry' }],
    }),
  );
  const rejected = await api.POST(
    request({ masterDataControl: JSON.stringify(malformed) }, 2),
  );
  assert.equal(rejected.status, 400);
  assert.match((await rejected.json()).error, /流程資料版本結構不完整/);
  const badEquipment = JSON.parse(JSON.stringify(approvedMaster));
  const equipmentSnapshot = catalog(false);
  equipmentSnapshot.A1.find(t => t.presetKey === 'machine-assembly').equipment = [{id:'EQ-test',number:'M001',name:'Machine',line:'A1',stageCode:'WRONG',kind:'machine-assembly',mediaItems:[]}];
  badEquipment.versions.push(version('PROCESS-3',3,'draft',equipmentSnapshot));
  const equipmentRejected = await api.POST(request({masterDataControl:JSON.stringify(badEquipment)},2));
  assert.equal(equipmentRejected.status,400,'equipment cannot claim a different stage');
  console.log(
    'PASS: PROCESS master approval can atomically apply deletions, while malformed process versions are rejected.',
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(()=>db.close());
