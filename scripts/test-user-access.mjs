import __esmImport0 from "node:fs";
import __esmImport1 from "node:path";
import __esmImport2 from "node:assert/strict";
import __esmImport3 from "node:sqlite";
import __esmImport4 from "node:crypto";
import {createRequire as __esmFactory} from 'node:module';
const __esmRequire=__esmFactory(import.meta.url);
/* Actual handlers and production policy, isolated SQLite/R2. Synthetic credentials only. */
const fs=__esmImport0,path=__esmImport1,assert=__esmImport2,{DatabaseSync}=__esmImport3,{randomUUID}=__esmImport4;
const harness=__esmRequire('./ipqc-ab-import-harness.cjs');
(async()=>{
 const db=new DatabaseSync(':memory:'),objects=new Map();for(const file of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())db.exec(fs.readFileSync(path.join('drizzle',file),'utf8'));
 const verifyRetainedBackups=__esmRequire('./automatic-backup-fixture.cjs')(db);
 const env={DEMO_LOGIN_ENABLED:'true',PROCESS_SESSION_SECRET:randomUUID(),DB:{prepare(sql){let args=[];return{bind(...a){args=a;return this;},async first(){return db.prepare(sql).get(...args)||null;},async all(){return{success:true,results:db.prepare(sql).all(...args)};},async run(){return{meta:{changes:Number(db.prepare(sql).run(...args).changes)}};}};},async batch(statements){db.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.all());db.exec('COMMIT');return results;}catch(error){db.exec('ROLLBACK');throw error;}}},STATE_ARCHIVE:{async put(k,v){objects.set(k,Buffer.from(v));},async head(k){return objects.has(k)?{}:null;},async get(k){const b=objects.get(k);return b?{text:async()=>b.toString(),arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),body:new ReadableStream({start(c){c.enqueue(b);c.close();}})}:null;}}};
 const load=harness(env),core=load('lib/process-state.ts'),route=load('app/api/user-access/route.ts'),login=load('app/api/platform-login/route.ts'),pw=load('lib/passwords.ts'),_P=__esmRequire('../public/process/access-policy.mjs');
 const password='Synthetic-Only-2026',users=[['frank','admin'],['manager','admin'],['staff-one','staff'],['rd-one','rd'],['demo-admin','admin'],['demo-rd','rd'],['demo-staff','staff']].map(([id,role])=>({id,name:id,role,enabled:true,inheritRole:true,...(id.startsWith('demo-')?{authMode:'demo'}:{password})}));
 const business={bomFixture:JSON.stringify({unchanged:true}),publishedProcess:JSON.stringify({creatorId:'staff-one',history:[{actorId:'staff-one'}]})};
 const values={platformUsers:JSON.stringify(users),processCustomRoles:'[]',processRoleTemplateOverrides:'{}',...business};
 db.prepare('INSERT INTO shared_state(id,revision,"values",updated_at) VALUES(1,1,?,?)').run(await core.encodeValues(values),'fixture');
 const cookies={};async function sign(id){const r=await login.POST(new Request('http://localhost/api/platform-login',{method:'POST',headers:{Origin:'http://localhost','Content-Type':'application/json'},body:JSON.stringify(id.startsWith('demo-')?{demoRole:id.slice(5)}:{id,password})}));assert.equal(r.status,200,JSON.stringify(await r.clone().json()));cookies[id]=r.headers.get('Set-Cookie').split(';')[0];}
 for(const u of users)await sign(u.id);
 assert.equal((await core.readState()).values.platformUsers,values.platformUsers,'login never rewrites legacy credentials');
 const req=async(method,body,id='frank',endpoint=route,url='/api/user-access')=>{const r=await endpoint[method](new Request('http://localhost'+url,{method,headers:{Origin:'http://localhost',Cookie:cookies[id],'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}));return{status:r.status,body:await r.json()};};
 let count=0;const check=()=>count++;async function command(body,id='frank',expected=200){const state=await core.readState(),r=await req('POST',{baseRevision:state.revision,...body},id);assert.equal(r.status,expected,JSON.stringify(r.body));check();return r.body;}
 const initial=await req('GET');assert.equal(initial.body.users.length,4);assert.equal(initial.body.roles.find(r=>r.id==='admin').formalCount,2);assert.equal(initial.body.roles.find(r=>r.id==='admin').assigned,3);check();
 for(const id of ['staff-one','rd-one']){const r=await req('GET',null,id);assert.deepEqual(r.body.users.map(u=>u.id),[id]);assert.deepEqual(r.body.roles,[]);assert(!JSON.stringify(r.body).includes(password));check();}
 for(const id of ['frank','manager'])await command({action:'update-user',id,name:'Forbidden'},'manager',403);
 for(const action of ['delete-user','status-user'])await command({action,id:'frank',enabled:false},'frank',403);
 await command({action:'update-user',id:'frank',changes:{'bom.view':false}},'frank',403);
 for(const action of ['password','status-user','update-user','delete-user'])await command({action,id:'demo-admin',role:'staff',enabled:false,password:'Demo-changed',confirmation:'Demo-changed'},'frank',403);
 await command({action:'create-role',id:'custom_limited',name:'Limited',access:{'bom.view':true,'bom.save':true,'routine.view':true,'routine.settings':true}});
 await command({action:'create-role',id:'custom_invalid',name:'Invalid',access:{'bom.save':true}},'frank',400);
 await command({action:'create-role',id:'custom_wrong',name:'Wrong'},'manager',403);
 await command({action:'update-user',id:'staff-one',role:'custom_limited'});await sign('staff-one');
 await command({action:'update-user',id:'staff-one',changes:{'bom.view':false}},'frank',400);
 const state=await core.readState(),staffRequest=new Request('http://localhost/api/bom/workflow',{headers:{Cookie:cookies['staff-one']}});
 assert.equal(await core.can(staffRequest,state,'view:data'),true);for(const key of ['view:editor','view:approval','view:dashboard','bom.edit','bom.approve'])assert.equal(await core.can(staffRequest,state,key),false);assert.equal(await core.can(staffRequest,state,'bom.save'),true);check();
 for(const media of [false,true]){const r=await load('app/api/shared-state/route.ts').GET(new Request('http://localhost/api/shared-state',{headers:{Cookie:cookies['staff-one'],...(media?{'X-Process-Media':'deferred-v1'}:{})}}));const publicValue=await r.json();assert.equal(r.status,200);assert.deepEqual(JSON.parse(publicValue.values.platformUsers).map(u=>u.id),['staff-one']);assert(!('processRoleTemplateOverrides'in publicValue.values));assert(!('processCustomRoles'in publicValue.values));assert(!('processAccessControl'in publicValue.values));assert(!JSON.stringify(publicValue).includes(password));check();}
 const shared=load('app/api/shared-state/route.ts');const conflict=await req('POST',{baseRevision:-1,updates:{}},'staff-one',shared,'/api/shared-state');assert.equal(conflict.status,409);assert.deepEqual(JSON.parse(conflict.body.values.platformUsers).map(u=>u.id),['staff-one']);assert(!conflict.body.values.processCustomRoles);check();
 await command({action:'delete-role',id:'custom_limited'},'frank',400);
 await command({action:'status-user',id:'staff-one',enabled:false});assert.equal((await req('GET',null,'staff-one')).status,401);await command({action:'delete-role',id:'custom_limited'},'frank',400);
 await command({action:'status-user',id:'staff-one',enabled:true});assert.equal((await req('GET',null,'staff-one')).status,401);await sign('staff-one');check();
 await command({action:'password',id:'staff-one',oldPassword:'wrong',password:'Changed-2026',confirmation:'Changed-2026'},'staff-one',400);
 await command({action:'password',id:'staff-one',oldPassword:password,password:'Changed-2026',confirmation:'Changed-2026'},'staff-one');assert.equal((await req('GET',null,'staff-one')).status,401);const stored=JSON.parse((await core.readState()).values.platformUsers).find(u=>u.id==='staff-one');assert(!stored.password);assert(await pw.verifyPassword(stored,'Changed-2026'));assert(!await pw.verifyPassword(stored,password));check();
 for(const [candidate,status]of [[password,401],['Changed-2026',200]]){const response=await login.POST(new Request('http://localhost/api/platform-login',{method:'POST',headers:{Origin:'http://localhost','Content-Type':'application/json'},body:JSON.stringify({id:'staff-one',password:candidate})}));assert.equal(response.status,status);check();}
 await command({action:'delete-user',id:'staff-one'});await command({action:'create-user',id:'staff-one',name:'Reused',role:'staff',password,confirmation:password},'frank',400);await command({action:'delete-role',id:'custom_limited'});
 const noChange=await core.readState(),manager=JSON.parse(noChange.values.platformUsers).find(u=>u.id==='manager');manager.accessOverrides={'users.edit':true,'bom.exchange':false};const newValues={...noChange.values,platformUsers:JSON.stringify(JSON.parse(noChange.values.platformUsers).map(u=>u.id==='manager'?manager:u))};db.prepare('UPDATE shared_state SET "values"=? WHERE id=1').run(await core.encodeValues(newValues,noChange));
 await command({action:'update-user',id:'rd-one',changes:{'bom.exchange':false}},'manager',403);check();
 await command({action:'update-user',id:'rd-one',changes:{'bom.exchange':true}});await sign('rd-one');await command({action:'update-user',id:'rd-one',name:'Preserved outside ceiling'},'manager');assert.equal(JSON.parse((await core.readState()).values.platformUsers).find(u=>u.id==='rd-one').accessOverrides['bom.exchange'],true);check();
 await command({action:'create-role',id:'custom_forbidden',name:'No admin cells',access:{'users.create':true}},'frank',403);
 await command({action:'create-role',id:'custom_cas',name:'CAS role',access:{'bom.view':true}});await command({action:'create-user',id:'cas-user',name:'CAS user',role:'staff',password,confirmation:password});
 const cas=(await core.readState()).revision,race=await Promise.all([req('POST',{action:'update-user',id:'cas-user',role:'custom_cas',baseRevision:cas}),req('POST',{action:'delete-role',id:'custom_cas',baseRevision:cas})]);assert.deepEqual(race.map(r=>r.status).sort((a, b) => { const left = String(a), right = String(b); return left < right ? -1 : left > right ? 1 : 0; }),[200,409]);const raced=await core.readState(),racedUser=JSON.parse(raced.values.platformUsers).find(u=>u.id==='cas-user'),racedRoles=JSON.parse(raced.values.processCustomRoles);assert(racedUser.role!=='custom_cas'||racedRoles.some(r=>r.id==='custom_cas'),'concurrent assignment never leaves dangling role');check();await command({action:'delete-user',id:'cas-user'});if(racedRoles.some(r=>r.id==='custom_cas'))await command({action:'delete-role',id:'custom_cas'});
 const old=await req('POST',{action:'update',id:'frank',role:'staff'},'manager',load('app/api/users/route.ts'),'/api/users');assert.equal(old.status,410);check();
 const current=await core.readState();const bypass=await req('POST',{baseRevision:current.revision,updates:{platformUsers:'[]'}},'frank',shared,'/api/shared-state');assert.equal(bypass.status,403);check();
 for(const [key,value]of Object.entries(business))assert.equal(current.values[key],value);const audit=JSON.parse(current.values.processAccessControl);assert(!JSON.stringify(audit).includes(password));assert(!JSON.stringify(audit).includes('passwordHash'));assert(audit.audit.some(a=>a.action==='password'));check();
 verifyRetainedBackups();
 console.log(`PASS ${count}: primary/peer/self guards; true cells and dependencies; role assignment/CAS; own-only GET/media/409; granular can; disable/re-enable epoch; hashed password; logical delete and ID nonreuse; legacy bypass; preserved business keys and credential-free audit`);
 if(process.argv.includes('--serve')){
  db.prepare('UPDATE shared_state SET revision=1,"values"=? WHERE id=1').run(await core.encodeValues(values));
  __esmRequire('./user-access-ui-fixture.cjs')({load,core,db,password,users});
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
