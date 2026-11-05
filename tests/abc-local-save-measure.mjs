// Identical synthetic inline/records handler workload, no hosted timing claim.
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';
import {fixture,sourceRoot,productPath} from './master-ab-auth-phase-fixture.mjs';
const mode=process.env.ABC_SAVE_MODE||'atomic',samples=[];
for(const scope of ['AB','C'])for(const inline of [true,false])for(let run=0;run<5;run++){
 const f=await fixture({scope,inline});try{const batches=Array.from({length:10},(_,i)=>({patches:[{op:'set',path:productPath,value:'Synthetic '+i}],guards:[{path:productPath,value:i?'Synthetic '+(i-1):'Synthetic product'}]}));f.reset();let posts=0;const start=performance.now();
 if(mode==='legacy')for(const batch of batches){const r=await f.request('POST',f.command('apply',batch));posts++;assert.equal(r.status,200,JSON.stringify(r.body));}
 const result=await f.request('POST',f.command('save',mode==='legacy'?{}:{moduleAction:'save-local-v1',patches:batches.flatMap(b=>b.patches),input:{batches}}));posts++;assert.equal(result.status,200,JSON.stringify(result.body));assert.equal(result.body.control.workflow.saved.content.products[0].name,'Synthetic 9');
 samples.push({scope,format:inline?'inline':'records-v1',run,ms:performance.now()-start,httpPOST:posts,httpGET:0,CAS:f.stats.cas,sql:f.stats.sql});
 }finally{f.close();}
}
const summaries=[];for(const scope of ['AB','C'])for(const format of ['inline','records-v1']){const values=samples.filter(s=>s.scope===scope&&s.format===format).map(s=>s.ms).sort((a,b)=>a-b);summaries.push({scope,format,medianMs:values[2],httpPOST:mode==='legacy'?11:1,CAS:mode==='legacy'?11:1});}
console.log(JSON.stringify({status:'PASS',mode,sourceCommit:process.env.ABC_MEASURE_SOURCE_COMMIT,sourceSha256:createHash('sha256').update(fs.readFileSync(path.join(sourceRoot,'lib/master-workflow.ts'))).digest('hex'),environment:'Node24 actual handlers / synthetic in-memory SQLite+R2 / fresh five samples per scope and format',workload:'10 guarded ordered name edits + Save; existing open draft; no Begin, browser or Site timing',summaries,samples},null,2));
