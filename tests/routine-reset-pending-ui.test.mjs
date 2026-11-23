import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {webcrypto} from 'node:crypto';
import {canvasDOM} from '../scripts/login-reentry-dom.mjs';
for(const scope of ['fqc','iqc'])for(const loss of [false,true])test(`${scope} pending RESET form and ${loss?'lost':'accepted'} reply settles only through proof/readback`,async()=>{
 const {document}=canvasDOM(),panel=document.createElement('details');panel.className='rf-fqc-administration';panel.open=true;document.body.append(panel);
 const local=new Map([['selected','old-operation-123'],['other-module','keep']]),session=new Map();
 const storage=map=>({getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)}),ls=storage(local),ss=storage(session);
 let evidence,posts=0,reads=0,invalidations=0,reloads=0,proof;
 const c={document,window:{localStorage:ls,ProcessSync:{identity:{id:'frank'}}},sessionStorage:ss,crypto:webcrypto,TextEncoder,Uint8Array,encodeURIComponent,
  fetch:async(url,o={})=>{
   if(o.method==='POST'){
    posts++;const body=JSON.parse(o.body);assert.deepEqual(body.pending,evidence);assert.equal(body.scope,scope);
    proof={id:body.id,scope,actorId:'frank',revision:11,generationRevision:7,settlements:body.pending.map(x=>({...x,status:'superseded-by-reset',priorOutcome:'unknown'}))};
    if(loss)throw Error('reply lost after commit');return Response.json({revision:11});
   }
   if(url.includes('operationId=')){reads++;return Response.json(proof);}
   return Response.json({available:true,actorId:'frank',scope,revision:10,pendingCount:0});
  }};
 vm.runInNewContext(fs.readFileSync('public/process/routine-reset.js','utf8'),c);
 const reset=c.window.RoutineReset,rows=()=>local.has('selected')?[{key:'selected',raw:ls.getItem('selected'),operationId:ls.getItem('selected'),storage:ls}]:[];
 const adapter={capture:async()=>{const result=await reset.markers(rows());evidence=JSON.parse(JSON.stringify(result));return result;},invalidate:()=>invalidations++,settle:receipt=>reset.settle(scope,'frank',receipt,async()=>({identity:{id:'frank'},control:{resetGenerationRevision:7},resetGenerationRevision:7}),rows())};
 const mount=()=>reset.bind(document.body,scope,'frank',(zh,vi)=>scope==='fqc'?zh:vi,()=>true,async()=>{reloads++;},adapter);
 await mount();panel.querySelector('button').click();
 const form=panel.querySelector('form'),[typed,ack]=form.querySelectorAll('input');typed.value='RESET '+scope.toUpperCase();ack.checked=true;form.querySelector('textarea').value='synthetic';form.oninput();
 await Promise.all([form.onsubmit({preventDefault(){}}),form.onsubmit({preventDefault(){}})]);
 if(loss){assert(local.has('selected'));assert.equal(session.size,1);await panel.querySelector('button').click();}
 assert.equal(posts,1);assert(reads>=1);assert.equal(invalidations,1);assert.equal(reloads,1);
 assert(!local.has('selected'));assert.equal(local.get('other-module'),'keep');assert.equal(session.size,0);
 assert(local.has('routine-reset-client-epoch:'+scope+':frank'));
 assert(!local.has('routine-reset-client-epoch:'+(scope==='fqc'?'iqc':'fqc')+':frank'));
});
