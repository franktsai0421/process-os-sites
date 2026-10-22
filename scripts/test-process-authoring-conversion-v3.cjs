const isolatedTestTarget_20261010=require('./require-isolated-test-target.cjs')();
/* oxlint-disable typescript/no-require-imports -- read-only Local copy, isolated conversion/rollback. */
const assert=require('node:assert/strict'),{createHash}=require('node:crypto'),load=require('./ipqc-ab-import-harness.cjs')({});
const {prepareProcessAuthoringConversion:prepare}=load('lib/process-authoring-conversion.ts'),sha=v=>createHash('sha256').update(v).digest('hex');
(async()=>{
 const base=isolatedTestTarget_20261010,login=await fetch(base+'/api/platform-login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({demoRole:'admin'})});assert.equal(login.status,200);
 const headers={Cookie:login.headers.get('set-cookie').split(';')[0]},read=async()=>{const r=await fetch(base+'/api/shared-state',{headers});assert.equal(r.status,200);return r.json();};
 const before=await read(),plan=await prepare(before.values,before.revision);for(const [key,value]of Object.entries(plan.recoveryValues))assert.equal(value,before.values[key]);
 assert.equal(plan.preservedSavedDrafts.length,plan.legacyDraftsPreserved);
 const sample={approvalVersions:JSON.stringify([{id:'formal',category:'G',line:'A',status:'approved',stages:{'A-CUT':[{id:'a',name:'saved',x:0}] }},{id:'draft',category:'G',line:'A',status:'draft',stages:{'A-CUT':[{id:'a',name:'saved',x:1}]}}]),'processEditor:G:A':JSON.stringify({stages:{'A-CUT':[{id:'a',name:'saved',x:2},{id:'b',name:'new'}]}})};
 const compatible=await prepare(sample,1);assert.equal(compatible.ready,true);assert.equal(compatible.workflow.saved,null);assert.equal(compatible.workflow.working.workspaces[0].stages['A-CUT'].length,2);assert.equal(compatible.preservedSavedDrafts[0].stages['A-CUT'].length,1);
 const conflict=await prepare({...sample,'processEditor:G:A':JSON.stringify({stages:{'A-CUT':[{id:'a',name:'different',x:2}]}})},1);assert.equal(conflict.ready,false);
 // Exercise deterministic choices only on an isolated copy; this is NOT a
 // recommended selection for real conflicting user content.
 const resolutions={};for(const c of plan.conflicts){if(c.kind==='PENDING_CASE_REQUIRES_COMPLETION')continue;(resolutions[c.scope]||={})[c.kind==='MULTIPLE_EFFECTIVE_CONTENTS'?'active':'working']=c.choices[0].id;}
 const isolated=await prepare(before.values,before.revision,resolutions);assert.ok(isolated.ready);assert.equal(isolated.workflow.scope,'process:platform');assert.equal(isolated.workflow.saved,null);assert.equal(isolated.workflow.cases.length,0);
 for(const entry of isolated.inventory){if(!entry.workingSource)continue;const workspace=isolated.workflow.working.workspaces.find(w=>w.id===entry.scope);assert.ok(workspace);}
 const reopened=JSON.parse(JSON.stringify(isolated));for(const [key,value]of Object.entries(reopened.recoveryValues))assert.equal(sha(value),plan.sourceHashes[key]);
 const pending=JSON.parse(before.values.approvalVersions);pending[0].status='pending';const blocked=await prepare({...before.values,approvalVersions:JSON.stringify(pending)},before.revision);assert.ok(blocked.conflicts.some(c=>c.kind==='PENDING_CASE_REQUIRES_COMPLETION'));assert.equal(blocked.workflow,null);
 const after=await read();for(const [key,hash]of Object.entries(plan.sourceHashes))assert.equal(sha(after.values[key]),hash);
 console.log(JSON.stringify({result:'PASS_PREPARATION_ONLY',realLocalWrites:0,localUnchanged:true,sourceRevision:plan.sourceRevision,sourceDigest:plan.sourceDigest,legacyVersions:plan.legacyVersionsPreserved,legacyDrafts:plan.legacyDraftsPreserved,inventory:plan.inventory,contentComparisons:plan.contentComparisons,conflicts:plan.conflicts,readyWithoutContentDecisions:plan.ready,isolatedExplicitChoices:{globalDrafts:1,workspaces:isolated.workflow.working.workspaces.length,saved:false,historicalCasesRewritten:0,byteExactRollback:true},notCompleted:['authorization to apply to Local']},null,2));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
