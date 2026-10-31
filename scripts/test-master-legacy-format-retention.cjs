/* oxlint-disable typescript/no-require-imports -- isolated actual handler + memory SQLite/R2. */
const assert=require('node:assert/strict'),fs=require('node:fs'),{DatabaseSync}=require('node:sqlite'),{randomUUID}=require('node:crypto'),harness=require('./ipqc-ab-import-harness.cjs'),seed=require('./v3-master-permission-fixture.cjs');
const clone=x=>JSON.parse(JSON.stringify(x));const checks=[];
async function fixture({large=true,nonJSON=false,legacyReference=false,r2=false,scope='AB',records=false,noWorkflow=false}={}){
 const db=new DatabaseSync(':memory:'),objects=new Map();let failAfter=Infinity,puts=0,conflict=false,peerBeforeCAS=false;
 db.exec('CREATE TABLE shared_state(id INTEGER PRIMARY KEY,revision INTEGER,"values" TEXT,updated_at TEXT);CREATE TABLE state_backups(id TEXT PRIMARY KEY,revision INTEGER,"values" TEXT,reason TEXT,actor TEXT,created_at TEXT)');
 const bucket={async put(k,v){if(++puts===failAfter)throw Error('synthetic upload failure');objects.set(k,Buffer.from(v));},async get(k){const b=objects.get(k);return b?{size:b.length,text:async()=>b.toString(),arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)}:null;},async head(k){return objects.has(k)?{size:objects.get(k).length}:null;}};
 const env={PROCESS_SESSION_SECRET:randomUUID(),STATE_ARCHIVE:bucket,DB:{prepare(sql){let args=[];return{bind(...v){args=v;return this;},async first(){return db.prepare(sql).get(...args)||null;},async run(){if(peerBeforeCAS&&sql.startsWith('UPDATE shared_state SET revision=')){peerBeforeCAS=false;const row=db.prepare('SELECT "values" FROM shared_state').get(),current=JSON.parse(row.values);current.peerSentinel=JSON.stringify('peer update retained');db.prepare('UPDATE shared_state SET revision=revision+1,"values"=?').run(JSON.stringify(current));}if(conflict&&sql.startsWith('UPDATE shared_state SET revision='))return{meta:{changes:0}};return{meta:{changes:Number(db.prepare(sql).run(...args).changes)}};}};}}};
 const load=harness(env),core=load('lib/process-state.ts'),api=load('app/api/master/workflow/route.ts'),f=seed('master-'+scope),root=JSON.parse(f.values.masterDataControl);
 const archived=clone(root.versions[0]);archived.id='retained-history';archived.status='superseded';archived.snapshot.products[0].specification=large?'歷史 Việt 😀 '.repeat(60000):'small';root.versions.push(archived);if(noWorkflow){delete root.workflowScopes[scope];root.versions=root.versions.filter(v=>v.scope!==scope||v.status!=='draft');}
 const {accessKeys}=await import('../public/process/access-policy.mjs');const users=['frank','reviewer','reader'].map(id=>({id,name:'Synthetic '+id,role:'admin',enabled:true,accessOverrides:Object.fromEntries(accessKeys.map(k=>[k,id!=='reader'||k.endsWith('.view')]))}));
 const values={...f.values,masterDataControl:JSON.stringify(root),platformUsers:JSON.stringify(users),untouched:JSON.stringify({versions:[{id:'old',snapshot:{name:'untouched',nested:['中','Việt']}}],sentinel:true}),formatting:' { "number": 1e2, "zero": -0, "unicode": "😀" } '};if(nonJSON)values.unknownLegacy='not JSON';if(legacyReference)values.unknownLegacy=JSON.stringify({__immutableBody:{key:'state-records/v1/'+'f'.repeat(64)+'.json',sha256:'f'.repeat(64)}});
 const initial=records?await load('lib/state-records.ts').encodeRecordValues(bucket,values):r2?await core.encodeValues(values):JSON.stringify(values);db.prepare('INSERT INTO shared_state VALUES(1,1,?,?)').run(initial,'fixture');
 const sessions={};for(const u of users)sessions[u.id]={Cookie:'process_demo='+await core.demoSession(new Request(f.url),u.id,false),Origin:'http://fixture','Content-Type':'application/json'};
 let sequence=0;const command=(action='save',detail={})=>({action,...detail,operationId:randomUUID(),clientId:'format-retention-test-client',sequence:++sequence,generation:root.workflowScopes[scope]?.generation});
 const post=async(cmd,who='frank',requestedScope=scope)=>{const r=await api.POST(new Request(f.url.replace('scope='+scope,'scope='+requestedScope),{method:'POST',headers:sessions[who],body:JSON.stringify(cmd.action==='begin'?{action:'begin'}:{command:cmd})}));return{status:r.status,body:await r.json()};};
 return{db,objects,values,root,core,load,bucket,post,command,row:()=>db.prepare('SELECT * FROM shared_state').get(),fail:()=>failAfter=puts+1,clearFailure:()=>failAfter=Infinity,conflict:()=>conflict=true,peerBeforeCAS:()=>peerBeforeCAS=true,close:()=>db.close()};
}
async function check(name,fn){await fn();checks.push(name);console.log('PASS '+name);}
(async()=>{
 for(const scope of ['AB','C'])for(const format of ['inline','R2','records-v1'])await check(scope+' '+format+' Begin/Apply/Save preserve format family, history, peer values and replay',async()=>{
  const records=format==='records-v1',f=await fixture({scope,r2:format==='R2',records,noWorkflow:true});try{
   assert(Buffer.byteLength(f.values.masterDataControl)>=512*1024);
   const before=f.row();assert.equal((await f.post({action:'begin'},'reader')).status,403);assert.deepEqual(f.row(),before);
   assert.equal((await f.post({action:'begin'})).status,200);
   assert.equal(!!JSON.parse(f.row().values).__processRecords,records);
   const state=await f.core.readState(),root=JSON.parse(state.values.masterDataControl),generation=root.workflowScopes[scope].generation,product=root.workflowScopes[scope].working.products[0],path=['products',{id:product.id},'name'];
   const bad={...f.command('apply',{patches:[{op:'set',path,value:'changed'}],guards:[{path,value:'stale'}]}),generation};const stable=f.row();assert.equal((await f.post(bad)).status,409);assert.deepEqual(f.row(),stable);
   const apply={...f.command('apply',{patches:[{op:'set',path,value:'Changed '+scope}],guards:[{path,value:product.name}]}),generation};assert.equal((await f.post(apply)).status,200);assert.equal(!!JSON.parse(f.row().values).__processRecords,records);
   const save={...f.command(),generation},result=await f.post(save);assert.equal(result.status,200);assert.equal(!!JSON.parse(f.row().values).__processRecords,records);
   const read=await f.core.readState(),current=JSON.parse(read.values.masterDataControl);assert.equal(current.workflowScopes[scope].saved.content.products[0].name,'Changed '+scope);
   assert.deepEqual(current.active,f.root.active);assert.deepEqual(current.versions.find(v=>v.id==='retained-history').snapshot,f.root.versions.find(v=>v.id==='retained-history').snapshot);
   for(const key of Object.keys(f.values).filter(k=>k!=='masterDataControl'))assert.equal(read.values[key],f.values[key]);
   const committed=f.row();assert.equal((await f.post(save)).status,200);assert.deepEqual(f.row(),committed);
   if(!records)assert(![...f.objects.keys()].some(k=>k.startsWith('state-records/')));
  }finally{f.close();}
 });
 await check('failed legacy R2 write keeps old state; same command can retry',async()=>{const f=await fixture();try{const before=f.row(),command=f.command();f.fail();assert.equal((await f.post(command)).status,500);assert.deepEqual(f.row(),before);f.clearFailure();assert.equal((await f.post(command)).status,200);assert.equal(JSON.parse(f.row().values).__processRecords,undefined);}finally{f.close();}});
 await check('legacy CAS conflict publishes neither new format nor receipt',async()=>{const f=await fixture();try{const before=f.row();f.conflict();assert.equal((await f.post(f.command())).status,409);assert.deepEqual(f.row(),before);}finally{f.close();}});
 await check('legacy CAS retry preserves independent writer update',async()=>{const f=await fixture();try{f.peerBeforeCAS();assert.equal((await f.post(f.command())).status,200);assert.equal(JSON.parse((await f.core.readState()).values.peerSentinel),'peer update retained');assert.equal(JSON.parse(f.row().values).__processRecords,undefined);}finally{f.close();}});
 const apiSource=fs.readFileSync('lib/versioned-shared-workflow.ts','utf8');assert(!apiSource.includes('encodeMasterWorkflowValues'),'normal workflow has no automatic adoption dispatch');
 console.log(JSON.stringify({status:'PASS',checks:checks.length,realData:false,automaticRecordAdoption:false}));
})().catch(error=>{console.error(error);process.exitCode=1;});
