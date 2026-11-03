// Synthetic actual-handler response contract; SQLite :memory: and Map R2 only.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {DatabaseSync}=require('node:sqlite'),{randomUUID}=require('node:crypto'),{performance:_performance}=require('node:perf_hooks');
const harness=require(path.resolve('scripts/ipqc-ab-import-harness.cjs'));
const db=new DatabaseSync(':memory:');
for(const f of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())db.exec(fs.readFileSync(path.join('drizzle',f),'utf8'));
let persistenceWrites=0;
const objects=new Map(),env={PROCESS_SESSION_SECRET:randomUUID(),DB:{prepare(sql){let args=[];return{bind(...a){args=a;return this;},async first(){return db.prepare(sql).get(...args)||null;},async all(){return{results:db.prepare(sql).all(...args)};},async run(){persistenceWrites++;return{meta:{changes:Number(db.prepare(sql).run(...args).changes)}};}};}},STATE_ARCHIVE:{async put(k,v){persistenceWrites++;objects.set(k,v);},async head(k){return objects.has(k)?{}:null;},async get(k){return objects.has(k)?{text:async()=>String(objects.get(k))}:null;}}};
const password=randomUUID(),users=['a','b','reviewer','admin'].map(id=>({id,name:id,password,enabled:true,role:id==='admin'?'admin':'rd',inheritRole:false,lines:['A','B','C'],views:['data','approval'],permissions:['approval.submit','approval.withdraw','approval.approve','approval.reject','approval.compare','master.delete']}));
const snapshot={categories:[{id:'cat',nameVi:'Linh kiện'}],suppliers:[{id:'sup',nameVi:'Nhà cung cấp'}],parts:[{id:'part',code:'P1',nameVi:'Chi tiết',specificationVi:'10 mm',categoryId:'cat',supplierIds:['sup'],supplierRaw:'',standardCode:'',photos:[]}],errors:[{id:'error',code:'P1-IQC-L1',partCode:'P1',nameVi:'Kích thước'}],items:[{id:'item',partCode:'P1',errorId:'error',checkNo:'P1-IQC-L1-01',nameVi:'Chiều dài',toolVi:'',methodVi:'Đo chiều dài',frequencyRaw:'',rules:[{id:'rule',cadence:'batch',kind:'aql',value:'0.25'}],isEnabled:true,inspectionMode:'visual',equipmentId:'',mediaItems:[]}]};
const control={schemaVersion:1,activeVersionId:'active',versions:[{id:'active',number:1,status:'approved',snapshot,revision:1,creatorId:'admin',creatorName:'admin',createdAt:'2026-10-01',updatedAt:'2026-10-01',history:[]}],issues:[],reservedErrorCodes:['P1-IQC-L1'],reservedCheckNos:['P1-IQC-L1-01']};

const load=harness(env),api=load('app/api/iqc/workflow/route.ts'),core=load('lib/process-state.ts'),base='https://fixture.invalid',url=base+'/api/iqc/workflow?caseMetadata=1&projection=iqc-edit-v1';let cookie,sequence=0;
async function read(){const r=await api.GET(new Request(url,{headers:{cookie}}));assert.equal(r.status,200);return r.json();}
async function post(body){const r=await api.POST(new Request(url,{method:'POST',headers:{cookie,Origin:base,'Content-Type':'application/json'},body:JSON.stringify(body)}));assert.equal(r.status,200);return r.json();}
async function run(action,extra={}){const flow=(await read()).control.workflow;return post({command:{operationId:randomUUID(),clientId:'synthetic-contract',generation:flow.generation,expectedRevision:flow.revision,sequence:++sequence,action,...extra}});}
(async()=>{try{
 db.prepare('INSERT INTO shared_state(id,revision,"values",updated_at) VALUES(1,1,?,?)').run(JSON.stringify({platformUsers:JSON.stringify(users),iqcMasterControl:JSON.stringify(control)}),'fixture');
 cookie=core.sessionCookie(new Request(base),await core.demoSession(new Request(base),'admin',false)).split(';')[0];
 const begun=await post({action:'begin'});assert.equal(begun.control.draftContentIssues.issues.length,0);
 const field=['items',{id:'item'},'nameVi'];const applied=await run('apply',{patches:[{op:'set',path:field,value:''}],guards:[{path:field,value:'Chiều dài'}]});assert.equal(applied.control.draftContentIssues.issues.length,1);
 const before=persistenceWrites,r=await read();assert.equal(persistenceWrites,before);assert.deepEqual(r.control.draftContentIssues,applied.control.draftContentIssues);assert.equal(r.control.draftContentIssues.revision,r.control.workflow.revision);assert.equal(r.control.draftContentIssues.generation,r.control.workflow.generation);
 const stored=JSON.parse(db.prepare('SELECT "values" FROM shared_state WHERE id=1').get().values);assert.equal(JSON.parse(stored.iqcMasterControl).draftContentIssues,undefined);
 const saved=await run('save');const submitted=await run('submit',{savedId:saved.control.workflow.saved.id,reason:'Incomplete synthetic case'});assert.equal(submitted.control.draftContentIssues,undefined);const review=submitted.control.workflow.cases.at(-1);assert.deepEqual(review.contentIssues.issues,r.control.draftContentIssues.issues);
 console.log(JSON.stringify({status:'PASS',checks:6,scope:'actual Begin/Apply/GET/Save/Submit, missing advisory, response-only revision-bound metadata, no read writes or persisted metadata'}));
}finally{db.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
