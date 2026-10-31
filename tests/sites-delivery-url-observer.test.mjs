// Execute the exact browser init callback in isolated JS realms, never launch it.
// Native Node URL smoke is restored by original descriptors in finally; it is
// not a native-browser or compiled-delivery acceptance claim.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';
import ts from 'typescript';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),file='tests/sites-delivery-browser.test.mjs';
const current=fs.readFileSync(path.join(root,file),'utf8').replace(/\r\n/g,'\n'),baselineBlob='fbaa4277b0bf52e473b1ed9e19c508d09ce142bd';
const previous=execFileSync('git',['show',baselineBlob],{cwd:root,encoding:'utf8'});
assert.equal(createHash('sha256').update(previous).digest('hex'),'a44cfd2837a3a6bcb7938fd40ae3e85022c332269a5186305c3ff82a9f29d355');
function init(source){const sf=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),callbacks=[];function visit(node){if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)&&node.expression.name.text==='addInitScript')callbacks.push(node.arguments[0].getText(sf));ts.forEachChild(node,visit);}visit(sf);assert.equal(callbacks.length,1);return callbacks[0];}
const callbacks=[init(previous),init(current)];
function ports(){let id=0;const events=[];const target={addEventListener(type,listener,options){events.push({target:this,type,listener,options,action:'add'});},removeEventListener(type,listener,options){events.push({target:this,type,listener,options,action:'remove'});}};const window={...target,setInterval(){return ++id;},clearInterval(){},setTimeout(){return ++id;},clearTimeout(){}},document={...target};return{window,document,events};}
function run(callback,URL,io=ports()){const realm=vm.createContext(io.window);realm.URL=URL;realm.document=io.document;realm.window=vm.runInContext('globalThis',realm);io.global=realm.window;vm.runInContext('('+callback+')()',realm,{filename:'actual-delivery-init.js'});return io;}
function counts(io){return JSON.parse(JSON.stringify(io.window.__fixtureResourceCounts()));}
function descriptors(target){return Object.fromEntries(['createObjectURL','revokeObjectURL'].map(key=>[key,Object.getOwnPropertyDescriptor(target,key)]));}
function restore(target,originals){Object.defineProperties(target,originals);assert.deepEqual(descriptors(target),originals);}

void test('only reviewed descriptor capture and browser selection change; wrappers and delivery assertions retain canonical source across LF/CRLF checkouts',()=>{
 const old='const create=URL.createObjectURL,revoke=URL.revokeObjectURL;';
 const next="const createDescriptor=Object.getOwnPropertyDescriptor(URL,'createObjectURL'),revokeDescriptor=Object.getOwnPropertyDescriptor(URL,'revokeObjectURL');\n   if(!createDescriptor||!revokeDescriptor||typeof createDescriptor.value!=='function'||typeof revokeDescriptor.value!=='function')throw Error('NATIVE_URL_DATA_METHODS_REQUIRED');\n   const create=createDescriptor.value,revoke=revokeDescriptor.value;";
 const oldLaunch="const bundled=chromium.executablePath(),launchTarget=fs.existsSync(bundled)?{executablePath:bundled}:{channel:'chrome'};";
 const nextLaunch="const bundled=chromium.executablePath(),launchTarget=process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:fs.existsSync(bundled)?{executablePath:bundled}:{channel:'chrome'};";
 assert.equal(previous.split(oldLaunch).length,2);
 const reviewedStayDelta=[[" if(await writer.page.locator('#iqc-begin').count())await writer.page.locator('#iqc-begin').click();", " let writerPosts=0;writer.page.on('request',request=>{if(request.method()==='POST')writerPosts++;});\n async function stayOnWriterPage(){\n  const beforeURL=writer.page.url(),beforePosts=writerPosts,focused=await writer.page.evaluateHandle(()=>document.activeElement);\n  try{\n   await writer.page.evaluate(()=>window.ProcessDeliveryNavigation.navigate('data','AB','process'));\n   const decision=writer.page.locator('#process-navigation-departure[open]');await decision.waitFor({state:'visible'});assert(await decision.isVisible());\n   const stay=decision.locator('[data-departure-choice=\"stay\"]');assert(await stay.isEnabled());await stay.click();\n   await writer.page.locator('#process-navigation-departure').waitFor({state:'detached'});\n   assert.equal(writer.page.url(),beforeURL);assert.equal(writerPosts,beforePosts,'Stay must not write or replay an operation');\n   assert(await writer.page.evaluate(element=>document.activeElement===element,focused),'Stay preserves original focus');\n  }finally{await focused.dispose();}\n }\n if(await writer.page.locator('#iqc-begin').count())await writer.page.locator('#iqc-begin').click();"], ["const dirtyURL=writer.page.url();await writer.page.evaluate(()=>window.ProcessDeliveryNavigation.navigate('data','AB','process'));assert.equal(writer.page.url(),dirtyURL);", "const dirtyURL=writer.page.url();await stayOnWriterPage();assert.equal(writer.page.url(),dirtyURL);"], ["const unknownURL=writer.page.url();await writer.page.evaluate(()=>window.ProcessDeliveryNavigation.navigate('data','AB','process'));assert.equal(writer.page.url(),unknownURL);", "const unknownURL=writer.page.url();await stayOnWriterPage();assert.equal(writer.page.url(),unknownURL);"], ["data:document.querySelector('#data-content')?.innerHTML.slice(0,1400),root:document.querySelector('#view-root')?.textContent.slice(0,500)", "departureOpen:!!document.querySelector('#process-navigation-departure[open]'),partForms:document.querySelectorAll('#iqc-part-form').length,partSubmitDisabled:document.querySelector('#iqc-part-form button[type=\"submit\"]')?.disabled??null,partFormInert:!!document.querySelector('#iqc-part-form')?.closest('[inert]'),focusId:document.activeElement?.id||null"]];
 const check=value=>{let text=value.replace(/\r\n/g,'\n');for(const [before,after]of reviewedStayDelta){assert.equal(text.split(after).length,2,'each exact reviewed Stay/diagnostic span occurs once');text=text.replace(after,before);}assert.equal(text.split(next).length,2);assert.equal(text.split(nextLaunch).length,2);assert.equal(text.replace(next,old).replace(nextLaunch,oldLaunch),previous);};
 check(current);check(current.replace(/\n/g,'\r\n'));assert.throws(()=>check(current.replace('urls.add(url)','urls.clear()')),{code:'ERR_ASSERTION'});
 assert.throws(()=>check(current.replace('process.env.CHROME_PATH','process.env.OTHER_BROWSER')),{code:'ERR_ASSERTION'});
 assert.throws(()=>check(current.replace('--disable-background-networking','--changed-networking')),{code:'ERR_ASSERTION'});
 assert.throws(()=>check(current.replace('await stay.click();','')), {code:'ERR_ASSERTION'});
 assert.throws(()=>check(current.replace('writerPosts,beforePosts','writerPosts,writerPosts')), {code:'ERR_ASSERTION'});
 assert.throws(()=>check(current.replace('document.activeElement===element','true')), {code:'ERR_ASSERTION'});
});
for(const mode of ['method','foreign','detached'])void test('original function, dynamic receiver, return and exact one call: '+mode,()=>{
 const outcomes=[];
 for(const callback of callbacks){
  const io=ports(),calls=[],foreign={tag:'foreign'},token={id:'synthetic-blob'},returned={url:'synthetic-url'},revokeResult={ok:true};
  const target={createObjectURL(value){calls.push({method:'create',receiver:this,value,before:counts(io).objectURLs});return returned;},revokeObjectURL(value){calls.push({method:'revoke',receiver:this,value,before:counts(io).objectURLs});return revokeResult;}};
  const original=descriptors(target),receiver=mode==='method'?target:mode==='foreign'?foreign:undefined;
  try{
   run(callback,target,io);const installed=descriptors(target);assert.equal(installed.createObjectURL.value.length,1);assert.equal(installed.revokeObjectURL.value.length,1);
   for(const key of Object.keys(original)){assert.notEqual(installed[key].value,original[key].value);for(const flag of ['writable','enumerable','configurable'])assert.equal(installed[key][flag],original[key][flag]);}
   const created=target.createObjectURL.call(receiver,token);assert.equal(created,returned);assert.equal(counts(io).objectURLs,1);
   assert.equal(target.revokeObjectURL.call(receiver,returned),revokeResult);assert.equal(counts(io).objectURLs,0);assert.equal(calls.length,2);
   for(const call of calls)assert.equal(call.receiver,mode==='detached'?io.global:receiver);if(mode==='detached')assert.equal(io.global.window,io.global);assert.equal(calls[0].value,token);assert.equal(calls[1].value,returned);assert.equal(calls[0].before,0);assert.equal(calls[1].before,0,'deletion remains before native revoke');
   const listener=()=>{};io.window.addEventListener('fixture',listener,false);io.document.addEventListener('fixture',listener,true);assert.equal(counts(io).globalListeners,2);io.window.removeEventListener('fixture',listener,false);io.document.removeEventListener('fixture',listener,true);assert.equal(counts(io).globalListeners,0);
   assert.equal(io.events[0].target,io.window);assert.equal(io.events[1].target,io.document);
   const interval=io.window.setInterval(()=>{},1);assert.equal(counts(io).intervals,1);io.window.clearInterval(interval);assert.equal(counts(io).intervals,0);
   outcomes.push({calls:calls.map(x=>({method:x.method,before:x.before})),counts:counts(io)});
  }finally{restore(target,original);}
 }
 assert.deepEqual(outcomes[1],outcomes[0]);
});
for(const mode of ['create','revoke'])void test('synchronous '+mode+' throw identity and bookkeeping order are unchanged; descriptors still restore',()=>{
 const outcomes=[];
 for(const callback of callbacks){
  const io=ports(),failure=new Error('SYNTHETIC_URL_FAILURE'),calls=[];
  const target={createObjectURL(value){calls.push(['create',value]);if(mode==='create')throw failure;return 'blob:synthetic';},revokeObjectURL(value){calls.push(['revoke',value]);if(mode==='revoke')throw failure;}};
  const original=descriptors(target);
  try{run(callback,target,io);if(mode==='create')assert.throws(()=>target.createObjectURL('input'),error=>error===failure);else{assert.equal(target.createObjectURL('input'),'blob:synthetic');assert.equal(counts(io).objectURLs,1);assert.throws(()=>target.revokeObjectURL('blob:synthetic'),error=>error===failure);}assert.equal(counts(io).objectURLs,0);outcomes.push({calls,counts:counts(io)});}finally{restore(target,original);}
 }
 assert.deepEqual(outcomes[1],outcomes[0]);
});
void test('captured original remains exact across later wrapper calls; no bind or reconstructed native function',()=>{
 const io=ports(),calls=[];const originalCreate=function(value){calls.push([this,value]);return 'blob:identity';},originalRevoke=function(value){calls.push([this,value]);};
 const target={};Object.defineProperties(target,{createObjectURL:{value:originalCreate,writable:true,configurable:true,enumerable:false},revokeObjectURL:{value:originalRevoke,writable:true,configurable:true,enumerable:false}});const original=descriptors(target);
 try{run(callbacks[1],target,io);const foreign={};target.createObjectURL.call(foreign,'a');target.revokeObjectURL.call(foreign,'blob:identity');assert.equal(calls.length,2);assert.equal(calls[0][0],foreign);assert.equal(calls[1][0],foreign);assert.equal(descriptors(target).createObjectURL.enumerable,false);}finally{restore(target,original);}
 assert.equal(Object.getOwnPropertyDescriptor(target,'createObjectURL').value,originalCreate);assert.equal(Object.getOwnPropertyDescriptor(target,'revokeObjectURL').value,originalRevoke);
});
for(const mode of ['missing-create','missing-revoke','not-function','accessor','inherited'])void test('unsupported non-native URL host rejects before installing either URL wrapper: '+mode,()=>{
 let getterCalls=0;const create=()=>'',revoke=()=>{},target=mode==='inherited'?Object.create({createObjectURL:create,revokeObjectURL:revoke}):{createObjectURL:create,revokeObjectURL:revoke};
 if(mode==='missing-create')delete target.createObjectURL;if(mode==='missing-revoke')delete target.revokeObjectURL;if(mode==='not-function')target.revokeObjectURL=null;if(mode==='accessor')Object.defineProperty(target,'createObjectURL',{get(){getterCalls++;return create;},configurable:true});
 const original=descriptors(target);assert.throws(()=>run(callbacks[1],target),/NATIVE_URL_DATA_METHODS_REQUIRED/);assert.equal(getterCalls,0);assert.deepEqual(descriptors(target),original);
});
void test('abrupt isolated test failure still restores exact original URL descriptors in finally',()=>{
 const target={createObjectURL(){return 'blob:interrupted';},revokeObjectURL(){}},original=descriptors(target),interruption=new Error('SYNTHETIC_TEST_INTERRUPTION');
 assert.throws(()=>{try{run(callbacks[1],target);target.createObjectURL();throw interruption;}finally{restore(target,original);}},error=>error===interruption);
 assert.deepEqual(descriptors(target),original);
});
void test('native Node URL descriptor smoke restores exact global functions after success and native validation failure',()=>{
 const original=descriptors(URL),io=ports();let url;
 try{run(callbacks[1],URL,io);url=URL.createObjectURL(new Blob(['synthetic-only']));assert.match(url,/^blob:nodedata:/);assert.equal(counts(io).objectURLs,1);assert.equal(URL.revokeObjectURL(url),undefined);assert.equal(counts(io).objectURLs,0);assert.throws(()=>URL.createObjectURL({}),{code:'ERR_INVALID_ARG_TYPE'});assert.equal(counts(io).objectURLs,0);}finally{restore(URL,original);if(url)URL.revokeObjectURL(url);}
 assert.deepEqual(descriptors(URL),original);
});
