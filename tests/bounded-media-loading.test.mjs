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
// Execute the real 4s scheduler, accepting inline and uniquely bound named callbacks.
const pollingScheduler=source=>{
 const ast=ts.createSourceFile('tooling.js',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),timers=[];
 assert.equal(ast.parseDiagnostics.length,0,'polling source parses');
 const walk=node=>{if(ts.isCallExpression(node)&&node.expression.getText(ast)==='setInterval'&&node.arguments[1]?.getText(ast)==='4000')timers.push(node);ts.forEachChild(node,walk);};walk(ast);
 assert.equal(timers.length,1,'exact tooling 4000ms scheduler');const timer=timers[0];let callback=timer.arguments[0],declaration='';
 if(ts.isIdentifier(callback)){
  let scope=timer.parent;while(scope&&!ts.isBlock(scope)&&!ts.isSourceFile(scope))scope=scope.parent;
  const matches=Array.from(scope?.statements||[]).filter(node=>ts.isFunctionDeclaration(node)&&node.name?.text===callback.text);
  assert.equal(matches.length,1,'unique same-scope polling declaration');callback=matches[0];declaration=callback.getText(ast)+';';
 }else assert(ts.isArrowFunction(callback)||ts.isFunctionExpression(callback),'actual inline polling callback');
 let reads=0;const inspect=node=>{if(ts.isCallExpression(node)&&node.expression.getText(ast)==='transport().read')reads++;ts.forEachChild(node,inspect);};inspect(callback);
 assert.equal(reads,1,'actual transport read in polling callback');return declaration+timer.getText(ast)+';';
};
const pollingFixture=()=>{
 const timers=[],calls=[],updates=[],box={setInterval:(fn,ms)=>timers.push({fn,ms}),document:{visibilityState:'hidden',activeElement:null},host:{isConnected:true,dataset:{activeTab:'quality-mold-equipment'},querySelector:()=>null},reviewHost:null,client:{},busy:false,dialog:null,beginRecovery:null,polling:false,viewEpoch:1,readEpoch:1,flushChecks(){},syncActions(){},flow:()=>({generation:'g',revision:1}),window:{ProcessSync:{identity:{id:'synthetic'}},VersionDraftUI:{updateSync:(...args)=>updates.push(args)}}};
 vm.createContext(box);const gate=readGate(box);let status=200;
 box.client={canPoll:kind=>gate.canPoll(kind),hasUnknown:()=>false};box.transport=()=>({read:async token=>{calls.push(token);if(status!==200){gate.denied('state',status,gate.capture(),async()=>{});throw Error('synthetic read refusal '+status);}return{unchanged:true};}});
 vm.runInContext(pollingScheduler(read('tooling.js')),box);assert.equal(timers.length,1);assert.equal(timers[0].ms,4000);
 return{box,gate,calls,updates,poll:timers[0].fn,status:value=>{status=value;}};
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
 const box={snap:()=>({suppliers:[],categories:[]}),filteredParts:()=>parts,ui:{partCode:'P0'},h:String,t:z=>z,draft:()=>false,mayEdit:()=>false,name:()=>''};vm.createContext(box);vm.runInContext(part(source,'  function partRows()', '  function listPanel()')+'this.renderRows=partRows;',box);
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
 const source=read(name),functionName=name==='routine-equipment.js'?'sharedTransport':'transport',line=source.split('\n').find(s=>s.includes('function '+functionName+'()'));assert(line);
 const options=[],box={identity:()=>({id:'actor'}),actor:()=>({id:'actor'}),key:()=> 'A:group',headers:()=>({}),API:'/api/ipqc-ab',api:'/api/routine-equipment',apiUrl:'/api/iqc',t:x=>x,sharedActor:'',sharedIdentity:'',sharedClient:null,control:null,selected:'',iqc:null,checks:null,caseVersionNumbers:new Map(),window:{ProcessSync:{identity:{id:'actor'}},createSharedDraftClient:o=>{options.push(o);return {};}}};
 if(name==='tooling.js')Object.assign(box,{actor:'',client:null,checksRun:null,checksStatus:'unchecked',beginRecovery:null,sessionStorage:{getItem:()=>null}});vm.createContext(box);
 // IQC's factory spans two physical lines; use its complete function body.
 const text=name==='iqc-master.js'?part(source,'  function transport()', '  const equal='):line;
 vm.runInContext(text+';this.call='+functionName+';',box);box.call();box.call();assert.equal(options.length,1);assert.equal(options[0].conditionalState,true);assert.equal(options[0].actorId,'actor');assert(options[0].endpoint.includes('caseMetadata=1'));
});
void test('custom IPQC-C conditional protocol is not opted in',()=>{const line=part(read('ipqc-c.js'),'  function sharedTransport()', '  const workflowErrors=');assert(!line.includes('conditionalState:true'));});
void test('tooling polling skips hidden documents and resumes its existing read in visible documents',async()=>{
 const {box,gate,calls,poll}=pollingFixture();await poll();assert.equal(calls.length,0);box.document.visibilityState='visible';await poll();assert.deepEqual(calls,['g:1']);gate.denied('state',403,gate.capture(),async()=>{});await poll();assert.deepEqual(calls,['g:1'],'actual denied gate prevents another automatic read');
});
void test('authoring polling skips hidden documents without altering manual/initial reads',()=>{
 const source=read('process-authoring-v3.js'),timers=[],calls=[],box={setInterval:f=>timers.push(f),document:{visibilityState:'hidden',activeElement:null},enabled:()=>true,state:{view:'editor'},load:()=>calls.push('read'),window:{ProcessSync:{identity:{id:'synthetic'}}}};box.host=box.window;vm.createContext(box);const gate=readGate(box);box.client=()=>({canPoll:kind=>gate.canPoll(kind)});vm.runInContext(source.split('\n').find(l=>l.startsWith(' setInterval(')),box);timers[0]();assert.equal(calls.length,0);box.document.visibilityState='visible';timers[0]();assert.equal(calls.length,1);gate.denied('state',401,gate.capture(),async()=>{});timers[0]();assert.equal(calls.length,1,'actual denied gate prevents another automatic read');assert(source.includes(' if(enabled())void load();'));
});

void test('tooling scheduler extraction fails closed for absent, ambiguous, nested, malformed or non-reading callbacks',()=>{
 const body='async function poll(){await transport().read();}';
 for(const source of ['setInterval(missing,4000);',body+body+'setInterval(poll,4000);','function decoy(){'+body+'}setInterval(poll,4000);',body+'setInterval(poll,4000);setInterval(poll,4000);','setInterval(()=>{},4000);','setInterval(async()=>{',body+'setInterval(poll,4001);'])assert.throws(()=>pollingScheduler(source));
 for(const source of [body+'setInterval(poll,4000);','setInterval(async()=>{await transport().read();},4000);'])assert(pollingScheduler(source).includes('transport().read()'));
});
for(const status of [401,403])void test(`tooling actual scheduler stops after ${status} and does not read while hidden`,async()=>{
 const {box,gate,calls,updates,poll,status:setStatus}=pollingFixture();setStatus(status);
 for(let i=0;i<7;i++)await poll();assert.equal(calls.length,0);assert.equal(updates.length,0);
 box.document.visibilityState='visible';for(let i=0;i<7;i++)await poll();assert.deepEqual(calls,['g:1']);assert.equal(updates.length,1);assert.equal(gate.canPoll('state'),false);assert.equal(gate.state('state').status,status);
 box.document.visibilityState='hidden';await poll();box.document.visibilityState='visible';await poll();assert.equal(calls.length,1,'visibility changes must not clear a refusal');assert.equal(updates.length,1,'one denied read produces one sync error');
});
