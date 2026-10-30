// Full compiled baseline/candidate builds, one warm Worker per variant, fresh
// browser/account sessions and restored isolated data before every measured run.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {createProcessPlatformRound5Fixture} from './process-platform-round5-fixture.mjs';
import {runProcessPlatformRound5} from './process-platform-round5-scenario.mjs';

const folder=process.env.PERF_FOLDER||'.sites-runtime/process-platform-round5',rounds=Number(process.env.PERF_ROUNDS||5),smoke=process.env.ROUND5_SMOKE==='1';
const variants=(process.env.PERF_VARIANTS||'baseline,candidate').split(','),builds={baseline:process.env.PERF_BASELINE_BUILD||'/workspace/process-platform-round5-before/dist',candidate:path.resolve(process.env.PERF_CANDIDATE_BUILD||'dist')};
assert(variants.every(v=>Object.hasOwn(builds,v)));assert(Number.isSafeInteger(rounds)&&rounds>0);fs.mkdirSync(folder,{recursive:true});
const sha=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const report={status:'RUNNING',programCommit:process.env.PROCESS_PROGRAM_COMMIT,smoke,measurementUse:process.env.ROUND5_PURPOSE||'paired-performance',conditions:{runtime:'compiled Worker and Chromium; complete server/client build per variant; no API/static mock',lifecycle:'one Worker per variant; reset only its synthetic D1/R2 before each run; prior contexts closed first',network:'loopback without throttling; external blocked',cache:'new contexts; HTTP cache disabled through routing, OS cache retained',viewport:[1365,900],order:'alternating pairs, first baseline; no concurrent timings within this harness',data:'synthetic fixtures only; does not estimate live-site speed'},builds:Object.fromEntries(variants.map(variant=>{const directory=builds[variant];return[variant,{directory,server:sha(path.join(directory,'server/index.js')),html:sha(path.join(directory,'client/process/index.html'))}];})),runs:[]};
let browser;const fixtures=new Map(),file=path.join(folder,'paired.json'),persist=()=>fs.writeFileSync(file,JSON.stringify(report,null,2));
try{
 browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-background-networking']});report.browser=browser.version();
 for(const variant of variants){process.env.PROCESS_TEST_BUILD_DIR=builds[variant];const fixture=await createProcessPlatformRound5Fixture();fixtures.set(variant,fixture);assert.equal(fixture.buildEntrySha256,report.builds[variant].server);report.builds[variant].fixtureHash=fixture.fixtureHash;}
 if(variants.length===2)assert.equal(fixtures.get(variants[0]).fixtureHash,fixtures.get(variants[1]).fixtureHash,'Both versions must receive identical seed data');
 // HTTP GET warms Worker dispatch only. The first measured login still includes
 // its actual session authentication and all required editor data/readiness.
 for(const fixture of fixtures.values()){const response=await fetch(new URL('/login',fixture.url));assert.equal(response.status,200);await response.arrayBuffer();}
 report.warmup=process.env.ROUND5_WARMUP==='1'?'one complete smoke scenario per variant, excluded from measured runs':'GET /login dispatch only; first measured round may include first-use costs';
 if(process.env.ROUND5_WARMUP==='1')for(const variant of variants){const fixture=fixtures.get(variant);await fixture.reset();const warm=await runProcessPlatformRound5({fixture,browser,round:0,variant,folder,smoke:true});assert.equal(warm.status,'PASS','Warmup: '+warm.error);}
 for(let round=1;round<=rounds;round++)for(const variant of round%2?variants:[...variants].reverse()){
  const fixture=fixtures.get(variant);await fixture.reset();const result=await runProcessPlatformRound5({fixture,browser,round,variant,folder,smoke});report.runs.push({round,variant,status:result.status,file:`${variant}-${round}.json`,samples:result.samples,checks:result.checks,errors:result.errors,error:result.error});persist();assert.equal(result.status,'PASS',result.error);
 }
 const groups=new Map();for(const run of report.runs)for(const row of run.samples){const key=run.variant+'\0'+row.name;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row.ms);}
 report.summary=[...groups].map(([key,values])=>{values.sort((a,b)=>a-b);const[variant,name]=key.split('\0'),middle=Math.floor(values.length/2);return{variant,name,n:values.length,medianMs:values.length%2?values[middle]:+( (values[middle-1]+values[middle])/2).toFixed(1),slowestMs:values.at(-1)};});report.imageSummary=[];const imageGroups=new Map();for(const run of report.runs)for(const row of run.samples)if(Number.isFinite(row.actionToImagesReadyMs)){const key=run.variant+'\0'+row.name;if(!imageGroups.has(key))imageGroups.set(key,{sourceAction:row.sourceAction,values:[]});imageGroups.get(key).values.push(row.actionToImagesReadyMs);}for(const [key,group]of imageGroups){const[variant,name]=key.split('\0'),values=group.values.sort((a,b)=>a-b),middle=Math.floor(values.length/2);report.imageSummary.push({variant,name,sourceAction:group.sourceAction,n:values.length,medianMs:values.length%2?values[middle]:+((values[middle-1]+values[middle])/2).toFixed(1),slowestMs:values.at(-1),clock:'related action start through visible image decode/verification complete'});}report.status='PASS';
}catch(error){report.status='FAIL';report.error=error.message;process.exitCode=1;}
finally{await browser?.close();for(const fixture of fixtures.values())await fixture.close();persist();}
