// Same synthetic handler fixture, no hosted data or latency claim.
import assert from 'node:assert/strict';import {fixture,sourceRoot} from './master-ab-auth-phase-fixture.mjs';
const mode=process.env.PROCESS_SAVE_BENCH_MODE||'candidate',runs=[];
for(let i=0;i<6;i++){
 const f=await fixture({scope:'PROCESS'}),row=f.flow.working['A-CUT'][1],p=['A-CUT',{id:row.id},'name'];
 const changes=['First synthetic','Second synthetic','Final synthetic'].map((value,index,all)=>({patches:[{op:'set',path:p,value}],guards:[{path:p,value:index?all[index-1]:row.name}]}));
 f.reset();let posts=0,last;const at=performance.now();
 if(mode==='baseline'){for(const batch of changes){last=await f.request('POST',f.command('apply',batch));posts++;assert.equal(last.status,200);}last=await f.request('POST',f.command('save'));posts++;}
 else{last=await f.request('POST',f.command('save',{moduleAction:'save-local-v1',patches:changes.flatMap(b=>b.patches),input:{batches:changes}}));posts++;}
 const elapsedMs=performance.now()-at;assert.equal(last.status,200,JSON.stringify(last.body));assert.equal(last.body.control.workflow.saved.content['A-CUT'][1].name,'Final synthetic');assert.deepEqual(last.body.control.workflow.saved.content,last.body.control.workflow.working);runs.push({warmup:i===0,posts,cas:f.stats.cas,elapsedMs,sql:f.stats.sql,r2Get:f.stats.get,r2Put:f.stats.put});f.close();
}
console.log(JSON.stringify({mode,sourceRoot,fixture:'one stage / five existing presets / signed synthetic actor / memory SQLite + Map R2 / three explicit name completions then Save',environment:'isolated actual Request handlers; no artificial network delay',runs,medianMs:runs.slice(1).map(r=>r.elapsedMs).sort((a,b)=>a-b)[2],notMeasured:['live network','real dataset','native browser rendering']}));
