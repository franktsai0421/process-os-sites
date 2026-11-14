import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const source=fs.readFileSync('public/process/shared-draft-client.js','utf8'),begin=source.indexOf('  const progressMounts='),end=source.indexOf('  window.createSharedDraftClient',begin);
for(const language of ['zh','vi'])void test('IPQC '+language+' progress is text-only, live and remountable without form redraw or network',()=>{
 let node,progress=[],listener,subscriptions=0;
 const root={isConnected:true,querySelector:()=>node,prepend(value){node=value;},set innerHTML(_){assert.fail('must not redraw form');}};
 const document={createElement(){return{isConnected:true,dataset:{},setAttribute(){},remove(){this.isConnected=false;}};}};
 const client={requestProgress:()=>progress,watchRequestProgress(callback){listener=callback;subscriptions++;return()=>subscriptions--;}};
 const box={window:{},document,fetch:()=>assert.fail('progress must never issue network requests')};vm.runInNewContext(source.slice(begin,end),box);
 box.window.mountSharedDraftRequestProgress(root,[client,client],language);assert.equal(subscriptions,1);assert.equal(node.hidden,true);
 progress=[{elapsedMs:45000,kind:'write'}];listener();assert.equal(node.hidden,false);assert.match(node.textContent,/45/);assert.match(node.textContent,language==='vi'?/Chưa xác nhận lưu/:/尚未確認儲存/);
 const old=node;box.window.mountSharedDraftRequestProgress(root,[client],language);assert.equal(subscriptions,1);assert.equal(old.isConnected,false);assert.equal(node.hidden,false);
 progress=[];listener();assert.equal(node.hidden,true);assert.equal(node.textContent,'');
});
