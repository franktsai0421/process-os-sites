import {readState,companyReader,companyState,identity,responseHeaders,demoEnabled,scheduledBackup} from '@/lib/process-state';
import {identityKeys} from '@/lib/delivery-read-plan.mjs';
import {destinationPlan,destinationValues} from '@/lib/destination-delivery.mjs';
import {runtimeCatalog,legacyBom} from '@/lib/process-bootstrap.mjs';
import {startupCase} from '@/lib/startup-assets.mjs';
import {env} from 'cloudflare:workers';
import {mediaState} from '@/lib/state-media';

export async function GET(request:Request){
  try{
    const auth=await readState({keys:[...identityKeys]}),before=await companyReader(request,auth);
    if(!before)return Response.json({error:'LOGIN_REQUIRED'},{status:401,headers:responseHeaders});
    let plan;
    try{plan=await destinationPlan(new URL(request.url).search,before.canRead,auth.recordStorage?Object.keys(auth.recordStorage.envelope.__processRecords.values):Object.keys(auth.values));}
    catch(error){return Response.json({error:error instanceof Error?error.message:'INVALID_DESTINATION'},{status:error instanceof Error&&error.message==='DESTINATION_FORBIDDEN'?403:400,headers:responseHeaders});}
    const state=await readState({keys:plan.keys,effectiveOnly:true,deferHistory:true,deferDependencyHistory:true});
    const reader=await companyReader(request,state);
    if(!reader||reader.actor.id!==before.actor.id)return Response.json({error:'LOGIN_REQUIRED'},{status:401,headers:responseHeaders});
    if(state.revision!==auth.revision)return Response.json({error:'BOOTSTRAP_REVISION_CHANGED'},{status:409,headers:responseHeaders});
    const catalog=await runtimeCatalog(state.values,reader.canRead,()=>legacyBom(env.STATE_ARCHIVE,startupCase.files.find(file=>file.name==='imported-data.js')!),plan.catalog),projected=destinationValues(await companyState(request,state),plan);
    try{await scheduledBackup(state,()=>readState({deferHistory:true,deferDependencyHistory:true}));}catch{console.error('[cloud-backup] scheduled snapshot unavailable');}
    const delivered=request.headers.get('X-Process-Media')==='deferred-v1'?await mediaState(state,reader.actor.id,projected):projected;
    // Recheck the actor/epoch and all cells after object I/O. No cross-request
    // authorization cache, no persistence of a partially decoded snapshot.
    const after=await readState({keys:[...identityKeys]}),actor=await identity(request,after);
    if(!actor||actor.id!==reader.actor.id||after.revision!==state.revision)return Response.json({error:'BOOTSTRAP_REVISION_CHANGED'},{status:409,headers:responseHeaders});
    return Response.json({...delivered,identity:actor,serverProtected:true,demoEnabled:demoEnabled(request),catalog,destination:plan.destination,
      deliveryProjection:true,writableKeys:['dispatchBoard','backupSettings'].filter(key=>Object.hasOwn(projected.values,key))},{headers:responseHeaders});
  }catch{return Response.json({error:'BOOTSTRAP_UNAVAILABLE'},{status:503,headers:responseHeaders});}
}
