/* Opt-in controlled handler latency experiment; no server, network or real data.
 * Called by the normal-auth create fixture with --benchmark=100 or =1000. */
const assert=require('node:assert/strict');
module.exports=async function benchmark({h,adapter,reset,send,readback,items}){
 const originalRead=adapter.readIpqcCCreateMutationState,get=h.env.STATE_ARCHIVE.get,put=h.env.STATE_ARCHIVE.put,head=h.env.STATE_ARCHIVE.head,prepare=h.env.DB.prepare;
 const samples=[];let phase='',metrics={};
 const pause=ms=>ms?new Promise(resolve=>setTimeout(resolve,ms)):Promise.resolve();
 for(const storageMs of [0,10]){
  const count=(kind)=>{metrics[phase]||={get:0,put:0,head:0,sql:0};metrics[phase][kind]++;};
  h.env.STATE_ARCHIVE.get=async(...args)=>{count('get');await pause(storageMs);return get(...args);};
  h.env.STATE_ARCHIVE.put=async(...args)=>{count('put');await pause(storageMs);return put(...args);};
  h.env.STATE_ARCHIVE.head=async(...args)=>{count('head');await pause(storageMs);return head(...args);};
  h.env.DB.prepare=sql=>{const statement=prepare(sql);for(const method of ['first','all','run'])if(statement[method]){const original=statement[method].bind(statement);statement[method]=async()=>{count('sql');await pause(storageMs?1:0);return original();};}return statement;};
  try{
   // Alternate order to reduce systematic warmup/order bias. Warmup is excluded.
   for(let round=-1;round<5;round++)for(const mode of round%2===0?['full','post-only','final']:['final','post-only','full']){
    reset();adapter.readIpqcCCreateMutationState=mode==='full'?async()=>null:originalRead;metrics={};phase='post';
    const start=performance.now(),post=await send(),posted=performance.now();phase='readback';const read=await readback(mode==='final'),ended=performance.now();
    assert.deepEqual(JSON.parse(JSON.stringify(read.workflow.working)),JSON.parse(JSON.stringify(post.control.workflow.working)));assert.equal(read.workflow.revision,post.receipt.revision);assert.equal(read.permissions.view,true);
    if(round>=0)samples.push({storageMs,round,mode,postMs:posted-start,readbackMs:ended-posted,totalMs:ended-start,metrics});
   }
  }finally{adapter.readIpqcCCreateMutationState=originalRead;h.env.STATE_ARCHIVE.get=get;h.env.STATE_ARCHIVE.put=put;h.env.STATE_ARCHIVE.head=head;h.env.DB.prepare=prepare;}
 }
 const summary=[];for(const storageMs of [0,10])for(const mode of ['full','post-only','final']){const rows=samples.filter(r=>r.storageMs===storageMs&&r.mode===mode),stats=field=>{const v=rows.map(r=>r[field]).sort((a,b)=>a-b);return{medianMs:Math.round(v[2]*100)/100,minMs:Math.round(v[0]*100)/100,maxMs:Math.round(v[4]*100)/100};};summary.push({storageMs,mode,post:stats('postMs'),readback:stats('readbackMs'),total:stats('totalMs'),metrics:rows[0].metrics});}
 console.log(JSON.stringify({status:'PASS_CREATE_LATENCY_COMPARISON',items,unrelatedAggregates:24,sessionRevocationEnabled:true,newUploadedPhotoHead:true,rounds:5,summary,samples,limits:'Actual handlers with synthetic fixtures. full disables create selection; post-only is first PR behavior; final also selects fresh readback. storageMs is artificial R2 latency, SQL delay is 1ms only in that profile. No network/browser/live latency or percentile claim.'},null,2));
};
