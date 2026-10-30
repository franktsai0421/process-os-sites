/* Actual final GET and exact published GET baseline; synthetic SQLite/R2, no server/network. */
const assert=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite'),{randomBytes,createHash,createHmac}=require('node:crypto');
const {withoutApprovedOperationAlignment}=require('./ipqc-c-operation-source-contract.cjs');
const {makeLoader,baselineCommits,baselineHashes}=require('./read-performance-harness.cjs'),{accessKeys}=require('../public/process/access-policy.mjs');
const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE shared_state(id INTEGER PRIMARY KEY,revision INTEGER,"values" TEXT);CREATE TABLE process_revoked_sessions(token_digest TEXT PRIMARY KEY,expires_at INTEGER,revoked_at INTEGER)');
const objects=new Map();let events=[],stateReads=0,onGet=null,onRevocation=null,lastState=null,lastReadOptions=null,writeAttempts=0;
const bucket={async put(k,v){events.push(['put',k]);objects.set(k,Buffer.from(v));},async get(k){events.push(['get',k]);onGet?.(k);const b=objects.get(k);return b?{text:async()=>b.toString(),arrayBuffer:async()=>Uint8Array.from(b).buffer}:null;},async head(){throw Error('GET_HEAD_UNEXPECTED');},async delete(){writeAttempts++;throw Error('GET_DELETE_REFUSED');}};
const secret=randomBytes(32).toString('hex'),env={STATE_ARCHIVE:bucket,PROCESS_SESSION_SECRET:secret,DEMO_LOGIN_ENABLED:'false',DB:{prepare(sql){assert(/^SELECT /i.test(sql),'GET_SQL_WRITE_REFUSED');let args=[];return{bind(...a){args=a;return this;},async first(){if(sql.includes('FROM shared_state'))stateReads++;if(sql.includes('process_revoked_sessions'))onRevocation?.();return db.prepare(sql).get(...args)||null;},async run(){writeAttempts++;throw Error('GET_WRITE_REFUSED');}};}}};
const candidate=makeLoader(env),old=makeLoader(env,{baseline:['app/api/ipqc-c/route.ts','lib/process-state.ts']}),core=candidate('lib/process-state.ts'),records=candidate('lib/state-records.ts'),chunks=candidate('lib/state-chunks.ts');const originalRead=core.readState;core.readState=async (options,archive)=>{lastReadOptions=options;lastState=await originalRead(options,archive);return lastState;};
const api=candidate('app/api/ipqc-c/route.ts'),beforeApi=old('app/api/ipqc-c/route.ts'),cells=(...yes)=>Object.fromEntries(accessKeys.map(k=>[k,yes.includes(k)]));
const user=(id,permission,extra={})=>({id,name:id,role:'staff',enabled:true,authMode:'platform',authEpoch:1,inheritRole:false,accessOverrides:cells(permission),...extra});
const users=[user('frank','',{role:'admin'}),user('admin-two','',{role:'admin',inheritRole:true,accessOverrides:undefined}),user('reader','ipqc-c.view'),user('approval','approval.view'),user('custom','',{role:'fixture-role',inheritRole:true,accessOverrides:undefined}),user('template-denied','',{role:'blocked-role',inheritRole:true,accessOverrides:undefined}),user('override-denied','',{role:'fixture-role',inheritRole:true}),user('other','fqc.view'),user('disabled','ipqc-c.view',{enabled:false}),user('deleted','ipqc-c.view',{deletedAt:'fixture'})];
const fixture=require('./v3-quality-growth-fixture.cjs')('ipqc-c',[{id:'a'.repeat(64),bytes:0}],2,20),control=JSON.parse(fixture.values.ipqcCMasterControl);control.workflow.cases.push({...structuredClone(control.workflow.cases[0]),id:'pending',status:'pending'});control.workflow.cases.at(-1).content.items[0].description='Distinct pending content';control.workflow.pendingId='pending';
const equipment={schemaVersion:1,activeVersionId:'eq-active',versions:[{id:'eq-active',status:'approved',equipment:[{id:'eq',assetCode:'EQ',pieceMark:'01',groupId:'group',name:'測試 Việt',enabled:true,photoId:'b'.repeat(64),spec:'spec'}],groups:[{id:'group',name:'group',categoryId:'category',subcategoryId:'sub'}],categories:[{id:'category',name:'category',code:'C01',photoId:'c'.repeat(64)}],subcategories:[{id:'sub',categoryId:'category',name:'sub'}],issues:[]}],issues:[],reservedMarks:{EQ:['01']}};
const values={...fixture.values,ipqcCMasterControl:JSON.stringify(control),routineEquipmentControl:JSON.stringify(equipment),platformUsers:JSON.stringify(users),processCustomRoles:JSON.stringify(['fixture-role','blocked-role'].map(id=>({id,name:id,lines:[],views:[],permissions:[],access:cells('ipqc-c.view')}))),processRoleTemplateOverrides:JSON.stringify({'blocked-role':{access:cells()}}),processAccessControl:'{"audit":"private-access-sentinel"}',maintenanceMode:'0',unrelated:JSON.stringify({historical:'C-HIST-TIEN-L987-01',irrelevant:'測試 Việt'.repeat(10000)})};
const install=(raw,revision=700)=>db.prepare('INSERT OR REPLACE INTO shared_state VALUES(1,?,?)').run(revision,raw);
function request(who='reader',query='?caseMetadata=1',{epoch=1,expired=false,forged=false,origin='https://ipqc-c.synthetic.invalid'}={}){const payload=Buffer.from(JSON.stringify({version:2,id:who,sessionType:'platform',authEpoch:epoch,expires:Date.now()+(expired?-60000:600000),nonce:'fixture'})).toString('base64'),headers=who?{cookie:core.sessionCookieName(new Request(origin))+'='+payload+'.'+createHmac('sha256',secret).update(payload).digest('hex')}:{};if(forged)headers['X-ChatGPT-User-Id']='frank';return new Request(origin+'/api/ipqc-c'+query,{headers});}
async function run(req,baseline=false){events=[];stateReads=0;const state=db.prepare('SELECT * FROM shared_state').get(),snapshot=new Map(objects);const response=await(baseline?beforeApi:api).GET(req);let body,error;try{body=JSON.parse(await response.text());}catch(e){error=e.message;}assert(events.every(([op])=>op==='get'),'handler no R2 writes');assert.equal(writeAttempts,0);if(!onGet&&!onRevocation)assert.deepEqual(db.prepare('SELECT * FROM shared_state').get(),state);assert.deepEqual(objects,snapshot);return{status:response.status,headers:[...response.headers],body,error,metrics:{gets:events.length,bytes:events.reduce((n,[,k])=>n+(objects.get(k)?.length||0),0),stateReads},keys:events.map(([,k])=>k)};}
const comparable=({status,headers,body,error})=>({status,headers,body,error});const checks=[],selected=new Set(process.argv.slice(2));async function check(name,fn){if(selected.size&&!selected.has(name.split(' ')[0]))return;await fn();checks.push(name);console.log('PASS '+name);}
(async()=>{try{const raw=await records.encodeRecordValues(bucket,values),refs=JSON.parse(raw).__processRecords.values;install(raw);let baseline,reduced;
await check('C1 adopted full/draft/pending/history/catalog/equipment parity and bounded growth',async()=>{
 for(const q of ['','?caseMetadata=0','?caseMetadata=1'])assert.deepEqual(comparable(await run(request('reader',q))),comparable(await run(request('reader',q),true)));
 baseline=(await run(request(),true)).metrics;reduced=(await run(request())).metrics;assert.deepEqual([...lastReadOptions.keys],['platformUsers','processCustomRoles','processRoleTemplateOverrides','processAccessControl','maintenanceMode','ipqcCMasterControl','masterDataControl','routineEquipmentControl']);assert.equal(lastReadOptions.modelKey,'ipqcCMasterControl');assert.equal(lastReadOptions.deferHistory,true);assert.equal(lastReadOptions.deferDependencyHistory,true);assert(reduced.gets<baseline.gets);assert(reduced.bytes<baseline.bytes);assert.equal(reduced.stateReads,1);assert(!events.some(([,k])=>k===refs.unrelated.key));
 const larger=await records.encodeRecordValues(bucket,{...values,unrelated:JSON.stringify({text:'large'.repeat(100000)})});install(larger);const grown=await run(request());assert.deepEqual(grown.metrics,reduced);install(raw);
});
await check('C2 exact actor/role/template/session response parity with no denied leakage',async()=>{
 for(const who of ['frank','admin-two','reader','approval','custom','template-denied','override-denied','other','disabled','deleted','']){const req=request(who,'?caseMetadata=1',{forged:!who}),a=await run(req),b=await run(req,true);assert.deepEqual(comparable(a),comparable(b));assert.equal(a.status,['frank','admin-two','reader','approval','custom'].includes(who)?200:403,who);if(a.status===403)assert(!JSON.stringify(a.body).includes('photoId')&&!JSON.stringify(a.body).includes('private-access-sentinel'));}
 for(const who of ['approval','reader'])assert.deepEqual(comparable(await run(request(who,''))),comparable(await run(request(who,''),true)));
 for(const options of [{expired:true},{epoch:2}])assert.equal((await run(request('reader','',options))).status,403);
});
await check('C3 revocation during hydration/authority and pinned-snapshot next-read semantics',async()=>{
 env.PROCESS_SESSION_REVOCATION_ENABLED='1';const req=request(),token=req.headers.get('cookie').slice('process_demo='.length),digest=createHash('sha256').update(token).digest('hex'),revoke=()=>db.prepare('INSERT OR REPLACE INTO process_revoked_sessions VALUES(?,?,?)').run(digest,Date.now()+600000,Date.now());
 onGet=k=>{if(k===refs.ipqcCMasterControl.key)revoke();};assert.equal((await run(req)).status,403);onGet=null;db.exec('DELETE FROM process_revoked_sessions');let calls=0;onRevocation=()=>{if(++calls===2)revoke();};assert.equal((await run(req)).status,403);assert(calls>=2);onRevocation=null;db.exec('DELETE FROM process_revoked_sessions');
 let changed=false;onGet=k=>{if(k===refs.ipqcCMasterControl.key&&!changed){changed=true;install(JSON.stringify({...values,platformUsers:JSON.stringify(users.map(u=>u.id==='reader'?{...u,authEpoch:2}:u))}),701);}};const oldSnapshot=await run(request());assert.equal(oldSnapshot.status,200);assert.equal(oldSnapshot.body.revision,700);assert.equal(oldSnapshot.metrics.stateReads,1);onGet=null;assert.equal((await run(request())).status,403);install(raw);
});
await check('C4 records/inline/chunks/R2, non-adopted/mixed/empty compatibility',async()=>{
 const inline=JSON.stringify(values),key='snapshots/'+createHash('sha256').update(inline).digest('hex')+'.json';objects.set(key,Buffer.from(inline));const formats=[raw,inline,await chunks.encodeChunkedValues(bucket,values),JSON.stringify({__processR2:{key,sha256:key.slice(10,-5)}})];
 const legacy=structuredClone(control);delete legacy.workflow;formats.push(await records.encodeRecordValues(bucket,{...values,ipqcCMasterControl:JSON.stringify(legacy)}));
 const mixed=JSON.parse(raw),aggregate=JSON.parse(objects.get(refs.ipqcCMasterControl.key));aggregate.workflow.working=control.workflow.working;const serialized=JSON.stringify(aggregate),sha=createHash('sha256').update(serialized).digest('hex');objects.set('state-records/v1/'+sha+'.json',Buffer.from(serialized));mixed.__processRecords.values.ipqcCMasterControl={key:'state-records/v1/'+sha+'.json',sha256:sha};formats.push(JSON.stringify(mixed));
 for(const encoded of formats){install(encoded);for(const q of ['','?caseMetadata=1'])assert.deepEqual(comparable(await run(request('reader',q))),comparable(await run(request('reader',q),true)));}
 const absent={...values};delete absent.ipqcCMasterControl;install(await records.encodeRecordValues(bucket,absent));assert.equal((await run(request())).status,200);install(JSON.stringify({...values,ipqcCMasterControl:'{"schemaVersion":99}'}));assert.equal((await run(request())).status,503);install(raw);
});
await check('C5 selected and streamed integrity fail closed; unrelated failure isolated',async()=>{
 for(const ref of [refs.platformUsers,refs.ipqcCMasterControl,refs.masterDataControl,refs.routineEquipmentControl]){const original=objects.get(ref.key);for(const missing of [false,true]){if(missing)objects.delete(ref.key);else objects.set(ref.key,Buffer.from('corrupt'));assert.equal((await run(request())).status,503);}objects.set(ref.key,original);}
 const agg=JSON.parse(objects.get(refs.ipqcCMasterControl.key)),current=agg.workflow.working.__immutableBody,historical=agg.workflow.cases[0].content.__immutableBody;
 const now=objects.get(current.key);objects.set(current.key,Buffer.from('corrupt'));assert.equal((await run(request())).status,503);objects.set(current.key,now);
 const oldBody=objects.get(historical.key);objects.set(historical.key,Buffer.from('corrupt'));assert.equal((await run(request('frank','?caseMetadata=1'))).status,200);const streamed=await run(request('frank',''));assert.equal(streamed.status,200);assert(streamed.error);assert.equal(streamed.body,undefined);objects.set(historical.key,oldBody);
 const other=objects.get(refs.unrelated.key);objects.set(refs.unrelated.key,Buffer.from('corrupt'));assert.equal((await run(request(),true)).status,503);assert.equal((await run(request())).status,200);objects.set(refs.unrelated.key,other);
});
await check('C6 actual selected state remains a forbidden persistence baseline',async()=>{await run(request());assert.equal(lastState.recordStorage.partial,true);events=[];await assert.rejects(()=>core.encodeValues(lastState.values,lastState),/Partial read cannot be saved/);assert.equal(events.length,0);});
await check('C7 loopback full-read historicalCodes and non-loopback bounded behavior',async()=>{
 for(const origin of ['http://localhost:3040','http://127.0.0.1:3000'])for(const who of ['frank','reader']){const req=request(who,'?caseMetadata=1',{origin}),next=await run(req),prior=await run(req,true);assert.deepEqual(comparable(next),comparable(prior));assert(next.keys.includes(refs.unrelated.key));if(who==='frank')assert(next.body.historicalCodes.includes('C-HIST-TIEN-L987-01'));else assert.equal(next.body.historicalCodes,undefined);}
 const hosted=await run(request('frank'));assert.equal(hosted.body.historicalCodes,undefined);assert(!hosted.keys.includes(refs.unrelated.key));
});
await check('C9 historical write-byte proof retained; reviewed current coverage/Save and unchanged GET/access are bound',()=>{
 const fs=require('node:fs'),{execFileSync}=require('node:child_process'),base=baselineCommits['app/api/ipqc-c/route.ts'];
 // Git blobs remain byte-exact; checkout conversion may change CRLF, and nothing else.
 const checkoutBytes=bytes=>bytes.filter((byte,index)=>byte!==13||bytes[index+1]!==10);
 const postBytes=(bytes,marker='type Body =')=>{const index=bytes.indexOf(Buffer.from(marker));assert(index>=0,'POST source marker required');return bytes.subarray(index);};
 const preserved=(original,committed,working,postOnly=false)=>{
  const marker=typeof postOnly==='string'?postOnly:undefined;
  assert.deepEqual(postOnly?postBytes(committed,marker):committed,postOnly?postBytes(original,marker):original,'Committed protected source changed');
  assert.deepEqual(checkoutBytes(working),checkoutBytes(committed),'Working source changed beyond CRLF conversion');
 };
 const lf=Buffer.from('prefix\ntype Body = {};\nconst value = true;\n'),crlf=Buffer.from(lf.toString().replace(/\n/g,'\r\n'));
 for(const original of [lf,crlf])for(const working of [lf,crlf])for(const postOnly of [false,true])preserved(original,original,working,postOnly);
 for(const mutation of [Buffer.from(lf.toString().replace('true','false')),Buffer.from(lf.toString().replace('const',' const')),Buffer.from(lf.toString().replace('const','\tconst')),Buffer.from(lf.toString().replace('prefix','pre\rfix')),lf.subarray(0,lf.length-1),Buffer.concat([lf,Buffer.from([255])])]){
  for(const postOnly of [false,true])assert.throws(()=>preserved(lf,lf,mutation,postOnly),/Working source changed/);
 }
 assert.throws(()=>preserved(lf,crlf,crlf),/Committed protected source changed/);
 const changed=Buffer.from(lf.toString().replace('true','false'));
 for(const postOnly of [false,true])assert.throws(()=>preserved(lf,changed,changed,postOnly),/Committed protected source changed/);
 assert.throws(()=>preserved(Buffer.from('missing'),lf,lf,true),/POST source marker required/);
 assert.throws(()=>preserved(lf,Buffer.from('missing'),lf,true),/POST source marker required/);
 for(const file of ['app/api/ipqc-c/route.ts','lib/ipqc-c.ts','lib/ipqc-c-workflow.ts','app/api/ipqc-c/workflow/route.ts','app/api/ipqc-c/photo/route.ts']){
  const committed=execFileSync('git',['show','HEAD:'+file]),working=fs.readFileSync(file);
  assert.deepEqual(checkoutBytes(working),checkoutBytes(committed),'Working source changed beyond CRLF conversion');
  const historical=execFileSync('git',['show','2cac307f29b8017a2bb6dc5229d47720f2deab33:'+file]);
  const approved={ 'lib/ipqc-c.ts':'c798ab16c8b16adedc4cf672064d422fbb744fb18b4682253f46740ae8b62243', 'app/api/ipqc-c/workflow/route.ts':'d6e25989a7a35fa3e1603c7f0ec785c6789fad6f973296f43d06918a17d41076' };
  // The reviewed coverage / canonical Save deltas intentionally change these
  // two sources. Their contracts run in submit-coverage/save-boundary and explicit Save-projection tests;
  // retain the old historical proof rather than claiming today's POST unchanged.
  if(approved[file])assert.equal(createHash('sha256').update(committed).digest('hex'),approved[file],'Reviewed performance source binding changed');
  if(file==='app/api/ipqc-c/workflow/route.ts')for(const [start,end] of [['async function access(','function readControl('],['export async function GET(','export async function POST(']]){
   const span=bytes=>{const a=bytes.indexOf(start),b=bytes.indexOf(end,a+start.length);assert(a>=0&&b>a);assert.equal(bytes.indexOf(start,a+start.length),-1);return bytes.subarray(a,b);};assert.deepEqual(checkoutBytes(span(committed)),checkoutBytes(span(historical)),'Current GET/access changed beyond CRLF');
  }
  const protectedSource=approved[file]?historical:committed,aligned=['app/api/ipqc-c/route.ts','app/api/ipqc-c/photo/route.ts'].includes(file);
  const protectedBytes=aligned?withoutApprovedOperationAlignment(file,protectedSource):protectedSource;
  preserved(execFileSync('git',['show',base+':'+file]),protectedBytes,protectedBytes,file==='app/api/ipqc-c/workflow/route.ts'?'export async function POST(':file==='app/api/ipqc-c/route.ts');
 }
});
await check('C10 absent archive inline compatibility; R2-dependent formats still fail closed',async()=>{
 const original=env.STATE_ARCHIVE,inline=JSON.stringify(values),sha=createHash('sha256').update(inline).digest('hex'),key='snapshots/'+sha+'.json',chunked=await chunks.encodeChunkedValues(bucket,values);objects.set(key,Buffer.from(inline));
 try{for(const missing of [undefined,null]){env.STATE_ARCHIVE=missing;install(inline);assert.equal((await run(request())).status,200);for(const stored of [raw,chunked,JSON.stringify({__processR2:{key,sha256:sha}})]){install(stored);assert.equal((await run(request())).status,503);}}}
 finally{env.STATE_ARCHIVE=original;install(raw);}
});
console.log(JSON.stringify({status:'PASS',selectedGroups:[...selected],groups:checks.length,checks,baseline,reduced,baselineCommits,baselineHashes:baselineHashes(),network:false,handlerWrites:0,limits:['Synthetic storage only, not live latency','Full-history tests consume response bodies','GET keeps existing pinned authority semantics, not a new poststream fence']}));
}finally{db.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
