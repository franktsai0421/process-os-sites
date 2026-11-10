// Actual production handlers; owned memory SQLite/R2 only. No network or real accounts.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{DatabaseSync}=require('node:sqlite'),{randomUUID,createHash}=require('node:crypto');
const {accessKeys}=require('../public/process/access-policy.mjs'),off=Object.fromEntries(accessKeys.map(k=>[k,false]));
async function fixture(){
 const db=new DatabaseSync(':memory:');for(const f of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())db.exec(fs.readFileSync('drizzle/'+f,'utf8'));
 const users=[{id:'frank',role:'admin'},{id:'limited',role:'admin',accessOverrides:{...off,'feedback.exchange':true,'bom.view':true}},{id:'staff',role:'staff',accessOverrides:{...off}},{id:'disabled',role:'staff',enabled:false}].map(u=>({enabled:true,authEpoch:1,name:'Synthetic '+u.id,...u}));
 const values={platformUsers:JSON.stringify(users),processCustomRoles:'[]',processRoleTemplateOverrides:'{}'};db.prepare('INSERT INTO shared_state(id,revision,"values",updated_at) VALUES(1,1,?,?)').run(JSON.stringify(values),'synthetic');
 const objects=new Map(),reads=[],zip=Buffer.from('synthetic sealed ZIP bytes'),photo=Buffer.from('synthetic image bytes');let duringGet=null,duringBytes=null,puts=0;
 const env={WEB_FEEDBACK_ENABLED:'1',PROCESS_SESSION_SECRET:randomUUID(),DB:{prepare(sql){let args=[];return{bind(...v){args=v;return this;},async first(){return db.prepare(sql).get(...args)||null;},async run(){return{meta:{changes:Number(db.prepare(sql).run(...args).changes)}};}};}},STATE_ARCHIVE:{async get(key){reads.push(key);duringGet?.();const bytes=objects.get(key);return bytes?{body:bytes,arrayBuffer:async()=>{duringBytes?.();return bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length);}}:null;},async put(key,value){puts++;objects.set(key,Buffer.from(value));}}};
 const load=require('../scripts/ipqc-ab-import-harness.cjs')(env),core=load('lib/process-state.ts'),route=load('app/api/web-feedback/route.ts'),cookies={};
 for(const u of users)cookies[u.id]='process_demo='+await core.demoSession(new Request('http://fixture'),u.id,false,1);
 const location={view:'data',tab:'bom',system:'process',type:'page',display:'Synthetic BOM',locator:{},context:{}};
 const image={id:'ATT-source',owner:'frank',name:'synthetic.png',type:'image/png',size:photo.length,sha256:createHash('sha256').update(photo).digest('hex'),location,access:{adminOnly:false,lines:[],views:[],permissions:[]}};
 const issue={id:'FB-source',batchId:'synthetic-batch',markerId:'synthetic-marker',reporter:'Synthetic',reporterId:'frank',createdAt:'2026-01-01',description:'Synthetic public report',location,attachments:[image.id],status:'open',version:1,notes:[{text:'PRIVATE-ARCHIVE-NOTE',at:'synthetic',author:'frank'}],history:[],environment:{build:'synthetic'}};
 const handoff={id:'H-synthetic',operationId:'synthetic-operation-0001',owner:'limited',digest:'synthetic',generatedAt:'synthetic',status:'generated',issues:[issue],sha256:createHash('sha256').update(zip).digest('hex'),size:zip.length};
 const store={issues:[issue],attachments:[image],handoffs:[handoff],batches:[]};
 function save(){db.prepare('UPDATE web_feedback_store SET revision=revision+1,payload=?').run(JSON.stringify(store));objects.set('web-feedback/v1/'+image.id,photo);objects.set('web-feedback/v1/'+handoff.id+'.zip',zip);}
 function auth(edit){const v=JSON.parse(db.prepare('SELECT "values" FROM shared_state').get().values),u=JSON.parse(v.platformUsers);edit(u);v.platformUsers=JSON.stringify(u);db.prepare('UPDATE shared_state SET revision=revision+1,"values"=?').run(JSON.stringify(v));}
 async function call(action,actor='limited',body){const r=await route[body===undefined?'GET':'POST'](new Request('http://fixture/api/web-feedback?action='+action,{method:body===undefined?'GET':'POST',headers:{Cookie:cookies[actor]||'',Origin:'http://fixture','Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})}));return {status:r.status,value:r.headers.get('content-type')?.includes('json')?await r.json():Buffer.from(await r.arrayBuffer())};}
 save();return{db,store,image,issue,handoff,objects,reads,call,save,auth,zip,core,load,values,cookies,puts:()=>puts,duringGet(fn){duringGet=fn;},duringBytes(fn){duringBytes=fn;},close(){db.close();}};
}
void test('public feedback view grants no business data, private notes, edit, export, image or archive access',async()=>{
 const f=await fixture();try{const before=f.db.prepare('SELECT * FROM shared_state').get(),r=await f.call('list','staff');assert.equal(r.status,200);assert.equal(r.value.issues.length,1);assert.equal(r.value.issues[0].attachments.length,0);assert(!JSON.stringify(r.value).includes('PRIVATE-ARCHIVE-NOTE'));
 for(const action of ['handoffs','download&id=H-synthetic','image&id=ATT-source'])assert.equal((await f.call(action,'staff')).status,403);
 for(const action of ['update','export','submit'])assert.equal((await f.call(action,'staff',{})).status,403);
 assert.equal((await f.call('list','disabled')).status,401);assert.equal((await f.call('list','anonymous')).status,401);
 const req=new Request('http://fixture',{headers:{Cookie:f.cookies.staff}});assert.equal(await f.core.can(req,{revision:1,values:f.values},'view:data'),false);assert.equal(f.reads.length,0);assert.equal(f.puts(),0);assert.deepEqual(f.db.prepare('SELECT * FROM shared_state').get(),before);
 }finally{f.close();}
});
for(const profile of [undefined,'approved-helper-v1'])void test((profile||'legacy')+' archives require every source and original image envelope before R2; ordinary ADMIN never bypasses',async()=>{
 const f=await fixture();try{f.handoff.profile=profile;f.save();assert.equal((await f.call('download&id=H-synthetic')).status,200);f.reads.length=0;
 f.auth(users=>{users.find(u=>u.id==='limited').accessOverrides['bom.view']=false;});
 assert.equal((await f.call('image&id=ATT-source')).status,403);assert.equal((await f.call('download&id=H-synthetic')).status,403);
 const r=await f.call('handoffs');assert.equal(r.status,200);assert.equal(r.value.restrictedHandoffs,1);assert.deepEqual(r.value.handoffs,[]);assert(!JSON.stringify(r.value).includes('PRIVATE-ARCHIVE-NOTE'));assert.equal(f.reads.length,0);
 f.auth(users=>{users.find(u=>u.id==='limited').accessOverrides['bom.view']=true;});
 f.image.access.lines=['ungranted-line'];f.save();assert.equal((await f.call('image&id=ATT-source')).status,403);assert.equal((await f.call('download&id=H-synthetic')).status,403);assert.equal(f.reads.length,0);
 assert.equal((await f.call('image&id=ATT-source','frank')).status,200);
 delete f.image.access;f.save();assert.equal((await f.call('image&id=ATT-source')).status,403);assert.equal((await f.call('image&id=ATT-source','frank')).status,200);
 assert.equal(f.puts(),0);
 }finally{f.close();}
});
for(const action of ['image&id=ATT-source','download&id=H-synthetic'])void test(action+' detects authorization changes during R2 wait before releasing bytes',async()=>{
 const f=await fixture();try{f.duringGet(()=>f.auth(users=>{users.find(u=>u.id==='limited').enabled=false;}));const r=await f.call(action);assert.equal(r.status,409);assert.equal(r.value.error,'AUTH_CHANGED_RELOAD');assert.equal(f.puts(),0);}finally{f.close();}
});
void test('archive hash/length and post-buffer authorization are verified for legacy downloads too',async()=>{
 const f=await fixture();try{f.objects.set('web-feedback/v1/H-synthetic.zip',Buffer.from('corrupted'));let r=await f.call('download&id=H-synthetic');assert.equal(r.status,503);assert.equal(r.value.error,'ZIP_HASH_MISMATCH');f.save();f.duringBytes(()=>f.auth(users=>{users.find(u=>u.id==='limited').accessOverrides['bom.view']=false;}));r=await f.call('download&id=H-synthetic');assert.equal(r.status,409);assert.equal(f.puts(),0);}finally{f.close();}
});
void test('mixed historical archives cannot leak unrelated case sources through a new export; source and image denials preserve original receipt semantics',async()=>{
 const f=await fixture();try{
 const body={operationId:randomUUID(),ids:[f.issue.id]},before=f.db.prepare('SELECT payload FROM web_feedback_store').get().payload;
 f.auth(users=>{users.find(u=>u.id==='limited').accessOverrides['bom.view']=false;});
 for(const action of ['export','export-preview','export-approved']){const r=await f.call(action,'limited',body);assert.equal(r.status,403);assert.equal(r.value.error,'EXPORT_SOURCE_PERMISSION_REQUIRED');}
 f.auth(users=>{users.find(u=>u.id==='limited').accessOverrides['bom.view']=true;});
 f.handoff.issues.push({...f.issue,id:'FB-private-other',location:{...f.issue.location,tab:'AB'},attachments:[]});f.save();let r=await f.call('export','limited',body);assert.equal(r.status,403);assert.equal(r.value.error,'EXPORT_HISTORY_PERMISSION_REQUIRED');assert.equal(f.reads.length,0);
 f.handoff.issues.pop();f.image.access.lines=['ungranted-line'];f.store.handoffs=[];f.save();r=await f.call('export','limited',body);assert.equal(r.status,403);assert.equal(r.value.error,'EXPORT_IMAGE_PERMISSION_REQUIRED');
 f.store.handoffs=[{...f.handoff,operationId:body.operationId,digest:createHash('sha256').update(JSON.stringify(body.ids)).digest('hex')}];f.save();r=await f.call('export','limited',body);assert.equal(r.status,200);assert.equal(r.value.replayed,true);assert.equal((await f.call('download&id=H-synthetic')).status,403);assert.equal(f.reads.length,0);assert.equal(f.puts(),0);
 assert(before.includes('PRIVATE-ARCHIVE-NOTE'));
 }finally{f.close();}
});
