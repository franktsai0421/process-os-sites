// Actual server entry, extracted client and installed framework query contract.
// In-memory SSR/submit ports only: not hosted routing or native browser acceptance.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import ts from 'typescript';

export const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const requireModule=createRequire(import.meta.url),pageFile='app/login/page.tsx',clientFile='app/login/login-client.tsx';
const destination=requireModule('../lib/login-destination.mjs');
const frameworkRoot=path.dirname(fileURLToPath(import.meta.resolve('vinext')));
const {collectAppPageSearchParams}=await import(pathToFileURL(path.join(frameworkRoot,'server/app-page-head.js')));
const {makeThenableParams}=await import(pathToFileURL(path.join(frameworkRoot,'shims/thenable-params.js')));
export function routeProps(search){return{searchParams:makeThenableParams(collectAppPageSearchParams(new URLSearchParams(search)).pageSearchParams)};}
export function loadLoginModules(ports={},sources={}){
 const modules=new Map();
 function load(file){
  if(modules.has(file))return modules.get(file);
  const mod={exports:{}},text=sources[file]??fs.readFileSync(path.join(root,file),'utf8');modules.set(file,mod.exports);
  const code=ts.transpileModule(text,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  vm.runInNewContext(code,{module:mod,exports:mod.exports,require(id){
   if(id==='react'||id==='react/jsx-runtime')return requireModule(id);
   if(id==='@/lib/login-destination.mjs')return destination;
   if(file===pageFile&&id==='./login-client')return load(clientFile);
   if((file===pageFile||file===clientFile)&&id==='./login.css')return{};
   throw Error('UNEXPECTED_TEST_IMPORT:'+id);
  },URLSearchParams,...ports},{filename:file});modules.set(file,mod.exports);return mod.exports;
 }
 return{Page:load(pageFile).default,Client:load(clientFile).default};
}
function nodeText(source,predicate){const tree=ts.createSourceFile('fixture.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let found;function visit(node){if(predicate(node))found=node.getText(tree);ts.forEachChild(node,visit);}visit(tree);assert.ok(found);return found;}
export async function verifyInitialState(){
 const checks=[],{Page}=loadLoginModules(),{renderToString}=requireModule('react-dom/server');
 const cases=[
  ['empty','', 'process','A'],['quality','?system=quality','quality','A'],
  ['player C','?system=process&view=player&line=C&stage=C-CUT','process','C'],
  ['player B implicit process','?view=player&line=B','process','B'],
  ['duplicate system','?system=quality&system=quality','process','A'],
  ['conflicting system','?system=quality&system=process&view=player&line=C','process','C'],
  ['duplicate line','?view=player&line=C&line=C','process','A'],
  ['duplicate view','?view=player&view=player&line=C','process','A'],
  ['unknown system line and auth','?system=ADMIN&view=player&line=Z&role=admin&password=NEVER-REAL','process','A'],
  ['quality cannot inherit player line','?system=quality&view=player&line=C','quality','A'],
  ['line only is not player','?line=C','process','A'],
  ['unknown reserved keys','?__proto__=quality&constructor=quality&then=quality&next=https://invalid.example','process','A'],
  ['import intent remains separate','?next=/setup/import','process','A']
 ];
 for(const [name,query,system,line] of cases){
  const element=await Page(routeProps(query));assert.equal(element.props.initialSystem,system,name);assert.equal(element.props.initialLine,line,name);
  assert.deepEqual(Object.keys(element.props).sort(),['initialLine','initialSystem']);
  const html=renderToString(element);
  assert.match(html,new RegExp(`aria-pressed="true"[^>]*>${system==='quality'?'品質管理':'製程中控'}</button>`),name);
  assert.match(html,new RegExp(`<option value="${line}" selected="">`),name);
  assert.doesNotMatch(html,/NEVER-REAL|invalid\.example|role="admin"/);
  checks.push(name+' initial SSR');
 }
 const source=fs.readFileSync(path.join(root,clientFile),'utf8');
 assert.match(source,/^'use client';/);assert.doesNotMatch(fs.readFileSync(path.join(root,pageFile),'utf8'),/['"]use client['"]/);
 // Compare preserved security-sensitive actions against the exact old source.
 const oldBlob='2c7ce5b68b18d3eb8c1d0c7c143477df11f5f2a1';
 const previous=execFileSync('git',['show',oldBlob],{cwd:root,encoding:'utf8'});
 assert.equal(createHash('sha256').update(previous).digest('hex'),'bbc889c618c1d49c274ff410330282aea4cdc4bae80ba462e2c9ce30a655c8b8');
 const {Page:OldPage}=loadLoginModules({},{[pageFile]:previous});
 const oldHtml=renderToString(requireModule('react').createElement(OldPage));
 assert.match(oldHtml,/aria-pressed="true"[^>]*>製程中控<\/button>/);assert.match(oldHtml,/<option value="A" selected="">/);
 checks.push('historical SSR reproduces fixed process A before any effect');
 for(const name of ['submit','chooseSystem'])assert.equal(nodeText(source,n=>ts.isFunctionDeclaration(n)&&n.name?.text===name),nodeText(previous,n=>ts.isFunctionDeclaration(n)&&n.name?.text===name));
 const cleanup=s=>nodeText(s,n=>ts.isCallExpression(n)&&n.expression.getText()==='useEffect'&&n.getText().includes('attempt.current++'));
 assert.equal(cleanup(source),cleanup(previous));checks.push('submit chooseSystem and attempt cleanup exact historical source');
 // Run the actual unchanged submit closure: destination must be read after ACK,
 // not reconstructed from the server-provided initial values or captured at submit.
 const submit=nodeText(source,n=>ts.isFunctionDeclaration(n)&&n.name?.text==='submit');
 for(const player of [false,true])for(const changed of ['?system=quality&view=data&dataTab=quality-iqc','?next=/setup/import','?system=quality&system=quality&view=editor','?next=https://invalid.example']){
  let finish;const held=new Promise(r=>finish=r),assigned=[],requests=[],removed=[],errors=[];
  const location={search:'?view=player&line=C',assign:value=>assigned.push(value)};
  const context={busy:false,attempt:{current:0},line:'B',system:'quality',URLSearchParams,window:{location},FormData:class{get(key){return key==='id'?'synthetic-user':'SYNTHETIC-NOT-REAL';}},setBusy(){},setError:value=>errors.push(value),sessionStorage:{removeItem:key=>removed.push(key)},loginDestination:destination.loginDestination,fetch:async(url,options)=>{requests.push({url,options});await held;return{ok:true,status:200};}};
  vm.createContext(context);vm.runInContext(ts.transpileModule(submit+';this.submit=submit;',{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,context);
  const pending=context.submit({preventDefault(){},currentTarget:{},nativeEvent:{submitter:{getAttribute:()=>player?'player':'platform'}}});location.search=changed;finish();await pending;
  const expected=new URLSearchParams(changed);if(player){expected.delete('next');expected.set('system','process');expected.set('view','player');expected.set('line','B');expected.delete('stage');}else if(!expected.has('system'))expected.set('system','quality');
  assert.deepEqual(assigned,[destination.loginDestination(expected.toString())]);assert.deepEqual(removed,['process-platform-signed-out']);assert.equal(requests.length,1);
  assert.equal(requests[0].url,'/api/platform-login');assert.equal(requests[0].options.credentials,'same-origin');assert.deepEqual(JSON.parse(requests[0].options.body),{id:'synthetic-user',password:'SYNTHETIC-NOT-REAL'});assert.deepEqual(errors,['']);
  checks.push((player?'player':'platform')+' submit current URL '+changed);
 }
 return{status:'PASS_LOGIN_INITIAL_STATE',groups:checks.length,checks,limits:['Real installed Vinext duplicate collection/thenable contract and React SSR; not a hosted route or native hydration test.','Submit closure uses synthetic request/navigation/storage ports; no real credential, network, ACL, cookie or database.']};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(await verifyInitialState(),null,2));
