// Executes both actual tooling UI sources with synthetic ports, not a browser.
// The baseline source must be exported from the reviewed pre-optimization commit.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {canvasDOM} from './login-reentry-dom.mjs';
import {toolingIsolatedSnapshot,toolingIsolatedIqc} from './tooling-isolated-fixture.mjs';
const baselinePath=process.argv[2];
assert(baselinePath,'Pass an exact pre-optimization public/process/tooling.js path');
const sources=[fs.readFileSync(baselinePath,'utf8'),fs.readFileSync('public/process/tooling.js','utf8')];
const hash=value=>createHash('sha256').update(value).digest('hex');
function fixture(source,{counted=false,language='zh'}={}) {
 const dom=canvasDOM();dom.document.documentElement.lang=language;
 const area={innerHTML:'',querySelector:()=>({}),querySelectorAll:()=>[]};
 const host={querySelector:()=>area};
 const metrics={normalizations:0,transferFilterArrays:0,transferFilterElements:0};
 const c={...dom,window:null,console,metrics,setInterval(){},addEventListener(){},testHost:host,Response};c.window=c;
 vm.createContext(c);
 if(counted)vm.runInContext('const originalNormalize=String.prototype.normalize;String.prototype.normalize=function(...args){metrics.normalizations++;return originalNormalize.apply(this,args);};',c);
 const last=source.lastIndexOf('})();');assert(last>0);
 vm.runInContext(source.slice(0,last)+`window.test={currentLocation,picker,paintList,configure(s,next={}){host=window.testHost;control={activeVersionId:'active',versions:[{id:'active',status:'approved',snapshot:s}]};selected='active';page=0;Object.assign(filters,{search:'',category:'',supplier:'',manufacturer:'',archived:false},next);}};`+source.slice(last),c);
 return {c,area,metrics,configure(s,filters){if(counted&&!Object.hasOwn(s.transfers,'filter'))Object.defineProperty(s.transfers,'filter',{value:function(...args){const rows=Array.prototype.filter.apply(this,args);metrics.transferFilterArrays++;metrics.transferFilterElements+=rows.length;return rows;}});c.test.configure(s,filters);},paint(){c.test.paintList();return area.innerHTML;}};
}
const filters=[{}, {search:'khuon'}, {search:'隔離模具 19'}, {search:'DC01-0001'}, {search:'SYN-ASSET-31'}, {search:'ĐƠN vị'}, {search:'undefined'}, {supplier:'SYN-SUP-2'}, {supplier:'missing'}, {category:'SYN-CAT-1',manufacturer:'SYN-MFR'}, {supplier:'SYN-SUP-2',search:'隔離模具 999'}, {archived:true}];
let lists=0,locations=0,liveMutations=0;
for(const count of [36,366,1000])for(const language of ['zh','vi']){
 const s=toolingIsolatedSnapshot(count);s.tools[0].archived=true;s.tools[1].nameZh=null;delete s.tools[2].assetCode;
 const pair=sources.map(source=>fixture(source,{language}));
 for(const filter of filters){for(const f of pair)f.configure(s,filter);assert.equal(pair[1].paint(),pair[0].paint());lists++;}
 // No cached row/holder/transfer view may survive between calls.
 s.transfers.push({id:'new',toolId:s.tools[3].id,to:{kind:'internal',holderId:'SYN-HOLDER-3'}});s.tools[3].nameZh='當次更新';
 for(const f of pair)f.configure(s,{search:'當次更新'});assert.equal(pair[1].paint(),pair[0].paint());liveMutations++;
}
// Deterministic differential correction order / duplicate / missing-holder cases.
for(let seed=0;seed<200;seed++){
 const s=toolingIsolatedSnapshot(6),id=s.tools[seed%6].id;
 if(seed%2)s.tools.unshift({...s.tools[seed%6],location:{kind:'external',holderId:'first-match'}});
 if(seed%3)s.transfers.reverse();if(seed%7===0){const sparse=[];sparse.length=s.transfers.length;for(const [i,tr]of s.transfers.entries())if(i!==1)sparse[i]=tr;s.transfers=sparse;}
 s.transfers.push({id:'dup',toolId:id,to:{kind:'external',holderId:'SYN-SUP-0'}},{id:'dup',toolId:id,to:{kind:'internal',holderId:'SYN-HOLDER-0'}},{id:'orphan',toolId:id,correctionOf:'missing',to:{kind:'external',holderId:'SYN-SUP-1'}},{id:'unknown',toolId:id,to:{kind:'external',holderId:seed%2?null:'unknown'}});
 const pair=sources.map(source=>fixture(source));
 const before=JSON.stringify(s);assert.deepEqual(pair[1].c.test.currentLocation(s,id),pair[0].c.test.currentLocation(s,id));assert.equal(JSON.stringify(s),before);locations++;
 if(seed%5===0){s.transfers.push({id:'broken',toolId:id,to:null});const errors=pair.map(f=>{try{f.c.test.currentLocation(s,id);return 'NO_ERROR';}catch(e){return e.name;}});assert.deepEqual(errors,['TypeError','TypeError']);}
}
// IQC picker uses actual DOM-state code. Count query normalization on each repaint.
const iqc=[];
for(const source of sources){
 const f=fixture(source,{counted:true}),snapshot=toolingIsolatedIqc().versions[0].snapshot;
 snapshot.parts=Array.from({length:1000},(_,i)=>({...snapshot.parts[i%3],id:'P'+i,code:'IQC-'+i,sourceStatus:i%9?'active':'disabled'}));
 f.c.fetch=async()=>Response.json(snapshot);
 const area=f.c.document.createElement('div');f.c.document.body.append(area);
 await f.c.test.picker(area,{iqcIds:[]},()=>{});
 const outputs=[],counts=[];
 for(const q of ['', '隔離', 'san pham', 'IQC-999', 'unknown']){f.metrics.normalizations=0;area.querySelector('[data-iqc-search]').oninput({target:{value:q}});outputs.push(area.querySelector('[data-iqc-results]').innerHTML);counts.push(f.metrics.normalizations);}
 iqc.push({outputs,counts});
}
assert.deepEqual(iqc[1].outputs,iqc[0].outputs);
const samples=[];
for(const count of [366,1000])for(const supplier of ['', 'SYN-SUP-2']){
 const results=sources.map(source=>{
  const counted=fixture(source,{counted:true});counted.configure(toolingIsolatedSnapshot(count),{search:'隔離',supplier});counted.paint();
  return {metrics:counted.metrics,milliseconds:[]};
 });
 const pair=sources.map(source=>fixture(source));for(const f of pair)f.configure(toolingIsolatedSnapshot(count),{search:'隔離',supplier});
 for(let warm=0;warm<3;warm++)for(const f of pair)f.paint();
 for(let round=0;round<9;round++)for(const index of round%2?[1,0]:[0,1]){const start=performance.now();pair[index].paint();results[index].milliseconds.push(+(performance.now()-start).toFixed(3));}
 for(let i=0;i<2;i++){results[i].medianMs=[...results[i].milliseconds].sort((a,b)=>a-b)[4];results[i].htmlHash=hash(pair[i].area.innerHTML);}
 assert.equal(results[0].htmlHash,results[1].htmlHash);samples.push({count,supplier,baseline:results[0],candidate:results[1]});
}
console.log(JSON.stringify({sourceHashes:sources.map(hash),status:'PASS',lists,locations,liveMutations,iqc:{filters:5,baselineNormalize:iqc[0].counts,candidateNormalize:iqc[1].counts},samples,limits:'Synthetic actual UI function/DOM-state code, no browser, no server speed or Worker memory inference. Timing is uninstrumented local CPU; counters use a separate fixture. No persistent indexes/caches.'},null,2));
