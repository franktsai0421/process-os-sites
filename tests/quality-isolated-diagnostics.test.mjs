// Actual production routes on private SQLite/Map R2 and normal synthetic logins.
// Timings include fixture command pre-read and JSON handling, not UI/network/live latency.
import assert from 'node:assert/strict';
import {after,test} from 'node:test';
import {createRequire} from 'node:module';
import {performance} from 'node:perf_hooks';
const require=createRequire(import.meta.url);
const {createTransferFixture}=require('../scripts/equipment-transfer-fixture.cjs');
const reports=[];
after(()=>console.log(JSON.stringify({status:reports.length===2?'PASS_ISOLATED_QUALITY_DIAGNOSTICS':'FAIL_ISOLATED_QUALITY_DIAGNOSTICS',execution:'routeVM-private-SQLite-Map-R2',realData:false,realAccounts:false,externalNetwork:false,timingBoundary:'Fixture pre-read plus handler and JSON; not browser/network/live latency, no improvement claim',reports})));
for(const moduleId of ['fqc','iqc'])void test(`${moduleId}: measured isolated reads/Apply/Save, explicit outage and read-only recovery`,async t=>{
  const h=await createTransferFixture();t.after(()=>h.close());
  const report={moduleId,samples:[],readFailure:null,iqcMissing:null};
  async function measured(action,run){
    const start=h.trace.length,at=performance.now(),result=await run();
    const requests=h.trace.slice(start);
    assert.ok(requests.every(row=>row.status===200));
    assert.equal(requests.length,action==='read'?1:2,'exact normal fixture request budget');
    assert.equal(requests.filter(row=>row.method==='POST').length,action==='read'?0:1);
    assert.ok(requests.every(row=>row.endpoint===moduleId+'/workflow'),'measurement stays in its own module');
    report.samples.push({action,syntheticInProcessMs:performance.now()-at,requests:requests.length,posts:requests.filter(row=>row.method==='POST').length});
    return result;
  }
  await h.begin(moduleId);
  for(let cycle=1;cycle<=5;cycle++){
    const body=await measured('read',()=>h.read(moduleId)),flow=h.flow(body),row=flow.working.items[0];
    const field=moduleId==='fqc'?'description':'nameVi',patchPath=['items',{id:row.id},field];
    await measured('apply',()=>h.command(moduleId,'apply',{patches:[{op:'set',path:patchPath,value:`Synthetic diagnostic ${moduleId} ${cycle}`}],guards:[{path:patchPath,value:row[field]}]}));
    const saved=h.flow(await measured('save',()=>h.command(moduleId,'save')));
    assert.equal(saved.saved.content.items[0][field],`Synthetic diagnostic ${moduleId} ${cycle}`);
    assert.equal(saved.pendingId,null,'diagnostic Save does not Submit');
  }
  const before=h.snapshot();
  let touches=0;const outage=t.mock.method(h.env.STATE_ARCHIVE,'get',async()=>{touches++;throw Error('SYNTHETIC_PRIVATE_STORAGE_OUTAGE');});
  try{
    const failed=await h.call(moduleId+'/workflow','GET',undefined,'editor',503,'?caseMetadata=1');
    assert.equal(failed.error,'WORKFLOW_LOAD_FAILED');
    assert.ok(!JSON.stringify(failed).includes('SYNTHETIC_PRIVATE_STORAGE_OUTAGE'));
    assert.ok(touches>0);assert.deepEqual(h.snapshot(),before,'failed read publishes no data or receipt');
    report.readFailure={httpStatus:503,error:failed.error,unchanged:true};
  }finally{outage.mock.restore();}
  const first=h.trace.length;await h.read(moduleId);
  assert.deepEqual(h.snapshot(),before);
  assert.equal(h.trace.slice(first).filter(row=>row.method!=='GET').length,0,'recovery is an explicit read, never a business resend');
  if(moduleId==='iqc'){
    const initial=await h.read('iqc'),flow=h.flow(initial),row=flow.working.items[0],patchPath=['items',{id:row.id},'nameVi'];
    const oldCount=initial.control.draftContentIssues.issues.length;
    await h.command('iqc','apply',{patches:[{op:'set',path:patchPath,value:''}],guards:[{path:patchPath,value:row.nameVi}]});
    const missing=(await h.read('iqc')).control.draftContentIssues.issues;
    assert.equal(missing.length,oldCount+1);
    assert.ok(missing.some(issue=>issue.kind==='missing'&&JSON.stringify(issue.path)===JSON.stringify(patchPath)));
    await h.command('iqc','apply',{patches:[{op:'set',path:patchPath,value:row.nameVi}],guards:[{path:patchPath,value:''}]});
    assert.equal((await h.read('iqc')).control.draftContentIssues.issues.length,oldCount);
    report.iqcMissing={source:'synthetic-only',baseline:oldCount,oneBlankName:missing.length,restored:oldCount};
  }
  // Reproduce a bounded write-side 500; retain its original operation ID and
  // only inspect that receipt afterwards. No unknown Save is retried.
  const current=await h.read(moduleId),flow=h.flow(current),item=flow.working.items[0],field=moduleId==='fqc'?'description':'nameVi';
  const patchPath=['items',{id:item.id},field];
  await h.command(moduleId,'apply',{patches:[{op:'set',path:patchPath,value:'Synthetic unsaved write-outage input'}],guards:[{path:patchPath,value:item[field]}]});
  const dirty=await h.read(moduleId),dirtyFlow=h.flow(dirty),operationId=crypto.randomUUID();
  const command={operationId,clientId:'synthetic-isolated-write-outage',sequence:1,generation:dirtyFlow.generation,expectedRevision:dirtyFlow.revision,action:'save',input:{stateRevision:dirty.revision}};
  const uncommitted=h.snapshot(),writeOutage=t.mock.method(h.env.STATE_ARCHIVE,'put',async()=>{throw Error('SYNTHETIC_PRIVATE_WRITE_OUTAGE');});
  try{
    const failed=await h.call(moduleId+'/workflow','POST',{command},'editor',500,'?caseMetadata=1');
    assert.equal(failed.error,'WORKFLOW_WRITE_FAILED');
    assert.ok(!JSON.stringify(failed).includes('SYNTHETIC_PRIVATE_WRITE_OUTAGE'));
    assert.deepEqual(h.snapshot(),uncommitted,'write failure publishes no changed state, objects or receipt');
  }finally{writeOutage.mock.restore();}
  const recoveryStart=h.trace.length;
  const receipt=await h.call(moduleId+'/workflow','GET',undefined,'editor',404,'?caseMetadata=1&operationId='+operationId);
  assert.equal(receipt.error,'OPERATION_NOT_FOUND');assert.deepEqual(h.snapshot(),uncommitted);
  assert.equal(h.trace.slice(recoveryStart).filter(row=>row.method!=='GET').length,0,'unknown recovery never resends the original Save');
  report.writeFailure={source:'injected-synthetic-storage-fault',httpStatus:500,error:'WORKFLOW_WRITE_FAILED',receiptStatus:404,automaticResends:0,unchanged:true};
  for(const action of ['read','apply','save']){
    const rows=report.samples.filter(row=>row.action===action),times=rows.map(row=>row.syntheticInProcessMs).sort((a,b)=>a-b);
    assert.equal(rows.length,5);assert.ok(rows.every(row=>Number.isFinite(row.syntheticInProcessMs)&&row.syntheticInProcessMs>=0));
    report[action]={samples:rows.length,medianMs:times[2],maxMs:times.at(-1),requests:rows.map(row=>row.requests),posts:rows.map(row=>row.posts)};
  }
  delete report.samples;reports.push(report);
});
