const assert=require('node:assert/strict'),fs=require('node:fs'),{performance}=require('node:perf_hooks');
const fixture=require('./fqc-apply-fixture.cjs');
const wait=ms=>ms?new Promise(resolve=>setTimeout(resolve,ms)):Promise.resolve();
const edit=(name,value,before)=>({patches:[{op:'set',path:['errors',{id:'error'},name],value}],guards:[{path:['errors',{id:'error'},name],value:before}]});
const sourceHashes=()=>Object.fromEntries(['lib/process-state.ts','lib/versioned-shared-workflow.ts','public/process/shared-draft-client.js','scripts/fqc-apply-fixture.cjs'].map(file=>[file,require('node:crypto').createHash('sha256').update(fs.readFileSync(require('node:path').join(__dirname,'..',file))).digest('hex')]));
const beforeHashes=sourceHashes(),rows=[];
// Paired n5 synthetic diagnostic; no live endpoints or timing pass threshold.
// 256 items and fixed storage waits expose SQL/wire costs without claiming SLOs.
(async()=>{for(const profile of [{name:'no-added-wait',sql:0,get:0,put:0},{name:'controlled-storage-wait-not-live',sql:5,get:15,put:5}])for(let pair=0;pair<5;pair++)for(const variant of pair%2?['candidate-ack','current-server-legacy-full','main268a-server']:['main268a-server','current-server-legacy-full','candidate-ack']){
 const baseline=variant==='main268a-server',f=await fixture({baseline});try{
  const values={...f.values},q=JSON.parse(values.qualityMasterControl),s=q.libraries.fqc.versions[0].snapshot,first=s.items[0];
  s.items=Array.from({length:256},(_,i)=>({...first,id:i?'item'+i:'item',checkNo:'SYN-FQC-L1-'+String(i+1).padStart(3,'0'),description:'Synthetic detail '+i+' '+('z'.repeat(512)),productCodes:[],mediaItems:[]}));
  values.qualityMasterControl=JSON.stringify(q);f.db.prepare('UPDATE shared_state SET "values"=? WHERE id=1').run(await f.encode(values));
  const a=f.realm();const begun=await a.client.begin();await a.client.read();let metrics=null;
  const originalGet=f.env.STATE_ARCHIVE.get.bind(f.env.STATE_ARCHIVE);f.env.STATE_ARCHIVE.get=async key=>{const object=await originalGet(key);if(!object)return object;return {...object,text:async()=>{const raw=await object.text();if(metrics){metrics.r2BodyReads++;metrics.r2BodyBytes+=Buffer.byteLength(raw);}return raw;}};};
  f.hooks.sql=async()=>{await wait(profile.sql);};f.hooks.run=async()=>{await wait(profile.sql);};f.hooks.get=async()=>{await wait(profile.get);};f.hooks.put=async()=>{await wait(profile.put);};
  a.intercept(async(url,options,send)=>{const start=performance.now(),ei=f.events.length;const result=variant==='current-server-legacy-full'?await f.call(String(url).replace('&projection=fqc-apply-ack-v1',''),options):await send();if(metrics){const entry=f.requests.at(-1);metrics.http.push({method:options.method,url:entry.url,status:result.status,ms:performance.now()-start,requestBytes:Buffer.byteLength(options.body||''),responseBytes:Buffer.byteLength(JSON.stringify(entry.result)),wireVersion:entry.result.wireVersion||null,hasControl:!!entry.result.control,liveContentKeys:Object.keys(entry.result.liveContent||{}),sql:f.events.slice(ei).filter(e=>e.kind==='read'||e.kind==='sql').length,r2Get:f.events.slice(ei).filter(e=>e.kind==='get').length});}return result;});
  let receiptId;
  for(const action of ['existing-apply','insert-apply','save','receipt','terminal-read']){
   metrics={profile:profile.name,pair,variant,action,r2BodyReads:0,r2BodyBytes:0,http:[]};f.events.length=0;const start=performance.now(),cpu=process.cpuUsage();
   let result;
   if(action==='existing-apply')result=await a.client.command(begun.control.workflow.generation,'apply',edit('name','Measured','Synthetic error'));
   if(action==='insert-apply')result=await a.client.command(begun.control.workflow.generation,'apply',{patches:[{op:'insert',path:['errors'],value:{id:'new',name:'New',category:'SYN',line:'A'}}]});
   if(action==='save')result=await a.client.command(begun.control.workflow.generation,'save');
   if(action==='receipt')result=await a.client.receipt(receiptId);
   if(action==='terminal-read')result=await a.client.read();
   if(result.receipt)receiptId=result.receipt.operationId;
   if(result.control){assert.equal(result.control.workflow.working.errors[0].name,'Measured');assert.equal(result.control.workflow.working.items.length,256);if(action==='save')assert.deepEqual(result.control.workflow.saved.content,result.control.workflow.working);}
   metrics.ms=performance.now()-start;const used=process.cpuUsage(cpu);metrics.cpuMs=(used.user+used.system)/1000;
   metrics.sql=f.events.filter(e=>e.kind==='read'||e.kind==='sql').length;metrics.revocation=f.events.filter(e=>e.kind==='read'&&e.sql.includes('process_revoked_sessions')).length;metrics.r2Get=f.events.filter(e=>e.kind==='get').length;metrics.r2Put=f.events.filter(e=>e.kind==='put').length;metrics.requestBytes=metrics.http.reduce((s,r)=>s+r.requestBytes,0);metrics.responseBytes=metrics.http.reduce((s,r)=>s+r.responseBytes,0);
   assert.equal(a.client.hasUnknown(),false);assert(metrics.http.every(r=>r.status===200));rows.push(metrics);metrics=null;
  }
 }finally{f.close();}
 process.stderr.write(JSON.stringify({progress:true,profile:profile.name,pair,variant})+'\n');
}
const summary=[];for(const profile of new Set(rows.map(r=>r.profile)))for(const action of new Set(rows.map(r=>r.action)))for(const variant of new Set(rows.map(r=>r.variant))){const selected=rows.filter(r=>r.profile===profile&&r.action===action&&r.variant===variant);const stats={profile,action,variant,n:selected.length};for(const key of ['ms','cpuMs','sql','revocation','r2Get','r2Put','r2BodyReads','r2BodyBytes','requestBytes','responseBytes']){const sorted=selected.map(r=>r[key]).sort((a,b)=>a-b);stats[key]={min:sorted[0],median:sorted[2],max:sorted[4]};}summary.push(stats);}
assert.deepEqual(sourceHashes(),beforeHashes,'benchmark source changed during paired window');
const output={schema:'FQC_PAIRED_APPLY_DIAGNOSTIC_V1',syntheticOnly:true,liveLatency:false,runtimeHashes:beforeHashes,base:'268a8e49ec751bb6849033e20a27d30194aad67c',fixture:{errors:1,items:256,itemDescriptionPadding:512},note:'All variants use the same current transport; main server overrides exact process-state/versioned main bytes, current-server-legacy-full strips only the opt-in on the same candidate server. 45s is not the measured optimization. Controlled waits are explicitly not deployed timings. Failed samples abort rather than silently disappear. Raw successful samples retained.',rows,summary};console.log(JSON.stringify(output,null,2));})().catch(error=>{console.error(error);process.exitCode=1;});
