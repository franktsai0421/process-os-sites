import {openNativeSnapshot} from './snapshot-native-source.mjs';
import {createRecipeUploader,prepareRecipeUpload,inspectRecipeD1Rows} from './snapshot-recipe-uploader.mjs';
import {createNativeTransport} from './snapshot-native-transport.mjs';
export async function inspectNativeImport(options){
 const source=await openNativeSnapshot(options),plan=await prepareRecipeUpload(source,options.pins),d1=await inspectRecipeD1Rows(source,plan.manifest);
 return{status:'PASS_NATIVE_PREFLIGHT_ONLY',transferId:plan.id,summary:plan.summary,d1,remoteRequests:0,authorizedToUpload:false};
}
// A host may inject a reviewed in-memory provider AFTER both authorization layers
// are approved. Standalone CLI deliberately has no such provider today.
export async function runNativeImport({sendAuthorized,sourceDirectory,handoffDirectory,pins,options,signal,onProgress=async()=>{},timeoutMs}){
 if(typeof sendAuthorized!=='function')throw Error('NATIVE_AUTHORIZED_TRANSPORT_REQUIRED');
 if(options?.allowDataWrite!==true||options.resume!==true||options.allowActivation===true)throw Error('NATIVE_REVIEWED_RESUME_ONLY');
 const source=await openNativeSnapshot({sourceDirectory,handoffDirectory,pins}),plan=await prepareRecipeUpload(source,pins),transport=createNativeTransport({pins,transferId:plan.id,sendAuthorized,timeoutMs,expectedChunks:plan.manifest.chunks.length});
 try{
  await transport.handshake(signal);
  const client=await createRecipeUploader({source,pins,request:transport.request,signal,onProgress,batch:true});
  const result=await client.upload(options);
  return{status:'NATIVE_STAGING_VERIFIED_NOT_RESTORED',...result,dataReady:false,businessTrafficEnabled:false};
 }catch(error){
  const reason=transport.status().reason|| (signal?.aborted?'NATIVE_CANCELLED':typeof error?.message==='string'&&/^[A-Z_]+$/.test(error.message)?error.message:'NATIVE_IMPORT_FAILED');
  try{await onProgress({stage:signal?.aborted?'stopped':'error',code:reason});}catch{/* Receipt reconciliation still runs if an output consumer failed. */}let receipt;
  try{receipt=await transport.reconcile();}catch{receipt={readOnly:true,status:'LAST_RECEIPT_UNAVAILABLE',automaticResumeAllowed:false};}
  return{status:'NATIVE_STOPPED_REQUIRE_RECEIPT_REVIEW',code:reason,receipt,businessTrafficEnabled:false};
 }finally{transport.close();}
}
