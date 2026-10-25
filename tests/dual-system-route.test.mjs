import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const actualSource = fs.readFileSync('public/process/dual-system.js', 'utf8');
const origin = 'https://fixture.invalid/process/';
function fixture({search = '', remembered, user = {id:'fixture-owner', role:'admin'}, allowed = ['dashboard','player','dispatch','productStatus','approval','editor','data'], source = actualSource} = {}) {
  const stored = new Map(remembered === undefined ? [] : [['process-active-system', remembered]]);
  const events = {}, historyCalls = [], toasts = [], nodes = new Map();
  const state = {view: user?.role === 'device' ? 'player' : 'dashboard', dataTab:'AB'};
  const location = {href: origin + search};
  const classes = () => ({add(){},remove(){},toggle(){}});
  const button = system => ({dataset:{loginSystem:system},classList:classes(),setAttribute(){}});
  const loginButtons = [button('process'),button('quality')];
  let switcher = null, loginChooser = null, loginRenders = 0, deviceEntries = 0, entries = 0;
  const brand = {innerHTML:''}, nav = {innerHTML:'',querySelectorAll(){return [];}}, content = {dataset:{},innerHTML:''};
  const sidebar = {classList:classes(),querySelector(selector){return selector === '.brand' ? brand : selector === '.system-switcher' ? switcher : selector === '.sidebar-foot' ? {before(n){switcher=n;}} : null;}};
  const deviceButton = {onclick(){deviceEntries++;}};
  const document = {
    body:{classList:classes()},
    querySelector(selector){
      if(selector === '.sidebar') return sidebar;
      if(selector === '#main-nav') return nav;
      if(selector === '.master-tabs') return null;
      if(selector === '#data-content') return content;
      if(selector === '.demo-identities') return {before(n){loginChooser=n;}};
      if(selector === '#device-entry-button') return deviceButton;
      if(!nodes.has(selector)) nodes.set(selector,{textContent:''});
      return nodes.get(selector);
    },
    querySelectorAll(){return [];},
    createElement(){return {classList:classes(),setAttribute(){},remove(){switcher=null;},querySelectorAll(){return loginButtons;}};},
  };
  const context = {URL, location, document, state, currentUser:user,
    sessionStorage:{getItem:k=>stored.get(k) ?? null,setItem:(k,v)=>stored.set(k,v)},
    history:{state:{},pushState(s,_title,url){this.state=s;location.href=String(url);historyCalls.push('push');},replaceState(s,_title,url){this.state=s;location.href=String(url);historyCalls.push('replace');}},
    window:{addEventListener:(name,fn)=>{events[name]=fn;},ProcessI18n:{apply(){}}},
    titles:Object.fromEntries(allowed.map(key=>[key,key])),
    root:{innerHTML:''},escapeHtml:String,toast:v=>toasts.push(v),bindCommon(){},
    render(){},renderLogin(){loginRenders++;},
    canView:view=>!!context.currentUser && allowed.includes(view),
    navigate(view){if(!context.currentUser || !allowed.includes(view))return;state.view=view;context.render();},
    enterPlatform(actor){entries++;context.currentUser=actor;},
  };
  vm.runInNewContext(source, context, {filename:'actual-dual-system.js',timeout:1000});
  return {context,state,location,stored,toasts,historyCalls,content,nav,
    api:context.window.ProcessDualSystem,
    switch:()=>switcher?.onclick(),
    loginSelect:system=>loginButtons.find(b=>b.dataset.loginSystem===system).onclick(),
    deviceEntry:()=>deviceButton.onclick({}),
    pop(search){location.href=origin+search;events.popstate();},
    counters:()=>({loginRenders,deviceEntries,entries,loginChooser:!!loginChooser}),
  };
}

const tests=[];
function test(name, run){run();tests.push(name);console.log('PASS '+name);}
test('explicit process wins over remembered quality on first entry and reload',()=>{
  let f=fixture({search:'?system=process&view=dashboard',remembered:'quality'});
  assert.equal(f.api.activeSystem,'process');assert.equal(f.state.view,'dashboard');
  assert.equal(new URL(f.location.href).searchParams.get('system'),'process');
  f=fixture({search:new URL(f.location.href).search,remembered:f.stored.get('process-active-system')});
  assert.equal(f.api.activeSystem,'process');assert.equal(f.state.view,'dashboard');
});
test('explicit quality wins over remembered process and preserves selected quality page',()=>{
  const f=fixture({search:'?system=quality&view=quality-search',remembered:'process'});
  assert.equal(f.api.activeSystem,'quality');assert.equal(f.state.view,'quality-search');
});
test('absent or invalid selector retains remembered/default compatibility',()=>{
  for(const search of ['', '?system=invalid']){
    assert.equal(fixture({search,remembered:'quality'}).api.activeSystem,'quality');
    assert.equal(fixture({search,remembered:'invalid'}).api.activeSystem,'process');
    assert.equal(fixture({search}).api.activeSystem,'process');
  }
});
test('explicit process retains authorized editor and shared data deep links',()=>{
  for(const view of ['editor','data','approval']){
    const f=fixture({search:'?system=process&view='+view,remembered:'quality'});
    assert.equal(f.state.view,view);assert.equal(f.api.activeSystem,'process');
  }
});
test('normal system switch keeps destination, URL, history and remembered choice coherent',()=>{
  const f=fixture({search:'?system=process&view=dashboard',remembered:'quality'});
  f.switch();assert.equal(f.state.view,'quality-dashboard');assert.equal(f.stored.get('process-active-system'),'quality');
  assert.equal(new URL(f.location.href).searchParams.get('system'),'quality');
  f.switch();assert.equal(f.state.view,'dashboard');assert.equal(f.stored.get('process-active-system'),'process');
  assert.equal(new URL(f.location.href).searchParams.get('system'),'process');
  assert.deepEqual(f.historyCalls,['push','push']);
});
test('back and forward use URL system and selected view, including shared quality data tab',()=>{
  const f=fixture({search:'?system=quality&view=quality-dashboard'});
  f.pop('?system=process&view=dashboard');assert.equal(f.api.activeSystem,'process');assert.equal(f.state.view,'dashboard');
  f.pop('?system=quality&view=data&dataTab=quality-iqc');assert.equal(f.api.activeSystem,'quality');assert.equal(f.state.view,'data');assert.equal(f.content.dataset.activeTab,'quality-iqc');
  f.pop('?system=process&view=editor');assert.equal(f.api.activeSystem,'process');assert.equal(f.state.view,'editor');
});
test('signed-out URL choice displays login; manual choice affects only later normal entry',()=>{
  const f=fixture({search:'?system=process',remembered:'quality',user:null});
  assert.equal(f.api.activeSystem,'process');assert.equal(f.counters().loginRenders,1);assert.equal(f.counters().entries,0);
  f.pop('?system=quality&view=quality-dashboard');assert.equal(f.api.activeSystem,'process');
  f.api.go('quality-dashboard');assert.equal(f.state.view,'dashboard');assert.equal(f.toasts.length,1);
  f.loginSelect('quality');assert.equal(f.api.activeSystem,'quality');assert.equal(f.counters().entries,0);
  f.context.enterPlatform({id:'fixture-user',role:'staff'});assert.equal(f.counters().entries,1);assert.equal(f.state.view,'quality-dashboard');
});
test('device entry still forces process and device cannot navigate to quality',()=>{
  const login=fixture({user:null,search:'?system=quality'});login.deviceEntry();assert.equal(login.api.activeSystem,'process');assert.equal(login.counters().deviceEntries,1);
  const f=fixture({user:{id:'fixture-device',role:'device'},search:'?system=process&view=player'});
  f.api.go('quality-dashboard');assert.equal(f.state.view,'player');assert.equal(f.toasts.length,1);
});
test('explicit process does not grant denied data view',()=>{
  const f=fixture({search:'?system=process&view=data',remembered:'quality',allowed:['dashboard']});
  assert.equal(f.state.view,'dashboard');assert.equal(f.context.canView('data'),false);assert.match(f.nav.innerHTML,/data-dual-view="data" disabled/);
});
console.log(JSON.stringify({status:'PASS_SYNTHETIC_ACTUAL_DUAL_SYSTEM_ROUTE',cases:tests.length,tests,network:false,credentials:false,businessWrites:false}));
