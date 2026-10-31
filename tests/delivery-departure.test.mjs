import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as policy from '../public/process/delivery-purpose.mjs';
import * as coordinatorModule from '../public/process/navigation-lifecycle.mjs';
const source=fs.readFileSync('public/process/delivery-navigation.js','utf8').replace(/import\('\.\/navigation-lifecycle\.mjs\?v=[^']+'\)/,'Promise.resolve(coordinatorModule)');
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
const turn=()=>new Promise(resolve=>setImmediate(resolve));
async function fixture(){
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
 const sync={deliveryProjection:true,identity:{id:'actor'},identityGeneration:()=>epoch,captureDelivery:()=>delivery,isCurrentDelivery:value=>value===delivery,destination:{view:'editor',dataTab:null,system:'process'},pendingState:()=>({}),prepareDestination(target,signal){const read=deferred();reads.push({...read,target,signal});return read.promise;},validateDestination(){},commitDestination(handle){this.destination=handle.destination;delivery++;calls.push('commit');},catalog:{}};
 const adapter={inspect:()=>statusOverride||{state:dirty?'dirty':'clean',canSave:true,canDiscard:true},ownsDialog:node=>node===form,
  async save(){saves++;await mutation.promise;dirty=false;return{release(){releases++;}};},async discard(){discards++;await mutation.promise;dirty=false;return{release(){releases++;}};},closeClean(){assert.equal(dirty,false);closed++;form.close();}};
 const state={view:'editor',dataTab:null,approvalTab:'master'},window={scrollX:0,scrollY:100,scrollTo(x,y){this.scrollX=x;this.scrollY=y;},setTimeout(fn){const id=++timerId;timers.set(id,fn);return id;},clearTimeout(id){timers.delete(id);},ProcessSync:sync,ProcessDeliveryPurpose:policy,ProcessAuthoringV3:{navigation:{departure:adapter,canLeave:()=>!dirty&&!form.open,reset(){}},readyForEditor:()=>Promise.resolve()},ProcessRuntimeProjection:{canLeave:()=>true,install(){}},MasterDataWorkflow:{canLeave:()=>true,resetProjection(){}},ProcessDataTabs:{readyForDestination:()=>Promise.resolve()},ProcessDualSystem:{activeSystem:'process',installSystem(system){this.activeSystem=system;}},sharedDraftAccountState:()=>({}),ProcessNavigationForms:{dirty:()=>true,composing:()=>false,clearDisconnected(){}},addEventListener(name,fn){(events[name]||=[]).push(fn);},dispatchEvent(event){for(const fn of events[event.type]||[])fn(event);}};
 vm.runInNewContext(source,{window,document,location,history,state,coordinatorModule,URL,Promise,AbortController,performance:{now:()=>42},CustomEvent:class{constructor(type){this.type=type;}},navigate:view=>{state.view=view;},render(){},toast:message=>toasts.push(message)});await window.ProcessDeliveryNavigation.initialized;calls.length=0;
 return{api:window.ProcessDeliveryNavigation,adapter,window,sync,state,reads,calls,toasts,form,input,document,location,history,mutation,events,flushTimers(){for(const [id,fn]of timers){timers.delete(id);fn();}},setDirty:value=>dirty=value,setStatus:value=>statusOverride=value,stats:()=>({releases,closed,saves,discards}),dialog:()=>document.querySelector('#process-navigation-departure'),choice:action=>document.querySelector('#process-navigation-departure')?.querySelector('[data-departure-choice="'+action+'"]'),finish:index=>{const read=reads[index];read.resolve({destination:read.target});},pop(index,view){location.href='https://fixture.invalid/process/index.html?system=process&view='+view;for(const fn of events.popstate||[])fn({state:{processNavigationIndex:index},stopImmediatePropagation(){}});},invalidate(){epoch++;sync.requiresReload=true;for(const fn of events['process-delivery-invalidated']||[])fn();}};
}

void test('actual router Stay keeps source form, input, focus and scroll with one decision',async()=>{
 const f=await fixture();f.api.navigate('dashboard');f.api.navigate('player');assert(f.dialog());assert.equal(f.document.body.children.filter(n=>n.dataset.navigationDeparture).length,1);assert.equal(f.reads.length,0);f.choice('stay').click();await turn();assert.equal(f.dialog(),null);assert.equal(f.form.open,true);assert.equal(f.input.value,'latest unsaved text');assert.equal(f.form.scrollTop,23);assert.equal(f.document.activeElement,f.input);assert.equal(f.reads.length,0);
});
void test('Stay restores the input selection range and direction after focus resets its caret',async()=>{
 const f=await fixture();f.input.setSelectionRange(2,8,'backward');f.api.navigate('dashboard');f.input.setSelectionRange(0,0);f.form.scrollTop=0;f.window.scrollY=0;f.choice('stay').click();
 assert.equal(f.document.activeElement,f.input);assert.deepEqual([f.input.selectionStart,f.input.selectionEnd,f.input.selectionDirection],[2,8,'backward']);assert.equal(f.form.scrollTop,23);assert.equal(f.window.scrollY,100);assert.equal(f.input.value,'latest unsaved text');
});
void test('Back Stay waits until native history state restoration before restoring range and scroll',async()=>{
 const f=await fixture();f.input.setSelectionRange(1,5,'forward');f.form.scrollTop=61;f.window.scrollY=145;f.pop(0,'dashboard');f.input.setSelectionRange(0,0);f.choice('stay').click();
 assert.equal(f.input.selectionEnd,0,'do not restore before the source history cursor');f.pop(1,'editor');
 // Browsers restore persisted user state after dispatching popstate.
 f.input.setSelectionRange(0,0);f.form.scrollTop=0;f.window.scrollY=0;f.flushTimers();
 assert.equal(f.document.activeElement,f.input);assert.deepEqual([f.input.selectionStart,f.input.selectionEnd,f.input.selectionDirection],[1,5,'forward']);assert.equal(f.form.scrollTop,61);assert.equal(f.window.scrollY,145);
});
void test('a queued history focus restoration cannot overwrite newer input or a newer decision',async()=>{
 const f=await fixture();f.pop(0,'dashboard');f.choice('stay').click();f.pop(1,'editor');f.input.setSelectionRange(7,10,'backward');f.form.scrollTop=77;f.document.dispatchEvent({type:'keydown'});f.flushTimers();assert.deepEqual([f.input.selectionStart,f.input.selectionEnd,f.input.selectionDirection],[7,10,'backward']);assert.equal(f.form.scrollTop,77);
 const g=await fixture();g.pop(0,'dashboard');g.choice('stay').click();g.pop(1,'editor');g.input.setSelectionRange(6,9,'forward');g.api.navigate('player');const latest=g.dialog();g.flushTimers();assert.equal(g.dialog(),latest);assert.notEqual(g.document.activeElement,g.input);g.choice('stay').click();assert.deepEqual([g.input.selectionStart,g.input.selectionEnd,g.input.selectionDirection],[6,9,'forward']);
});
void test('actual router saves once, preserves form and lease until latest target commit',async()=>{
 const f=await fixture();f.api.navigate('dashboard');f.choice('save').click();f.choice('save').click();f.api.navigate('player');assert.equal(f.stats().saves,1);assert.equal(f.choice('stay').disabled,true);f.mutation.resolve();await turn();assert.equal(f.reads.length,1);assert.equal(f.reads[0].target.view,'player');assert.equal(f.form.open,true);assert.equal(f.stats().releases,0);assert.equal(f.choice('stay').disabled,false);
 f.finish(0);await turn();assert.equal(f.state.view,'player');assert.equal(f.stats().releases,1);assert.equal(f.stats().closed,1);assert.equal(f.dialog(),null);
});
void test('actual router target403 after Save keeps the acknowledged form and unlocks source',async()=>{
 const f=await fixture();f.api.navigate('dashboard');f.choice('save').click();f.mutation.resolve();await turn();f.reads[0].reject(Object.assign(Error('forbidden'),{status:403}));await turn();assert.equal(f.state.view,'editor');assert.equal(f.stats().releases,1);assert.equal(f.stats().closed,0);assert.equal(f.form.open,true);assert.equal(f.input.value,'latest unsaved text');assert.equal(f.document.activeElement,f.input);
});
void test('actual router failed mutation keeps decision and inputs, and unknown disables replay',async()=>{
 const f=await fixture();f.api.navigate('dashboard');f.choice('save').click();f.setStatus({state:'unknown',reason:'請查原操作收據',canSave:false,canDiscard:false});f.mutation.reject(Error('尚未確認保存結果，請查原操作收據'));await turn();assert(f.dialog());assert.equal(f.choice('save').disabled,true);assert.equal(f.choice('discard').disabled,true);assert.equal(f.choice('stay').disabled,false);assert.equal(f.reads.length,0);assert.equal(f.input.value,'latest unsaved text');f.choice('stay').click();assert.equal(f.form.open,true);
});
void test('actual dirty Back can Stay and restore physical source, or Discard and commit the popped entry',async()=>{
 const stay=await fixture();stay.pop(0,'dashboard');assert(stay.dialog());stay.choice('stay').click();assert.deepEqual(stay.calls.at(-1),['go',1]);stay.pop(1,'editor');assert.equal(stay.history.state.processNavigationIndex,1);assert.equal(stay.state.view,'editor');assert.equal(stay.reads.length,0);
 const leave=await fixture();leave.pop(0,'dashboard');leave.choice('discard').click();leave.mutation.resolve();await turn();assert.equal(leave.stats().discards,1);leave.finish(0);await turn();assert.equal(leave.state.view,'dashboard');assert.equal(leave.history.state.processNavigationIndex,0);assert.equal(leave.calls.includes('push'),false);assert.equal(leave.stats().releases,1);
});
void test('actual pop decision replaced by click restores source cursor before preparing latest target',async()=>{
 const f=await fixture();f.pop(0,'dashboard');f.choice('save').click();f.api.navigate('player');f.mutation.resolve();await turn();assert.equal(f.reads.length,0);assert.deepEqual(f.calls.at(-1),['go',1]);assert.equal(f.stats().releases,0);f.pop(1,'editor');await turn();assert.equal(f.reads.length,1);assert.equal(f.reads[0].target.view,'player');f.finish(0);await turn();assert.equal(f.state.view,'player');assert.equal(f.history.state.processNavigationIndex,2);assert.equal(f.stats().saves,1);assert.equal(f.stats().releases,1);
});
void test('actual choosing state refresh enables completion without another write and unknown remains blocked',async()=>{
 const f=await fixture();f.setStatus({state:'busy',reason:'正在套用',canSave:false,canDiscard:false});f.api.navigate('dashboard');assert.equal(f.choice('save').disabled,true);f.setStatus(null);f.api.refreshDeparture();assert.equal(f.choice('save').disabled,false);f.setDirty(false);f.api.refreshDeparture();f.choice('save').click();await turn();assert.equal(f.stats().saves,0);f.finish(0);await turn();assert.equal(f.state.view,'dashboard');
});
void test('actual clean owned viewer may leave but foreign dialog still blocks',async()=>{
 const f=await fixture();f.setDirty(false);f.api.navigate('dashboard');assert.equal(f.dialog(),null);assert.equal(f.form.open,true);f.finish(0);await turn();assert.equal(f.stats().closed,1);
 const g=await fixture();g.setDirty(false);g.adapter.ownsDialog=()=>false;g.api.navigate('dashboard');assert(g.dialog());assert.equal(g.choice('save').disabled,true);assert.equal(g.reads.length,0);g.choice('stay').click();assert.equal(g.form.open,true);
});
void test('guardAction keeps current selection until acknowledged decision and invokes latest callback once',async()=>{
 const f=await fixture(),changes=[];const a=f.api.guardAction({key:'line-A',label:'A',run:()=>changes.push('A')}),b=f.api.guardAction({key:'line-C',label:'C',run:()=>changes.push('C')});assert.equal((await a).status,'superseded');assert.deepEqual(changes,[]);f.choice('save').click();f.mutation.resolve();assert.equal((await b).status,'ready');assert.deepEqual(changes,['C']);assert.equal(f.stats().saves,1);assert.equal(f.stats().releases,1);
});
void test('current-page click is a no-op and handoff Stay cancels the old prepared destination',async()=>{
 const f=await fixture();f.api.navigate('editor');assert.equal(f.dialog(),null);assert.equal(f.reads.length,0);
 f.api.navigate('dashboard');f.choice('save').click();f.mutation.resolve();await turn();f.choice('stay').click();assert.equal(f.reads[0].signal.aborted,true);assert.equal(f.stats().releases,1);f.finish(0);await turn();assert.equal(f.state.view,'editor');assert.equal(f.form.open,true);assert.equal(f.dialog(),null);
});
void test('latest target during handoff cancels only the old GET and retains one mutation lease',async()=>{
 const f=await fixture();f.api.navigate('dashboard');f.choice('save').click();f.mutation.resolve();await turn();f.api.navigate('player');await turn();assert.equal(f.reads[0].signal.aborted,true);assert.equal(f.reads[1].target.view,'player');assert.equal(f.stats().saves,1);assert.equal(f.stats().releases,0);f.finish(0);await turn();assert.equal(f.state.view,'editor');f.finish(1);await turn();assert.equal(f.state.view,'player');assert.equal(f.stats().releases,1);
});
void test('a newer native pop during source restoration supersedes queued click and keeps the latest history target',async()=>{
 const f=await fixture();f.pop(0,'dashboard');f.choice('save').click();f.mutation.resolve();await turn();f.api.navigate('player');await turn();assert.deepEqual(f.calls.at(-1),['go',1]);
 f.pop(-1,'dispatch');await turn();f.pop(1,'editor');await turn();assert.deepEqual(f.calls.at(-1),['go',-2]);f.pop(-1,'dispatch');await turn();assert.equal(f.reads.at(-1).target.view,'dispatch');f.finish(f.reads.length-1);await turn();assert.equal(f.state.view,'dispatch');assert.equal(f.history.state.processNavigationIndex,-1);assert.equal(f.stats().saves,1);assert.equal(f.stats().releases,1);
});
void test('Stay while a replayed pop is in flight restores source and cannot revive the abandoned target',async()=>{
 const f=await fixture();f.pop(0,'dashboard');f.choice('save').click();f.mutation.resolve();await turn();f.api.navigate('player');await turn();f.pop(-1,'dispatch');await turn();f.pop(1,'editor');await turn();assert.deepEqual(f.calls.at(-1),['go',-2]);f.choice('stay').click();assert.equal(f.stats().releases,1);
 f.pop(-1,'dispatch');await turn();assert.deepEqual(f.calls.at(-1),['go',2]);f.pop(1,'editor');await turn();assert.equal(f.state.view,'editor');assert.equal(f.dialog(),null);assert.equal(f.reads.length,1);f.finish(0);await turn();assert.equal(f.state.view,'editor');
});
void test('malformed or throwing draft inspection is explained and never treated as clean',async()=>{
 const f=await fixture();f.adapter.inspect=()=>{throw Error('UNKNOWN');};f.api.navigate('dashboard');assert(f.dialog());assert.equal(f.choice('save').disabled,true);assert.equal(f.choice('discard').disabled,true);assert.match(f.dialog().querySelector('[data-departure-state]').textContent,/草稿狀態尚未確認/);assert.equal(f.reads.length,0);f.choice('stay').click();
});
void test('a local selection replacing a popped destination restores source history before handoff',async()=>{
 const f=await fixture(),selected=[];f.pop(0,'dashboard');const action=f.api.guardAction({key:'line-C',label:'C',run:()=>selected.push('C')});f.choice('save').click();f.mutation.resolve();await turn();assert.deepEqual(selected,[]);assert.equal(f.stats().releases,0);assert.deepEqual(f.calls.at(-1),['go',1]);f.pop(1,'editor');assert.equal((await action).status,'ready');assert.deepEqual(selected,['C']);assert.equal(new URL(f.location.href).searchParams.get('view'),'editor');assert.equal(f.history.state.processNavigationIndex,1);assert.equal(f.stats().releases,1);
});
void test('Stay during history restoration cancels queued local selection and never runs it later',async()=>{
 const f=await fixture(),selected=[];f.pop(0,'dashboard');const action=f.api.guardAction({key:'line-C',label:'C',run:()=>selected.push('C')});f.choice('save').click();f.mutation.resolve();await turn();f.choice('stay').click();assert.equal((await action).status,'cancelled');f.pop(1,'editor');await turn();assert.deepEqual(selected,[]);assert.equal(f.stats().releases,1);assert.equal(f.form.open,true);
});
void test('a clean local action requested while Stay is restoring waits for the original cursor',async()=>{
 const f=await fixture(),selected=[];f.pop(0,'dashboard');f.choice('stay').click();f.setDirty(false);const action=f.api.guardAction({key:'line-C',label:'C',run:()=>selected.push('C')});await turn();assert.deepEqual(selected,[]);f.pop(1,'editor');assert.equal((await action).status,'ready');assert.deepEqual(selected,['C']);assert.equal(f.history.state.processNavigationIndex,1);assert.equal(new URL(f.location.href).searchParams.get('view'),'editor');
});
void test('clicking current page during history restoration supersedes an older queued destination',async()=>{
 const f=await fixture();f.setDirty(false);f.pop(0,'dashboard');assert.equal(f.reads.length,1);f.api.navigate('player');assert.deepEqual(f.calls.at(-1),['go',1]);f.api.navigate('editor');f.pop(1,'editor');await turn();assert.equal(f.state.view,'editor');assert.equal(f.reads.length,1);assert.equal(f.reads[0].signal.aborted,true);f.finish(0);await turn();assert.equal(f.state.view,'editor');assert.equal(new URL(f.location.href).searchParams.get('view'),'editor');assert.equal(f.history.state.processNavigationIndex,1);
});
void test('native unload protects dirty, busy and unknown process state without writing or opening a custom decision',async()=>{
 const f=await fixture();assert.equal(f.events.beforeunload.length,1);
 for(const state of ['dirty','busy','unknown','blocked']){f.setStatus({state,canSave:false,canDiscard:false});let prevented=0;const event={returnValue:'',preventDefault(){prevented++;}};f.events.beforeunload[0](event);assert.equal(prevented,1,state);assert(event.returnValue);assert.equal(f.dialog(),null);assert.equal(f.input.value,'latest unsaved text');}
 assert.equal(f.stats().saves,0);assert.equal(f.stats().discards,0);assert.equal(f.reads.length,0);
});
void test('native unload permits clean/read-only process viewing and does not accumulate on navigation',async()=>{
 const f=await fixture();f.setDirty(false);let prevented=0;const event={returnValue:'',preventDefault(){prevented++;}};f.events.beforeunload[0](event);assert.equal(prevented,0);assert.equal(event.returnValue,'');assert.equal(f.form.open,true);
 f.api.navigate('dashboard');f.finish(0);await turn();f.setStatus({state:'dirty'});f.events.beforeunload[0](event);assert.equal(prevented,0,'other modules retain their own unload guard');assert.equal(f.events.beforeunload.length,1);
});
