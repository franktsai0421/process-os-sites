/* oxlint-disable typescript/no-require-imports -- isolated real API / CAS; no Local writes. */
const assert=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite'),{randomUUID}=require('node:crypto'),harness=require('./ipqc-ab-import-harness.cjs');
const db=new DatabaseSync(':memory:'),objects=new Map();db.exec('CREATE TABLE shared_state(id INTEGER PRIMARY KEY,revision INTEGER,"values" TEXT,updated_at TEXT);CREATE TABLE state_backups(id TEXT PRIMARY KEY,revision INTEGER,"values" TEXT,reason TEXT,actor TEXT,created_at TEXT)');
const env={PROCESS_SESSION_SECRET:randomUUID(),STATE_ARCHIVE:{async put(k,v){objects.set(k,v);},async get(k){return objects.has(k)?{text:async()=>objects.get(k)}:null;},async head(k){return objects.has(k)?{}:null;}},DB:{prepare(sql){let args=[];return{bind(...v){args=v;return this;},async first(){return db.prepare(sql).get(...args)||null;},async run(){return{meta:{changes:Number(db.prepare(sql).run(...args).changes)}};}};}}};
const load=harness(env),core=load('lib/process-state.ts'),api=load('app/api/master/workflow/route.ts'),link=load('lib/master-stage-link.ts'),copy=v=>JSON.parse(JSON.stringify(v)),sessions={},seq={};
 const users=['a','b','reviewer'].map(id=>({id,name:id,role:'rd',enabled:true,inheritRole:false,views:['data','approval'],permissions:['approval.submit','approval.withdraw','approval.approve','approval.reject','approval.compare','master.delete']}));
const catalog=line=>({products:[{code:line+'1',name:'Sản phẩm',line,category:'G',stages:[line+'-CUT']}],lines:[{code:line,name:line,stages:[{code:line+'-CUT',name:'Cắt'}]}],categoryGroups:[{line,name:'G'}]});
const active={AB:catalog('A'),C:catalog('C'),PROCESS:{'A-CUT':link.stageDefaultTemplates('A-CUT'),'C-CUT':link.stageDefaultTemplates('C-CUT')}},root={active:copy(active),versions:Object.entries(active).map(([scope,snapshot])=>({scope,snapshot:copy(snapshot),id:scope+'-active',number:1,status:'approved',revision:1,creatorId:'system',creatorName:'system',createdAt:'fixture',updatedAt:'fixture',history:[]}))};
db.prepare('INSERT INTO shared_state VALUES(1,1,?,?)').run(JSON.stringify({platformUsers:JSON.stringify(users),masterDataControl:JSON.stringify(root),processMasterData:JSON.stringify(root.active.PROCESS)}),'fixture');
const url=scope=>'http://fixture/api/master/workflow?scope='+scope+'&caseMetadata=1';
async function get(scope,who='a',query=''){const r=await api.GET(new Request(url(scope)+query,{headers:sessions[who]}));assert.equal(r.status,200);return r.json();}
async function post(scope,who,body,expected=200){const r=await api.POST(new Request(url(scope),{method:'POST',headers:sessions[who],body:JSON.stringify(body)})),data=await r.json();assert.equal(r.status,expected,JSON.stringify(data));return data;}
async function cmd(scope,who,action,detail={}){return{action,...detail,operationId:randomUUID(),clientId:'stage-link-'+who,sequence:seq[scope+who]=(seq[scope+who]||0)+1,generation:(await get(scope,who)).control.workflow.generation};}
async function run(scope,who,action,detail={},expected=200){return post(scope,who,{command:await cmd(scope,who,action,detail)},expected);}
async function state(){const s=await core.readState();return{s,root:JSON.parse(s.values.masterDataControl)};}
let checks=0;async function check(name,fn){await fn();checks++;console.log('PASS '+name);}

void (async()=>{try{
 for(const user of users)sessions[user.id]={Cookie:'process_demo='+await core.demoSession(new Request(url('AB')),user.id,false),Origin:'http://fixture','Content-Type':'application/json'};
 await post('AB','a',{action:'begin'});
 const emptyLine={id:'line:isolated',code:'ISOLATED',name:'Synthetic',stages:[]};
 await run('AB','a','apply',{patches:[{op:'insert',path:['lines'],value:emptyLine}]});
 const stage={id:'stage:isolated',code:'ISOLATED-CUT',name:'Synthetic stage'};
 await run('AB','a','apply',{patches:[{op:'insert',path:['lines',{id:emptyLine.id},'stages'],value:stage}]});
 const linePath=['lines',{id:emptyLine.id}],stagePath=[...linePath,'stages',{id:stage.id}];
 await check('API rejects removal of an unreferenced line with children; revision unchanged',async()=>{
  const before=await state(),line=before.root.workflowScopes.AB.working.lines.find(l=>l.id===emptyLine.id);
  const response=await run('AB','a','apply',{patches:[{op:'remove',path:linePath}],guards:[{path:linePath,value:line}]},409);
  assert.equal(response.error,'LINE_HAS_STAGES');assert.equal((await state()).s.revision,before.s.revision);
 });
 await check('new unused stage can be removed; empty line then removed without affecting A',async()=>{
  await run('AB','a','apply',{patches:[{op:'remove',path:stagePath}],guards:[{path:stagePath,value:stage}]});
  await run('AB','a','apply',{patches:[{op:'remove',path:linePath}],guards:[{path:linePath,value:emptyLine}]});
  assert.equal((await state()).root.workflowScopes.AB.working.lines.length,1);
 });
 await check('stale delete guard refuses concurrently added child',async()=>{
  emptyLine.id+='-race';stage.id+='-race';linePath[1].id=emptyLine.id;
  await run('AB','a','apply',{patches:[{op:'insert',path:['lines'],value:emptyLine}]});
  const command=await cmd('AB','a','apply',{patches:[{op:'remove',path:linePath}],guards:[{path:linePath,value:emptyLine}]});
  await run('AB','b','apply',{patches:[{op:'insert',path:[...linePath,'stages'],value:stage}]});
  await post('AB','a',{command},409);assert.equal((await state()).root.workflowScopes.AB.working.lines.find(l=>l.id===emptyLine.id).stages.length,1);
 });
 await check('save/submit/return/resubmit/withdraw/resubmit/approve keeps active isolated until approval',async()=>{
  const saved=(await run('AB','a','save')).control.workflow.saved;
  let sent=await run('AB','a','submit',{savedId:saved.id,reason:'Synthetic stage review'});
  assert(!((await state()).root.active.AB.lines.some(l=>l.id===emptyLine.id)));
  await run('AB','reviewer','return',{caseId:sent.receipt.caseId,reason:'Synthetic return'});
  sent=await run('AB','a','submit',{savedId:saved.id,reason:'Synthetic resubmit'});
  await run('AB','a','withdraw',{caseId:sent.receipt.caseId,reason:'Synthetic withdrawal'});
  sent=await run('AB','a','submit',{savedId:saved.id,reason:'Synthetic final submission'});
  await run('AB','reviewer','approve',{caseId:sent.receipt.caseId});
  const final=await state();assert(final.root.active.AB.lines.some(l=>l.id===emptyLine.id));assert(final.root.active.PROCESS[stage.code]);
 });
 await check('hidden authoring workspaces and group/product routes remain stage references',async()=>{
  const refs=load('lib/master-stage-references.ts').stageReferences;
  const result=refs({masterDataControl:JSON.stringify({active:{AB:{products:[{code:'P',stages:['A-HIDDEN']}],categoryGroups:[{name:'G',defaultStages:['A-HIDDEN']}]}}}),processAuthoringControl:JSON.stringify({workflow:{working:{workspaces:[{id:'hidden',stages:{'A-HIDDEN':[{id:'op'}]}}]}}})},['A-HIDDEN']);
  assert.equal(result.total,3);assert(result.references.some(r=>r.id==='op'));
 });
 await check('delete remains blocked while reference details follow editor view permission',async()=>{
  const current=await state(),updatedUsers=JSON.parse(current.s.values.platformUsers);
  updatedUsers.find(u=>u.id==='a').accessOverrides={'editor.view':false};updatedUsers.find(u=>u.id==='b').accessOverrides={'editor.view':true};
  const values={...current.s.values,platformUsers:JSON.stringify(updatedUsers),approvalVersions:JSON.stringify([{id:'private-version',status:'approved',stages:{[stage.code]:[{id:'private-operation'}]}}])};
  db.prepare('UPDATE shared_state SET revision=revision+1,"values"=?').run(JSON.stringify(values));
  await post('AB','a',{action:'begin'});
  const currentStage=(await state()).root.workflowScopes.AB.working.lines.find(l=>l.id===emptyLine.id).stages[0];
  const path=['lines',{id:emptyLine.id},'stages',{id:currentStage.id}];
  const detail={patches:[{op:'remove',path}],guards:[{path,value:currentStage}]};
  const hidden=await run('AB','a','apply',detail,409);assert.equal(hidden.error,'STAGE_IN_USE');assert.equal(hidden.details.hidden,true);assert(!JSON.stringify(hidden).includes('private-operation'));assert(!JSON.stringify(hidden).includes('private-version'));
  const visible=await run('AB','b','apply',detail,409);assert.equal(visible.error,'STAGE_IN_USE');assert(visible.details.references.some(r=>r.id==='private-operation'&&r.resolveUrl==='/process/?system=process&view=editor'));
  const reference=visible.details.references.find(r=>r.id==='private-operation'),detailAPI=load('app/api/master/stage-reference/route.ts');assert(reference.detailQuery);
  const detailURL='http://fixture/api/master/stage-reference?'+reference.detailQuery,beforeDetail=(await state()).s.revision;
  const allowedDetail=await detailAPI.GET(new Request(detailURL,{headers:sessions.b}));assert.equal(allowedDetail.status,200);assert.equal((await allowedDetail.json()).record.id,'private-operation');
  const deniedDetail=await detailAPI.GET(new Request(detailURL,{headers:sessions.a}));assert.equal(deniedDetail.status,403);assert(!JSON.stringify(await deniedDetail.json()).includes('private-operation'));
  const forged=new URL(detailURL);forged.searchParams.set('source','authoring:working');assert.equal((await detailAPI.GET(new Request(forged,{headers:sessions.b}))).status,404);
  const invalid=new URL(detailURL);invalid.searchParams.set('scope','PROCESS');assert.equal((await detailAPI.GET(new Request(invalid,{headers:sessions.b}))).status,422);assert.equal((await state()).s.revision,beforeDetail);
  assert((await state()).root.workflowScopes.AB.working.lines.find(l=>l.id===emptyLine.id).stages.length===1);
 });
 await check('all protected reference sources and superseded-history policy',async()=>{
  const refs=load('lib/master-stage-references.ts').stageReferences,code='TARGET',catalog={products:[{id:'p',code:'P',stages:[code]}],categoryGroups:[{id:'g',name:'G',defaultStages:[code]}]},operations={workspaces:[{id:'hidden',stages:{[code]:[{id:'hidden-op'}]}}]};
  for(const [name,values,previous,count] of [
   ['active',{masterDataControl:JSON.stringify({active:{AB:catalog}})},undefined,2],
   ...['draft','pending','pending-test'].map(status=>[status,{masterDataControl:JSON.stringify({versions:[{id:status,scope:'AB',status,snapshot:catalog}]})},undefined,2]),
   ['working/saved',{masterDataControl:JSON.stringify({workflowScopes:{AB:{working:catalog,saved:{content:catalog}}}})},undefined,4],
   ['previous',{},catalog,2],
   ...['approved','draft','pending','pending-test'].map(status=>['legacy-'+status,{approvalVersions:JSON.stringify([{id:status,status,...operations}])},undefined,1]),
   ['legacy-editor',{'processEditor:fixture':JSON.stringify(operations)},undefined,1],
   ['authoring',{processAuthoringControl:JSON.stringify({workflow:{active:{content:operations},working:operations,saved:{content:operations},cases:[{id:'pending',status:'pending',content:operations}]}})},undefined,4],
   ['superseded-readonly',{masterDataControl:JSON.stringify({versions:[{id:'old',scope:'AB',status:'superseded',snapshot:catalog}]}),approvalVersions:JSON.stringify([{id:'old',status:'superseded',...operations}])},undefined,0],
   ['authoring-replaces-legacy',{processAuthoringControl:JSON.stringify({workflow:{working:{}}}),approvalVersions:JSON.stringify([{id:'old',status:'approved',...operations}]),'processEditor:fixture':JSON.stringify(operations)},undefined,0],
  ])assert.equal(refs(values,[code],previous).total,count,name);
 });
 await check('reference added after preflight still blocks authoritative delete',async()=>{
  const snapshot=await state(),refs=load('lib/master-stage-references.ts').stageReferences,flow=snapshot.root.workflowScopes.AB;
  const newStage={id:'race-ref-stage',code:'REF-RACE',name:'Race'};const owner=flow.working.lines.find(l=>l.id===emptyLine.id);const path=['lines',{id:owner.id},'stages',{id:newStage.id}];
  await run('AB','a','apply',{patches:[{op:'insert',path:path.slice(0,-1),value:newStage}]});const preflight=await state();assert.equal(refs(preflight.s.values,[newStage.code]).total,0);
  const command=await cmd('AB','a','apply',{patches:[{op:'remove',path}],guards:[{path,value:newStage}]});
  const values={...preflight.s.values,processAuthoringControl:JSON.stringify({workflow:{working:{workspaces:[{id:'new-peer-reference',stages:{[newStage.code]:[{id:'peer-operation'}]}}]}}})};db.prepare('UPDATE shared_state SET revision=revision+1,"values"=?').run(JSON.stringify(values));
  const before=await state(),response=await post('AB','a',{command},409);assert.equal(response.error,'STAGE_IN_USE');assert.equal((await state()).s.revision,before.s.revision);
 });
 console.log(JSON.stringify({status:'PASS',checks,synthetic:true}));
 }catch(e){console.error(e);process.exitCode=1;}finally{db.close();}})();
