import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
const before=execFileSync('git',['show','926b7d4:public/process/master-shared-client.js'],{encoding:'utf8'}),after=fs.readFileSync('public/process/master-shared-client.js','utf8');
const copy=v=>JSON.parse(JSON.stringify(v));
async function sample(source,count,variant){
 const catalog={products:Array.from({length:count},(_,i)=>({id:'p'+i,code:'P'+i,name:'Name '+i,line:'A',category:'G',stages:['A-CUT']})),lines:[{id:'A',code:'A',name:'A',stages:[{id:'cut',code:'A-CUT',name:'Cut'}]}],categoryGroups:[{id:'g',line:'A',name:'G'}]};
 const flow={generation:'fixture',working:copy(catalog)},payload={control:{activeVersionId:'active',versions:[{id:'active',status:'approved',snapshot:copy(catalog)},{id:'draft',status:'draft',snapshot:copy(catalog)}],workflow:flow}},control={active:{},versions:[]};let command,ids=0;
 const host={ProcessSync:{identity:{id:'fixture'}},createSharedDraftClient:()=>({read:async()=>copy(payload),hasUnknown:()=>false,command:async(generation,action,detail)=>{command=copy({generation,action,detail});return copy(payload);}})};
 vm.runInNewContext(source,{window:host,document:{documentElement:{lang:'zh-Hant'},querySelector:()=>null},crypto:{randomUUID:()=>String(++ids)}});
 const bridge=host.createMasterSharedBridge({control});await bridge.load('AB');const next=control.versions.find(v=>v.status==='draft').snapshot;
 next.products.at(-1).name='Edited';
 if(variant==='legacy'){delete next.products[0].id;delete next.lines[0].id;delete next.lines[0].stages[0].id;delete next.categoryGroups[0].id;next.products.push({code:'NEW',name:'New',line:'A',category:'G',stages:['A-CUT']});}
 const start=performance.now();await bridge.execute('AB','apply');return {ms:performance.now()-start,command};
}
const report={status:'PASS',kind:'Node VM actual bridge.execute CPU only; no HTTP/DB/render',samples:[]};
for(const size of [20,2000,6000])for(const variant of ['stable','legacy'])for(let i=0;i<5;i++){
 const a=await sample(before,size,variant),b=await sample(after,size,variant);assert.deepEqual(b.command,a.command);report.samples.push({size,variant,beforeMs:a.ms,afterMs:b.ms});
}
console.log(JSON.stringify(report,null,2));
