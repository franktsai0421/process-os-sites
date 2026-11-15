/* Actual handlers; generated SQLite/Map R2 only. Never opens a server or logs credentials/bodies. */
const assert=require('node:assert/strict');
const {performance}=require('node:perf_hooks');
const {randomUUID}=require('node:crypto');
const {fixture}=require('./quality-replacement-preview-fixture.cjs');
async function run(){
 const delay=Number(process.env.IPQC_IO_DELAY_MS||10),rounds=Number(process.env.IPQC_SPEED_ROUNDS||3),samples=[];
 const master={active:{AB:{products:[{code:'A1',name:'Synthetic',line:'A',category:'G',stages:['A-CUT']}],lines:[{code:'A',stages:[{code:'A-CUT',name:'Cut'}]}],categoryGroups:[{line:'A',name:'G',defaultStages:['A-CUT']}]},C:{products:[{code:'C1',name:'Synthetic',stages:['C-CUT']}],lines:[{code:'C',stages:[{code:'C-CUT',name:'Cut'}]}]}}};
 for(let round=0;round<rounds;round++)for(const moduleName of ['ipqc-ab','ipqc-c']){
  const f=await fixture({ipqcCMasterControl:JSON.stringify({schemaVersion:1,activeVersionId:'synthetic-initial',source:null,issues:[],reservedErrorCodes:[],reservedItemCodes:[],versions:[{id:'synthetic-initial',number:1,status:'approved',snapshot:{errors:[],items:[]},baseVersionId:null,revision:1,creatorId:'synthetic',creatorName:'Synthetic',createdAt:'fixture',updatedAt:'fixture',history:[]}]}),masterDataControl:JSON.stringify(master),processCustomRoles:'[]',processRoleTemplateOverrides:'{}',processAccessControl:'{}',maintenanceMode:'0',...Object.fromEntries(Array.from({length:8},(_,i)=>['timingSentinel'+i,JSON.stringify({retained:i})]))},{includeIPQCC:true});
  let active=null;const pause=()=>delay?new Promise(resolve=>setTimeout(resolve,delay)):Promise.resolve();
  try{
   f.env.PROCESS_SESSION_REVOCATION_ENABLED='1';
   // Wrap exported production phases, preserving their result/error and call order.
   for(const name of ['readState','identity','can','encodeValues','stateRevisionIsCurrent','createIpqcABPermissionPhase','createIpqcCPermissionPhase','createIpqcReadPermissionPhase']){const original=f.core[name];if(!original)continue;f.core[name]=async(...args)=>{const start=performance.now();try{return await original(...args);}finally{if(active){const p=active.phases[name]||={calls:0,ms:0};p.calls++;p.ms+=performance.now()-start;}}};}
   const observe=(exports,name,label)=>{const original=exports[name];if(!original)return;exports[name]=function(...args){const at=performance.now(),done=()=>{if(active){const row=active.phases[label]||={calls:0,ms:0};row.calls++;row.ms+=performance.now()-at;}};try{const value=original.apply(this,args);if(value?.then)return value.finally(done);done();return value;}catch(error){done();throw error;}};};
   for(const [file,name,label]of [['lib/shared-draft.ts','applyDraftCommand','adapter-apply'],['lib/workflow-wire.ts','workflowCommandFingerprint','fingerprint'],['lib/workflow-wire.ts','compactWorkflowPayload','wire-projection'],['lib/versioned-shared-workflow.ts','projectSharedVersion','version-projection'],['lib/versioned-shared-workflow.ts','visibleSharedControl','public-projection'],['lib/ipqc-c-workflow.ts','publicIpqcWorkflow','public-projection']])observe(f.load(file),name,label);
   const prepare=f.env.DB.prepare.bind(f.env.DB);
   f.env.DB.prepare=sql=>{const s=prepare(sql);for(const method of ['first','all','run']){const original=s[method].bind(s);s[method]=async(...args)=>{if(active){active.sql++;if(/process_revoked_sessions/.test(sql))active.revocations++;if(/UPDATE shared_state/.test(sql))active.cas++;}await pause();return original(...args);};}return s;};
   let concurrent=0;
   for(const method of ['get','put','head']){const original=f.env.STATE_ARCHIVE[method].bind(f.env.STATE_ARCHIVE);f.env.STATE_ARCHIVE[method]=async(...args)=>{if(active)active[method]++;if(method==='get'){concurrent++;if(active)active.peakGets=Math.max(active.peakGets,concurrent);}try{await pause();return await original(...args);}finally{if(method==='get')concurrent--;}};}
   const routes=new Set();
   const rawCall=async(endpoint,method,body,who='editor',query='')=>{
    const route=f.load('app/api/'+endpoint+'/route.ts');routes.add(endpoint);
    const response=await route[method](new Request('http://fixture/api/'+endpoint+query,{method,headers:f.sessions[who],...(body?{body:JSON.stringify(body)}:{})}));
    const at=performance.now(),raw=await response.text();const result=f.load('lib/workflow-wire.ts').expandWorkflowPayload(JSON.parse(raw));if(active){active.requests++;active.wireBytes+=Buffer.byteLength(raw);active.decodeMs+=performance.now()-at;}
    assert.equal(response.status,200,endpoint+': '+result.error);return result;
   };
   f.load('app/api/'+moduleName+'/route.ts');f.load('app/api/'+moduleName+'/workflow/route.ts');
   const scope=moduleName==='ipqc-ab'?'&scope=A%3AG':'';
   await f.begin(moduleName,'editor',200,scope);
   await f.command(moduleName,'apply',{moduleAction:'create-error',input:moduleName==='ipqc-ab'?{stageCode:'A-CUT',name:'Synthetic'}:{productCode:'C1',stageCode:'C-CUT',name:'Synthetic'}},'editor',200,scope);
   const query='?caseMetadata=1&compact=1'+(moduleName==='ipqc-ab'?'&module=1':'');
   const read=()=>rawCall(moduleName+'/workflow','GET',undefined,'editor',query);
   const measure=async(action,fn)=>{active={moduleName,round,action,requests:0,wireBytes:0,decodeMs:0,sql:0,revocations:0,cas:0,get:0,put:0,head:0,peakGets:0,phases:{}};const at=performance.now();try{return await fn();}finally{active.ms=performance.now()-at;samples.push(active);active=null;}};
   let scopeSeq=0,lastCreatedError,lastCreatedItem;
   for(const action of ['create-error','create-item','apply','delete-item','delete-error']){
    const before=await f.read(moduleName,'editor',scope),flow=f.flow(before);
    const detail=action==='create-error'?{moduleAction:action,input:moduleName==='ipqc-ab'?{stageCode:'A-CUT',name:'Disposable'}:{productCode:'C1',stageCode:'C-CUT',name:'Disposable'}}:
      action==='create-item'?{moduleAction:action,input:{errorId:lastCreatedError,item:moduleName==='ipqc-ab'?{standard:'10 mm'}:{standard:'10 mm',description:'Synthetic',standardEnabled:true,cpkEnabled:false,rule:{cadence:'batch',batchKind:'fixed_count',fixedCount:'3'},mediaItems:[]}}}:
      action==='apply'?{patches:[{op:'set',path:['errors',{id:lastCreatedError},'name'],value:'Disposable edit'}],guards:[{path:['errors',{id:lastCreatedError},'name'],value:'Disposable'}]}:{moduleAction:action,input:{id:action==='delete-item'?lastCreatedItem:lastCreatedError,cascade:true}};
    const command={action:'apply',operationId:randomUUID(),clientId:'timing-scoped',sequence:++scopeSeq,generation:flow.generation,expectedRevision:flow.revision,...detail};
    const result=await measure(action,()=>rawCall(moduleName+'/workflow','POST',{command},'editor','?caseMetadata=1&compact=1'+scope));assert(result.receipt);
    const current=result.control.workflow.working;if(action==='create-error'){lastCreatedError=current.errors.find(row=>row.name==='Disposable').id;assert(lastCreatedError);}if(action==='create-item'){lastCreatedItem=current.items.find(row=>row.errorId===lastCreatedError).id;assert(lastCreatedItem);}if(action==='delete-item')assert(current.items.find(row=>row.id===lastCreatedItem).deleted);if(action==='delete-error')assert(current.errors.find(row=>row.id===lastCreatedError).deleted);
   }
   if(moduleName==='ipqc-ab')await f.begin(moduleName,'editor',200,'&module=1');
   await measure('page-read',()=>rawCall(moduleName,'GET',undefined,'editor','?caseMetadata=1'+(moduleName==='ipqc-ab'?'&equipment=deferred':'')));
   await measure('permissions',()=>rawCall(moduleName+'/workflow','GET',undefined,'editor','?permissions=1'+(moduleName==='ipqc-ab'?'&module=1':'')));
   await measure('workflow-read',read);
   let seq=0;
   for(const action of ['save','submit','withdraw','submit','approve']){
    const before=await read(),flow=f.flow(before);
    const command={action,operationId:randomUUID(),clientId:'timing-fixture',sequence:++seq,generation:flow.generation,expectedRevision:flow.revision,input:{stateRevision:before.revision},...(action==='submit'?{savedId:flow.saved.id}:{}),...(['withdraw','approve'].includes(action)?{caseId:flow.pendingId}:{}),reason:'Synthetic',confirmContentIssues:true};
    const result=await measure(action,()=>rawCall(moduleName+'/workflow','POST',{command},action==='approve'?'reviewer':'editor',query));assert(result.receipt);
    if(action==='submit')assert(result.control.workflow.pendingId);
    if(action==='withdraw')assert.equal(result.control.workflow.pendingId,null);
    if(action==='approve')assert.equal(result.control.activeVersionId,command.caseId);
   }
  }finally{f.close();}
 }
 const report={sourceCommit:require('node:child_process').execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),sourceHashes:Object.fromEntries(['lib/process-state.ts','lib/versioned-shared-workflow.ts','app/api/ipqc-ab/route.ts','app/api/ipqc-c/route.ts','app/api/ipqc-c/workflow/route.ts'].map(file=>[file,require('node:crypto').createHash('sha256').update(require('node:fs').readFileSync(file)).digest('hex')])),harnessHash:require('node:crypto').createHash('sha256').update(require('node:fs').readFileSync(__filename)).digest('hex'),kind:'isolated actual handlers; generated minimal AB/C + 8 unrelated aggregates',ioDelayMs:delay,rounds,limits:'Synthetic sensitivity experiment, not hosted latency. Request counts exclude setup and command prerequisite GETs (workflow-read reported separately). Phases overlap: can includes identity. I/O delay applies to every SQL and R2 operation. No UI/real data/network/cold start. No credentials, command bodies or account state are output.',samples};
 if(process.env.IPQC_SPEED_OUTPUT)require('node:fs').writeFileSync(process.env.IPQC_SPEED_OUTPUT,JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report));return report;
}
if(require.main===module)run().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={run};
