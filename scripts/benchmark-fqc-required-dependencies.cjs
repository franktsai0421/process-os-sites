/* Paired, isolated metadata-heavy records; never a deployed timing estimate. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{performance}=require('node:perf_hooks'),{createHash}=require('node:crypto');
// Keep source diagnostics out of the machine-readable stdout artifact.
console.info=(...values)=>process.stderr.write(values.join(' ')+'\n');
const fixture=require('./fqc-apply-fixture.cjs'),base='848be13da54c7ae747bcdd96df19e01129fe980a';
const hashes=()=>Object.fromEntries(['lib/fqc-required-dependencies.ts','lib/state-records.ts','lib/versioned-shared-workflow.ts','lib/fqc-workflow.ts','public/process/shared-draft-client.js','scripts/fqc-apply-fixture.cjs','scripts/benchmark-fqc-required-dependencies.cjs'].map(file=>[file,createHash('sha256').update(fs.readFileSync(path.join(__dirname,'..',file))).digest('hex')]));
const initialHashes=hashes(),rows=[],wait=ms=>ms?new Promise(resolve=>setTimeout(resolve,ms)):Promise.resolve();
const edit=(collection,id,field,value,before)=>({patches:[{op:'set',path:[collection,{id},field],value}],guards:[{path:[collection,{id},field],value:before}]});
const ordered=(events,kind)=>events.filter(event=>event.kind===kind).length;
(async()=>{
 for(const profile of [{name:'no-added-wait',sql:0,get:0,put:0},{name:'controlled-storage-wait-not-live',sql:5,get:15,put:5}])for(let pair=0;pair<5;pair++)for(const variant of pair%2?['candidate','main848']:['main848','candidate']){
  const f=await fixture(variant==='main848'?{sourceRef:base}:{});try{
   const values={...f.values},quality=JSON.parse(values.qualityMasterControl),snapshot=quality.libraries.fqc.versions[0].snapshot;
   snapshot.items=Array.from({length:256},(_,i)=>({...snapshot.items[0],id:i?'item'+i:'item',checkNo:'SYN-FQC-L1-'+String(i+1).padStart(3,'0'),description:'Synthetic '+i+' '+('z'.repeat(512)),productCodes:[],mediaItems:[]}));
   values.qualityMasterControl=JSON.stringify(quality);
   for(let i=0;i<24;i++)values['syntheticUnrelated'+i]=JSON.stringify({note:'Unrelated aggregate '+i+' '+('m'.repeat(16384)),versions:[{id:'version'+i,status:'draft',snapshot:{note:'Unrelated body '+i+' '+('b'.repeat(32768))}}]});
   f.db.prepare('UPDATE shared_state SET "values"=? WHERE id=1').run(await f.encode(values));
   const a=f.realm(),begun=await a.client.begin();await a.client.read();let metrics=null;
   const get=f.env.STATE_ARCHIVE.get.bind(f.env.STATE_ARCHIVE);f.env.STATE_ARCHIVE.get=async key=>{const object=await get(key);if(!object)return object;return{...object,text:async()=>{const raw=await object.text();if(metrics){metrics.bodyReads++;metrics.bodyBytes+=Buffer.byteLength(raw);}return raw;}};};
   f.hooks.sql=()=>wait(profile.sql);f.hooks.run=()=>wait(profile.sql);f.hooks.get=()=>wait(profile.get);f.hooks.put=()=>wait(profile.put);
   a.intercept(async(url,options,send)=>{const start=performance.now(),offset=f.events.length,result=await send();if(metrics){const event=f.requests.at(-1),events=f.events.slice(offset);metrics.http.push({method:options.method,status:result.status,path:event.url.split('?')[0],ms:performance.now()-start,r2Get:ordered(events,'get'),sql:ordered(events,'read')+ordered(events,'sql'),requestBytes:Buffer.byteLength(options.body||''),responseBytes:Buffer.byteLength(JSON.stringify(event.result))});}return result;});
   for(const action of ['existing-apply','insert-apply','soft-delete','save']){
    metrics={profile:profile.name,pair,variant,action,bodyReads:0,bodyBytes:0,http:[]};f.events.length=0;
    const start=performance.now(),cpu=process.cpuUsage();let result;
    if(action==='existing-apply')result=await a.client.command(begun.control.workflow.generation,'apply',edit('errors','error','name','Measured','Synthetic error'));
    if(action==='insert-apply')result=await a.client.command(begun.control.workflow.generation,'apply',{patches:[{op:'insert',path:['errors'],value:{id:'new-error',name:'New','category':'SYN',line:'A',isDeleted:false}}]});
    if(action==='soft-delete')result=await a.client.command(begun.control.workflow.generation,'apply',edit('errors','new-error','isDeleted',true,false));
    if(action==='save')result=await a.client.command(begun.control.workflow.generation,'save');
    metrics.ms=performance.now()-start;const usage=process.cpuUsage(cpu);metrics.cpuMs=(usage.user+usage.system)/1000;
    metrics.sql=ordered(f.events,'read')+ordered(f.events,'sql');metrics.revocation=f.events.filter(event=>event.sql?.includes('process_revoked_sessions')).length;metrics.r2Get=ordered(f.events,'get');metrics.r2Put=ordered(f.events,'put');metrics.responseBytes=metrics.http.reduce((sum,event)=>sum+event.responseBytes,0);
    assert.equal(metrics.http.length,2);assert(metrics.http.every(event=>event.status===200));assert.equal(a.client.hasUnknown(),false);assert.equal(result.control.workflow.working.errors[0].name,'Measured');if(action==='save')assert.deepEqual(result.control.workflow.saved.content,result.control.workflow.working);else assert.equal(result.control.workflow.saved,null);
    rows.push(metrics);metrics=null;
   }
  }finally{f.close();}
  process.stderr.write(JSON.stringify({profile:profile.name,pair,variant})+'\n');
 }
 const summary=[];
 for(const profile of new Set(rows.map(row=>row.profile)))for(const action of new Set(rows.map(row=>row.action)))for(const variant of ['main848','candidate']){
  const selected=rows.filter(row=>row.profile===profile&&row.action===action&&row.variant===variant),stats={profile,action,variant,n:selected.length};assert.equal(selected.length,5);
  for(const key of ['ms','cpuMs','sql','revocation','r2Get','r2Put','bodyReads','bodyBytes','responseBytes']){const values=selected.map(row=>row[key]).sort((a,b)=>a-b);stats[key]={min:values[0],median:values[2],max:values.at(-1)};}summary.push(stats);
 }
 assert.deepEqual(hashes(),initialHashes,'paired source changed');
 console.log(JSON.stringify({schema:'FQC_REQUIRED_DEPENDENCIES_PAIRED_V1',base,syntheticOnly:true,liveLatency:false,fixture:{requiredAggregateCount:8,unrelatedAggregateCount:24,unrelatedAggregatePadding:16384,unrelatedBodyPadding:32768,items:256},runtimeHashes:initialHashes,note:'Same current transport and immutable fixtures. Main848 server sources are pinned. Response-clone evidence overhead is included. Artificial storage waits are labelled, no failed sample is discarded, terminal GET remains unchanged. No employee metadata/data or real deployment timing is used.',rows,summary},null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
