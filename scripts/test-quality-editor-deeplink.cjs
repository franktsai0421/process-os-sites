const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
// Execute the actual dual-system module and its existing app canView/navigate
// functions with memory DOM/history/storage fixtures only. No app, SDK or HTTP.
const dual=fs.readFileSync('public/process/dual-system.js','utf8'),app=fs.readFileSync('public/process/app.js','utf8');
function functionSource(source,signature){
 const start=source.indexOf(signature);assert.ok(start>=0,signature);const open=source.indexOf('{',start);let depth=0,quote='',escaped=false;
 for(let i=open;i<source.length;i++){const c=source[i];if(quote){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c===quote)quote='';continue;}if(['"',"'",'`'].includes(c)){quote=c;continue;}if(c==='{')depth++;if(c==='}'&&--depth===0)return source.slice(start,i+1);}
 throw Error('Unclosed actual source function');
}
const canViewSource=functionSource(app,'function canView(view)'),navigateSource=functionSource(app,'function navigate(view)');
const titlesStart=app.indexOf('const titles = '),titlesSource=app.slice(titlesStart,app.indexOf('};',titlesStart)+2);
assert.ok(titlesStart>=0&&titlesSource.includes('editor'));
let checks=0;
function run(query,{views=['dashboard','player','editor','approval','data'],role='admin',loggedIn=true,initial='dashboard',systemMemory}={}){
 const location={href:'http://127.0.0.1:41999/process/?'+query},events={},routes=[],toasts=[],storage=new Map(),counts={renders:0,login:0,fetch:0,baseEnter:0};
 if(systemMemory)storage.set('process-active-system',systemMemory);
 const sidebar={classList:{remove(){}}},nodes={'#eyebrow':{},'#page-title':{},'.sidebar':sidebar};
 const document={documentElement:{lang:'zh'},querySelector:selector=>nodes[selector]||null,querySelectorAll:()=>[],body:{classList:{toggle(){}}}};
 const user=loggedIn?{id:'synthetic',role,views:[...views],enabled:true}:null;
 const ctx={URL,location,document,state:{view:initial,dataTab:''},currentUser:user,root:{innerHTML:''},escapeHtml:value=>String(value),sessionStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},toast:message=>toasts.push(message),bindCommon(){},render(){counts.renders++;},renderLogin(){counts.login++;},applyPlatformIdentity(){},enterPlatform(value){ctx.currentUser=value;counts.baseEnter++;},fetch(){counts.fetch++;throw Error('Unexpected network');}};
 ctx.window={addEventListener(type,callback){(events[type]||=[]).push(callback);}};
 ctx.history={state:null,pushState(state,_unused,url){this.state=state;location.href=String(url);routes.push({kind:'push',url:String(url)});},replaceState(state,_unused,url){this.state=state;location.href=String(url);routes.push({kind:'replace',url:String(url)});}};
 vm.createContext(ctx);vm.runInContext(titlesSource+'\n'+canViewSource+'\n'+navigateSource+'\n'+dual,ctx,{filename:'actual-dual-system-route-fixture.js'});
 return{ctx,events,routes,toasts,storage,counts,url:()=>new URL(location.href),go:view=>ctx.window.ProcessDualSystem.go(view),pop(url){location.href=url;for(const fn of events.popstate||[])fn();}};
}
function check(name,fn){fn();checks++;console.log('PASS '+name);}
check('authorized quality editor direct URL survives initial boot and same-URL reload',()=>{
 const first=run('system=quality&view=editor');assert.equal(first.ctx.state.view,'editor');assert.equal(first.url().searchParams.get('system'),'quality');assert.equal(first.url().searchParams.get('view'),'editor');assert.equal(first.routes.length,0,'valid initial URL needs no extra history entry');
 const reloaded=run(first.url().search.slice(1));assert.equal(reloaded.ctx.state.view,'editor');assert.equal(reloaded.url().href,first.url().href);assert.equal(reloaded.routes.length,0);assert.equal(first.counts.fetch+reloaded.counts.fetch,0);
});
check('authorized process editor retains existing route and access behavior',()=>{
 const result=run('system=process&view=editor');assert.equal(result.ctx.state.view,'editor');assert.equal(result.url().searchParams.get('system'),'process');assert.equal(result.ctx.canView('editor'),true);
});
check('denied quality editor falls back without granting editor access',()=>{
 const result=run('system=quality&view=editor',{views:['dashboard','data']});assert.equal(result.ctx.canView('editor'),false);assert.equal(result.ctx.state.view,'quality-dashboard');assert.equal(result.url().searchParams.get('view'),'quality-dashboard');assert.deepEqual(result.routes.map(row=>row.kind),['replace']);result.go('editor');assert.equal(result.ctx.state.view,'quality-dashboard');assert.equal(result.url().searchParams.get('view'),'quality-dashboard');assert.equal(result.routes.length,1);assert.ok(result.toasts.length);
});
check('denied process editor, device and absent login do not acquire editor from URL',()=>{
 const denied=run('system=process&view=editor',{views:['dashboard']});assert.equal(denied.ctx.state.view,'dashboard');assert.equal(denied.ctx.canView('editor'),false);
 const device=run('system=quality&view=editor',{role:'device',views:['player'],initial:'player'});assert.equal(device.ctx.state.view,'player');assert.equal(device.ctx.canView('editor'),false);
 const anonymous=run('system=quality&view=editor',{loggedIn:false});assert.equal(anonymous.counts.login,1);assert.notEqual(anonymous.ctx.state.view,'editor');assert.equal(anonymous.routes.length,0);
});
check('existing quality data and approval links retain their routing and dataTab',()=>{
 const data=run('system=quality&view=data&dataTab=quality-iqc');assert.equal(data.ctx.state.view,'data');assert.equal(data.url().searchParams.get('dataTab'),'quality-iqc');
 const approval=run('system=quality&view=approval');assert.equal(approval.ctx.state.view,'approval');assert.equal(approval.url().searchParams.get('view'),'approval');
 for(const view of ['data','approval']){const denied=run('system=quality&view='+view,{views:['dashboard']});assert.equal(denied.ctx.state.view,'quality-dashboard');}
});
check('all existing quality views and unknown-view normalization remain unchanged',()=>{
 for(const view of ['quality-dashboard','quality-search','quality-reports','quality-inspections','quality-fpy']){const result=run('system=quality&view='+view);assert.equal(result.ctx.state.view,view);assert.equal(result.url().searchParams.get('view'),view);assert.equal(result.routes.length,0);}
 for(const system of ['quality','process']){const result=run('system='+system+'&view=not-a-view'),expected=system==='quality'?'quality-dashboard':'dashboard';assert.equal(result.ctx.state.view,expected);assert.equal(result.url().searchParams.get('view'),expected);assert.deepEqual(result.routes.map(row=>row.kind),['replace']);const reloaded=run(result.url().search.slice(1));assert.equal(reloaded.ctx.state.view,expected);assert.equal(reloaded.routes.length,0);}
});
check('actual shared go/editor URL, boot and popstate agree under existing canView gate',()=>{
 const result=run('system=quality&view=quality-dashboard');result.go('editor');assert.equal(result.ctx.state.view,'editor');assert.equal(result.url().searchParams.get('system'),'quality');assert.deepEqual(result.routes.map(row=>row.kind),['push']);const target=result.url().href;
 const other=run(new URL(target).search.slice(1));assert.equal(other.ctx.state.view,'editor');assert.equal(other.url().href,target);result.pop(target);assert.equal(result.ctx.state.view,'editor');assert.equal(result.routes.length,1,'popstate must not push another route');assert.equal(result.counts.fetch+other.counts.fetch,0);
});
check('quality login destination remains dashboard and qualityViews does not absorb editor',()=>{
 const result=run('system=quality&view=editor',{loggedIn:false});result.ctx.enterPlatform({id:'synthetic',role:'admin',views:['dashboard','editor']});assert.equal(result.ctx.state.view,'quality-dashboard');assert.equal(result.counts.baseEnter,1);assert.equal(Object.hasOwn(result.ctx.window.ProcessDualSystem.qualityViews,'editor'),false);assert.equal(result.counts.fetch,0);
});
console.log('PASS '+checks+' actual-module boot/navigation permission groups; no SDK/HTTP/GUI/data writes');
