// Current shipped sources only. Removed draft callers must not be replaced with
// a permissive fake timer; history/restore permissions are checked on explicit actions.
import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';import ts from 'typescript';import {webcrypto} from 'node:crypto';import {canvasDOM} from '../login-reentry-dom.mjs';
export const draftModules=['process-authoring-v3.js','master-data.js','fqc-master.js','iqc-master.js','ipqc-ab.js','ipqc-c.js','routine-equipment.js','bom-workspace.js','tooling.js'];
const source=(root,name)=>fs.readFileSync(path.join(root,'public/process',name),'utf8');
export function assertNoDraftPoll(root,name,text=source(root,name)){
 const ast=ts.createSourceFile(name,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),forbidden=[];
 function visit(node){if(ts.isCallExpression(node)){const callee=node.expression.getText(ast);if(['matrixRecoverySession.schedule','session.schedule'].includes(callee)){const body=node.arguments[0]?.getText(ast)||'';assert.match(body,/matrixSnapshot|errorProjection/,name+' schedules only explicit recovery capture');assert.doesNotMatch(body,/(?:\bfetch|\.(?:read|permissions))\s*\(/,name+' recovery capture cannot hide a draft reader');}if(/(?:^|\.)setInterval$|(?:^|\.)createForegroundPoll$/.test(callee)||ts.isPropertyAccessExpression(node.expression)&&node.expression.name.text==='schedule'&&!['matrixRecoverySession.schedule','session.schedule'].includes(callee))forbidden.push(callee);}if(ts.isFunctionDeclaration(node)&&/^(?:pollMaster|pollShared|pollTick|poll|scheduleRefresh|scheduleSharedRefresh)$/.test(node.name?.text||''))forbidden.push(node.name.text);ts.forEachChild(node,visit);}visit(ast);
 assert.deepEqual(forbidden,[],name+' has no retired recurring draft reader or renamed scheduler call');return text;
}
export async function assertDraftInitializerIdle(root,name,{identity={id:'owner'}}={}){
 const text=assertNoDraftPoll(root,name),dom=canvasDOM(),document=dom.document;document.visibilityState='visible';const timers=new Map(),calls=[],store=new Map();let sequence=0;
 const storage={get length(){return store.size;},key:i=>[...store.keys()][i]??null,getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)};
 const c={...dom,console,crypto:webcrypto,structuredClone,URL,URLSearchParams,Response,Request,AbortController,AbortSignal,TextEncoder,location:{origin:'https://no-poll.invalid',pathname:'/process/',href:'https://no-poll.invalid/process/'},localStorage:storage,sessionStorage:storage,hasPermission:()=>false,readStore:()=>null,escapeHtml:String,queueMicrotask,
  setTimeout(fn,ms){const id=++sequence;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id),setInterval(){throw Error('DRAFT_INTERVAL_FORBIDDEN:'+name);},clearInterval(){},MutationObserver:class{observe(){}disconnect(){}},
  state:{view:'data',masterScope:'AB'},data:{products:[],categories:[]},lines:[],routing:{productRoutes:{},lines:[]},processMaster:{},ipqcMatrix:{},bindView(){},renderInspector(){},bindData(){},bindDataInner(){},bindApproval(){},render(){},editor(){},
  ProcessSync:{deliveryProjection:true,identity,identityGeneration:()=>1,captureDelivery:()=>1,isCurrentDelivery:v=>v===1,platformHeaders:()=>({}),requiresReload:false},
  createMasterSharedBridge:()=>({diff:()=>({patches:[],guards:[]}),flow:()=>null,permissions:()=>({})}),VersionDraftUI:{mount(){},updateSaved(){},preserveView:()=>()=>{},t:v=>v},fetch:async(url,o={})=>{calls.push({url,method:o.method||'GET'});throw Error('IDLE_READ_FORBIDDEN:'+name);}
 };c.window=c;dom.events(c);vm.createContext(c);vm.runInContext(source(root,'shared-draft-client.js'),c);c.createForegroundPoll=()=>{throw Error('DRAFT_SCHEDULER_FORBIDDEN:'+name);};
 vm.runInContext(text,c,{filename:name});
 for(const type of ['focus','visibilitychange','pageshow']){c.dispatchEvent({type});document.dispatchEvent({type});}
 await new Promise(setImmediate);assert.equal(calls.length,0,name+' initialization/focus/visibility has no draft GET or POST');assert.equal(timers.size,0,name+' initialization/events have no timer');return {module:name,sourceAssertions:true,fullInitializer:true,requests:calls.length,timers:timers.size};
}
// Provenance: d1ff4a6 tested two live 4s callbacks; main 9fbba82 (#100) retired
// them. The prior assertions remain in git history. Exercise the actual
// explicit-action helper, never an invented replacement for a removed timer.
export async function assertExplicitHistoryPermissions(root){
 const text=source(root,'shared-draft-client.js'),ast=ts.createSourceFile('shared-draft-client.js',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),found=[],timers=[];
 function visit(node){if(ts.isFunctionDeclaration(node)&&node.name?.text==='freshHistoryPermission')found.push(node.getText(ast));if(ts.isCallExpression(node)&&['setTimeout','setInterval'].includes(node.expression.getText(ast))&&node.getText(ast).includes('client.permissions'))timers.push(node.getText(ast));ts.forEachChild(node,visit);}visit(ast);
 assert.equal(found.length,1,'actual explicit permission helper required');assert.deepEqual(timers,[],'history/restore permission checks have zero timer producers');assert.doesNotMatch(text,/permissionTimer|checkPermission/);
 async function run(helper,keys,mode,key){
  let reads=0,current=mode!=='stale-before';const permissions=Object.fromEntries(keys.map(key=>[key,true]));
  if(mode==='false')permissions[key]=false;if(mode==='missing')delete permissions[key];if(mode==='truthy')permissions[key]='true';
  const owner=()=>current,c={};vm.createContext(c);vm.runInContext(helper+';this.check=freshHistoryPermission;',c);
  const client={async permissions(options){reads++;assert.equal(options.isCurrent,owner,'forward exact caller owner predicate');assert.equal(options.requireAcceptedAccess,true,'fresh reads require accepted permissions');if(mode==='stale-after')current=false;if(['401','403'].includes(mode))throw Object.assign(Error('denied'),{status:Number(mode)});return{permissions};}};
  const pending=c.check(client,owner,keys,'EXPLICIT_PERMISSION_DENIED');
  if(mode==='allow')await pending;
  else await assert.rejects(pending,error=>['stale-before','stale-after'].includes(mode)?error.message==='HISTORY_CONTEXT_CHANGED':['401','403'].includes(mode)?error.status===Number(mode):error.message==='EXPLICIT_PERMISSION_DENIED'&&error.status===403);
  assert.equal(reads,mode==='stale-before'?0:1,'exactly one explicit read, no retry');
 }
 let cases=0;for(const keys of [['history'],['history','edit','restore'],['history','approve'],['history','return']]){
  for(const mode of ['allow','stale-before','stale-after','401','403']){await run(found[0],keys,mode);cases++;}
  for(const key of keys)for(const mode of ['false','missing','truthy']){await run(found[0],keys,mode,key);cases++;}
 }
 const mutations=[
  [found[0].replace("if(!current())throw Error('HISTORY_CONTEXT_CHANGED');",''),'stale-before'],
  [found[0].replace("if(!current())throw Error('HISTORY_CONTEXT_CHANGED');\n    if(keys",'if(keys'),'stale-after'],
  [found[0].replace("state.permissions?.[key]!==true","!state.permissions?.[key]"),'truthy'],
 ];
 for(const [helper,mode]of mutations){assert.notEqual(helper,found[0],'negative control changes actual helper');await assert.rejects(()=>run(helper,['history'],mode,'history'),'weakened permission helper must fail');}
 return {cases,negativeProbes:mutations.length,permissionTimers:timers.length};
}
export function assertDirtyFlushRetained(root){
 const text=source(root,'shared-state.js'),ast=ts.createSourceFile('shared-state.js',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),matches=[];
 function visit(node){if(ts.isCallExpression(node)&&node.expression.getText(ast)==='setTimeout'&&node.arguments[0]?.getText(ast)==='flush'&&node.arguments[1]?.getText(ast)==='250')matches.push(node);ts.forEachChild(node,visit);}visit(ast);assert.equal(matches.length,1,'generic dirty flush retains its 250ms producer');
 let calls=0;const c={timer:null,flush:()=>calls++,setTimeout(fn,ms){assert.equal(ms,250);fn();return 1;}};vm.runInNewContext('timer='+matches[0].getText(ast),c);assert.equal(calls,1);assert.equal(c.timer,1);return 1;
}
