/* Actual publicState + page source authority, synthetic SQLite/R2 only. */
const assert=require('node:assert/strict'),fixture=require('./test-master-page-runtime.cjs');
const copy=value=>JSON.parse(JSON.stringify(value)),results=[];
async function check(name,run){try{await run();results.push({name,status:'PASS'});}catch(error){results.push({name,status:'FAIL',reason:error.message});}}
async function setup(record){const f=await fixture(record),root=copy(f.root),draft=f.load('lib/shared-draft.ts');for(const scope of ['AB.catalog','C.catalog','LINES'])root.workflowScopes[scope]=draft.createSharedDraft('master:'+scope,root.active[scope],'approved-'+scope,'public-page-'+scope);return {f,root};}
(async()=>{
 for(const record of [false,true]){
  const mode=record?'records':'inline';
  await check(mode+' valid owner pointers compose only approved public compatibility content',async()=>{const {f,root}=await setup(record);try{
   await f.install({...f.values,masterDataControl:JSON.stringify(root)});const state=await f.core.readState(),input=JSON.stringify(state.values),metrics=f.metrics(),out=f.core.publicState(state,'writer'),master=JSON.parse(out.values.masterDataControl);
   assert.equal(master.active.AB.lines[0].name,'A');assert.equal(master.active.C.lines[0].name,'C');assert.deepEqual(Object.keys(master.active).sort(),['AB','C','PROCESS']);assert.equal(master.workflowScopes,undefined);assert.equal(master.retainedExtension,undefined);assert.equal(JSON.stringify(state.values),input);assert.deepEqual(f.metrics(),metrics);
  }finally{f.close();}});
  await check(mode+' genuinely absent current flows retain unique-approved baseline compatibility',async()=>{const {f,root}=await setup(record);try{
   for(const scope of ['AB.catalog','C.catalog','LINES'])delete root.workflowScopes[scope];await f.install({...f.values,masterDataControl:JSON.stringify(root)});const state=await f.core.readState(),input=JSON.stringify(state.values),metrics=f.metrics(),master=JSON.parse(f.core.publicState(state,'writer').values.masterDataControl);assert.equal(master.active.AB.lines[0].name,'A');assert.equal(master.active.C.lines[0].name,'C');assert.equal(master.workflowScopes,undefined);assert.equal(JSON.stringify(state.values),input);assert.deepEqual(f.metrics(),metrics);
  }finally{f.close();}});
  for(const kind of ['line-content','line-pointer','c-catalog-content','alternate-approved-topology'])await check(mode+' public projection rejects '+kind+' before omitting private owner proof',async()=>{const {f,root}=await setup(record);try{
   if(kind==='line-content')root.workflowScopes.LINES.active.content.AB.lines[0].name='Unapproved pointer content';
   if(kind==='line-pointer')root.workflowScopes.LINES.active.id='missing-approved-pointer';
   if(kind==='c-catalog-content')root.workflowScopes['C.catalog'].active.content.products.push({id:'not-approved',code:'synthetic'});
   if(kind==='alternate-approved-topology'){root.active.LINES.AB.lines[0].name='Alternate approved source';root.versions.push({...copy(root.versions.find(v=>v.id==='approved-LINES')),id:'approved-alternate-topology',snapshot:copy(root.active.LINES)});}
   await f.install({...f.values,masterDataControl:JSON.stringify(root)});const state=await f.core.readState(),input=JSON.stringify(state.values),metrics=f.metrics();
   const authority=f.load('lib/master-approved-pages.ts'),page=kind==='c-catalog-content'?'C':'AB';assert.throws(()=>authority.approvedMasterPageCatalog(root,page),error=>error.code==='MASTER_EFFECTIVE_BASELINE_CONFLICT'&&error.status===409,'direct approved source guard is the negative control');
   assert.throws(()=>f.core.publicState(state,'writer'),error=>error.code==='MASTER_EFFECTIVE_BASELINE_CONFLICT'&&error.status===409,'public response must not discard an inconsistent pointer then fall back');assert.equal(JSON.stringify(state.values),input);assert.deepEqual(f.metrics(),metrics);
  }finally{f.close();}});
 }
 console.log(JSON.stringify({status:results.every(row=>row.status==='PASS')?'PASS':'FAIL',checks:results,scope:'actual public projection and authority; synthetic inline/records SQLite/R2, no real data'},null,2));if(results.some(row=>row.status==='FAIL'))process.exitCode=1;
})().catch(error=>{console.error(error);process.exitCode=1;});
