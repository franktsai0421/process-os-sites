/* Actual shared JS in a synthetic DOM/timer port; three tests also use actual C handlers
 * with normal synthetic logins and private SQLite/R2. No browser/server/live-data claim. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {webcrypto,createHash}=require('node:crypto');
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'public/process/shared-draft-client.js'),'utf8');
const clone=value=>JSON.parse(JSON.stringify(value));
const rights=()=>({view:true,history:true,edit:true,restore:true});
const preview={generation:'g-restore',expectedRevision:7,restoreSaveId:'save0',before:{items:[{id:'row0',standard:'current'}]},after:{items:[{id:'row0',standard:'saved'}]},source:{actor:{name:'Synthetic author'},at:'synthetic'}};
function fixture({routeFetch=null}={}){
 const timers=new Map(),calls=[],memory=new Map(),storageWrites=[],overlays=[];let timerId=0,access=rights(),applied=0,editable=true,intercept=null;
 const input={text:'尚未儲存 中文 Việt',photos:[{id:'pending-photo',note:'retain'}]},inputBefore=clone(input);
 class Element{
  constructor(tag='div',attrs=''){this.tag=tag;this.attrs=attrs;this.dataset={};this.style={};this.children=[];this.buttons=[];this.listeners={};this.disabled=/\bdisabled\b/.test(attrs);this.isConnected=false;this.textContent='';}
  set innerHTML(html){this.html=html;this.buttons=[...html.matchAll(/<button\b([^>]*)>/g)].map(match=>new Element('button',match[1]));this.main=new Element('main');this.error=new Element('div');}
  get innerHTML(){return this.html||'';}
  querySelector(selector){if(selector==='main')return this.main;if(selector==='#shared-restore-error')return this.error;return this.querySelectorAll(selector)[0]||null;}
  querySelectorAll(selector){if(selector==='button')return this.buttons;if(selector==='button:not(:disabled)')return this.buttons.filter(button=>!button.disabled);const match=selector.match(/^\[([^\]]+)\]$/);return match?this.buttons.filter(button=>button.attrs.includes(match[1])):[];}
  addEventListener(kind,fn){this.listeners[kind]=fn;}setAttribute(key,value){this[key]=value;}
  append(...nodes){for(const node of nodes){this.children.push(node);node.parent=this;node.isConnected=true;}}prepend(...nodes){this.append(...nodes);}
  remove(){this.isConnected=false;if(this.parent)this.parent.children=this.parent.children.filter(node=>node!==this);}focus(){document.activeElement=this;}
 }
 const body=new Element('body'),dirtyInput=new Element('input');dirtyInput.value=input.text;dirtyInput.selectionStart=2;dirtyInput.selectionEnd=5;body.append(dirtyInput);body.style.overflow='';body.append=node=>{body.children.push(node);overlays.push(node);node.parent=body;node.isConnected=true;};
 const document={body,documentElement:{lang:'zh'},activeElement:dirtyInput,createElement:tag=>new Element(tag),addEventListener(){},removeEventListener(){},querySelector:()=>null,querySelectorAll:selector=>selector==='.shared-restore-overlay'?body.children.filter(node=>node.className==='shared-restore-overlay'):[]};
 const window={ProcessSync:{identity:{id:'preview-editor'},requiresReload:false},addEventListener(){}};
 const fetch=async(url,options={})=>{
  const method=options.method||'GET',query=new URL(url,'http://fixture').searchParams,body=options.body?JSON.parse(options.body):null,call={method,url,body};calls.push(call);
  let response;
  if(routeFetch)response=await routeFetch(url,options);
  else if(method==='POST'){const command=body.command;response=Response.json({receipt:{operationId:command.operationId,generation:command.generation,revision:8,savedId:'save0',caseId:null,unchanged:false}});}
  else if(query.has('permissions'))response=Response.json({permissions:access,unchanged:true});
  else if(query.has('operationId'))response=Response.json({error:'OPERATION_NOT_FOUND'},{status:404});
  else if(query.has('restoreSaveId'))response=Response.json(preview);
  else if(query.has('caseId'))response=Response.json({reviewCase:{id:'case0',savedId:'save0',status:'approved',actor:{name:'Author'},before:preview.before,content:preview.after}});
  else if(query.has('history'))response=Response.json({cases:[],next:null});
  else throw Error('UNEXPECTED_SYNTHETIC_READ');
  if(intercept)response=await intercept(call,response);
  call.status=response.status;return response;
 };
 vm.runInNewContext(source,{window,document,console,crypto:webcrypto,AbortController,URL,URLSearchParams,location:{origin:'http://fixture'},fetch,setTimeout:(fn,ms)=>{const id=++timerId;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id),sessionStorage:{getItem:key=>memory.get(key)||null,setItem:(key,value)=>{storageWrites.push(['set',key,value]);memory.set(key,value);},removeItem:key=>{storageWrites.push(['remove',key]);memory.delete(key);}}},{filename:'actual-shared-draft-client.js'});
 const client=window.createSharedDraftClient({endpoint:'/api/ipqc-c/workflow?caseMetadata=1',actorId:'preview-editor',headers:()=>({})});
 const openPreview=async(selectedClient=client)=>{await window.previewSharedDraftRestore({client:selectedClient,savedId:'save0',onApplied:async()=>{applied++;}});return overlays.at(-1);};
 const openHistory=async()=>{await window.openSharedDraftHistory({client,editable:()=>editable,onApplied:async()=>{applied++;},caseId:'case0'});return overlays.at(-1);};
 async function tick(){const entry=[...timers].find(([,timer])=>timer.ms===4000);assert(entry,'overlay permission timer exists');timers.delete(entry[0]);await entry[1].fn();}
 const stable=()=>({input:clone(input),dirtyInput:{value:dirtyInput.value,selectionStart:dirtyInput.selectionStart,selectionEnd:dirtyInput.selectionEnd,isConnected:dirtyInput.isConnected},recovery:[...memory],storageWrites:clone(storageWrites)});
 return{window,client,calls,overlays,body,memory,storageWrites,input,inputBefore,stable,tick,openPreview,openHistory,hydrate:()=>client.permissions(),setAccess:value=>{access=value;},setEditable:value=>{editable=value;},intercept:fn=>{intercept=fn;},applied:()=>applied};
}
const button=(overlay,kind)=>{const result=overlay.querySelector('[data-'+kind+']');assert(result,kind+' button exists');return result;};
function retained(f,before,start,label){assert.equal(f.calls.length,start,label+' zero dispatch');assert.deepEqual(f.stable(),before,label+' input/recovery unchanged');assert.equal(f.applied(),0);}

void test('preview preflight rejects missing, false and malformed restore without GET or input/recovery changes',async()=>{
 for(const value of [undefined,false,null,0,1,'true']){const f=fixture();f.setAccess({...rights(),restore:value});await f.hydrate();const before=f.stable(),start=f.calls.length;await assert.rejects(f.openPreview(),/RESTORE_PERMISSION_REQUIRED/);retained(f,before,start,String(value));assert.equal(f.overlays.length,0);}
});
void test('revoked capability or owner during awaited preview cannot adopt an overlay',async()=>{
 for(const mode of ['restore','actor','terminal']){const f=fixture();await f.hydrate();let release,started;const waiting=new Promise(resolve=>{started=resolve;});f.intercept(async(call,response)=>{if(call.url.includes('restoreSaveId=')){started();await new Promise(resolve=>{release=resolve;});}return response;});
  const before=f.stable(),pending=f.openPreview();await waiting;
  if(mode==='restore'){f.setAccess({...rights(),restore:false});await f.hydrate();}else if(mode==='actor')f.window.ProcessSync.identity={id:'other-actor'};else f.window.ProcessSync.requiresReload=true;
  release();await assert.rejects(pending,/RESTORE_PERMISSION_REQUIRED|ACCOUNT_CHANGED_REOPEN_REQUIRED/);assert.equal(f.overlays.length,0);assert.equal(f.calls.filter(call=>call.method==='POST').length,0);assert.deepEqual(f.stable(),before);
 }
});
void test('history-only users retain readable history without a Restore button or forced closing',async()=>{
 for(const value of [undefined,false,null,'true']){const f=fixture();f.setAccess({...rights(),restore:value});await f.hydrate();const overlay=await f.openHistory();assert.equal(overlay.querySelector('[data-restore]'),null);await f.tick();assert.equal(overlay.isConnected,true);assert.equal(f.calls.filter(call=>call.method==='POST').length,0);assert.deepEqual(f.input,f.inputBefore);}
});
void test('retained history Restore rechecks capability, editable scope, owner and terminal before any preview GET',async()=>{
 for(const mode of ['revoked','missing','malformed','scope','actor','terminal']){const f=fixture();await f.hydrate();const overlay=await f.openHistory(),restore=button(overlay,'restore'),before=f.stable();
  if(['revoked','missing','malformed'].includes(mode)){f.setAccess({...rights(),restore:mode==='revoked'?false:mode==='missing'?undefined:'true'});await f.tick();assert.equal(restore.disabled,true);assert.equal(overlay.isConnected,true,'history remains readable');}
  else if(mode==='scope')f.setEditable(false);else if(mode==='actor')f.window.ProcessSync.identity={id:'other-actor'};else f.window.ProcessSync.requiresReload=true;
  const start=f.calls.length;await restore.listeners.click();retained(f,before,start,mode);
 }
});
void test('opened preview timer closes on restore-only revocation and retained Apply dispatches nothing',async()=>{
 const f=fixture();await f.hydrate();const overlay=await f.openPreview(),apply=button(overlay,'apply'),before=f.stable();f.setAccess({...rights(),restore:false});await f.tick();assert.equal(f.client.permission('edit'),true);assert.equal(f.client.permission('history'),true);assert.equal(overlay.isConnected,false);assert.equal(f.body.style.overflow,'');const start=f.calls.length;await apply.onclick();retained(f,before,start,'closed revoked preview');
});
void test('retained Apply rejects missing/malformed capability, changed owner and terminal without POST',async()=>{
 for(const mode of ['missing','malformed','actor','terminal']){const f=fixture();await f.hydrate();const overlay=await f.openPreview(),apply=button(overlay,'apply'),before=f.stable();
  if(mode==='missing'||mode==='malformed'){f.setAccess({...rights(),restore:mode==='missing'?undefined:'true'});await f.hydrate();}else if(mode==='actor')f.window.ProcessSync.identity={id:'other-actor'};else f.window.ProcessSync.requiresReload=true;
  const start=f.calls.length;await apply.onclick();retained(f,before,start,mode);
 }
});
void test('restore owner fence allows same-session identity refresh but rejects relogin epoch or delivery changes',async()=>{
 for(const mode of ['refresh','epoch','delivery']){const f=fixture();let epoch=3,delivery={id:'original-delivery'};Object.assign(f.window.ProcessSync,{identityGeneration:()=>epoch,captureDelivery:()=>delivery,isCurrentDelivery:stamp=>stamp===delivery});await f.hydrate();const overlay=await f.openPreview(),apply=button(overlay,'apply'),before=f.stable();
  f.window.ProcessSync.identity={id:'preview-editor',name:'Fresh same-session identity'};if(mode==='epoch')epoch++;else if(mode==='delivery')delivery={id:'new-delivery'};
  const start=f.calls.length;await apply.onclick();if(mode==='refresh'){assert.equal(f.calls.slice(start).filter(call=>call.method==='POST').length,1);assert.equal(f.applied(),1);assert.deepEqual(f.input,f.inputBefore);}else retained(f,before,start,mode+' changed');
 }
});
void test('allowed restore uses one fixed savedId/revision POST; repeated retained callback cannot resend',async()=>{
 const f=fixture();await f.hydrate();const overlay=await f.openPreview(),apply=button(overlay,'apply');let release,started;const waiting=new Promise(resolve=>{started=resolve;});f.intercept(async(call,response)=>{if(call.method==='POST'){started();await new Promise(resolve=>{release=resolve;});}return response;});
 const pending=apply.onclick();await waiting;await apply.onclick();assert.equal(f.calls.filter(call=>call.method==='POST').length,1);release();await pending;await apply.onclick();
 const writes=f.calls.filter(call=>call.method==='POST');assert.equal(writes.length,1);assert.equal(writes[0].body.command.action,'restore');assert.equal(writes[0].body.command.restoreSaveId,preview.restoreSaveId);assert.equal(writes[0].body.command.expectedRevision,preview.expectedRevision);assert.equal(f.applied(),1);assert.equal(f.client.hasUnknown(),false);assert.equal(f.memory.size,0);assert.deepEqual(f.input,f.inputBefore);
});
void test('permission refresh while dispatched restore awaits ACK does not discard the authoritative receipt',async()=>{
 const f=fixture();await f.hydrate();const overlay=await f.openPreview(),apply=button(overlay,'apply');let release,started;const waiting=new Promise(resolve=>{started=resolve;});f.intercept(async(call,response)=>{if(call.method==='POST'){started();await new Promise(resolve=>{release=resolve;});}return response;});
 const pending=apply.onclick();await waiting;assert.equal(f.client.hasUnknown(),true);f.setAccess({...rights(),restore:false});await f.tick();assert.equal(overlay.isConnected,false);release();await pending;assert.equal(f.applied(),1);assert.equal(f.client.hasUnknown(),false);assert.equal(f.memory.size,0);assert.equal(f.calls.filter(call=>call.method==='POST').length,1);assert.deepEqual(f.input,f.inputBefore);
});
void test('unknown restore outcome retains the original recovery and never retries after revocation',async()=>{
 const f=fixture();await f.hydrate();const overlay=await f.openPreview(),apply=button(overlay,'apply');
 f.intercept((call,response)=>call.method==='POST'?Response.json({error:'SYNTHETIC_UNCERTAIN'},{status:503}):response);
 await apply.onclick();assert.equal(f.client.hasUnknown(),true);assert.equal(f.calls.filter(call=>call.method==='POST').length,1);assert.equal(f.calls.filter(call=>call.url.includes('operationId=')).length,1);assert.equal(f.applied(),0);
 const before=f.stable(),recovery=[...f.memory.values()][0];assert(recovery);f.setAccess({...rights(),restore:false});await f.tick();const start=f.calls.length;await apply.onclick();retained(f,before,start,'unknown revoked restore');assert.equal([...f.memory.values()][0],recovery);assert.equal(f.client.hasUnknown(),true);
});
void test('known-revoked error rerender cannot re-enable Apply and authoring wrapper is not bypassed',async()=>{
 const f=fixture();await f.hydrate();let wrapped=0;const wrappedClient={...f.client,async command(){wrapped++;f.setAccess({...rights(),restore:false});await f.hydrate();throw Error('SUBMIT_STATE_UNCONFIRMED');}};
 const overlay=await f.openPreview(wrappedClient),apply=button(overlay,'apply'),before=f.stable();await apply.onclick();assert.equal(wrapped,1);assert.equal(button(overlay,'apply').disabled,true);assert.match(overlay.querySelector('#shared-restore-error').textContent,/SUBMIT_STATE_UNCONFIRMED/);const start=f.calls.length;await button(overlay,'apply').onclick();retained(f,before,start,'wrapped authoring refusal');assert.equal(f.calls.filter(call=>call.method==='POST').length,0);
});
void test('actual C route enforces revoked restore; opened UI sends nothing and all persisted values/R2 remain unchanged',async()=>{
 const {fixture:backendFixture}=require('../scripts/ipqc-c-operation-fixture.cjs'),seed=require('../scripts/v3-quality-growth-fixture.cjs')('ipqc-c',[{id:'a'.repeat(64),bytes:1}],1,1);
 const backend=await backendFixture(seed.values);
 try{
  const f=fixture({routeFetch:async(url,options)=>backend.load('app/api/ipqc-c/workflow/route.ts')[options.method](new Request(new URL(url,'http://fixture'),{method:options.method,headers:backend.sessions.editor,...(options.body?{body:options.body}:{})}))});
  await f.hydrate();const overlay=await f.openPreview(),apply=button(overlay,'apply');
  const state=await backend.core.readState(),users=JSON.parse(state.values.platformUsers);users.find(user=>user.id==='preview-editor').accessOverrides['ipqc-c.restore']=false;state.values.platformUsers=JSON.stringify(users);backend.db.prepare('UPDATE shared_state SET revision=revision+1,"values"=? WHERE id=1').run(await backend.load('lib/state-records.ts').encodeRecordValues(backend.env.STATE_ARCHIVE,state.values));
  const persisted=backend.snapshot(),before=f.stable();await f.tick();assert.equal(overlay.isConnected,false);const start=f.calls.length;await apply.onclick();retained(f,before,start,'actual route capability refresh');assert.deepEqual(backend.snapshot(),persisted);
  const denied=await backend.call('ipqc-c/workflow','POST',{command:{operationId:webcrypto.randomUUID(),clientId:'denial-probe',sequence:1,generation:seed.flow.generation,expectedRevision:seed.flow.revision,action:'restore',restoreSaveId:'save0'}},'editor',403,'?caseMetadata=1');assert.equal(denied.error,'RESTORE_PERMISSION_REQUIRED');assert.deepEqual(backend.snapshot(),persisted,'server refusal preserves complete values/history/receipts/R2');
 }finally{backend.close();}
});
void test('actual C handler accepts exactly one authorized restore and retains fixed saves/cases',async()=>{
 const {fixture:backendFixture}=require('../scripts/ipqc-c-operation-fixture.cjs'),seed=require('../scripts/v3-quality-growth-fixture.cjs')('ipqc-c',[{id:'a'.repeat(64),bytes:1}],1,1);
 const backend=await backendFixture(seed.values);
 try{
  const beforeState=await backend.core.readState(),beforeControl=JSON.parse(beforeState.values.ipqcCMasterControl);
  const f=fixture({routeFetch:async(url,options)=>backend.load('app/api/ipqc-c/workflow/route.ts')[options.method](new Request(new URL(url,'http://fixture'),{method:options.method,headers:backend.sessions.editor,...(options.body?{body:options.body}:{})}))});
  await f.hydrate();const overlay=await f.openPreview(),apply=button(overlay,'apply');await apply.onclick();await apply.onclick();
  const writes=f.calls.filter(call=>call.method==='POST');assert.equal(writes.length,1);assert.equal(writes[0].status,200);assert.equal(writes[0].body.command.restoreSaveId,'save0');assert.equal(writes[0].body.command.expectedRevision,seed.flow.revision);assert.equal(f.applied(),1);assert.equal(f.client.hasUnknown(),false);assert.deepEqual(f.input,f.inputBefore);
  const afterState=await backend.core.readState(),afterControl=JSON.parse(afterState.values.ipqcCMasterControl);assert.deepEqual(afterControl.workflow.saves,beforeControl.workflow.saves);assert.deepEqual(afterControl.workflow.cases,beforeControl.workflow.cases);assert.equal(afterControl.workflow.working.items[0].standard,seed.flow.saves[0].content.items[0].standard);assert.notEqual(afterControl.workflow.working.items[0].standard,beforeControl.workflow.working.items[0].standard);
 }finally{backend.close();}
});
void test('definitive synthetic401 closes preview without retrying or discarding dirty input',async()=>{
 const f=fixture();await f.hydrate();const overlay=await f.openPreview(),apply=button(overlay,'apply'),dirty=f.stable().dirtyInput;f.intercept((call,response)=>call.method==='POST'?Response.json({error:'LOGIN_REQUIRED'},{status:401}):response);await apply.onclick();assert.equal(overlay.isConnected,false);assert.equal(f.applied(),0);assert.equal(f.client.hasUnknown(),false);assert.equal(f.memory.size,0);assert.deepEqual(f.stable().dirtyInput,dirty);assert.deepEqual(f.input,f.inputBefore);
 const before=f.stable(),start=f.calls.length;await apply.onclick();retained(f,before,start,'definitive401 retained callback');assert.equal(f.calls.filter(call=>call.method==='POST').length,1);
});
void test('actual C denial before permission poll closes preview and prevents a second unauthorized POST',async()=>{
 const {fixture:backendFixture}=require('../scripts/ipqc-c-operation-fixture.cjs'),seed=require('../scripts/v3-quality-growth-fixture.cjs')('ipqc-c',[{id:'a'.repeat(64),bytes:1}],1,1);
 const backend=await backendFixture(seed.values);
 try{
  const f=fixture({routeFetch:async(url,options)=>backend.load('app/api/ipqc-c/workflow/route.ts')[options.method](new Request(new URL(url,'http://fixture'),{method:options.method,headers:backend.sessions.editor,...(options.body?{body:options.body}:{})}))});
  await f.hydrate();const overlay=await f.openPreview(),apply=button(overlay,'apply'),dirty=f.stable().dirtyInput;
  const state=await backend.core.readState(),users=JSON.parse(state.values.platformUsers);users.find(user=>user.id==='preview-editor').accessOverrides['ipqc-c.restore']=false;state.values.platformUsers=JSON.stringify(users);backend.db.prepare('UPDATE shared_state SET revision=revision+1,"values"=? WHERE id=1').run(await backend.load('lib/state-records.ts').encodeRecordValues(backend.env.STATE_ARCHIVE,state.values));
  const persisted=backend.snapshot();assert.equal(f.client.permission('restore'),true,'cached capability predates revocation; timer has not fired');await apply.onclick();
  const writes=f.calls.filter(call=>call.method==='POST');assert.equal(writes.length,1);assert.equal(writes[0].status,403);assert.equal(overlay.isConnected,false);assert.equal(f.applied(),0);assert.equal(f.client.hasUnknown(),false);assert.equal(f.memory.size,0);assert.deepEqual(f.stable().dirtyInput,dirty);assert.deepEqual(f.input,f.inputBefore);assert.deepEqual(backend.snapshot(),persisted,'actual definitive denial preserves entire values/history/receipts/R2');
  const before=f.stable(),start=f.calls.length;await apply.onclick();retained(f,before,start,'actual403 retained callback');assert.deepEqual(backend.snapshot(),persisted);
 }finally{backend.close();}
});
void test('source receipt identifies exact shared implementation',t=>{t.diagnostic(JSON.stringify({sharedClientSha256:createHash('sha256').update(source).digest('hex'),boundary:'Actual shared JS; synthetic DOM/timers. Three actual C-handler/private SQLite/R2 cases; no native/browser/live-site acceptance.'}));});
