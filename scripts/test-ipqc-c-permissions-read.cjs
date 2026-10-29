/* Actual candidate and published handler; synthetic SQLite/R2 only, no network. */
const assert=require('node:assert/strict'),fs=require('node:fs');
const {DatabaseSync}=require('node:sqlite'),{randomBytes,createHash,createHmac}=require('node:crypto'),{execFileSync}=require('node:child_process');
const {makeLoader,baselineHashes}=require('./read-performance-harness.cjs'),{accessKeys}=require('../public/process/access-policy.mjs');
const {withoutApprovedOperationAlignment}=require('./ipqc-c-operation-source-contract.cjs');
const route='app/api/ipqc-c/workflow/route.ts',base='dc8c1c2238a6dd89c2707d50e050fe8ae674c9e8';
const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE shared_state(id INTEGER PRIMARY KEY,revision INTEGER,"values" TEXT);CREATE TABLE process_revoked_sessions(token_digest TEXT PRIMARY KEY,expires_at INTEGER,revoked_at INTEGER)');
const objects=new Map();let events=[],selects=0,revocations=0,testing=false,onGet=null,onRevocation=null;
const bucket={async put(k,v){assert(!testing,'HANDLER_R2_WRITE');objects.set(k,Buffer.from(v));},async get(k){events.push(k);onGet?.(k);const b=objects.get(k);return b?{text:async()=>b.toString(),arrayBuffer:async()=>Uint8Array.from(b).buffer}:null;},async head(){throw Error('HANDLER_HEAD');},async delete(){throw Error('HANDLER_DELETE');}};
const secret=randomBytes(32).toString('hex'),env={STATE_ARCHIVE:bucket,PROCESS_SESSION_SECRET:secret,PROCESS_SESSION_REVOCATION_ENABLED:'1',DEMO_LOGIN_ENABLED:'false',DB:{prepare(sql){assert(/^SELECT /i.test(sql),'HANDLER_SQL_WRITE');let args=[];return{bind(...a){args=a;return this;},async first(){if(sql.includes('FROM shared_state'))selects++;if(sql.includes('process_revoked_sessions')){revocations++;onRevocation?.();}return db.prepare(sql).get(...args)||null;},async run(){throw Error('HANDLER_SQL_WRITE');}};}}};
const load=makeLoader(env),old=makeLoader(env,{baseline:[route]}),api=load(route),prior=old(route),core=load('lib/process-state.ts'),records=load('lib/state-records.ts'),chunks=load('lib/state-chunks.ts');
const cells=(...yes)=>Object.fromEntries(accessKeys.map(k=>[k,yes.includes(k)]));
const user=(id,permission,extra={})=>({id,name:id,role:'staff',enabled:true,authMode:'platform',authEpoch:1,inheritRole:false,accessOverrides:cells(permission),...extra});
const users=[user('frank','',{role:'admin'}),user('admin-two','',{role:'admin',inheritRole:true,accessOverrides:undefined}),user('reader','ipqc-c.view'),user('approval','approval.view'),user('custom','',{role:'fixture-role',inheritRole:true,accessOverrides:undefined}),user('template-denied','',{role:'blocked-role',inheritRole:true,accessOverrides:undefined}),user('override-denied','',{role:'fixture-role',inheritRole:true}),user('other','fqc.view'),user('disabled','ipqc-c.view',{enabled:false}),user('deleted','ipqc-c.view',{deletedAt:'fixture'})];
const fixture=require('./v3-quality-growth-fixture.cjs')('ipqc-c',[{id:'a'.repeat(64),bytes:0}],2,20);
const values={...fixture.values,platformUsers:JSON.stringify(users),processCustomRoles:JSON.stringify(['fixture-role','blocked-role'].map(id=>({id,name:id,lines:[],views:[],permissions:[],access:cells('ipqc-c.view')}))),processRoleTemplateOverrides:JSON.stringify({'blocked-role':{access:cells()}}),processAccessControl:'{"audit":"private-access-sentinel"}',maintenanceMode:'0',unrelated:JSON.stringify({text:'測試 Việt'.repeat(10000)})};
const install=(raw,revision=710)=>db.prepare('INSERT OR REPLACE INTO shared_state VALUES(1,?,?)').run(revision,raw);
function request(who='reader',query='?permissions=1',{epoch=1,expired=false,forged=false,local=false}={}){const origin=local?'http://localhost':'https://permission.synthetic.invalid',payload=Buffer.from(JSON.stringify({version:2,id:who,sessionType:'platform',authEpoch:epoch,expires:Date.now()+(expired?-60000:600000),nonce:'fixture'})).toString('base64'),headers=who?{cookie:core.sessionCookieName(new Request(origin))+'='+payload+'.'+createHmac('sha256',secret).update(payload).digest('hex')}:{};if(forged)headers['X-ChatGPT-User-Id']='frank';return new Request(origin+'/api/ipqc-c/workflow'+query,{headers});}
async function run(req,baseline=false){events=[];selects=0;revocations=0;const state=db.prepare('SELECT * FROM shared_state').get(),snapshot=new Map(objects);testing=true;let response;try{response=await(baseline?prior:api).GET(req);}finally{testing=false;}const body=await response.json();if(!onGet&&!onRevocation)assert.deepEqual(db.prepare('SELECT * FROM shared_state').get(),state);assert.deepEqual(objects,snapshot);return{status:response.status,headers:[...response.headers],body,metrics:{gets:events.length,bytes:events.reduce((n,k)=>n+(objects.get(k)?.length||0),0),selects,revocations},keys:[...events]};}
const comparable=({status,headers,body})=>({status,headers,body});
// These fixtures grant E/S/T only to the two admins. Reader/custom retain V only.
// Compare every other DTO field, status, header and revision to the historical handler.
const extraRevocations=who=>['frank','admin-two'].includes(who)?3:['reader','custom'].includes(who)?2:0;
function policyParity(actual,prior,who='reader'){
 const expected=structuredClone(comparable(prior));
 if(expected.status===200&&expected.body.permissions){
  const allowed=['frank','admin-two'].includes(who);
  for(const op of ['edit','save','submit','delete'])expected.body.permissions[op]=allowed;
 }
 assert.deepEqual(comparable(actual),expected);
}
const checks=[];async function check(name,fn){await fn();checks.push(name);console.log('PASS '+name);}
(async()=>{try{const raw=await records.encodeRecordValues(bucket,values),refs=JSON.parse(raw).__processRecords.values;install(raw);let baseline,reduced,grownBaseline;
await check('P1 exact authorized operation-cell delta; other permissions revision headers and session parity',async()=>{
 for(const who of ['frank','admin-two','reader','approval','custom','template-denied','override-denied','other','disabled','deleted','']){const req=request(who,'?permissions=1',{forged:!who}),a=await run(req),b=await run(req,true);policyParity(a,b,who);assert.equal(a.metrics.revocations,b.metrics.revocations+extraRevocations(who),who+' exact additional cell checks');assert.equal(a.status,['frank','admin-two','reader','approval','custom'].includes(who)?200:403,who);assert(!JSON.stringify(a.body).includes('private-access-sentinel'));}
 for(const opts of [{expired:true},{epoch:2}]){const req=request('reader','?permissions=1',opts);assert.deepEqual(comparable(await run(req)),comparable(await run(req,true)));assert.equal((await run(req)).status,403);}
 const local=request('reader','?permissions=1',{local:true});policyParity(await run(local),await run(local,true));
});
await check('P2 five-key R2 cost stays bounded as unrelated aggregates grow; exact additional operation-cell revocation checks',async()=>{
 const req=request(),a=await run(req),b=await run(req,true);reduced=a.metrics;baseline=b.metrics;
 policyParity(a,b);assert.equal(a.metrics.gets,5);assert.equal(a.metrics.selects,1);assert(a.metrics.gets<b.metrics.gets);assert(a.metrics.bytes<b.metrics.bytes);assert.equal(a.metrics.revocations,b.metrics.revocations+extraRevocations('reader'));assert(a.metrics.revocations>1);
 assert.deepEqual(new Set(a.keys),new Set(['platformUsers','processCustomRoles','processRoleTemplateOverrides','processAccessControl','maintenanceMode'].map(k=>refs[k].key)));
 const grown={...values};for(let i=0;i<12;i++)grown['unrelated-'+i]=JSON.stringify({index:i,text:'irrelevant'.repeat(3000)});install(await records.encodeRecordValues(bucket,grown));
 const large=await run(req),oldLarge=await run(req,true);grownBaseline=oldLarge.metrics;assert.deepEqual(large.metrics,reduced);policyParity(large,oldLarge);assert(oldLarge.metrics.gets>baseline.gets);install(raw);
});
await check('P3 required missing/corrupt records still fail closed; unrelated failure isolation is explicit',async()=>{
 for(const key of ['platformUsers','processCustomRoles','processRoleTemplateOverrides','processAccessControl','maintenanceMode']){const ref=refs[key],saved=objects.get(ref.key);for(const corrupt of [false,true]){if(corrupt)objects.set(ref.key,Buffer.from('corrupt'));else objects.delete(ref.key);assert.equal((await run(request())).status,503);assert.equal((await run(request(),true)).status,503);}objects.set(ref.key,saved);}
 const ref=refs.unrelated,saved=objects.get(ref.key);objects.set(ref.key,Buffer.from('corrupt'));assert.equal((await run(request())).status,200);assert.equal((await run(request(),true)).status,503);objects.set(ref.key,saved);
});
await check('P4 revocation during selected hydration and later authority checks denies without writes',async()=>{
 const req=request(),token=req.headers.get('cookie').slice('process_demo='.length),digest=createHash('sha256').update(token).digest('hex'),revoke=()=>db.prepare('INSERT OR REPLACE INTO process_revoked_sessions VALUES(?,?,?)').run(digest,Date.now()+600000,Date.now());
 for(const baseline of [false,true]){onGet=k=>{if(k===refs.platformUsers.key)revoke();};assert.equal((await run(req,baseline)).status,403);onGet=null;db.exec('DELETE FROM process_revoked_sessions');let calls=0;onRevocation=()=>{if(++calls===2)revoke();};assert.equal((await run(req,baseline)).status,403);assert(calls>=2);onRevocation=null;db.exec('DELETE FROM process_revoked_sessions');}
});
await check('P5 existing pinned-snapshot revision and next-request epoch semantics preserved',async()=>{
 for(const baseline of [false,true]){install(raw);let changed=false;onGet=k=>{if(k===refs.platformUsers.key&&!changed){changed=true;install(JSON.stringify({...values,platformUsers:JSON.stringify(users.map(u=>u.id==='reader'?{...u,authEpoch:2}:u))}),711);}};const a=await run(request(),baseline);assert.equal(a.status,200);assert.equal(a.body.revision,710);assert.equal(a.metrics.selects,1);onGet=null;assert.equal((await run(request(),baseline)).status,403);}install(raw);
});
await check('P6 legacy inline/chunk/R2 and absent archive preserve behavior',async()=>{
 const inline=JSON.stringify(values),sha=createHash('sha256').update(inline).digest('hex'),key='snapshots/'+sha+'.json';objects.set(key,Buffer.from(inline));const formats=[raw,inline,await chunks.encodeChunkedValues(bucket,values),JSON.stringify({__processR2:{key,sha256:sha}})];
 for(const format of formats){install(format);policyParity(await run(request()),await run(request(),true));}
 const original=env.STATE_ARCHIVE;try{env.STATE_ARCHIVE=undefined;install(inline);assert.equal((await run(request())).status,200);install(raw);assert.equal((await run(request())).status,503);}finally{env.STATE_ARCHIVE=original;install(raw);}
});
await check('P7 non-permissions GET history/receipt/restore selectors retain full response and I/O parity',async()=>{
 for(const query of ['?caseMetadata=1','?since=not-current','?history=cases','?caseId=case0','?uiHistory=1','?legacyHistory=1','?versionId=active','?restoreSaveId=save0','?operationId=not-found']){const req=request('frank',query),a=await run(req),b=await run(req,true);assert.deepEqual(comparable(a),comparable(b),query);assert.deepEqual(a.metrics,{...b.metrics,revocations:b.metrics.revocations+extraRevocations('frank')},query);}
 // Existing permissions precedence remains, even with unrelated selectors present.
 const req=request('frank','?permissions=1&caseId=missing&restoreSaveId=missing');assert.deepEqual(comparable(await run(req)),comparable(await run(req,true)));
});
await check('P8 historical exact permission selection; current GET/access preserved and new Save source bound',async()=>{
 const priorBytes=execFileSync('git',['show',base+':'+route]),committedBytes=execFileSync('git',['show','HEAD:'+route]),historicalBytes=execFileSync('git',['show','2cac307f29b8017a2bb6dc5229d47720f2deab33:'+route]),candidateBytes=withoutApprovedOperationAlignment(route,historicalBytes),delta=Buffer.from("...(query.has('permissions')?{keys:['platformUsers','processCustomRoles','processRoleTemplateOverrides','processAccessControl','maintenanceMode']}:{}),"),at=candidateBytes.indexOf(delta);assert(at>=0);assert.equal(candidateBytes.indexOf(delta,at+delta.length),-1);assert.deepEqual(Buffer.concat([candidateBytes.subarray(0,at),candidateBytes.subarray(at+delta.length)]),priorBytes);
 assert.equal(createHash('sha256').update(committedBytes).digest('hex'),'d6e25989a7a35fa3e1603c7f0ec785c6789fad6f973296f43d06918a17d41076','Reviewed coverage/Save/projection source binding changed');
 for(const [start,end] of [['async function access(','function readControl('],['export async function GET(','export async function POST(']]){const span=bytes=>{const a=bytes.indexOf(start),b=bytes.indexOf(end,a+start.length);assert(a>=0&&b>a);assert.equal(bytes.indexOf(start,a+start.length),-1);return bytes.subarray(a,b);};const canonical=bytes=>Buffer.from([...bytes].filter((v,i)=>v!==13||bytes[i+1]!==10));assert.deepEqual(canonical(span(committedBytes)),canonical(span(historicalBytes)),'Current GET/access changed beyond CRLF');}
 const lf=bytes=>Buffer.from([...bytes].filter((value,index)=>value!==13||bytes[index+1]!==10));assert.deepEqual(lf(fs.readFileSync(route)),lf(committedBytes),'working tree differs beyond CRLF');
 const marker=Buffer.from('export async function POST('),a=priorBytes.indexOf(marker),b=candidateBytes.indexOf(marker);assert(a>=0&&b>=0);assert.deepEqual(candidateBytes.subarray(b),priorBytes.subarray(a));
});
console.log(JSON.stringify({status:'PASS',groups:checks.length,checks,baseline,reduced,grownBaseline,baselineCommit:base,baselineHashes:baselineHashes(),network:false,handlerWrites:0,limits:['Synthetic storage work counts, not live latency','Read assertions cover E/S/T/delete metadata and non-permissions data; historical POST proof retained, current Save follows separately tested bounded contract','Unrelated records failure isolation deliberately differs; required records remain fail closed','No authority cache; E/S/T add three current identity checks, and delete skips its old check when edit is denied (net +2 for view-only, +3 for fully permitted)']}));
}finally{db.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
