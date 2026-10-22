import __fixtureImport0 from "node:fs";
import __fixtureImport1 from "node:path";
import __fixtureImport2 from "node:vm";
import __fixtureImport3 from "node:assert/strict";
import __fixtureImport4 from "typescript";
import __fixtureImport5 from "node:sqlite";
import {createRequire as __createFixtureRequire} from 'node:module';
const __fixtureModuleLoader=__createFixtureRequire(import.meta.url);
process.chdir(process.env.ACTUAL_SOURCE || process.cwd());
const fs=__fixtureImport0,path=__fixtureImport1,vm=__fixtureImport2,assert=__fixtureImport3,ts=__fixtureImport4;
const {DatabaseSync}=__fixtureImport5;
const db=new DatabaseSync(':memory:');
db.exec('CREATE TABLE shared_state(id INTEGER PRIMARY KEY,revision INTEGER,"values" TEXT,updated_at TEXT); CREATE TABLE state_backups(id TEXT PRIMARY KEY,revision INTEGER,"values" TEXT,reason TEXT,actor TEXT,created_at TEXT)');
const objects=new Map();
const env={DEMO_LOGIN_ENABLED:'true',PROCESS_SESSION_SECRET:crypto.randomUUID(),PROCESS_RELEASE_TOKEN:crypto.randomUUID(),STATE_ARCHIVE:{async put(k,v){objects.set(k,v);},async get(k){return objects.has(k)?{text:async()=>Buffer.from(objects.get(k)).toString(),arrayBuffer:async()=>Uint8Array.from(Buffer.from(objects.get(k))).buffer}:null;}},DB:{prepare(sql){let args=[];return{bind(...v){args=v;return this;},async run(){const r=db.prepare(sql).run(...args);return{meta:{changes:Number(r.changes)}};},async first(){return db.prepare(sql).get(...args)||null;},async all(){return{results:db.prepare(sql).all(...args)};}};},async batch(statements){db.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.run());db.exec('COMMIT');return results;}catch(e){db.exec('ROLLBACK');throw e;}}}};
const seed={revision:1,values:{platformUsers:JSON.stringify(['admin','rd','staff'].map(role=>({id:'demo-'+role,name:'Demo '+role,role,authMode:'demo',enabled:true})).concat([{id:'admin',name:'Fixture Admin',role:'admin',password:crypto.randomUUID(),enabled:true}])),masterDataControl:'{"active":{},"versions":[]}',approvalVersions:'[]',dispatchBoard:'{}'}};
let randomCalls=0;
db.prepare('INSERT INTO shared_state(id,revision,"values",updated_at) VALUES(1,?,?,?)').run(seed.revision,JSON.stringify(seed.values),'fixture');
const workerCrypto={subtle:crypto.subtle,randomUUID(){randomCalls++;return crypto.randomUUID();}};

function productionLoader(runtimeCrypto=crypto){
 const cache=new Map();
 function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file);const mod={exports:{}};cache.set(file,mod.exports);
 const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 vm.runInNewContext(js,{module:mod,exports:mod.exports,require(id){if(id==='cloudflare:workers')return{env};if(id.startsWith('node:'))return __fixtureModuleLoader(id);const target=id.startsWith('@/')?path.resolve(id.slice(2)):path.resolve(path.dirname(file),id);if(target.endsWith('.json'))return JSON.parse(fs.readFileSync(target,'utf8'));if(target.endsWith('.mjs'))return __fixtureModuleLoader(target);return load(target.endsWith('.ts')?target:target+'.ts')},Request,Response,Headers,ReadableStream,URL,crypto:runtimeCrypto,TextEncoder,TextDecoder,atob,btoa,structuredClone,console,Date});
 cache.set(file,mod.exports);return mod.exports;
 }return load;
}

const loader=()=>productionLoader(workerCrypto);

const load=loader(),login=load('app/api/platform-login/route.ts'),core=load('lib/process-state.ts'),release=load('app/api/release-state/route.ts'),backups=load('app/api/backups/route.ts');
assert.equal(randomCalls,0,'Worker module initialization cannot generate random values');
const origin='https://example.test';
const req=(body,headers={})=>new Request(origin+'/api/test',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
(async()=>{
 const response=await login.POST(req({demoRole:'admin'}));assert.equal(response.status,200);const cookie=response.headers.get('set-cookie');assert.match(cookie,/HttpOnly/);assert.match(cookie,/Secure/);assert.match(cookie,/SameSite=Strict/);const loginBody=await response.json();const noSecrets=value=>{if(!value||typeof value!=='object')return;for(const [key,child]of Object.entries(value)){assert.ok(!['password','passwordHash'].includes(key),'public reply contains credential field');noSecrets(child)}};noSecrets(loginBody);assert.ok(!JSON.stringify(loginBody).includes(JSON.parse(seed.values.platformUsers).find(u=>u.id==='admin').password));
 const readRequest=new Request(origin,{headers:{Cookie:cookie.split(';')[0]}});
 assert.equal((await core.identity(readRequest,await core.readState())).role,'admin');
 const fresh=loader()('lib/process-state.ts');assert.equal((await fresh.identity(readRequest,await fresh.readState())).role,'admin','session survives a new Worker instance');
 assert.equal(await fresh.demoSession(new Request(origin,{headers:{Cookie:cookie.split(';')[0]+'x'}})),null);
 env.DEMO_LOGIN_ENABLED='false';assert.equal(await fresh.demoSession(readRequest),null);assert.equal((await login.POST(req({demoRole:'admin'}))).status,403);env.DEMO_LOGIN_ENABLED='true';
 assert.equal((await login.POST(req({demoRole:'admin'},{Origin:'https://attacker.test'}))).status,403);
 for(const role of ['rd','staff'])assert.equal((await login.POST(req({demoRole:role}))).status,200);
 assert.equal((await release.GET(readRequest)).status,403,'demo ADMIN cannot export credential-bearing release snapshots');
 const releaseHeaders={'X-Process-Release-Token':env.PROCESS_RELEASE_TOKEN};
 env.PROCESS_RELEASE_DISABLED='true';assert.equal((await release.GET(new Request(origin,{headers:releaseHeaders}))).status,403,'closed release access rejects even the former valid credential');env.PROCESS_RELEASE_DISABLED='false';
 const rejectedState=db.prepare('SELECT revision,"values" FROM shared_state WHERE id=1').get(),rejectedBackups=db.prepare('SELECT COUNT(*) AS count FROM state_backups').get().count,rejectedObjects=objects.size;
 for(const invalid of [null,[],42,'text',{action:'capture',values:[]},{action:'capture',values:{dispatchBoard:7}},{action:'capture',values:{dispatchBoard:'invalid JSON'}}]) {
  assert.equal((await release.POST(req(invalid,releaseHeaders))).status,400,'Invalid release boundary must fail before any writes');
  assert.deepEqual(db.prepare('SELECT revision,"values" FROM shared_state WHERE id=1').get(),rejectedState);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM state_backups').get().count,rejectedBackups);
  assert.equal(objects.size,rejectedObjects);
 }
 assert.equal((await release.POST(req(null,{'X-Process-Release-Token':'invalid-fixture-token'}))).status,403,'Unauthorized release rejected before body validation');
 
 const values={...seed.values,'processEditor:large:A':JSON.stringify({media:'data:image/webp;base64,'+'A'.repeat(3*1024*1024)})};
 const imported=await release.POST(req({action:'replace',values,baseRevision:1,confirm:'REPLACE_WITH_LOCAL_SNAPSHOT'},releaseHeaders));assert.equal(imported.status,200);const ids=await imported.json();
 const stored=db.prepare('SELECT "values" FROM shared_state WHERE id=1').get().values;assert.ok(stored.length<10000);assert.ok(objects.size>0);assert.deepEqual(JSON.parse(JSON.stringify((await core.readState()).values)),values);
 const restore=await backups.POST(req({action:'restore',id:ids.oldBackupId,confirm:ids.oldBackupId,baseRevision:2},{Cookie:cookie.split(';')[0]}));assert.equal(restore.status,200);assert.ok(!(await core.readState()).values['processEditor:large:A']);
 assert.equal((await backups.POST(req({action:'restore',id:ids.newBackupId,confirm:ids.newBackupId,baseRevision:3},{Cookie:cookie.split(';')[0]}))).status,200);assert.equal((await core.readState()).values['processEditor:large:A'],values['processEditor:large:A']);
 assert.equal((await release.POST(req({action:'replace',values,baseRevision:1,confirm:'REPLACE_WITH_LOCAL_SNAPSHOT'},releaseHeaders))).status,409);
 const key=[...objects.keys()][0],old=objects.get(key);objects.set(key,'tampered');await assert.rejects(()=>core.readState(),/integrity/);objects.set(key,old);
 const publicReply=core.publicState(await core.readState());noSecrets(publicReply);assert.ok(!JSON.stringify(publicReply).includes(JSON.parse(seed.values.platformUsers).find(u=>u.id==='admin').password));
 console.log('PASS: cloud demo roles, durable signed cookies, tamper/CSRF/maintenance access, >3 MB D1/R2 snapshot, exact round-trip, old/new backups, restore, CAS conflict and integrity checks');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>db.close());
