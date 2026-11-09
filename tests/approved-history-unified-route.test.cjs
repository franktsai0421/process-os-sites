/* Actual workflow HTTP handlers; private in-memory SQLite and Map-backed R2.
 * No server, business data, live account, remote write or browser acceptance. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {DatabaseSync}=require('node:sqlite'),{randomUUID}=require('node:crypto');
const harness=require('../scripts/ipqc-ab-import-harness.cjs');
const at='2026-11-09T00:00:00.000Z',actor={id:'history-fixture',name:'History fixture',admin:true};
const copy=v=>JSON.parse(JSON.stringify(v));
/** @type {Array<[string,string,string,Record<string,unknown>,string?]>} */
const specs=[
 ['fqc','qualityMasterControl','fqc',{errors:[],items:[]}],
 ['iqc','iqcMasterControl','iqc',{categories:[],suppliers:[],parts:[],errors:[],items:[]}],
 ['tooling','toolingMasterControl','tooling',{tools:[],categories:[],custodians:[],suppliers:[],manufacturers:[],transfers:[]}],
 ['routine-equipment','routineEquipmentControl','routine-equipment',{equipment:[],groups:[],categories:[],subcategories:[],issues:[]}],
 ['bom','bomMasterControl','bom',{bom:{},referenceIssues:[]}],
 ['process-authoring','processAuthoringControl','process:platform',{workspaces:[]}],
 ['master','masterDataControl','master:AB',{products:[],lines:[],categoryGroups:[]},'scope=AB'],
 ['master','masterDataControl','master:C',{products:[],lines:[],categoryGroups:[]},'scope=C'],
 ['master','masterDataControl','master:PROCESS',{},'scope=PROCESS'],
 ['ipqc-ab','ipqcABMasterControl','ipqc-ab:module',{scopes:{},bases:{}},'module=1'],
 ['ipqc-ab','ipqcABMasterControl','ipqc-ab:A:Fixture',{errors:[],items:[]},'scope=A%3AFixture'],
];
function model(scope,snapshot){
 const row=(id,number,status='superseded')=>({id,number,status,snapshot:copy(snapshot),baseVersionId:'formal',revision:1,creatorId:actor.id,creatorName:actor.name,createdAt:at,updatedAt:at,history:[]});
 const versions=[row('formal',1,'approved'),row('approved-case',2),row('unapproved',3),row('shared-superseded',4),row('pending-case',5,'pending'),row('returned',6,'returned'),row('withdrawn',7,'withdrawn'),row('missing-result',8),row('missing-save',9)];
 for(let i=0;i<22;i++)versions.push({...row('legacy-'+i,10+i),history:[{action:'approved',actorId:actor.id,actorName:actor.name,at}]});
 const approved={id:'approved-case',savedId:'reviewed-save',baseId:'formal',actor,at,reason:'Synthetic review',status:'approved',content:{...copy(snapshot),historyMarker:'IMMUTABLE_APPROVED_CONTENT'},before:copy(snapshot),result:{actor,at,reason:'Synthetic review'}};
 return {schemaVersion:1,activeVersionId:'formal',versions,workflow:{schemaVersion:3,scope,generation:'g1',revision:1,active:{id:'formal',content:copy(snapshot)},baseId:'formal',working:{...copy(snapshot),historyMarker:'CURRENT_WORKING'},saved:null,pendingId:'pending-case',contributors:{},saves:[],cases:[approved,{...copy(approved),id:'missing-result',result:undefined},{...copy(approved),id:'missing-save',savedId:''},{...copy(approved),id:'pending-case',status:'pending',content:copy(snapshot),result:undefined}],tombstones:[],receipts:{},sequences:{}}};
}
function rootFor(key,scope,snapshot,c){
 if(key==='qualityMasterControl')return {schemaVersion:1,libraries:{fqc:c}};
 if(key==='iqcMasterControl')return {...c,issues:[],reservedErrorCodes:[],reservedCheckNos:[]};
 if(key==='toolingMasterControl')return {...c,reservedCodes:{}};
 if(key==='routineEquipmentControl')return {...c,issues:[],reservedMarks:{},versions:c.versions.map(v=>({...v,...copy(snapshot)}))};
 if(key==='masterDataControl'){const s=scope.slice(7);return {active:{[s]:copy(snapshot)},versions:c.versions.map(v=>({...v,scope:s})),workflowScopes:{[s]:c.workflow}};}
 if(key==='ipqcABMasterControl')return {schemaVersion:1,reservedErrorCodes:[],reservedItemCodes:[],scopes:scope==='ipqc-ab:module'?{}:{[scope.slice(8)]:{...c,line:'A',group:'Fixture'}},...(scope==='ipqc-ab:module'?{moduleDraft:c}:{})};
 return c;
}
async function fixture(t,spec,records=true){
 const [name,key,scope,snapshot,routing='']=spec,c=model(scope,snapshot),db=new DatabaseSync(':memory:'),objects=new Map();t.after(()=>db.close());
 for(const file of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())db.exec(fs.readFileSync('drizzle/'+file,'utf8'));
 let writes=0,hook=null;
 const env={PROCESS_SESSION_SECRET:randomUUID(),PROCESS_SESSION_REVOCATION_ENABLED:'1',DB:{prepare(sql){let args=[];return {bind(...v){args=v;return this;},async first(){return db.prepare(sql).get(...args)||null;},async run(){writes++;return {meta:{changes:Number(db.prepare(sql).run(...args).changes)}};}};}},STATE_ARCHIVE:{async put(key,value){objects.set(key,Buffer.from(value));},async head(key){return objects.has(key)?{}:null;},async get(key){const b=objects.get(key);await hook?.(key,b);return b?{text:async()=>b.toString(),arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),body:new ReadableStream({start(s){s.enqueue(b);s.close();}})}:null;}}};
 const load=harness(env),core=load('lib/process-state.ts');
 const values={platformUsers:JSON.stringify([{id:actor.id,name:actor.name,role:'admin',enabled:true,inheritRole:true,accessOverrides:{}}]),[key]:JSON.stringify(rootFor(key,scope,snapshot,c))};
 const stored=records?await load('lib/state-records.ts').encodeRecordValues(env.STATE_ARCHIVE,values):JSON.stringify(values);
 db.prepare('INSERT INTO shared_state(id,revision,"values",updated_at) VALUES(1,1,?,?)').run(stored,at);
 const headers={'Content-Type':'application/json',Origin:'http://localhost',Cookie:'process_demo='+await core.demoSession(new Request('http://localhost'),actor.id,false)};
 const endpoint='/api/'+name+'/workflow',get=(extra='',session=headers)=>load('app'+endpoint+'/route.ts').GET(new Request('http://localhost'+endpoint+'?'+(routing?routing+'&':'')+'approvedOnly=1&'+extra,{headers:session}));
 return {get,objects,db,load,env,headers,endpoint,routing,aggregateKey:records?JSON.parse(stored).__processRecords.values[key].key:null,hook:fn=>hook=fn,snapshot:()=>({row:{...db.prepare('SELECT * FROM shared_state').get()},objects:[...objects].map(([k,b])=>[k,b.toString('hex')]),writes}),async revoke(){await core.clearDemoSession(new Request('http://localhost',{headers}));},bump(){db.prepare('UPDATE shared_state SET revision=revision+1').run();}};
}
for(const spec of specs)for(const records of [false,true])void test(spec[2]+' approved-only actual handler '+(records?'records-v1':'inline'),{timeout:10000},async t=>{
 const f=await fixture(t,spec,records),before=f.snapshot();
 const first=await f.get('uiHistory=1');assert.equal(first.status,200,await first.clone().text());const page=await first.json();assert.equal(page.approvedOnly,true);assert.equal(page.versions.total,23);assert.equal(page.versions.rows.length,20);assert(page.versions.next);assert(page.versions.rows.every(row=>!Object.hasOwn(row,'snapshot')));
 const second=await (await f.get('uiHistory=1&versionBefore='+page.versions.next)).json();assert.deepEqual(second.versions.rows.map(v=>v.id),['legacy-1','legacy-0','approved-case']);
 const detail=await f.get('versionId=approved-case');assert.equal(detail.status,200,await detail.clone().text());const value=await detail.json();assert.equal(value.version.snapshot.historyMarker,'IMMUTABLE_APPROVED_CONTENT');assert.equal(value.version.approvalEvidence.savedId,'reviewed-save');assert.equal(value.version.status,'superseded');
 for(const id of ['formal','unapproved','shared-superseded','pending-case','returned','withdrawn','missing-result','missing-save','missing'])assert.equal((await f.get('versionId='+id)).status,404,id);
 assert.equal((await f.get('uiHistory=1&versionBefore=missing')).status,409);assert.equal((await f.get('uiHistory=1',{})).status,403);
 assert.deepEqual(f.snapshot(),before,'all history GETs preserve state, archive and writes');
});
for(const spec of specs)void test(spec[2]+' rejects mixed and duplicate selectors before archive reads',{timeout:10000},async t=>{
 const f=await fixture(t,spec),before=f.snapshot();let reads=0;f.hook(()=>reads++);
 for(const extra of ['uiHistory=1&caseId=approved-case','versionId=approved-case&restoreSaveId=old','uiHistory=1&versionId=approved-case','uiHistory=1&uiHistory=1','uiHistory=1&approvedOnly=0','versionId=approved-case&versionId=unapproved','uiHistory=1&since=state:1','uiHistory=1&contentIssues=1','uiHistory=1&legacyVersionId=old','uiHistory=1&catalog=effective','uiHistory=1&references=secret']){const r=await f.get(extra);assert.equal(r.status,422,extra+' '+await r.text());assert.equal(reads,0,extra);}
 assert.deepEqual(f.snapshot(),before);
});
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
for(const spec of specs)for(const fault of ['revocation','revision'])void test(spec[2]+' holds immutable body until final '+fault+' fence',{timeout:10000},async t=>{
 const f=await fixture(t,spec),entered=deferred(),release=deferred();let armed=true;
 f.hook(async(_key,b)=>{if(armed&&b?.toString().includes('IMMUTABLE_APPROVED_CONTENT')){armed=false;entered.resolve();await release.promise;}});
 const pending=f.get('versionId=approved-case');await entered.promise;if(fault==='revocation')await f.revoke();else f.bump();const before=f.snapshot();release.resolve();const r=await pending,body=await r.text();assert.equal(r.status,fault==='revocation'?403:409);assert.doesNotMatch(body,/IMMUTABLE_APPROVED_CONTENT|snapshot|approved-case/);assert.deepEqual(f.snapshot(),before);
});

for(const spec of specs)void test(spec[2]+' metadata does not hydrate reviewed bodies',{timeout:10000},async t=>{
 const f=await fixture(t,spec),before=f.snapshot();let historicalReads=0;
 f.hook((_key,b)=>{if(b?.toString().includes('IMMUTABLE_APPROVED_CONTENT'))historicalReads++;});
 const response=await f.get('uiHistory=1&caseMetadata=1&compact=1');assert.equal(response.status,200,await response.clone().text());
 assert.equal((await response.json()).versions.rows.length,20);assert.equal(historicalReads,0);assert.deepEqual(f.snapshot(),before);
});
for(const spec of specs)void test(spec[2]+' metadata authority rechecked after held aggregate read',{timeout:10000},async t=>{
 const f=await fixture(t,spec),entered=deferred(),release=deferred();let armed=true;
 f.hook(async(key)=>{if(armed&&key===f.aggregateKey){armed=false;entered.resolve();await release.promise;}});
 const pending=f.get('uiHistory=1');await entered.promise;await f.revoke();const before=f.snapshot();release.resolve();const r=await pending;assert.equal(r.status,403);assert.doesNotMatch(await r.text(),/"versions"|approved-case|"permissions"/);assert.deepEqual(f.snapshot(),before);
});
void test('exact opt-in refuses unknown routes, keys, scopes and ambiguous routing',()=>{
 const load=harness({DB:{prepare(){throw Error('UNEXPECTED_DB');}},STATE_ARCHIVE:{get(){throw Error('UNEXPECTED_R2');}}}),query=load('lib/approved-history-query.ts').approvedHistoryQuery;
 for(const [url,key,scope]of [
  ['/api/unknown/workflow?approvedOnly=1&uiHistory=1','bomMasterControl','bom'],
  ['/api/bom/workflow?approvedOnly=1&uiHistory=1','iqcMasterControl','iqc'],
  ['/api/master/workflow?scope=AB&approvedOnly=1&uiHistory=1','masterDataControl','master:C'],
  ['/api/master/workflow?scope=AB&scope=C&approvedOnly=1&uiHistory=1','masterDataControl','master:AB'],
  ['/api/ipqc-ab/workflow?scope=A:Fixture&module=1&approvedOnly=1&uiHistory=1','ipqcABMasterControl','ipqc-ab:module'],
  ['/api/ipqc-ab/workflow?module=0&approvedOnly=1&uiHistory=1','ipqcABMasterControl','ipqc-ab:module'],
  ['/api/master/workflow?scope=AB&approvedOnly=1&versionId='+('x'.repeat(513)),'masterDataControl','master:AB'],
  ['/api/ipqc-ab/workflow?module=1&approvedOnly=1&versionId='+('x'.repeat(1025)),'ipqcABMasterControl','ipqc-ab:module'],
  ['/api/bom/workflow?approvedOnly=1&uiHistory=1&versionBefore='+('x'.repeat(513)),'bomMasterControl','bom'],
 ])assert.throws(()=>query(new Request('http://fixture'+url),key,scope),e=>e.code==='INVALID_APPROVED_HISTORY_QUERY');
 assert.equal(query(new Request('http://fixture/api/other?uiHistory=1'),'other','other'),false);
});
