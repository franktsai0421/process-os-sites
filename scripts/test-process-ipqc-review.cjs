/* oxlint-disable typescript/no-require-imports -- isolated handler/performance fixtures. */
const assert=require('node:assert/strict'),fixture=require('./ipqc-assignment-fixture.cjs');
(async()=>{const f=await fixture(process.argv[2]);try{
 const m=f.metadata,query=new URLSearchParams({mode:'choices',line:'C',category:m.cCategory,stage:m.cStage,product:m.cProduct});
 const selected=(await f.request('/api/process-ipqc?'+query)).body.choices.find(i=>i.itemId===m.cItemId);
 const assignment=(({source,scope,itemId,sourceVersionId,productCodes})=>({source,scope,itemId,sourceVersionId,productCodes}))(selected);
 const control=JSON.parse(f.values.processAuthoringControl),active=control.versions[0];
 const assign=content=>{content.workspaces.find(w=>w.id===m.cWorkspace).stages[m.cStage][0].ipqcAssignments=[assignment];};
 assign(active.snapshot);assign(control.workflow.working);
 const get=f.env.STATE_ARCHIVE.get.bind(f.env.STATE_ARCHIVE);let reads=[];
 f.env.STATE_ARCHIVE.get=async key=>{reads.push(key);return get(key);};
 const encode=f.load('lib/state-records.ts').encodeRecordValues;
 async function install(count,adopted=true){const c=structuredClone(control);if(!adopted)delete c.workflow;
  for(let i=0;i<count;i++){const v=structuredClone(active);v.id='isolated-history-'+i;v.number=i+10;v.status='superseded';v.snapshot.workspaces[0].category+='-history-'+i;c.versions.push(v);}
  const raw=await encode(f.env.STATE_ARCHIVE,{...f.values,processAuthoringControl:JSON.stringify(c)});f.db.prepare('UPDATE shared_state SET "values"=?,revision=revision+1 WHERE id=1').run(raw);
  const manifest=JSON.parse(raw).__processRecords,record=JSON.parse(await(await get(manifest.values.processAuthoringControl.key)).text());
  return{processKey:manifest.values.processAuthoringControl.key,historyKeys:new Set(record.versions.filter(v=>v.status==='superseded').map(v=>v.snapshot.__immutableBody.key))};
 }
 async function measured(url,user='a'){reads=[];const result=await f.request(url,'GET',undefined,user);return{...result,reads:[...reads]};}
 const small=await install(2);let daily=await measured('/api/process-ipqc?mode=references');assert.equal(daily.status,200);const smallReads=daily.reads.length;assert.ok(daily.body.references.some(r=>r.status==='working'));assert.ok(daily.body.references.some(r=>r.status==='approved'));assert.ok(!daily.reads.some(k=>small.historyKeys.has(k)));
 const large=await install(102);daily=await measured('/api/process-ipqc?mode=references');assert.equal(daily.reads.length,smallReads);assert.ok(!daily.reads.some(k=>large.historyKeys.has(k)));assert.ok(!daily.body.references.some(r=>r.status==='superseded'));
 const unchanged=await measured('/api/process-ipqc?mode=references&revision='+daily.body.revision);assert.equal(unchanged.body.unchanged,true);assert.equal(unchanged.body.references,undefined);assert.ok(!unchanged.reads.includes(large.processKey));assert.ok(!unchanged.reads.some(k=>large.historyKeys.has(k)));
 const page=await measured('/api/process-ipqc?mode=history&offset=0&limit=3');assert.equal(page.status,200);assert.equal(page.body.nextOffset,3);assert.equal(page.reads.filter(k=>large.historyKeys.has(k)).length,3);assert.equal(new Set(page.body.references.map(r=>r.versionId)).size,3);
 const next=await measured('/api/process-ipqc?mode=history&offset=3&limit=3');assert.equal(next.reads.filter(k=>large.historyKeys.has(k)).length,3);assert.ok(next.body.references.every(r=>!page.body.references.some(p=>p.versionId===r.versionId)));
 assert.equal((await measured('/api/process-ipqc?mode=history&limit=21')).status,400);assert.equal((await measured('/api/process-ipqc?mode=history&offset=-1')).status,400);assert.equal((await measured('/api/process-ipqc?mode=history&revision=0')).status,409);assert.equal((await measured('/api/process-ipqc?mode=history','viewer')).status,403);
 const noLogin=await f.api('/api/process-ipqc').GET(new Request('http://127.0.0.1/api/process-ipqc?revision='+daily.body.revision));assert.equal(noLogin.status,401);
 const noWorkflow=await install(102,false),legacy=await measured('/api/process-ipqc?mode=references');assert.equal(legacy.status,200);assert.ok(!legacy.reads.some(k=>noWorkflow.historyKeys.has(k)));
 // The early revision path must re-check a freshly revoked permission.
 const revoked={...f.values,platformUsers:JSON.stringify(JSON.parse(f.values.platformUsers).map(u=>u.id==='a'?{...u,views:[],permissions:[]}:u))};
 f.db.prepare('UPDATE shared_state SET "values"=? WHERE id=1').run(JSON.stringify(revoked));assert.equal((await measured('/api/process-ipqc?revision='+legacy.body.revision)).status,403);
 console.log(JSON.stringify({result:'PASS_IPQC_REVIEW_BACKEND',syntheticHistoryOnly:true,realLocalWrites:0,measurements:{historicalVersions:[2,102],dailyR2Reads:[smallReads,daily.reads.length],unchangedR2Reads:unchanged.reads.length,unchangedProcessBodyReads:0,historyPageBodyReads:3},steps:['Daily current references exclude history; R2 read count constant as history grows','Revision unchanged returns no references and reads no process model/snapshots','Explicit history pages bounded, disjoint; invalid limits and stale revision rejected','History/view/identity permissions enforced before lightweight response','Unadopted record snapshots also stay deferred'],limitations:['Real AB positive assignment/references NOT TESTED; no approvals of AB data']},null,2));
 }finally{f.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
