// Production shared client + synthetic DOM/storage/fetch only. No real API,
// SQLite, file mutation, fixed Git reflection or historical source substitution.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{fixture}=require('../scripts/test-fqc-feedback-races.cjs');
const tick=()=>new Promise(setImmediate);
for(const scope of ['fqc','iqc'])for(const trigger of [1,2,3,4])for(const drift of ['identity','epoch'])void test(`${scope} callback ${trigger} returning true after ${drift} cannot dispatch Save`,async()=>{
  const f=await fixture(),posts=[];
  const content=structuredClone(f.library);content.workflow.scope=scope;
  const permissions={view:true,edit:true,create:true,save:true,submit:true,withdraw:true,approve:true,return:true,history:true,delete:true,restore:true};
  f.c.fetch=async(url,options={})=>{
    if(options.method==='POST'){posts.push({url,body:options.body});return new Promise(()=>{});}
    return Response.json({revision:1,control:structuredClone(content),permissions});
  };
  const client=f.c.createSharedDraftClient({endpoint:`/api/${scope}/workflow?caseMetadata=1`,actorId:f.c.ProcessSync.identity.id,headers:()=>f.c.ProcessSync.platformHeaders(),durableBegin:true,guardAccessResults:true,externalDurableBounded:{scope:scope.toUpperCase()},[scope+'ComparedSave']:true});
  let armed=false,callbacks=0,retired=false;
  const options={isCurrent:()=>{
    if(armed&&++callbacks===trigger){retired=true;if(drift==='identity')f.c.ProcessSync.identity={...f.c.ProcessSync.identity};else{const before=f.c.ProcessSync.identityGeneration();f.c.ProcessSync.identityGeneration=()=>before+1;}}
    return true;
  }};
  const token=await client.compareForSave(options),details={moduleAction:'save-local-v1',patches:[],guards:[],...(scope==='fqc'?{input:{matrixCells:[]}}:{})},command=client.prepareComparedSave(token,details,options);
  // Header preparation runs immediately before final dispatch guards. This arms
  // only their caller-predicate window, including its last invocation.
  f.c.ProcessSync.platformHeaders=()=>{armed=true;return {};};
  let rejected;void client.sendPrepared(command).catch(error=>{rejected=error;});
  await tick();await tick();
  assert.equal(retired,true,'exercise the requested synchronous owner drift');
  assert.equal(posts.length,0,'a callback cannot retain old Save consent by returning true');
  assert.match(rejected?.message||'',/COMPARISON_RETIRED|OWNER_CHANGED|ACCOUNT_CHANGED/);
});
