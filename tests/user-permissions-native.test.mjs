import {accessKeys} from '../public/process/access-policy.mjs';
// Real compiled Worker, ephemeral D1/R2 and synthetic accounts only.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import fs from 'node:fs';
import {createRootEntryFixture} from './root-entry-native-fixture.mjs';
const report={status:'RUNNING',cases:[],timings:[],realData:false,realCredentials:false,remoteBindings:false};
const password='Synthetic-account-only-2026',origin='https://users.synthetic.invalid';
const f=await createRootEntryFixture({syntheticBindings:{PROCESS_IMPORT_ENABLED:'0',PROCESS_SESSION_SECRET:randomUUID(),DEMO_LOGIN_ENABLED:'true'}});
const cookies=new Map();
async function call(path,actor,method='GET',body){const start=performance.now();const r=await f.mf.dispatchFetch(origin+path,{method,headers:{Origin:origin,Connection:'close','Content-Type':'application/json',...(cookies.has(actor)?{Cookie:cookies.get(actor)}:{})},...(body?{body:JSON.stringify(body)}:{})});const value=await r.json();report.timings.push({path,method,action:body?.action||null,actor:actor||null,target:body?.id||null,status:r.status,ms:Math.round((performance.now()-start)*10)/10});return {status:r.status,body:value,cookie:r.headers.get('set-cookie')};}
async function sign(id,pw=password,expected=200){const r=await call('/api/platform-login',null,'POST',id==='demo-admin'?{demoRole:'admin'}:{id,password:pw});assert.equal(r.status,expected);if(expected===200)cookies.set(id,r.cookie.split(';')[0]);return r;}
async function get(id='frank'){return call('/api/user-access',id);}
async function post(actor,body,expected=200){const revision=(await get('frank')).body.revision;const r=await call('/api/user-access',actor,'POST',{baseRevision:revision,...body});assert.equal(r.status,expected,r.body.error);return r.body;}
async function unchanged(name,fn){const before=(await f.db.prepare('SELECT * FROM shared_state').all()).results,backup=await f.db.prepare('SELECT count(*) n FROM state_backups').first();await fn();assert.deepEqual((await f.db.prepare('SELECT * FROM shared_state').all()).results,before);assert.deepEqual(await f.db.prepare('SELECT count(*) n FROM state_backups').first(),backup);report.cases.push(name);}
try{
 const users=[['frank','admin'],['manager','admin'],['staff-one','staff'],['rd-one','rd'],['demo-admin','admin']].map(([id,role])=>({id,name:id==='manager'?'Frank':id,role,enabled:true,inheritRole:true,authEpoch:1,...(id==='demo-admin'?{authMode:'demo'}:{password})}));
 const values={platformUsers:JSON.stringify(users),processCustomRoles:'[]',processRoleTemplateOverrides:'{}',publishedProcess:JSON.stringify({creatorId:'staff-one',history:[{actorId:'staff-one',note:'retain business history'}]})};
 await f.db.prepare('INSERT INTO shared_state(id,revision,"values",updated_at) VALUES(1,1,?,?)').bind(JSON.stringify(values),'synthetic').run();
 for(const u of users)await sign(u.id);
 const projection=await get('staff-one');assert.equal(projection.status,200);assert.deepEqual(projection.body.users.map(u=>u.id),['staff-one']);assert.equal(projection.body.roles.length,0);assert.equal(Object.keys(projection.body.actor.cells).length,accessKeys.length);assert.equal(Object.keys(projection.body.actor.roleCells).length,accessKeys.length);assert(!JSON.stringify(projection).includes(password));report.cases.push('own effective and inherited cells, no peers/templates/password disclosure');
 for(const actor of ['frank','manager','staff-one'])await unchanged(actor+' own password requires old password',async()=>{for(const oldPassword of [undefined,'wrong'])await post(actor,{action:'password',id:actor,oldPassword,password:'Synthetic-next-2026',confirmation:'Synthetic-next-2026'},400);await post(actor,{action:'password',id:actor,oldPassword:password,password:'Synthetic-next-2026',confirmation:'mismatch'},400);});
 await unchanged('primary/peer/self/DEMO and raw API escalation denied',async()=>{
  for(const actor of ['manager','demo-admin','staff-one']){
   for(const action of ['create-role','update-role','delete-role'])await post(actor,{action,id:'custom_denied',name:'Denied',access:{}},403);
   for(const id of ['frank','manager'])for(const body of [{action:'update-user',id,role:'staff'},{action:'password',id,password,confirmation:password},{action:'status-user',id,enabled:false},{action:'delete-user',id}]){if(actor===id&&body.action==='password')continue;await post(actor,body,403);}
  }
  for(const body of [{action:'status-user',id:'frank',enabled:false},{action:'delete-user',id:'frank'},{action:'update-user',id:'frank',role:'staff'},{action:'create-user',id:'elevated',name:'Elevated',role:'admin',password,confirmation:password}])await post(body.action==='create-user'?'manager':'frank',body,403);
  await post('manager',{action:'update-user',id:'staff-one',role:'admin'},403);
  await post('manager',{action:'update-user',id:'staff-one',changes:{'users.edit':true}},403);
  await post('frank',{action:'update-user',id:'staff-one',batch:[{id:'frank'}]},400);
 });
 for(const actor of ['manager','staff-one','frank']){
  const next='Synthetic-next-'+actor+'-2026';const r=await post(actor,{action:'password',id:actor,oldPassword:password,password:next,confirmation:next});assert.equal(r.relogin,true);assert.equal((await get(actor)).status,401);await sign(actor,password,401);await sign(actor,next);report.cases.push(actor+' own password: old login fails, new login succeeds, old session revoked');
 }
 const staffNext='Synthetic-next-staff-one-2026';
 await post('manager',{action:'password',id:'staff-one',password,confirmation:password});assert.equal((await get('staff-one')).status,401);await sign('staff-one',staffNext,401);await sign('staff-one');report.cases.push('manager resets nonadmin without target old password; old session and password rejected');
 await post('manager',{action:'status-user',id:'staff-one',enabled:false});assert.equal((await get('staff-one')).status,401);await sign('staff-one',password,403);await post('manager',{action:'status-user',id:'staff-one',enabled:true});assert.equal((await get('staff-one')).status,401);await sign('staff-one');report.cases.push('disable rejects login/session; reenable requires new login');
 await post('frank',{action:'update-user',id:'manager',changes:{'bom.exchange':false}});await sign('manager','Synthetic-next-manager-2026');
 await unchanged('ordinary admin grant ceiling, including inherit/reset and role assignment',async()=>{for(const change of [true,null,false])await post('manager',{action:'update-user',id:'rd-one',changes:{'bom.exchange':change}},403);await post('manager',{action:'update-user',id:'rd-one',role:'staff'},403);await post('manager',{action:'update-user',id:'manager',changes:{'bom.exchange':true}},403);});
 await post('frank',{action:'create-role',id:'custom_usersqa',name:'Users QA',access:{'bom.view':true,'bom.edit':true}});await post('frank',{action:'update-user',id:'rd-one',role:'custom_usersqa'});assert.equal((await get('rd-one')).status,401);await sign('rd-one');assert.equal((await get('rd-one')).body.actor.cells['bom.edit'],true);
 await post('frank',{action:'update-role',id:'custom_usersqa',name:'Users QA',access:{'bom.edit':false}});assert.equal((await get('rd-one')).status,401);await sign('rd-one');assert.equal((await get('rd-one')).body.actor.cells['bom.edit'],false);
 const denied=await call('/api/bom/workflow','rd-one','POST',{action:'begin'});assert.equal(denied.status,403);report.cases.push('role assignment/revocation persists and rejects old session/direct BOM mutation');
 await post('frank',{action:'update-user',id:'rd-one',changes:{'bom.edit':true}});await sign('rd-one');assert.equal((await get('rd-one')).body.actor.cells['bom.edit'],true);await post('frank',{action:'update-user',id:'rd-one',changes:{'bom.edit':null}});await sign('rd-one');assert.equal((await get('rd-one')).body.actor.cells['bom.edit'],false);report.cases.push('individual override and reset inherit persisted role cells');
 await post('frank',{action:'delete-role',id:'custom_usersqa'},400);
 await post('manager',{action:'delete-user',id:'staff-one'});assert.equal((await get('staff-one')).status,401);await sign('staff-one',password,404);const history=await f.db.prepare('SELECT "values" v FROM shared_state').first();assert.equal(JSON.parse(history.v).publishedProcess,values.publishedProcess);assert.equal((await get()).body.users.some(u=>u.id==='staff-one'),false);await post('frank',{action:'create-user',id:'staff-one',name:'Reuse',role:'staff',password,confirmation:password},400);report.cases.push('logical deletion retains business history and prevents ID reuse/login');
 await post('frank',{action:'update-user',id:'rd-one',role:'rd'});await post('frank',{action:'delete-role',id:'custom_usersqa'});assert(!(await get()).body.roles.some(r=>r.id==='custom_usersqa'));report.cases.push('assigned role deletion refused, unassigned role deletion succeeds');
 const stale=(await get()).body.revision;await post('frank',{action:'update-user',id:'rd-one',name:'Synthetic changed'});await unchanged('stale revision and generic bypass create no writes',async()=>{await post('frank',{action:'update-user',id:'rd-one',name:'Stale',baseRevision:stale},409);assert.equal((await call('/api/users','frank','POST',{action:'update',id:'frank',role:'staff'})).status,410);assert.equal((await call('/api/shared-state','frank','POST',{baseRevision:(await get()).body.revision,updates:{platformUsers:'[]'}})).status,403);});
 report.status='PASS_COMPILED_USER_PERMISSIONS';
}catch(error){report.status='FAIL_COMPILED_USER_PERMISSIONS';report.failure={type:error.constructor.name,message:error.message,stack:error.stack};process.exitCode=1;}finally{await f.close();report.disposed=true;if(process.env.USER_PERMISSIONS_REPORT)fs.writeFileSync(process.env.USER_PERMISSIONS_REPORT,JSON.stringify(report,null,2));console.log(JSON.stringify({...report,timings:report.timings.length}));}
