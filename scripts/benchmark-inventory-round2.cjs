/* Actual handlers; synthetic SQLite/Map R2 only. No external data or server. */
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),fs=require('node:fs'),{execFileSync}=require('node:child_process');
const copy=x=>JSON.parse(JSON.stringify(x));
const {createHash}=require('node:crypto');
async function run(){
 const rounds=Number(process.env.SPEED_ROUNDS||3),delay=Number(process.env.SPEED_IO_MS||10),samples=[];
 const sourceHashes=Object.fromEntries(['lib/process-state.ts','lib/state-records.ts','lib/tooling-workflow.ts','lib/equipment-workflow.ts','lib/versioned-shared-workflow.ts','app/api/tooling/iqc/route.ts','app/api/routine-equipment/route.ts','app/api/tooling/checks/route.ts',...(fs.existsSync('lib/inventory-read-ahead.mjs')?['lib/inventory-read-ahead.mjs']:[])].map(file=>[file,createHash('sha256').update(fs.readFileSync(file)).digest('hex')]));
 for(let round=0;round<rounds;round++){
 const f=await require('./fqc-apply-fixture.cjs')();let active=null;
 try{
 const tool=i=>({id:'tool-'+i,code:'DC01-'+String(i).padStart(4,'0'),nameVi:'Khuôn tổng hợp '+i,nameZh:'合成模具 '+i,categoryId:'cat',assetCode:'SYN-'+i,specification:'Synthetic standard',quantity:1,unit:'PCS',manufacturerId:'',location:{kind:'internal',holderId:'holder'},inboundDate:'2026-01-01',inboundDateLost:false,enabled:true,inactiveReason:'',archived:false,archiveReason:'',notes:'',frequencyMonths:12,photos:[],iqcIds:['part']});
 const ts={tools:Array.from({length:366},(_,i)=>tool(i)),categories:[{id:'cat',code:'DC01',nameVi:'Synthetic'}],custodians:[{id:'holder',nameVi:'Synthetic'}],suppliers:[],manufacturers:[],transfers:[]};
 const es={equipment:Array.from({length:119},(_,i)=>({id:'eq-'+i,assetCode:'SYN-'+i,pieceMark:'001',groupId:'group',categoryId:'cat',subcategoryId:'sub',name:'合成檢具 '+i,quantity:1,unit:'支',enabled:true,confirmed:true,calibrationMethod:'none',calibratedAt:'',expiresAt:'',notes:''})),groups:[{id:'group',name:'合成群組',categoryId:'cat',subcategoryId:'sub'}],categories:[{id:'cat',code:'C01',name:'合成類別'}],subcategories:[{id:'sub',categoryId:'cat',name:'合成子類別'}],issues:[]};
 const versions=(snapshot,equipment=false)=>Array.from({length:20},(_,i)=>({id:'v'+i,number:i+1,status:i===19?'approved':'superseded',snapshot:copy(snapshot),...(equipment?copy(snapshot):{}),revision:1,creatorId:'editor',creatorName:'Synthetic',createdAt:'synthetic',updatedAt:'synthetic',history:[{action:'approve',actorId:'other',actorName:'Synthetic',at:'synthetic'}]}));
 await f.mutate(values=>{
  const users=JSON.parse(values.platformUsers);for(const u of users)for(const m of ['tooling','equipment'])for(const op of ['view','edit','create','save','submit','withdraw','approve','return'])u.accessOverrides[m+'.'+op]=op==='view'||u.id===(['approve','return'].includes(op)?'other':'editor');values.platformUsers=JSON.stringify(users);
  values.toolingMasterControl=JSON.stringify({schemaVersion:1,activeVersionId:'v19',versions:versions(ts),reservedCodes:{categories:['DC01'],tools:ts.tools.map(t=>t.code)}});
  values.routineEquipmentControl=JSON.stringify({schemaVersion:1,activeVersionId:'v19',versions:versions(es,true),issues:[],reservedMarks:{}});
  values.iqcMasterControl=JSON.stringify({schemaVersion:1,activeVersionId:'iqc',versions:[{id:'iqc',number:1,status:'approved',snapshot:{parts:[{id:'part',code:'SYN-P',nameVi:'Synthetic',isEnabled:true,photos:[]}],categories:[],suppliers:[],items:[],errors:[]}}]});
  for(let i=0;i<8;i++)values['speedSentinel'+i]=JSON.stringify({retained:i,notes:'synthetic unrelated retained aggregate'});
 });
 const pause=()=>delay?new Promise(r=>setTimeout(r,delay)):Promise.resolve();
 for(const name of ['readState','identity','can','encodeValues']){const orig=f.core[name];f.core[name]=async(...args)=>{const start=performance.now();try{return await orig(...args);}finally{if(active){const p=active.phases[name]||={calls:0,ms:0};p.calls++;p.ms+=performance.now()-start;}}};}
 const prep=f.env.DB.prepare.bind(f.env.DB);f.env.DB.prepare=sql=>{const s=prep(sql);for(const m of ['first','all','run']){const orig=s[m].bind(s);s[m]=async(...a)=>{if(active){active.sql++;if(/UPDATE shared_state/.test(sql))active.cas++;}await pause();return orig(...a);};}return s;};
 let concurrent=0;for(const m of ['get','put','head']){const orig=f.env.STATE_ARCHIVE[m].bind(f.env.STATE_ARCHIVE);f.env.STATE_ARCHIVE[m]=async(...a)=>{if(active)active[m]++;if(m==='get'){concurrent++;if(active)active.peakGets=Math.max(active.peakGets,concurrent);}try{await pause();return await orig(...a);}finally{if(m==='get')concurrent--;}};}
 const call=async(moduleName,method,body,who='editor',suffix='/workflow?caseMetadata=1&compact=1')=>{const r=await f.load('app/api/'+moduleName+suffix.split('?')[0]+'/route.ts')[method](new Request('https://synthetic.invalid/api/'+moduleName+suffix,{method,headers:{cookie:f.cookies[who],origin:'https://synthetic.invalid','content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}));const at=performance.now(),raw=await r.text(),data=f.load('lib/workflow-wire.ts').expandWorkflowPayload(JSON.parse(raw));if(active){active.requests++;active.wireBytes+=Buffer.byteLength(raw);active.decodeMs+=performance.now()-at;}assert.equal(r.status,200,moduleName+' '+method+' '+JSON.stringify(data).slice(0,250));return data;};
 const measure=async(moduleName,step,fn)=>{active={round,module:moduleName,step,sql:0,cas:0,get:0,put:0,head:0,peakGets:0,requests:0,wireBytes:0,decodeMs:0,phases:{}};const at=performance.now();try{return await fn();}finally{active.ms=performance.now()-at;samples.push(active);active=null;}};
 for(const moduleName of ['tooling','routine-equipment']){
  const read=()=>call(moduleName,'GET',undefined,'editor',moduleName==='routine-equipment'?'?caseMetadata=1':'/workflow?caseMetadata=1&compact=1');
  await call(moduleName,'POST',{action:'begin'});let current=await measure(moduleName,'read',read);
  if(moduleName==='tooling')await measure(moduleName,'open-checks-ready',()=>call(moduleName,'GET',undefined,'editor','/checks'));
  let seq=0;
  const command=(action,detail={})=>({action,operationId:randomUUID(),clientId:'speed-fixture',sequence:++seq,generation:current.control.workflow.generation,expectedRevision:current.control.workflow.revision,input:{stateRevision:current.revision},reason:'Synthetic benchmark',confirmContentIssues:true,...detail});
  const path=moduleName==='tooling'?['tools',{id:'tool-0'},'notes']:['equipment',{id:'eq-0'},'notes'];
  const edits={patches:[{op:'set',path,value:'Synthetic measured edit'}],guards:[{path,value:''}]};
  const save=command('save',{moduleAction:'save-local-v1',...edits});current=await measure(moduleName,'save-write',()=>call(moduleName,'POST',{command:save}));assert(current.receipt);assert.equal(current.control.workflow.saved.content[path[0]][0].notes,'Synthetic measured edit');
  current=await measure(moduleName,'save-refresh',read);assert.equal(current.control.workflow.working[path[0]][0].notes,'Synthetic measured edit');
  if(moduleName==='tooling')await measure(moduleName,'save-checks-ready',()=>call(moduleName,'GET',undefined,'editor','/checks'));
  for(const [step,action,who]of [['submit-write','submit','editor'],['withdraw-write','withdraw','editor'],['resubmit-write','submit','editor'],['confirm-review-write','approve','other']]){
   const flow=current.control.workflow,cmd=command(action,action==='submit'?{savedId:flow.saved.id}:{caseId:flow.pendingId});current=await measure(moduleName,step,()=>call(moduleName,'POST',{command:cmd},who));assert(current.receipt);if(action==='submit')assert(current.control.workflow.pendingId);if(action==='withdraw')assert.equal(current.control.workflow.pendingId,null);if(action==='approve')assert.equal(current.control.activeVersionId,cmd.caseId);
   current=await measure(moduleName,step.replace('-write','-refresh'),read);
   if(moduleName==='tooling'&&step==='submit-write')await measure(moduleName,'submit-checks-ready',()=>call(moduleName,'GET',undefined,'editor','/checks'));
  }
  if(moduleName==='routine-equipment')await measure(moduleName,'workflow-read',()=>call(moduleName,'GET'));
  if(moduleName==='tooling')await measure(moduleName,'relation-load',()=>call(moduleName,'GET',undefined,'editor','/iqc'));
 }
 }finally{f.close();}
 }
 const median=a=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)];const summary=[];for(const moduleName of ['tooling','routine-equipment'])for(const step of new Set(samples.filter(s=>s.module===moduleName).map(s=>s.step))){const rows=samples.filter(s=>s.module===moduleName&&s.step===step);summary.push({module:moduleName,step,n:rows.length,medianMs:median(rows.map(s=>s.ms)),r2Gets:rows[0].get,peakGets:Math.max(...rows.map(s=>s.peakGets)),cas:rows[0].cas,wireBytes:rows[0].wireBytes,phases:rows[0].phases});}
 console.log(JSON.stringify({sourceCommit:process.env.SPEED_SOURCE_COMMIT||execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),protocol:'Actual shared client workflow compact=1 plus independent Tooling advisory checks; equipment page GET unchanged',sourceHashes,node:process.version,rounds,delayMs:delay,fixture:{tools:366,equipment:119,historicalVersionsPerModule:20,unrelatedAggregates:8,storage:'records-v1, isolated in-memory SQLite and Map R2',photos:0},summary,samples,limits:'Injected per-I/O latency is a controlled scheduling experiment, not actual network/Site timing. Setup and Begin excluded; each write and terminal read measured separately. All response bodies fully consumed. No Diem/live/hardware acceptance.'},null,2));
}
run().catch(e=>{console.error(e);process.exitCode=1;});
