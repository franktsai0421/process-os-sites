import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {screenshotBoard,screenshotFailureKind,failedBoardGeometry} from './web-feedback-screenshot.mjs';
void test('detached screenshot re-resolves exactly once without replaying any interaction',async()=>{
 let resolves=0,calls=0;const page={locator(selector){assert.equal(selector,'.wf-admin');resolves++;return{screenshot:async({path})=>{assert.equal(path,'synthetic.png');if(++calls===1)throw Error('Element is not attached to the DOM');}};}};
 await screenshotBoard(page,'synthetic.png');assert.equal(resolves,2);assert.equal(calls,2);
});
void test('persistent detach remains a failure after one retry',async()=>{
 let calls=0;const failure=Error('Element is not attached to the DOM');await assert.rejects(screenshotBoard({locator:()=>({screenshot:async()=>{calls++;throw failure;}})},'x'),error=>error===failure);assert.equal(calls,2);
});
void test('non-detach errors are never retried or exposed in classifications',async()=>{
 for(const [message,kind]of [['Timeout 15000ms exceeded','TIMEOUT'],['strict mode violation','NON_UNIQUE_TARGET'],['Element is not visible','INVISIBLE_TARGET'],['Page.captureScreenshot: failed','SCREENSHOT_ERROR'],['synthetic-cookie=private','OTHER']]){
  const failure=Error(message);let calls=0;await assert.rejects(screenshotBoard({locator:()=>({screenshot:async()=>{calls++;throw failure;}})},'x'),error=>error===failure);assert.equal(calls,1);assert.equal(screenshotFailureKind(failure),kind);
  if (kind === 'INVISIBLE_TARGET') {
   const geometry = {count:0, viewport:[1365,900], rect:null, hidden:null, accessSelected:false};
   const capture = Error('Element is not visible');
   let observations = 0;
   const page = {locator:()=>({screenshot:async()=>{throw capture;}}),evaluate:async readGeometry=>{
    observations++;
    const sandbox={innerWidth:1365, innerHeight:900, document:{querySelectorAll:()=>[],querySelector:()=>null}};
    return JSON.parse(JSON.stringify(vm.runInNewContext('('+readGeometry.toString()+')()',sandbox)));
   }};
   await assert.rejects(screenshotBoard(page,'synthetic.png'),error=>error===capture);
   assert.equal(observations,1);assert.deepEqual(failedBoardGeometry(capture),geometry);
  }

 }
});
