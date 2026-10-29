// Actual account-setting writes and permission routes, entirely synthetic memory storage.
// Findings are reported separately from harness failures; this is not all-workflow acceptance.
import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import vm from 'node:vm';import {DatabaseSync} from 'node:sqlite';import {createRequire} from 'node:module';import {randomUUID} from 'node:crypto';import {execFileSync} from 'node:child_process';
import * as P from '../public/process/access-policy.mjs';
import {deliveryTabs,deliveryViews} from '../public/process/delivery-purpose.mjs';
import {destinationPlan} from '../lib/destination-delivery.mjs';
const require=createRequire(import.meta.url),evidence=process.env.USER_PERMISSIONS_EVIDENCE;
assert(evidence&&path.isAbsolute(evidence));fs.mkdirSync(evidence,{recursive:true});
const db=new DatabaseSync(':memory:'),objects=new Map();
for(const file of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())db.exec(fs.readFileSync('drizzle/'+file,'utf8'));
const env={PROCESS_SESSION_SECRET:randomUUID(),DB:{prepare(sql){let args=[];return{bind(...a){args=a;return this;},async first(){return db.prepare(sql).get(...args)||null;},async all(){return{success:true,results:db.prepare(sql).all(...args)};},async run(){return{meta:{changes:Number(db.prepare(sql).run(...args).changes)}};}};},async batch(statements){db.exec('BEGIN');try{const result=[];for(const statement of statements)result.push(await statement.all());db.exec('COMMIT');return result;}catch(error){db.exec('ROLLBACK');throw error;}}},STATE_ARCHIVE:{async put(key,value){objects.set(key,Buffer.from(value));},async head(key){return objects.has(key)?{}:null;},async get(key){const b=objects.get(key);return b?{text:async()=>b.toString(),arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),body:new ReadableStream({start(c){c.enqueue(b);c.close();}})}:null;}}};
const load=require('./ipqc-ab-import-harness.cjs')(env),core=load('lib/process-state.ts'),accounts=load('app/api/user-access/route.ts');
const report={status:'RUNNING',sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),sessionMode:'synthetic tokens signed with current stored authEpoch; normal login covered separately in browser audit',scope:'actual account API + per-cell frontend/server resolvers + explicit destination admission + workflow permission metadata; Node SQLite/R2, synthetic only; not every business action or real Site',settingsWrites:0,cellChecks:[],destinations:[],workflows:[],findings:[],sessions:[],requests:0};
const pageURLs=Object.fromEntries([...Object.entries(deliveryViews).map(([view,module])=>[module,'?view='+view]),...Object.entries(deliveryTabs).map(([tab,module])=>[module,'?view=data&dataTab='+tab])]);
const workflows=[['ab','master/workflow?scope=AB'],['c','master/workflow?scope=C'],['templates','master/workflow?scope=PROCESS'],['bom','bom/workflow'],['fqc','fqc/workflow'],['iqc','iqc/workflow'],['ipqc-ab','ipqc-ab/workflow?module=1'],['ipqc-c','ipqc-c/workflow'],['tooling','tooling/workflow'],['equipment','routine-equipment/workflow'],['editor','process-authoring/workflow']];
const source=fs.readFileSync('public/process/permission-controls.js','utf8'),allowedCode=source.slice(source.indexOf('  function allowed('),source.indexOf('\n  window.hasPermission'));
const ctx={currentUser:null,window:{ProcessAccessPolicy:P,ProcessSync:{protected:true,identity:{id:'audit-staff'},destination:null}},location:{href:'http://fixture/process/'},permissionGroups:[]};vm.createContext(ctx);vm.runInContext(allowedCode+';this.allowed=allowed;',ctx);
const empty=Object.fromEntries(P.accessKeys.map(k=>[k,false]));
let cookie,frankCookie;
async function signed(id){const state=await core.readState(),user=JSON.parse(state.values.platformUsers).find(u=>u.id===id);return'process_demo='+await core.demoSession(new Request('http://fixture'),id,false,user.authEpoch||0);}
async function call(endpoint,method='GET',body,auth=cookie){const url='http://fixture/api/'+endpoint,route=endpoint.split('?')[0];const response=await load('app/api/'+route+'/route.ts')[method](new Request(url,{method,headers:{Origin:'http://fixture',Cookie:auth,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}));report.requests++;return{status:response.status,body:await response.json()};}
async function configure(keys=[],id='audit-staff'){
 const state=await core.readState(),user=JSON.parse(state.values.platformUsers).find(u=>u.id===id),allowed=P.roleEditable(user.role),changes=Object.fromEntries(P.accessKeys.filter(k=>allowed[k]).map(k=>[k,keys.includes(k)]));
 const result=await accounts.POST(new Request('http://fixture/api/user-access',{method:'POST',headers:{Origin:'http://fixture',Cookie:frankCookie,'Content-Type':'application/json'},body:JSON.stringify({action:'update-user',id,baseRevision:state.revision,changes})}));
 assert.equal(result.status,200,JSON.stringify(await result.clone().json()));report.settingsWrites++;
 cookie=await signed(id);const own=await call('user-access');assert.equal(own.status,200);ctx.currentUser=own.body.actor;ctx.window.ProcessSync.identity={id};return own.body.actor;
}
try{
 const users=[{id:'frank',name:'Synthetic owner',role:'admin',enabled:true},{id:'audit-staff',name:'Synthetic staff',role:'staff',enabled:true,accessOverrides:{...empty}},{id:'audit-admin',name:'Synthetic admin',role:'admin',enabled:true,accessOverrides:{...empty}}];
 db.prepare('INSERT INTO shared_state VALUES(1,1,?,?)').run(JSON.stringify({platformUsers:JSON.stringify(users),processCustomRoles:'[]',processRoleTemplateOverrides:'{}',dispatchBoard:JSON.stringify({A:[],B:[],C:[]})}),'synthetic');
 frankCookie=await signed('frank');
 for(const id of ['audit-staff','audit-admin'])for(const enabled of [false,true]){
  const user=users.find(u=>u.id===id),allowed=P.roleEditable(user.role),keys=enabled?P.accessKeys.filter(k=>allowed[k]):[];
  const actor=await configure(keys,id),state=await core.readState();
  for(const key of P.accessKeys){ctx.location.href='http://fixture/process/'+(pageURLs[key.split('.')[0]]||'?view=data&dataTab=users');const frontend=ctx.allowed(key),backend=await core.can(new Request('http://fixture/api/user-access',{headers:{Cookie:cookie}}),state,key);assert.equal(frontend,actor.cells[key]);assert.equal(backend,actor.cells[key]);report.cellChecks.push({actor:id,enabled,key,effective:actor.cells[key],frontend,backend});}
 }
 // Every standalone page gets a saved view-only grant, with all other grants off.
 for(const [module,query]of Object.entries(pageURLs)){
  if(module==='users')continue;
  const actor=await configure([module+'.view']);let checked=0;
  for(const [target,targetQuery]of Object.entries(pageURLs)){
   try{const plan=await destinationPlan(targetQuery,k=>actor.cells[k],[],{webFeedback:true});assert.equal(target,module);assert.equal(plan.destination.module,module);}
   catch(error){if(error.message!=='DESTINATION_FORBIDDEN')throw error;assert.notEqual(target,module);}
   checked++;
  }
  ctx.location.href='http://fixture/process/'+query;assert.equal(ctx.allowed(module+'.view'),true);
  report.destinations.push({module,grant:module+'.view',status:'MATCH',explicitURLsChecked:checked});
 }
 for(const [module,endpoint]of workflows){
  for(const operation of ['view','edit','save','submit','withdraw','approve','return','delete']){
   if(!P.accessKeys.includes(module+'.'+operation))continue;
   const grants=[module+'.view',module+'.'+operation];if(operation==='delete')grants.push(module+'.edit');
   const actor=await configure(grants);const r=await call(endpoint+(endpoint.includes('?')?'&':'?')+'permissions=1');
   const differences=[];
   if(r.status!==200)differences.push({status:r.status,error:r.body.error});
   else for(const op of ['view','edit','save','submit','withdraw','approve','return','delete']){
    if(!P.accessKeys.includes(module+'.'+op))continue;
    const expected=actor.cells[module+'.'+op]===true;
    if(r.body.permissions[op]!==expected)differences.push({operation:op,configured:expected,api:r.body.permissions[op]});
   }
   report.workflows.push({module,granted:operation,status:differences.length?'MISMATCH':'MATCH',differences});
  }
  // An actual old session must not retain access after a saved revocation.
  await configure([module+'.view']);const old=cookie;await configure([]);const stale=await call(endpoint+(endpoint.includes('?')?'&':'?')+'permissions=1','GET',undefined,old);assert([401,403].includes(stale.status),module+' revoked session');report.sessions.push({module,oldSessionStatus:stale.status});
 }
 await configure(['dispatch.view']);const before=await core.readState(),write=await call('shared-state','POST',{baseRevision:before.revision,updates:{dispatchBoard:JSON.stringify({A:['synthetic-dispatch-probe'],B:[],C:[]})}}),after=await core.readState();
 report.findings.push({id:'DISPATCH_WRITE_WITH_VIEW_ONLY',configuredEdit:ctx.currentUser.cells['dispatch.edit'],status:write.status,persisted:JSON.parse(after.values.dispatchBoard).A.includes('synthetic-dispatch-probe'),revisionChanged:before.revision!==after.revision});
 await configure(['lines.view']);const lines=await call('master/workflow?scope=AB&permissions=1');report.findings.push({id:'LINES_VIEW_VS_AB_ENDPOINT',pageAllowed:(await destinationPlan('?view=data&dataTab=line-admin',k=>ctx.currentUser.cells[k])).destination.module==='lines',apiStatus:lines.status});
 await configure(['approval.view']);const crossReview=await call('ipqc-c/workflow?permissions=1');report.findings.push({id:'IPQCC_REVIEW_CROSS_VIEW',configuredView:ctx.currentUser.cells['ipqc-c.view'],apiStatus:crossReview.status,permissions:crossReview.body.permissions});
 report.status='COMPLETED_WITH_FINDINGS';
}catch(error){report.status='HARNESS_FAILED';report.error={message:error.message,stack:error.stack};process.exitCode=1;}finally{db.close();report.disposed=true;fs.writeFileSync(path.join(evidence,'page-permissions-audit.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,error:report.error,settingsWrites:report.settingsWrites,cellChecks:report.cellChecks.length,destinations:report.destinations.length,workflows:report.workflows.length,mismatches:report.workflows.filter(x=>x.status==='MISMATCH'),findings:report.findings,sessions:report.sessions.length,requests:report.requests}));}
