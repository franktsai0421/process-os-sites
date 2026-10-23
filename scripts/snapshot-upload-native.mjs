// Dormant native staging entry. Real use requires independent review, explicit
// authorization and separately provisioned credentials; this CLI issues none.
import {pathToFileURL} from 'node:url';import path from 'node:path';
import {inspectNativeImport,runNativeImport} from '../lib/snapshot-native-runner.mjs';
import {readNativeCredentials} from '../lib/snapshot-native-input.mjs';
import {createNativeCapabilityProvider} from '../lib/snapshot-native-provider.mjs';
export {runNativeImport} from '../lib/snapshot-native-runner.mjs';
export async function nativeImportCLI(argv,{input,fetchAuthorized,signal,onProgress=async()=>{}}={}){
 if(argv.includes('--upload'))throw Error('NATIVE_AUTHORIZED_TRANSPORT_NOT_IMPLEMENTED');
 const stage=argv[0]==='--stage-existing';
 if(stage){if(argv[1]!=='--credentials-stdin'||argv[2]!=='--ack-reviewed-staging-only')throw Error('NATIVE_REVIEWED_AUTHORIZATION_REQUIRED');argv=['--inspect',...argv.slice(3)];}
 const flags=['--inspect','--source','--handoff','--project','--origin','--owner','--target','--manifest'];
 if(argv.length!==15||argv[0]!==flags[0]||flags.slice(1).some((f,i)=>argv[1+i*2]!==f))throw Error('NATIVE_CLI_ARGUMENTS');
 const get=k=>argv[argv.indexOf(k)+1],pins={projectId:get('--project'),origin:get('--origin'),ownerId:get('--owner'),targetFingerprint:get('--target'),manifestSha256:get('--manifest')};
 const sourceDirectory=get('--source'),handoffDirectory=get('--handoff'),preflight=await inspectNativeImport({sourceDirectory,handoffDirectory,pins});
 if(!stage)return preflight;
 if(typeof fetchAuthorized!=='function')throw Error('NATIVE_AUTHORIZED_TRANSPORT_REQUIRED');
 let credentials=await readNativeCredentials(input,{signal}),provider;
 try{
  if(credentials.transferId!==preflight.transferId)throw Error('NATIVE_TRANSFER_PIN');
  provider=await createNativeCapabilityProvider({pins:{...pins,transferId:preflight.transferId},...credentials,fetchAuthorized});
  credentials.applicationToken=null;credentials.siteEntryToken=null;credentials=null;
  // A registration error is uncertain, never automatically repeated here.
  await provider.register({signal});
  return await runNativeImport({sourceDirectory,handoffDirectory,pins,sendAuthorized:provider.send,signal,onProgress,options:{allowDataWrite:true,resume:true,allowActivation:false}});
 }finally{if(credentials){credentials.applicationToken=null;credentials.siteEntryToken=null;}provider?.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const controller=new AbortController(),cancel=()=>controller.abort();process.once('SIGINT',cancel);process.once('SIGTERM',cancel);
 try{const result=await nativeImportCLI(process.argv.slice(2),{input:process.stdin,fetchAuthorized:(url,options)=>fetch(url,options),signal:controller.signal,onProgress:async progress=>process.stdout.write(JSON.stringify({progress})+'\n')});console.log(JSON.stringify(result));if(result.status==='NATIVE_STOPPED_REQUIRE_RECEIPT_REVIEW')process.exitCode=1;}catch(error){console.error(JSON.stringify({status:'FAIL_NATIVE_CLI_NO_AUTOMATIC_RETRY',code:/^[A-Z_]+$/.test(error?.message||'')?error.message:'NATIVE_CLI_UNAVAILABLE'}));process.exitCode=1;}finally{process.removeListener('SIGINT',cancel);process.removeListener('SIGTERM',cancel);}
}
