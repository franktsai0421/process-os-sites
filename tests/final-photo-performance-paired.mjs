import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const run=promisify(execFile),folder=process.env.PERF_FOLDER||'.sites-runtime/perf-final/photo-paired';
const baseline=process.env.PERF_BASELINE_BUILD;
assert(baseline,'PERF_BASELINE_BUILD must identify the preserved compiled baseline');
fs.mkdirSync(folder,{recursive:true});
const combined={conditions:{runtime:'compiled Worker and Chromium; complete server/client build per variant',data:'photo-entry fixture, process-template then process-equipment; 2000x1200 PNG and 800x1200 oriented image; independent fixture per run',network:'loopback; no throttling; external blocked',cache:'HTTP disabled; OS retained',boundary:'separate HTTP timing plus verified persisted photo content; fixture readback is not UI completion or SQL time',order:'alternating five pairs'},reports:[]};
const output=path.join(folder,'paired.json');
try{
 for(let round=1;round<=Number(process.env.PERF_ROUNDS||5);round++)for(const variant of round%2?['baseline','candidate']:['candidate','baseline']){
  const file=path.join(folder,variant+'-'+round+'.json');
  try{await run(process.execPath,['tests/task-photo-timing-20261030.mjs'],{env:{...process.env,PROCESS_TEST_BUILD_DIR:variant==='baseline'?baseline:path.resolve('dist'),PHOTO_ENTRIES:'process-template,process-equipment',PHOTO_TIMING_OUTPUT:file},maxBuffer:2*1024*1024});}
  catch(e){combined.failure={round,variant,code:e.code};throw e;}
  const report=JSON.parse(fs.readFileSync(file,'utf8'));assert.equal(report.status,'PASS');assert.deepEqual(report.errors,[]);
  const buildDirectory=variant==='baseline'?baseline:path.resolve('dist');
  report.buildEntrySha256=createHash('sha256').update(fs.readFileSync(path.join(buildDirectory,'server/index.js'))).digest('hex');
  combined.reports.push({round,variant,report});fs.writeFileSync(output,JSON.stringify(combined,null,2));
  console.log(JSON.stringify({round,variant,status:report.status,cases:report.cases.length}));
 }
 combined.status='PASS';
}catch{combined.status='FAIL';process.exitCode=1;}
finally{fs.writeFileSync(output,JSON.stringify(combined,null,2));}
