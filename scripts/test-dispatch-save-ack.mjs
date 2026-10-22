import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
const src=fs.readFileSync('public/process/version-workflow.js','utf8'),start=src.indexOf('button.onclick=async()=>{const card=button.closest("[data-dispatch-line]")'),end=src.indexOf('});document.querySelector("#dispatch-preview-line")',start);
assert(start>0&&end>start);
const handler=src.slice(start,end+1),events=[],board={B:[]};
let resolve,mode='wait';
const context={dispatchBoard:board,dispatchReadiness:()=>({ok:true,errors:[]}),persistPlatform:()=>events.push('persist'),toast:x=>events.push(x),render:()=>events.push('render'),window:{ProcessSync:{flush:()=>mode==='throw'?Promise.reject(Error('offline')):new Promise(r=>{resolve=r}),saveFailureMessage:()=> 'QA_SAVE_FAILED'}}};
vm.createContext(context);
vm.runInContext('this.bind=button=>{'+handler+';};',context);
const button={dataset:{line:'B'},disabled:false,closest:()=>({querySelectorAll:()=>[{value:'QA-P'}]})};
context.bind(button);

(async()=>{let pending=button.onclick();assert.equal(button.disabled,true);assert.deepEqual(events,['persist']);resolve(false);await pending;assert.deepEqual(events,['persist','QA_SAVE_FAILED']);assert.equal(button.disabled,false);assert.equal(JSON.stringify(board.B),JSON.stringify(['QA-P']));console.log('PASS failed save retains selection, shows failure, no success/render');events.length=0;pending=button.onclick();assert.equal(button.disabled,true);assert(!events.includes('render'));resolve(true);await pending;assert(events.some(x=>x.includes('線已發送')));assert.equal(events.at(-1),'render');assert.equal(button.disabled,false);console.log('PASS success/render waits for server acknowledgement; button guarded during save');events.length=0;mode='throw';await button.onclick();assert.deepEqual(events,['persist','QA_SAVE_FAILED']);assert.equal(button.disabled,false);console.log('PASS thrown save restores button and reports failure');})().catch(e=>{console.error(e);process.exitCode=1;});