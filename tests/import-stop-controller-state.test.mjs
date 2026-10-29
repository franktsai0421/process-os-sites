// Source-bound handler ordering plus real React SSR. These are not native/committed-DOM tests.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {runInNewContext} from 'node:vm';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ts from 'typescript';
import ImportClient from '../app/setup/import/upload-client.tsx';

const source=readFileSync(new URL('../app/setup/import/upload-client.tsx',import.meta.url),'utf8');
const ast=ts.createSourceFile('upload-client.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
function handler(name,scope){
 let declaration;
 function visit(node){if(ts.isFunctionDeclaration(node)&&node.name?.text===name)declaration=node;ts.forEachChild(node,visit);}
 visit(ast);assert.ok(declaration,`actual ${name} handler exists`);
 const script=ts.transpileModule(`(${declaration.getText(ast)})`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
 return runInNewContext(script,{...scope,Error,URL,Headers},{timeout:1000});
}
function deferred(){let resolve,reject;const promise=new Promise((res,rej)=>{resolve=res;reject=rej;});return{promise,resolve,reject};}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function harness(overrides={}){
 const state={busy:false,available:false,progress:null,message:'',ready:false};
 const events=[];const abort={current:null};
 const scope={abort,AbortController,pins:{origin:'https://synthetic.invalid'},capacity:null,attempt:null,resume:false,activate:false,
  setBusy:value=>{state.busy=value;events.push(['busy',value]);},
  setControllerAvailable:value=>{state.available=value;events.push(['available',value,abort.current!==null]);},
  setReady:value=>{state.ready=value;},setMessage:value=>{state.message=value;},
  setProgress:value=>{state.progress=typeof value==='function'?value(state.progress):value;},
  open:async()=>({}),createRecipeUploader:async()=>({upload:async()=>{},restore:async()=>({})}),
  refreshBudget:async()=>{},importRestoreMessage:()=> 'confirmed',...overrides};
 return{scope,state,events,abort,upload:handler('upload',scope)};
}
void test('render uses an availability state, retaining original controller assignments and abort handler',()=>{
 assert.match(source,/const \[controllerAvailable,setControllerAvailable\]=useState\(false\)/);
 assert.equal((source.match(/abort\.current\s*=/g)||[]).length,2);
 assert.match(source,/abort\.current=new AbortController\(\);setControllerAvailable\(true\);/);
 assert.match(source,/finally\{setBusy\(false\);abort\.current=null;setControllerAvailable\(false\);\}/);
 assert.match(source,/disabled=\{!busy\|\|!controllerAvailable\} onClick=\{\(\)=>abort\.current\?\.abort\(\)\}/);
 assert.doesNotMatch(source,/disabled=\{[^}]*abort\.current/);
});
void test('actual React server render keeps Stop disabled and native top-level login destination unchanged',()=>{
 const html=renderToStaticMarkup(React.createElement(ImportClient,{pins:{projectId:'synthetic',origin:'https://synthetic.invalid',ownerId:'fixture',targetFingerprint:'fixture',manifestSha256:'0'.repeat(64)},capacity:null,bootstrapClosed:true}));
 assert.match(html,/<button disabled=""[^>]*>停止送出並核對最後收據/);
 assert.match(html,/<form action="\/login" method="get" target="_top">/);
 assert.match(html,/<input type="hidden" name="next" value="\/setup\/import"\/>/);
 assert.match(html,/<button type="submit"[^>]*>登入後返回匯入頁/);
});
void test('availability is set synchronously after admission and retained through upload and restore',async()=>{
 const opened=deferred(),uploaded=deferred(),restored=deferred();let signal,uploads=0,restores=0;
 const h=harness({open:()=>opened.promise,createRecipeUploader:async options=>{signal=options.signal;return{upload:()=>{uploads++;return uploaded.promise;},restore:()=>{restores++;return restored.promise;}};}});
 const completion=h.upload();assert.equal(h.state.busy,true);assert.equal(h.state.available,true);
 const controller=h.abort.current;assert.ok(controller);assert.deepEqual(h.events.slice(0,2),[['busy',true],['available',true,true]]);
 opened.resolve({});await tick();assert.equal(signal,controller.signal);assert.equal(uploads,1);assert.equal(h.state.available,true);
 uploaded.resolve();await tick();assert.equal(restores,1);assert.equal(h.state.available,true);
 restored.resolve({});await completion;assert.equal(h.state.busy,false);assert.equal(h.state.available,false);assert.equal(h.abort.current,null);
});
void test('preflight busy does not invent an abort controller or enable Stop',async()=>{
 const opened=deferred(),h=harness({open:()=>opened.promise,prepareRecipeUpload:async()=>({manifest:{},summary:{}}),inspectRecipeD1Rows:async()=>[],setSummary:()=>{},assertUploadCapacity:()=>{},assertAttemptPlan:()=>{},bootstrapClosed:true,importPreflightMessage:()=> 'prepared'});
 const completion=handler('preflight',h.scope)();assert.equal(h.state.busy,true);assert.equal(h.state.available,false);assert.equal(h.abort.current,null);
 opened.resolve({});await completion;assert.equal(h.state.ready,true);assert.equal(h.state.available,false);
});
void test('retirement busy and its receipt check never enable Stop',async()=>{
 const response=deferred(),budget=deferred(),h=harness({retirementState:{oldTransferId:'old',nextTransferId:'new',state:'required'},fetch:()=>response.promise,setRetirementState:()=>{},setReceiptUncertain:()=>{},refreshBudget:()=>budget.promise});
 const completion=handler('retireCancelled',h.scope)();assert.equal(h.state.busy,true);assert.equal(h.state.available,false);
 response.resolve({ok:false});await tick();assert.equal(h.state.busy,true);assert.equal(h.abort.current,null);assert.equal(h.state.available,false);
 budget.resolve();await completion;assert.equal(h.state.busy,false);
});
void test('preparation failure retains the controller until the existing receipt-read finally boundary',async()=>{
 const budget=deferred(),h=harness({open:async()=>{throw Error('PREPARATION_FAILED');},refreshBudget:()=>budget.promise});
 const completion=h.upload();await tick();assert.equal(h.state.progress.stage,'error');assert.equal(h.state.available,true);
 const controller=h.abort.current;controller.abort();assert.equal(h.abort.current,controller);assert.equal(h.state.available,true);
 budget.resolve();await completion;assert.equal(h.state.available,false);assert.equal(h.abort.current,null);
});
void test('aborting the original controller is retained; no retry is introduced while receipt read is pending',async()=>{
 const upload=deferred(),budget=deferred();let calls=0;
 const h=harness({createRecipeUploader:async()=>({upload:()=>{calls++;return upload.promise;},restore:async()=>{throw Error('UNREACHABLE');}}),refreshBudget:()=>budget.promise});
 const completion=h.upload();await tick();const controller=h.abort.current;controller.abort();upload.reject(Error('ABORTED'));
 await tick();assert.equal(h.state.progress.stage,'stopped');assert.equal(h.state.available,true);assert.equal(h.abort.current,controller);assert.equal(calls,1);
 budget.resolve();await completion;assert.equal(h.state.available,false);assert.equal(calls,1);
});
void test('even a receipt-read rejection reaches the original controller-clear boundary',async()=>{
 const h=harness({open:async()=>{throw Error('OPEN_FAILED');},refreshBudget:async()=>{throw Error('READ_FAILED');}});
 await assert.rejects(h.upload(),/READ_FAILED/);assert.equal(h.state.busy,false);assert.equal(h.abort.current,null);assert.equal(h.state.available,false);
});
void test('constructor failure preserves the existing pre-try behavior without reporting a controller',async()=>{
 const h=harness({AbortController:class {constructor(){throw Error('NO_CONTROLLER');}}});
 await assert.rejects(h.upload(),/NO_CONTROLLER/);assert.equal(h.state.busy,true);assert.equal(h.abort.current,null);assert.equal(h.state.available,false);
});
void test('overlapping source-handler finally retains the original shared-ref clearing semantics',async()=>{
 const first=deferred(),second=deferred();let calls=0;
 const h=harness({createRecipeUploader:async()=>({upload:()=> ++calls===1?first.promise:second.promise,restore:async()=>({})})});
 const done1=h.upload();await tick();const oldController=h.abort.current;
 const done2=h.upload();await tick();assert.notEqual(h.abort.current,oldController);assert.equal(h.state.available,true);
 first.resolve();await done1;assert.equal(h.abort.current,null);assert.equal(h.state.available,false);assert.equal(h.state.busy,false);
 second.resolve();await done2;assert.equal(h.state.available,false);assert.equal(calls,2);
});
