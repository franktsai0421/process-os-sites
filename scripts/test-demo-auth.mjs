import __fixtureImport0 from "node:fs";
import __fixtureImport1 from "node:path";
import __fixtureImport2 from "node:vm";
import __fixtureImport3 from "node:assert/strict";
import __fixtureImport4 from "typescript";
import __fixtureImport5 from "node:sqlite";
import __fixtureImport6 from "node:crypto";
import __fixtureImport7 from "node:module";
import {createRequire as __createFixtureRequire} from 'node:module';
import {fileURLToPath as __urlToFixturePath} from 'node:url';
import __interopPath from 'node:path';
const __filename=__urlToFixturePath(new URL("./test-demo-auth.cjs",import.meta.url));
const __dirname=__interopPath.dirname(__filename);
const __fixtureModuleLoader=__createFixtureRequire(__filename);
const fs=__fixtureImport0,path=__fixtureImport1,vm=__fixtureImport2;
const assert=__fixtureImport3,ts=__fixtureImport4;
const { DatabaseSync }=__fixtureImport5;
const { randomBytes, webcrypto, createHmac }=__fixtureImport6;
const { isBuiltin }=__fixtureImport7;
const db = new DatabaseSync(':memory:');
for (const file of fs.readdirSync('drizzle').filter(n => n.endsWith('.sql')).sort()) db.exec(fs.readFileSync(path.join('drizzle', file), 'utf8'));
const env = { PROCESS_SESSION_SECRET: randomBytes(48).toString('hex'), DB: { prepare(sql) {
  let args = []; return { bind(...values) { args = values; return this; },
    async run() { return { meta: { changes: Number(db.prepare(sql).run(...args).changes) } }; },
    async first() { return db.prepare(sql).get(...args) || null; },
    async all() { return { results: db.prepare(sql).all(...args) }; } };
} } };
const seed = JSON.parse(fs.readFileSync(__fixtureModuleLoader('node:path').join(__dirname,'..','db','seed.json'), 'utf8')), cache = new Map();
let fixtureClock = null;
class FixtureDate extends Date {
  constructor(...args) { super(...(args.length ? args : [fixtureClock ?? Date.now()])); }
  static now() { return fixtureClock ?? Date.now(); }
}
db.prepare('INSERT INTO shared_state (id,revision,"values",updated_at) VALUES (1,?,?,?)').run(seed.revision,JSON.stringify(seed.values),'fixture');
function load(file) {
  file = path.resolve(file); if (cache.has(file)) return cache.get(file);
  const workflowModule = { exports: {} }; cache.set(file, workflowModule.exports);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const localRequire = id => {
    if (id === 'cloudflare:workers') return { env };
    if (id === '@/db/seed.json') return seed;
    if (isBuiltin(id)) return __fixtureModuleLoader(id);
    const target = id.startsWith('@/') ? path.resolve(id.slice(2)) : path.resolve(path.dirname(file), id);
    if (target.endsWith('.mjs')) return __fixtureModuleLoader(target);
    return load(target.endsWith('.ts') ? target : target + '.ts');
  };
  vm.runInNewContext(code, { module: workflowModule, exports: workflowModule.exports, require: localRequire,
    Request, Response, URL, crypto: webcrypto, Date: FixtureDate, TextEncoder, atob, btoa });
  cache.set(file, workflowModule.exports); return workflowModule.exports;
}
const state = load('lib/process-state.ts'), access = load('lib/user-access.ts');
const login = load('app/api/platform-login/route.ts'), usersApi = load('app/api/user-access/route.ts');
const retiredUsersApi = load('app/api/users/route.ts');
const shared = load('app/api/shared-state/route.ts'), backups = load('app/api/backups/route.ts');
const request = (body, cookie = '', url = 'https://example.test/api/platform-login') => new Request(url, {
  method: 'POST', headers: { Origin: new URL(url).origin, 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify(body) });
function inspect(value) {
  if (typeof value === 'string') { try { inspect(JSON.parse(value)); } catch (e) { if (e instanceof assert.AssertionError) throw e; } }
  else if (Array.isArray(value)) value.forEach(inspect);
  else if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) {
    assert.ok(!/^(password|passwordHash)$/i.test(key), 'seed contains a credential field'); inspect(child);
  }
}
(async () => {
  inspect(seed); let current = await state.readState();
  const demoUsers = JSON.parse(current.values.platformUsers);
  assert.equal(demoUsers.length, 3); assert.ok(!demoUsers.some(u => u.id === 'admin'));
  for (const flag of [undefined, 'true']) {
    if (flag === undefined) delete env.DEMO_LOGIN_ENABLED; else env.DEMO_LOGIN_ENABLED = flag;
    for (const role of ['admin', 'rd', 'staff']) {
      const response = await login.POST(request({ demoRole: role })); assert.equal(response.status, 200);
      const result = await response.json(), cookie = response.headers.get('set-cookie').split(';')[0];
      assert.equal(result.user.id, 'demo-' + role); assert.equal(result.user.authMode, 'demo'); assert.equal(result.user.sessionType, 'demo');
      const expected = access.effectiveAccess(demoUsers.find(u => u.role === role), current.values);
      for (const key of ['lines', 'views', 'permissions']) assert.equal(JSON.stringify(result.user[key]), JSON.stringify(expected[key]));
      const payload = JSON.parse(atob(cookie.split('=')[1].split('.')[0]));
      assert.equal(payload.sessionType, 'demo'); assert.ok(payload.expires > Date.now()); assert.ok(!('password' in payload));
      const signed = new Request('https://example.test/api/shared-state', { headers: { Cookie: cookie } });
      assert.equal((await state.identity(signed, current)).role, role);
      assert.equal(await state.can(signed, current, 'approval.approve'), role !== 'staff');
      assert.equal(await state.can(signed, current, 'view:dispatch'), role === 'admin');
      const tampered = new Request(signed.url, { headers: { Cookie: cookie.slice(0, -1) + (cookie.endsWith('a') ? 'b' : 'a') } });
      assert.equal(await state.identity(tampered, current), null);
      for (const patch of [{ enabled: false }, { deletedAt: 'fixture' }, { authMode: 'platform' }, { role: 'custom' }]) {
        const invalid = { ...current, values: { ...current.values, platformUsers: JSON.stringify(demoUsers.map(u => u.role === role ? { ...u, ...patch } : u)) } };
        assert.equal(await state.identity(signed, invalid), null);
      }
      env.DEMO_LOGIN_ENABLED = 'false';
      assert.equal(await state.identity(signed, current), null);
      assert.equal((await login.POST(request({ demoRole: role }))).status, 403);
      assert.equal((await shared.POST(request({ updates: {}, baseRevision: current.revision }, cookie, signed.url))).status, 401);
      assert.equal((await usersApi.POST(request({ action: 'update-user', id: 'demo-rd', baseRevision: current.revision }, cookie, 'https://example.test/api/user-access'))).status, 401);
      const retired = await retiredUsersApi.POST(request({ action: 'update', id: 'demo-rd', baseRevision: current.revision }, cookie, 'https://example.test/api/users'));
      assert.equal(retired.status, 410);
      assert.equal((await retired.json()).error, 'ACCOUNT_API_REQUIRED');
      assert.equal((await backups.GET(new Request('https://example.test/api/backups', { headers: { Cookie: cookie } }))).status, 403);
      if (flag === undefined) delete env.DEMO_LOGIN_ENABLED; else env.DEMO_LOGIN_ENABLED = flag;
    }
  }
  for (const body of [null, [], 42, "text", { demoRole: 'custom' }, { demoRole: 'ADMIN' }, { demoRole: 'admin', id: 'other' }, { demoRole: 'admin', permissions: ['master.delete'] }, { demoRole: 'staff', lines: ['B'] }, { demoRole: 'staff', role: 'admin' }])
    assert.equal((await login.POST(request(body))).status, 400);
  const signedRequest = value => {
    const payload = btoa(JSON.stringify(value));
    const token = payload + '.' + createHmac('sha256', env.PROCESS_SESSION_SECRET).update(payload).digest('hex');
    return new Request('https://example.test', { headers: { Cookie: 'process_demo=' + token } });
  };
  for (const value of [{version:2,id:'demo-admin',sessionType:'demo',expires:Date.now()-1},
    {id:'demo-admin',demo:true,expires:Date.now()+10000},
    {version:2,id:'other',sessionType:'demo',expires:Date.now()+10000}])
    assert.equal(await state.identity(signedRequest(value), current), null);
  const formal = { ...current, values: { ...current.values, platformUsers: JSON.stringify([{id:'formal-fixture',name:'Formal Fixture',role:'rd',enabled:true}]) } };
  env.DEMO_LOGIN_ENABLED = 'false';
  assert.equal((await state.identity(signedRequest({id:'formal-fixture',demo:false,expires:Date.now()+10000}), formal)).role, 'rd');
  delete env.DEMO_LOGIN_ENABLED;
  const adminResponse = await login.POST(request({demoRole:'admin'}));
  const adminCookie = adminResponse.headers.get('set-cookie').split(';')[0];
  const beforeReset = db.prepare('SELECT revision,"values" FROM shared_state WHERE id=1').get();
  const password = randomBytes(16).toString('hex');
  const reset = await usersApi.POST(request({action:'password',id:'demo-rd',password,confirmation:password,baseRevision:current.revision},adminCookie,'https://example.test/api/user-access'));
  assert.equal(reset.status,403);
  assert.equal((await reset.json()).error,'FORBIDDEN');
  assert.deepEqual(db.prepare('SELECT revision,"values" FROM shared_state WHERE id=1').get(),beforeReset,'Demo identity/password rejection must not alter accounts');
  const cross = request({ demoRole: 'admin' }); const crossed = new Request(cross, { headers: { Origin: 'https://other.test' } });
  assert.equal((await login.POST(crossed)).status, 403);
  // Actual GET/identity/HMAC handlers, isolated memory records only. Neither the
  // configured public date nor production identity/permission logic is changed.
  const originalRow = db.prepare('SELECT revision,"values" FROM shared_state WHERE id=1').get(), normalChecks = [];
  const fixturePassword = 'Synthetic-normal-read-only-2026', normalUsers = await Promise.all(['staff','rd','admin'].map(async role => ({id:'formal-'+role,name:'Synthetic '+role,email:role+'@fixture.invalid',role,enabled:true,authEpoch:0,inheritRole:true,passwordHash:await load('lib/passwords.ts').passwordHash(fixturePassword)})));
  const normalValues = {...current.values,platformUsers:JSON.stringify([...demoUsers,...normalUsers]),processRoleTemplateOverrides:'{}',processCustomRoles:'[]'};
  const writeUsers = async (users = [...demoUsers,...normalUsers]) => db.prepare('UPDATE shared_state SET "values"=? WHERE id=1').run(await state.encodeValues({...normalValues,platformUsers:JSON.stringify(users)}));
  const sharedRequest = (headers = {}) => new Request('https://example.test/api/shared-state',{headers});
  const read = headers => shared.GET(sharedRequest(headers)), cookieFor = async id => {const response=await login.POST(request({id,password:fixturePassword}));assert.equal(response.status,200);return response.headers.get('set-cookie').split(';')[0];};
  const denied = async headers => {const response=await read(headers);assert.equal(response.status,403);assert.equal((await response.json()).error,'公開檢視期限已結束');};
  const demoCookies = [];for(const role of ['admin','rd','staff']){const response=await login.POST(request({demoRole:role}));assert.equal(response.status,200);demoCookies.push(response.headers.get('set-cookie').split(';')[0]);}
  try {
    await writeUsers();env.DEMO_LOGIN_ENABLED='false';
    const cookies={};for(const role of ['staff','rd','admin'])cookies[role]=await cookieFor('formal-'+role);
    for(const role of ['staff','rd']){const before=db.prepare('SELECT revision,"values" FROM shared_state WHERE id=1').get(),response=await read({Cookie:cookies[role]});assert.equal(response.status,200);const body=await response.json();assert.equal(body.identity.id,'formal-'+role);assert.equal(body.identity.sessionType,'platform');assert.deepEqual(JSON.parse(body.values.platformUsers).map(user=>user.id),['formal-'+role]);assert(!JSON.stringify(body).includes(fixturePassword));assert(!JSON.stringify(body).includes('scrypt$'));assert.deepEqual(db.prepare('SELECT revision,"values" FROM shared_state WHERE id=1').get(),before);normalChecks.push('normal '+role+' platform cookie hydrates sanitized own projection');}
    assert.equal((await read({Cookie:cookies.admin})).status,200);assert.equal((await read({'X-Process-Admin-Id':'formal-admin','X-Process-Admin-Password':fixturePassword})).status,200);normalChecks.push('existing ADMIN cookie and credential-header channel retained');
    await denied({});normalChecks.push('expired anonymous remains403');
    for(const cookie of demoCookies)await denied({Cookie:cookie});normalChecks.push('DEMOoff rejects all three old signed demo cookies');
    for(const patch of [{enabled:false},{deletedAt:'fixture'},{authEpoch:1}]){await writeUsers([...demoUsers,...normalUsers.map(user=>user.role==='staff'?{...user,...patch}:user)]);await denied({Cookie:cookies.staff});normalChecks.push('old normal cookie denied after '+Object.keys(patch)[0]);}await writeUsers();
    env.PROCESS_SESSION_REVOCATION_ENABLED='1';await state.clearDemoSession(sharedRequest({Cookie:cookies.staff}));await denied({Cookie:cookies.staff});delete env.PROCESS_SESSION_REVOCATION_ENABLED;normalChecks.push('persistently revoked normal cookie denied');
    const wrong=cookies.staff.slice(0,-1)+(cookies.staff.endsWith('a')?'b':'a');await denied({Cookie:wrong});
    const expired=signedRequest({version:2,id:'formal-staff',sessionType:'platform',authEpoch:0,expires:Date.now()-1});await denied({Cookie:expired.headers.get('cookie')});normalChecks.push('tampered or expired platform cookie denied');
    await denied({'X-Process-Session-Type':'platform','X-Process-Role':'staff'});normalChecks.push('forged sessionType header denied');
    const oai={'oai-authenticated-user-id':'synthetic-provider','oai-authenticated-user-email':'staff@fixture.invalid'};assert.equal((await state.identity(sharedRequest(oai),await state.readState())).role,'staff');await denied(oai);normalChecks.push('ordinary OAI identity without platform session stays denied');
    const credentialOnly={'X-Process-Admin-Id':'formal-staff','X-Process-Admin-Password':fixturePassword};assert.equal((await state.identity(sharedRequest(credentialOnly),await state.readState())).role,'staff');await denied(credentialOnly);normalChecks.push('correct credential-header-only STAFF stays denied');
    await denied({'X-Process-Admin-Id':'formal-staff','X-Process-Admin-Password':'incorrect-synthetic','X-Process-Role':'admin'});normalChecks.push('forged credential/role headers denied');
    const fakePlatform=signedRequest({version:2,id:'demo-staff',sessionType:'platform',authEpoch:0,expires:Date.now()+10000});await denied({Cookie:fakePlatform.headers.get('cookie')});normalChecks.push('platform-session type cannot reclassify stored DEMO user');
    env.DEMO_LOGIN_ENABLED='true';assert.equal((await read({})).status,200);assert.equal((await read({Cookie:demoCookies[2]})).status,200);env.DEMO_LOGIN_ENABLED='false';normalChecks.push('DEMOon original public and demo read behavior retained');
    const configuredPublicUntil=state.publicUntil;fixtureClock=configuredPublicUntil-1;assert.equal((await read({})).status,200);fixtureClock=null;assert.equal(state.publicUntil,configuredPublicUntil);normalChecks.push('original pre-expiry public behavior/date retained with fixture clock');
    const before=db.prepare('SELECT revision,"values" FROM shared_state WHERE id=1').get(),staffRequest=sharedRequest({Cookie:cookies.staff});assert.equal(await state.can(staffRequest,await state.readState(),'editor.approve'),false);assert.equal(await state.can(staffRequest,await state.readState(),'tooling.delete'),false);
    assert.equal((await usersApi.POST(request({action:'update-user',id:'formal-rd',name:'Forbidden synthetic edit',baseRevision:current.revision},cookies.staff,'https://example.test/api/user-access'))).status,403);
    assert.equal((await shared.POST(request({updates:{dispatchBoard:'{}'},baseRevision:current.revision-1},cookies.admin,'https://example.test/api/shared-state'))).status,409);assert.deepEqual(db.prepare('SELECT revision,"values" FROM shared_state WHERE id=1').get(),before);normalChecks.push('module rights/protected account denial/stale POST CAS and stored values unchanged');
    assert.equal(normalChecks.length,18);console.log(JSON.stringify({format:'NORMAL_PLATFORM_SHARED_READ_ACTUAL_MEMORY_CASES_V1',status:'PASS',checks:normalChecks,networkRequests:0,SDK:false,publicUntilChanged:false,qualification:'Actual in-memory production handlers/HMAC sessions; live API status uncaptured and normal GUI acceptance separate'}));
  } finally {fixtureClock=null;delete env.PROCESS_SESSION_REVOCATION_ENABLED;delete env.DEMO_LOGIN_ENABLED;db.prepare('UPDATE shared_state SET revision=?,"values"=? WHERE id=1').run(originalRow.revision,originalRow.values);}
  db.prepare('UPDATE shared_state SET "values"=? WHERE id=1').run(JSON.stringify({ ...seed.values, platformUsers: '[]' }));
  current = await state.readState(); assert.equal(current.values.platformUsers, '[]', 'readState silently inserted an administrator');
  assert.equal((await login.POST(request({ demoRole: 'admin' }))).status, 403);
  db.exec('DELETE FROM shared_state');
  await assert.rejects(()=>state.readState(),/explicit initialization/);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM shared_state').get().count,0);
  console.log('PASS: demo flags, signed sessions, revocation, fixed identities, existing role rules, protected APIs, seed and readState');
})().catch(error => { console.error('FAIL: isolated demo authentication check (sensitive details suppressed)'); console.error(JSON.stringify({name:error.name,code:error.code||null,frames:String(error.stack||'').split('\n').filter(line=>/^\s*at /.test(line)).slice(0,4)})); process.exitCode = 1; }).finally(() => db.close());
