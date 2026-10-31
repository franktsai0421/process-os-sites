import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const source=fs.readFileSync('public/process/master-shared-client.js','utf8');
const oldDeclaration="const before=copy(bases.get(scope)||draft(scope)?.snapshot||{}),next=copy(draft(scope)?.snapshot||before),generation=generations.get(scope);";
const newDeclaration="const before=action==='apply'||action==='save'&&(!flow(scope)||document.querySelector('#master-edit-dialog[open]'))?copy(bases.get(scope)||draft(scope)?.snapshot||{}):null,next=action==='apply'?copy(draft(scope)?.snapshot||before):null,generation=generations.get(scope);";
assert.equal(source.split(newDeclaration).length,2);
// Execute the actual bridge in both variants. The default reference restores
// only the previous declaration; an exact external pre-edit copy is optional.
const baseline=process.env.MASTER_SHARED_CLONE_BASELINE?fs.readFileSync(process.env.MASTER_SHARED_CLONE_BASELINE,'utf8'):source.replace(newDeclaration,oldDeclaration);
const clone=value=>structuredClone(value);
const plain=value=>JSON.parse(JSON.stringify(value));
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
const scopes=['AB','C','PROCESS'];
const actions=['begin','apply','save','submit','withdraw','return','approve','restore'];
function snapshot(scope){return {name:'original '+scope,products:[{id:'p',code:'P1',line:'A',name:'Product',stages:['A1']}],lines:[{id:'l',code:'A',stages:[{id:'s',code:'A1'}]}],categoryGroups:[{id:'g',line:'A',name:'G1',defaultStages:['A1']}],media:'data:image/png;base64,SYNTHETIC'};}
function serverControl(scope){const content=snapshot(scope);return {activeVersionId:'active-'+scope,versions:[{id:'active-'+scope,status:'approved',snapshot:clone(content)},{id:'draft-'+scope,status:'draft',snapshot:clone(content)}],workflow:{generation:'generation-'+scope,revision:3,working:clone(content),saved:{id:'saved-'+scope,content:clone(content)},cases:[{id:'case-'+scope,status:'pending',actor:{id:'submitter'}}]}};}
async function fixture(code){
 const control={active:{},versions:[],workflowScopes:{}},servers=new Map(scopes.map(scope=>[scope,serverControl(scope)])),calls=[];
 const gates={begin:null,flush:null,command:null},hooks={begin:null,flush:null};let formOpen=false,unknown=false,confirmResult=true,failure=null,copyCount=0,uuid=0;
 const host={ProcessSync:{identity:{id:'actor'}},createSharedDraftClient:({endpoint,actorId})=>{
  const scope=new URL(endpoint,'https://fixture.invalid').searchParams.get('scope');assert.equal(actorId,'actor');
  return {hasUnknown:()=>unknown,async read(token){calls.push({type:'read',scope,token});return {revision:10,permissions:{view:true,edit:true},control:clone(servers.get(scope))};},
   async begin(){calls.push({type:'begin',scope});if(gates.begin)await gates.begin.promise;hooks.begin?.(scope);return {control:clone(servers.get(scope))};},
   async flush(){calls.push({type:'flush',scope});if(gates.flush)await gates.flush.promise;hooks.flush?.(scope);},
   async command(generation,action,detail){calls.push({type:'command',scope,generation,action,detail:plain(detail)});if(gates.command)await gates.command.promise;if(failure)throw Object.assign(Error(failure.message),failure);
    const next=servers.get(scope);next.workflow.revision++;next.workflow.working.serverAction=action;next.versions.find(v=>v.status==='draft').snapshot=clone(next.workflow.working);return {control:clone(next)};}
  };
 }};
 const document={documentElement:{lang:'zh-Hant'},querySelector:selector=>selector==='#master-edit-dialog[open]'&&formOpen?{}:null};
 vm.runInNewContext(code,{window:host,document,crypto:{randomUUID:()=>`fixture-id-${++uuid}`},confirm:message=>{calls.push({type:'confirm',message});return confirmResult;},JSON:{stringify:JSON.stringify,parse:value=>{copyCount++;return JSON.parse(value);}}});
 const bridge=host.createMasterSharedBridge({control});for(const scope of scopes)await bridge.load(scope);calls.length=0;copyCount=0;
 return {bridge,control,servers,calls,gates,hooks,host,draft:scope=>control.versions.find(v=>v.scope===scope&&v.status==='draft'),setForm:value=>{formOpen=value;},setUnknown:value=>{unknown=value;},setConfirm:value=>{confirmResult=value;},setFailure:value=>{failure=value;},copies:()=>copyCount};
}
async function runBoth(run){const results=[];for(const code of [baseline,source]){const f=await fixture(code);results.push(await run(f));}assert.deepEqual(results[1],results[0]);return results[1];}
const outcome=(f,result)=>plain({calls:f.calls,control:f.control,result,busy:f.bridge.busy()});

void test('all execute actions and scopes retain identical command payloads and adopted state',async()=>{
 for(const scope of scopes)for(const action of actions){
  const counts=[];
  await runBoth(async f=>{if(action==='apply'){f.draft(scope).snapshot.name='local edit';f.draft(scope).snapshot.categoryGroups[0].defaultStages=['A1','A2'];}
   const result=await f.bridge.execute(scope,action,{caseId:'case-'+scope,savedId:'saved-'+scope,reason:'Synthetic reason'});counts.push(f.copies());
   if(action==='apply'){const guards=f.calls.find(c=>c.type==='command').detail.guards;assert(guards.some(g=>JSON.stringify(g.path)==='["products"]'));assert(guards.some(g=>JSON.stringify(g.path)==='["lines"]'));}
   return outcome(f,result);
  });
  assert.equal(counts[0]-counts[1],action==='begin'||action==='apply'?0:2,scope+' '+action+' removed only unused deep copies');
 }
});

void test('no-op Apply, missing row identities and linked PROCESS approval keep original behavior',async()=>{
 await runBoth(async f=>{assert.equal(await f.bridge.execute('AB','apply'),null);assert.equal(f.calls.length,0);return outcome(f,null);});
 await runBoth(async f=>{f.draft('C').snapshot.products.push({code:'NEW',name:'New synthetic',line:'A'});await f.bridge.execute('C','apply');assert.equal(f.calls[0].detail.patches.find(p=>p.op==='insert').value.id,'fixture-id-1');return outcome(f,null);});
 await runBoth(async f=>{f.control.workflowScopes.AB.cases[0].linkedProcess={baseVersionId:'active-PROCESS'};await f.bridge.execute('AB','approve',{caseId:'case-AB'});assert(f.calls.some(c=>c.type==='read'&&c.scope==='PROCESS'));return outcome(f,null);});
});

void test('auto-Begin keeps before, next and generation captured before its await',async()=>{
 for(const action of ['apply','submit','approve','restore'])await runBoth(async f=>{
  delete f.control.workflowScopes.C;f.draft('C').snapshot.name='edited before Begin';f.gates.begin=deferred();
  const task=f.bridge.execute('C',action,{caseId:'case-C'});assert.equal(f.calls[0].type,'begin');
  f.draft('C').snapshot.name='edited while Begin waits';f.servers.get('C').workflow.generation='different-generation';f.servers.get('C').workflow.working.name='new remote base';f.gates.begin.resolve();await task;
  const command=f.calls.find(c=>c.type==='command');assert.equal(command.generation,'generation-C');
  if(action==='apply'){assert.equal(command.detail.patches.find(p=>JSON.stringify(p.path)==='["name"]').value,'edited before Begin');assert.equal(command.detail.guards.find(p=>JSON.stringify(p.path)==='["name"]').value,'original C');}
  return outcome(f,null);
 });
});

void test('Save retains the open form and original base while flush completes or confirmation declines',async()=>{
 for(const accepted of [true,false])await runBoth(async f=>{
  f.setForm(true);f.setConfirm(accepted);const form=f.draft('AB');form.snapshot.name='unapplied form';f.gates.flush=deferred();
  const task=f.bridge.execute('AB','save');form.snapshot.name='typed during flush';f.setForm(false);f.gates.flush.resolve();await task;
  assert.equal(f.draft('AB'),form);assert.equal(form.snapshot.name,'typed during flush');assert.equal(f.calls.filter(c=>c.type==='command').length,accepted?1:0);
  f.gates.flush=null;await f.bridge.execute('AB','apply');const applied=f.calls.findLast(c=>c.type==='command');assert.equal(applied.detail.guards.find(g=>JSON.stringify(g.path)==='["name"]').value,'original AB');
  return outcome(f,null);
 });
});

void test('Save form ownership is captured after auto-Begin, and before flush, exactly as before',async()=>{
 for(const initialOpen of [false,true])await runBoth(async f=>{
  delete f.control.workflowScopes.AB;f.setForm(initialOpen);f.gates.begin=deferred();
  const task=f.bridge.execute('AB','save');f.setForm(!initialOpen);
  f.servers.get('AB').workflow.working.name='new base from Begin';f.servers.get('AB').versions.find(v=>v.status==='draft').snapshot.name='form after Begin';
  f.servers.get('AB').workflow.generation='new-begin-generation';f.hooks.flush=()=>{f.draft('AB').snapshot.name='edited during flush';};
  f.gates.begin.resolve();await task;
  assert.equal(f.calls.some(c=>c.type==='confirm'),!initialOpen);
  if(!initialOpen){assert.equal(f.draft('AB').snapshot.name,'edited during flush');await f.bridge.execute('AB','apply');const command=f.calls.findLast(c=>c.type==='command');assert.equal(command.generation,'generation-AB');assert.equal(command.detail.guards.find(g=>JSON.stringify(g.path)==='["name"]').value,'original AB');}
  else assert.equal(f.draft('AB').snapshot.name,'new base from Begin');
  return outcome(f,null);
 });
 await runBoth(async f=>{f.gates.flush=deferred();const task=f.bridge.execute('AB','save');f.setForm(true);f.draft('AB').snapshot.name='opened after flush began';f.gates.flush.resolve();await task;assert(!f.calls.some(c=>c.type==='confirm'));assert.equal(f.draft('AB').snapshot.name,'original AB');return outcome(f,null);});
});

void test('unknown admission, concurrent commands and rejected Apply guards remain unchanged',async()=>{
 for(const action of actions)await runBoth(async f=>{f.setUnknown(true);await assert.rejects(()=>f.bridge.execute('AB',action),/UNKNOWN_OPERATION_CHECK_REQUIRED/);assert.equal(f.copies(),0);assert.equal(f.calls.length,0);assert.equal(f.bridge.busy(),false);return outcome(f,null);});
 await runBoth(async f=>{f.gates.command=deferred();const task=f.bridge.execute('AB','save');await Promise.resolve();await assert.rejects(()=>f.bridge.execute('C','submit'),/OPERATION_IN_PROGRESS/);f.gates.command.resolve();await task;return outcome(f,null);});
 for(const status of [409,503])await runBoth(async f=>{f.draft('AB').snapshot.name='conflicting';f.setFailure({message:'synthetic failure',status});let caught;try{await f.bridge.execute('AB','apply');}catch(error){caught={message:error.message,status:error.status,paths:error.rejectedDraftPaths};}assert.equal(f.bridge.busy(),false);assert.equal(f.draft('AB').snapshot.name,'conflicting');assert.equal(!!caught.paths,status===409);return outcome(f,caught);});
});
