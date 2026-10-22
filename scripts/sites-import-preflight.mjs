// Read-only recipe preflight. No fetch, account/session access or target writes.
import {openSnapshotDirectory} from '../lib/snapshot-files.mjs';
import {openNormalizationDirectory} from '../lib/snapshot-normalize-files.mjs';
import {prepareRecipeUpload} from '../lib/snapshot-recipe-uploader.mjs';
const args=process.argv.slice(2),flags=['--source','--source-manifest','--view','--manifest','--project','--origin','--owner','--target'];let view;
try{
 if(args.length!==flags.length*2||args.filter((_,i)=>i%2===0).some((v,i)=>v!==flags[i]))throw Error('UPLOAD_PREFLIGHT_ARGUMENTS');
 const get=flag=>args[args.indexOf(flag)+1],source=await openSnapshotDirectory(get('--source'),get('--source-manifest'));
 const opened=await openNormalizationDirectory({source,output:get('--view')});view=opened.view;
 const prepared=await prepareRecipeUpload(view,{projectId:get('--project'),origin:get('--origin'),ownerId:get('--owner'),targetFingerprint:get('--target'),manifestSha256:get('--manifest')});
 console.log(JSON.stringify({status:'PASS_READONLY_RECIPE_PREFLIGHT_NOT_AUTHORIZED_TO_UPLOAD',...prepared.summary,sourceReceiptVerified:true,normalizedReceiptVerified:true,copiedPayloadBytes:0,remoteRequests:0,requiredBeforeUpload:['measured target D1/R2 capacity and fee evidence','explicit real-data transfer authorization','supported authenticated request/session handoff'],passwordRead:false}));
}catch(error){console.error(JSON.stringify({status:'FAIL_PREFLIGHT_NO_REMOTE_WRITES',code:error instanceof Error&&/^[A-Z_]+$/.test(error.message)?error.message:'UPLOAD_PREFLIGHT_UNAVAILABLE'}));process.exitCode=1;}
finally{if(view)await view.close();}
