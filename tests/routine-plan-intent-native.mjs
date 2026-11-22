// Real HTTP route dispatch to compiled application on disposable local D1/R2.
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {createRootEntryFixture} from './root-entry-native-fixture.mjs';
import {seedRoutineCalendarFixture} from './routine-fqc-calendar-browser.mjs';
const secret=randomBytes(32).toString('hex');
const fixture=await createRootEntryFixture({syntheticBindings:{PROCESS_IMPORT_ENABLED:'0',PROCESS_SESSION_SECRET:secret}});
try{
 const {cookie,today}=await seedRoutineCalendarFixture(fixture,secret);
 async function request(path,body,actor='frank',expected=200,claimed=actor){
   const response=await fixture.mf.dispatchFetch(new URL(path,fixture.url).href,{method:body?'POST':'GET',
     headers:{cookie:'process_demo='+cookie(actor),origin:fixture.url.origin,'content-type':'application/json','X-Process-Expected-Actor':claimed},
     ...(body?{body:JSON.stringify(body)}:{})});
   const value=await response.json();assert.equal(response.status,expected,JSON.stringify([path,body?.action,value.error]));
   return value;
 }
 for(const lane of ['fqc','iqc']){
   const endpoint='/api/routine-'+lane;
   const read=async()=>{const value=await request(endpoint);return value.control||value;};
   const initial=await read();
   const config=lane==='fqc'?{calendarVersion:2,startDate:today}:{scope:'routine-iqc-only',confirm:'START IQC',reason:'Synthetic test',start:today,startAck:true,expectedStateRevision:initial.stateRevision};
   await request(endpoint,{action:'configure',operationId:randomUUID(),expectedRevision:initial.revision,...config});
   if(lane==='fqc')await request(endpoint,{action:'generate',operationId:randomUUID(),expectedRevision:(await read()).revision});
   const state=await read();
   for(const winner of ['retired','committed']){
     const id='plan-'+lane+'-'+randomUUID(),url='/api/routine-plan-intent?scope='+lane+'&id='+id;
     const command={action:'create-plan',operationId:id,expectedRevision:state.revision,jobIds:[state.jobs[0].id],
       ...(lane==='fqc'?{startDate:today,endDate:today}:{start:today,end:today})};
     const reg={action:'register',command};
     const stop={action:'retire',confirm:'RETIRE '+lane.toUpperCase()+' PLAN',expectedRevision:state.revision};
     await request(url,reg,'routine-reader',403);await request(url,reg,'frank',403,'routine-reviewer');
     assert.equal((await request(url,reg)).status,'registered');
     await request(url,stop,'routine-reviewer',404);
     if(winner==='committed')await request(endpoint,command);
     assert.equal((await request(url,stop)).status,winner);
     assert.equal((await request(url)).status,winner);
     await request(endpoint,command,'frank',winner==='retired'?409:200);
     const proof=await request(endpoint+'?operationId='+id,null,'frank',winner==='retired'?404:200);
     const after=await read();assert.equal(after.documents.length,winner==='committed'?1:0);
     if(winner==='committed')assert.equal(after.documents[0].id,proof.result.documentId);
   }
   console.log(lane+' verified registration, retirement, successful receipt and fresh readback');
 }
}finally{await fixture.close();}
