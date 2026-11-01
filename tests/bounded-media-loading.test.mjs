import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
// Explicit readonly fixture source; dependencies always resolve normally here.
const sourceRoot=process.env.BOUNDED_MEDIA_SOURCE?path.resolve(process.env.BOUNDED_MEDIA_SOURCE):fileURLToPath(new URL('..',import.meta.url));
const read=file=>fs.readFileSync(path.join(sourceRoot,'public/process',file),'utf8');
// Execute the selected source tree's real scheduler, including foreground producers.
// Legacy interval extraction remains exact for unchanged authoring and pinned fixtures.
const pollingScheduler=(source,{fileName='tooling.js',readCall='transport().read'}={})=>{
 const ast=ts.createSourceFile(fileName,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),timers=[];
 assert.equal(ast.parseDiagnostics.length,0,'polling source parses');
 const factories=[];const factoryWalk=node=>{if(ts.isVariableDeclaration(node)&&node.name.getText(ast)==='foregroundPoll')factories.push(node);ts.forEachChild(node,factoryWalk);};factoryWalk(ast);
 if(factories.length){
  assert.equal(factories.length,1,'unique foreground scheduler binding');const factory=factories[0];assert.equal(factory.initializer?.getText(ast),'window.createForegroundPoll()','actual shared foreground helper');
  const scope=factory.parent.parent.parent;assert(ts.isBlock(scope)||ts.isSourceFile(scope),'foreground lexical block');
  const declarations=name=>Array.from(scope.statements).filter(node=>ts.isFunctionDeclaration(node)&&node.name?.text===name);
  const poll=declarations('poll'),ticks=declarations('pollTick');assert.equal(poll.length,1,'unique same-scope poll');assert.equal(ticks.length,1,'unique same-scope pollTick');
  const starts=Array.from(scope.statements).filter(node=>ts.isExpressionStatement(node)&&ts.isCallExpression(node.expression)&&node.expression.expression.getText(ast)==='foregroundPoll.schedule');assert.equal(starts.length,1,'exact foreground startup');assert.equal(starts[0].expression.arguments.length,1);assert.equal(starts[0].expression.arguments[0].getText(ast),'pollTick');
  let reads=0,delegates=0,reschedules=0;const inspect=node=>{if(ts.isCallExpression(node)&&node.expression.getText(ast)===readCall)reads++;ts.forEachChild(node,inspect);};inspect(poll[0]);assert.equal(reads,1,'actual transport read in polling callback');
  const inspectTick=node=>{if(ts.isCallExpression(node)&&node.expression.getText(ast)==='poll')delegates++;if(ts.isCallExpression(node)&&node.expression.getText(ast)==='foregroundPoll.schedule'&&node.arguments[0]?.getText(ast)==='pollTick')reschedules++;ts.forEachChild(node,inspectTick);};inspectTick(ticks[0]);assert.equal(delegates,1,'actual poll delegation');assert.equal(reschedules,1,'actual recursive schedule');
  return poll[0].getText(ast)+';'+ticks[0].getText(ast)+';const '+factory.getText(ast)+';'+starts[0].getText(ast);
 }

 const walk=node=>{if(ts.isCallExpression(node)&&node.expression.getText(ast)==='setInterval'&&node.arguments[1]?.getText(ast)==='4000')timers.push(node);ts.forEachChild(node,walk);};walk(ast);
 assert.equal(timers.length,1,'exact tooling 4000ms scheduler');const timer=timers[0];let callback=timer.arguments[0],declaration='';
 if(ts.isIdentifier(callback)){
  let scope=timer.parent;while(scope&&!ts.isBlock(scope)&&!ts.isSourceFile(scope))scope=scope.parent;
  const matches=Array.from(scope?.statements||[]).filter(node=>ts.isFunctionDeclaration(node)&&node.name?.text===callback.text);
  assert.equal(matches.length,1,'unique same-scope polling declaration');callback=matches[0];declaration=callback.getText(ast)+';';
 }else assert(ts.isArrowFunction(callback)||ts.isFunctionExpression(callback),'actual inline polling callback');
 let reads=0;const inspect=node=>{if(ts.isCallExpression(node)&&node.expression.getText(ast)===readCall)reads++;ts.forEachChild(node,inspect);};inspect(callback);
 assert.equal(reads,1,'actual transport read in polling callback');return declaration+timer.getText(ast)+';';
};
const foregroundPorts=box=>{
 let now=0,id=0,focused=true,visibility=box.document.visibilityState;const timers=new Map();
 for(const target of [box.window,box.document]){const listeners=new Map();target.addEventListener=(type,fn)=>{if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn);};target.removeEventListener=(type,fn)=>listeners.get(type)?.delete(fn);target.dispatchEvent=event=>{const pendingEvents=Array.from(listeners.get(event.type)||[]);for(const fn of pendingEvents)fn.call(target,event);return true;};}
 box.document.hasFocus=()=>focused;box.performance={now:()=>now};box.setTimeout=(fn,delay)=>{assert.equal(typeof fn,'function');const token=++id;timers.set(token,{fn,due:now+delay});return token;};box.clearTimeout=token=>timers.delete(token);
 return{pending:()=>timers.size,syncVisibility(){if(visibility!==box.document.visibilityState){visibility=box.document.visibilityState;box.document.dispatchEvent({type:'visibilitychange'});}},runNext(){const entry=[...timers].sort((a,b)=>a[1].due-b[1].due||a[0]-b[0])[0];assert(entry,'actual scheduler timer');timers.delete(entry[0]);now=entry[1].due;return entry[1].fn();},focus(value){focused=value;box.window.dispatchEvent({type:value?'focus':'blur'});}};
};
const pollingFixture=()=>{
 const timers=[],calls=[],updates=[],box={setInterval:(fn,ms)=>timers.push({fn,ms}),document:{visibilityState:'hidden',activeElement:null},host:{isConnected:true,dataset:{activeTab:'quality-mold-equipment'},querySelector:()=>null},reviewHost:null,client:{},busy:false,dialog:null,beginRecovery:null,polling:false,viewEpoch:1,readEpoch:1,flushChecks(){},syncActions(){},flow:()=>({generation:'g',revision:1}),window:{ProcessSync:{identity:{id:'synthetic'}},VersionDraftUI:{updateSync:(...args)=>updates.push(args)}}};
 vm.createContext(box);const gate=readGate(box),ports=foregroundPorts(box);let status=200;
 box.client={canPoll:kind=>gate.canPoll(kind),hasUnknown:()=>false};box.transport=()=>({read:async token=>{calls.push(token);if(status!==200){gate.denied('state',status,gate.capture(),async()=>{});throw Error('synthetic read refusal '+status);}return{unchanged:true};}});
 const production=read('tooling.js'),foreground=production.includes('foregroundPoll.schedule(pollTick)');vm.runInContext(pollingScheduler(production),box);if(foreground){assert.equal(timers.length,0,'no legacy interval substituted');assert.equal(ports.pending(),0,'hidden document does not arm foreground poll');}else{assert.equal(timers.length,1);assert.equal(timers[0].ms,4000);}
 return{box,gate,calls,updates,poll:async()=>{ports.syncVisibility();if(foreground){if(ports.pending())await ports.runNext();}else await timers[0].fn();},status:value=>{status=value;}};
};
// Actual production read gate; unrelated extracted-callback read ports stay synthetic.
const readGate=box=>{vm.runInContext(read('shared-draft-client.js'),box);return box.window.createScopedReadPause('synthetic callback');};
const part=(source,a,b)=>{const i=source.indexOf(a),j=source.indexOf(b,i+a.length);assert(i>=0&&j>i);return source.slice(i,j);};
const policy=JSON.parse(fs.readFileSync(new URL('./fixtures/bounded-image-policy.json',import.meta.url),'utf8'));
for(const rule of policy)void test(`${rule.file}:${rule.baseLine} only audited image scheduling hints change`,()=>{
 const source=read(rule.file);assert(source.includes(rule.after));
 const normalize=s=>s.replace(/ \$\{hidden\?'loading="lazy" decoding="async"':''\}/g,'').replace(/\s+(?:loading="lazy"|decoding="async")/g,'');
 assert.equal(normalize(rule.after),normalize(rule.before));
});
void test('100 actual IQC list rows retain original URLs and links without eager thumbnail declarations',()=>{
 const source=read('iqc-master.js'),parts=Array.from({length:100},(_,i)=>({code:'P'+i,nameVi:'Kiểm tra 中文',photos:[{src:'/fixture/'+i+'.svg'}],supplierIds:[],categoryId:''}));
 const box={snap:()=>({suppliers:[],categories:[]}),filteredParts:()=>parts,ui:{partCode:'P0'},h:String,t:z=>z,draft:()=>false,mayEdit:()=>false,name:()=>''};vm.createContext(box);const lookup=source.includes('  function nameIndex(')?part(source,'  function nameIndex(', '  function sharedStatus('):'';vm.runInContext(lookup+part(source,'  function partRows(', '  function listPanel()')+'this.renderRows=partRows;',box);
 const html=box.renderRows();assert.equal((html.match(/<img /g)||[]).length,100);assert.equal((html.match(/loading="lazy"/g)||[]).length,100);assert.equal((html.match(/decoding="async"/g)||[]).length,100);for(let i=0;i<100;i++){assert(html.includes('src="/fixture/'+i+'.svg"'));assert(html.includes('data-photo-part="P'+i+'"'));}
});
void test('hidden legacy gallery sources are lazy; first canvas cover and fullsize references remain eager/original',()=>{
 const source=read('system-upgrade.js'),box={escapeHtml:String};vm.createContext(box);vm.runInContext(part(source,'  const uniqueCardMedia=', '  function closeEditor(')+'this.group=operationCardMediaGroup;',box);
 const html=box.group({id:'op'},{key:'work',label:'Photos',items:Array.from({length:10},(_,i)=>({src:'/original/'+i+'.png',type:'image/png'}))});assert.equal((html.match(/loading="lazy"/g)||[]).length,9);assert.equal((html.match(/data-lightbox-src=/g)||[]).length,10);assert(html.includes('<img  src="/original/0.png"'));for(let i=0;i<10;i++)assert(html.includes('data-lightbox-src="/original/'+i+'.png"'));
});
void test('selected fullsize viewers and exported print images are not deferred',()=>{
 for(const [file,a,b] of [['iqc-master.js','  function photoViewerPhotos(', '  function photoViewer('],['ipqc-c.js','  function viewerHTML()', '  async function submitEditor('],['fqc-master.js','class="fqc-viewer-img"','class="fqc-viewer-img"']]){
  if(file==='fqc-master.js'){const tag=read(file).match(/<img[^>]*class="fqc-viewer-img"[^>]*>/)?.[0];assert(tag);assert(!tag.includes('loading="lazy"'));}
  else assert(!part(read(file),a,b).includes('loading="lazy"'));
 }
 const exported=read('routine-fqc.js').split('\n').find(line=>line.includes('images[p]'));assert(exported);assert(!exported.includes('loading="lazy"'));
});
void test('node preview cancellation releases only untransferred URLs, including repeated close',()=>{
 const source=read('routine-equipment.js'),revoked=[],box={URL:{revokeObjectURL:u=>revoked.push(u)},pendingPhotos:new Map(),nodeDialog:{pendingPhoto:{url:'blob:discard'}},render(){}};vm.createContext(box);vm.runInContext(part(source,'  function cancelNodeDialog()', '  async function confirmNodeDialog()')+'this.cancel=cancelNodeDialog;',box);
 box.cancel();box.cancel();assert.deepEqual(revoked,['blob:discard']);box.pendingPhotos.set('saved',{url:'blob:owned'});box.nodeDialog={pendingPhoto:{url:'blob:owned'}};box.cancel();assert.deepEqual(revoked,['blob:discard']);assert.equal(box.pendingPhotos.get('saved').url,'blob:owned');assert.equal(box.nodeDialog,null);
 assert(read('routine-equipment.js').includes("addEventListener('click', cancelNodeDialog)"));assert(read('routine-equipment.js').includes("if (event.target?.id === 'routine-node-dialog-backdrop') cancelNodeDialog();"));
});
for(const name of ['fqc-master.js','iqc-master.js','routine-equipment.js','ipqc-ab.js','tooling.js'])void test(`${name} actual transport opts into existing conditional protocol only`,()=>{
 const source=read(name),functionName=name==='routine-equipment.js'?'sharedTransport':'transport';
 const ast=ts.createSourceFile(name,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),functions=[];const collect=node=>{if(ts.isFunctionDeclaration(node)&&node.name?.text===functionName)functions.push(node.getText(ast));ts.forEachChild(node,collect);};collect(ast);assert.equal(functions.length,1,'exact transport declaration');let text=functions[0];if(name==='routine-equipment.js'){for(const helper of ['hasLocalDraftInput','inputPrincipalCurrent','inputTargetCurrent','inputOwnerCurrent','rememberInputOwner']){const found=[];const visit=n=>{if(ts.isFunctionDeclaration(n)&&n.name?.text===helper)found.push(n.getText(ast));ts.forEachChild(n,visit);};visit(ast);assert.equal(found.length,1,'exact routine owner helper '+helper);text+='\n'+found[0];}}
 let actorIdentity={id:'actor'},epoch=1,delivery={epoch:1};
 const options=[],box={identity:()=>actorIdentity,actor:()=>actorIdentity,key:()=> 'A:group',headers:()=>({}),API:'/api/ipqc-ab',api:'/api/routine-equipment',apiUrl:'/api/iqc',t:x=>x,sharedActor:'',sharedIdentity:'',sharedClientOwner:null,sharedClient:null,control:null,selected:'',iqc:null,checks:null,caseVersionNumbers:new Map(),window:{ProcessSync:{get identity(){return actorIdentity;},identityGeneration:()=>epoch,captureDelivery:()=>delivery,isCurrentDelivery:value=>value===delivery},createSharedDraftClient:o=>{options.push(o);return {};}}};
 if(name==='routine-equipment.js')Object.assign(box,{inputOwner:null,editingEquipmentId:null,nodeDialog:null,addingEquipment:false,pendingPhotos:new Set(),working:null,syncBase:null,selectedVersionId:'draft'});
 if(name==='tooling.js')Object.assign(box,{actor:'',client:null,checksRun:null,checksStatus:'unchecked',beginRecovery:null,sessionStorage:{getItem:()=>null}});box.host=name==='routine-equipment.js'?{isConnected:true,dataset:{activeTab:'quality-routine-equipment'}}:box.window;vm.createContext(box);
 vm.runInContext(text+';this.call='+functionName+';',box);box.call();box.call();assert.equal(options.length,1);assert.equal(options[0].conditionalState,true);assert.equal(options[0].actorId,'actor');assert(options[0].endpoint.includes('caseMetadata=1'));
 if(name==='routine-equipment.js'){box.editingEquipmentId='retained';epoch++;assert.throws(()=>box.call(),/ACCOUNT_CHANGED_REOPEN_REQUIRED/,'dirty old epoch cannot obtain transport');assert.equal(options.length,1);epoch--;delivery={epoch:1};assert.throws(()=>box.call(),/ACCOUNT_CHANGED_REOPEN_REQUIRED/,'dirty stale delivery cannot obtain transport');assert.equal(options.length,1);}
 if(['fqc-master.js','iqc-master.js'].includes(name)){
  assert.equal(options[0].externalDurableBounded.scope,name==='fqc-master.js'?'FQC':'IQC');
  actorIdentity={id:'actor'};box.call();assert.equal(options.length,2,'same-id new actor object invalidates owner');box.call();assert.equal(options.length,2,'stable new owner reuses client');
  epoch++;box.call();assert.equal(options.length,3,'new identity epoch invalidates owner');box.call();assert.equal(options.length,3);
  delivery={epoch:2};box.call();assert.equal(options.length,4,'new delivery invalidates owner');box.call();assert.equal(options.length,4);
 }
});
void test('custom IPQC-C conditional protocol is not opted in',()=>{const line=part(read('ipqc-c.js'),'  function sharedTransport()', '  const workflowErrors=');assert(!line.includes('conditionalState:true'));});
void test('tooling polling skips hidden documents and resumes its existing read in visible documents',async()=>{
 const {box,gate,calls,poll}=pollingFixture();await poll();assert.equal(calls.length,0);box.document.visibilityState='visible';await poll();assert.deepEqual(calls,['g:1']);gate.denied('state',403,gate.capture(),async()=>{});await poll();assert.deepEqual(calls,['g:1'],'actual denied gate prevents another automatic read');
});
void test('authoring polling skips hidden documents without altering manual/initial reads',()=>{
 const source=read('process-authoring-v3.js'),timers=[],calls=[],box={setInterval:f=>timers.push(f),document:{visibilityState:'hidden',activeElement:null},enabled:()=>true,state:{view:'editor'},load:()=>calls.push('read'),window:{ProcessSync:{identity:{id:'synthetic'}}}};box.host=box.window;vm.createContext(box);const gate=readGate(box);box.client=()=>({canPoll:kind=>gate.canPoll(kind)});vm.runInContext(pollingScheduler(source,{fileName:'process-authoring-v3.js',readCall:'load'}),box);timers[0]();assert.equal(calls.length,0);box.document.visibilityState='visible';timers[0]();assert.equal(calls.length,1);gate.denied('state',401,gate.capture(),async()=>{});timers[0]();assert.equal(calls.length,1,'actual denied gate prevents another automatic read');assert(source.includes(' if(enabled())void load();'));
});

void test('tooling scheduler extraction fails closed for absent, ambiguous, nested, malformed or non-reading callbacks',()=>{
 const body='async function poll(){await transport().read();}';
 for(const source of ['setInterval(missing,4000);',body+body+'setInterval(poll,4000);','function decoy(){'+body+'}setInterval(poll,4000);',body+'setInterval(poll,4000);setInterval(poll,4000);','setInterval(()=>{},4000);','setInterval(async()=>{',body+'setInterval(poll,4001);'])assert.throws(()=>pollingScheduler(source));
 for(const source of [body+'setInterval(poll,4000);','setInterval(async()=>{await transport().read();},4000);'])assert(pollingScheduler(source).includes('transport().read()'));
 const current=read('tooling.js');if(current.includes('foregroundPoll.schedule(pollTick)')){
  assert(pollingScheduler(current).includes('foregroundPoll.schedule(pollTick)'));
  for(const changed of [current.replace('foregroundPoll=window.createForegroundPoll()','foregroundPoll=missingFactory()'),current.replace('async function pollTick(){','async function missingTick(){'),current.replace('await poll();','await missingPoll();'),current.replace(/foregroundPoll\.schedule\(pollTick\);(?=\s*\}\)\(\);?\s*$)/,'foregroundPoll.schedule(pollTick);foregroundPoll.schedule(pollTick);')])assert.throws(()=>pollingScheduler(changed),'unknown foreground shape must fail closed');
 }

});
for(const status of [401,403])void test(`tooling actual scheduler stops after ${status} and does not read while hidden`,async()=>{
 const {box,gate,calls,updates,poll,status:setStatus}=pollingFixture();setStatus(status);
 for(let i=0;i<7;i++)await poll();assert.equal(calls.length,0);assert.equal(updates.length,0);
 box.document.visibilityState='visible';for(let i=0;i<7;i++)await poll();assert.deepEqual(calls,['g:1']);assert.equal(updates.length,1);assert.equal(gate.canPoll('state'),false);assert.equal(gate.state('state').status,status);
 box.document.visibilityState='hidden';await poll();box.document.visibilityState='visible';await poll();assert.equal(calls.length,1,'visibility changes must not clear a refusal');assert.equal(updates.length,1,'one denied read produces one sync error');
});
