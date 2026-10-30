/* oxlint-disable typescript/no-require-imports -- Isolated synthetic Worker handler benchmark. */
const fs=require('node:fs'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite'),{randomUUID,createHash}=require('node:crypto');
const label=process.argv[2]||'current';assert.match(label,/^[a-z0-9-]+$/);
const db=new DatabaseSync(':memory:');
db.exec('CREATE TABLE shared_state(id INTEGER PRIMARY KEY,revision INTEGER,"values" TEXT,updated_at TEXT)');
db.exec(fs.readFileSync('scripts/web-feedback-schema.sql','utf8'));
const values=JSON.stringify({platformUsers:JSON.stringify([{id:'frank',name:'Frank',role:'admin',enabled:true,authMode:'platform'}])});
db.prepare('INSERT INTO shared_state VALUES(1,1,?,?)').run(values,'synthetic');
const objects=new Map();let delayMs=0,counters;
const env={WEB_FEEDBACK_ENABLED:'1',PROCESS_SESSION_SECRET:randomUUID(),DB:{prepare(sql){let args=[];return{bind(...a){args=a;return this;},async first(){counters.sqlReads++;return db.prepare(sql).get(...args)||null;},async run(){counters.sqlWrites++;return{meta:{changes:Number(db.prepare(sql).run(...args).changes)}};}};}},STATE_ARCHIVE:{async get(key){counters.r2Reads++;counters.active++;counters.maxActive=Math.max(counters.maxActive,counters.active);try{if(delayMs)await new Promise(resolve=>setTimeout(resolve,delayMs));const b=objects.get(key);return b?{arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.length)}:null;}finally{counters.active--;}} ,async put(key,bytes){counters.r2Writes++;if(delayMs)await new Promise(resolve=>setTimeout(resolve,delayMs));objects.set(key,Buffer.from(bytes));}}};
const load=require('../scripts/ipqc-ab-import-harness.cjs')(env),core=load('lib/process-state.ts'),route=load('app/api/web-feedback/route.ts');
const location={type:'page',view:'dashboard',tab:'',system:'process',display:'合成測試 · Trang thử nghiệm',locator:{},context:{}};
const attachments=Array.from({length:8},(_,n)=>{
 const bytes=require('./photo-fixtures.mjs').pngFixture({width:128+n,height:128});
 const id='ATT-synthetic-'+n;objects.set('web-feedback/v1/'+id,bytes);
 return{id,owner:'frank',name:'中文附件_ảnh_'+n+'.png',type:'image/png',size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),location,access:{adminOnly:true,lines:[],views:[],permissions:[]}};
});
const issues=Array.from({length:60},(_,n)=>({id:'FB-synthetic-'+n,batchId:'B-synthetic',markerId:'marker-synthetic-'+n,reporter:'Frank',reporterId:'frank',createdAt:'2026-10-29T00:00:00Z',description:'中文與越文 Kiểm tra '.repeat(10),location,attachments:[attachments[n%8].id,attachments[(n+1)%8].id],status:'open',version:1,notes:[],environment:{build:'synthetic'},history:[]}));
const initial=JSON.stringify({issues,attachments,batches:[],handoffs:[]});
db.prepare('UPDATE web_feedback_store SET payload=?,revision=1 WHERE id=1').run(initial);
const samples=[];
(async()=>{
 const cookie='process_demo='+await core.demoSession(new Request('http://localhost:3020'),'frank',false);
 const call=async(action,body)=>{
  counters={sqlReads:0,sqlWrites:0,r2Reads:0,r2Writes:0,active:0,maxActive:0};
  const start=performance.now(),method=body?'POST':'GET';
  const response=await route[method](new Request('http://localhost:3020/api/web-feedback?action='+action,{method,headers:{Cookie:cookie,Origin:'http://localhost:3020','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}));
  const bytes=await response.arrayBuffer(),ms=performance.now()-start;
  assert(response.ok,Buffer.from(bytes).toString());
  return{action,ms,responseBytes:bytes.byteLength,...counters};
 };
 // Warm the request-local auth projection equally before taking samples.
 await call('capabilities');
 for(const delay of [0,40])for(let run=0;run<5;run++){
  delayMs=delay;db.prepare('UPDATE web_feedback_store SET payload=?,revision=1').run(initial);
  for(const [action,body] of [['list'],['update',{id:issues[0].id,version:1,status:'done',note:'私人備註 Ghi chú riêng',operationId:randomUUID()}],['export',{ids:issues.slice(0,20).map(i=>i.id),operationId:randomUUID()}],['handoffs']])samples.push({delayMs,run,...await call(action,body)});
 }
 const median=v=>v.toSorted((a,b)=>a-b)[Math.floor(v.length/2)];
 const summary=[0,40].flatMap(delay=>['list','update','export','handoffs'].map(action=>{
  const group=samples.filter(s=>s.delayMs===delay&&s.action===action);
  return{delayMs:delay,action,medianMs:median(group.map(s=>s.ms)),sqlReads:group.map(s=>s.sqlReads),sqlWrites:group.map(s=>s.sqlWrites),r2Reads:group.map(s=>s.r2Reads),r2Writes:group.map(s=>s.r2Writes),maxConcurrentR2:Math.max(...group.map(s=>s.maxActive))};
 }));
 assert.equal(db.prepare('SELECT "values" FROM shared_state').get().values,values);
 fs.mkdirSync('.sites-runtime/feedback-io',{recursive:true});fs.writeFileSync('.sites-runtime/feedback-io/'+label+'.json',JSON.stringify({label,environment:'Node synthetic handler + SQLite; artificial R2 delay only; not cloud latency',seedIssues:60,exportIssues:20,uniqueImages:8,samples,summary},null,2));
 console.log(JSON.stringify({label,summary}));
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>db.close());
