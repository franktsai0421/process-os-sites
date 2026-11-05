import test from 'node:test';
import assert from 'node:assert/strict';
import {feedbackDOM} from './helpers/feedback-dom.mjs';
import {mountAccessQueue} from '../public/process/web-feedback-access.mjs';

for(const vi of [false,true])void test('access queue is unavailable, never claims an empty synchronized inventory '+vi,async()=>{
  const {document}=feedbackDOM(),host=document.createElement('section');host.ownerDocument=document;document.body.append(host);
  let calls=0;
  await mountAccessQueue({host,t:(zh,vietnamese)=>vi?vietnamese:zh,current:()=>true,request:async()=>{calls++;return {available:false,coverage:'not-connected',lastUpdatedAt:null,events:[]};}});
  assert.equal(calls,1);assert.match(host.querySelector('[role=status]').textContent,vi?/chưa kết nối/:/尚未接通/);
  assert.equal(host.querySelectorAll('[data-pick],textarea,a').length,0);
  assert.equal(host.querySelector('.wf-access-controls').children.length,5);
  for(const button of host.querySelector('.wf-access-controls').children)assert.equal(button.disabled,true);
  assert.match(host.querySelector('.wf-muted').textContent,vi?/chưa có bằng chứng/:/尚無證據/);
});
for(const outcome of ['offline','partial','unsupported'])void test('access queue fails closed for '+outcome,async()=>{
  const {document}=feedbackDOM(),host=document.createElement('section');host.ownerDocument=document;
  await mountAccessQueue({host,t:zh=>zh,current:()=>true,request:()=>outcome==='offline'?Promise.reject(Error('synthetic')):Promise.resolve({available:true,coverage:outcome,events:[{description:'<img onerror=alert(1)>',note:'private'}]})});
  assert.match(host.querySelector('[role=status]').textContent,/離線或來源讀取失敗/);
  assert.equal(host.querySelectorAll('img,textarea,a').length,0);
});
void test('late access response after account/tab departure cannot paint and repeated retry is bounded',async()=>{
  const {document}=feedbackDOM(),host=document.createElement('section');host.ownerDocument=document;
  let current=true,resolve,calls=0;
  const task=mountAccessQueue({host,t:zh=>zh,current:()=>current,request:()=>{calls++;return new Promise(r=>{resolve=r;});}});
  assert.equal(calls,1);const retry=host.children.at(-1);assert.equal(retry.disabled,true);
  current=false;resolve({available:false,coverage:'not-connected',lastUpdatedAt:null});await task;
  assert.match(host.querySelector('[role=status]').textContent,/讀取來源狀態/);retry.onclick();assert.equal(calls,1);
});
