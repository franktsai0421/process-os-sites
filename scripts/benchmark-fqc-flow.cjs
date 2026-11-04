/* Exact-main paired synthetic route/client benchmark; no live data or network. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createHash}=require('node:crypto'),{performance}=require('node:perf_hooks');
const fixture=require('./fqc-apply-fixture.cjs'),base='35949445ad073812863c0004acbee13ed3535747';
console.info=(...values)=>process.stderr.write(values.join(' ')+'\n');
const wait=ms=>ms?new Promise(resolve=>setTimeout(resolve,ms)):Promise.resolve();
const files=['lib/state-records.ts','lib/versioned-shared-workflow.ts','public/process/shared-draft-client.js','scripts/fqc-apply-fixture.cjs','scripts/benchmark-fqc-flow.cjs'];
const hashes=()=>Object.fromEntries(files.map(file=>[file,createHash('sha256').update(fs.readFileSync(path.join(__dirname,'..',file))).digest('hex')]));
const sourceHashes=hashes(),rows=[];
const count=(events,kind)=>events.filter(e=>e.kind===kind).length;
(async()=>{
 for(const profile of [{name:'no-added-wait',sql:0,get:0,put:0},{name:'controlled-storage-wait-not-live',sql:5,get:30,put:5}]){
  for(let pair=0;pair<5;pair++)for(const variant of pair%2?['candidate','main359']:['main359','candidate']){
   const f=await fixture(variant==='main359'?{sourceRef:base}:{});
   try{
    const values={...f.values},q=JSON.parse(values.qualityMasterControl),snapshot=q.libraries.fqc.versions[0].snapshot;
    snapshot.items=Array.from({length:256},(_,i)=>({...snapshot.items[0],id:i?'item'+i:'item',checkNo:'SYN-FQC-L1-'+String(i+1).padStart(3,'0'),description:'Synthetic '+i+' '+('z'.repeat(512)),productCodes:[],mediaItems:[]}));
    values.qualityMasterControl=JSON.stringify(q);
    values.processAccessControl=JSON.stringify({schemaVersion:2,audit:[{id:'synthetic-audit',before:{enabled:true,accessOverrides:{'fqc.edit':true}},after:{enabled:true}}]});
    for(let i=0;i<6;i++)values['syntheticUnrelated'+i]=JSON.stringify({note:'Synthetic unrelated '+i+' '+('m'.repeat(16384)),versions:[{id:'old'+i,status:'approved',snapshot:{note:'Retained body '+i+' '+('b'.repeat(32768))}}]});
    f.db.prepare('UPDATE shared_state SET "values"=? WHERE id=1').run(await f.encode(values));
    const a=f.realm(),begun=await a.client.begin();await a.client.read();let metrics=null,activeGets=0;
    const originalGet=f.env.STATE_ARCHIVE.get.bind(f.env.STATE_ARCHIVE);
    f.env.STATE_ARCHIVE.get=async key=>{
     if(metrics)metrics.peakGets=Math.max(metrics.peakGets,++activeGets);
     let object;try{object=await originalGet(key);}finally{if(metrics)activeGets--;}
     if(!object)return object;return{...object,text:async()=>{const raw=await object.text();if(metrics){metrics.bodyReads++;metrics.bodyBytes+=Buffer.byteLength(raw);}return raw;}};
    };
    f.hooks.sql=()=>wait(profile.sql);f.hooks.run=()=>wait(profile.sql);f.hooks.get=()=>wait(profile.get);f.hooks.put=()=>wait(profile.put);
    a.intercept(async(url,options,send)=>{
     const start=performance.now(),offset=f.events.length,response=await send();
     if(metrics){const request=f.requests.at(-1),events=f.events.slice(offset);metrics.http.push({method:options.method,status:response.status,ms:performance.now()-start,sql:count(events,'read')+count(events,'sql'),r2Get:count(events,'get'),r2Put:count(events,'put'),responseBytes:Buffer.byteLength(JSON.stringify(request.result))});}
     return response;
    });
    let receiptId;
    for(const action of ['full-read','existing-apply','insert-apply','matrix-apply','save','receipt','saved-read']){
     metrics={profile:profile.name,pair,variant,action,peakGets:0,bodyReads:0,bodyBytes:0,http:[]};f.events.length=0;
     const start=performance.now(),cpu=process.cpuUsage();let result;
     if(action==='full-read'||action==='saved-read')result=await a.client.read();
     if(action==='existing-apply')result=await a.client.command(begun.control.workflow.generation,'apply',{patches:[{op:'set',path:['errors',{id:'error'},'name'],value:'Measured'}],guards:[{path:['errors',{id:'error'},'name'],value:'Synthetic error'}]});
     if(action==='insert-apply')result=await a.client.command(begun.control.workflow.generation,'apply',{patches:[{op:'insert',path:['errors'],value:{id:'new-error',name:'New','category':'SYN',line:'A',isDeleted:false}}]});
     if(action==='matrix-apply')result=await a.client.command(begun.control.workflow.generation,'apply',{moduleAction:'replace-matrix-v1',input:{products:[{code:'SYN-P',category:'SYN'}],items:snapshot.items.map(item=>({id:item.id,category:item.category,productCodes:['SYN-P']}))}});
     if(action==='save')result=await a.client.command(begun.control.workflow.generation,'save');
     if(action==='receipt')result=await a.client.receipt(receiptId);
     metrics.ms=performance.now()-start;const usage=process.cpuUsage(cpu);metrics.cpuMs=(usage.user+usage.system)/1000;
     metrics.sql=count(f.events,'read')+count(f.events,'sql');metrics.revocation=f.events.filter(e=>e.sql?.includes('process_revoked_sessions')).length;
     metrics.r2Get=count(f.events,'get');metrics.r2Put=count(f.events,'put');metrics.responseBytes=metrics.http.reduce((sum,e)=>sum+e.responseBytes,0);
     assert.equal(metrics.http.length,action.endsWith('apply')||action==='save'?2:1);assert(metrics.http.every(e=>e.status===200));assert.equal(a.client.hasUnknown(),false);
     if(result.receipt)receiptId=result.receipt.operationId;
     if(result.control){const flow=result.control.workflow;assert.equal(flow.working.items.length,256);if(action!=='full-read')assert.equal(flow.working.errors[0].name,'Measured');if(['matrix-apply','save','saved-read'].includes(action))assert(flow.working.items.every(item=>item.productCodes[0]==='SYN-P'));if(['save','saved-read'].includes(action))assert.deepEqual(flow.saved.content,flow.working);else assert.equal(flow.saved,null);}
     rows.push(metrics);metrics=null;
    }
   }finally{f.close();}
   process.stderr.write(JSON.stringify({profile:profile.name,pair,variant})+'\n');
  }
 }
 const summary=[];
 for(const profile of new Set(rows.map(r=>r.profile)))for(const action of new Set(rows.map(r=>r.action)))for(const variant of ['main359','candidate']){
  const selected=rows.filter(r=>r.profile===profile&&r.action===action&&r.variant===variant),stats={profile,action,variant,n:selected.length};assert.equal(selected.length,5);
  for(const key of ['ms','cpuMs','sql','revocation','r2Get','r2Put','peakGets','bodyReads','bodyBytes','responseBytes']){const sorted=selected.map(r=>r[key]).sort((a,b)=>a-b);stats[key]={min:sorted[0],median:sorted[2],max:sorted.at(-1)};}summary.push(stats);
 }
 // Same fault/validation closure: successful paired samples still fetch every
 // object, consume every byte and issue all SQL checks. Only I/O overlap changes.
 for(const row of rows.filter(r=>r.variant==='candidate')){
  const before=rows.find(r=>r.variant==='main359'&&r.pair===row.pair&&r.profile===row.profile&&r.action===row.action);
  for(const key of ['sql','revocation','r2Get','r2Put','bodyReads','bodyBytes','responseBytes'])assert.equal(row[key],before[key],row.action+' '+key);
 }
 assert.deepEqual(hashes(),sourceHashes,'benchmark source changed');
 console.log(JSON.stringify({schema:'FQC_FLOW_PAIRED_V1',base,syntheticOnly:true,liveLatency:false,runtimeHashes:sourceHashes,fixture:{items:256,itemPadding:512,authorityAuditBodies:1,unrelatedAggregates:6,unrelatedAggregatePadding:16384,unrelatedBodyPadding:32768},note:'Exact main359 server overrides; same current client and fixtures. Alternating paired n5. Includes response-clone evidence overhead; excludes fixture setup. Every successful sample retained, failure aborts. Controlled waits are artificial, not a live speed prediction.',rows,summary},null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
