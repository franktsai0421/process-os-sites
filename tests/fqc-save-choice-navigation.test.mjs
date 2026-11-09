import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),fixture=require('../scripts/fqc-apply-fixture.cjs'),{fixture:uiFixture}=require('../scripts/test-fqc-feedback-races.cjs');
const clone=value=>JSON.parse(JSON.stringify(value)),tick=()=>new Promise(setImmediate);
const detail=(fields,base)=>({moduleAction:'save-local-v1',patches:Object.entries(fields).map(([key,value])=>({op:'set',path:['items',{id:'item'},key],value})),guards:Object.keys(fields).map(key=>({path:['items',{id:'item'},key],value:base[key]})),input:{matrixCells:[]}});
async function setup({legacy=false,intercept}={}){
 const f=await fixture();
 if(legacy)await f.mutate(values=>{const q=JSON.parse(values.qualityMasterControl),lib=q.libraries.fqc;lib.versions.push({...clone(lib.versions[0]),id:'legacy-draft',number:2,status:'draft'});values.qualityMasterControl=JSON.stringify(q);});
 const peer=f.realm('other');await peer.client.read();if(!legacy)await peer.client.begin();
 const initial=await(await f.call('/api/fqc/workflow?caseMetadata=1')).json();
 const ui=await uiFixture({initialControl:initial.control,identityUser:{id:'editor',name:'Synthetic editor',role:'staff'},send:(url,options)=>intercept?intercept(url,options,()=>f.call(url,options)):f.call(url,options)});
 return {f,ui,peer,initial,async stage(fields){ui.c.__fqcTest.openItemModal('item');const form=ui.doc.querySelector('.fqc-item-form');for(const [key,value]of Object.entries(fields))form.querySelector(`[name="${key}"]`).value=value;await form.onsubmit({preventDefault(){},target:form});},async peerSave(fields){const s=await f.state();return peer.client.command(s.workflow.generation,'save',detail(fields,s.workflow.working.items[0]));},posts(){return ui.requests.filter(r=>r.method==='POST');},async choose(choice){const selector=`[data-fqc-save-choice="${choice}"]`;if(!ui.doc.querySelector(selector)){const body=ui.doc.body,append=body.append;await new Promise(resolve=>{body.append=function(...nodes){const result=Reflect.apply(append,this,nodes);if(ui.doc.querySelector(selector)){body.append=append;resolve();}return result;};});}await ui.doc.querySelector(selector).click();}};
}

import fs from 'node:fs';import vm from 'node:vm';
import * as policy from '../public/process/delivery-purpose.mjs';import * as coordinator from '../public/process/navigation-lifecycle.mjs';
const navSource=fs.readFileSync('public/process/delivery-navigation.js','utf8').replace(/import\('\.\/navigation-lifecycle\.mjs\?v=[^']+'\)/,'Promise.resolve(coordinatorModule)');
async function router(h){
 const c=h.ui.c,events={},sync=c.ProcessSync;let delivery=1;
 c.addEventListener=(type,fn)=>(events[type]||=[]).push(fn);c.dispatchEvent=event=>{for(const fn of events[event.type]||[])fn(event);};
 c.ProcessDeliveryPurpose=policy;c.coordinatorModule=coordinator;c.performance={now:()=>1};c.location.href='https://synthetic.invalid/process/?system=quality&view=data&dataTab=quality-fqc';
 c.history={state:{},replaceState(state,_title,url){this.state=state;c.location.href=String(url);},pushState(state,_title,url){this.state=state;c.location.href=String(url);},go(){throw Error('Unexpected traversal');}};
 c.ProcessDualSystem={activeSystem:'quality',installSystem(system){this.activeSystem=system;},readyForDestination:async()=>{}};
 c.MasterDataWorkflow={canLeave:()=>true,resetProjection(){}};c.ProcessRuntimeProjection={canLeave:()=>true,install(){}};c.ProcessDataTabs={readyForDestination:async()=>{}};c.render=()=>{};c.navigate=view=>{c.state.view=view;};
 Object.assign(sync,{deliveryProjection:true,destination:{view:'data',dataTab:'quality-fqc',system:'quality',key:'data:quality-fqc'},pendingState:()=>({}),captureDelivery:()=>delivery,isCurrentDelivery:token=>token===delivery,prepareDestination:async target=>({destination:{...target,key:policy.destinationKey(target)}}),validateDestination(){},commitDestination(handle){this.destination=handle.destination;delivery++;},suspendDestination(){throw Error('Unexpected suspension');}});
 const root=h.ui.doc.createElement('div');root.id='view-root';h.ui.doc.body.append(root);
 h.ui.c.__fqcTest.transport();h.ui.c.__fqcTest.install(h.ui.main,clone(await h.f.state()));await h.ui.c.__fqcTest.transport().read();h.ui.c.__fqcTest.render();vm.runInContext(navSource,c);await c.ProcessDeliveryNavigation.initialized;return c.ProcessDeliveryNavigation;
}
async function until(check){for(let n=0;n<200;n++){if(check())return;await new Promise(r=>setTimeout(r,5));}assert.fail('Expected event did not settle');}
for(const phase of ['compare','chooser'])void test(`actual router retires ${phase}, settles Save and removes old modal before delivery commit`,async()=>{
 let held=false,release;const h=await setup({intercept:async(url,o,send)=>{if(held&&o.method!=='POST'&&!url.includes('operationId=')){held=false;await new Promise(r=>{release=r;});}return send();}});
 try{const nav=await router(h);await h.stage({name:'Mine'});await h.peerSave({name:'Peer'});if(phase==='compare')held=true;let settled=false;const save=h.ui.c.__fqcTest.sharedAction('save').finally(()=>{settled=true;});
 let oldButton;if(phase==='chooser'){await until(()=>h.ui.doc.querySelector('[data-fqc-save-choice="mine"]'));oldButton=h.ui.doc.querySelector('[data-fqc-save-choice="mine"]');}else await until(()=>release);
 assert.equal(h.ui.c.FQCMasterUI.navigation.departure.inspect().state,'dirty');assert.equal(nav.canUnloadWithoutPrompt(),true);
 await nav.navigate('dashboard',null,'process');await until(()=>h.ui.c.state.view==='dashboard');assert(settled);assert.equal(await save,false);assert.equal(h.ui.doc.querySelector('.fqc-modal-overlay'),null);assert.equal(h.ui.doc.querySelector('[data-process-departure]'),null);assert.equal(h.posts().length,0);assert.equal(h.ui.records.size,0);
 await oldButton?.click();release?.();await tick();assert.equal(h.posts().length,0);
 await nav.navigate('data','quality-fqc','quality');h.ui.c.__fqcTest.install(h.ui.main,clone(await h.f.state()));await h.ui.c.__fqcTest.transport().read();h.ui.c.__fqcTest.render();await h.stage({name:'New visit'});await h.ui.c.__fqcTest.sharedAction('save');assert.equal(h.posts().length,1);
 }finally{release?.();h.f.close();}
});
for(const action of ['cancel','escape'])void test(`chooser ${action} closes once, repeated Save cannot bypass it, then fresh Save works`,async()=>{
 const h=await setup();try{await h.stage({name:'Mine'});await h.peerSave({name:'Peer'});const save=h.ui.c.__fqcTest.sharedAction('save');await until(()=>h.ui.doc.querySelector('[data-fqc-save-choice="mine"]'));const old=h.ui.doc.querySelector('[data-fqc-save-choice="mine"]');await assert.rejects(h.ui.c.__fqcTest.sharedAction('save'),/OPERATION_IN_PROGRESS/);
 if(action==='cancel')await h.choose('cancel');else h.ui.doc.dispatchEvent(new h.ui.c.Event('keydown',{key:'Escape',preventDefault(){}}));assert.equal(await save,false);assert.equal(h.ui.doc.querySelector('.fqc-modal-overlay'),null);await old.click();assert.equal(h.posts().length,0);const next=h.ui.c.__fqcTest.sharedAction('save');await h.choose('mine');await next;assert.equal(h.posts().length,1);
 }finally{h.f.close();}
});

void test('FQC first Begin authority read may depart and return to Save while old unsent read stays held',async()=>{
 let enabled=false,reads=0,reached,release;const gate=new Promise(resolve=>{reached=resolve;});
 const h=await setup({legacy:true,intercept:async(url,o,send)=>{const response=await send();if(enabled&&o.method!=='POST'&&++reads===2){reached();await new Promise(resolve=>{release=resolve;});}return response;}});
 try{await h.stage({name:'Abandoned'});enabled=true;const oldClient=h.ui.c.__fqcTest.transport(),task=h.ui.c.__fqcTest.sharedAction('save');await gate;
  const nav=h.ui.c.FQCMasterUI.navigation,adapter=nav.departure;assert.equal(adapter.inspect().state,'dirty');assert.equal(adapter.inspect().canAbandon,true);const lease=await adapter.abandon();adapter.closeClean();nav.reset();lease.release();assert.equal(await task,false);assert.equal(h.posts().length,0);assert.equal(h.ui.records.size,0);assert.equal(h.ui.c.sharedDraftAccountState().queued,0);
  h.ui.c.__fqcTest.install(h.ui.main,clone(await h.f.state()));await h.ui.c.__fqcTest.transport().read();h.ui.c.__fqcTest.render();await h.stage({name:'Fresh return'});await h.ui.c.__fqcTest.sharedAction('save');assert.equal(h.posts().length,2);assert.equal((await h.f.state()).workflow.saved.content.items[0].name,'Fresh return');
  release();await oldClient.flush().catch(()=>{});assert.equal(h.posts().length,2);assert.equal(h.ui.records.size,0);
 }finally{release?.();h.f.close();}
});
