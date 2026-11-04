// Synthetic in-memory D1/R2, n5 alternating pairs. No live data or latency SLO.
const assert=require('node:assert/strict'),{performance}=require('node:perf_hooks'),fixture=require('./fqc-apply-fixture.cjs');
const rows=[];
(async()=>{for(let pair=0;pair<5;pair++)for(const mode of pair%2?['single-save','apply-then-save']:['apply-then-save','single-save']){
 const f=await fixture();try{
  await f.mutate(v=>{const q=JSON.parse(v.qualityMasterControl),s=q.libraries.fqc.versions[0].snapshot;for(let n=1;n<256;n++)s.items.push({...structuredClone(s.items[0]),id:'item'+n,checkNo:'SYN-FQC-L1-'+(n+1)});v.qualityMasterControl=JSON.stringify(q);});
  const a=f.realm();await a.client.read();const start=await a.client.begin(),g=start.control.workflow.generation;
  const patches=[{op:'set',path:['items',{id:'item'},'name'],value:'Measured'}],guards=[{path:['items',{id:'item'},'name'],value:'Synthetic item'}];f.requests.length=0;f.events.length=0;
  const t=performance.now();if(mode==='single-save')await a.client.command(g,'save',{moduleAction:'save-local-v1',patches,guards,input:{matrixCells:[]}});else{await a.client.command(g,'apply',{patches,guards});await a.client.command(g,'save');}
  const ms=performance.now()-t,events=[...f.events],requests=[...f.requests];const state=await f.state();assert.equal(state.workflow.saved.content.items[0].name,'Measured');assert.deepEqual(state.workflow.saved.content,state.workflow.working);
  rows.push({pair,mode,ms,http:requests.length,post:requests.filter(r=>r.method==='POST').length,r2Get:events.filter(e=>e.kind==='get').length,r2Put:events.filter(e=>e.kind==='put').length,wireBytes:requests.reduce((n,r)=>n+Buffer.byteLength(r.body||'')+Buffer.byteLength(JSON.stringify(r.result)),0)});
 }finally{f.close();}
}const median=(a,key)=>a.map(r=>r[key]).sort((a,b)=>a-b)[2];console.log(JSON.stringify({environment:'isolated in-memory D1/R2; 256 synthetic items; no added latency',rows,summary:['apply-then-save','single-save'].map(mode=>{const selected=rows.filter(r=>r.mode===mode);return{mode,...Object.fromEntries(['ms','http','post','r2Get','r2Put','wireBytes'].map(k=>[k,median(selected,k)]))};})},null,2));})().catch(error=>{console.error(error);process.exitCode=1;});
