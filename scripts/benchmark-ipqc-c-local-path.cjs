/* Representative synthetic full C path. No live data or credentials. */
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {fixture}=require('./ipqc-c-operation-fixture.cjs');
const snapshot={errors:Array.from({length:869},(_,i)=>({id:'e'+i,code:'C100-C-CUT-L'+(i+1),productCode:'C100',stageCode:'C-CUT',name:'Synthetic error '+i,note:'',reason:'',deleted:false})),items:Array.from({length:866},(_,i)=>({id:'i'+i,code:'C100-C-CUT-L'+(i+1)+'-01',errorId:'e'+i,productCode:'C100',stageCode:'C-CUT',standard:'10 mm',standardEnabled:true,cpkEnabled:false,description:'Synthetic complete inspection '+i,note:'',reason:'',tool:'',method:'',frequency:'',rule:{cadence:'batch',batchKind:'fixed_count',fixedCount:'3'},notApplicable:false,deleted:false,mediaItems:[]}))};
const initial={schemaVersion:1,activeVersionId:'formal',source:null,issues:[],reservedErrorCodes:[],reservedItemCodes:[],versions:[{id:'formal',number:27,status:'approved',snapshot,baseVersionId:null,revision:1,creatorId:'synthetic',creatorName:'Synthetic',createdAt:'fixture',updatedAt:'fixture',history:[]}]};
(async()=>{const h=await fixture({ipqcCMasterControl:JSON.stringify(initial),masterDataControl:JSON.stringify({active:{C:{products:[{code:'C100',stages:['C-CUT']}],lines:[{code:'C',stages:[{code:'C-CUT',name:'Cut'}]}]}}})});try{
 await h.begin('ipqc-c');await h.command('ipqc-c','save');
 const base=h.snapshot(),objects=new Map(h.objects),samples=[];let counts,requests;
 for(const endpoint of ['ipqc-c','ipqc-c/workflow'])for(const method of ['GET','POST']){
  const route=h.load('app/api/'+endpoint+'/route.ts'),original=route[method];if(!original)continue;
  route[method]=async request=>{const url=new URL(request.url);if(endpoint.endsWith('workflow'))url.searchParams.set('compact','1');const headers=new Headers(request.headers);headers.set('X-IPQC-C-Save-Projection','1');const adapted=new Request(url,{method,headers,...(method==='POST'?{body:await request.text()}: {})});
   const start=performance.now(),response=await original(adapted),serverMs=performance.now()-start;
   const wire=await response.clone().text();if(requests)requests.push({method,endpoint,serverMs:+serverMs.toFixed(2),wireBytes:Buffer.byteLength(wire)});return response;};
 }
 for(const method of ['get','put','head']){const original=h.env.STATE_ARCHIVE[method].bind(h.env.STATE_ARCHIVE);h.env.STATE_ARCHIVE[method]=async(...args)=>{const start=performance.now();const result=await original(...args);if(counts){counts[method]++;counts.storageMs+=performance.now()-start;}return result;};}
 async function measure(round,phase,fn){counts={get:0,put:0,head:0,storageMs:0};requests=[];const start=performance.now();const result=await fn();const ms=performance.now()-start;const expandedBytes=Buffer.byteLength(JSON.stringify(result));samples.push({round,phase,ms:+ms.toFixed(2),...counts,expandedBytes,requests});counts=null;requests=null;return result;}
 for(let round=0;round<4;round++){
  h.db.prepare('UPDATE shared_state SET revision=?,"values"=?,updated_at=? WHERE id=1').run(base.row.revision,base.row.values,base.row.updated_at);h.objects.clear();for(const [k,v]of objects)h.objects.set(k,v);
  await measure(round,'open',()=>h.call('ipqc-c','GET',undefined,'editor',200,'?caseMetadata=1'));
  let current=h.flow(await h.read('ipqc-c'));const change={patches:[{op:'set',path:['items',{id:'i0'},'note'],value:'same synthetic edit'}],guards:[{path:['items',{id:'i0'},'note'],value:''}]};
  const command={action:'save',generation:current.generation,operationId:randomUUID(),clientId:'synthetic-benchmark',sequence:1,localChanges:[change]};
  const saved=await measure(round,'local-save',()=>h.call('ipqc-c/workflow','POST',{command},'editor',200,'?caseMetadata=1'));
  assert.equal(saved.control.workflow.saved.content.items[0].note,'same synthetic edit');
  await measure(round,'permission-read',()=>h.call('ipqc-c/workflow','GET',undefined,'editor',200,'?permissions=1'));
  await measure(round,'terminal-read',()=>h.read('ipqc-c'));
  await measure(round,'save-no-local',()=>h.command('ipqc-c','save'));
  current=h.flow(await h.read('ipqc-c'));
  let submitted=await measure(round,'submit',()=>h.command('ipqc-c','submit',{savedId:current.saved.id,reason:'synthetic'},'editor'));
  await measure(round,'review-read',()=>h.call('ipqc-c/workflow','GET',undefined,'reviewer',200,'?caseId='+submitted.receipt.caseId));
  await measure(round,'withdraw',()=>h.command('ipqc-c','withdraw',{caseId:submitted.receipt.caseId,reason:'synthetic'},'editor'));
  submitted=await measure(round,'resubmit',()=>h.command('ipqc-c','submit',{savedId:current.saved.id,reason:'synthetic'},'editor'));
  await measure(round,'receipt-read',()=>h.call('ipqc-c/workflow','GET',undefined,'editor',200,'?operationId='+submitted.receipt.operationId));
 }
 const summary=Object.fromEntries([...new Set(samples.map(s=>s.phase))].map(phase=>{const rows=samples.filter(s=>s.phase===phase&&s.round>0),times=rows.map(s=>s.ms).sort((a,b)=>a-b);return[phase,{medianMs:times[1],maxMs:times.at(-1),get:rows[0].get,put:rows[0].put,expandedBytes:rows[0].expandedBytes,wireBytes:rows[0].requests.reduce((sum,r)=>sum+r.wireBytes,0),requests:rows[0].requests.length}];}));
 const changed=JSON.parse(JSON.stringify(snapshot));changed.items[7].note='synthetic change';
 const ids=[...new Set([...snapshot.items,...changed.items].map(row=>row.id))],same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 const oldDiff=()=>ids.map(id=>({id,before:snapshot.items.find(row=>row.id===id),after:changed.items.find(row=>row.id===id)})).filter(row=>!same(row.before,row.after));
 const newDiff=()=>{const before=new Map(snapshot.items.map(row=>[row.id,row])),after=new Map(changed.items.map(row=>[row.id,row]));return ids.map(id=>({id,before:before.get(id),after:after.get(id)})).filter(row=>!same(row.before,row.after));};
 assert.deepEqual(oldDiff(),newDiff());const comparisonSamples={before:[],after:[]};for(let round=0;round<6;round++)for(const [name,fn]of [['before',oldDiff],['after',newDiff]]){const start=performance.now();for(let i=0;i<10;i++)fn();if(round)comparisonSamples[name].push((performance.now()-start)/10);}
 const comparison=Object.fromEntries(Object.entries(comparisonSamples).map(([name,times])=>[name,{medianMs:times.slice().sort((a,b)=>a-b)[2],samples:times}]));
 console.log(JSON.stringify({comparison,rows:1735,warmup:1,measuredRounds:3,summary,samples,limits:'Actual in-process API handlers and SQLite; storage is in-memory R2, no remote I/O latency. command helper includes prerequisite workflow GET for save-no-local/submit/withdraw/resubmit. Expanded JSON bytes are not wire bytes. No UI, image decoding, browser scheduling, network, hosted cold start or CUA time measured.'},null,2));
}finally{h.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
