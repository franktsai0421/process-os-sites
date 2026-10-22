/* oxlint-disable typescript/no-require-imports -- Local CommonJS fixture command. */
// Explicitly requested ten new exercises, only through the isolated 3040 workflow.
// Default is a read-only preflight. --apply inserts; never resets existing items.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const base='http://127.0.0.1:3040',dir=path.resolve('.wrangler/local-only/routine-fqc-3040'),prefix='rf3040-demo-20261008-';
const recovery=path.join(process.env.TEMP,'fqc-plans-groups-20261008','demo-recovery');
const uuid=()=>crypto.randomUUID(),client=uuid(),apply=process.argv.includes('--apply');
let cookie,flow,seq=0,phase='isolation';
async function get(route){const r=await fetch(base+route,{headers:{cookie}});assert.equal(r.status,200);return r.json();}
async function command(action,extra={}) {
  const operationId=uuid(),body=action==='begin'?{action:'begin'}:{command:{action,operationId,generation:flow.generation,clientId:client,sequence:++seq,expectedRevision:flow.revision,...extra}};
  fs.writeFileSync(path.join(recovery,'pending-command.json'),JSON.stringify(body));
  const r=await fetch(base+'/api/fqc/workflow',{method:'POST',headers:{origin:base,cookie,'content-type':'application/json'},body:JSON.stringify(body)});
  const v=await r.json();if(!r.ok)throw Error(v.error||'WORKFLOW_FAILED');flow=v.control.workflow;
}
(async()=>{
 const isolation=JSON.parse(fs.readFileSync(path.join(dir,'isolation.json')));
 assert.equal(isolation.port,3040);assert.equal(isolation.storageIsolated,true);
 assert.equal(path.resolve(isolation.sourceRoot),process.cwd());assert.equal(path.resolve(isolation.runtimeRoot),path.join(dir,'runtime'));
 assert.ok(path.resolve(isolation.runtimeDb).startsWith(path.join(dir,'runtime')+path.sep));
 phase='login';
 const credentials=JSON.parse(fs.readFileSync(path.join(dir,'test-accounts.json'))).admin;
 const login=await fetch(base+'/api/platform-login',{method:'POST',headers:{origin:base,'content-type':'application/json'},body:JSON.stringify(credentials)});
 assert.equal(login.status,200);const setCookie=login.headers.get('set-cookie');assert.ok(setCookie.startsWith('process_demo_3040='));cookie=setCookie.split(';')[0];
 phase='preflight';flow=(await get('/api/fqc/workflow')).control.workflow;
 const original=structuredClone(flow.active.content),before=await get('/api/routine-fqc');
 const existing=original.items.filter(i=>i.id.startsWith(prefix));
 if(existing.length){assert.equal(existing.length,10);console.log(JSON.stringify({status:'ALREADY_CREATED',newWrites:false,count:10,unassigned:before.control.jobs.filter(j=>j.itemId.startsWith(prefix)&&!j.planId&&!j.completion).length}));return;}
 assert.equal(flow.pendingId,null,'Pending source review must be preserved');
 assert.deepEqual(flow.working,original,'Unrelated working edits must be preserved');
 const sources=original.items.filter(i=>!i.isDeleted&&i.isEnabled&&i.productCodes.length>=2&&(i.line==='A'||i.line==='B'));
 assert.ok(sources.length>=2);assert.ok(before.control.startDate&&before.control.startDate<=before.today);
 if(!apply){console.log(JSON.stringify({status:'READY',port:3040,plannedNewItems:10,pendingReview:false,unrelatedWorkingChanges:false}));return;}
 fs.mkdirSync(recovery,{recursive:true});
 fs.writeFileSync(path.join(recovery,'source-before.json'),JSON.stringify(flow));
 fs.writeFileSync(path.join(recovery,'routine-before.json'),JSON.stringify(before.control));
 phase='begin';await command('begin');assert.deepEqual(flow.working,original);
 const patches=Array.from({length:10},(_,i)=>{
   const candidates=sources.filter(v=>v.line===(i%2?'B':'A')),source=(candidates.length?candidates:sources)[i%(candidates.length||sources.length)];
   return {op:'insert',path:['items'],value:{...source,id:prefix+String(i+1).padStart(2,'0'),name:'[3040 DEMO '+String(i+1).padStart(2,'0')+'] '+source.name,
    description:'3040 DEMO · 未安排演練 / Diễn tập chưa lập kế hoạch. 僅本機隔離測試；請自行選樣、填結果及必要照片。',
    mediaItems:[],equipmentId:null,equipmentSnapshot:null,tool:'Kiểm tra bằng mắt',isEnabled:true,isDeleted:false,
    rule:{cadence:'time',timeFrequency:'monthly'}}};
 });
 phase='insert';await command('apply',{patches,guards:[{path:['items'],value:original.items},{path:['errors'],value:original.errors}]});
 assert.equal(flow.working.items.filter(i=>i.id.startsWith(prefix)).length,10);
 for(const key of ['items','errors'])assert.deepEqual(flow.working[key].filter(i=>!i.id.startsWith(prefix)),original[key]);
 phase='save';await command('save');
 assert.deepEqual(flow.saved.content,flow.working);
 phase='submit';await command('submit',{savedId:flow.saved.id,reason:'使用者明確要求3040增加10個尚未安排的DEMO；只增量插入指定測試標準，保留舊資料。'});
 phase='approve';await command('approve',{caseId:flow.pendingId,selfReviewConfirmed:true,reason:'3040隔離DEMO增量資料自審；已核對原標準保留，未安排計畫或報告。'});
 for(const key of ['items','errors'])assert.deepEqual(flow.active.content[key].filter(i=>!i.id.startsWith(prefix)),original[key]);
 phase='generate';
 const response=await fetch(base+'/api/routine-fqc',{method:'POST',headers:{origin:base,cookie,'content-type':'application/json'},body:JSON.stringify({action:'generate',operationId:uuid(),expectedRevision:before.control.revision})});
 // Generation may have been performed by a visible browser; re-read instead of replaying a stale revision.
 if(!response.ok){const error=await response.json();if(error.error!=='REVISION_CONFLICT')throw Error(error.error||'GENERATE_FAILED');}
 const after=await get('/api/routine-fqc'),jobs=after.control.jobs.filter(j=>j.itemId.startsWith(prefix));
 assert.equal(jobs.length,10);for(const j of jobs){assert.equal(j.planId,null);assert.equal(j.completion,null);assert.ok(!after.control.documents.some(d=>d.flow.working.lines.some(l=>l.jobId===j.id)));}
 for(const key of ['documents','cases'])assert.deepEqual(after.control[key],before.control[key],'Existing '+key+' must be preserved');
 for(const old of before.control.jobs)assert.deepEqual(after.control.jobs.find(j=>j.id===old.id),old);
 const receipt={status:'PASS',port:3040,count:10,unassigned:10,preservedOldSources:true,preservedOldJobs:true,preservedDocuments:true,preservedCases:true,sourceVersionId:flow.active.id,jobs:jobs.map(j=>({id:j.id,itemId:j.itemId,name:j.source.name,line:j.source.line,start:j.start,end:j.end,planId:j.planId,completion:j.completion}))};
 fs.writeFileSync(path.join(dir,'demo-20261008-receipt.json'),JSON.stringify(receipt,null,2));
 fs.writeFileSync(path.join(recovery,'receipt.json'),JSON.stringify(receipt,null,2));
 console.log(JSON.stringify({status:'PASS',port:3040,count:10,unassigned:10,preservedOldSources:true,preservedOldJobs:true,preservedDocuments:true,preservedCases:true}));
})().catch(e=>{console.error('DEMO STOPPED at '+phase+': '+(e.code||(/^[A-Z_]+$/.test(e.message)?e.message:'PRECONDITION_OR_PRESERVATION_CHECK_FAILED')));process.exitCode=1;});
