import {env} from 'cloudflare:workers';
import hosting from '../../../../.openai/hosting.json';
import {readState,readPlatformUsers,identity,can,responseHeaders} from '@/lib/process-state';
import {effectiveAccess} from '@/lib/user-access';
import {readImportBody,manifestLimit,authorizeImport} from '@/lib/snapshot-hosted-transfer.mjs';
import {dispatchHostedImport} from '@/lib/snapshot-import-dispatch.mjs';
import {createAttemptBudget} from '@/lib/snapshot-attempt-budget.mjs';
import {assertAttemptPlan} from '@/lib/snapshot-attempt-policy.mjs';
import {maximumChunkBytes} from '@/lib/snapshot-contract.mjs';
import {prepareRecipeUpload,assertUploadCapacity} from '@/lib/snapshot-recipe-uploader.mjs';
import {importPageConfiguration} from '@/lib/sites-import-page.mjs';
import {maximumBatchBytes,batchType,batchGzipType,decodeBatchBody} from '@/lib/snapshot-batch.mjs';
import {createRetirement} from '@/lib/snapshot-retirement.mjs';
import {createNativeImportHandler} from '@/lib/snapshot-native-handler.mjs';
import {createIncidentRecoveryRuntime} from '@/lib/snapshot-incident-recovery.mjs';
import {sha256} from '@/lib/snapshot-contract.mjs';
import {createC273Observation} from '@/lib/snapshot-c273-observation.mjs';
import {createV19RecoveryRuntime} from '@/lib/snapshot-v19-recovery.mjs';
type ImportValues={PROCESS_IMPORT_ENABLED?:string;PROCESS_IMPORT_OWNER_ID?:string;PROCESS_IMPORT_TARGET_FINGERPRINT?:string;PROCESS_IMPORT_MANIFEST_SHA256?:string;PROCESS_IMPORT_ORIGIN?:string;PROCESS_IMPORT_CAPACITY_JSON?:string;PROCESS_IMPORT_ATTEMPT_JSON?:string;PROCESS_IMPORT_RETIREMENT_JSON?:string;PROCESS_NATIVE_IMPORT_ENABLED?:string;PROCESS_NATIVE_IMPORT_GRANT_JSON?:string;PROCESS_OWNER_BOOTSTRAP_ENABLED?:string;PROCESS_VERIFY_RECOVERY_ENABLED?:string;PROCESS_VERIFY_RECOVERY_JSON?:string;PROCESS_PROGRAM_COMMIT?:string};
type ObservationValues={PROCESS_C273_OBSERVATION_ENABLED?:string;PROCESS_C273_OBSERVATION_JSON?:string};
type V19Values={PROCESS_V19_RECOVERY_ENABLED?:string;PROCESS_V19_RECOVERY_JSON?:string};
const reply=(value:unknown,status=200)=>Response.json(value,{status,headers:responseHeaders});
async function dispatch(request:Request){
 const values=env as ImportValues&ObservationValues&V19Values;
 if(values.PROCESS_IMPORT_ENABLED!=='1')return reply({error:'IMPORT_DISABLED'},404);
 try{
  const url=new URL(request.url),origin=values.PROCESS_IMPORT_ORIGIN;
  if(!origin||new URL(origin).origin!==origin||url.origin!==origin)throw Error('IMPORT_ORIGIN_CONFIGURATION');
  if(request.method!=='GET'&&(request.headers.get('Origin')!==origin||request.headers.get('Sec-Fetch-Site')==='cross-site'))return reply({error:'IMPORT_CROSS_ORIGIN'},403);
  const readOwnerEligibility=async()=>{
   const nativeState=await readState({keys:['platformUsers','processCustomRoles','processRoleTemplateOverrides']}),current=await env.DB.prepare('SELECT revision,updated_at FROM shared_state WHERE id=1').first<{revision:number;updated_at:string}>();
   const owner=readPlatformUsers(nativeState.values.platformUsers).find(u=>u.id===values.PROCESS_IMPORT_OWNER_ID);if(!owner||!current||current.revision!==nativeState.revision)return null;
   const access=effectiveAccess(owner,nativeState.values);
   return{id:owner.id,enabled:access.enabled&&owner.authMode!=='demo'&&!('disabled' in owner&&owner.disabled===true),role:owner.role,exportAllowed:access.permissions.includes('master.export'),authEpoch:typeof owner.authEpoch==='number'&&Number.isSafeInteger(owner.authEpoch)?owner.authEpoch:0,revision:current.revision,updatedAt:current.updated_at};
  };
  const nativePins={projectId:hosting.project_id,origin,ownerId:values.PROCESS_IMPORT_OWNER_ID,targetFingerprint:values.PROCESS_IMPORT_TARGET_FINGERPRINT,manifestSha256:values.PROCESS_IMPORT_MANIFEST_SHA256,transferId:await sha256(new TextEncoder().encode(JSON.stringify([hosting.project_id,values.PROCESS_IMPORT_TARGET_FINGERPRINT,values.PROCESS_IMPORT_MANIFEST_SHA256])))};
  const v19Enabled=values.PROCESS_V19_RECOVERY_ENABLED==='1';
  if(v19Enabled&&(values.PROCESS_VERIFY_RECOVERY_ENABLED==='1'||values.PROCESS_C273_OBSERVATION_ENABLED==='1'))throw Error('IMPORT_V19_MODE_CONFLICT');
  const recovery=v19Enabled?await createV19RecoveryRuntime({db:env.DB,config:values.PROCESS_V19_RECOVERY_JSON,programCommit:values.PROCESS_PROGRAM_COMMIT,projectId:hosting.project_id,origin,bindingsPins:nativePins,readOwnerEligibility}):values.PROCESS_VERIFY_RECOVERY_ENABLED==='1'?await createIncidentRecoveryRuntime({db:env.DB,config:values.PROCESS_VERIFY_RECOVERY_JSON,programCommit:values.PROCESS_PROGRAM_COMMIT,projectId:hosting.project_id,origin,bindingsPins:nativePins,readOwnerEligibility}):null;
  if(url.searchParams.get('action')?.startsWith('v19-'))return v19Enabled&&recovery?recovery.handle(request):reply({error:'IMPORT_V19_DISABLED'},404);
  if(v19Enabled&&url.searchParams.get('action')?.startsWith('incident-'))return reply({error:'IMPORT_VERIFY_DISABLED'},404);
  if(url.searchParams.get('action')?.startsWith('incident-'))return recovery?recovery.handle(request):reply({error:'IMPORT_VERIFY_DISABLED'},404);
  if(request.headers.has('Authorization')){
   if(values.PROCESS_NATIVE_IMPORT_ENABLED!=='1')return reply({error:'IMPORT_NATIVE_DISABLED'},404);
   const handler=createNativeImportHandler({enabled:true,db:env.DB,bucket:env.STATE_ARCHIVE,pins:nativePins,policy:values.PROCESS_IMPORT_ATTEMPT_JSON,grantTemplate:values.PROCESS_NATIVE_IMPORT_GRANT_JSON,bootstrapClosed:values.PROCESS_OWNER_BOOTSTRAP_ENABLED!=='1',readOwnerEligibility,recovery});
   return handler.handle(request);
  }
  if(recovery&&request.method!=='GET')return reply({error:'IMPORT_VERIFY_MAINTENANCE_ONLY'},409);
  const state=await readState({keys:['platformUsers','processCustomRoles','processRoleTemplateOverrides','maintenanceMode']}),actor=await identity(request,state);
  if(!actor)return reply({error:'LOGIN_REQUIRED'},401);
  const principal={id:actor.id,role:actor.role,sessionType:actor.sessionType,exportAllowed:await can(request,state,'master.export')};
  const config={enabled:true,projectId:hosting.project_id,targetFingerprint:values.PROCESS_IMPORT_TARGET_FINGERPRINT,manifestSha256:values.PROCESS_IMPORT_MANIFEST_SHA256,ownerId:values.PROCESS_IMPORT_OWNER_ID};
  authorizeImport(principal,config);
  if(url.searchParams.get('action')==='c273-observation'){
   const observer=await createC273Observation({db:env.DB,bucket:env.STATE_ARCHIVE,pins:nativePins,programCommit:values.PROCESS_PROGRAM_COMMIT,enabled:values.PROCESS_C273_OBSERVATION_ENABLED==='1',configuration:values.PROCESS_C273_OBSERVATION_JSON,readOwnerEligibility,recoveryClosed:values.PROCESS_VERIFY_RECOVERY_ENABLED!=='1'&&!v19Enabled});
   return observer.handle(request,principal);
  }
  const page=importPageConfiguration(values,hosting.project_id),budget=await createAttemptBudget({db:env.DB,bucket:env.STATE_ARCHIVE,policy:page.attempt,pins:page.pins});
  const retirement=createRetirement({db:env.DB,bucket:env.STATE_ARCHIVE,pins:page.pins,policy:page.attempt,plan:page.retirementPlan}),retirementStatus=await retirement.status();
  async function visibleBudget(){return retirementStatus&&retirementStatus.state!=='retired'?{state:'retirement-required',inFlight:true,reason:'IMPORT_RETIREMENT_REQUIRED',used:null}:await budget.status();}
  if(request.method==='GET'&&url.searchParams.get('action')==='configuration'){const {retirementPlan:_plan,...publicPage}=page;return reply({...publicPage,retirement:retirementStatus,budget:await visibleBudget()});}
  const id=url.searchParams.get('id')||'',action=url.searchParams.get('action'),rawVersion=url.searchParams.get('version'),expectedVersion=rawVersion===null?undefined:Number(rawVersion);
  if(request.method==='GET'&&action==='budget-status')return reply(await visibleBudget());
  if(request.method==='POST'&&action==='retire'){
   if(!page.bootstrapClosed||!page.retirementPlan||request.headers.get('Content-Type')?.split(';')[0]!=='application/json')throw Error('IMPORT_RETIREMENT_CONFIGURATION');
   const raw=await readImportBody(request,1024);let confirmation;try{confirmation=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));}catch{throw Error('IMPORT_RETIREMENT_CONFIRMATION');}
   if(!confirmation||Object.keys(confirmation).join()!=='confirmOldTransferId'||confirmation.confirmOldTransferId!==page.retirementPlan.oldTransferId)throw Error('IMPORT_RETIREMENT_CONFIRMATION');
   return reply(await retirement.retire(principal));
  }
  if(retirementStatus&&retirementStatus.state!=='retired'&&request.method!=='GET')throw Error('IMPORT_RETIREMENT_REQUIRED');
  if(!['GET','POST','PUT'].includes(request.method))return reply({error:'IMPORT_METHOD'},405);
  let body:Uint8Array|undefined;
  if(request.method==='PUT')body=await readImportBody(request,maximumChunkBytes);
  if(request.method==='POST'&&action==='batch'){
   const type=request.headers.get('Content-Type')?.split(';')[0];if(type!==batchType&&type!==batchGzipType)return reply({error:'IMPORT_BATCH_FORMAT'},415);
   body=await decodeBatchBody(await readImportBody(request,maximumBatchBytes),type);
  }
  if(request.method==='POST'&&action==='begin'){
   if(request.headers.get('Content-Type')?.split(';')[0]!=='application/json')return reply({error:'IMPORT_CONTENT_TYPE'},415);
   if(!page.capacity&&!page.attempt)return reply({error:'IMPORT_CAPACITY_UNVERIFIED'},409);
   body=await readImportBody(request,manifestLimit);
   let manifest;try{manifest=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(body));}catch{return reply({error:'IMPORT_MANIFEST_INVALID'},400);}
   let plan;try{plan=await prepareRecipeUpload({async manifest(){return manifest;}},page.pins);}catch{return reply({error:'IMPORT_MANIFEST_INVALID'},409);}
   if(page.attempt)assertAttemptPlan(plan,page.attempt);else{try{assertUploadCapacity(plan,page.capacity);}catch{return reply({error:'IMPORT_CAPACITY_UNVERIFIED'},409);}}
  }
  const result=await dispatchHostedImport({budget,db:env.DB,bucket:env.STATE_ARCHIVE,config,principal,method:request.method,action:request.method==='PUT'?url.searchParams.get('chunk')||'':action,id,expectedVersion,body,cursor:Number(url.searchParams.get('cursor')||0),signal:request.signal});
  return reply(request.method==='POST'&&['verify','audit','copy','restore','activate'].includes(action||'')?{...result,budget:await visibleBudget()}:result);
 }catch(error){
  const code=error instanceof Error&&/^IMPORT_[A-Z0-9_]+$/.test(error.message)?error.message:'IMPORT_UNAVAILABLE';
  return reply({error:code},code==='IMPORT_OWNER_REQUIRED'?403:code==='IMPORT_DISABLED'?404:code==='IMPORT_UNAVAILABLE'?503:409);
 }
}
export const GET=dispatch;
export const POST=dispatch;
export const PUT=dispatch;
