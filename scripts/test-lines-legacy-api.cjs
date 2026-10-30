/* oxlint-disable typescript/no-require-imports -- isolated real API / CAS; no Local writes. */
const assert=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite'),{randomUUID}=require('node:crypto'),harness=require('./ipqc-ab-import-harness.cjs');
const db=new DatabaseSync(':memory:'),objects=new Map();db.exec('CREATE TABLE shared_state(id INTEGER PRIMARY KEY,revision INTEGER,"values" TEXT,updated_at TEXT);CREATE TABLE state_backups(id TEXT PRIMARY KEY,revision INTEGER,"values" TEXT,reason TEXT,actor TEXT,created_at TEXT)');
const env={PROCESS_SESSION_SECRET:randomUUID(),STATE_ARCHIVE:{async put(k,v){objects.set(k,v);},async get(k){return objects.has(k)?{text:async()=>objects.get(k)}:null;},async head(k){return objects.has(k)?{}:null;}},DB:{prepare(sql){let args=[];return{bind(...v){args=v;return this;},async first(){return db.prepare(sql).get(...args)||null;},async run(){return{meta:{changes:Number(db.prepare(sql).run(...args).changes)}};}};}}};
const load=harness(env),core=load('lib/process-state.ts'),link=load('lib/master-stage-link.ts'),copy=v=>JSON.parse(JSON.stringify(v)),sessions={};
 const users=['a','b','reviewer'].map(id=>({id,name:id,role:'rd',enabled:true,inheritRole:false,views:['data','approval'],permissions:['approval.submit','approval.withdraw','approval.approve','approval.reject','approval.compare','master.delete']}));
const catalog=line=>({products:[{code:line+'1',name:'Sản phẩm',line,category:'G',stages:[line+'-CUT']}],lines:[{code:line,name:line,stages:[{code:line+'-CUT',name:'Cắt'}]}],categoryGroups:[{line,name:'G'}]});
const active={AB:catalog('A'),C:catalog('C'),PROCESS:{'A-CUT':link.stageDefaultTemplates('A-CUT'),'C-CUT':link.stageDefaultTemplates('C-CUT')}},root={active:copy(active),versions:Object.entries(active).map(([scope,snapshot])=>({scope,snapshot:copy(snapshot),id:scope+'-active',number:1,status:'approved',revision:1,creatorId:'system',creatorName:'system',createdAt:'fixture',updatedAt:'fixture',history:[]}))};
db.prepare('INSERT INTO shared_state VALUES(1,1,?,?)').run(JSON.stringify({platformUsers:JSON.stringify(users),masterDataControl:JSON.stringify(root),processMasterData:JSON.stringify(root.active.PROCESS)}),'fixture');
const url=scope=>'http://fixture/api/master/workflow?scope='+scope+'&caseMetadata=1';


void (async()=>{try{
 const legacy=load('app/api/shared-state/route.ts'),beforeRoot=copy(root),orphan={code:'UNUSED',name:'Unused',stages:[{code:'UNUSED-STAGE',name:'Unused stage'}]};
 beforeRoot.active.AB.lines.push(orphan);beforeRoot.versions.find(v=>v.scope==='AB').snapshot=copy(beforeRoot.active.AB);
 db.prepare('UPDATE shared_state SET "values"=?').run(JSON.stringify({platformUsers:JSON.stringify(users),masterDataControl:JSON.stringify(beforeRoot),processMasterData:JSON.stringify(beforeRoot.active.PROCESS)}));
 sessions.a={Cookie:'process_demo='+await core.demoSession(new Request(url('AB')),'a',false),Origin:'http://fixture','Content-Type':'application/json'};
 const before=await core.readState(),after=copy(beforeRoot);after.active.AB.lines=after.active.AB.lines.filter(l=>l.code!=='UNUSED');after.versions.find(v=>v.scope==='AB').snapshot=copy(after.active.AB);
 const response=await legacy.POST(new Request('http://fixture/api/shared-state',{method:'POST',headers:sessions.a,body:JSON.stringify({baseRevision:before.revision,updates:{masterDataControl:JSON.stringify(after)}})})),body=await response.json();
 assert.equal(response.status,409,JSON.stringify(body));assert.equal(body.error,'LINE_HAS_STAGES');assert.equal((await core.readState()).revision,before.revision);
 console.log('PASS legacy unadopted write cannot cascade-delete unreferenced child stages');
 }catch(e){console.error(e);process.exitCode=1;}finally{db.close();}})();
