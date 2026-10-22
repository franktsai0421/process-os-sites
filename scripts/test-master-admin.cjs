/* oxlint-disable typescript/no-require-imports -- Node CommonJS fixture loads actual signed handlers through require. */
/* Current component and signed-handler fixture; no server/browser or daily data. */
(async()=>{
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const defaultBase = fs.existsSync(path.join(__dirname, '..', 'public', 'process', 'master-admin-ui.js')) ? path.join(__dirname, '..', 'public', 'process') : path.join(__dirname, '..');
const base=path.resolve(process.argv[2]||defaultBase);
const clone=x=>JSON.parse(JSON.stringify(x));
const a={name:'AB',products:[{code:'A1',name:'Alpha',category:'SHARED',line:'A',unit:'PCS',specification:'',stages:['A-CUT']},{code:'B1',name:'Beta',category:'SHARED',line:'B',unit:'PCS',specification:'',stages:['B-CUT']}],lines:[{code:'A',name:'A line',stages:[{code:'A-CUT',name:'Cut'},{code:'A-END',name:'Finish'}]},{code:'B',name:'B line',stages:[{code:'B-CUT',name:'Cut B'}]}]};
const c={name:'C',products:[{code:'C1',name:'Component',category:'TURN',line:'C',unit:'PCS',stages:['C-TURN']}],lines:[{code:'C',name:'C line',stages:[{code:'C-TURN',name:'Turn'}]}]};
const version=(scope,number,status,snapshot)=>({id:scope+number,scope,number,status,snapshot:clone(snapshot),createdAt:'2026-09-03T01:00:00Z',updatedAt:'2026-09-03T01:00:00Z',history:[],warnings:[]});
const control={active:{AB:clone(a),C:clone(c)},versions:[version('AB',1,'approved',a),version('AB',2,'draft',a),version('C',1,'approved',c),version('C',2,'draft',c)]};
const nodes=new Map(),lists=new Map();let activeDialog=null,writes=0;
class Element{
 constructor(){this.options=[];this.style={};this.classList={add(){},remove(){},contains(){return false;}};this.handlers={};this.innerHTML='';this.value='';this.dataset={};this.isConnected=true;this.children=new Map();}
 addEventListener(n,f){this.handlers[n]=f;}
 querySelector(s){if(!this.children.has(s)){const e=new Element();if(s==='[name=line]')e.value='A';this.children.set(s,e);}return this.children.get(s);}
 querySelectorAll(){return [];}
 insertBefore(){} append(){} prepend(){} before(){} contains(){return false;} matches(){return false;} replaceChildren(){this.innerHTML="";} setAttribute(){} insertAdjacentHTML(position,html){this.innerHTML=html;this.position=position;} showModal(){this.open=true;} close(){this.open=false;this.handlers.close?.();} remove(){this.isConnected=false;if(activeDialog===this)activeDialog=null;} focus(){} scrollIntoView(){}
}
function node(s){if(s==='#master-edit-dialog')return activeDialog;if(!nodes.has(s))nodes.set(s,new Element());return nodes.get(s);}
const sandbox={console,state:{masterScope:'AB'},data:{products:clone(a.products),categories:['SHARED']},routing:{lines:clone(a.lines),productRoutes:{A1:{line:'A',stages:['A-CUT']},B1:{line:'B',stages:['B-CUT']}}},lines:[],approvalVersions:[],processMaster:{'A-CUT':[]},ensureProcessMasterStages:()=>false,currentUser:{id:'admin',role:'admin',name:'Admin'},LINE_C_MASTER:{products:c.products,stages:c.lines[0].stages},LineStageExcel:{exportFile(){},readFile:async()=>[],merge(){}},ApprovalTabs:{mount({page,masterHTML,onSelect}){page.innerHTML=masterHTML;page.position='tabs';page.onSelect=onSelect;}},readStore:()=>control,localStorage:{setItem(){writes++;}},escapeHtml:v=>String(v),toast(){},render(){},dataView(){},bindData(){},bomTable(){},processMasterView(){},userManagementView(){},bindDataInner(){},canApprove:()=>true,confirm:()=>true,FormData:class{constructor(f){this.values=f.values;}get(k){return this.values[k]??'';}},MutationObserver:class{observe(){}},document:{documentElement:{lang:'zh-Hant'},querySelector:node,querySelectorAll:s=>lists.get(s)||[],createElement:()=>new Element(),body:{appendChild(e){activeDialog=e;}},activeElement:null},addEventListener(){}};
sandbox.crypto=require("node:crypto").webcrypto;sandbox.scrollTo=()=>{};sandbox.URL=URL;sandbox.location={href:'http://localhost/process/'};sandbox.history={state:null,pushState(){}};
sandbox.window=sandbox;vm.createContext(sandbox);

vm.runInContext(fs.readFileSync(path.join(base,'version-draft-ui.js'),'utf8'),sandbox,{filename:'version-draft-ui.js'});
// Named preserved pure-component contract: no transport/lifecycle claim.
vm.runInContext(fs.readFileSync(path.join(base,'master-admin-ui.js'),'utf8'),sandbox,{filename:'master-admin-ui.js'});
const pureShared={client:()=>null,permissions:()=>({edit:true,save:true,submit:true,withdraw:true,history:true}),flow:()=>null,renderValidation(){},history:async()=>{},recover:async()=>{}};
const pure=sandbox.MasterAdminUI.install({state:sandbox.state,control,versions:()=>control.versions.filter(v=>v.scope===sandbox.state.masterScope),draft:()=>control.versions.find(v=>v.scope===sandbox.state.masterScope&&v.status==='draft'),pending:()=>control.versions.find(v=>v.scope===sandbox.state.masterScope&&v.status==='pending'),persist:async()=>{writes++;},record:(v,label,note)=>v.history.push({label,note}),validateCatalog:()=>[],shared:pureShared});
sandbox.dataView=()=>pure.masterView();sandbox.bindData=()=>pure.bindMaster();sandbox.render=()=>{node('#data-content').innerHTML=pure.masterView();pure.bindMaster();};
writes=0;
assert.match(sandbox.dataView(),/master-version-choice/);
assert.match(sandbox.dataView(),/A 線/);assert.match(sandbox.dataView(),/B 線/);
sandbox.bindData();
// Changing selected historical version is read-only and never replaces active data.
node('#master-version-choice').handlers.change({target:{value:'AB1'}});
assert.doesNotMatch(node('#data-content').innerHTML,/id="master-add-product"/);
assert.equal(control.active.AB.products[0].name,'Alpha');
node('#master-version-choice').handlers.change({target:{value:'AB2'}});
assert.match(node('#data-content').innerHTML,/id="master-add-product"/);
const categoryButton=new Element();categoryButton.dataset={categoryEdit:'SHARED',categoryLine:'A'};lists.set('[data-category-edit]',[categoryButton]);sandbox.bindData();
const before=JSON.stringify(control);categoryButton.onclick();assert.ok(activeDialog.open);assert.match(activeDialog.innerHTML,/Esc/);activeDialog.close();assert.equal(JSON.stringify(control),before);assert.equal(writes,0);
// Saving an A category must not rename the B category with the same name.
categoryButton.onclick();await activeDialog.querySelector('form').onsubmit({preventDefault(){},target:{values:{line:'A',name:'A-GROUP'}}});
const draft=control.versions.find(v=>v.id==='AB2');
assert.equal(draft.snapshot.products[0].category,'A-GROUP');assert.equal(draft.snapshot.products[1].category,'SHARED');assert.equal(control.active.AB.products[0].category,'SHARED');
node('#add-master-category').handlers.click();await activeDialog.querySelector('form').onsubmit({preventDefault(){},target:{values:{line:'A',name:'EMPTY'}}});
assert.equal(draft.snapshot.products.length,2);assert.ok(draft.snapshot.categoryGroups.some(g=>g.name==='EMPTY'));
// Product dialog constrains route choices, and changing line clears prior route.
node('#master-add-product').handlers.click();const dialog=activeDialog;
assert.match(dialog.innerHTML,/select name="unit"/);assert.match(dialog.innerHTML,/select name="category"/);
const lineInput=dialog.querySelector('[name=line]'),choices=dialog.querySelector('[name=stage-choice]');
assert.match(choices.innerHTML,/A-CUT/);assert.doesNotMatch(choices.innerHTML,/B-CUT/);
choices.value='A-CUT';dialog.querySelector('[data-route-add]').onclick();
lineInput.value='B';lineInput.onchange();assert.match(choices.innerHTML,/B-CUT/);assert.doesNotMatch(choices.innerHTML,/A-CUT/);
choices.value='B-CUT';dialog.querySelector('[data-route-add]').onclick();
await dialog.querySelector('form').onsubmit({preventDefault(){},target:{values:{code:'B2',name:'New beta',line:'B',category:'SHARED',unit:'PCS',specification:''}}});
assert.deepEqual(clone(draft.snapshot.products.find(p=>p.code==='B2').stages),['B-CUT']);
assert.equal(control.active.AB.products.length,2);
// Unit-model validation rejects duplicate identifiers and cross-line routes.
assert.equal(sandbox.MasterAdminUI.validProduct(draft.snapshot,{code:'B2',name:'Dup',line:'B',stages:[]}), 'duplicate');
assert.equal(sandbox.MasterAdminUI.validProduct(draft.snapshot,{code:'N',name:'N',line:'B',stages:['A-CUT']}), 'route');
sandbox.state.masterScope='C';sandbox.state.masterSection='lines';assert.match(sandbox.dataView(),/C-TURN/);assert.doesNotMatch(sandbox.dataView(),/A-CUT/);
sandbox.state.masterSection='products';sandbox.document.documentElement.lang='vi';assert.match(sandbox.dataView(),/Chọn phiên bản/);assert.match(sandbox.dataView(),/Thêm sản phẩm/);
// Actual component render of both legacy and V3 version events; raw rows remain immutable.
const historyDraft=control.versions.find(v=>v.id==='C2'),oldHistory=historyDraft.history;
const historyRows=[
 {label:'Legacy <label>',note:'Legacy <note>',actor:'Legacy <actor>',action:'approved',actorName:'ignored actor',comment:'ignored comment',at:'2026-10-16T11:00:00Z'},
 ...['submit','approved','returned','withdrawn'].map(action=>({action,actorId:'id-'+action,actorName:'V3 <'+action+'>',comment:'Reason <'+action+'>',at:'2026-10-16T11:01:00Z'})),
 {label:'',note:'',actor:'',action:'approved',actorName:'hidden actor',comment:'hidden comment',at:'2026-10-16T11:02:00Z'},
 {action:'<unknown>',actorName:'<unknown actor>',comment:'<unknown comment>',at:'2026-10-16T11:03:00Z'},
 {action:'constructor',actorName:{name:'bad actor'},comment:{text:'bad comment'},at:'2026-10-16T11:04:00Z'}
];
historyDraft.history=historyRows;const rawHistory=JSON.stringify(historyRows);
for(const language of ['zh-Hant','vi']){
 sandbox.document.documentElement.lang=language;const html=pure.masterView();
 for(const token of ['Legacy &lt;label&gt;','Legacy &lt;note&gt;','Legacy &lt;actor&gt;','V3 &lt;submit&gt;','V3 &lt;approved&gt;','V3 &lt;returned&gt;','V3 &lt;withdrawn&gt;','Reason &lt;submit&gt;','Reason &lt;approved&gt;','Reason &lt;returned&gt;','Reason &lt;withdrawn&gt;','&lt;unknown&gt;','&lt;unknown actor&gt;','&lt;unknown comment&gt;','constructor'])assert.ok(html.includes(token),token);
 for(const token of language==='vi'?['Gửi quản lý duyệt','Quản lý phê duyệt','Trả lại để sửa','Rút hồ sơ']:['送出主管審核','主管核准','發回修改','撤回送審'])assert.ok(html.includes(token),token);
 assert.doesNotMatch(html,/ignored actor|ignored comment|hidden actor|hidden comment|\[object Object\]|<unknown>/);
 assert.equal(JSON.stringify(historyRows),rawHistory);
}
historyDraft.history=oldHistory;
console.log('PASS actual master history renderer: bilingual V3 fields, legacy precedence/empty values, unknown escaping, typed metadata and raw immutability.');
console.log('PASS: grouped AB/C categories, empty categories, cancel-without-write, draft/history selection, line-specific ordered route choices, bilingual rendering.');

// Accessible platform tabs are source-level regression checks, not DOM/browser acceptance.
const tabsSource=fs.readFileSync(path.join(base,'approval-tabs.js'),'utf8');for(const pattern of [/data-review-tab/,/ArrowRight/,/aria-selected/,/textContent!==value/,/getAttribute\(name\)!==value/])assert.match(tabsSource,pattern);
assert.match(fs.readFileSync(path.join(base,'master-data.js'),'utf8'),/data-tab="line-admin"/);
console.log('PASS preserved component contracts; no legacy submit/approval assertions');
const {DatabaseSync}=require('node:sqlite'),{randomUUID,webcrypto}=require('node:crypto');
const repo=path.resolve(base,'../..');process.chdir(repo);
const db=new DatabaseSync(':memory:'),objects=new Map();for(const file of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())db.exec(fs.readFileSync(path.join('drizzle',file),'utf8'));
const env={PROCESS_SESSION_SECRET:randomUUID(),DB:{prepare(sql){let args=[];return{bind(...a){args=a;return this;},async first(){return db.prepare(sql).get(...args)||null;},async run(){return{meta:{changes:Number(db.prepare(sql).run(...args).changes)}};}};}},STATE_ARCHIVE:{async put(k,v){objects.set(k,Buffer.from(v));},async head(k){return objects.has(k)?{}:null;},async get(k){const b=objects.get(k);return b?{text:async()=>b.toString(),arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),body:new ReadableStream({start(c){c.enqueue(b);c.close();}})}:null;}}};
const load=require(path.join(repo,'scripts/ipqc-ab-import-harness.cjs'))(env),core=load('lib/process-state.ts'),route=load('app/api/master/workflow/route.ts');
const actualControl={active:{AB:clone(a),C:clone(c),PROCESS:{}},versions:[version('AB',1,'approved',a),version('C',1,'approved',c),version('PROCESS',1,'approved',{})]};
const users=[{id:'admin',name:'Synthetic admin',role:'admin',enabled:true,inheritRole:true},{id:'reviewer',name:'Synthetic reviewer',role:'admin',enabled:true,inheritRole:true}];
db.prepare('INSERT INTO shared_state(id,revision,"values",updated_at) VALUES(1,1,?,?)').run(JSON.stringify({platformUsers:JSON.stringify(users),masterDataControl:JSON.stringify(actualControl),processMasterData:'{}',versionSampleSeed4:'true'}),'fixture');
const session={};for(const u of users)session[u.id]={Cookie:'process_demo='+await core.demoSession(new Request('http://127.0.0.1'),u.id,false),Origin:'http://127.0.0.1','Content-Type':'application/json'};
const transportCalls=[],storage=new Map(),actualSandbox={...sandbox,state:{masterScope:'AB',view:'data'},currentUser:users[0],readStore:(key,fallback)=>key==='masterDataControl'?actualControl:fallback,platformUsers:users,dispatchBoard:{},approvalVersions:[],ProcessSync:{identity:{id:'admin',role:'admin'},platformHeaders:()=>session.admin},sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},crypto:webcrypto,AbortController,URL,Request,Response,Headers,CustomEvent:class{},setTimeout:(fn,ms)=>{assert.equal(typeof fn,'function');return ms===4000?0:setTimeout(()=>fn(),ms);},clearTimeout,addEventListener(){},dispatchEvent(){},fetch:async(url,options={})=>{transportCalls.push({url,method:options.method||'GET'});const req=new Request(new URL(url,'http://127.0.0.1'),options);return route[req.method](req);},VersionDraftUI:{reasonFor:()=>'',confirmSubmit:async()=> 'Explicit synthetic fixed-save submit',confirmReview:async({selfReview})=>({reason:'Explicit synthetic review reason',selfReviewConfirmed:selfReview})}};
actualSandbox.document={...sandbox.document,visibilityState:'hidden',body:{...sandbox.document.body,style:{}}};actualSandbox.window=actualSandbox;vm.createContext(actualSandbox);
const files=['shared-draft-client.js','master-admin-ui.js','master-shared-client.js','master-review.js','master-data.js'];
for(const f of files)vm.runInContext(fs.readFileSync(path.join(base,f),'utf8'),actualSandbox,{filename:f});
const bridge=actualSandbox.MasterDataWorkflow.shared;await bridge.load('AB');await bridge.execute('AB','begin');
const unsavedRequestCount=transportCalls.length;await assert.rejects(()=>bridge.submit('AB'));assert.equal(transportCalls.length,unsavedRequestCount,'no Save must not create Submit request');
const flow=bridge.flow('AB');const product=flow.working.products[0],productPath=['products',{id:product.id},'name'];await bridge.patch('AB',[{op:'set',path:productPath,value:'Saved synthetic name'}],[{path:productPath,value:product.name}]);
await bridge.execute('AB','save');const saved=clone(bridge.flow('AB').saved);await bridge.patch('AB',[{op:'set',path:productPath,value:'Later unsaved name'}],[{path:productPath,value:'Saved synthetic name'}]);
const submitted=await bridge.submit('AB'),id=submitted.receipt.caseId;const readCase=async(id,actor='admin')=>{const r=await route.GET(new Request('http://127.0.0.1/api/master/workflow?scope=AB&caseId='+id,{headers:session[actor]}));assert.equal(r.status,200);return(await r.json()).reviewCase;};
assert.deepEqual((await readCase(id)).content,saved.content);
await assert.rejects(()=>bridge.execute('AB','withdraw',{caseId:id,reason:''}),e=>e.message==='REASON_REQUIRED');
await bridge.review('AB','withdraw',id);assert.equal(bridge.flow('AB').pendingId,null);assert.deepEqual(clone(bridge.flow('AB').working),saved.content);
const again=await bridge.submit('AB'),second=again.receipt.caseId;assert.notEqual(second,id);
await assert.rejects(()=>bridge.execute('AB','approve',{caseId:second,reason:'Missing self confirmation'}),e=>e.message==='SELF_REVIEW_CONFIRM_REQUIRED');
await bridge.review('AB','approve',second);const history=await readCase(id),approved=await readCase(second);assert.equal(history.status,'withdrawn');assert.deepEqual(history.content,saved.content);assert.equal(approved.status,'approved');assert.equal(approved.result.selfReview,true);assert.equal(approved.result.actor.id,'admin');
const sourceHashes=Object.fromEntries(files.map(f=>[f,require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(base,f))).digest('hex')]));
console.log(JSON.stringify({status:'PASS',legacyComponent:'named pure-component-only contracts; no workflow acceptance claim',currentPart:'actual index-ordered loader/shared client/master bridge/SQLite signed handlers',files,sourceHashes,caseIds:[id,second],savedId:saved.id,transportRequestCount:transportCalls.length,checks:['grouped AB/C category','dialog Cancel noWrite','line-route constraints','bilingual/history selection read-only','accessible tabs source','current loader dependencies','no Save no Submit request','saved fixed snapshot excludes unsaved','withdraw requires reason','withdraw content retention','same saved resubmit new case','self-review requires confirmation and audited result'],GUI:'NOT_RUN; DOM scaffolding and confirmation decision inputs only, not browser dialogs'},null,2));db.close();console.log('PASS actual current loader/bridge/handler contracts');
})().catch(e=>{console.error(JSON.stringify({test:'master-admin',result:'FAIL',type:e.name,code:e.code,frames:e.stack?.split('\n').filter(line=>/^\s*at /.test(line)).slice(0,5)}));process.exitCode=1;});
