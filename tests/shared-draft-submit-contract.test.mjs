// Synthetic data only: production kernels/HTTP handlers, in-memory SQLite/R2,
// and distinct signed application sessions. No listener or external service.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {accessKeys} from '../public/process/access-policy.mjs';
const require=createRequire(import.meta.url),harness=require('../scripts/ipqc-ab-import-harness.cjs');
const load=harness(),{createSharedDraft,applyDraftCommand,stableDraftJSON}=load('lib/shared-draft.ts');
const actors={a:{id:'actor-a',name:'合成 A',admin:true},b:{id:'actor-b',name:'Tổng hợp B',admin:true}};
const at='2026-10-30T00:00:00Z';
function kernel(scope='master:AB'){
 let state=createSharedDraft(scope,{items:[{id:'row',name:'Initial',note:''}]},null,randomUUID());
 const sequence={a:0,b:0};
 const command=(who,action,extra={})=>({action,operationId:randomUUID(),clientId:'client-'+who,generation:state.generation,sequence:++sequence[who],...(action==='submit'?{expectedRevision:state.revision,savedId:state.saved?.id,reason:'Synthetic review'}:{}),...extra});
 const send=(who,cmd,override={})=>{const result=applyDraftCommand(state,cmd,{actor:actors[who],at,id:randomUUID,allowed:()=>true,structure(){},validate:()=>[],semantic:x=>x,activeId:state.active.id,...override});state=result.state;return result;};
 return {get state(){return state;},command,send,run:(who,action,extra)=>send(who,command(who,action,extra))};
}
const field=(name,value)=>({op:'set',path:['items',{id:'row'},name],value});
function unchangedOnFailure(f,who,cmd,code){const before=stableDraftJSON(f.state);assert.throws(()=>f.send(who,cmd),e=>e.code===code&&e.status===409);assert.equal(stableDraftJSON(f.state),before);assert.equal(f.state.receipts[cmd.operationId],undefined);}

for(const scope of ['master:AB','master:C','master:PROCESS','bom','process:platform','fqc','iqc','ipqc-c','routine-equipment','tooling'])void test(scope+' refuses unsaved shared changes and never mutates on rejection',()=>{
 const f=kernel(scope);f.run('a','save');const confirmed=f.command('a','submit');
 f.run('b','apply',{patches:[field('name','B 的新內容 / Nội dung mới')],guards:[{path:field('name','').path,value:'Initial'}]});
 unchangedOnFailure(f,'a',confirmed,'DRAFT_REVISION_CHANGED_RECONFIRM');
 unchangedOnFailure(f,'a',f.command('a','submit'),'UNSAVED_CHANGES_SAVE_REQUIRED');
 f.run('b','save');const result=f.run('a','submit');assert.equal(f.state.cases.length,1);assert.equal(f.state.cases[0].content.items[0].name,'B 的新內容 / Nội dung mới');assert.equal(f.state.pendingId,result.receipt.caseId);
});

void test('missing/invalid expected revision and wrong saved token cannot create a case',()=>{
 const f=kernel();f.run('a','save');
 for(const expectedRevision of [undefined,null,'1',-1,1.5,Number.MAX_SAFE_INTEGER+1])unchangedOnFailure(f,'a',f.command('a','submit',{expectedRevision}),'DRAFT_REVISION_REQUIRED');
 unchangedOnFailure(f,'a',f.command('a','submit',{expectedRevision:f.state.revision-1}),'DRAFT_REVISION_CHANGED_RECONFIRM');
 unchangedOnFailure(f,'a',f.command('a','submit',{savedId:'other-save'}),'SAVED_VERSION_CHANGED_RECONFIRM');
});

void test('interleaved submit makes one case; return/withdraw retain fixed Save and fence old generations',()=>{
 for(const action of ['withdraw','return']){
  const f=kernel();f.run('a','save');const a=f.command('a','submit'),b=f.command('b','submit'),receipt=f.send('a',a).receipt;
  unchangedOnFailure(f,'b',b,'DRAFT_REVISION_CHANGED_RECONFIRM');assert.equal(f.state.cases.length,1);
  const stale=f.command('b','submit'),saved=stableDraftJSON(f.state.saved);
  f.run('b',action,{caseId:receipt.caseId,reason:'Recheck'});
  unchangedOnFailure(f,'b',stale,'STALE_GENERATION');assert.equal(stableDraftJSON(f.state.saved),saved);
  f.run('a','submit');assert.equal(f.state.cases.length,2);assert.equal(stableDraftJSON(f.state.saved),saved);
 }
});

void test('exact historical receipt without revision survives policy change; permissions and actor binding remain',()=>{
 const f=kernel();f.run('a','save');const command=f.command('a','submit'),result=f.send('a',command);
 const legacy={...command};delete legacy.expectedRevision;
 f.state.receipts[command.operationId].fingerprint=stableDraftJSON(legacy);
 f.run('b','approve',{caseId:result.receipt.caseId});const before=stableDraftJSON(f.state);
 assert.deepEqual(f.send('a',legacy).receipt,result.receipt);assert.equal(stableDraftJSON(f.state),before);
 assert.throws(()=>f.send('b',legacy),e=>e.code==='OPERATION_ID_REUSED');
 assert.throws(()=>f.send('a',legacy,{allowed:()=>false}),e=>e.code==='FORBIDDEN');assert.equal(stableDraftJSON(f.state),before);
});

void test('IPQC-AB module compares latest group Apply even when module revision is unchanged',()=>{
 const adapter=load('lib/ipqc-ab-module-workflow.ts').abModuleWorkflowAdapter(),content={errors:[],items:[]};
 const group=createSharedDraft('ipqc-ab:A:G',content,null,'group-generation');
 const root={schemaVersion:1,scopes:{'A:G':{line:'A',group:'G',activeVersionId:null,versions:[],workflow:group}},source:null,reservedErrorCodes:[],reservedItemCodes:[]};
 const control=adapter.parse(JSON.stringify(root));control.workflow=createSharedDraft('ipqc-ab:module',adapter.empty(),null,'module-generation');
 let seq=0;
 const cmd=(action,extra={})=>({action,operationId:randomUUID(),clientId:'module-client',generation:control.workflow.generation,sequence:++seq,expectedRevision:control.workflow.revision,...extra});
 const ctx={actor:actors.a,at,id:randomUUID,allowed:()=>true,structure(){},validate:()=>[],semantic:x=>x.scopes,activeId:null};
 const saved=adapter.apply(control,cmd('save'),ctx);control.workflow=saved.state;
 // A second actor changes group working through the real kernel; the module's
 // last Save copy and revision are deliberately unchanged.
 const parsed=adapter.serializeModel(control),live=parsed.scopes['A:G'].workflow;
 parsed.scopes['A:G'].workflow=applyDraftCommand(live,{action:'apply',operationId:randomUUID(),clientId:'group-client-b',generation:live.generation,sequence:1,patches:[{op:'insert',path:['errors'],value:{id:'new-error',name:'B'}}]},{...ctx,actor:actors.b}).state;
 const before=stableDraftJSON(parsed),submission=cmd('submit',{savedId:control.workflow.saved.id,reason:'Confirm'});
 assert.throws(()=>adapter.apply(control,submission,ctx),e=>e.code==='UNSAVED_CHANGES_SAVE_REQUIRED');assert.equal(stableDraftJSON(parsed),before);
 control.workflow=adapter.apply(control,cmd('save'),ctx).state;
 const accepted=adapter.apply(control,cmd('submit',{savedId:control.workflow.saved.id,reason:'Confirm after Save'}),ctx);
 assert.equal(accepted.state.cases[0].content.scopes['A:G'].errors[0].id,'new-error');
});

for(const kind of ['plan','report','waiver','disposal'])void test('routine FQC '+kind+' enforces the document revision and keeps other documents independent',()=>{
 const routine=load('lib/routine-fqc.ts'),source={id:'source',name:'Synthetic',versionId:'source-v1',products:[{code:'sample',name:'Synthetic'}]},content={title:'Synthetic',date:'2026-10-30',notes:'',reason:'Synthetic reason',disposition:'Synthetic',evidence:['a'.repeat(64)],lines:[{id:'line',jobId:'job',source,results:[{id:'result',samples:['sample'],outcome:'pass',value:'10',notes:'',photos:[]}]}]};
 let control=routine.emptyRoutine(),sequence=0;
 control.cases.push({id:'case-link',jobId:'job',status:'open'});
 for(const id of ['one','two'])control.documents.push({id,number:id,kind,planId:null,caseId:kind==='waiver'||kind==='disposal'?'case-link':null,correctionOf:null,createdAt:at,owner:actors.a,flow:createSharedDraft('routine-fqc:'+id,content,null,randomUUID())});
 const doc=id=>control.documents.find(d=>d.id===id);
 const command=(id,action,extra={})=>{const operationId=randomUUID();return{action:'draft',documentId:id,operationId,command:{action,operationId,generation:doc(id).flow.generation,clientId:'routine-client',sequence:++sequence,expectedRevision:doc(id).flow.revision,...(action==='submit'?{savedId:doc(id).flow.saved.id}:{}),...extra}};};
 const send=(who,cmd)=>{const next=structuredClone(control),result=routine.executeRoutine(next,cmd,[],{actor:actors[who],at,today:'2026-10-30',allowed:()=>true,settings:true,revoke:true,revise:true});control=next;return result;};
 send('a',command('one','save'));const old=command('one','submit');
 send('b',command('one','apply',{patches:[{op:'set',path:['notes'],value:'B'}],guards:[{path:['notes'],value:''}]}));
 const before=stableDraftJSON(control);assert.throws(()=>send('a',old),e=>e.code==='DRAFT_REVISION_CHANGED_RECONFIRM');
 assert.throws(()=>send('a',command('one','submit')),e=>e.code==='UNSAVED_CHANGES_SAVE_REQUIRED');assert.equal(stableDraftJSON(control),before);
 send('a',command('one','save'));const confirmed=command('one','submit');
 send('b',command('two','apply',{patches:[{op:'set',path:['notes'],value:'Unrelated document'}],guards:[{path:['notes'],value:''}]}));
 send('a',confirmed);assert.ok(doc('one').flow.pendingId);assert.equal(doc('two').flow.pendingId,null);assert.equal(doc('two').flow.working.notes,'Unrelated document');
});

async function httpFixture(){
 const db=new DatabaseSync(':memory:'),objects=new Map();let writes=0,barrier=null;
 const raceNextWrites=()=>{let arrivals=0,release;const ready=new Promise(resolve=>{release=resolve;}),timer=setTimeout(()=>release(),3000),gate={get arrivals(){return arrivals;},async enter(){arrivals++;if(arrivals===2){clearTimeout(timer);release();barrier=null;}await ready;}};barrier=gate;return gate;};
 db.exec('CREATE TABLE shared_state(id INTEGER PRIMARY KEY,revision INTEGER NOT NULL,"values" TEXT NOT NULL,updated_at TEXT NOT NULL)');
 const env={PROCESS_SESSION_SECRET:randomUUID(),DB:{prepare(sql){let args=[];return{bind(...value){args=value;return this;},async first(){return db.prepare(sql).get(...args)||null;},async all(){return{results:db.prepare(sql).all(...args)};},async run(){if(sql.startsWith('UPDATE shared_state SET revision=?')&&barrier)await barrier.enter();const changes=Number(db.prepare(sql).run(...args).changes);writes+=changes;return{meta:{changes}};}};}},STATE_ARCHIVE:{async put(key,value){objects.set(key,value);},async head(key){return objects.has(key)?{}:null;},async get(key){return objects.has(key)?{text:async()=>String(objects.get(key))}:null;}}};
 const users=['actor-a','actor-b'].map(id=>({id,name:id,role:'admin',authMode:'platform',enabled:true,accessOverrides:Object.fromEntries(accessKeys.map(key=>[key,true]))}));
 const h=harness(env),core=h('lib/process-state.ts'),endpoint='https://fixture.invalid/api/master/workflow?scope=AB';
 const content=line=>({products:[{code:line+'1',name:'Synthetic',line,category:'G',stages:[line+'-CUT']}],lines:[{code:line,name:line,stages:[{code:line+'-CUT',name:'Cut'}]}],categoryGroups:[{line,name:'G'}]});
 const templates=h('lib/master-stage-link.ts').stageDefaultTemplates;
 const active={AB:content('A'),C:content('C'),PROCESS:{'A-CUT':templates('A-CUT'),'C-CUT':templates('C-CUT')}};
 const values={platformUsers:JSON.stringify(users),masterDataControl:JSON.stringify({active,versions:Object.entries(active).map(([scope,snapshot])=>({id:'active-'+scope,scope,status:'approved',number:1,revision:1,snapshot,creatorId:'synthetic',creatorName:'Synthetic',createdAt:at,updatedAt:at,history:[]}))}),processMasterData:JSON.stringify(active.PROCESS)};
 const seed=next=>db.prepare('INSERT OR REPLACE INTO shared_state(id,revision,"values",updated_at) VALUES(1,1,?,?)').run(JSON.stringify(next),at);seed(values);
 const sessions=Object.fromEntries(await Promise.all(users.map(async user=>[user.id,await core.demoSession(new Request(endpoint),user.id,false)])));
 const request=async(path,body,who='actor-a')=>{const api=h(path.split('?')[0].replace('/api/','app/api/')+'/route.ts'),url='https://fixture.invalid'+path,response=await api[body?'POST':'GET'](new Request(url,{method:body?'POST':'GET',headers:{Cookie:'process_demo='+sessions[who],Origin:'https://fixture.invalid','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}));return{status:response.status,body:await response.json()};};
 const records=async()=>{const state=await core.readState(),raw=await h('lib/state-records.ts').encodeRecordValues(env.STATE_ARCHIVE,state.values);db.prepare('UPDATE shared_state SET "values"=? WHERE id=1').run(raw);};
 return{db,seed,values,h,core,request,objects,records,raceNextWrites,get writes(){return writes;},raw:()=>db.prepare('SELECT revision,"values" FROM shared_state WHERE id=1').get(),close:()=>db.close()};
}

for(const storage of ['inline','records-v1'])void test(storage+': actual HTTP CAS with two signed actors refuses stale/dirty submit, unrelated writes are not scope conflicts, concurrent submit creates one case',async()=>{
 const f=await httpFixture(),path='/api/master/workflow?scope=AB',seq={};
 const ok=result=>{assert.equal(result.status,200,JSON.stringify(result.body));return result.body;};
 const read=async()=>ok(await f.request(path));
 const command=(flow,who,action,extra={})=>({action,operationId:randomUUID(),clientId:'http-'+who,sequence:seq[who]=(seq[who]||0)+1,generation:flow.generation,...(action==='submit'?{expectedRevision:flow.revision,savedId:flow.saved.id,reason:'Synthetic'}:{}),...extra});
 const send=(who,cmd)=>f.request(path,{command:cmd},who);
 try{
  if(storage==='records-v1')await f.records();
  ok(await f.request(path,{action:'begin'}));let flow=(await read()).control.workflow;const name=['products',{id:flow.working.products[0].id},'name'];
  ok(await send('actor-a',command(flow,'actor-a','apply',{patches:[{op:'set',path:name,value:'A saved'}],guards:[{path:name,value:'Synthetic'}]})));
  ok(await send('actor-a',command((await read()).control.workflow,'actor-a','save')));flow=(await read()).control.workflow;const stale=command(flow,'actor-a','submit');
  ok(await send('actor-b',command(flow,'actor-b','apply',{patches:[{op:'set',path:name,value:'B unsaved'}],guards:[{path:name,value:'A saved'}]})));
  let before=f.raw(),writes=f.writes;assert.equal((await send('actor-a',stale)).body.error,'DRAFT_REVISION_CHANGED_RECONFIRM');
  flow=(await read()).control.workflow;assert.equal((await send('actor-a',command(flow,'actor-a','submit'))).body.error,'UNSAVED_CHANGES_SAVE_REQUIRED');assert.deepEqual(f.raw(),before);assert.equal(f.writes,writes);
  ok(await send('actor-b',command(flow,'actor-b','save')));flow=(await read()).control.workflow;const a=command(flow,'actor-a','submit'),b=command(flow,'actor-b','submit');
  // An unrelated global state revision does not invalidate the shown scope.
  f.db.prepare('UPDATE shared_state SET revision=revision+1 WHERE id=1').run();
  const gate=f.raceNextWrites(),results=await Promise.all([send('actor-a',a),send('actor-b',b)]);assert.equal(gate.arrivals,2,'both actors reached CAS with the same revision');assert.deepEqual(results.map(r=>r.status).sort((left,right)=>left-right),[200,409]);
  const after=(await read()).control.workflow;assert.equal(after.cases.length,1);assert.equal(after.cases[0].content.products[0].name,'B unsaved');
  const winner=results[0].status===200?['actor-a',a]:['actor-b',b];before=f.raw();writes=f.writes;ok(await send(...winner));assert.deepEqual(f.raw(),before);assert.equal(f.writes,writes);
 }finally{f.close();}
});

void test('all four legacy submit endpoints reject without writes or storage conversion',async()=>{
 const f=await httpFixture();try{for(const path of ['/api/iqc','/api/ipqc-c','/api/ipqc-ab','/api/routine-equipment']){
  const before=f.raw(),writes=f.writes,r=await f.request(path,{action:'submit',baseRevision:before.revision,line:'A',group:'G',snapshot:{errors:[],items:[]}});
  assert.equal(r.status,409,path+': '+JSON.stringify(r.body));assert.equal(r.body.error,'WORKFLOW_V3_REQUIRED');assert.deepEqual(f.raw(),before);assert.equal(f.writes,writes);assert.equal(f.objects.size,0);
 }}finally{f.close();}
});

void test('generic legacy new pending transitions reject while existing pending can return to draft',async()=>{
 const f=await httpFixture();try{
  for(const key of ['masterDataControl','qualityMasterControl','approvalVersions'])for(const status of ['pending','pending-test']){
   const before=f.raw(),master=JSON.parse(f.values.masterDataControl),pending={id:'new-pending',scope:'AB',status,snapshot:master.active.AB,stages:{}};
   const value=key==='masterDataControl'?{...master,versions:[...master.versions,pending]}:key==='qualityMasterControl'?{schemaVersion:1,libraries:{fqc:{versions:[pending]}}}:[pending];
   const r=await f.request('/api/shared-state',{baseRevision:before.revision,updates:{[key]:JSON.stringify(value)}});assert.equal(r.status,409,JSON.stringify(r.body));assert.equal(r.body.error,'WORKFLOW_V3_REQUIRED');assert.deepEqual(f.raw(),before);
  }
  const pending={id:'existing-pending',status:'pending',stages:{},category:'G',line:'A'};f.seed({...f.values,approvalVersions:JSON.stringify([pending])});
  const r=await f.request('/api/shared-state',{baseRevision:1,updates:{approvalVersions:JSON.stringify([{...pending,status:'draft'}])}});assert.equal(r.status,200,JSON.stringify(r.body));
 }finally{f.close();}
});

void test('records FQC bounded lifecycle reader hydrates working and fixed Save before strict Submit',async()=>{
 const f=await httpFixture(),path='/api/fqc/workflow';let sequence=0;
 const ok=r=>{assert.equal(r.status,200,JSON.stringify(r.body));return r.body;},read=async()=>ok(await f.request(path)).control.workflow;
 const command=(flow,action,extra={})=>({action,operationId:randomUUID(),clientId:'fqc-contract-client',generation:flow.generation,sequence:++sequence,...(action==='submit'?{expectedRevision:flow.revision,savedId:flow.saved.id,reason:'Synthetic'}:{}),...extra});
 const send=(who,cmd)=>f.request(path,{command:cmd},who);
 try{
  f.seed({...f.values,qualityMasterControl:JSON.stringify({schemaVersion:1,libraries:{}})});await f.records();ok(await f.request(path,{action:'begin'}));let flow=await read();
  ok(await send('actor-a',command(flow,'apply',{patches:[{op:'insert',path:['errors'],value:{id:'synthetic-error',name:'Saved',category:'G',line:'A'}}]})));
  ok(await send('actor-a',command(await read(),'save')));flow=await read();const old=command(flow,'submit');
  ok(await send('actor-b',command(flow,'apply',{patches:[{op:'set',path:['errors',{id:'synthetic-error'},'name'],value:'B unsaved'}],guards:[{path:['errors',{id:'synthetic-error'},'name'],value:'Saved'}]})));flow=await read();
  const latest=command(flow,'submit'),bounded=await f.h('lib/fqc-lifecycle8-record-mutation.ts').readFqcLifecycle8MutationState(latest);
  assert.ok(bounded,'exercise the actual bounded lifecycle capability');const boundedFlow=bounded.recordStorage.models.get('qualityMasterControl').libraries.fqc.workflow;
  assert.equal(boundedFlow.working.errors[0].name,'B unsaved');assert.equal(boundedFlow.saved.content.errors[0].name,'Saved');
  const before=f.raw(),writes=f.writes,objects=f.objects.size;
  assert.equal((await send('actor-a',old)).body.error,'DRAFT_REVISION_CHANGED_RECONFIRM');assert.equal((await send('actor-a',latest)).body.error,'UNSAVED_CHANGES_SAVE_REQUIRED');
  assert.equal((await send('actor-a',command(flow,'submit',{expectedRevision:undefined}))).body.error,'DRAFT_REVISION_REQUIRED');
  assert.deepEqual(f.raw(),before);assert.equal(f.writes,writes);assert.equal(f.objects.size,objects);
  ok(await send('actor-b',command(flow,'save')));ok(await send('actor-a',command(await read(),'submit')));flow=await read();assert.equal(flow.cases.length,1);assert.equal(flow.cases[0].content.errors[0].name,'B unsaved');assert.ok(JSON.parse(f.raw().values).__processRecords);
 }finally{f.close();}
});

void test('revoked Submit permission rejects a previously confirmed command without writes',async()=>{
 const f=await httpFixture(),path='/api/master/workflow?scope=AB';
 const ok=r=>{assert.equal(r.status,200,JSON.stringify(r.body));return r.body;};
 try{
  let flow=ok(await f.request(path,{action:'begin'})).control.workflow;
  const command=(action,extra={})=>({action,operationId:randomUUID(),clientId:'revoked-client',sequence:action==='save'?1:2,generation:flow.generation,...extra});
  flow=ok(await f.request(path,{command:command('save')})).control.workflow;const confirmed=command('submit',{expectedRevision:flow.revision,savedId:flow.saved.id,reason:'Synthetic'});
  const row=f.raw(),values=JSON.parse(row.values),users=JSON.parse(values.platformUsers);users.find(u=>u.id==='actor-a').accessOverrides['ab.submit']=false;values.platformUsers=JSON.stringify(users);
  f.db.prepare('UPDATE shared_state SET revision=revision+1,"values"=? WHERE id=1').run(JSON.stringify(values));
  const before=f.raw(),writes=f.writes,r=await f.request(path,{command:confirmed});assert.equal(r.status,403,JSON.stringify(r.body));assert.equal(r.body.error,'FORBIDDEN');assert.deepEqual(f.raw(),before);assert.equal(f.writes,writes);
 }finally{f.close();}
});
