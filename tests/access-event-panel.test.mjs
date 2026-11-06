import test from 'node:test';import assert from 'node:assert/strict';import {feedbackDOM} from './helpers/feedback-dom.mjs';import {mountAccessQueue} from '../public/process/web-feedback-access.mjs';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
void test('unavailable or malformed successful update response retains note and the same management operation',async()=>{
 const {document}=feedbackDOM(),host=document.createElement('section');host.ownerDocument=document;document.body.append(host);
 let row={id:'00000000-0000-4000-8000-000000000001',reporter:'synthetic',module:'bom',action:'save',occurredAt:123,receivedAt:'synthetic',outcome:'unknown',status:'open',version:1,notes:[],history:[]},valid=false;const bodies=[];
 const request=async(action,body)=>{if(action.startsWith('list'))return{available:true,coverage:'received-events-only',complete:false,events:[structuredClone(row)],privateDetails:true,permissions:{edit:true}};bodies.push(body);if(!valid)return{available:false,reason:'RETENTION_POLICY_REQUIRED'};row={...row,version:2,notes:[{authorId:'admin',at:'synthetic',text:body.note}]};return structuredClone(row);};
 const controller=await mountAccessQueue({host,t:zh=>zh,current:()=>true,request});const note=host.querySelector('textarea');note.value='retained private note';note.oninput();assert.equal(controller.canLeave(),false);
 host.querySelectorAll('button').find(button=>button.textContent==='保存備註').onclick();await tick();assert.equal(controller.canLeave(),false);assert.equal(host.querySelector('textarea').value,'retained private note');assert.equal(host.querySelector('textarea').readOnly,true);
 valid=true;host.querySelectorAll('button').find(button=>button.textContent==='核對原保存結果／重試').onclick();await tick();assert.deepEqual(bodies[0],bodies[1]);assert.equal(row.notes.length,1);assert.equal(controller.canLeave(),true);assert.equal(row.outcome,'unknown');
});
void test('late history response cannot replace newer open list or transfer a note typed during loading',async()=>{
 const {document}=feedbackDOM(),host=document.createElement('section');host.ownerDocument=document;document.body.append(host);
 const a={id:'open-A',reporter:'synthetic A',module:'bom',action:'save',occurredAt:123,receivedAt:'synthetic',outcome:'unknown',status:'open',version:1,notes:[],history:[]};
 const b={...a,id:'handled-B',reporter:'synthetic B',status:'handled'};const waiting=[];
 const request=action=>new Promise(resolve=>waiting.push({action,resolve}));
 const response=row=>({available:true,coverage:'received-events-only',complete:false,events:[row],privateDetails:true,permissions:{edit:true}});
 const mounted=mountAccessQueue({host,t:zh=>zh,current:()=>true,request});waiting.shift().resolve(response(a));const controller=await mounted;
 host.querySelectorAll('button').find(button=>button.textContent==='已解決紀錄').onclick();assert.equal(waiting.length,1);
 const oldInput=host.querySelector('textarea');assert.equal(oldInput.readOnly,true);oldInput.value='note intended for A';oldInput.oninput();
 host.querySelectorAll('button').find(button=>button.textContent==='待處理').onclick();assert.equal(waiting.length,2);
 waiting[1].resolve(response(a));await tick();assert.equal(host.querySelectorAll('button').find(button=>button.textContent==='待處理').getAttribute('aria-selected'),'true');assert.equal(host.querySelector('textarea').dataset.accessNote,a.id);assert.equal(host.querySelector('textarea').value,'');
 waiting[0].resolve(response(b));await tick();assert.equal(host.querySelectorAll('button').find(button=>button.textContent==='待處理').getAttribute('aria-selected'),'true');assert.equal(host.querySelector('textarea').dataset.accessNote,a.id);assert.equal(host.querySelector('textarea').value,'');assert.equal(controller.canLeave(),true);
 controller.dispose();
});
void test('loading response cannot move an earlier event note into a different selected row',async()=>{
 const {document}=feedbackDOM(),host=document.createElement('section');host.ownerDocument=document;document.body.append(host);
 const a={id:'open-A',reporter:'synthetic A',module:'bom',action:'save',occurredAt:123,receivedAt:'synthetic',outcome:'unknown',status:'open',version:1,notes:[],history:[]},b={...a,id:'handled-B',status:'handled'};
 const waiting=[],updates=[];const request=(action,body)=>action==='update'?(updates.push(body),Promise.resolve({})):new Promise(resolve=>waiting.push({action,resolve}));
 const response=row=>({available:true,coverage:'received-events-only',complete:false,events:[row],privateDetails:true,permissions:{edit:true}});
 const mounted=mountAccessQueue({host,t:zh=>zh,current:()=>true,request});waiting.shift().resolve(response(a));const controller=await mounted;
 const oldInput=host.querySelector('textarea');host.querySelectorAll('button').find(button=>button.textContent==='已解決紀錄').onclick();assert.equal(oldInput.readOnly,true);oldInput.value='A only';oldInput.oninput();waiting.shift().resolve(response(b));await tick();assert.equal(host.querySelector('textarea').dataset.accessNote,b.id);assert.equal(host.querySelector('textarea').value,'');
 oldInput.oninput();assert.equal(host.querySelector('textarea').value,'');host.querySelectorAll('button').find(button=>button.textContent==='保存備註').onclick();await tick();assert.equal(updates.length,1);assert.equal(updates[0].id,b.id);assert.equal(updates[0].note,'');controller.dispose();
});
