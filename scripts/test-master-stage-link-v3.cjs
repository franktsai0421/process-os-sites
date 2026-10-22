/* oxlint-disable typescript/no-require-imports -- isolated real API / CAS; no Local writes. */
const assert=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite'),{randomUUID}=require('node:crypto'),harness=require('./ipqc-ab-import-harness.cjs');
const db=new DatabaseSync(':memory:'),objects=new Map();db.exec('CREATE TABLE shared_state(id INTEGER PRIMARY KEY,revision INTEGER,"values" TEXT,updated_at TEXT);CREATE TABLE state_backups(id TEXT PRIMARY KEY,revision INTEGER,"values" TEXT,reason TEXT,actor TEXT,created_at TEXT)');
const env={PROCESS_SESSION_SECRET:randomUUID(),STATE_ARCHIVE:{async put(k,v){objects.set(k,v);},async get(k){return objects.has(k)?{text:async()=>objects.get(k)}:null;},async head(k){return objects.has(k)?{}:null;}},DB:{prepare(sql){let args=[];return{bind(...v){args=v;return this;},async first(){return db.prepare(sql).get(...args)||null;},async run(){return{meta:{changes:Number(db.prepare(sql).run(...args).changes)}};}};}}};
const load=harness(env),core=load('lib/process-state.ts'),api=load('app/api/master/workflow/route.ts'),legacy=load('app/api/shared-state/route.ts'),link=load('lib/master-stage-link.ts'),copy=v=>JSON.parse(JSON.stringify(v)),sessions={},seq={};
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
(async()=>{try{
 for(const user of users)sessions[user.id]={Cookie:'process_demo='+await core.demoSession(new Request(url('AB')),user.id,false),Origin:'http://fixture','Content-Type':'application/json'};assert.equal(new Set(Object.values(sessions).map(s=>s.Cookie)).size,3);
 if(process.env.V3_STORAGE==='records'){const original=await core.readState();db.prepare('UPDATE shared_state SET "values"=?').run(await load('lib/state-records.ts').encodeRecordValues(env.STATE_ARCHIVE,original.values));}
 await post('AB','a',{action:'begin'});await post('C','b',{action:'begin'});
 const newStage={id:'stage:A-NEW',code:'A-NEW',name:'Công đoạn thử nghiệm'};
 await check('T45 necessary templates only, pinned fixed case; saved-only stage snapshot',async()=>{
  await run('AB','a','apply',{patches:[{op:'insert',path:['lines',{id:'lines:A'},'stages'],value:newStage}]});const saved=(await run('AB','b','save')).control.workflow.saved;
  await run('AB','a','apply',{patches:[{op:'set',path:['products',{id:'products:A1'},'name'],value:'unsaved unrelated edit'}]});
  const submitted=await run('AB','a','submit',{savedId:saved.id,reason:'Thêm công đoạn và mẫu bắt buộc'}),record=(await get('AB','a','&caseId='+submitted.receipt.caseId)).reviewCase;
  assert.equal(record.linkedProcess.baseVersionId,'PROCESS-active');assert.deepEqual(record.linkedProcess.added,['A-NEW']);assert.deepEqual(record.linkedProcess.removed,[]);assert.deepEqual(record.linkedProcess.before,root.active.PROCESS);
  assert.deepEqual(record.linkedProcess.content['A-CUT'],root.active.PROCESS['A-CUT']);assert.deepEqual(record.linkedProcess.content['A-NEW'],copy(link.stageDefaultTemplates('A-NEW')));assert.equal(record.content.products[0].name,'Sản phẩm');
  const current=await state();assert.deepEqual(current.root.active.PROCESS,root.active.PROCESS);assert.equal(current.root.workflowScopes.PROCESS,undefined);
 });
 await check('T16/T17 PROCESS begin/direct legacy bypass blocked; unrelated C editing allowed',async()=>{
  const before=await state();assert.equal((await post('PROCESS','b',{action:'begin'},409)).error,'LINKED_PROCESS_CASE_PENDING');
  const direct=await legacy.POST(new Request('http://fixture/api/shared-state',{method:'POST',headers:sessions.b,body:JSON.stringify({baseRevision:before.s.revision,updates:{processMasterData:JSON.stringify({...active.PROCESS,'A-NEW':[]})}})}));assert.equal(direct.status,409);assert.equal((await direct.json()).error,'LINKED_PROCESS_CASE_PENDING');
  assert.equal((await state()).s.revision,before.s.revision);
  await run('C','b','apply',{patches:[{op:'set',path:['products',{id:'products:C1'},'name'],value:'Unrelated C edit'}]});
  assert.equal((await run('C','b','apply',{patches:[{op:'insert',path:['lines',{id:'lines:C'},'stages'],value:{id:'stage:C-NEW',code:'C-NEW',name:'Mới'}}]},409)).error,'LINKED_PROCESS_CASE_PENDING');
 });
 await check('T19/T45 approval atomically activates AB + necessary PROCESS + mirror, fixed audit retained',async()=>{
  const before=await state(),caseId=before.root.workflowScopes.AB.pendingId,fixed=copy(before.root.workflowScopes.AB.cases.find(c=>c.id===caseId));await run('AB','reviewer','approve',{caseId});const after=await state();assert.equal(after.s.revision,before.s.revision+1);
  assert.ok(after.root.active.AB.lines[0].stages.some(s=>s.code==='A-NEW'));assert.deepEqual(after.root.active.PROCESS,fixed.linkedProcess.content);assert.deepEqual(JSON.parse(after.s.values.processMasterData),fixed.linkedProcess.content);assert.deepEqual(after.root.active.C,root.active.C);
  const audit=after.root.versions.find(v=>v.scope==='PROCESS'&&v.linkedCaseId===caseId);assert.equal(audit.status,'approved');assert.equal(audit.baseVersionId,'PROCESS-active');assert.equal(audit.reviewedBy,'reviewer');assert.deepEqual(after.root.workflowScopes.AB.cases.find(c=>c.id===caseId).linkedProcess,fixed.linkedProcess);
  await post('PROCESS','b',{action:'begin'});const unrelatedBefore=await state();assert.equal((await run('C','b','apply',{patches:[{op:'insert',path:['lines',{id:'lines:C'},'stages'],value:{id:'stage:C-NEW',code:'C-NEW',name:'Mới'}}]},409)).error,'PROCESS_TEMPLATE_SCOPE_BUSY');assert.equal((await state()).s.revision,unrelatedBefore.s.revision);
 });
 await check('T16/T45 source-version/hidden working guard fails closed without deleting PROCESS work',async()=>{
  const fixed={scope:'PROCESS',baseVersionId:'PROCESS-active',added:['A-NEW'],removed:[],before:root.active.PROCESS,content:{...root.active.PROCESS,'A-NEW':[]}};assert.throws(()=>link.checkPinnedStageProcessLink(root,{...fixed,baseVersionId:'missing'},'case'),/PROCESS_SOURCE_VERSION_CHANGED/);
  const guard=load('lib/master-process-lock.ts').assertStageTemplateAvailable,changed=copy(root);changed.workflowScopes={PROCESS:{working:{...active.PROCESS,'A-X':[]},active:{content:active.PROCESS},pendingId:null,cases:[],saved:null}};
  assert.throws(()=>guard(changed,root.active.AB,{...root.active.AB,lines:[{stages:[...root.active.AB.lines[0].stages,newStage]}]}),/PROCESS_TEMPLATE_SCOPE_BUSY/);
 });
 async function reset(){const values={platformUsers:JSON.stringify(users),masterDataControl:JSON.stringify(root),processMasterData:JSON.stringify(root.active.PROCESS)};db.prepare('UPDATE shared_state SET revision=revision+1,"values"=?').run(process.env.V3_STORAGE==='records'?await load('lib/state-records.ts').encodeRecordValues(env.STATE_ARCHIVE,values):JSON.stringify(values));await post('AB','a',{action:'begin'});}
 async function prepareStage(){await run('AB','a','apply',{patches:[{op:'insert',path:['lines',{id:'lines:A'},'stages'],value:newStage}]});return (await run('AB','a','save')).control.workflow.saved.id;}
 async function rawPost(scope,who,command){const r=await api.POST(new Request(url(scope),{method:'POST',headers:sessions[who],body:JSON.stringify({command})}));return{status:r.status,body:await r.json()};}
 await check('T15/T16/T45 PROCESS begin vs stage submission CAS rechecks scope lock',async()=>{
  await reset();const savedId=await prepareStage(),command=await cmd('AB','a','submit',{savedId,reason:'Thêm công đoạn'});
  const [submitted,begun]=await Promise.all([rawPost('AB','a',command),api.POST(new Request(url('PROCESS'),{method:'POST',headers:sessions.b,body:JSON.stringify({action:'begin'})})).then(async r=>({status:r.status,body:await r.json()}))]);
  assert.deepEqual([submitted.status,begun.status].sort((a,b)=>a-b),[200,409]);const current=await state();assert.deepEqual(current.root.active.PROCESS,root.active.PROCESS);
  if(submitted.status===200)assert.equal(current.root.workflowScopes.PROCESS,undefined);else assert.equal(current.root.workflowScopes.AB.pendingId,null);
 });
 await check('T19/T42 linked approve vs withdraw has one terminal result, no half activation',async()=>{
  await reset();const savedId=await prepareStage(),sent=await run('AB','a','submit',{savedId,reason:'Thêm công đoạn'}),caseId=sent.receipt.caseId;
  const approve=await cmd('AB','reviewer','approve',{caseId}),withdraw=await cmd('AB','b','withdraw',{caseId,reason:'Rút để kiểm tra'}),responses=await Promise.all([rawPost('AB','reviewer',approve),rawPost('AB','b',withdraw)]);assert.deepEqual(responses.map(r=>r.status).sort((a,b)=>a-b),[200,409]);
  const current=await state(),review=current.root.workflowScopes.AB.cases.find(c=>c.id===caseId),approved=review.status==='approved';assert.equal(current.root.workflowScopes.AB.pendingId,null);assert.equal(Object.hasOwn(current.root.active.PROCESS,'A-NEW'),approved);assert.equal(current.root.active.AB.lines[0].stages.some(s=>s.code==='A-NEW'),approved);assert.deepEqual(JSON.parse(current.s.values.processMasterData),current.root.active.PROCESS);
 });
 await check('T20/T41 linked return/withdraw preserves fixed case and releases only its lock',async()=>{
  for(const action of ['return','withdraw']){await reset();const savedId=await prepareStage(),sent=await run('AB','a','submit',{savedId,reason:'Thêm công đoạn'}),caseId=sent.receipt.caseId,fixed=(await get('AB','a','&caseId='+caseId)).reviewCase;
   await run('AB',action==='return'?'reviewer':'b',action,{caseId,reason:'Yêu cầu kiểm tra lại'});const current=await state();assert.deepEqual(current.root.active.PROCESS,root.active.PROCESS);assert.deepEqual(current.root.workflowScopes.AB.cases.find(c=>c.id===caseId).linkedProcess,fixed.linkedProcess);
   await post('PROCESS','b',{action:'begin'});assert.equal((await state()).root.workflowScopes.AB.pendingId,null);const before=(await state()).s.revision;assert.equal((await run('AB','a','submit',{savedId,reason:'Gửi lại nguyên nội dung'},409)).error,'PROCESS_TEMPLATE_SCOPE_BUSY');assert.equal((await state()).s.revision,before);
  }
 });
 await check('T45 source formal version changes before approval cannot activate a linked case',async()=>{
  await reset();const savedId=await prepareStage(),sent=await run('AB','a','submit',{savedId,reason:'Thêm công đoạn'}),caseId=sent.receipt.caseId,current=await state();current.root.versions.find(v=>v.id==='PROCESS-active').status='superseded';current.root.versions.push({...root.versions.find(v=>v.scope==='PROCESS'),id:'process-new-active'});const changed={...current.s.values,masterDataControl:JSON.stringify(current.root)};db.prepare('UPDATE shared_state SET revision=revision+1,"values"=?').run(await core.encodeValues(changed,current.s));const before=(await state()).s.revision;
  assert.equal((await run('AB','reviewer','approve',{caseId},409)).error,'PROCESS_SOURCE_VERSION_CHANGED');assert.equal((await state()).s.revision,before);assert.equal((await state()).root.workflowScopes.AB.pendingId,caseId);
 });
 console.log(JSON.stringify({result:'PASS_ISOLATED',checks,realLocalWrites:0,browser:'NOT_EXECUTED'}));
}finally{db.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
