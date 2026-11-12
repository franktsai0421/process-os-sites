// Actual controller, history and guarded stage handler; SQLite/R2/DOM ports are synthetic.
import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';import vm from'node:vm';
import{setup,wid}from'./canvas-approved-history-fixture.mjs';import{createDepartureCoordinator}from'../public/process/navigation-lifecycle.mjs';
const nav=fs.readFileSync('public/process/delivery-navigation.js','utf8'),guard=nav.slice(nav.indexOf('  api.guardAction='),nav.indexOf('  api.invalidateDeparture=')),editor=fs.readFileSync('public/process/process-editor.js','utf8'),stage=editor.slice(editor.indexOf(' function changeStage('),editor.indexOf(' function bind(){'));
assert.equal(nav.split('  api.guardAction=').length,2);assert.equal(nav.split('  api.invalidateDeparture=').length,2);assert.equal(editor.split(' function changeStage(').length,2);assert.equal(editor.split(' function bind(){').length,2);
for(const lang of['zh','vi'])for(const inline of[true,false])for(const mode of['success','cancel','identity','same-id-identity','epoch','delivery','reload','generation','history-attempt'])void test('actual stage handoff '+lang+'/'+(inline?'inline':'records')+': '+mode,async()=>{
 const f=await setup({lang,inline});
 try{
  const b=f.box,adapter=f.api.navigation.departure,v={stage:'A-CUT'},paint=b.render,events=[];let locked=false;
  b.render=()=>{paint();const n=f.root.querySelector('.editor-workspace');n.classList.add('pe-editor');n.dataset.stageKey=v.stage;};b.render();
  b.ProcessEditorV2.departure={inspect:()=>({state:'clean',hasDialog:false}),freeze(){locked=true;return()=>locked=false;},discardLocal(){},closeClean(){}};b.ProcessEditorV2.refreshRecovery=()=>{events.push('refresh');b.render();};
  const pin=()=>({adapter,identity:b.ProcessSync.identity,epoch:b.ProcessSync.identityGeneration(),delivery:b.ProcessSync.captureDelivery(),generation:f.api.flow()?.generation});
  const owns=o=>o.identity===b.ProcessSync.identity&&o.epoch===b.ProcessSync.identityGeneration()&&b.ProcessSync.isCurrentDelivery(o.delivery)&&!b.ProcessSync.requiresReload&&o.generation===f.api.flow()?.generation;
  const departure=createDepartureCoordinator({owner:pin,isCurrent:owns,inspect:()=>adapter.inspect(),autoAbandon:()=>true,async act(action){
   const lease=await adapter[action]();
   assert.throws(()=>f.canvas.edit(wid,'A-CUT',[{id:'one',f:'name',value:'FORBIDDEN_DURING_HANDOFF'}]),/DEPARTURE|LOCK/);
   if(mode==='cancel')departure.cancel('cancelled',false);
   if(mode==='identity')b.ProcessSync.identity={id:'other'};
   if(mode==='same-id-identity')b.ProcessSync.identity={...b.ProcessSync.identity};
   if(mode==='epoch')f.rotate();if(mode==='delivery')f.delivery();if(mode==='reload')b.ProcessSync.requiresReload=true;
   if(mode==='generation')f.api.acceptCanvas({control:{activeVersionId:'formal',versions:[{id:'shared-g',status:'draft'}],workflow:{...structuredClone(f.api.flow()),generation:'successor'}}});
   if(mode==='history-attempt'){await f.open();await f.choose('approved-case');assert.equal(f.api.historyReadOnly(),false,'held Canvas lock prevents history selection');}
   return lease;
  },show(){throw Error('UNEXPECTED_DIALOG');}});
  Object.assign(b,{host:b,api:{},sync:b.ProcessSync,readyGeneration:1,physicalIndex:0,historyIndex:0,restoreIndex:null,replayingPop:false,departure,coordinator:{cancelUncommitted(){}},departureAdapter:()=>adapter,canLeave:()=>['clean','departing'].includes(adapter.inspect().state),restoreSource(){throw Error('UNEXPECTED_HISTORY_RESTORE');},key:()=> 'G:A',view:()=>v,visibleStages:()=>['A-CUT','NAV'],remember(){},clearLink(){}});vm.runInContext(guard,b);b.ProcessDeliveryNavigation=b.api;vm.runInContext(stage,b);
  const row=JSON.stringify(f.f.row()),posts=f.calls.filter(x=>x.method==='POST').length;f.canvas.edit(wid,'A-CUT',[{id:'one',f:'name',value:'UNSENT'}]);const result=await b.changeStage('NAV');await new Promise(setImmediate);
  if(mode==='history-attempt'||mode==='success'){assert.equal(result.status,'ready');assert.equal(v.stage,'NAV');assert.equal(events.length,0);assert.equal(f.doc.querySelector('.pe-editor').dataset.stageKey,'NAV');assert.equal((await b.changeStage('A-CUT')).status,'ready');assert.equal(v.stage,'A-CUT');}else{assert(['cancelled','invalidated','error'].includes(result.status));assert.equal(v.stage,'A-CUT');assert.equal(events.length,mode==='cancel'?1:0);}
  assert.equal(locked,false);assert.equal(f.calls.filter(x=>x.method==='POST').length,posts);assert.equal(JSON.stringify(f.f.row()),row);
 }finally{f.close();}
});
