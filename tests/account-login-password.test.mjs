// Actual auth/account handlers and crypto; owned in-memory SQLite/R2 only.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);

void test('login and password setup preserve authority and provide secret-free failures', async t=>{
 const db=new DatabaseSync(':memory:'),objects=new Map(),warnings=[];
 for(const name of fs.readdirSync('drizzle').filter(n=>n.endsWith('.sql')).sort())db.exec(fs.readFileSync('drizzle/'+name,'utf8'));
 let storageDown=false;
 const env={PROCESS_SESSION_SECRET:randomUUID(),DB:{prepare(sql){let args=[];return{
  bind(...values){args=values;return this;},
  async first(){if(storageDown)throw Error('synthetic storage failure');return db.prepare(sql).get(...args)||null;},
  async all(){return{success:true,results:db.prepare(sql).all(...args)};},
  async run(){return{meta:{changes:Number(db.prepare(sql).run(...args).changes)}};}
 };},async batch(statements){return Promise.all(statements.map(s=>s.all()));}},STATE_ARCHIVE:{
  async put(key,value){objects.set(key,Buffer.from(value));},async head(key){return objects.has(key)?{}:null;},
  async get(key){const value=objects.get(key);return value?{text:async()=>value.toString(),arrayBuffer:async()=>value.buffer.slice(value.byteOffset,value.byteOffset+value.byteLength)}:null;}
 }};
 const load=require('../scripts/ipqc-ab-import-harness.cjs')(env),core=load('lib/process-state.ts'),pw=load('lib/passwords.ts'),login=load('app/api/platform-login/route.ts'),api=load('app/api/user-access/route.ts');
 const password='Synthetic-Auth-Only-20261106!',next='Synthetic-Next-Only-20261106!',hash=await pw.passwordHash(password);
 const user=(id,extra={})=>({id,name:'Synthetic '+id,role:'staff',enabled:true,inheritRole:true,authEpoch:1,password,...extra});
 const users=[user('frank',{role:'admin'}),user('manager',{role:'admin'}),user('restricted',{role:'admin',accessOverrides:{'user-password.edit':false}}),user('legacy'),user('hashed',{password:undefined,passwordHash:hash}),user('missing',{password:undefined}),user('invalid',{passwordHash:{synthetic:true}}),user('unsupported',{passwordHash:'unknown$synthetic'}),user('disabled',{enabled:false}),user('deleted',{deletedAt:'synthetic'}),user('no-role',{role:''})];
 const values={platformUsers:JSON.stringify(users),processCustomRoles:'[]',processRoleTemplateOverrides:'{}',processAccessControl:JSON.stringify({schemaVersion:2,primaryAdminId:'frank',audit:[]}),businessFixture:'untouched'};
 db.prepare('INSERT INTO shared_state(id,revision,"values",updated_at) VALUES(1,1,?,?)').run(JSON.stringify(values),'synthetic');
 const origin='https://auth.synthetic.invalid',cookies=new Map();
 const request=(path,body,actor)=>new Request(origin+path,{method:body?'POST':'GET',headers:{Origin:origin,'Content-Type':'application/json',...(cookies.has(actor)?{Cookie:cookies.get(actor)}:{})},...(body?{body:JSON.stringify(body)}:{})});
 async function sign(id,secret=password){db.exec('DELETE FROM process_login_limits');const r=await login.POST(request('/api/platform-login',{id,password:secret}));if(r.ok)cookies.set(id.trim().toLowerCase(),r.headers.get('set-cookie').split(';')[0]);return r;}
 const get=actor=>api.GET(request('/api/user-access',null,actor));
 async function command(actor,body){const state=await core.readState();return api.POST(request('/api/user-access',{baseRevision:state.revision,...body},actor));}
 const snapshot=()=>db.prepare('SELECT * FROM shared_state').get();
 const originalWarn=console.warn;console.warn=value=>warnings.push(JSON.parse(value));
 try{
  await t.test('supported legacy/scrypt roundtrip, wrong password, malformed metadata and no unsafe fallback',async()=>{
   assert.equal(pw.passwordCredentialState({}),'missing');assert.equal(pw.passwordCredentialState({passwordHash:{}}),'invalid');
   assert.equal(pw.passwordCredentialState({passwordHash:'other$synthetic'}),'unsupported');
   for(const record of [{password},{passwordHash:hash}]){assert.equal(await pw.verifyPassword(record,password),true);assert.equal(await pw.verifyPassword(record,next),false);}
   assert.equal(await pw.verifyPassword({password,passwordHash:{synthetic:true}},password),false);
   assert.equal(await pw.verifyPassword({password,passwordHash:'unknown$synthetic'},password),false);
  });
  await t.test('normalization, login read-only and uniform anonymous account failures',async()=>{
   const before=snapshot();for(const id of [' FRANK ','legacy','hashed'])assert.equal((await sign(id)).status,200);
   let uniform;
   for(const id of ['missing','invalid','unsupported','disabled','deleted','no-role','not-found','hashed','legacy']){
    const r=await sign(id,['hashed','legacy'].includes(id)?next:password);assert.equal(r.status,401);assert.equal(r.headers.get('set-cookie'),null);
    const body=await r.json();uniform??=body;assert.deepEqual(body,uniform);assert.equal(body.code,'LOGIN_FAILED');
   }
   assert.deepEqual(snapshot(),before);assert(warnings.some(w=>w.reason==='CREDENTIAL_MISSING'));assert(warnings.some(w=>w.reason==='CREDENTIAL_INVALID'));
  });
  await t.test('state/crypto/signer failures remain closed and contain no raw exception',async()=>{
   storageDown=true;assert.equal((await sign('frank')).status,503);storageDown=false;
   const stored=snapshot();db.prepare('UPDATE shared_state SET "values"=? WHERE id=1').run(JSON.stringify({...values,platformUsers:'{}'}));
   assert.equal((await sign('frank')).status,503);db.prepare('UPDATE shared_state SET "values"=? WHERE id=1').run(stored.values);
   const verify=pw.verifyPassword;pw.verifyPassword=async()=>{throw Error('synthetic private error text');};
   try{assert.equal((await sign('hashed')).status,401);}finally{pw.verifyPassword=verify;}
   const signer=core.demoSession;core.demoSession=async()=>{throw Error('synthetic private signing text');};
   try{assert.equal((await sign('frank')).status,401);}finally{core.demoSession=signer;}
  });
  await t.test('metadata uses existing per-target password rights, never anonymous or ordinary staff',async()=>{
   for(const id of ['frank','manager','restricted','legacy'])assert.equal((await sign(id)).status,200);
   assert.equal((await get()).status,401);
   const primary=await (await get('frank')).json();assert.equal(primary.users.find(u=>u.id==='missing').credentialState,'missing');
   assert.equal(primary.users.find(u=>u.id==='invalid').credentialState,'invalid');
   const staff=await (await get('legacy')).json();assert.equal(staff.users.length,1);assert(!('credentialState' in staff.users[0]));
   const manager=await (await get('manager')).json();assert(!('credentialState' in manager.users.find(u=>u.id==='frank')));
   const restricted=await (await get('restricted')).json();assert(!('credentialState' in restricted.users.find(u=>u.id==='missing')));
   for(const result of [primary,staff,manager,restricted]){const text=JSON.stringify(result);assert(!text.includes(password));assert(!text.includes(hash));assert(!text.includes('passwordHash'));}
  });
  await t.test('no-right and stale-session resets fail without writes',async()=>{
   const before=snapshot();for(const id of ['legacy','restricted'])assert.equal((await command(id,{action:'password',id:'missing',password:next,confirmation:next})).status,403);
   const oldCookie=cookies.get('manager'),state=await core.readState(),modified=JSON.parse(state.values.platformUsers);modified.find(u=>u.id==='manager').authEpoch++;
   db.prepare('UPDATE shared_state SET "values"=? WHERE id=1').run(JSON.stringify({...state.values,platformUsers:JSON.stringify(modified)}));
   const revoked=snapshot();assert.equal((await command('manager',{action:'password',id:'missing',password:next,confirmation:next})).status,401);assert.deepEqual(snapshot(),revoked);
   db.prepare('UPDATE shared_state SET "values"=? WHERE id=1').run(before.values);cookies.set('manager',oldCookie);
  });
  await t.test('strong password validation and prewrite crypto outage permit safe correction',async()=>{
   const before=snapshot();for(const body of [{password:'short',confirmation:'short'},{password:next,confirmation:'mismatch'},{password:[next],confirmation:[next]}])assert.equal((await command('frank',{action:'password',id:'missing',...body})).status,400);
   const create=pw.passwordHash;pw.passwordHash=async()=>{throw Error('PASSWORD_SERVICE_UNAVAILABLE');};
   try{const r=await command('frank',{action:'password',id:'missing',password:next,confirmation:next});assert.equal(r.status,503);assert.equal((await r.json()).error,'PASSWORD_SERVICE_UNAVAILABLE');}finally{pw.passwordHash=create;}
   assert.deepEqual(snapshot(),before);
  });
  await t.test('actual salt and derivation failures return the prewrite contract without user, revision, audit or epoch changes',async()=>{
   const cryptoPort=require('node:crypto');
   for(const port of ['randomBytes','scrypt']){
    const original=cryptoPort[port],before=snapshot(),objectCount=objects.size;
    const priorValues=JSON.parse(before.values),priorUsers=JSON.parse(priorValues.platformUsers);
    const backupCount=db.prepare('SELECT count(*) n FROM state_backups').get().n;
    cryptoPort[port]=()=>{throw Error('synthetic internal crypto failure');};
    try{
     for(const body of [
      {action:'password',id:'missing',password:next,confirmation:next},
      {action:'password',id:'frank',oldPassword:password,password:next,confirmation:next},
      {action:'create-user',id:'synthetic.salt-failure',name:'Synthetic not-created',role:'staff',password:next,confirmation:next}
     ]){
      const response=await command('frank',body);
      assert.equal(response.status,503);
      assert.deepEqual(await response.json(),{error:'PASSWORD_SERVICE_UNAVAILABLE'});
      assert.equal(response.headers.get('set-cookie'),null);
      const after=snapshot(),afterValues=JSON.parse(after.values),afterUsers=JSON.parse(afterValues.platformUsers);
      assert.equal(after.revision,before.revision,'revision unchanged');
      assert.equal(after.values,before.values,'all stored user and audit data unchanged');
      assert.equal(afterValues.processAccessControl,priorValues.processAccessControl,'audit unchanged');
      assert.deepEqual(afterUsers.map(u=>[u.id,u.authEpoch]),priorUsers.map(u=>[u.id,u.authEpoch]),'all session epochs unchanged');
      assert.equal(db.prepare('SELECT count(*) n FROM state_backups').get().n,backupCount);
      assert.equal(objects.size,objectCount,'no R2 publication');
      assert.equal((await get('frank')).status,200,'existing actor session remains valid');
     }
    }finally{cryptoPort[port]=original;}
   }
  });
  await t.test('primary administrator configures a missing synthetic credential; existing session revoked and stale duplicate refused',async()=>{
   const revision=(await core.readState()).revision;
   const r=await command('frank',{action:'password',id:'missing',password:next,confirmation:next});assert.equal(r.status,200);
   const after=snapshot();assert.equal((await sign('missing',next)).status,200);assert.equal((await sign('missing',password)).status,401);
   const duplicate=await api.POST(request('/api/user-access',{action:'password',id:'missing',baseRevision:revision,password:next,confirmation:next},'frank'));assert.equal(duplicate.status,409);assert.deepEqual(snapshot(),after);
   const state=await core.readState();assert.equal(state.values.businessFixture,'untouched');assert(!state.values.processAccessControl.includes(next));assert(!state.values.processAccessControl.includes('passwordHash'));
   assert.equal((await command('frank',{action:'password',id:'hashed',password:next,confirmation:next})).status,200);assert.equal((await get('hashed')).status,401);
   assert.equal((await sign('hashed',next)).status,200);assert.equal((await sign('hashed',password)).status,401);
  });
  await t.test('own password requires current credential and clears previous session',async()=>{
   const before=snapshot();assert.equal((await command('legacy',{action:'password',id:'legacy',oldPassword:'wrong',password:next,confirmation:next})).status,400);assert.deepEqual(snapshot(),before);
   const response=await command('legacy',{action:'password',id:'legacy',oldPassword:password,password:next,confirmation:next});assert.equal(response.status,200);assert.equal((await response.json()).relogin,true);assert(response.headers.get('set-cookie').includes('Max-Age=0'));assert.equal((await get('legacy')).status,401);
  });
  await t.test('throttle remains database-owned and fails closed',async()=>{
   db.exec('DELETE FROM process_login_limits');for(let i=0;i<15;i++)assert.equal((await login.POST(request('/api/platform-login',{id:'not-found',password}))).status,401);
   assert.equal((await login.POST(request('/api/platform-login',{id:'not-found',password}))).status,429);
   db.exec('DROP TABLE process_login_limits');assert.equal((await login.POST(request('/api/platform-login',{id:'frank',password}))).status,503);
  });
  const logs=JSON.stringify(warnings);assert(!logs.includes(password));assert(!logs.includes(hash));assert(!logs.includes('private error'));assert(warnings.every(w=>Object.keys(w).sort().join(',')==='event,reason'));
 }finally{console.warn=originalWarn;db.close();}
});
