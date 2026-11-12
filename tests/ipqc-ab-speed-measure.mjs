// Synthetic actual-handler measurement. Fixed I/O delays are a sensitivity
// experiment, never a hosted timing or an estimate of the automation bridge.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {performance} from 'node:perf_hooks';
const {fixture}=createRequire(import.meta.url)('../scripts/quality-replacement-preview-fixture.cjs');
const master={active:{AB:{products:[{code:'A1',name:'Synthetic',line:'A',category:'G',stages:['A-CUT']}],lines:[{code:'A',stages:[{code:'A-CUT',name:'Cut'}]}],categoryGroups:[{line:'A',name:'G',defaultStages:['A-CUT']}]}}};
const samples=[];
for(let round=0;round<Number(process.env.IPQC_SPEED_ROUNDS||3);round++){
 const f=await fixture({masterDataControl:JSON.stringify(master),processCustomRoles:'[]',processRoleTemplateOverrides:'{}',processAccessControl:'{}',maintenanceMode:'0',...Object.fromEntries(Array.from({length:8},(_,i)=>['speedSentinel'+i,JSON.stringify({retained:i})]))});
 try{
  f.env.PROCESS_SESSION_REVOCATION_ENABLED='1';
  await f.begin('ipqc-ab','editor',200,'&scope=A%3AG');
  await f.command('ipqc-ab','apply',{moduleAction:'create-error',input:{stageCode:'A-CUT',name:'Synthetic'}},'editor',200,'&scope=A%3AG');
  await f.begin('ipqc-ab','editor',200,'&module=1');
  const pause=()=>new Promise(r=>setTimeout(r,Number(process.env.IPQC_IO_DELAY_MS||10)));
  let stats;
  const prepare=f.env.DB.prepare.bind(f.env.DB),get=f.env.STATE_ARCHIVE.get.bind(f.env.STATE_ARCHIVE);
  f.env.DB.prepare=sql=>{const s=prepare(sql);for(const method of ['first','all','run']){const original=s[method].bind(s);s[method]=async(...args)=>{stats.sql++;if(/process_revoked_sessions/.test(sql))stats.revocation++;await pause();return original(...args);};}return s;};
  let open=0;
  f.env.STATE_ARCHIVE.get=async key=>{stats.get++;stats.peak=Math.max(stats.peak,++open);try{await pause();return await get(key);}finally{open--;}};
  const measure=async(name,fn)=>{stats={sql:0,revocation:0,get:0,peak:0};const at=performance.now(),value=await fn();samples.push({round,name,ms:performance.now()-at,...stats});return value;};
  await measure('page-read',()=>f.call('ipqc-ab','GET',undefined,'editor',200,'?caseMetadata=1&equipment=deferred'));
  await measure('permissions',()=>f.read('ipqc-ab','editor','&scope=A%3AG&permissions=1'));
  await measure('module-read',()=>f.read('ipqc-ab','editor','&module=1'));
  // Every command retains its real fresh pre-read; measured POST separated.
  let sequence=0;
  for(const action of ['save','submit','withdraw']){
   const read=await f.read('ipqc-ab','editor','&module=1'),flow=read.control.workflow;
   const command={action,operationId:crypto.randomUUID(),clientId:'speed-synthetic',sequence:++sequence,generation:flow.generation,expectedRevision:flow.revision,input:{stateRevision:read.revision},...(action==='submit'?{savedId:flow.saved.id}:{}),...(action==='withdraw'?{caseId:flow.pendingId}:{}),reason:'Synthetic timing'};
   const value=await measure(action,()=>f.call('ipqc-ab/workflow','POST',{command},'editor',200,'?module=1&caseMetadata=1'));
   assert(value.receipt);if(action==='submit')assert(value.control.workflow.pendingId);if(action==='withdraw')assert.equal(value.control.workflow.pendingId,null);
  }
 }finally{f.close();}
}
const report={kind:'synthetic actual handlers, in-memory SQLite/R2',ioDelayMs:Number(process.env.IPQC_IO_DELAY_MS||10),source:process.env.REPLACEMENT_PREVIEW_SOURCE_ROOT||process.cwd(),samples};
if(process.env.IPQC_SPEED_OUTPUT)fs.writeFileSync(process.env.IPQC_SPEED_OUTPUT,JSON.stringify(report,null,2));
console.log(JSON.stringify(report));
