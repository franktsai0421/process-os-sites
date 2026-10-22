/* oxlint-disable typescript/no-require-imports -- isolated real authorization handlers. */
const fs=require('node:fs'),assert=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite'),{randomUUID,createHash}=require('node:crypto');
(async()=>{const results=[];
for(const format of ['inline','records','chunks','r2']){
 console.log('Checking '+format);
 const db=new DatabaseSync(':memory:'),objects=new Map();
 for(const name of fs.readdirSync('drizzle').filter(n=>n.endsWith('.sql')).sort())db.exec(fs.readFileSync('drizzle/'+name,'utf8'));
 const bucket={async put(k,v){objects.set(k,Buffer.from(v));},async get(k){const bytes=objects.get(k);return bytes?{text:async()=>bytes.toString(),arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)}:null;}};
 const env={WEB_FEEDBACK_ENABLED:'1',PROCESS_SESSION_SECRET:randomUUID(),PROCESS_SESSION_REVOCATION_ENABLED:'1',STATE_ARCHIVE:bucket,DB:{prepare(sql){let args=[];return{bind(...v){args=v;return this;},async first(){return db.prepare(sql).get(...args)||null;},async run(){return {meta:{changes:Number(db.prepare(sql).run(...args).changes)}};}};}}};
 const load=require('./ipqc-ab-import-harness.cjs')(env),core=load('lib/process-state.ts'),api=load('app/api/web-feedback/route.ts');
 let user={id:'fixture-user',role:'staff',name:'Fixture',enabled:true,inheritRole:false,views:['dashboard'],lines:['A'],permissions:[]},revision=0;
 const values={platformUsers:'',processCustomRoles:'[]',processRoleTemplateOverrides:'{}',unrelatedHistory:JSON.stringify({text:'x'.repeat(65536)})};
 const encode=async()=>{if(format==='inline')return JSON.stringify(values);if(format==='records')return load('lib/state-records.ts').encodeRecordValues(bucket,values);if(format==='chunks')return load('lib/state-chunks.ts').encodeChunkedValues(bucket,values);const bytes=Buffer.from(JSON.stringify(values)),sha256=createHash('sha256').update(bytes).digest('hex'),key='snapshots/'+sha256+'.json';await bucket.put(key,bytes);return JSON.stringify({__processR2:{key,sha256},platformUsers:values.platformUsers});};
 const save=async()=>{values.platformUsers=JSON.stringify([user]);const encoded=await encode();db.prepare('INSERT INTO shared_state VALUES(1,?,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,"values"=excluded."values"').run(++revision,encoded,'fixture');return encoded;};
 await save();const base=new Request('http://127.0.0.1:3199/api/web-feedback?action=capabilities');
 const token=await core.demoSession(base,user.id,false),other=await core.demoSession(base,user.id,false);
 const request=(action='capabilities',selected=token,post=false)=>new Request('http://127.0.0.1:3199/api/web-feedback?action='+action,{method:post?'POST':'GET',headers:{Cookie:'process_demo='+selected,Origin:'http://127.0.0.1:3199','Content-Type':'application/json'},...(post?{body:'{}'}:{})});
 const status=async(action,selected,post)=>{const req=request(action,selected,post);return (await api[req.method](req)).status;};
 assert.equal(await status(),200);assert.equal(await status('handoffs'),403);
 user={...user,role:'admin'};await save();assert.equal(await status('handoffs'),200);
 user={...user,enabled:false};await save();assert.equal(await status(),401);
 user={...user,enabled:true};values.maintenanceMode='1';await save();assert.equal(await status('update',token,true),503);
 delete values.maintenanceMode;await save();assert.equal(await status(),200);
 await core.clearDemoSession(request());assert.equal(await status(),401);assert.equal(await status('capabilities',other),200);
 const encoded=await save();
 if(format!=='inline'){const entry=objects.entries().next().value;objects.set(entry[0],Buffer.from('corrupt')); // Force a referenced immutable object failure using a malformed envelope below as well.
   const marker={records:'__processRecords',chunks:'__processChunks',r2:'__processR2'}[format];const damaged=JSON.parse(encoded);damaged[marker]={version:999,key:'missing',sha256:'0'.repeat(64)};db.prepare('UPDATE shared_state SET revision=?,"values"=?').run(++revision,JSON.stringify(damaged));assert.equal(await status('capabilities',other),503);
 }else{
   for(const [key,bad]of Object.entries({platformUsers:[user],processCustomRoles:[],processRoleTemplateOverrides:{},maintenanceMode:true})){const damaged={...values,[key]:bad};db.prepare('UPDATE shared_state SET revision=?,"values"=?').run(++revision,JSON.stringify(damaged));assert.equal(await status('capabilities',other),503,'Native auth field must not become trusted JSON string: '+key);}
   db.prepare('UPDATE shared_state SET revision=?,"values"=?').run(++revision,'{invalid');assert.equal(await status('capabilities',other),503);
 }
 results.push({format,status:'PASS',checks:'cold read, role change, disable, maintenance, same-revision logout, other valid session, corrupt storage denied'});db.close();
}
console.log(JSON.stringify(results));})().catch(error=>{console.error(error.message);process.exitCode=1;});
