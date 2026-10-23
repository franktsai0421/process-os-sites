import {env} from 'cloudflare:workers';
import hosting from '../../../../.openai/hosting.json';
import {readState,identity,can,responseHeaders} from '@/lib/process-state';
import {readImportBody,manifestLimit,authorizeImport} from '@/lib/snapshot-hosted-transfer.mjs';
import {dispatchHostedImport} from '@/lib/snapshot-import-dispatch.mjs';
import {createAttemptBudget} from '@/lib/snapshot-attempt-budget.mjs';
import {assertAttemptPlan} from '@/lib/snapshot-attempt-policy.mjs';
import {maximumChunkBytes} from '@/lib/snapshot-contract.mjs';
import {prepareRecipeUpload,assertUploadCapacity} from '@/lib/snapshot-recipe-uploader.mjs';
import {importPageConfiguration} from '@/lib/sites-import-page.mjs';
import {maximumBatchBytes,batchType,batchGzipType,decodeBatchBody} from '@/lib/snapshot-batch.mjs';
type ImportValues={PROCESS_IMPORT_ENABLED?:string;PROCESS_IMPORT_OWNER_ID?:string;PROCESS_IMPORT_TARGET_FINGERPRINT?:string;PROCESS_IMPORT_MANIFEST_SHA256?:string;PROCESS_IMPORT_ORIGIN?:string;PROCESS_IMPORT_CAPACITY_JSON?:string;PROCESS_IMPORT_ATTEMPT_JSON?:string};
const reply=(value:unknown,status=200)=>Response.json(value,{status,headers:responseHeaders});
async function dispatch(request:Request){
 const values=env as ImportValues;
 if(values.PROCESS_IMPORT_ENABLED!=='1')return reply({error:'IMPORT_DISABLED'},404);
 try{
  const url=new URL(request.url),origin=values.PROCESS_IMPORT_ORIGIN;
  if(!origin||new URL(origin).origin!==origin||url.origin!==origin)throw Error('IMPORT_ORIGIN_CONFIGURATION');
  if(request.method!=='GET'&&(request.headers.get('Origin')!==origin||request.headers.get('Sec-Fetch-Site')==='cross-site'))return reply({error:'IMPORT_CROSS_ORIGIN'},403);
  const state=await readState({keys:['platformUsers','processCustomRoles','processRoleTemplateOverrides','maintenanceMode']}),actor=await identity(request,state);
  if(!actor)return reply({error:'LOGIN_REQUIRED'},401);
  const principal={id:actor.id,role:actor.role,sessionType:actor.sessionType,exportAllowed:await can(request,state,'master.export')};
  const config={enabled:true,projectId:hosting.project_id,targetFingerprint:values.PROCESS_IMPORT_TARGET_FINGERPRINT,manifestSha256:values.PROCESS_IMPORT_MANIFEST_SHA256,ownerId:values.PROCESS_IMPORT_OWNER_ID};
  authorizeImport(principal,config);
  const page=importPageConfiguration(values,hosting.project_id),budget=await createAttemptBudget({db:env.DB,bucket:env.STATE_ARCHIVE,policy:page.attempt,pins:page.pins});
  if(request.method==='GET'&&url.searchParams.get('action')==='configuration')return reply({...page,budget:await budget.status()});
  const id=url.searchParams.get('id')||'',action=url.searchParams.get('action'),rawVersion=url.searchParams.get('version'),expectedVersion=rawVersion===null?undefined:Number(rawVersion);
  if(request.method==='GET'&&action==='budget-status')return reply(await budget.status());
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
  return reply(await dispatchHostedImport({budget,db:env.DB,bucket:env.STATE_ARCHIVE,config,principal,method:request.method,action:request.method==='PUT'?url.searchParams.get('chunk')||'':action,id,expectedVersion,body,cursor:Number(url.searchParams.get('cursor')||0)}));
 }catch(error){
  const code=error instanceof Error&&/^IMPORT_[A-Z0-9_]+$/.test(error.message)?error.message:'IMPORT_UNAVAILABLE';
  return reply({error:code},code==='IMPORT_OWNER_REQUIRED'?403:code==='IMPORT_DISABLED'?404:code==='IMPORT_UNAVAILABLE'?503:409);
 }
}
export const GET=dispatch;
export const POST=dispatch;
export const PUT=dispatch;
