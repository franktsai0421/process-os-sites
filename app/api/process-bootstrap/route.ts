import {readState,companyReader,companyState,identity,responseHeaders,demoEnabled} from '@/lib/process-state';
import {identityKeys} from '@/lib/delivery-read-plan.mjs';
import {destinationPlan,destinationValues} from '@/lib/destination-delivery.mjs';
import {runtimeCatalog,legacyBom} from '@/lib/process-bootstrap.mjs';
import {startupCase} from '@/lib/startup-assets.mjs';
import {env} from 'cloudflare:workers';
import {mediaState} from '@/lib/state-media';
import {createIdentityReadToken,allowIdentityReadReuse} from '@/lib/state-records';

export async function GET(request:Request){
  try{
    const identityReadToken=createIdentityReadToken();
    const auth=await readState({keys:[...identityKeys],identityReadToken}),before=await companyReader(request,auth);
    if(!before)return Response.json({error:'LOGIN_REQUIRED'},{status:401,headers:responseHeaders});
    // Availability only, never an account permission or a private-store read.
    const features={webFeedback:(env as typeof env & {WEB_FEEDBACK_ENABLED?:string}).WEB_FEEDBACK_ENABLED==='1'};
    let plan;
    try{plan=await destinationPlan(new URL(request.url).search,before.canRead,auth.recordStorage?Object.keys(auth.recordStorage.envelope.__processRecords.values):Object.keys(auth.values),features);}
    catch(error){return Response.json({error:error instanceof Error?error.message:'INVALID_DESTINATION'},{status:error instanceof Error&&error.message==='DESTINATION_FORBIDDEN'?403:error instanceof Error&&error.message==='DESTINATION_UNAVAILABLE'?404:400,headers:responseHeaders});}
    // Only identity-only projections qualify; catalog/media/business readers do not.
    const reuseIdentity=plan.keys.every(key=>identityKeys.includes(key))&&allowIdentityReadReuse(identityReadToken);
    // The FQC screen must obtain its owned full workflow before rendering. For
    // adopted records only, defer that library's bodies to this mandatory GET;
    // retain sibling quality libraries and the canonical fallback unchanged.
    const projectFqc=(key:string,raw:string)=>{
      if(key!=='qualityMasterControl')return raw;
      const root=JSON.parse(raw),library=root?.libraries?.fqc,flow=library?.workflow;
      if(root?.schemaVersion!==1||!root.libraries||Array.isArray(root.libraries)||!library||Array.isArray(library)||
        !Array.isArray(library.versions)||flow?.schemaVersion!==3||flow.scope!=='fqc'||typeof flow.generation!=='string'||!flow.generation||
        !Number.isSafeInteger(flow.revision)||flow.revision<0)return raw;
      const {fqc:_deferred,...libraries}=root.libraries;
      return JSON.stringify({...root,libraries});
    };
    const state=await readState({keys:plan.keys,effectiveOnly:true,deferHistory:true,deferDependencyHistory:true,...(reuseIdentity?{identityReadToken}:{}),...(plan.destination.module==='fqc'?{projectValue:projectFqc}:{})});
    const reader=await companyReader(request,state);
    if(!reader||reader.actor.id!==before.actor.id)return Response.json({error:'LOGIN_REQUIRED'},{status:401,headers:responseHeaders});
    if(state.revision!==auth.revision)return Response.json({error:'BOOTSTRAP_REVISION_CHANGED'},{status:409,headers:responseHeaders});
    const catalog=await runtimeCatalog(state.values,reader.canRead,()=>legacyBom(env.STATE_ARCHIVE,startupCase.files.find(file=>file.name==='imported-data.js')!),plan.catalog),projected=destinationValues(await companyState(request,state),plan);
    // Ordinary reads never create or prune backups; deferred media may still cache.
    const delivered=request.headers.get('X-Process-Media')==='deferred-v1'?await mediaState(state,reader.actor.id,projected):projected;
    // Recheck the actor/epoch and all cells after object I/O. No cross-request
    // authorization cache, no persistence of a partially decoded snapshot.
    // Deliberately no reuse token: final storage integrity and authority are fresh.
    const after=await readState({keys:[...identityKeys]}),actor=await identity(request,after);
    if(!actor||actor.id!==reader.actor.id||after.revision!==state.revision)return Response.json({error:'BOOTSTRAP_REVISION_CHANGED'},{status:409,headers:responseHeaders});
    return Response.json({...delivered,identity:actor,serverProtected:true,demoEnabled:demoEnabled(request),features,catalog,destination:plan.destination,
      deliveryProjection:true,writableKeys:['dispatchBoard','backupSettings'].filter(key=>Object.hasOwn(projected.values,key))},{headers:responseHeaders});
  }catch{return Response.json({error:'BOOTSTRAP_UNAVAILABLE'},{status:503,headers:responseHeaders});}
}
