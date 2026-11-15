import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {canvasDOM} from '../scripts/login-reentry-dom.mjs';
const tick=()=>new Promise(setImmediate);
for(const language of ['zh','vi'])for(const error of ['APPROVED_HISTORY_SUPERSEDED','HISTORY_LOAD_FAILED'])void test(`IPQC-C confirmed Save status survives ${error} with explicit read-only history retry (${language})`,async()=>{
 const dom=canvasDOM(),doc=dom.document;Object.defineProperty(dom.Node.prototype,'options',{get(){return this.children;}});dom.Node.prototype.before=function(node){const parent=this.parentElement;node.remove();node.parentElement=parent;parent.children.splice(parent.children.indexOf(this),0,node);};doc.documentElement.lang=language;const root=doc.createElement('main');root.innerHTML='<header class="test-header"><select><option value="draft">V42</option></select></header>';doc.body.append(root);
 let calls=0;const journal=new Map([['original-saved-receipt','retained']]),content={items:[{id:'synthetic-persisted'}]},flow={working:content,active:{content:{items:[]}},saved:{id:'saved-receipt',content,actor:{name:'Synthetic editor'},at:'2026-11-15T00:00:00Z'},cases:[]},model={header:'.test-header',module:'IPQC-C',scope:'IPQC-C',version:{id:'draft',number:42,status:'draft'},versions:[],flow,historyClient:()=>({permission:()=>true,async uiHistory(){calls++;if(calls===1)throw Error(error);return{versions:{rows:[],total:0,next:null},saves:{rows:[],total:0,next:null}};}})};
 const c={...dom,console,Intl,Date,Map,Set,JSON,ProcessSync:{identity:{id:'synthetic'}},addEventListener(){},bindDataInner(){},setTimeout,clearTimeout};c.window=c;vm.runInNewContext(fs.readFileSync('public/process/version-draft-ui.js','utf8'),c);c.VersionDraftUI.mount(root,model);
 const saved=root.querySelector('[data-vd-saved]').textContent,sync=root.querySelector('[data-vd-sync]').textContent,before=JSON.stringify(flow),select=root.querySelector('.vd-choice select');await select.dispatchEvent({type:'focus',target:select});await tick();
 const notice=root.querySelector('.vd-history-load');assert(notice.textContent.includes(error));assert(!notice.textContent.includes('結果未知'));assert(!notice.textContent.includes('Kết quả chưa rõ'));assert.equal(root.querySelector('[data-vd-saved]').textContent,saved);assert.equal(root.querySelector('[data-vd-sync]').textContent,sync);
 const retry=root.querySelectorAll('button').find(node=>node.dataset.vdHistoryRetry==='true');assert.equal(retry.hidden,false);await retry.click();await tick();assert.equal(calls,2);assert.equal(retry.hidden,true);assert.equal(notice.textContent,'');assert.equal(JSON.stringify(flow),before);assert.deepEqual([...journal],[['original-saved-receipt','retained']]);
});
