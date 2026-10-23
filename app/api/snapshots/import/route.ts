import {env} from 'cloudflare:workers';
import hosting from '../../../../.openai/hosting.json';
import {readState,identity,can,responseHeaders} from '@/lib/process-state';
import {createHostedTransfer,readImportBody,manifestLimit,authorizeImport} from '@/lib/snapshot-hosted-transfer.mjs';
import {createHostedTransferStore} from '@/lib/snapshot-hosted-store.mjs';
import {createHostedActivationStore} from '@/lib/snapshot-hosted-activation-store.mjs';
import {createHostedActivation} from '@/lib/snapshot-hosted-activation.mjs';
import {maximumChunkBytes} from '@/lib/snapshot-contract.mjs';
import {prepareRecipeUpload,assertUploadCapacity} from '@/lib/snapshot-recipe-uploader.mjs';
import {importPageConfiguration} from '@/lib/sites-import-page.mjs';
type ImportValues={PROCESS_IMPORT_ENABLED?:string;PROCESS_IMPORT_OWNER_ID?:string;PROCESS_IMPORT_TARGET_FINGERPRINT?:string;PROCESS_IMPORT_MANIFEST_SHA256?:string;PROCESS_IMPORT_ORIGIN?:string;PROCESS_IMPORT_CAPACITY_JSON?:string};
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
  if(request.method==='GET'&&url.searchParams.get('action')==='configuration')return reply(importPageConfiguration(values,hosting.project_id));
  const store=createHostedTransferStore({db:env.DB,bucket:env.STATE_ARCHIVE}),transfer=createHostedTransfer({store,bucket:env.STATE_ARCHIVE,config});
  const activation=createHostedActivation({transfer,store:createHostedActivationStore(env.DB),transferStore:store,db:env.DB,bucket:env.STATE_ARCHIVE,ownerId:config.ownerId});
  const id=url.searchParams.get('id')||'',action=url.searchParams.get('action'),rawVersion=url.searchParams.get('version'),expectedVersion=rawVersion===null?undefined:Number(rawVersion);
  if(request.method==='GET')return reply(action==='activation-status'?await activation.status(principal,id):await transfer.status(principal,id,{cursor:Number(url.searchParams.get('cursor')||0),limit:100}));
  if(request.method==='PUT')return reply(await transfer.receive(principal,id,url.searchParams.get('chunk')||'',await readImportBody(request,maximumChunkBytes)));
  if(request.method!=='POST')return reply({error:'IMPORT_METHOD'},405);
  if(action==='begin'){
   if(request.headers.get('Content-Type')?.split(';')[0]!=='application/json')return reply({error:'IMPORT_CONTENT_TYPE'},415);
   const {pins,capacity}=importPageConfiguration(values,hosting.project_id);
   if(!capacity)return reply({error:'IMPORT_CAPACITY_UNVERIFIED'},409);
   const bytes=await readImportBody(request,manifestLimit);
   let manifest;try{manifest=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{return reply({error:'IMPORT_MANIFEST_INVALID'},400);}
   let plan;try{plan=await prepareRecipeUpload({async manifest(){return manifest;}},pins);}catch{return reply({error:'IMPORT_MANIFEST_INVALID'},409);}
   try{assertUploadCapacity(plan,capacity);}catch{return reply({error:'IMPORT_CAPACITY_UNVERIFIED'},409);}
   return reply(await transfer.begin(principal,bytes));
  }
  if(action==='verify')return reply(await transfer.verify(principal,id,{expectedVersion,limit:8}));
  if(action==='audit')return reply(await activation.audit(principal,id,{expectedVersion}));
  if(action==='copy')return reply(await activation.copy(principal,id,{expectedVersion}));
  if(action==='restore')return reply(await activation.restore(principal,id,{expectedVersion,limit:32}));
  if(action==='activate')return reply(await activation.activate(principal,id,{expectedVersion}));
  return reply({error:'IMPORT_ACTION'},400);
 }catch(error){
  const code=error instanceof Error&&/^IMPORT_[A-Z0-9_]+$/.test(error.message)?error.message:'IMPORT_UNAVAILABLE';
  return reply({error:code},code==='IMPORT_OWNER_REQUIRED'?403:code==='IMPORT_DISABLED'?404:code==='IMPORT_UNAVAILABLE'?503:409);
 }
}
export const GET=dispatch;
export const POST=dispatch;
export const PUT=dispatch;
