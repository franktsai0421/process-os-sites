/* oxlint-disable typescript/no-require-imports -- This isolated fixture loads Workers handlers in a VM. */
/* Isolated in-memory D1/R2 fixture. No existing Local or remote data is changed. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { DatabaseSync } = require('node:sqlite');
const { webcrypto, randomUUID } = require('node:crypto');

const db = new DatabaseSync(':memory:');
for (const name of fs.readdirSync('drizzle').filter(name => name.endsWith('.sql')).sort())
  db.exec(fs.readFileSync(path.join('drizzle', name), 'utf8'));
const objects = new Map();
const maintenanceToken = randomUUID();
let maintenanceEnabled = false;
const env = {
  PROCESS_SESSION_SECRET: randomUUID(), PROCESS_RELEASE_TOKEN: maintenanceToken, DEMO_LOGIN_ENABLED: 'true',
  DB: { prepare(sql) { let args = []; return {
    bind(...values) { args = values; return this; },
    async run() { return { meta: { changes: Number(db.prepare(sql).run(...args).changes) } }; },
    async first() { return db.prepare(sql).get(...args) || null; },
    async all() { return { results: db.prepare(sql).all(...args) }; },
  }; } },
  STATE_ARCHIVE: {
    async head(key) { return objects.has(key) ? {} : null; },
    async put(key, value, options) { objects.set(key, { value, options }); },
    async get(key) { const item = objects.get(key); if (!item) return null;
      const bytes = Buffer.from(item.value);
      return { body: bytes, text: async () => bytes.toString(), arrayBuffer: async () => Uint8Array.from(bytes).buffer, httpMetadata: item.options?.httpMetadata }; },
  },
};
const master = { active: { C: { products: [{ code:'X1', name:'Sản phẩm', stages:['C-TIEN'] }],
  lines: [{ stages:[{code:'C-TIEN',name:'Tiện'}] }] } } };
const users = ['admin','rd','staff'].map(role => ({ id:`demo-${role}`, name:`Demo ${role}`,
  role, authMode:'demo', enabled:true, inheritRole:true }));
const initialValues = { platformUsers:JSON.stringify(users), masterDataControl:JSON.stringify(master),
  qualityMasterControl:JSON.stringify({ marker:'existing-FQC' }) };
db.prepare('INSERT INTO shared_state(id,revision,"values",updated_at) VALUES(1,1,?,?)')
  .run(JSON.stringify(initialValues), 'fixture');
const cache = new Map();
function load(file) {
  file = path.resolve(file); if (cache.has(file)) return cache.get(file);
  const fixtureModule = { exports:{} }; cache.set(file, fixtureModule.exports);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'),
    { compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true} }).outputText;
  vm.runInNewContext(code, { module:fixtureModule, exports:fixtureModule.exports, require(id) {
    if (id === 'cloudflare:workers') return { env };
    const target = id.startsWith('@/') ? path.resolve(id.slice(2)) : path.resolve(path.dirname(file), id);
    return target.endsWith('.mjs') ? require(target) : load(target.endsWith('.ts') ? target : target+'.ts');
  }, Request, Response, URL, crypto:webcrypto, Date, TextEncoder, TextDecoder, atob, btoa, console });
  cache.set(file, fixtureModule.exports); return fixtureModule.exports;
}
const core = load('lib/process-state.ts');
const api = load('app/api/ipqc-c/route.ts');
const photoApi = load('app/api/ipqc-c/photo/route.ts');
const base = 'http://127.0.0.1:3900';
let cookies;
async function read(role='admin') {
  const response = await api.GET(new Request(base+'/api/ipqc-c', { headers:{Cookie:cookies[role]} }));
  return { status:response.status, body:await response.json() };
}
async function call(role, action, detail={}, baseRevision) {
  const state = (await read(role)).body;
  const revision = baseRevision ?? state.revision;
  const open = state.control.versions.find(v=>v.status==='draft'||v.status==='pending');
  const target = open && !['seed','begin'].includes(action) ? {versionId:open.id,versionRevision:open.revision} : {};
  const response = await api.POST(new Request(base+'/api/ipqc-c', { method:'POST',
    headers:{Cookie:cookies[role],Origin:base,'Content-Type':'application/json',
      ...(action === 'seed' && maintenanceEnabled ? {'X-Process-Release-Token':maintenanceToken} : {})},
    body:JSON.stringify({action,baseRevision:revision,...target,...detail}) }));
  return { status:response.status, body:await response.json() };
}

(async () => {
  cookies = Object.fromEntries(await Promise.all(['admin','rd','staff'].map(async role =>
    [role,`process_demo=${await core.demoSession(new Request(base),`demo-${role}`,true)}`])));
  assert.equal((await api.GET(new Request(base+'/api/ipqc-c'))).status,403);
  const error = { id:'ipqc-c-error-row-2',code:'C-X1-TIEN-L1',productCode:'X1',stageCode:'C-TIEN',
    name:'Lỗi Việt',note:'',reason:'',sourceRow:2,deleted:false };
  const item = { id:'ipqc-c-item-row-2',code:'C-X1-TIEN-L1-01',errorId:error.id,productCode:'X1',stageCode:'C-TIEN',
    standard:'12.5 ± 0.05mm',cpkEnabled:false,standardEnabled:true,description:'Đo kích thước',tool:'',method:'Đo',frequency:'',
    note:'',reason:'',notApplicable:false,mediaItems:[],sourceRow:2,deleted:false };
  assert.equal((await call('staff','seed',{source:{fileName:'source.xlsx',sha256:'a'.repeat(64),rows:1,records:[{error,item}]}})).status,403);
  const beforeDeniedSeed = db.prepare('SELECT * FROM shared_state').get();
  assert.equal((await call('admin','seed',{source:{fileName:'source.xlsx',sha256:'a'.repeat(64),rows:1,records:[{error,item}]}})).status,403,'browser ADMIN alone cannot import');
  assert.deepEqual(db.prepare('SELECT * FROM shared_state').get(),beforeDeniedSeed,'denied import leaves state unchanged');
  maintenanceEnabled = true;
  assert.equal((await call('staff','seed',{source:{fileName:'source.xlsx',sha256:'a'.repeat(64),rows:1,records:[{error,item}]}})).status,403,'maintenance credential does not grant ADMIN role');
  let response = await call('admin','seed',{source:{fileName:'source.xlsx',sha256:'a'.repeat(64),rows:1,records:[{error,item}]}});
  assert.equal(response.status,200,JSON.stringify(response.body));
  assert.equal(response.body.control.versions[0].status,'approved');
  const firstVersion = response.body.control.activeVersionId;
  assert.equal((await call('admin','seed',{source:{fileName:'source.xlsx',sha256:'a'.repeat(64),rows:1,records:[{error,item}]}})).body.unchanged,true);
  response = await call('admin','begin'); assert.equal(response.status,200);
  let draft = response.body.control.versions.find(v=>v.status==='draft');
  const draftId = draft.id;
  response = await call('admin','create-error',{productCode:'X1',stageCode:'C-TIEN',name:'Mới'});
  assert.equal(response.status,200);
  draft = response.body.control.versions.find(v=>v.id===draftId);
  assert.equal(draft.snapshot.errors.at(-1).code,'C-X1-TIEN-L2');
  assert.equal((await call('staff','approve',{versionId:draftId,versionRevision:draft.revision,comment:'no'})).status,403);
  assert.equal((await call('admin','create-error',{productCode:'X1',stageCode:'C-TIEN',name:'stale'},response.body.revision-1)).status,409);
  const newError = draft.snapshot.errors.at(-1);
  const missingDescription = await call('admin','create-item',{errorId:newError.id,item:{standard:'Mới',
    description:'',tool:'',method:'Đo',frequency:'Mỗi lô',note:'',reason:'',notApplicable:false,mediaItems:[]}});
  assert.equal(missingDescription.status,422);
  response = await call('admin','create-item',{errorId:newError.id,item:{standard:'',cpkEnabled:true,standardEnabled:true,
    description:'Kiểm tra cuối',tool:'',method:'',frequency:'',note:'',reason:'',notApplicable:false,mediaItems:[]}});
  assert.equal(response.status,200);
  draft = response.body.control.versions.find(v=>v.id===draftId);
  const newItem = draft.snapshot.items.at(-1);
  assert.equal(newItem.code,'C-X1-TIEN-L2-01');
  const invalid = await call('admin','submit',{versionId:draftId,versionRevision:draft.revision,snapshot:draft.snapshot});
  assert.equal(invalid.status,422);
  assert.equal((await read()).body.control.versions.find(v=>v.id===draftId).status,'draft');
  const last = structuredClone(draft.snapshot);
  last.items.at(-1).standard='Kiểm tra cuối'; last.items.at(-1).method='Đo'; last.items.at(-1).frequency='Mỗi lô';
  response = await call('admin','submit',{versionId:draftId,versionRevision:draft.revision,snapshot:last});
  assert.equal(response.status,200,JSON.stringify(response.body));
  assert.equal(response.body.control.versions.find(v=>v.id===draftId).status,'pending');
  assert.equal(response.body.control.versions.find(v=>v.id===draftId).snapshot.items.at(-1).standard,'Kiểm tra cuối');
  draft = response.body.control.versions.find(v=>v.id===draftId);
  response = await call('rd','reject',{versionId:draftId,versionRevision:draft.revision,comment:'Bổ sung'});
  assert.equal(response.status,200); assert.equal(response.body.control.versions.find(v=>v.id===draftId).status,'draft');
  draft = response.body.control.versions.find(v=>v.id===draftId);
  response = await call('admin','submit',{versionId:draftId,versionRevision:draft.revision,snapshot:draft.snapshot});
  assert.equal(response.status,200);
  draft = response.body.control.versions.find(v=>v.id===draftId);
  response = await call('admin','withdraw',{versionId:draftId,versionRevision:draft.revision});
  assert.equal(response.status,200); assert.equal(response.body.control.versions.find(v=>v.id===draftId).status,'draft');
  draft = response.body.control.versions.find(v=>v.id===draftId);
  response = await call('admin','submit',{versionId:draftId,versionRevision:draft.revision,snapshot:draft.snapshot});
  draft = response.body.control.versions.find(v=>v.id===draftId);
  response = await call('rd','approve',{versionId:draftId,versionRevision:draft.revision,comment:'Đồng ý'});
  assert.equal(response.status,200); assert.equal(response.body.control.activeVersionId,draftId);
  assert.equal(response.body.control.versions.find(v=>v.id===firstVersion).status,'superseded');
  assert.equal(JSON.parse((await core.readState()).values.qualityMasterControl).marker,'existing-FQC');
  response = await call('admin','begin'); draft=response.body.control.versions.find(v=>v.status==='draft');
  response = await call('admin','delete-item',{versionId:draft.id,versionRevision:draft.revision,id:newItem.id});
  assert.equal(response.status,200);
  draft = response.body.control.versions.find(v=>v.status==='draft');
  const invalidRule = await call('admin','create-item',{errorId:newError.id,item:{standard:'Mới',cpkEnabled:false,standardEnabled:true,
    description:'Đo trước',tool:'',method:'Đo',frequency:'',rule:{cadence:'batch',batchKind:'aql',aqlValue:''},
    note:'',reason:'',notApplicable:false,mediaItems:[]}});
  assert.equal(invalidRule.status,422);
  response = await call('admin','create-item',{errorId:newError.id,item:{standard:'Mới',cpkEnabled:false,standardEnabled:true,
    description:'Đo trước',tool:'',method:'Đo',frequency:'',rule:{cadence:'batch',batchKind:'aql',aqlValue:'0.25'},
    note:'',reason:'',notApplicable:false,mediaItems:[]}});
  assert.equal(response.status,200);
  assert.equal(response.body.control.versions.find(v=>v.status==='draft').snapshot.items.at(-1).code,'C-X1-TIEN-L2-02');
  assert.equal(response.body.control.versions.find(v=>v.status==='draft').snapshot.items.at(-1).rule.aqlValue,'0.25');
  const image = new Uint8Array([137,80,78,71,13,10,26,10]);
  const upload = await photoApi.PUT(new Request(base+'/api/ipqc-c/photo',{method:'PUT',
    headers:{Cookie:cookies.admin,Origin:base,'Content-Type':'image/png'},body:image}));
  assert.equal(upload.status,200);
  const photoId=(await upload.json()).id;
  assert.equal((await photoApi.GET(new Request(`${base}/api/ipqc-c/photo?id=${photoId}`,{headers:{Cookie:cookies.admin}}))).status,200);
  assert.equal((await photoApi.GET(new Request(`${base}/api/ipqc-c/photo?id=${photoId}`))).status,403);
  draft = response.body.control.versions.find(v=>v.status==='draft');
  const photoSnapshot=structuredClone(draft.snapshot);
  photoSnapshot.items.at(-1).description='Đo trước\n\nĐo sau';
  photoSnapshot.items.at(-1).mediaItems=[{id:photoId,name:'test.png',note:'Giữa hai đoạn',afterParagraph:1}];
  response = await call('admin','save',{versionId:draft.id,versionRevision:draft.revision,snapshot:photoSnapshot});
  assert.equal(response.status,200);
  assert.equal((await read()).body.control.versions.find(v=>v.status==='draft').snapshot.items.at(-1).mediaItems[0].afterParagraph,1);
  console.log('PASS IPQC-C fixture: seed/idempotency, auth, revision conflict, numbering, direct submit, review/withdraw, FQC isolation, photo placement');
})().catch(error=>{console.error(error);process.exitCode=1;});
