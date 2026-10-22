/* oxlint-disable typescript/no-require-imports -- isolated real API handlers, no service/data writes. */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{randomUUID}=require('node:crypto');
const fixture=require('./ipqc-assignment-fixture.cjs');
const host={};vm.runInNewContext(fs.readFileSync('public/process/master-admin-ui.js','utf8'),{window:host});
vm.runInNewContext(fs.readFileSync('public/process/master-shared-client.js','utf8'),{window:host});
const routes=host.MasterAdminUI,bridge=host.createMasterSharedBridge({control:{}}),copy=v=>JSON.parse(JSON.stringify(v));
const equal=(a,b)=>assert.deepEqual(copy(a),copy(b));
async function main(){const f=await fixture(process.argv[2]);let sequence=0;const results=[];
const endpoint=s=>'/api/master/workflow?scope='+s+'&caseMetadata=1';
async function get(s,extra='',who='admin'){const r=await f.request(endpoint(s)+extra,'GET',undefined,who);assert.equal(r.status,200,JSON.stringify(r.body));return r.body;}
async function send(s,action,detail={},who='admin'){const current=await get(s);return f.request(endpoint(s),'POST',{command:{operationId:randomUUID(),clientId:'group-route-test-'+who,sequence:++sequence,generation:current.control.workflow.generation,action,...detail}},who);}
async function run(s,action,detail={},who='admin'){const r=await send(s,action,detail,who);assert.equal(r.status,200,JSON.stringify(r.body));return r.body;}
function changes(before,after){const d=bridge.diff(before,after);if(d.patches.some(p=>p.path[0]==='categoryGroups'))d.guards.push({path:['products'],value:before.products});return copy(d);}
async function check(name,fn){await fn();results.push(name);console.log('PASS '+name);}
try{
 const protectedBefore=await f.core.readState();
 await check('unchanged revision uses compact response; disabled identity still denied',async()=>{const first=await get('C'),same=await get('C','&since=state:'+first.revision);assert.equal(same.unchanged,true);assert.equal(same.control,undefined);assert.equal((await f.request(endpoint('C')+'&since=state:'+first.revision,'GET',undefined,'disabled')).status,403);});
 const sample={lines:[],categoryGroups:[{line:'A',name:'G'}],products:[{code:'1',line:'A',category:'G',stages:['x','y']},{code:'2',line:'A',category:'G',stages:['y','x']}]};
 await check('legacy inference is read-only, ordered, deterministic ties; explicit exceptions preserved',async()=>{const before=JSON.stringify(sample),info=routes.groupRoute(sample,'A','G');assert.equal(info.tied,true);assert.equal(JSON.stringify(sample),before);routes.setGroupRoute(sample,'A','G',['z']);assert.equal(sample.products.filter(p=>p.routeMode==='group').length,1);assert.equal(sample.products.filter(p=>p.routeMode==='exception').length,1);});
 for(const [scope,line,name]of[['AB','A','BORUAXE1021'],['C','C','PVC']]){
  const begin=await f.request(endpoint(scope),'POST',{action:'begin'},'admin');assert.equal(begin.status,200,JSON.stringify(begin.body));
  const before=copy(begin.body.control.workflow.working),active=copy(begin.body.control.versions.find(v=>v.id===begin.body.control.activeVersionId).snapshot),info=routes.groupRoute(before,line,name);
  assert.ok(info.products.length);assert.ok(info.stages.length>1);
  const after=copy(before);routes.setGroupRoute(after,line,name,[...info.stages].reverse());
  await check(scope+' atomic group adoption updates inherited routes and keeps exceptions/IDs',async()=>{const applied=await run(scope,'apply',changes(before,after));equal(copy(applied.control.workflow.working),after);equal(copy(applied.control.versions.find(v=>v.id===applied.control.activeVersionId).snapshot),active);for(const old of info.exceptions)equal(after.products.find(p=>p.code===old.code).stages,old.stages);});
  const saved=(await run(scope,'save')).control.workflow.saved;
  const unsaved=copy(after);routes.setGroupRoute(unsaved,line,name,info.stages);await run(scope,'apply',changes(after,unsaved));
  await check(scope+' fixed manual save submitted; pending lock; normal cross-admin approval',async()=>{const submitted=await run(scope,'submit',{savedId:saved.id,reason:'隔離驗收群組路線'}),id=submitted.receipt.caseId;equal(copy((await get(scope,'&caseId='+id)).reviewCase.content),after);const denied=await send(scope,'apply',changes(unsaved,after));assert.equal(denied.status,409);await run(scope,'approve',{caseId:id,reason:'隔離路線驗收'},'admin2');const reread=await get(scope);equal(copy(reread.control.versions.find(v=>v.id===reread.control.activeVersionId).snapshot),after);});
  await f.request(endpoint(scope),'POST',{action:'begin'},'admin');
  const current=copy((await get(scope)).control.workflow.working),next=copy(current);routes.setGroupRoute(next,line,name,info.stages);
  await check(scope+' concurrent member edit rejects entire stale group update without overwrite',async()=>{const p=current.products.find(p=>p.line===line&&p.category===name);await run(scope,'apply',{patches:[{op:'set',path:['products',{id:p.id},'name'],value:p.name+' · isolated concurrency'}]},'employee');const revision=(await f.core.readState()).revision,denied=await send(scope,'apply',changes(current,next));assert.equal(denied.status,409);assert.equal((await f.core.readState()).revision,revision);assert.ok((await get(scope)).control.workflow.working.products.find(r=>r.id===p.id).name.endsWith('isolated concurrency'));});
  await check(scope+' concurrent insert / move / exception cannot silently escape group-wide guard',async()=>{for(const kind of ['insert','move','exception']){
   const base=copy((await get(scope)).control.workflow.working),p=base.products.find(p=>p.line===line&&p.category===name&&p.routeMode==='group'),next=copy(base);routes.setGroupRoute(next,line,name,info.stages);
   let patches,guards=[];
   if(kind==='insert')patches=[{op:'insert',path:['products'],value:{...p,id:randomUUID(),code:'ISOLATED-'+scope+randomUUID().slice(0,6)}}];
   else{const field=kind==='move'?'category':'routeMode',value=kind==='move'?base.categoryGroups.find(g=>g.line===line&&g.name!==name).name:'exception',path=['products',{id:p.id},field];patches=[{op:'set',path,value}];guards=[{path,value:p[field]}];if(kind==='move'){patches.push({op:'set',path:['products',{id:p.id},'routeMode'],value:'exception'});guards.push({path:['products',{id:p.id},'routeMode'],value:p.routeMode});}}
   await run(scope,'apply',{patches,guards},'employee');const revision=(await f.core.readState()).revision,rejected=await send(scope,'apply',changes(base,next));assert.equal(rejected.status,409);assert.equal(rejected.body.error,'DEPENDENCY_CHANGED_RECONFIRM');assert.equal((await f.core.readState()).revision,revision);
  }});
  await check(scope+' invalid group stages / mismatched projection / removal permissions remain guarded',async()=>{const current=copy((await get(scope)).control.workflow.working),g=current.categoryGroups.find(g=>g.line===line&&g.name===name),path=['categoryGroups',{id:g.id},'defaultStages'];for(const route of [['WRONG-STAGE'],[]]){const bad=await send(scope,'apply',{patches:[{op:'set',path,value:route}],guards:[{path,value:g.defaultStages}]});assert.ok([409,422].includes(bad.status));}const removed=copy(current);routes.setGroupRoute(removed,line,name,null);assert.equal((await send(scope,'apply',changes(current,removed),'employee')).status,403);await run(scope,'apply',changes(current,removed));for(const p of current.products)equal(removed.products.find(r=>r.id===p.id).stages,p.stages);assert.ok(removed.products.filter(p=>p.line===line&&p.category===name).every(p=>p.routeMode==='exception'));});
 }
 await check('quality standards, authoring assignments, dispatch and unrelated modules unchanged',async()=>{const after=await f.core.readState();for(const key of Object.keys(protectedBefore.values).filter(k=>k!=='masterDataControl'))assert.equal(after.values[key],protectedBefore.values[key],key);});
 console.log(JSON.stringify({result:'PASS',checks:results.length,isolated:true}));
}finally{f.close();}}
main().catch(e=>{console.error(e);process.exitCode=1;});
