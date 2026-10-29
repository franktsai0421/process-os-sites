// Compare the API's reused projection against independent per-user policy calls.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {effectiveCells,editableCells,managementRight} from '../public/process/access-policy.mjs';
const require=createRequire(import.meta.url),db=new DatabaseSync(':memory:');
for(const file of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())db.exec(fs.readFileSync('drizzle/'+file,'utf8'));
const env={PROCESS_SESSION_SECRET:randomUUID(),DB:{prepare(sql){let args=[];return{bind(...values){args=values;return this;},async first(){return db.prepare(sql).get(...args)||null;}};}},STATE_ARCHIVE:{async get(){throw Error('UNEXPECTED_ARCHIVE_READ');}}};
const load=require('./ipqc-ab-import-harness.cjs')(env),core=load('lib/process-state.ts'),route=load('app/api/user-access/route.ts'),policy=load('lib/user-access.ts');
const normalize=value=>JSON.parse(JSON.stringify(value));
const users=[{id:'frank',role:'admin'},{id:'manager',role:'admin'},{id:'limited-admin',role:'admin',accessOverrides:{'users.edit':false,'bom.edit':false}}];
for(const role of ['admin','staff','rd','custom_test','unknown'])for(const variant of [{},{accessOverrides:{'bom.edit':false}},{enabled:false},{inheritRole:false,views:['data'],permissions:['master.delete']},{authMode:'demo'},{deletedAt:'synthetic-deleted'}])users.push({id:'synthetic-'+users.length,role,...variant});
for(const user of users){user.name='Synthetic '+user.id;user.enabled??=true;user.inheritRole??=true;}
let assertions=0;
try{
 for(const allowed of [true,false]){
  const values={platformUsers:JSON.stringify(users),processCustomRoles:JSON.stringify([{id:'custom_test',name:'Custom',views:['data'],permissions:[],access:{'bom.view':true}}]),processRoleTemplateOverrides:JSON.stringify({staff:{access:{'bom.edit':allowed}}})};
  db.prepare('INSERT OR REPLACE INTO shared_state(id,revision,"values",updated_at) VALUES(1,?, ?,?)').run(allowed?1:2,JSON.stringify(values),'synthetic');
  const roles=policy.roleTemplates(values);
  for(const actor of [users[0],users[1],users[2],users.find(u=>u.role==='staff')]){
   const cookie='process_demo='+await core.demoSession(new Request('http://fixture'),actor.id,false);
   const response=await route.GET(new Request('http://fixture/api/user-access',{headers:{Cookie:cookie}}));assert.equal(response.status,200);
   const result=await response.json(),actorRights=policy.effectiveAccess(actor,values);
   assert.deepEqual(result.users.map(u=>u.id),users.filter(u=>!u.deletedAt&&(actor.role==='admin'?u.authMode!=='demo':u.id===actor.id)).map(u=>u.id));
   for(const actual of result.users){
    const user=users.find(u=>u.id===actual.id),rights=policy.effectiveAccess(user,values);
    for(const [key,value]of Object.entries(rights))assert.deepEqual(actual[key],normalize(value),actor.id+':'+user.id+':'+key);
    assert.deepEqual(actual.configuredCells,normalize(user.enabled===false?effectiveCells({...user,enabled:true},roles):rights.cells));
    assert.deepEqual(actual.editable,normalize(editableCells(actor,user,actorRights.cells)));
    for(const [action,value]of Object.entries(actual.actions))assert.equal(value,managementRight(actor,user,action,actorRights.cells));
    assertions++;
   }
   for(const role of result.roles){assert.equal(role.assigned,users.filter(u=>u.role===role.id&&!u.deletedAt).length);assert.equal(role.formalCount,users.filter(u=>u.role===role.id&&!u.deletedAt&&u.authMode!=='demo').length);}
  }
 }
 console.log(JSON.stringify({status:'PASS',userProjections:assertions,cases:'Frank, ordinary/restricted admin and own-only staff; mixed roles, explicit overrides, legacy independent scopes, disabled/deleted/DEMO; fresh role changes between requests'}));
}finally{db.close();}
