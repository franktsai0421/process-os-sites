// Exact public source bytes for paired synthetic regressions; no data or runtime state.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
export const baselineCommit='ca6647977a8680038444ce2c1ba4e80f2343cd0a';
export const baselineFiles={
 'lib/master-workflow.ts':'362bdf551d93f8fc7a32e5b97b6d257dffc9cc90f526678fe626f391a007718f',
 'app/api/master/references/route.ts':'cd472a4df512ab11261e8a5d1e447ebfa10a7642acd1079c0ca454e7bf8ea353',
 'lib/process-ipqc.ts':'d62dfbb404df7510650012ec88c9b178e2ed4651760b78b3842446084a781e50',
 'app/api/process-ipqc/route.ts':'4f93268b3adfe964eeee5ec15c8ef25f57c233b5cbece146274d61d5b5b9a486',
 'public/process/process-ipqc.js':'dddaec11146ee90877dcac43bb95a5284e6860d64831dea409e01a0f5cc48f4b',
 'lib/process-authoring-workflow.ts':'c72b377a0eb5f7d3afb0bfd3b16d31b61673b8ce70d5e7da8c5a8d0f32e87ea6',
};
export function verifyBaseline(read){
 const values=new Map();for(const [file,expected]of Object.entries(baselineFiles)){
  const bytes=read(file);assert.equal(createHash('sha256').update(bytes).digest('hex'),expected,'PERFORMANCE_BASELINE_HASH_MISMATCH: '+file);values.set(file,bytes);
 }return values;
}
export function readGitBaseline(repository='.'){return file=>execFileSync('git',['-C',repository,'show',baselineCommit+':'+file]);}
export function materializeBaseline(directory,read=readGitBaseline()){
 const values=verifyBaseline(read); // Verify all bytes before writing any output.
 for(const [file,bytes]of values){const target=path.join(directory,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes);}
 return{commit:baselineCommit,files:values.size,directory:path.resolve(directory)};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const directory=process.argv[2]||'.sites-runtime/performance-baseline';
 if(process.argv[3]==='--verify-only'){verifyBaseline(file=>fs.readFileSync(path.join(directory,file)));console.log(JSON.stringify({status:'PASS_VERIFIED_EXACT_BASELINE',commit:baselineCommit,files:Object.keys(baselineFiles).length}));}
 else console.log(JSON.stringify(materializeBaseline(directory,readGitBaseline(process.argv[3]))));
}
