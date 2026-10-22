/* oxlint-disable typescript/no-require-imports -- real handlers loaded by the existing isolated CommonJS harness; no business writes. */
const assert=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite'),{randomUUID,createHmac}=require('node:crypto'),adapter=require('./ipqc-isolated-auth.cjs');
const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE shared_state(id INTEGER PRIMARY KEY,revision INTEGER,"values" TEXT,updated_at TEXT)');
const env={PROCESS_SESSION_SECRET:randomUUID(),DB:{prepare(sql){let args=[];return{bind(...a){args=a;return this;},async first(){return db.prepare(sql).get(...args)||null;},async run(){return{meta:{changes:Number(db.prepare(sql).run(...args).changes)}};}};}}};
const load=require('./ipqc-ab-import-harness.cjs')(env),core=load('lib/process-state.ts'),login=load('app/api/platform-login/route.ts'),{createDemoUsers}=require('../lib/demo-identities.mjs'),{roleDefaults}=load('lib/user-access.ts');
const password=randomUUID(),users=[...createDemoUsers(roleDefaults),{id:'formal-admin',name:'Test admin',role:'admin',enabled:true,password},{id:'formal-staff',name:'Test employee',role:'staff',enabled:true,password}];
const values={platformUsers:JSON.stringify(users)},results=[];db.prepare('INSERT INTO shared_state VALUES(1,1,?,?)').run(JSON.stringify(values),'isolated');
const origin='http://localhost:3020',sessions={a:{Cookie:'process_demo=fixture-employee'}},headers=cookie=>adapter.requestHeaders({Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},sessions);
async function post(body,cookie){return login.POST(new Request(origin+'/api/platform-login',{method:'POST',headers:headers(cookie),body:JSON.stringify(body)}));}
async function who(cookie){return core.identity(new Request(origin+'/api/shared-state',{headers:headers(cookie)}),await core.readState());}
function pass(name){results.push({name,status:'PASS'});}
(async()=>{
 assert.equal(await who(),null);pass('Anonymous remains anonymous; no automatic employee injection');
 for(const body of [{demoRole:'admin'},{demoRole:'staff'},{demoRole:'rd'},{id:'formal-admin',password},{id:'formal-staff',password}]){
  const response=await post(body,'ipqc_fixture_session=old-fixture'),data=await response.json();assert.equal(response.status,200,JSON.stringify(data));const cookie=response.headers.get('set-cookie').split(';')[0],id=body.id||'demo-'+body.demoRole;
  assert.equal((await who(cookie+'; ipqc_fixture_session=stale')).id,id);assert.equal((await who(cookie)).id,id);assert.ok(adapter.responseHeaders(response,'/api/platform-login')['set-cookie'].some(v=>v.startsWith('ipqc_fixture_session=;')));
  const state=await core.readState(),request=new Request(origin,{headers:headers(cookie)});assert.equal(await core.can(request,state,'approval.approve'),body.demoRole==='staff'||body.id==='formal-staff'?false:true);
  const logout=await post({action:'logout'},cookie);assert.equal(logout.status,200);assert.match(logout.headers.get('set-cookie'),/process_demo=;.*Max-Age=0/);assert.equal(await who(),null);assert.equal((await post(body)).status,200);pass(id+' normal login, identity, permissions, refresh, browser-cookie logout, relogin');
 }
 const payload=btoa(JSON.stringify({version:2,id:'demo-admin',sessionType:'demo',expires:Date.now()-1000})),expired=payload+'.'+createHmac('sha256',env.PROCESS_SESSION_SECRET).update(payload).digest('hex');assert.equal(await who('process_demo='+expired),null);pass('Expired signed login rejected');
 assert.equal((await post({id:'formal-admin',password:'wrong'})).status,401);const cross=await login.POST(new Request(origin+'/api/platform-login',{method:'POST',headers:{Origin:'http://other.invalid','Content-Type':'application/json'},body:JSON.stringify({demoRole:'admin'})}));assert.equal(cross.status,403);pass('Wrong password and cross-origin login rejected');
 assert.equal(adapter.requestHeaders({'x-fixture-user':'a'},sessions).get('cookie'),'process_demo=fixture-employee');assert.throws(()=>adapter.requestHeaders({'x-fixture-user':'unknown'},sessions));pass('Explicit isolated test header remains opt-in');
 assert.equal(db.prepare('SELECT "values" FROM shared_state').get().values,JSON.stringify(values));pass('Login does not modify user records or business state');
 console.log(JSON.stringify({result:'PASS',results},null,2));db.close();
})().catch(e=>{console.error(e);process.exitCode=1;});
