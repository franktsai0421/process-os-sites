import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import fs from 'node:fs';
import * as policy from '../public/process/delivery-purpose.mjs';
const source=fs.readFileSync('public/process/delivery-navigation.js','utf8');
function fixture(){
 const events={},clicks={},calls=[],messages=[],pending={dirty:0},drafts={},selected=[];
 const location={href:'https://fixture.invalid/process/index.html?system=process&view=player&line=C&stage=C-CUT',search:'?system=process&view=player&line=C&stage=C-CUT',assign:url=>calls.push(['assign',url]),reload:()=>calls.push(['reload'])};
 const sync={deliveryProjection:true,identity:{id:'staff'},destination:{view:'player',dataTab:null,system:'process',key:'player'},pendingState:()=>pending};
 const gate={setAttribute(){},append(){}};let cleared=false;
 const document={addEventListener:(name,fn)=>clicks[name]=fn,querySelector:selector=>selector==='.app-shell'?{replaceChildren(){cleared=true;},hidden:false}:gate,createElement:()=>({}),body:{append(){}}};
 const window={ProcessSync:sync,ProcessDeliveryPurpose:policy,ProcessDualSystem:{activeSystem:'process'},sharedDraftAccountState:()=>drafts,addEventListener:(name,fn)=>events[name]=fn,IMPORTED_DATA:{old:'private'},LINE_PROCESS_DATA:{old:'private'},LINE_C_MASTER:{old:'private'}};
 const context=vm.createContext({window,document,location,history:{state:{},replaceState:(_s,_t,url)=>{location.href=url.href;location.search=url.search;}},navigate:view=>selected.push(view),render:()=>selected.push('render'),state:{view:'player'},toast:message=>messages.push(message)});vm.runInContext(source,context);
 return{window,context,events,clicks,calls,messages,pending,drafts,selected,location,sync,cleared:()=>cleared};
}
test('same player page stays local; a new purpose navigates to a fresh normal document with no write',()=>{
 const f=fixture();vm.runInContext("navigate('player')",f.context);assert.deepEqual(f.selected,['player']);assert.deepEqual(f.calls,[]);
 vm.runInContext("navigate('editor')",f.context);assert.equal(f.calls.length,1);assert.equal(new URL(f.calls[0][1]).searchParams.get('view'),'editor');assert.equal(f.selected.length,1);
 const event={target:{closest:()=>({dataset:{qualityTab:'quality-iqc'}})},preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;}};f.clicks.click(event);assert(event.prevented&&event.stopped);assert.equal(new URL(f.calls.at(-1)[1]).searchParams.get('dataTab'),'quality-iqc');
 vm.runInContext("state.view='approval';state.approvalTab='quality';render()",f.context);assert.equal(new URL(f.calls.at(-1)[1]).searchParams.get('approvalTab'),'quality');assert(!f.selected.includes('render'));assert.equal(f.context.state.view,'player');
});
test('dirty, in-flight and unknown writes prevent switch or history rendering and are never retried',()=>{
 for(const kind of ['dirty','inFlight','paused','blocked']){const f=fixture();f.pending[kind]=true;vm.runInContext("navigate('editor')",f.context);assert.equal(f.calls.length,0);assert.equal(f.messages.length,1);}
 const f=fixture();f.drafts.unknown=true;f.location.search='?view=data&dataTab=quality-iqc';let stopped=false;f.events.popstate({stopImmediatePropagation(){stopped=true;}});assert(stopped);assert.equal(f.calls.length,0);assert.equal(new URL(f.location.href).searchParams.get('view'),'player');
 f.drafts.unknown=false;f.location.search='?view=data&dataTab=quality-iqc';f.events.popstate({stopImmediatePropagation(){}});assert.deepEqual(f.calls,[['reload']]);
});
test('actor invalidation removes old rendered/catalog data and requires a new document',()=>{
 const f=fixture();f.sync.requiresReload=true;f.sync.identity=null;f.events['process-delivery-invalidated']();assert(f.cleared());assert.deepEqual(Object.keys(f.window.IMPORTED_DATA),[]);assert.deepEqual(Object.keys(f.window.LINE_PROCESS_DATA),[]);vm.runInContext("navigate('editor')",f.context);assert.equal(f.calls.length,0);
 f.events.pageshow({persisted:true});assert.deepEqual(f.calls,[['reload']]);
});
