/* oxlint-disable typescript/no-require-imports -- isolated SQLite and signed Sessions. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {DatabaseSync}=require('node:sqlite'),{randomUUID}=require('node:crypto'),harness=require('./ipqc-ab-import-harness.cjs');
const db=new DatabaseSync(':memory:'),objects=new Map();
for(const f of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())db.exec(fs.readFileSync(path.join('drizzle',f),'utf8'));
const env={PROCESS_SESSION_SECRET:randomUUID(),DB:{async batch(statements){db.exec('BEGIN');try{const results=[];for(const statement of statements)results.push({success:true,...await statement.all()});db.exec('COMMIT');return results;}catch(error){db.exec('ROLLBACK');throw error;}},prepare(sql){let args=[];return{bind(...a){args=a;return this;},async first(){return db.prepare(sql).get(...args)||null;},async all(){return{results:db.prepare(sql).all(...args)};},async run(){return{meta:{changes:Number(db.prepare(sql).run(...args).changes)}};}};}},STATE_ARCHIVE:{async put(k,v){objects.set(k,v);},async head(k){return objects.has(k)?{}:null;},async get(k){return objects.has(k)?{text:async()=>String(objects.get(k))}:null;}}};
const password=randomUUID(),users=['a','b','reviewer','admin'].map(id=>({id,name:id,password,enabled:true,role:id==='admin'?'admin':'rd',...(id==='admin'?{accessOverrides:{'ab.restore':true}}:{}),inheritRole:false,views:['data','approval'],permissions:['approval.submit','approval.withdraw','approval.approve','approval.reject','approval.compare']}));
const catalog=line=>({products:[{code:line+'1',name:'Sản phẩm',specification:'10 mm',category:'G',line,stages:[line+'-CUT']}],lines:[{code:line,name:'Chuyền',stages:[{code:line+'-CUT',name:'Cắt'}]}],categoryGroups:[{line,name:'G'}]});
const templates=stage=>['entry','manual','manual-inspection','machine-assembly','exit'].map(key=>({id:stage+key,presetKey:key,presetVersion:'existing',name:'Mẫu '+key,mediaItems:[]}));
const active={AB:catalog('A'),C:catalog('C'),PROCESS:{'A-CUT':templates('A-CUT'),'C-CUT':templates('C-CUT')}};
const original={active,versions:Object.entries(active).map(([scope,snapshot])=>({id:scope+'-active',scope,number:1,status:'approved',snapshot,revision:1,creatorId:'system',creatorName:'system',createdAt:'2026-10-01',updatedAt:'2026-10-01',history:[]}))};
db.prepare('INSERT INTO shared_state(id,revision,"values",updated_at) VALUES(1,1,?,?)').run(JSON.stringify({platformUsers:JSON.stringify(users),masterDataControl:JSON.stringify(original),processMasterData:JSON.stringify(active.PROCESS)}),'fixture');
const load=harness(env),api=load('app/api/master/workflow/route.ts'),legacy=load('app/api/shared-state/route.ts'),core=load('lib/process-state.ts'),sessions={},sequence={},results=[];
const url=scope=>'http://fixture/api/master/workflow?scope='+scope;
async function get(scope,who='a',query=''){const r=await api.GET(new Request(url(scope)+query,{headers:sessions[who]}));assert.equal(r.status,200);return r.json();}
async function send(scope,who,body){const r=await api.POST(new Request(url(scope),{method:'POST',headers:sessions[who],body:JSON.stringify(body)}));return{status:r.status,body:await r.json()};}
async function command(scope,who,action,detail={}){return{operationId:randomUUID(),clientId:'fixture-'+who+scope,sequence:sequence[who+scope]=(sequence[who+scope]||0)+1,generation:(await get(scope,who)).control.workflow.generation,action,...detail};}
async function run(scope,who,action,detail={}){const r=await send(scope,who,{command:await command(scope,who,action,detail)});assert.equal(r.status,200,JSON.stringify(r.body));return r.body;}
const set=(field,value)=>({op:'set',path:['products',{id:'products:A1'},field],value});
// Explicit captured fixture baseline only; never read/rebase a stale command here.
function fixtureSetGuards(before,patches){return{patches,guards:patches.map(p=>({path:p.path,value:p.path.reduce((row,key)=>typeof key==='string'?row?.[key]:Array.isArray(row)?row.find(item=>item.id===key.id):undefined,before)}))};}
async function check(name,fn){await fn();results.push({name,status:'PASS'});console.log('PASS '+name);}
(async()=>{try{
 for(const user of users){const r=await load('app/api/platform-login/route.ts').POST(new Request('http://fixture/api/platform-login',{method:'POST',headers:{Origin:'http://fixture','Content-Type':'application/json'},body:JSON.stringify({id:user.id,password})}));assert.equal(r.status,200);sessions[user.id]={Cookie:r.headers.get('set-cookie').split(';')[0],Origin:'http://fixture','Content-Type':'application/json'};}
 assert.equal(new Set(Object.values(sessions).map(s=>s.Cookie)).size,4);
 await check('master T01/T37 scoped opt-in preserves legacy snapshots; separate signed Sessions share one generation',async()=>{
  const before=(await core.readState()).values.masterDataControl;await get('AB');assert.equal((await core.readState()).values.masterDataControl,before);
  const begins=await Promise.all(['a','b'].map(w=>send('AB',w,{action:'begin'})));assert.ok(begins.every(r=>r.status===200));assert.equal(begins[0].body.control.workflow.generation,begins[1].body.control.workflow.generation);assert.equal(begins[0].body.control.workflow.saved,null);
  for(const scope of['C','PROCESS'])assert.equal((await send(scope,'a',{action:'begin'})).status,200);
  const root=JSON.parse((await core.readState()).values.masterDataControl);for(const v of original.versions)assert.deepEqual(root.versions.find(x=>x.id===v.id).snapshot,v.snapshot);
 });
 await check('master T02/T08 all-user synchronization and saved-only immutable submission',async()=>{
  const baseline=(await get('AB','a')).control.workflow.working;await run('AB','a','apply',fixtureSetGuards(baseline,[set('name','Tên A')]));await run('AB','b','apply',fixtureSetGuards(baseline,[set('specification','Quy cách B')]));const saved=(await run('AB','b','save')).control.workflow.saved;
  assert.equal(saved.content.products[0].name,'Tên A');assert.equal(saved.content.products[0].specification,'Quy cách B');await run('AB','a','apply',fixtureSetGuards((await get('AB','a')).control.workflow.working,[set('name','Not saved')]));const result=await run('AB','a','submit',{savedId:saved.id,reason:'Sửa dữ liệu'});assert.equal(result.control.workflow.cases.at(-1).content.products[0].name,'Tên A');
  const denied=await send('AB','b',{command:await command('AB','b','apply',fixtureSetGuards(result.control.workflow.working,[set('name','bypass')]))});assert.equal(denied.status,409);await run('AB','reviewer','approve',{caseId:result.receipt.caseId});
  const stored=JSON.parse((await core.readState()).values.masterDataControl);assert.equal(stored.active.AB.products[0].name,'Tên A');assert.deepEqual(stored.active.C,original.active.C);
 });
 await check('T16/T45 PROCESS draft blocks template-changing stage additions only',async()=>{
  await send('AB','admin',{action:'begin'});const before=await core.readState();
  const denied=await send('AB','admin',{command:await command('AB','admin','apply',{patches:[{op:'insert',path:['lines',{id:'lines:A'},'stages'],value:{id:'stage:new',code:'A-NEW',name:'Mới'}}]})});
  assert.equal(denied.status,409);assert.equal(denied.body.error,'PROCESS_TEMPLATE_SCOPE_BUSY');assert.ok(denied.body.details.resolveUrl.includes('process-master'));assert.equal((await core.readState()).revision,before.revision);
  await run('AB','admin','apply',fixtureSetGuards((await get('AB','admin')).control.workflow.working,[set('specification','unrelated edit remains allowed')]));
  const {assertStageTemplateAvailable:guard}=load('lib/master-process-lock.ts');
  const empty={lines:[]},withStage={lines:[{stages:[{code:'A-NEW'}]}]};
  for(const status of ['draft','pending','pending-test'])assert.throws(()=>guard({active:{PROCESS:{}},versions:[{scope:'PROCESS',id:'case',status}]},empty,withStage),/PROCESS_TEMPLATE_SCOPE_BUSY/);
  assert.throws(()=>guard({active:{PROCESS:{'A-NEW':[]}},versions:[],workflowScopes:{PROCESS:{pendingId:'case',cases:[{id:'case',status:'pending'}]}}},withStage,empty),/PROCESS_TEMPLATE_SCOPE_BUSY/);
  assert.doesNotThrow(()=>guard({active:{PROCESS:{}},versions:[]},empty,withStage));
  assert.doesNotThrow(()=>guard({active:{PROCESS:{'A-NEW':[]}},versions:[{scope:'PROCESS',status:'draft'}]},empty,withStage));
 });
 await check('master T17 collection bypass, indirect route removal permission, legacy write fence, public privacy',async()=>{
  await send('AB','a',{action:'begin'});let r=await send('AB','a',{command:await command('AB','a','apply',{patches:[{op:'set',path:['products'],value:[]}],guards:[{path:['products'],value:[]}]})});assert.equal(r.status,422);
  r=await send('AB','a',{command:await command('AB','a','apply',{patches:[set('stages',[])],guards:[{path:set('stages',[]).path,value:['A-CUT']}]})});assert.equal(r.status,403);
  const state=await core.readState(),bypass=await legacy.POST(new Request('http://fixture/api/shared-state',{method:'POST',headers:sessions.admin,body:JSON.stringify({baseRevision:state.revision,updates:{masterDataControl:JSON.stringify(original)}})}));assert.equal(bypass.status,409);
  const exposed=JSON.parse(core.publicState(state).values.masterDataControl);assert.equal(exposed.workflowScopes,undefined);assert.ok(exposed.versions.every(v=>v.status==='approved'));
 });
 await check('PROCESS T08 approval updates effective source and mirror in one revision',async()=>{
  await run('PROCESS','a','apply',fixtureSetGuards((await get('PROCESS','a')).control.workflow.working,[{op:'set',path:['A-CUT',{id:'A-CUTmanual'},'name'],value:'Tên quy trình mới'}]));const saved=(await run('PROCESS','a','save')).control.workflow.saved;
  const pending=await run('PROCESS','a','submit',{savedId:saved.id,reason:'Sửa mẫu'});const before=await core.readState();await run('PROCESS','reviewer','approve',{caseId:pending.receipt.caseId});const after=await core.readState();assert.equal(after.revision,before.revision+1);const root=JSON.parse(after.values.masterDataControl);assert.deepEqual(JSON.parse(after.values.processMasterData),root.active.PROCESS);assert.equal(root.active.PROCESS['A-CUT'][1].name,'Tên quy trình mới');
 });
 await check('master partial T17/T23/T45 direct cross-scope collision and restore preview enforce server permissions',async()=>{
  const before=await core.readState();const duplicate=await send('AB','a',{command:await command('AB','a','apply',{patches:[{op:'insert',path:['products'],value:{id:'attempt-C1',code:'C1',name:'duplicate',line:'A',category:'G',stages:['A-CUT']}}]})});assert.equal(duplicate.status,409);assert.equal(duplicate.body.error,'PRODUCT_CODE_USED_IN_OTHER_SCOPE');assert.equal((await core.readState()).revision,before.revision);
  const saved=JSON.parse((await core.readState()).values.masterDataControl).workflowScopes.AB.saves[0];
  const denied=await api.GET(new Request(url('AB')+'&restoreSaveId='+saved.id,{headers:sessions.a}));assert.equal(denied.status,403);
  const allowed=await api.GET(new Request(url('AB')+'&restoreSaveId='+saved.id,{headers:sessions.admin}));assert.equal(allowed.status,200);
 });
 await check('T45 used stage blocks even combined route cleanup; no mutation',async()=>{
  const state=await core.readState(),working=(await get('AB','admin')).control.workflow.working,stagePath=['lines',{id:'lines:A'},'stages',{id:'stage:A-CUT'}];
  const attempt=await send('AB','admin',{command:await command('AB','admin','apply',{patches:[set('stages',[]),{op:'remove',path:stagePath}],guards:[{path:set('stages',[]).path,value:working.products[0].stages},{path:stagePath,value:working.lines[0].stages[0]}]})});
  assert.equal(attempt.status,409);assert.equal(attempt.body.error,'STAGE_IN_USE');assert.ok(attempt.body.details.references.some(r=>r.kind==='product-route'));assert.equal((await core.readState()).revision,state.revision);
  const refs=load('lib/master-stage-references.ts');for(const status of ['approved','draft','pending']){const impact=refs.stageReferences({approvalVersions:JSON.stringify([{id:'v',status,stages:{'A-CUT':[{id:'op'}]}}])},['A-CUT']);assert.equal(impact.total,1);}
  assert.equal(refs.stageReferences({'processEditor:G:A':JSON.stringify({stages:{'A-CUT':[{id:'cached-op'}]}})},['A-CUT']).total,1);
  const legacyRoot=JSON.parse(JSON.stringify(original)),draft=JSON.parse(JSON.stringify(original.versions[0]));draft.id='legacy-draft';draft.status='draft';draft.snapshot.lines[0].stages=[];draft.snapshot.products[0].stages=[];legacyRoot.versions.push(draft);
  const baselineValues={...state.values,masterDataControl:JSON.stringify(original)};db.prepare('UPDATE shared_state SET "values"=? WHERE id=1').run(await core.encodeValues(baselineValues));
  const blocked=await legacy.POST(new Request('http://fixture/api/shared-state',{method:'POST',headers:sessions.admin,body:JSON.stringify({baseRevision:state.revision,updates:{masterDataControl:JSON.stringify(legacyRoot)}})}));assert.equal(blocked.status,409);assert.equal((await blocked.json()).error,'STAGE_IN_USE');assert.equal((await core.readState()).values.masterDataControl,baselineValues.masterDataControl);
 });
 console.log(JSON.stringify({result:'PASS',groups:results.length,isolated:true,browserUI:'NOT_EXECUTED',results}));
}finally{db.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
