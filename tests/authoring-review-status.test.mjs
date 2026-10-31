import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

// Execute the current complete controller with synthetic DOM/transport ports.
// Track actual node identity on innerHTML writes; no browser/layout claim.
const source=fs.readFileSync(new URL('../public/process/process-authoring-v3.js',import.meta.url),'utf8');
const drain=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};

async function fixture(language='zh'){
 let enabled=false,epoch=1,htmlWrites=0,nextTimer=0,heldRead=null;
 const timers=new Map(),requests=[],inspections=[],opened=[],errors=[];
 const permissions={view:true,edit:true,save:true,submit:true,withdraw:true,approve:true,return:true,history:true,delete:true};
 const model={activeVersionId:'active',versions:[{id:'active',number:1,status:'approved'},{id:'case-one',number:2,status:'pending'}],workflow:{schemaVersion:3,scope:'process:platform',generation:'generation-one',revision:1,pendingId:'case-one',saved:null,working:{workspaces:[]},cases:[{id:'case-one',status:'pending',actor:{id:'submitter',name:'Synthetic author'},reason:'Synthetic pending case'}]}};
 let buttons=new Map(),advisory=null,markup='';
 const target={dataset:{},get innerHTML(){return markup;},set innerHTML(value){markup=value;htmlWrites++;for(const button of buttons.values())button.isConnected=false;buttons=new Map([...value.matchAll(/<button\b[^>]*data-process-review="([^"]+)"[^>]*>/g)].map(match=>[match[1],{dataset:{processReview:match[1]},disabled:false,isConnected:true}]));advisory=value.includes('data-authoring-review-inspection')?{textContent:'',hidden:true}:null;},querySelector:selector=>selector==='[data-authoring-review-inspection]'?advisory:null,querySelectorAll:selector=>selector==='[data-process-review]'?[...buttons.values()]:[]};
 const parent={querySelector:selector=>selector==='#authoring-v3-review'?target:null};
 const payload=()=>({control:structuredClone(model),permissions:{...permissions},revision:model.workflow.revision});
 const client={async read(){requests.push('state');if(heldRead)await heldRead.promise;return payload();},contentIssues(){requests.push('contentIssues');const d=deferred();inspections.push(d);return d.promise;},hasUnknown:()=>false,hasSyncFailures:()=>false,permission:key=>permissions[key]};
 const c={console,structuredClone,JSON,Map,Set,Error,URL,document:{documentElement:{lang:language},querySelector:selector=>selector==='#approval-panel-process'?parent:null,querySelectorAll:()=>[],addEventListener(){},createElement:()=>({dataset:{}}),activeElement:null},localStorage:{getItem:()=>enabled?'{}':null},state:{view:'approval',approvalTab:'process',category:'group',editorLine:'A',editorByCategory:{}},ProcessSync:{identity:{id:'reviewer'},requiresReload:false,identityGeneration:()=>epoch,captureDelivery:()=>epoch,isCurrentDelivery:owner=>owner===epoch,platformHeaders:()=>({})},ProcessCanvasLocal:{accept(){},dirty:()=>false},VersionDraftUI:{preserveView:()=>()=>{},updateSaved(){}},createMasterSharedBridge:()=>({diff:()=>({patches:[],guards:[]})}),createSharedDraftClient:()=>client,render(){},bindView(){},renderInspector(){},toast:value=>errors.push(value),setInterval(){},setTimeout(fn){timers.set(++nextTimer,fn);return nextTimer;},clearTimeout:id=>timers.delete(id),queueMicrotask,escapeHtml:value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'),editorKey:()=> 'group:A',openSharedDraftHistory:async options=>opened.push(options)};c.window=c;
 vm.runInNewContext(source.replace('host.ProcessAuthoringV3={','host.__reviewTest={panel,inspectLater,error,setBusy:value=>busy=value};host.ProcessAuthoringV3={'),c,{filename:'process-authoring-v3.js'});enabled=true;await c.ProcessAuthoringV3.load();
 return{c,client,model,permissions,requests,opened,errors,get writes(){return htmlWrites;},get markup(){return markup;},get advisory(){return advisory;},button:name=>buttons.get(name),panel:()=>c.__reviewTest.panel(),load:()=>c.ProcessAuthoringV3.load(),async start(){for(const [id,fn]of timers){timers.delete(id);fn();}await drain();},async complete(){inspections.at(-1).resolve({generation:model.workflow.generation,revision:model.workflow.revision,working:{checked:true,issues:[]},saved:{checked:false,id:null,issues:[]},review:{checked:true,id:model.workflow.pendingId,issues:[],fixed:true}});await drain();},async fail(message='CONTENT_ISSUES_LOAD_FAILED'){inspections.at(-1).reject(Error(message));await drain();},retry(){c.__reviewTest.inspectLater(true);c.__reviewTest.panel();},invalidate(){epoch++;},holdRead(){heldRead=deferred();return heldRead.resolve;}};
}

for(const language of ['zh','vi'])void test(`${language}: scheduled/pending/completed advisory keeps the toolbar node, focus, labels and enabled state`,async()=>{
 const f=await fixture(language),view=f.button('view'),writes=f.writes;f.c.document.activeElement=view;
 assert.equal(f.advisory.hidden,false);assert.match(f.advisory.textContent,language==='zh'?/內容驗證中/:/Đang kiểm tra/);assert.equal(view.disabled,false);
 await f.start();f.panel();assert.equal(f.button('view'),view);await f.complete();assert.equal(f.button('view'),view);assert.equal(f.c.document.activeElement,view);assert(view.isConnected);assert.equal(f.writes,writes);assert.equal(view.disabled,false);assert.equal(f.advisory.hidden,true);assert.equal(f.advisory.textContent,'');
 assert.deepEqual(f.requests,['state','contentIssues']);assert.match(f.markup,language==='zh'?/查看／審核/:/Xem \/ duyệt/);
});
void test('failure stays visible as text, retry does not replace the toolbar or add reads beyond one explicit inspection',async()=>{
 const f=await fixture(),view=f.button('view'),writes=f.writes;await f.start();await f.fail('<unsafe advisory>');assert.equal(f.button('view'),view);assert.equal(f.advisory.hidden,false);assert.match(f.advisory.textContent,/驗證未完成.*<unsafe advisory>/);assert(!f.markup.includes('<unsafe advisory>'));
 f.retry();assert.equal(f.button('view'),view);assert.match(f.advisory.textContent,/內容驗證中/);await f.start();await f.complete();assert.equal(f.writes,writes);assert.equal(f.advisory.hidden,true);assert.deepEqual(f.requests,['state','contentIssues','contentIssues']);
});
void test('real case changes still rebuild the card and current handler opens only its freshly checked case',async()=>{
 const f=await fixture(),old=f.button('view'),writes=f.writes;f.model.workflow.pendingId='case-two';f.model.workflow.revision++;f.model.workflow.cases.push({id:'case-two',status:'pending',actor:{id:'other',name:'Different author'},reason:'Different case'});await f.load();assert.notEqual(f.button('view'),old);assert.equal(old.isConnected,false);assert(f.writes>writes);await f.button('view').onclick();assert.equal(f.opened.length,1);assert.equal(f.opened[0].caseId,'case-two');assert.equal(f.requests.filter(x=>x==='state').length,3);
});
void test('permission revocation removes historical actions and stale View still performs a fresh denying read',async()=>{
 const f=await fixture(),old=f.button('view'),writes=f.writes;f.permissions.history=false;f.permissions.withdraw=false;f.permissions.approve=false;f.permissions.return=false;await f.load();assert.equal(f.button('history'),undefined);assert.equal(f.button('withdraw'),undefined);assert(f.writes>writes);assert.notEqual(f.button('view'),old);
 await f.button('view').onclick();assert.equal(f.opened.length,0);assert(f.errors.includes('DRAFT_REVISION_CHANGED_RECONFIRM'));
});
void test('freshly revoked approve permission leaves the review case readable with its approve action disabled',async()=>{
 const f=await fixture();f.permissions.approve=false;await f.button('view').onclick();assert.equal(f.opened.length,1);assert.equal(f.opened[0].reviewActions.find(action=>action.name==='approve').enabled,false);assert.equal(f.opened[0].reviewActions.find(action=>action.name==='return').enabled,true);
});
void test('actual load errors retain the existing full-card update and busy changes still disable controls',async()=>{
 const f=await fixture(),old=f.button('view'),writes=f.writes;f.c.__reviewTest.error(Error('AUTHORING_LOAD_REQUIRED'));assert(f.writes>writes);assert.notEqual(f.button('view'),old);assert.match(f.markup,/AUTHORING_LOAD_REQUIRED/);f.c.__reviewTest.setBusy(true);f.panel();assert.equal(f.button('view').disabled,true);assert.equal(f.button('reload').disabled,true);f.c.__reviewTest.setBusy(false);f.panel();assert.equal(f.button('reload').disabled,false);
});
void test('late advisory after delivery replacement cannot alter the new card or grant review access',async()=>{
 const f=await fixture();await f.start();const view=f.button('view'),writes=f.writes,status=f.advisory.textContent;f.invalidate();await f.complete();assert.equal(f.writes,writes);assert.equal(f.advisory.textContent,status);assert.equal(f.button('view'),view);const release=f.holdRead(),open=view.onclick();await drain();f.invalidate();release();await open;assert.equal(f.opened.length,0);
});
