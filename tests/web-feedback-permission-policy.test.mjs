import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {workerSource} from './helpers/native-worker-source.mjs';
import {accessKeys,roleEditable} from '../public/process/access-policy.mjs';
async function fixture(){
 const db=new DatabaseSync(':memory:'),objects=new Map(),effects={writes:0,objectReads:0};let beforeWrite=null;
 for(const name of fs.readdirSync('drizzle').filter(n=>n.endsWith('.sql')).sort())db.exec(fs.readFileSync('drizzle/'+name,'utf8'));
 const off=Object.fromEntries(accessKeys.map(k=>[k,false])),users=[{id:'synthetic-reader',name:'Synthetic reader',role:'staff',enabled:true,authEpoch:1,accessOverrides:{...off}},{id:'synthetic-editor',name:'Synthetic editor',role:'staff',enabled:true,authEpoch:1,accessOverrides:{...off,'feedback.view':true,'feedback.edit':true,'feedback.exchange':true}},{id:'synthetic-disabled',name:'Synthetic disabled',role:'staff',enabled:false,authEpoch:1,accessOverrides:{...off}},{id:'frank',name:'Synthetic primary',role:'admin',enabled:true,authEpoch:1}];
 const env={PROCESS_SESSION_SECRET:randomUUID(),WEB_FEEDBACK_ENABLED:'1',DB:{prepare(sql){let args=[];return{bind(...a){args=a;return this;},async first(){return db.prepare(sql).get(...args)||null;},async all(){return{success:true,results:db.prepare(sql).all(...args)};},async run(){if(sql.startsWith('UPDATE web_feedback_store')){beforeWrite?.();effects.writes++;}return{meta:{changes:Number(db.prepare(sql).run(...args).changes)}};}};},async batch(statements){return Promise.all(statements.map(s=>s.all()));}},STATE_ARCHIVE:{async put(key,value){objects.set(key,typeof value==='string'?Buffer.from(value):Buffer.from(value));},async head(key){return objects.has(key)?{}:null;},async get(key){effects.objectReads++;const bytes=objects.get(key);return bytes?{text:async()=>bytes.toString(),arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),body:new ReadableStream({start(c){c.enqueue(bytes);c.close();}})}:null;}}};
 const values={platformUsers:JSON.stringify(users),processCustomRoles:'[]',processRoleTemplateOverrides:'{}',bomMasterControl:JSON.stringify({syntheticPrivate:'must stay hidden'})};
 db.prepare('INSERT INTO shared_state VALUES(1,1,?,?)').run(JSON.stringify(values),'synthetic');
 const issue={id:'synthetic-feedback-case',batchId:'synthetic-batch',markerId:'synthetic-marker',reporter:'Synthetic reporter',reporterId:'synthetic-editor',createdAt:'2026-11-09T00:00:00Z',description:'Synthetic issue',location:{type:'page',view:'dashboard',tab:'',system:'process',display:'Synthetic source',locator:{},context:{}},attachments:[],status:'open',version:1,notes:[],environment:{build:'synthetic'},history:[]};
 const store={issues:[issue],attachments:[],batches:[],handoffs:[]};db.prepare('INSERT OR REPLACE INTO web_feedback_store(id,revision,payload) VALUES(1,1,?)').run(JSON.stringify(store));
 const load=workerSource(env),core=await load.load('lib/process-state.ts'),api=await load.load('app/api/web-feedback/route.ts'),cookies={};
 for(const u of users)cookies[u.id]='process_demo='+await core.demoSession(new Request('https://synthetic.invalid'),u.id,false,u.authEpoch);
 async function call(actor,action='list',body,query=''){
  const response=await api[body?'POST':'GET'](new Request('https://synthetic.invalid/api/web-feedback?action='+action+query,{method:body?'POST':'GET',headers:{Cookie:cookies[actor],Origin:'https://synthetic.invalid','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}));
  return{status:response.status,headers:response.headers,body:response.headers.get('content-type')?.includes('application/zip')?new Uint8Array(await response.arrayBuffer()):await response.json()};
 }
 const snapshot=()=>db.prepare('SELECT revision,payload FROM web_feedback_store WHERE id=1').get();
 function revoke(key){const row=db.prepare('SELECT revision,"values" FROM shared_state WHERE id=1').get(),v=JSON.parse(row.values),u=JSON.parse(v.platformUsers);u.find(x=>x.id==='synthetic-editor').accessOverrides[key]=false;v.platformUsers=JSON.stringify(u);db.prepare('UPDATE shared_state SET revision=revision+1,"values"=? WHERE id=1').run(JSON.stringify(v));}
 return{db,core,load,users,env,issue,store,objects,effects,call,snapshot,revoke,beforeWrite(fn){beforeWrite=fn;},setStore(){db.prepare('UPDATE web_feedback_store SET payload=? WHERE id=1').run(JSON.stringify(store));},close(){db.close();}};
}
void test('every enabled company account can open feedback; no edit/export or other-module authority follows',async()=>{
 const f=await fixture();try{const before=f.snapshot(),r=await f.call('synthetic-reader');assert.equal(r.status,200);assert.equal(r.body.permissions.view,true);assert.equal(r.body.permissions.edit,false);assert.equal(r.body.permissions.exchange,false);assert.equal(r.body.permissions.delete,false);assert.equal(r.body.issues[0].notes,undefined);assert.deepEqual(f.snapshot(),before);
 const workflow=await f.load.load('app/api/bom/workflow/route.ts'),cookie='process_demo='+await f.core.demoSession(new Request('https://synthetic.invalid'),'synthetic-reader',false,1),denied=await workflow.GET(new Request('https://synthetic.invalid/api/bom/workflow?permissions=1',{headers:{Cookie:cookie}}));assert.equal(denied.status,403);assert.notEqual((await f.call('synthetic-disabled')).status,200);
 }finally{f.close();}
});
void test('explicit non-admin edit/export grants are assignable and reflected by real capabilities',async()=>{
 const f=await fixture();try{assert.equal(roleEditable('staff')['feedback.edit'],true);assert.equal(roleEditable('staff')['feedback.exchange'],true);const r=await f.call('synthetic-editor','capabilities');assert.equal(r.status,200);assert.equal(r.body.admin,false);assert.equal(r.body.permissions.edit,true);assert.equal(r.body.permissions.exchange,true);assert.equal(r.body.permissions.delete,false);}finally{f.close();}
});
void test('delegated edit persists once and old operation replays; view-only cannot update or delete',async()=>{
 const f=await fixture();try{const body={id:f.issue.id,version:1,status:'done',note:'Synthetic authorized note',operationId:randomUUID()},before=f.snapshot();assert.equal((await f.call('synthetic-reader','update',body)).status,403);assert.equal((await f.call('synthetic-editor','delete',{id:f.issue.id,version:1})).status,403);assert.deepEqual(f.snapshot(),before);
 const r=await f.call('synthetic-editor','update',body);assert.equal(r.status,200);assert.equal(r.body.version,2);assert.equal(r.body.notes[0].text,body.note);const saved=f.snapshot();assert.equal((await f.call('synthetic-editor','update',body)).body.replayed,true);assert.deepEqual(f.snapshot(),saved);assert.equal((await f.call('synthetic-editor')).body.issues[0].version,2);
 }finally{f.close();}
});
void test('delegated export uses reviewed projection, own handoff and fresh download; raw legacy export stays admin-only',async()=>{
 const f=await fixture();try{const preview=await f.call('synthetic-editor','export-preview',{ids:[f.issue.id],imageIds:[]});assert.equal(preview.status,200);const batch=preview.body.batches[0],made=await f.call('synthetic-editor','export-approved',{ids:batch.ids,versions:batch.versions,imageIds:batch.imageIds,operationId:randomUUID()});assert.equal(made.status,201);const zip=await f.call('synthetic-editor','download',undefined,'&id='+made.body.id);assert.equal(zip.status,200);assert.equal(zip.body.length,made.body.size);
 assert.equal((await f.call('synthetic-reader','download',undefined,'&id='+made.body.id)).status,403);assert.equal((await f.call('synthetic-editor','export',{ids:[f.issue.id],operationId:randomUUID()})).status,403);const history=await f.call('synthetic-editor','handoffs');assert.equal(history.status,200);assert.equal(history.body.handoffs.length,1);
 f.store.handoffs=JSON.parse(f.snapshot().payload).handoffs;f.store.handoffs.push({...f.store.handoffs[0],id:'synthetic-foreign-handoff',owner:'frank'});f.setStore();assert.equal((await f.call('synthetic-editor','download',undefined,'&id=synthetic-foreign-handoff')).status,403);assert.equal((await f.call('synthetic-editor','handoffs')).body.handoffs.length,1);
 }finally{f.close();}
});
void test('image envelopes stay required even for a delegated editor/exporter',async()=>{
 const f=await fixture();try{f.store.attachments.push({id:'synthetic-private-image',owner:'frank',name:'Synthetic protected',type:'image/png',size:4,sha256:'a'.repeat(64),location:f.issue.location,access:{adminOnly:true,lines:[],views:[],permissions:[]}});f.issue.attachments.push('synthetic-private-image');f.setStore();const before=f.effects.objectReads;assert.equal((await f.call('synthetic-editor','image',undefined,'&id=synthetic-private-image')).status,403);assert.equal((await f.call('synthetic-editor','export-preview',{ids:[f.issue.id]})).status,403);assert.equal(f.effects.objectReads,before);assert.equal((await f.call('synthetic-editor','export-preview',{ids:[f.issue.id],imageIds:[]})).status,200);}finally{f.close();}
});
void test('a permission revocation racing the edit CAS cannot commit feedback',async()=>{
 const f=await fixture();try{const before=f.snapshot();f.beforeWrite(()=>f.revoke('feedback.edit'));const r=await f.call('synthetic-editor','update',{id:f.issue.id,version:1,status:'done',note:'Synthetic raced',operationId:randomUUID()});assert.equal(r.status,409);assert.deepEqual(f.snapshot(),before);}finally{f.close();}
});

void test('feedback delegation cannot manage other accounts or change protected primary settings',async()=>{
 const f=await fixture();try{const api=await f.load.load('app/api/user-access/route.ts'),actor='synthetic-editor',cookie='process_demo='+await f.core.demoSession(new Request('https://synthetic.invalid'),actor,false,1),before=JSON.stringify(f.db.prepare('SELECT * FROM shared_state').all());
 const own=await api.GET(new Request('https://synthetic.invalid/api/user-access',{headers:{Cookie:cookie}})),ownBody=await own.json();assert.equal(own.status,200);assert.deepEqual(Array.from(ownBody.users,u=>u.id),[actor]);assert.equal(ownBody.canCreate,false);assert.equal(ownBody.roles.length,0);
 for(const body of [{action:'delete-user',id:'frank'},{action:'status-user',id:'frank',enabled:false},{action:'update-user',id:'synthetic-reader',changes:{'feedback.exchange':true}},{action:'create-user',id:'synthetic-denied',name:'Synthetic denied',role:'staff',password:randomUUID(),confirmation:'different'}]){
  const r=await api.POST(new Request('https://synthetic.invalid/api/user-access',{method:'POST',headers:{Cookie:cookie,Origin:'https://synthetic.invalid','Content-Type':'application/json'},body:JSON.stringify({baseRevision:1,...body})}));assert.equal(r.status,403);
 }
 assert.equal(JSON.stringify(f.db.prepare('SELECT * FROM shared_state').all()),before);
 const projected=await f.core.companyState(new Request('https://synthetic.invalid/api/shared-state',{headers:{Cookie:cookie}}),await f.core.readState());assert.equal('bomMasterControl' in projected.values,false);
 }finally{f.close();}
});
void test('revoking export during ZIP retrieval denies bytes before response delivery',async()=>{
 const f=await fixture();try{const preview=await f.call('synthetic-editor','export-preview',{ids:[f.issue.id],imageIds:[]}),batch=preview.body.batches[0],made=await f.call('synthetic-editor','export-approved',{ids:batch.ids,versions:batch.versions,imageIds:batch.imageIds,operationId:randomUUID()});assert.equal(made.status,201);
 const get=f.env.STATE_ARCHIVE.get.bind(f.env.STATE_ARCHIVE);f.env.STATE_ARCHIVE.get=async key=>{const value=await get(key);if(key.endsWith('.zip'))f.revoke('feedback.exchange');return value;};
 const before=f.snapshot(),r=await f.call('synthetic-editor','download',undefined,'&id='+made.body.id);assert.equal(r.status,409);assert.equal(r.body.error,'AUTH_CHANGED_RELOAD');assert.deepEqual(f.snapshot(),before);
 }finally{f.close();}
});
void test('actual board/detail rendering follows edit/export capability for non-admin roles',()=>{
 const source=fs.readFileSync('public/process/web-feedback.js','utf8');
 const boardStart=source.indexOf(' function renderBoard('),boardCode=source.slice(boardStart,source.indexOf('  const shell=',boardStart))+'}';
 const detailStart=source.indexOf(' function renderDetail('),detailCode=source.slice(detailStart,source.indexOf("  host.querySelectorAll('[data-show-image]')",detailStart))+'}';
 for(const edit of [false,true])for(const exchange of [false,true])for(const vi of [false,true]){
  const detail={innerHTML:''},board={isConnected:true,innerHTML:'',querySelector:s=>s==='.wf-detail'?detail:{}},issue={id:'synthetic-case',status:'open',reporter:'Synthetic',createdAt:'synthetic',description:'Synthetic issue',location:{display:'Synthetic page'},attachments:[],notes:[]};
  const ctx={board,issues:[issue],selectedIssue:issue.id,boardTab:'list',boardPermissions:{edit,exchange,delete:false},isAdmin:false,accessController:null,selected:new Set(),saveBoardView(){},markSelected(){},notesHTML:()=>'',statusLabel:s=>s,imageURL:s=>s,esc:String,t:(zh,vn)=>vi?vn:zh};vm.createContext(ctx);vm.runInContext(boardCode+detailCode,ctx);ctx.renderBoard(true);ctx.renderDetail();assert.equal(board.innerHTML.includes('data-export'),exchange);assert.equal(detail.innerHTML.includes('data-note>'),edit);assert.equal(detail.innerHTML.includes('data-update='),edit);assert.equal(detail.innerHTML.includes('data-delete-issue'),false);
 }
});
