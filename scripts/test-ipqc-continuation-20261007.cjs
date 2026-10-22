/* oxlint-disable typescript/no-require-imports -- in-memory fixture, real handlers, no service/data writes. */
const assert=require('node:assert/strict'),fs=require('node:fs'),{DatabaseSync}=require('node:sqlite'),{randomUUID}=require('node:crypto'),harness=require('./ipqc-ab-import-harness.cjs'),growth=require('./v3-quality-growth-fixture.cjs');
(async()=>{const results=[];
for(const moduleId of ['fqc','iqc','routine-equipment']){
 const db=new DatabaseSync(':memory:');try{
 for(const f of fs.readdirSync('drizzle').filter(x=>x.endsWith('.sql')).sort())db.exec(fs.readFileSync('drizzle/'+f,'utf8'));
 const archive=new Map(),env={PROCESS_SESSION_SECRET:randomUUID(),DB:{prepare(sql){let args=[];return{bind(...a){args=a;return this;},async first(){return db.prepare(sql).get(...args)||null;},async run(){return{meta:{changes:Number(db.prepare(sql).run(...args).changes)}};}};}},STATE_ARCHIVE:{async put(k,v){archive.set(k,v);},async head(k){return archive.has(k)?{}:null;},async get(k){return archive.has(k)?{text:async()=>String(archive.get(k))}:null;}}};
 const f=growth(moduleId,[{id:'a'.repeat(64),bytes:1}],0,2),values={...f.values};
 // Clear fixture image references in every snapshot; this test covers review policy, not media.
 const control=JSON.parse(values[f.key]),scope=moduleId==='fqc'?control.libraries.fqc:control;
 const clear=c=>{for(const row of c.items||[])row.mediaItems=[];for(const row of c.parts||[])row.photos=[];for(const row of c.equipment||[])row.photoId='';};
 clear(scope.workflow.working);clear(scope.workflow.active.content);for(const v of scope.versions)clear(v.snapshot||v);
 values[f.key]=JSON.stringify(control);
 if(moduleId!=='routine-equipment')values.routineEquipmentControl=growth('routine-equipment',[{id:'a'.repeat(64),bytes:1}],0,1).values.routineEquipmentControl;
 const permissions=['approval.submit','approval.withdraw','approval.approve','approval.reject','approval.compare','master.delete'];
 values.platformUsers=JSON.stringify(['a','admin','viewer'].map(id=>({id,name:'Isolated '+id,role:id==='admin'?'admin':'staff',enabled:true,inheritRole:false,lines:['A','B','C'],views:['data','approval','editor'],permissions:id==='viewer'?[]:permissions})));
 db.prepare('INSERT INTO shared_state(id,revision,"values",updated_at) VALUES(1,1,?,?)').run(JSON.stringify(values),'isolated');
 const load=harness(env),core=load('lib/process-state.ts'),api=load('app/api/'+moduleId+'/workflow/route.ts'),sessions={};
 for(const id of ['a','admin','viewer'])sessions[id]={Cookie:'process_demo='+await core.demoSession(new Request('http://127.0.0.1'),id,false),Origin:'http://127.0.0.1','Content-Type':'application/json'};
 const writer=moduleId==='fqc'?'admin':'a';
 let c=scope,sequence=0;const events=[];
 const send=async(action,fields={},user=writer)=>{const response=await api.POST(new Request('http://127.0.0.1/api/'+moduleId+'/workflow',{method:'POST',headers:sessions[user],body:JSON.stringify({command:{action,generation:c.workflow.generation,clientId:'continuation-'+moduleId,sequence:++sequence,operationId:randomUUID(),...fields}})}));const body=await response.json();events.push({action,user,status:response.status,error:body.error});if(response.status===200)c=body.control;return{status:response.status,body};};
 const ok=async(...args)=>{const r=await send(...args);assert.equal(r.status,200,JSON.stringify(r.body));return r;};
 await ok('save');await ok('submit',{savedId:c.workflow.saved.id,reason:'Isolated unchanged-content continuation'});
 assert.ok(c.workflow.cases.at(-1).contentIssues.issues.some(i=>i.code==='NO_SUBSTANTIVE_CHANGE'));
 assert.equal((await send('approve',{caseId:c.workflow.pendingId})).body.error,'SELF_REVIEW_CONFIRM_REQUIRED');
 assert.equal((await send('approve',{caseId:c.workflow.pendingId,selfReviewConfirmed:true},'viewer')).status,403);
 await ok('approve',{caseId:c.workflow.pendingId,selfReviewConfirmed:true});assert.equal(c.workflow.cases.at(-1).result.selfReview,true);
 const begin=await api.POST(new Request('http://127.0.0.1/api/'+moduleId+'/workflow',{method:'POST',headers:sessions[writer],body:JSON.stringify({action:'begin'})}));assert.equal(begin.status,200);c=(await begin.json()).control;
 await ok('apply',{patches:[{op:'set',path:[f.collection,{id:'row0'},f.field],value:''}]});
 await ok('save');await ok('submit',{savedId:c.workflow.saved.id,reason:'Isolated incomplete-content continuation'});
 assert.ok(c.workflow.cases.at(-1).contentIssues.issues.some(i=>i.kind==='missing'));
 const pendingId=c.workflow.pendingId;assert.equal((await send('save')).body.error,'PENDING_LOCKED');
 assert.equal((await send('approve',{caseId:'wrong-case',selfReviewConfirmed:true})).status,409);
 await ok('approve',{caseId:pendingId,selfReviewConfirmed:true});assert.equal(c.activeVersionId,pendingId);
 if(moduleId==='iqc'){
  const {iqcSubmitBlockingErrors}=load('lib/iqc.ts'),empty=structuredClone(c.workflow.active.content);empty.items[0].rules=[{id:'r',cadence:'batch',kind:'aql',value:''}];assert.equal(iqcSubmitBlockingErrors(empty).length,0);
  empty.items[0].rules[0].value='invalid-number';assert.ok(iqcSubmitBlockingErrors(empty).length>0);
 }
 results.push({moduleId,result:'PASS',events});
 }finally{db.close();}
}
console.log(JSON.stringify({result:'PASS',scope:'Additional actual FQC/IQC/equipment handler policy checks; not browser acceptance',dailyWrites:0,live3020Writes:0,results},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
