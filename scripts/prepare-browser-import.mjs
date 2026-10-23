// Explicit local artifact preparation only. Never upload or log into a Site.
import {openSnapshotDirectory} from '../lib/snapshot-files.mjs';
import {openNormalizationDirectory} from '../lib/snapshot-normalize-files.mjs';
import {writeBrowserHandoff} from '../lib/snapshot-browser-handoff.mjs';
const flags=['--source','--source-manifest','--view','--manifest','--project','--origin','--owner','--target','--output'],args=process.argv.slice(2);let normalized;
try{if(args.length!==flags.length*2||args.filter((_,i)=>i%2===0).some((v,i)=>v!==flags[i]))throw Error('HANDOFF_ARGUMENTS');const get=k=>args[args.indexOf(k)+1],source=await openSnapshotDirectory(get('--source'),get('--source-manifest'));normalized=await openNormalizationDirectory({source,output:get('--view')});const result=await writeBrowserHandoff({source,normalized,viewRoot:get('--view'),output:get('--output'),pins:{projectId:get('--project'),origin:get('--origin'),ownerId:get('--owner'),targetFingerprint:get('--target'),manifestSha256:get('--manifest')}});console.log(JSON.stringify(result));}
catch(e){console.error(JSON.stringify({status:'FAIL_LOCAL_HANDOFF_NO_REMOTE_WRITES',code:e instanceof Error&&/^[A-Z_]+$/.test(e.message)?e.message:'HANDOFF_UNAVAILABLE'}));process.exitCode=1;}
finally{if(normalized)await normalized.view.close();}
