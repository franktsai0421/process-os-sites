import 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {openSnapshotDirectory} from '../lib/snapshot-files.mjs';
import {createNormalizationDirectory} from '../lib/snapshot-normalize-files.mjs';
const args=process.argv.slice(2),get=flag=>args[args.indexOf(flag)+1];
try{
 const flags=['--source','--manifest-sha256','--output','--program-commit'];
 if(!flags.every(flag=>args.includes(flag))||args.some((s,i)=>i%2===0&&!flags.includes(s)&&s!=='--resume'))throw Error('NORMALIZE_ARGUMENTS');
 const root=path.resolve(fileURLToPath(new URL('..',import.meta.url))),commit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
 if(commit!==get('--program-commit')||execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'}).trim())throw Error('NORMALIZE_REVIEWED_CLEAN_SOURCE_REQUIRED');
 const source=await openSnapshotDirectory(get('--source'),get('--manifest-sha256'));
 const {root:output,result,view}=await createNormalizationDirectory({source,sourceRoot:get('--source'),output:get('--output'),programCommit:commit,sourceManifestSha256:get('--manifest-sha256'),resume:args.includes('--resume'),onProgress:async dto=>console.log(JSON.stringify(dto))});
 await view.close();console.log(JSON.stringify({status:result.status,output,programCommit:commit,sourceManifestSha256:result.sourceManifestSha256,normalizedManifestSha256:result.manifestSha256,planBytes:result.planBytes,audit:result.audit,realCredentialConfiguration:false,remoteTransfer:false}));
}catch(error){const code=error instanceof Error&&/^[A-Z0-9_]+$/.test(error.message)?error.message:'NORMALIZE_UNAVAILABLE';console.error(JSON.stringify({status:'FAIL_RETAIN_PARTIAL_VIEW',code,filesystemCode:typeof error.code==='string'&&/^[A-Z0-9_]+$/.test(error.code)?error.code:undefined}));process.exitCode=1;}
