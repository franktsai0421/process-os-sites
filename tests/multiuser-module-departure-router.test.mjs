import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as policy from '../public/process/delivery-purpose.mjs';
import * as coordinatorModule from '../public/process/navigation-lifecycle.mjs';
const source=fs.readFileSync('public/process/delivery-navigation.js','utf8').replace(/import\('\.\/navigation-lifecycle\.mjs\?v=[^']+'\)/,'Promise.resolve(coordinatorModule)');
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
const turn=()=>new Promise(resolve=>setImmediate(resolve));
async function fixture(moduleName,tab){
 const events={},documentEvents={},timers=new Map(),reads=[],calls=[],toasts=[];let dirty=true,statusOverride=null,delivery=1,epoch=1,releases=0,closed=0,saves=0,discards=0,timerId=0;
 const mutation=deferred();
 const match=(node,selector)=>{if(selector.startsWith('#'))return node.id===selector.slice(1);const attr=/^\[([^=\]]+)(?:="([^"]*)")?\]$/.exec(selector);return !!attr&&Object.hasOwn(node.attributes,attr[1])&&(attr[2]===undefined||node.attributes[attr[1]]===attr[2]);};
 function element(tag='div'){
  const node={tagName:tag.toUpperCase(),children:[],attributes:{},dataset:{},style:{},isConnected:true,open:false,scrollTop:23,scrollLeft:7,
   setAttribute(name,value){this.attributes[name]=String(value);if(name.startsWith('data-'))this.dataset[name.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=String(value);},
   removeAttribute(name){delete this.attributes[name];},append(...children){for(const child of children){this.children.push(child);child.parentNode=this;}},prepend(child){this.children.unshift(child);child.parentNode=this;},
   querySelectorAll(selector){const result=[];function visit(parent){for(const child of parent.children){if(match(child,selector))result.push(child);visit(child);}}visit(this);return result;},querySelector(selector){return this.querySelectorAll(selector)[0]||null;},
   remove(){const clear=node=>{node.isConnected=false;for(const child of node.children)clear(child);};clear(this);if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(child=>child!==this);},
   replaceChildren(...children){for(const child of this.children)child.remove();this.children=[];this.append(...children);},focus(){document.activeElement=this;if(this.tagName==='INPUT'){this.selectionStart=0;this.selectionEnd=0;this.selectionDirection='none';}},setSelectionRange(start,end,direction='none'){this.selectionStart=Math.min(this.value.length,start);this.selectionEnd=Math.min(this.value.length,end);this.selectionDirection=direction;},showModal(){this.open=true;},close(){this.open=false;this.onclose?.();},click(){if(!this.disabled)return this.onclick?.({target:this,currentTarget:this});}
  };return node;
 }
 const body=element('body'),area=element(),shell=element(),form=element('dialog'),input=element('input');form.id='process-operation-dialog';form.open=true;input.value='latest unsaved text';input.setSelectionRange(0,4,'forward');form.append(input);body.append(form);area.id='view-root';
 const document={body,activeElement:input,documentElement:{dataset:{},lang:'zh'},createElement:element,addEventListener(name,fn){(documentEvents[name]||=[]).push(fn);},dispatchEvent(event){for(const fn of documentEvents[event.type]||[])fn(event);},querySelector:selector=>selector==='#view-root'?area:selector==='.app-shell'?shell:body.querySelector(selector),querySelectorAll:selector=>selector==='body > dialog:not([open])'?body.children.filter(n=>n.tagName==='DIALOG'&&!n.open):selector.includes('dialog[open]')?body.children.filter(n=>n.tagName==='DIALOG'&&n.open):[]};
 const location={href:'https://fixture.invalid/process/index.html?system=process&view=editor',get search(){return new URL(this.href).search;},reload:()=>calls.push('reload')};
 const history={state:{processNavigationIndex:1},replaceState(state,_title,url){this.state=state;location.href=String(url);calls.push('replace');},pushState(state,_title,url){this.state=state;location.href=String(url);calls.push('push');},go:delta=>calls.push(['go',delta])};
 const sync={deliveryProjection:true,identity:{id:'actor'},identityGeneration:()=>epoch,captureDelivery:()=>delivery,isCurrentDelivery:value=>value===delivery,destination:{view:tab==='routine'?'quality-inspections':'data',dataTab:tab==='routine'?null:tab,system:'process'},pendingState:()=>({}),prepareDestination(target,signal){const read=deferred();reads.push({...read,target,signal});return read.promise;},validateDestination(){},commitDestination(handle){this.destination=handle.destination;delivery++;calls.push('commit');},catalog:{}};
 const adapter={inspect:()=>statusOverride||{state:dirty?'dirty':'clean',canSave:true,canDiscard:true},ownsDialog:node=>node===form,
  async save(){saves++;await mutation.promise;dirty=false;return{release(){releases++;}};},async discard(){discards++;await mutation.promise;dirty=false;return{release(){releases++;}};},closeClean(){assert.equal(dirty,false);closed++;form.close();}};
 const state={view:tab==='routine'?'quality-inspections':'data',dataTab:tab==='routine'?null:tab,approvalTab:'master'},window={scrollX:0,scrollY:100,scrollTo(x,y){this.scrollX=x;this.scrollY=y;},setTimeout(fn){const id=++timerId;timers.set(id,fn);return id;},clearTimeout(id){timers.delete(id);},ProcessSync:sync,ProcessDeliveryPurpose:policy,ProcessAuthoringV3:{navigation:{departure:adapter,canLeave:()=>!dirty&&!form.open,reset(){}},readyForEditor:()=>Promise.resolve()},ProcessRuntimeProjection:{canLeave:()=>true,install(){}},MasterDataWorkflow:{canLeave:()=>true,resetProjection(){}},ProcessDataTabs:{select(){},readyForDestination:()=>Promise.resolve()},ProcessDualSystem:{renderQualityDataTab(){},activeSystem:'process',installSystem(system){this.activeSystem=system;}},sharedDraftAccountState:()=>({}),ProcessNavigationForms:{dirty:()=>true,composing:()=>false,clearDisconnected(){}},addEventListener(name,fn){(events[name]||=[]).push(fn);},dispatchEvent(event){for(const fn of events[event.type]||[])fn(event);}};
 window[moduleName]={...window[moduleName],navigation:window.ProcessAuthoringV3.navigation};delete window.ProcessAuthoringV3;
 vm.runInNewContext(source,{window,document,location,history,state,coordinatorModule,URL,Promise,AbortController,performance:{now:()=>42},CustomEvent:class{constructor(type){this.type=type;}},navigate:view=>{state.view=view;},render(){},toast:message=>toasts.push(message)});await window.ProcessDeliveryNavigation.initialized;calls.length=0;
 return{api:window.ProcessDeliveryNavigation,adapter,window,sync,state,reads,calls,toasts,form,input,document,location,history,mutation,events,flushTimers(){for(const [id,fn]of timers){timers.delete(id);fn();}},setDirty:value=>dirty=value,setStatus:value=>statusOverride=value,stats:()=>({releases,closed,saves,discards}),dialog:()=>document.querySelector('#process-navigation-departure'),choice:action=>document.querySelector('#process-navigation-departure')?.querySelector('[data-departure-choice="'+action+'"]'),finish:index=>{const read=reads[index];read.resolve({destination:read.target});},pop(index,view){location.href='https://fixture.invalid/process/index.html?system=process&view='+view;for(const fn of events.popstate||[])fn({state:{processNavigationIndex:index},stopImmediatePropagation(){}});},invalidate(){epoch++;sync.requiresReload=true;for(const fn of events['process-delivery-invalidated']||[])fn();}};
}


const cases=[['MasterDataWorkflow','AB'],['MasterDataWorkflow','C'],['MasterDataWorkflow','line-admin'],['MasterDataWorkflow','process-master'],['BOMWorkspace','bom'],['FQCMasterUI','quality-fqc'],['IQCMasterUI','quality-iqc'],['IPQCABUI','quality-ipqc-ab'],['IPQCCUI','quality-ipqc-c'],['RoutineEquipmentUI','quality-routine-equipment'],['ToolingUI','quality-mold-equipment'],['RoutineFQCUI','routine']];
for(const [moduleName,tab] of cases){
 test(`${tab}: actual router selects module adapter, Stay preserves inputs and makes no request`,async()=>{
  const f=await fixture(moduleName,tab);f.api.navigate('dashboard');assert(f.dialog());assert.equal(f.reads.length,0);f.choice('stay').click();assert.equal(f.input.value,'latest unsaved text');assert.equal(f.form.open,true);assert.equal(f.document.activeElement,f.input);assert.equal(f.stats().saves,0);assert.equal(f.stats().discards,0);
 });
 test(`${tab}: Save waits for acknowledgement, latest target wins, one save only`,async()=>{
  const f=await fixture(moduleName,tab);f.api.navigate('dashboard');f.choice('save').click();f.api.navigate('player');f.choice('save').click();assert.equal(f.stats().saves,1);assert.equal(f.reads.length,0);f.mutation.resolve();await turn();assert.equal(f.reads.length,1);assert.equal(f.reads[0].target.view,'player');f.finish(0);await turn();assert.equal(f.state.view,'player');assert.equal(f.stats().releases,1);
 });
 test(`${tab}: unknown does not save/discard/navigate and remains cancellable`,async()=>{
  const f=await fixture(moduleName,tab);f.setStatus({state:'unknown',canSave:false,canDiscard:false,reason:'請查原操作收據'});f.api.navigate('dashboard');assert(f.dialog());assert.equal(f.choice('save').disabled,true);assert.equal(f.choice('discard').disabled,true);f.choice('save').click();f.choice('discard').click();assert.equal(f.stats().saves,0);assert.equal(f.stats().discards,0);assert.equal(f.reads.length,0);f.choice('stay').click();assert.equal(f.form.open,true);
 });
}
test('PROCESS names owned by adapter are not re-blocked by the legacy runtime local guard',async()=>{
 const f=await fixture('MasterDataWorkflow','process-master');f.window.ProcessRuntimeProjection.canLeave=()=>false;f.adapter.ownsRuntimeLocal=()=>true;f.api.navigate('dashboard');assert.equal(f.choice('discard').disabled,false);f.choice('discard').click();f.mutation.resolve();await turn();assert.equal(f.reads.length,1);f.finish(0);await turn();assert.equal(f.state.view,'dashboard');
});
test('unowned runtime local input still blocks every other module adapter',async()=>{
 const f=await fixture('IQCMasterUI','quality-iqc');f.window.ProcessRuntimeProjection.canLeave=()=>false;f.api.navigate('dashboard');assert.equal(f.choice('save').disabled,true);assert.equal(f.choice('discard').disabled,true);assert.equal(f.reads.length,0);f.choice('stay').click();
});
