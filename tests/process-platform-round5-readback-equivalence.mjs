// Functional diagnostic only. Compare complete persisted authoring JSON through
// old all-module decoding and new selected-module decoding on the same fixture.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {createProcessPlatformRound5Fixture} from './process-platform-round5-fixture.mjs';
import {runProcessPlatformRound5} from './process-platform-round5-scenario.mjs';

const folder=path.resolve(process.env.ROUND5_EQUIVALENCE_FOLDER||'.sites-runtime/process-platform-round5/readback-equivalence');
assert(folder.startsWith(path.resolve('.sites-runtime')+path.sep));fs.mkdirSync(folder,{recursive:true});
process.env.ROUND5_PURPOSE='readback-equivalence-functional-not-speed';
const report={status:'RUNNING',purpose:process.env.ROUND5_PURPOSE,comparisons:[]};
let fixture,browser;
try{
 fixture=await createProcessPlatformRound5Fixture({ipqcItems:1,canvasNodes:5});
 report.buildEntrySha256=fixture.buildEntrySha256;report.fixtureHash=fixture.fixtureHash;
 const read=fixture.readAuthoring.bind(fixture);
 fixture.readAuthoring=async()=>{
  const oldValue=JSON.parse((await fixture.readValues()).processAuthoringControl),selected=await read();
  assert.deepEqual(selected,oldValue,'Selected authoring decode must retain every persisted field and body');
  const serialized=JSON.stringify(selected);
  assert(!serialized.includes('__immutableBody'),'Full authoring read must hydrate all referenced bodies');
  report.comparisons.push({index:report.comparisons.length,revision:selected.workflow.revision,versions:selected.versions.length,saves:selected.workflow.saves.length,cases:selected.workflow.cases.length,caseStatuses:selected.workflow.cases.map(row=>row.status),savedId:selected.workflow.saved?.id||null,pendingId:selected.workflow.pendingId,bytes:Buffer.byteLength(serialized),sha256:createHash('sha256').update(serialized).digest('hex')});
  return selected;
 };
 await fixture.readAuthoring();
 browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-background-networking']});
 const result=await runProcessPlatformRound5({fixture,browser,round:1,variant:'candidate-equivalence',folder,smoke:false});
 report.scenario={status:result.status,boundaries:result.samples.length,checks:result.checks.length,persistedReadbacks:result.checks.filter(row=>Number.isFinite(row.verificationMs)).length,pageErrors:result.errors.length,error:result.error};
 assert.equal(result.status,'PASS',result.error);assert.equal(result.checks.length,18);
 assert.equal(report.scenario.persistedReadbacks,16);assert.equal(report.comparisons.length,17);assert(report.comparisons.some(row=>row.saves>0));assert(report.comparisons.some(row=>row.caseStatuses.includes('approved')));
 report.status='PASS';
}catch(error){report.status='FAIL';report.error=error.message;report.errorStack=error.stack;process.exitCode=1;}
finally{await browser?.close();await fixture?.close();fs.writeFileSync(path.join(folder,'equivalence.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,comparisons:report.comparisons.length,scenario:report.scenario}));}
