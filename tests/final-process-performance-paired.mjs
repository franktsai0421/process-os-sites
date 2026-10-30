import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const run=promisify(execFile),folder=process.env.PERF_FOLDER||'.sites-runtime/perf-final/process';
const baseline=process.env.PERF_BASELINE_BUILD;
assert(baseline,'PERF_BASELINE_BUILD must identify the preserved compiled baseline');
fs.mkdirSync(folder,{recursive:true});
const combined={conditions:{runtime:'compiled Worker and Chromium; complete server/client build per variant',data:'2 stages, 30 templates, 40 equipment; two 320x160 synthetic PNGs; new isolated fixture each run',network:'loopback; no throttling; external blocked',cache:'HTTP disabled; OS retained',boundary:'operation assertion + shared command idle + two frames; full case diff/audit and effective image decode measured separately',order:'alternating five pairs'},reports:[]};
const output=path.join(folder,'paired.json');
try{
 for(let round=1;round<=Number(process.env.PERF_ROUNDS||5);round++)for(const variant of round%2?['baseline','candidate']:['candidate','baseline']){
  const file=path.join(folder,variant+'-'+round+'.json');
  try{await run(process.execPath,['tests/final-process-performance-browser.test.mjs'],{env:{...process.env,PROCESS_TEST_BUILD_DIR:variant==='baseline'?baseline:path.resolve('dist'),MEASUREMENT_PHASE:'final-'+variant+'-'+round,PERF_OUTPUT:file},maxBuffer:2*1024*1024});}
  catch(e){combined.failure={round,variant,code:e.code};throw e;}
  const report=JSON.parse(fs.readFileSync(file,'utf8'));assert.equal(report.status,'PASS');assert.deepEqual(report.errors,[]);
  combined.reports.push({round,variant,report});fs.writeFileSync(output,JSON.stringify(combined,null,2));
  console.log(JSON.stringify({round,variant,status:report.status,operations:report.samples.length,server:report.buildEntrySha256}));
 }
 combined.status='PASS';
}catch{combined.status='FAIL';process.exitCode=1;}
finally{fs.writeFileSync(output,JSON.stringify(combined,null,2));}
