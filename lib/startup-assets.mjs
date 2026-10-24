// Fixed R1 supplement only. No general object writer, credentials, or import reset.
import {createHash} from 'node:crypto';
import {statePermissions,validateAssetIndex} from './site-security.mjs';
export const startupCase=Object.freeze({
 projectId:'appgprj_6ad9abaff47c8191846eb9821034696b',origin:'https://process-os-test.franktsai0421.chatgpt.site',ownerId:'frank',
 transferId:'35006091ac686b2d6288015904f45d74338752151975334b9c7da3b3c500853e',target:'c5311ad0524330b7c913757fc2dc54796ecd569f0b0755f6a3b31396c8d58e80',manifestSha:'326dc9372fab57554b96965c19815044d0cab6e6a28b6849f6d224c4906b7510',
 indexSha:'d740b8a50ad1a2c4fd671e3148f18c7bc007b9d3f212722282e7be1edcf1e347',indexCount:304,
 files:[
 {name:'imported-data.js',bytes:1212989,sha256:'9e8a5be4b37dd4d30976515d80672c73251eac04db2ee95bbaede083cae3ff62'},
 {name:'line-process-data.js',bytes:141447,sha256:'fe4569e338372d64b9360eac2be18838c92d05961e6bab3101b85ca45df9d3d7'},
 {name:'line-c-master.js',bytes:32097,sha256:'f494aeb5769d3fbaaa263bede61dc6972d65def4b4cf404b5dba5938421b695d'},
 ],
});
const indexKey='company-assets/index.json',prefix='startup-r1-three-v1:',action='startup-asset';
const fail=(v,c)=>{if(!v)throw Error(c);},hash=b=>createHash('sha256').update(b).digest('hex'),encode=v=>new TextEncoder().encode(JSON.stringify(v));
const markerId=name=>prefix+name;
export async function startupBody(body,limit,{signal,timeoutMs=20000}={}){
 fail(body,'STARTUP_BODY_REQUIRED');const reader=body.getReader(),parts=[];let n=0,timer,rejectStop;
 const stopped=new Promise((_,reject)=>{rejectStop=reject;}),abort=()=>{rejectStop(Error('STARTUP_READ_STOPPED'));void reader.cancel().catch(()=>{});};
 signal?.addEventListener('abort',abort,{once:true});
 try{fail(!signal?.aborted,'STARTUP_READ_STOPPED');timer=setTimeout(()=>{rejectStop(Error('STARTUP_READ_TIMEOUT'));void reader.cancel().catch(()=>{});},timeoutMs);
 for(;;){const r=await Promise.race([reader.read(),stopped]);if(r.done)break;n+=r.value.length;fail(n<=limit,'STARTUP_BODY_LIMIT');parts.push(r.value);}
 const bytes=new Uint8Array(n);let at=0;for(const p of parts){bytes.set(p,at);at+=p.length;}return bytes;
 }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);void reader.cancel().catch(()=>{});reader.releaseLock();}
}
export function createStartupAssets({db,bucket,authorize,signal,plan=startupCase,timeoutMs=20000}){
 const files=plan.files.map(f=>({...f,path:'/process/data/'+f.name,key:'company-assets/objects/'+f.sha256,contentType:'application/javascript',permissions:[...statePermissions.processMasterData]}));
 const gateSQL="SELECT a.phase,a.transfer_id,t.target,b.state,b.active_request,s.manifest_sha FROM process_snapshot_activations a JOIN process_snapshot_target t ON t.transfer_id=a.transfer_id JOIN process_snapshot_transfers s ON s.id=a.transfer_id JOIN process_import_budget b ON b.id=1 WHERE t.id=1";
 async function access(){fail(!signal?.aborted,'STARTUP_STOPPED');fail(await authorize(),'STARTUP_OWNER_REQUIRED');const r=await db.prepare(gateSQL).first();fail(r&&r.phase==='active'&&r.transfer_id===plan.transferId&&r.target===plan.target&&r.manifest_sha===plan.manifestSha&&r.state==='complete'&&!r.active_request,'STARTUP_TARGET_NOT_READY');}
 async function io(run){await access();let timer,expired=false;const pending=Promise.resolve().then(run);void pending.then(o=>{if(expired&&o?.body)void o.body.cancel().catch(()=>{});},()=>{});
 try{return await Promise.race([pending,new Promise((_,reject)=>{timer=setTimeout(()=>{expired=true;reject(Error('STARTUP_PROVIDER_UNKNOWN'));},timeoutMs);})]);}finally{clearTimeout(timer);}}
 async function object(key,limit){const o=await io(()=>bucket.get(key));if(!o)return null;fail(o.body&&Number.isSafeInteger(o.size)&&o.size<=limit,'STARTUP_OBJECT_CONFLICT');const bytes=await startupBody(o.body,limit,{signal,timeoutMs});fail(bytes.length===o.size,'STARTUP_OBJECT_CONFLICT');return{bytes,sha256:hash(bytes),etag:o.etag,httpMetadata:o.httpMetadata,customMetadata:o.customMetadata};}
 const marker=name=>db.prepare('SELECT action,state FROM process_import_attempts WHERE id=?').bind(markerId(name)).first();
 async function claim(name){await access();const r=await db.prepare("INSERT INTO process_import_attempts(id,action,state,created_at) SELECT ?,?,'running',? WHERE EXISTS(SELECT 1 FROM process_snapshot_activations a JOIN process_snapshot_target t ON t.transfer_id=a.transfer_id JOIN process_snapshot_transfers s ON s.id=a.transfer_id JOIN process_import_budget b ON b.id=1 WHERE t.id=1 AND a.phase='active' AND a.transfer_id=? AND t.target=? AND s.manifest_sha=? AND b.state='complete' AND b.active_request IS NULL) ON CONFLICT(id) DO NOTHING").bind(markerId(name),action,Date.now(),plan.transferId,plan.target,plan.manifestSha).run();fail(r.success&&r.meta?.changes===1,'STARTUP_ALREADY_ATTEMPTED');}
 async function settle(name,state){const r=await db.prepare("UPDATE process_import_attempts SET state=? WHERE id=? AND action=? AND state='running'").bind(state==='complete'?'complete':'stopped',markerId(name),action).run();fail(r.success&&r.meta?.changes===1,'STARTUP_SETTLEMENT_UNKNOWN');}
 async function mutation(name,run){await claim(name);try{const result=await run();await settle(name,'complete');return result;}catch(error){try{await settle(name,'unknown');}catch{/* pending is also unresolved; never release or replay */}throw Error(/^STARTUP_[A-Z_]+$/.test(error?.message||'')?error.message:'STARTUP_PROVIDER_UNKNOWN');}}
 function indexPlan(current){let value;try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(current.bytes));}catch{throw Error('STARTUP_INDEX_CONFLICT');}validateAssetIndex(value);const paths=new Set(files.map(f=>f.path)),existing=value.assets.filter(a=>paths.has(a.path)),base={...value,assets:value.assets.filter(a=>!paths.has(a.path))};
 fail(base.assets.length===plan.indexCount&&hash(encode(base))===plan.indexSha,'STARTUP_INDEX_CONFLICT');
 const additions=files.map(({path,key,bytes,sha256,contentType,permissions})=>({path,key,bytes,sha256,contentType,permissions})),next={...base,assets:[...base.assets,...additions].sort((a,b)=>a.path.localeCompare(b.path,'en'))};validateAssetIndex(next);const nextBytes=encode(next),nextSha=hash(nextBytes);fail(nextBytes.length<=1048576,'STARTUP_INDEX_LIMIT');
 fail(current.sha256===plan.indexSha&&existing.length===0||current.sha256===nextSha&&existing.length===files.length,'STARTUP_INDEX_CONFLICT');return{base,nextBytes,nextSha,published:current.sha256===nextSha};}
 async function index(){const current=await object(indexKey,1048576);fail(current,'STARTUP_INDEX_MISSING');return{current,...indexPlan(current)};}
 async function matched(f){const o=await object(f.key,f.bytes);fail(o&&o.bytes.length===f.bytes&&o.sha256===f.sha256&&o.httpMetadata?.contentType===f.contentType&&o.customMetadata?.sha256===f.sha256,'STARTUP_OBJECT_CONFLICT');return o;}
 return{
  async status(){await access();const idx=await index(),statuses=[],visible=m=>!m?'not-started':m.state==='running'?'pending':m.state==='stopped'?'unknown':m.state;for(const f of files){const m=await marker(f.name);fail(!m||m.action===action,'STARTUP_MARKER_CONFLICT');statuses.push({name:f.name,bytes:f.bytes,sha256:f.sha256,state:visible(m)});}const m=await marker('index');fail(!m||m.action===action,'STARTUP_MARKER_CONFLICT');const published=idx.published&&m?.state==='complete';return{state:published?'complete':idx.published||statuses.some(f=>['pending','unknown'].includes(f.state))||m?'hold':'ready',files:statuses,indexState:visible(m),indexSha256:idx.current.sha256,automaticRetryAllowed:false};},
  async put(name,request){const f=files.find(f=>f.name===name);fail(f,'STARTUP_FILE_NOT_ALLOWED');await access();fail(!await marker(f.name),'STARTUP_ALREADY_ATTEMPTED');const idx=await index();fail(!idx.published,'STARTUP_ALREADY_PUBLISHED');const declared=request.headers.get('Content-Length');fail(declared===null||Number(declared)===f.bytes,'STARTUP_SOURCE_MISMATCH');fail(request.headers.get('Content-Type')?.split(';')[0]==='application/octet-stream','STARTUP_CONTENT_TYPE');const bytes=await startupBody(request.body,f.bytes,{signal,timeoutMs});fail(bytes.length===f.bytes&&hash(bytes)===f.sha256,'STARTUP_SOURCE_MISMATCH');
   return mutation(f.name,async()=>{const existing=await object(f.key,f.bytes);if(existing){await matched(f);}else{await io(()=>bucket.put(f.key,bytes,{httpMetadata:{contentType:f.contentType},customMetadata:{sha256:f.sha256},onlyIf:{etagDoesNotMatch:'*'}}));await matched(f);}return{name:f.name,state:'complete',bytes:f.bytes,sha256:f.sha256};});
  },
  async publish(){await access();fail(!await marker('index'),'STARTUP_ALREADY_ATTEMPTED');const idx=await index();fail(!idx.published,'STARTUP_ALREADY_PUBLISHED');for(const f of files){const m=await marker(f.name);fail(m?.action===action&&m.state==='complete','STARTUP_FILES_INCOMPLETE');await matched(f);}
   return mutation('index',async()=>{const fresh=await index();fail(!fresh.published&&fresh.current.etag===idx.current.etag,'STARTUP_INDEX_CONFLICT');const put=await io(()=>bucket.put(indexKey,idx.nextBytes,{httpMetadata:{contentType:'application/json'},customMetadata:{},onlyIf:{etagMatches:idx.current.etag}}));fail(put,'STARTUP_INDEX_CONFLICT');const proof=await index();fail(proof.published&&proof.current.sha256===idx.nextSha,'STARTUP_INDEX_READBACK');return{state:'complete',indexSha256:idx.nextSha,entries:plan.indexCount+files.length,originalEntriesPreserved:plan.indexCount};});
  },
 };
}
