// Nonsecret CLI structure. Real authenticated upload remains disabled until the
// independent capability/private-entry design is reviewed and implemented.
import {pathToFileURL} from 'node:url';import path from 'node:path';
import {inspectNativeImport} from '../lib/snapshot-native-runner.mjs';
export {runNativeImport} from '../lib/snapshot-native-runner.mjs';
export async function nativeImportCLI(argv){
 if(argv.includes('--upload'))throw Error('NATIVE_AUTHORIZED_TRANSPORT_NOT_IMPLEMENTED');
 const flags=['--inspect','--source','--handoff','--project','--origin','--owner','--target','--manifest'];
 if(argv.length!==15||argv[0]!==flags[0]||flags.slice(1).some((f,i)=>argv[1+i*2]!==f))throw Error('NATIVE_CLI_ARGUMENTS');
 const get=k=>argv[argv.indexOf(k)+1],pins={projectId:get('--project'),origin:get('--origin'),ownerId:get('--owner'),targetFingerprint:get('--target'),manifestSha256:get('--manifest')};
 return inspectNativeImport({sourceDirectory:get('--source'),handoffDirectory:get('--handoff'),pins});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 try{console.log(JSON.stringify(await nativeImportCLI(process.argv.slice(2))));}catch(error){console.error(JSON.stringify({status:'FAIL_NATIVE_CLI_NO_AUTOMATIC_RETRY',code:/^[A-Z_]+$/.test(error?.message||'')?error.message:'NATIVE_CLI_UNAVAILABLE'}));process.exitCode=1;}
}
