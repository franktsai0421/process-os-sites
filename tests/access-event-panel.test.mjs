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
