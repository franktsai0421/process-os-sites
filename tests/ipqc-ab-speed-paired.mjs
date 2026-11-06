import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const folder=path.resolve(process.env.IPQC_SPEED_FOLDER||'docs/acceptance/ipqc-ab-speed-20261106');
const baseline=process.env.IPQC_SPEED_BASELINE_SOURCE,build=process.env.IPQC_SPEED_BASELINE_BUILD;
if(!baseline||!build)throw Error('Explicit baseline source and complete build are required');
fs.mkdirSync(folder,{recursive:true});
const paired={conditions:{pairs:3,order:'alternating baseline/candidate',handler:'actual TS handlers + synthetic memory SQLite/R2 with fixed 10ms I/O delays',browser:'complete compiled Worker + Chromium + synthetic lossless 1200x800 PNG; no artificial network delay',bridge:'ChatGPT/tool audit/bridge latency not reproduced; never subtract from parent observations'},runs:[]};
for(let pair=1;pair<=3;pair++)for(const variant of pair%2?['baseline','candidate']:['candidate','baseline']){
 for(const kind of ['measure','browser']){
  const output=path.join(folder,`${variant}-${kind}-${pair}.json`);
  const env={...process.env,IPQC_SPEED_ROUNDS:'1',IPQC_SPEED_OUTPUT:output};
  if(variant==='baseline'){if(kind==='measure')env.REPLACEMENT_PREVIEW_SOURCE_ROOT=baseline;else env.PROCESS_TEST_BUILD_DIR=build;}
  execFileSync(process.execPath,[`tests/ipqc-ab-speed-${kind}.mjs`],{env,stdio:['ignore','pipe','pipe'],timeout:90000});
  const report=JSON.parse(fs.readFileSync(output));paired.runs.push({pair,variant,kind,report});fs.writeFileSync(path.join(folder,'paired.json'),JSON.stringify(paired,null,2));
  console.log(JSON.stringify({pair,variant,kind,status:'PASS'}));
 }
}
paired.status='PASS';fs.writeFileSync(path.join(folder,'paired.json'),JSON.stringify(paired,null,2));
