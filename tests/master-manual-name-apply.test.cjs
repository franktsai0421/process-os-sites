const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const source=fs.readFileSync('public/process/app.js','utf8'),ast=ts.createSourceFile('app.js',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
const binder=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='bindProcessMasterName').getText(ast);
const {webcrypto}=require('node:crypto');
const runtimeLocks=new Set();
const locks={request(name,_options,callback){if(runtimeLocks.has(name))return Promise.resolve(callback(null));runtimeLocks.add(name);return Promise.resolve(callback({name})).finally(()=>runtimeLocks.delete(name));}};
function fixture({storage=new Map(),actor='operator-a',generation='g1'}={}){
  let flow={generation,revision:1,saved:{id:'saved-1'},working:{CUT:[{id:'one',name:'Original'}],PACK:[{id:'two',name:'Original'}]}},held=null,reject=null,unknown=false,loadHook=null,confirmHook=null,quota=false,sequence=0,epoch=1;
  const owner={id:actor},calls=[],notices=[],nodes=[],prompts=[],events=new Map(),counts={paint:0,reads:0};
  const client={hasUnknown:()=>unknown,permission:()=>true};
  const response=command=>({receipt:{operationId:command.operationId,generation:command.generation,revision:flow.revision,savedId:flow.saved.id,caseId:null,unchanged:false},control:{workflow:flow},permissions:{view:true,edit:true}});
  const shared={rejectionCapability:()=>null,isConfirmedRejection:()=>false,finishPreparedPatch:async(_scope,_command,response)=>response,flow:()=>flow,client:()=>client,discardRejected:()=>!unknown,load:async()=>{await loadHook?.();},
    readRecovery:async()=>{counts.reads++;await loadHook?.();return{control:{workflow:flow},permissions:{view:true,edit:true}};},
    receiptRecovery:async(_scope,reference)=>{counts.reads+=2;if(unknown)throw Object.assign(Error('OPERATION_NOT_FOUND'),{status:404});await loadHook?.();return response(reference);},
    preparePatch:(_scope,patches,guards)=>({generation,action:'apply',operationId:'name-op-'+(++sequence),patches,guards}),
    dispatchPreparedPatch:async(scope,command,options)=>{assert.equal(options.assertDispatch(command),true);const {patches,guards}=command;calls.push({scope,patches,guards});if(held)await held;if(reject){if(reject.message==='RESULT_UNKNOWN_CHECK_BEFORE_RETRY')unknown=true;throw reject;}for(const p of patches)flow.working[p.path[0]][0].name=p.value;flow={...flow,revision:flow.revision+1};return response(command);}};
  const store={get length(){return storage.size;},key:i=>[...storage.keys()][i]??null,getItem:k=>storage.get(k)??null,setItem(k,v){if(quota)throw Object.assign(Error('quota'),{name:'QuotaExceededError'});storage.set(k,v);},removeItem:k=>storage.delete(k)};
  const window={MasterDataWorkflow:{shared},ProcessSync:{identity:owner,identityGeneration:()=>epoch},sharedDraftErrorMessage:e=>e.message,sessionStorage:store,localStorage:store,crypto:webcrypto,navigator:{locks},setTimeout,clearTimeout,
    addEventListener:(type,fn)=>{const list=events.get(type)||[];list.push(fn);events.set(type,list);},removeEventListener:(type,fn)=>events.set(type,(events.get(type)||[]).filter(item=>item!==fn))};
  const element=()=>({isConnected:true,dataset:{},children:[],setAttribute(){},append(child){this.children.push(child);},querySelector(selector){return selector.includes('name-state')?this.children[0]:this.children.find(n=>n.dataset.nameAction===selector.match(/"(.*?)"/)[1]);},querySelectorAll(){return this.children.slice(1);},remove(){this.isConnected=false;}});
  const document={documentElement:{lang:'zh'},createElement:()=>element()};
  const context=vm.createContext({window,document,Promise,Set,Error,setTimeout,clearTimeout,TextEncoder,Uint8Array,confirm:message=>{prompts.push(message);return confirmHook?confirmHook():true;},toast:m=>notices.push(m),updateProcessSharedStatus:()=>counts.paint++,editableProcessMasterData:()=>flow.pendingId?null:flow.working,processMasterCatalogMatches:s=>Object.values(s).flat()});
  vm.runInContext(fs.readFileSync('public/process/local-draft-recovery.js','utf8'),context);
  vm.runInContext(fs.readFileSync('public/process/local-draft-recovery-session.js','utf8'),context);
  vm.runInContext('const processMasterNameBindings=new Set();\n'+binder,context);
  function input(){const handlers=new Map(),label={after:bar=>node.bar=bar},node={value:flow.working.CUT[0].name,isConnected:true,dataset:{},closest:selector=>selector==='.master-template'?{dataset:{templateKey:'preset'}}:label,addEventListener:(type,fn)=>handlers.set(type,fn),removeEventListener:(type)=>handlers.delete(type)};node.event=(type,event={})=>handlers.get(type)?.(event);nodes.push(node);context.bindProcessMasterName(node);return node;}
  return{input,window,calls,notices,prompts,counts,storage,flow:()=>flow,hold:p=>held=p,reject:e=>reject=e,unknown:v=>unknown=v,onLoad:fn=>loadHook=fn,onConfirm:fn=>confirmHook=fn,quota:v=>quota=v,epoch:()=>epoch++,pagehide:()=>events.get('pagehide')?.forEach(fn=>fn()),fill:(n,value,composing=false)=>{n.value=value;n.oninput({isComposing:composing});}};
}
void test('20 name input events make zero writes or full status paints; one explicit Apply sends final values with original guards',async()=>{
  const f=fixture(),n=f.input();for(let i=0;i<20;i++)f.fill(n,'Name '+i);
  assert.equal(f.calls.length,0);assert.equal(f.counts.paint,0);
  await assert.rejects(n.processMasterNameFlush(),/UNAPPLIED_CHANGES_APPLY_REQUIRED/);assert.equal(f.calls.length,0);
  await n.processMasterNameApply();assert.equal(f.calls.length,1);assert.equal(f.calls[0].patches.length,2);
  assert.deepEqual(Array.from(f.calls[0].guards,g=>g.value),['Original','Original']);assert(f.calls[0].patches.every(p=>p.value==='Name 19'));
  await n.processMasterNameFlush();assert.equal(f.counts.paint,1);
});
void test('IME completion does not apply and language repaint transfers unsent input without a write',async()=>{
  const f=fixture(),n=f.input();n.event('compositionstart');f.fill(n,'流程名稱',true);await assert.rejects(n.processMasterNameApply(),/OPERATION_IN_PROGRESS/);
  n.event('compositionend');assert.equal(f.calls.length,0);n.isConnected=false;const next=f.input();assert.equal(next.value,'流程名稱');assert.equal(f.calls.length,0);
  await next.processMasterNameApply();assert.equal(f.calls.length,1);
});
void test('new input while Apply is in flight stays local until a second explicit Apply',async()=>{
  const f=fixture(),n=f.input();let release;f.hold(new Promise(r=>release=r));f.fill(n,'First batch');const request=n.processMasterNameApply();f.fill(n,'Later input');release();await request;
  assert.equal(f.calls.length,1);assert.equal(f.flow().working.CUT[0].name,'First batch');assert.equal(n.value,'Later input');
  await assert.rejects(n.processMasterNameFlush(),/UNAPPLIED_CHANGES_APPLY_REQUIRED/);f.hold(null);await n.processMasterNameApply();assert.equal(f.calls.length,2);assert(f.calls[1].guards.every(g=>g.value==='First batch'));
});
void test('conflict retains input and refuses implicit retry or Save flush',async()=>{
  const f=fixture(),n=f.input();f.fill(n,'My change');f.reject(Object.assign(Error('DEPENDENCY_CHANGED_RECONFIRM'),{status:409,requestId:'12345678-1234-4234-8234-123456789abc',details:{path:['CUT',{id:'one'},'name']}}));
  await assert.rejects(n.processMasterNameApply(),/DEPENDENCY_CHANGED_RECONFIRM/);assert.equal(n.value,'My change');await assert.rejects(n.processMasterNameFlush(),/DEPENDENCY_CHANGED_RECONFIRM/);assert.equal(f.calls.length,1);
});
void test('no-op and explicit local discard make no request; account changes prevent Apply',async()=>{
  const f=fixture(),n=f.input();f.fill(n,'Temporary');n.processMasterNameDiscard();assert.equal(n.value,'Original');await n.processMasterNameApply();assert.equal(f.calls.length,0);
  f.fill(n,'Private input');f.window.ProcessSync.identity={id:'operator-b'};await assert.rejects(n.processMasterNameApply(),/DEPENDENCY_CHANGED_RECONFIRM/);assert.equal(f.calls.length,0);
});
void test('Submit capture pins primitive revision and blocks dirty, pending, and missing-revision snapshots',()=>{
  const client=fs.readFileSync('public/process/shared-draft-client.js','utf8'),tree=ts.createSourceFile('client.js',client,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);let statement;
  function visit(n){if(ts.isExpressionStatement(n)&&n.getText(tree).startsWith('window.captureSharedDraftSubmission='))statement=n.getText(tree);ts.forEachChild(n,visit);}visit(tree);assert(statement);
  const window={};vm.runInNewContext(statement,{window});const f={revision:4,working:{name:'A'},saved:{id:'save-1',content:{name:'A'}}},pin=window.captureSharedDraftSubmission(f);f.revision=5;assert.equal(pin.expectedRevision,4);assert.equal(pin.savedId,'save-1');
  f.working.name='B';assert.throws(()=>window.captureSharedDraftSubmission(f),/UNSAVED_CHANGES_SAVE_REQUIRED/);f.pendingId='case';assert.throws(()=>window.captureSharedDraftSubmission(f),/PENDING_LOCKED/);delete f.pendingId;delete f.revision;assert.throws(()=>window.captureSharedDraftSubmission(f),/DRAFT_REVISION_REQUIRED/);
});
void test('unknown name Apply only settles through original receipt and readback; review cannot replay it',async()=>{
  const f=fixture(),n=f.input();f.fill(n,'Committed');f.reject(Error('RESULT_UNKNOWN_CHECK_BEFORE_RETRY'));
  await assert.rejects(n.processMasterNameApply(),/RESULT_UNKNOWN/);await assert.rejects(n.processMasterNameReview(),/UNKNOWN_OPERATION/);
  const unknown=n.processMasterNameListRecovery().items.find(row=>JSON.parse(f.storage.get(row.key)).kind==='unknown');assert(unknown);
  await assert.rejects(n.processMasterNameReceiptRecovery(unknown.key),/OPERATION_NOT_FOUND/);assert.equal(f.calls.length,1);
  f.unknown(false);f.reject(null);for(const list of Object.values(f.flow().working))list[0].name='Committed';f.flow().revision++;
  await n.processMasterNameReceiptRecovery(unknown.key);await n.processMasterNameFlush();assert.equal(f.calls.length,1);assert.equal(n.value,'Committed');
});
void test('discard after original receipt settlement shows latest shared values and leaves other rows intact',async()=>{
  const f=fixture(),n=f.input();f.fill(n,'Committed');f.reject(Error('RESULT_UNKNOWN_CHECK_BEFORE_RETRY'));await assert.rejects(n.processMasterNameApply());
  f.flow().working.CUT[0].name='Committed';f.flow().working.PACK[0].name='Another actor';f.flow().revision++;f.reject(null);f.unknown(false);
  const marker=n.processMasterNameListRecovery().items.find(row=>JSON.parse(f.storage.get(row.key)).kind==='unknown');await n.processMasterNameReceiptRecovery(marker.key);n.processMasterNameDiscard();
  assert.equal(n.value,'Committed');await n.processMasterNameFlush();assert.equal(f.calls.length,1);assert.equal(n.dataset.unapplied,'false');assert.equal(f.flow().working.PACK[0].name,'Another actor');
});
void test('conflict review shows original/latest/mine, preserves input, and only later explicit Apply uses new guards',async()=>{
  const f=fixture(),n=f.input();f.fill(n,'我的名稱 / Tên của tôi');f.reject(Object.assign(Error('DEPENDENCY_CHANGED_RECONFIRM'),{status:409,requestId:'12345678-1234-4234-8234-123456789abc',details:{path:['CUT',{id:'one'},'name']}}));await assert.rejects(n.processMasterNameApply());
  f.onLoad(()=>{for(const list of Object.values(f.flow().working))list[0].name='Remote latest';f.flow().revision++;});
  await n.processMasterNameReview();assert.match(f.prompts[0],/Original/);assert.match(f.prompts[0],/Remote latest/);assert.match(f.prompts[0],/Tên của tôi/);assert.equal(f.calls.length,1);
  await assert.rejects(n.processMasterNameFlush(),/UNAPPLIED/);f.reject(null);await n.processMasterNameApply();assert.equal(f.calls.length,2);assert(f.calls[1].guards.every(g=>g.value==='Remote latest'));
});
void test('changes during review and pending/identity transitions cannot clear the rejection or submit local input',async()=>{
  const f=fixture(),n=f.input();f.fill(n,'Private');f.reject(Object.assign(Error('DEPENDENCY_CHANGED_RECONFIRM'),{status:409,requestId:'12345678-1234-4234-8234-123456789abc',details:{path:['CUT',{id:'one'},'name']}}));await assert.rejects(n.processMasterNameApply());
  f.onConfirm(()=>{f.flow().revision++;return true;});await assert.rejects(n.processMasterNameReview(),/DEPENDENCY_CHANGED/);await assert.rejects(n.processMasterNameFlush(),/DEPENDENCY_CHANGED/);
  f.onConfirm(null);f.onLoad(()=>{f.flow().pendingId='pending';});await assert.rejects(n.processMasterNameReview(),/DEPENDENCY_CHANGED/);assert.equal(n.value,'Private');assert.equal(f.calls.length,1);
  delete f.flow().pendingId;f.onLoad(()=>{f.window.ProcessSync.identity={id:'operator-b'};});await assert.rejects(n.processMasterNameReview(),/DEPENDENCY_CHANGED/);assert.equal(f.calls.length,1);
});
void test('reload never auto-hydrates a local name; explicit preview and restore require latest checks',async()=>{
  const f=fixture(),n=f.input();f.fill(n,'Tên phục hồi / 復原名稱');await new Promise(setImmediate);f.pagehide();n.isConnected=false;await new Promise(setImmediate);
  const restored=fixture({storage:f.storage}),next=restored.input();await new Promise(setImmediate);
  assert.equal(next.value,'Original');assert.equal(restored.calls.length,0);
  const item=next.processMasterNameListRecovery().items.find(row=>JSON.parse(restored.storage.get(row.key)).kind==='local');assert(item);
  assert.equal((await next.processMasterNamePreviewRecovery(item.key)).payload.desired,'Tên phục hồi / 復原名稱');
  await next.processMasterNameRestoreRecovery(item.key);assert.equal(next.value,'Tên phục hồi / 復原名稱');assert.equal(restored.counts.reads,2);assert.equal(restored.calls.length,0);
  await next.processMasterNameApply();assert.equal(restored.calls.length,1);await next.processMasterNameFlush();
});
void test('recovery does not cross accounts and an active other runtime cannot be claimed',async()=>{
  const f=fixture(),n=f.input();f.fill(n,'Only A');await new Promise(setImmediate);await new Promise(resolve=>setTimeout(resolve,280));
  const record=n.processMasterNameListRecovery().items.find(row=>JSON.parse(f.storage.get(row.key)).kind==='local');assert(record);
  const other=fixture({storage:f.storage,actor:'operator-b'}),otherInput=other.input();await new Promise(setImmediate);assert.equal(otherInput.processMasterNameListRecovery().items.length,0);
  const same=fixture({storage:f.storage}),second=same.input();await new Promise(setImmediate);await assert.rejects(second.processMasterNameRestoreRecovery(record.key),/RECOVERY_IN_USE/);assert.equal(second.value,'Original');assert.equal(same.calls.length,0);
  f.window.ProcessSync.identity={id:'operator-b'};f.pagehide();assert.equal([...f.storage.values()].some(raw=>raw.includes('Only A')),true);
});
void test('legacy corrupt recovery stays byte-identical; new quota failure stays visible and never sends',async()=>{
  const legacy='process:master-name:v1:'+JSON.stringify(['operator-a','PROCESS','g1','preset']),storage=new Map([[legacy,'{broken']]),f=fixture({storage}),n=f.input();await new Promise(setImmediate);
  assert.equal(n.value,'Original');assert.equal(f.calls.length,0);n.processMasterNameDiscard();assert.equal(storage.get(legacy),'{broken');
  f.quota(true);f.fill(n,'Still local');await new Promise(setImmediate);f.pagehide();assert.equal(n.value,'Still local');assert.equal(f.calls.length,0);assert.equal(storage.get(legacy),'{broken');
});
void test('IME blocks Apply, review and discard; pending blocks newly typed writes',async()=>{
  const f=fixture(),n=f.input();n.event('compositionstart');f.fill(n,'越南 tiếng Việt',true);
  await assert.rejects(n.processMasterNameApply(),/OPERATION_IN_PROGRESS/);await assert.rejects(n.processMasterNameReview(),/OPERATION_IN_PROGRESS/);assert.throws(()=>n.processMasterNameDiscard(),/OPERATION_IN_PROGRESS/);
  n.event('compositionend');f.flow().pendingId='case';await assert.rejects(n.processMasterNameApply(),/DEPENDENCY_CHANGED/);assert.equal(f.calls.length,0);assert.equal(n.value,'越南 tiếng Việt');
});

void test('composition beginning while latest-state read is pending postpones the review dialog',async()=>{
 const f=fixture(),n=f.input();f.fill(n,'Mine');f.reject(Object.assign(Error('DEPENDENCY_CHANGED_RECONFIRM'),{status:409,requestId:'12345678-1234-4234-8234-123456789abc',details:{path:['CUT',{id:'one'},'name']}}));await assert.rejects(n.processMasterNameApply());
 let release;f.onLoad(()=>new Promise(resolve=>{release=resolve;}));const reviewing=n.processMasterNameReview();n.event('compositionstart');f.fill(n,'正在輸入',true);release();
 await assert.rejects(reviewing,/OPERATION_IN_PROGRESS/);assert.equal(f.prompts.length,0);assert.equal(n.value,'正在輸入');assert.equal(f.calls.length,1);n.event('compositionend');
});

void test('repaint during composition preserves visible text without leaving a permanent composing lock',async()=>{
 const f=fixture(),n=f.input();n.event('compositionstart');f.fill(n,'名稱正在組字',true);n.isConnected=false;const next=f.input();assert.equal(next.value,'名稱正在組字');assert.equal(f.calls.length,0);
 await assert.rejects(next.processMasterNameFlush(),/UNAPPLIED/);await next.processMasterNameApply();assert.equal(f.calls.length,1);
});
