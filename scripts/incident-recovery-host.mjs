// Future explicitly authorized live entry only. Imports/syntax checks do not
// generate credentials. No secret arguments, env variables or credential file.
import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';
import {createIncidentMemoryHost,incidentFileClaim} from '../lib/snapshot-incident-host.mjs';
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 if(process.argv.length!==4||process.argv[2]!=='--run'||!/^[a-f0-9]{40}$/.test(process.argv[3])||/^0+$/.test(process.argv[3]))process.exitCode=1;
 else{
  const directory=path.resolve(import.meta.dirname,'..','.sites-runtime'),controller=new AbortController(),cancel=()=>controller.abort();
  process.once('SIGINT',cancel);process.once('SIGTERM',cancel);
  try{fs.mkdirSync(directory,{recursive:true});if(fs.lstatSync(directory).isSymbolicLink())throw Error('HOST_DIRECTORY_REFUSED');const result=await createIncidentMemoryHost({programCommit:process.argv[3],input:process.stdin,stdout:process.stdout,stderr:process.stderr,signal:controller.signal,claimGeneration:incidentFileClaim(path.join(directory,'incident-verify-generation.json'))}).run();process.exitCode=result.status==='HOST_VERIFY_AUDIT_SEALED'?0:1;}
  catch{process.exitCode=1;}finally{process.removeListener('SIGINT',cancel);process.removeListener('SIGTERM',cancel);}
 }
}
