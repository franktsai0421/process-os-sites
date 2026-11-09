/* Actual shared JS in a synthetic DOM/timer port; five cases also use actual C handlers
 * with normal synthetic logins and private SQLite/R2. No browser/server/live-data claim. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {webcrypto,createHash}=require('node:crypto');
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'public/process/shared-draft-client.js'),'utf8');
const clone=value=>JSON.parse(JSON.stringify(value));
const rights=()=>({view:true,history:true,edit:true,restore:true,approve:true,return:true});
const preview={generation:'g-restore',expectedRevision:7,restoreSaveId:'save0',before:{items:[{id:'row0',standard:'current'}]},after:{items:[{id:'row0',standard:'saved'}]},source:{actor:{name:'Synthetic author'},at:'synthetic'}};
function fixture({routeFetch=null,guardAccessResults=false}={}){
 const timers=new Map(),calls=[],memory=new Map(),storageWrites=[],overlays=[];let timerId=0,access=rights(),applied=0,editable=true,intercept=null;
 const input={text:'尚未儲存 中文 Việt',photos:[{id:'pending-photo',note:'retain'}]},inputBefore=clone(input);
 class Element{
  constructor(tag='div',attrs=''){this.tag=tag;this.attrs=attrs;this.dataset=Object.fromEntries([...attrs.matchAll(/data-([\w-]+)="([^"]*)"/g)].map(m=>[m[1].replace(/-([a-z])/g,(_m,c)=>c.toUpperCase()),m[2]]));this.style={};this.children=[];this.buttons=[];this.listeners={};this.disabled=/\bdisabled\b/.test(attrs);this.isConnected=false;this.textContent='';}
  set innerHTML(html){this.renderCount=(this.renderCount||0)+1;this.html=html;this.buttons=[...html.matchAll(/<button\b([^>]*)>/g)].map(match=>new Element('button',match[1]));this.main=new Element('main');this.error=new Element('div');}
  get innerHTML(){return this.html||'';}
  querySelector(selector){if(selector==='main')return this.main;if(selector==='#shared-restore-error')return this.error;return this.querySelectorAll(selector)[0]||null;}
  querySelectorAll(selector){if(selector==='button')return this.buttons;if(selector==='button:not(:disabled)')return this.buttons.filter(button=>!button.disabled);const match=selector.match(/^\[([^\]]+)\]$/);return match?this.buttons.filter(button=>button.attrs.includes(match[1])):[];}
  addEventListener(kind,fn){this.listeners[kind]=fn;}setAttribute(key,value){this[key]=value;}
  append(...nodes){for(const node of nodes){this.children.push(node);node.parent=this;node.isConnected=true;}}prepend(...nodes){this.append(...nodes);}
  remove(){this.isConnected=false;if(this.parent)this.parent.children=this.parent.children.filter(node=>node!==this);}focus(){document.activeElement=this;}
 }
 const body=new Element('body'),dirtyInput=new Element('input');dirtyInput.value=input.text;dirtyInput.selectionStart=2;dirtyInput.selectionEnd=5;body.append(dirtyInput);body.style.overflow='';body.append=node=>{body.children.push(node);overlays.push(node);node.parent=body;node.isConnected=true;};
 const document={body,documentElement:{lang:'zh'},activeElement:dirtyInput,createElement:tag=>new Element(tag),addEventListener(){},removeEventListener(){},querySelector:()=>null,querySelectorAll:selector=>selector==='.shared-restore-overlay'?body.children.filter(node=>node.className==='shared-restore-overlay'):[]};
 const listeners={};const window={ProcessSync:{identity:{id:'preview-editor'},requiresReload:false},addEventListener(name,fn){listeners[name]=fn;}};
 const fetch=async(url,options={})=>{
  const method=options.method||'GET',query=new URL(url,'http://fixture').searchParams,body=options.body?JSON.parse(options.body):null,call={method,url,body};calls.push(call);
  let response;
  if(routeFetch)response=await routeFetch(url,options);
  else if(method==='POST'){const command=body.command;response=Response.json({receipt:{operationId:command.operationId,generation:command.generation,revision:8,savedId:'save0',caseId:null,unchanged:false}});}
  else if(query.has('permissions'))response=Response.json({permissions:access,unchanged:true});
  else if(query.has('operationId'))response=Response.json({error:'OPERATION_NOT_FOUND'},{status:404});
  else if(query.has('restoreSaveId'))response=Response.json(preview);
  else if(query.has('legacyHistory'))response=Response.json({versions:[{id:'legacy0',status:'approved',number:1,creatorName:'Legacy author'}],next:null});
  else if(query.has('legacyVersionId'))response=Response.json({legacyVersion:{id:'legacy0',status:'approved',snapshot:preview.after}});
  else if(query.has('caseId'))response=Response.json({reviewCase:{id:'case0',savedId:'save0',status:'approved',actor:{name:'Author'},before:preview.before,content:preview.after}});
  else if(query.has('history'))response=Response.json({cases:[],next:null});
  else throw Error('UNEXPECTED_SYNTHETIC_READ');
  if(intercept)response=await intercept(call,response);
  call.status=response.status;return response;
 };
 vm.runInNewContext(source,{window,document,console,crypto:webcrypto,AbortController,URL,URLSearchParams,location:{origin:'http://fixture'},fetch,setTimeout:(fn,ms)=>{const id=++timerId;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id),sessionStorage:{getItem:key=>memory.get(key)||null,setItem:(key,value)=>{storageWrites.push(['set',key,value]);memory.set(key,value);},removeItem:key=>{storageWrites.push(['remove',key]);memory.delete(key);}}},{filename:'actual-shared-draft-client.js'});
 const client=window.createSharedDraftClient({endpoint:'/api/ipqc-c/workflow?caseMetadata=1',actorId:'preview-editor',guardAccessResults,headers:()=>({})});
 const openPreview=async(selectedClient=client)=>{await window.previewSharedDraftRestore({client:selectedClient,savedId:'save0',onApplied:async()=>{applied++;}});return overlays.at(-1);};
 const openHistory=async(options={})=>{await window.openSharedDraftHistory({client,editable:()=>editable,onApplied:async()=>{applied++;},caseId:'case0',...options});return overlays.at(-1);};
 function idle(){assert.equal(timers.size,0,'idle dialogs have no recurring timers or pending request deadlines');}
 const stable=()=>({input:clone(input),dirtyInput:{value:dirtyInput.value,selectionStart:dirtyInput.selectionStart,selectionEnd:dirtyInput.selectionEnd,isConnected:dirtyInput.isConnected},recovery:[...memory],storageWrites:clone(storageWrites)});
 return{window,listeners,client,calls,overlays,body,memory,storageWrites,input,inputBefore,stable,idle,openPreview,openHistory,focused:()=>document.activeElement,hydrate:()=>client.permissions(),setAccess:value=>{access=value;},setEditable:value=>{editable=value;},intercept:fn=>{intercept=fn;},applied:()=>applied};
}
const button=(overlay,kind)=>{const result=overlay.querySelector('[data-'+kind+']');assert(result,kind+' button exists');return result;};
function retained(f,before,start,label){assert.equal(f.calls.length,start,label+' zero dispatch');assert.deepEqual(f.stable(),before,label+' input/recovery unchanged');assert.equal(f.applied(),0);}



void test('history-only users retain readable history without a Restore button or forced closing',async()=>{
 for(const value of [undefined,false,null,'true']){const f=fixture();f.setAccess({...rights(),restore:value});await f.hydrate();const overlay=await f.openHistory();assert.equal(overlay.querySelector('[data-restore]'),null);f.idle();assert.equal(overlay.isConnected,true);assert.equal(f.calls.filter(call=>call.method==='POST').length,0);assert.deepEqual(f.input,f.inputBefore);}
});












void test('source receipt identifies exact shared implementation',t=>{t.diagnostic(JSON.stringify({sharedClientSha256:createHash('sha256').update(source).digest('hex'),boundary:'Actual shared JS; synthetic DOM/timers. Actual signed C-handler retirement/private SQLite/R2; no native/browser/live-site acceptance.'}));});

function holdNext(f,predicate){let release,started;const ready=new Promise(resolve=>{started=resolve;});let used=false;f.intercept(async(call,response)=>{if(!used&&predicate(call)){used=true;started();await new Promise(resolve=>{release=resolve;});}return response;});return{ready,release:()=>release()};}
const permissionsRead=call=>call.url.includes('permissions=1');
const posts=f=>f.calls.filter(call=>call.method==='POST');
const changeOwner=(f,mode)=>{if(mode==='close')f.overlays.at(-1).remove();else if(mode==='actor')f.window.ProcessSync.identity={id:'different'};else if(mode==='same-id-object')f.window.ProcessSync.identity={id:'preview-editor'};else if(mode==='terminal')f.window.ProcessSync.requiresReload=true;else if(mode==='pagehide')f.listeners.pagehide();else f.bump(mode);};
function epochFixture(options){const f=fixture(options);let epoch=4,delivery={};Object.assign(f.window.ProcessSync,{identityGeneration:()=>epoch,captureDelivery:()=>delivery,isCurrentDelivery:value=>value===delivery});f.bump=mode=>{if(mode==='epoch')epoch++;else delivery={};};return f;}


for(const phase of ['permissions=1','history=cases','caseId='])void test('history '+phase+' reply after close cannot paint, focus, reenable or dispatch',async()=>{
 const f=fixture();await f.hydrate();const hold=holdNext(f,c=>c.url.includes(phase)),opening=f.openHistory();await hold.ready;const overlay=f.overlays.at(-1),renders=overlay.renderCount;button(overlay,'close').onclick();const count=f.calls.length;hold.release();await opening;assert.equal(overlay.isConnected,false);assert.equal(overlay.renderCount,renders);assert.equal(f.calls.length,count);assert.equal(posts(f).length,0);assert.equal(f.body.style.overflow,'');f.idle();
});
for(const mode of ['actor','same-id-object','terminal','pagehide','epoch','delivery'])void test('history fresh permission fences '+mode+' before data request',async()=>{
 const f=mode==='epoch'||mode==='delivery'?epochFixture():fixture();await f.hydrate();const hold=holdNext(f,permissionsRead),opening=f.openHistory();await hold.ready;changeOwner(f,mode);const count=f.calls.length;hold.release();await opening;assert.equal(f.calls.length,count);assert.equal(posts(f).length,0);assert(!f.overlays.at(-1).innerHTML.includes('case0'));f.idle();
});




for(const action of ['approve','return'])for(const value of [undefined,false,null,'true',true])void test('review '+action+' requires fresh exact true '+String(value)+' and original pending case',async()=>{
 const f=fixture();await f.hydrate();f.intercept((call,response)=>call.url.includes('caseId=')?Response.json({reviewCase:{id:'case0',status:'pending',actor:{name:'Synthetic'},before:{},content:{}}}):response);const reviewed=[];const overlay=await f.openHistory({reviewActions:[{name:action,label:action,enabled:true}],onReview:async(...args)=>{reviewed.push(args);return true;}}),reviewButton=overlay.querySelector('[data-history-review]');f.setAccess({...rights(),[action]:value});await reviewButton.onclick();assert.deepEqual(reviewed,value===true?[[action,'case0']]:[]);assert.equal(posts(f).length,0);f.idle();
});
for(const mode of ['closed','action-disabled','actor','epoch','delivery'])void test('awaited review permission fences '+mode+' without callback or POST',async()=>{
 const f=epochFixture();await f.hydrate();f.intercept((call,response)=>call.url.includes('caseId=')?Response.json({reviewCase:{id:'case0',status:'pending',actor:{name:'Synthetic'},before:{},content:{}}}):response);const actions=[{name:'approve',label:'approve',enabled:true}];let reviewed=0;const overlay=await f.openHistory({reviewActions:actions,onReview:async()=>{reviewed++;return true;}}),hold=holdNext(f,permissionsRead),pending=overlay.querySelector('[data-history-review]').onclick();await hold.ready;if(mode==='closed')button(overlay,'close').onclick();else if(mode==='action-disabled')actions[0].enabled=false;else changeOwner(f,mode);hold.release();await pending;assert.equal(reviewed,0);assert.equal(posts(f).length,0);f.idle();
});
void test('older list/detail requests and retained buttons cannot replace newer displayed case',async()=>{
 const f=fixture();await f.hydrate();const review=id=>({id,status:'approved',actor:{name:id},before:{},content:{items:[{id,standard:id}]}});f.intercept((call,response)=>call.url.includes('history=cases')?Response.json({cases:['caseA','caseB'].map(id=>({id,status:'approved',actor:{name:id}}))}):call.url.includes('caseId=')?Response.json({reviewCase:review(new URL(call.url,'http://fixture').searchParams.get('caseId'))}):response);
 const overlay=await f.openHistory({caseId:null}),oldButtons=overlay.querySelectorAll('[data-case]');
 let release,started;const ready=new Promise(resolve=>{started=resolve;});f.intercept(async(call,response)=>{if(call.url.includes('caseId=caseA')){started();await new Promise(resolve=>{release=resolve;});return Response.json({reviewCase:review('caseA')});}if(call.url.includes('caseId=caseB'))return Response.json({reviewCase:review('caseB')});return response;});
 const pending=oldButtons[0].onclick();await ready;const count=f.calls.length;await oldButtons[1].onclick();assert.equal(f.calls.length,count,'detached old list button rejected');button(overlay,'close').onclick();release();await pending;assert.equal(overlay.isConnected,false);assert.equal(posts(f).length,0);f.idle();
});


for(const guarded of [false,true])for(const status of [200,401,403])for(const malformed of [false,true])for(const mode of ['close','actor','epoch','delivery','pagehide'])void test(`body-delayed ${guarded?'guarded':'replacement'} ${status} ${malformed?'nonJSON':'JSON'} ${mode} cannot adopt access or denial UI`,async()=>{
 const f=epochFixture({guardAccessResults:guarded});await f.hydrate();const before=f.stable(),oldRights=Object.fromEntries(Object.keys(rights()).map(key=>[key,f.client.permission(key)]));let release,started;const ready=new Promise(resolve=>{started=resolve;});f.intercept((call,response)=>permissionsRead(call)?{status,ok:status===200,async json(){started();await new Promise(resolve=>{release=resolve;});if(malformed)throw SyntaxError('synthetic invalid JSON');return status===200?{permissions:Object.fromEntries(Object.keys(rights()).map(key=>[key,false]))}:{error:'FORBIDDEN'};}}:response);
 const opening=f.openHistory();await ready;const overlay=f.overlays.at(-1),renders=overlay.renderCount;changeOwner(f,mode);release();await opening;assert.deepEqual(Object.fromEntries(Object.keys(rights()).map(key=>[key,f.client.permission(key)])),oldRights,'stale read must not grant/revoke cached permissions');assert.equal(overlay.renderCount,renders,'stale read cannot paint denied notice');assert.equal(posts(f).length,0);assert.deepEqual(f.stable(),before);assert.equal(f.overlays.length,1,'stale denial creates no retry/advisory panel');f.idle();
});
for(const status of [401,403])for(const malformed of [false,true])void test(`current ${status} ${malformed?'nonJSON':'JSON'} still revokes access without POST`,async()=>{
 const f=fixture();await f.hydrate();f.intercept((call,response)=>permissionsRead(call)?malformed?new Response('invalid JSON',{status}):Response.json({error:'FORBIDDEN'},{status}):response);await f.openHistory();for(const key of Object.keys(rights()))assert.equal(f.client.permission(key),false,key);assert.equal(posts(f).length,0);assert.equal(f.overlays[0].isConnected,false);f.idle();
});

for(const method of ['history','reviewCase','previewRestore','legacyHistory','legacyVersion'])for(const malformed of [false,true])void test(`${method} forwards explicit read fence for late ${malformed?'nonJSON':'JSON'} denial`,async()=>{
 const f=fixture();await f.hydrate();f.client.withLegacyArchive();const cause=SyntaxError('invalid'),historyCanPoll=f.client.canPoll('history');assert.equal(historyCanPoll,true);let owned=true,release,started;const ready=new Promise(resolve=>{started=resolve;});f.intercept(()=>({status:403,ok:false,async json(){started();await new Promise(resolve=>{release=resolve;});if(malformed)throw cause;return{error:'FORBIDDEN'};}}));
 const pending=f.client[method]('selected',{isCurrent:()=>owned,requireAcceptedAccess:true});await ready;owned=false;release();await assert.rejects(pending,error=>{if(malformed){assert.equal(error.message,'HTTP 403');assert.equal(error.status,403);assert.equal(error.cause,cause);}else assert.match(error.message,/ACCESS_READ_SUPERSEDED/);return true;});for(const key of Object.keys(rights()))assert.equal(f.client.permission(key),true);assert.equal(f.client.canPoll('history'),historyCanPoll,'stale denial cannot pause the next view');assert.equal(posts(f).length,0);assert.equal(f.overlays.length,0);f.idle();
});
void test('legacy and provided version previews remain readonly and explicitly authorized',async()=>{
 for(const kind of ['legacy','provided']){const f=fixture();await f.hydrate();f.client.withLegacyArchive();const overlay=await f.openHistory({caseId:null,editable:()=>false,...(kind==='legacy'?{legacyFirst:true,legacyVersionId:'legacy0'}:{versionPreview:{id:'provided0',status:'approved',snapshot:preview.after}})});assert(overlay.innerHTML.includes(kind==='legacy'?'legacy0':'provided0'));assert.equal(overlay.querySelector('[data-restore]'),null);assert.equal(posts(f).length,0);f.idle();const count=f.calls.length;f.setAccess({...rights(),history:false});await button(overlay,'back').listeners.click();assert.equal(f.calls.length,count+1);assert.equal(overlay.isConnected,false);f.idle();}
});

for(const mode of ['id','status'])void test('same-object review '+mode+' change while fresh permissions await cannot redirect action',async()=>{
 const f=fixture();await f.hydrate();const selected={id:'case0',status:'pending',actor:{name:'Synthetic'},before:{},content:{}};let reviewed=0;const overlay=await f.openHistory({client:{...f.client,reviewCase:async()=>({reviewCase:selected})},reviewActions:[{name:'approve',label:'approve',enabled:true}],onReview:async()=>{reviewed++;return true;}}),hold=holdNext(f,permissionsRead),pending=overlay.querySelector('[data-history-review]').onclick();await hold.ready;selected[mode]=mode==='id'?'case-other':'approved';hold.release();await pending;assert.equal(reviewed,0);assert.equal(posts(f).length,0);f.idle();
});
for(const denied of [false,true])void test('newer legacy list supersedes delayed fixed history '+(denied?'denial':'success')+' without cache or UI adoption',async()=>{
 const f=fixture();await f.hydrate();f.client.withLegacyArchive();let release,started;const ready=new Promise(resolve=>{started=resolve;});f.intercept(async(call,response)=>{if(call.url.includes('history=cases')){started();await new Promise(resolve=>{release=resolve;});return denied?Response.json({error:'FORBIDDEN'},{status:403}):Response.json({cases:[{id:'stale0',actor:{name:'stale'}}]});}return response;});const opening=f.openHistory({caseId:null});await ready;const overlay=f.overlays.at(-1);await button(overlay,'archive').listeners.click();assert(overlay.innerHTML.includes('legacy0'));const rendered=overlay.innerHTML;release();await opening;assert.equal(overlay.innerHTML,rendered);assert.equal(f.client.permission('history'),true);assert.equal(posts(f).length,0);f.idle();
});

for(const query of ['permissions=1','history=cases'])void test('history initial '+query+' 503 keeps focus inside its open error dialog',async()=>{
 const f=fixture();await f.hydrate();const opener=f.focused(),before=f.stable();
 f.intercept((call,response)=>call.url.includes(query)?Response.json({error:'SYNTHETIC_UNAVAILABLE'},{status:503}):response);
 const overlay=await f.openHistory({caseId:null});assert.equal(overlay.isConnected,true);assert.equal(f.body.style.overflow,'hidden');
 assert.notEqual(f.focused(),opener);assert.equal(f.focused(),button(overlay,'close'));
 assert.equal(f.calls.filter(call=>call.method==='POST').length,0);assert.deepEqual(f.stable(),before);f.idle();
 button(overlay,'close').onclick();assert.equal(overlay.isConnected,false);assert.equal(f.body.style.overflow,'');assert.equal(f.focused(),opener);
});

void test('retired preview rejects every retained grant with zero read/write and preserves dirty input/File journals',async()=>{for(const value of [undefined,false,null,0,1,'true',true]){const f=fixture();f.setAccess({...rights(),restore:value});await f.hydrate();const before=f.stable(),start=f.calls.length;await assert.rejects(f.openPreview(),/DRAFT_RESTORE_NOT_SUPPORTED/);retained(f,before,start,String(value));assert.equal(f.overlays.length,0);f.idle();}});
void test('approved fixed history remains readonly even with a legacy restore grant',async()=>{const f=fixture();await f.hydrate();const h=await f.openHistory();assert.equal(h.querySelector('[data-restore]'),null);assert.equal(posts(f).length,0);assert.deepEqual(f.input,f.inputBefore);f.idle();});
void test('actual C handler retires new preview and command without changing any values/history/receipts/R2',async()=>{const backend=await require('../scripts/ipqc-c-operation-fixture.cjs').fixture(require('../scripts/v3-quality-growth-fixture.cjs')('ipqc-c',[{id:'a'.repeat(64),bytes:1}],1,1).values);try{const state=await backend.core.readState(),flow=JSON.parse(state.values.ipqcCMasterControl).workflow,before=backend.snapshot();const preview=await backend.call('ipqc-c/workflow','GET',null,'editor',422,'?caseMetadata=1&restoreSaveId=save0');assert.equal(preview.error,'DRAFT_RESTORE_NOT_SUPPORTED');const result=await backend.call('ipqc-c/workflow','POST',{command:{operationId:webcrypto.randomUUID(),clientId:'retired-probe',sequence:1,generation:flow.generation,expectedRevision:flow.revision,action:'restore',restoreSaveId:'save0'}},'editor',422,'?caseMetadata=1');assert.equal(result.error,'DRAFT_RESTORE_NOT_SUPPORTED');assert.deepEqual(backend.snapshot(),before);}finally{backend.close();}});
