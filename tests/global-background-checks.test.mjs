// Actual retired scheduler and exact caller closures. Synthetic ports, no live data.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import proof from '../scripts/ipqc-ab-integration-source-contract.cjs';
import ts from 'typescript';
import {browserTimerInventory,readBrowserSources} from '../scripts/browser-timer-inventory.mjs';
// Removed A/B producer: retain its exact historical no-op scheduler test; inventory below always reads current source.
const read=name=>{const raw=fs.readFileSync('public/process/'+name);return name==='ipqc-ab.js'?proof.checkoutPredecessor(raw,execFileSync('git',['show','HEAD:public/process/'+name]),'public/process/'+name).toString('utf8'):raw.toString('utf8');};
const shared=read('shared-draft-client.js');
const shim=shared.slice(shared.indexOf('  window.createForegroundPoll ='),shared.indexOf('  // Local Begin feedback only:'));
function declaration(source,name){const ast=ts.createSourceFile('caller.js',source,ts.ScriptTarget.Latest,true),found=[];function walk(n){if(ts.isFunctionDeclaration(n)&&n.name?.text===name)found.push(n.getText(ast));ts.forEachChild(n,walk);}walk(ast);assert.equal(found.length,1,name+' exact closure');return found[0];}
function fixture(){let requests=0,timers=0,listeners=0;const events=new Map(),window={addEventListener(name,fn){listeners++;events.set(name,fn);}},document={visibilityState:'visible',hasFocus:()=>true,addEventListener(){listeners++;}};const c={window,document,setTimeout(){timers++;throw Error('BACKGROUND_TIMER');},setInterval(){timers++;throw Error('BACKGROUND_INTERVAL');},clearTimeout(){},performance:{now:()=>0},fetch(){requests++;throw Error('BACKGROUND_FETCH');}};vm.createContext(c);vm.runInContext(shim,c);return{c,window,document,state:()=>({requests,timers,listeners})};}
for(const [file,fn,variable] of [['master-data.js','pollMaster','sharedPoll'],['fqc-master.js','pollShared','sharedPoll'],['iqc-master.js','scheduleRefresh','pollTimer'],['ipqc-ab.js','scheduleRefresh','pollTimer'],['ipqc-c.js','scheduleSharedRefresh','pollTimer']])void test(file+' real legacy owner cannot schedule any callback',()=>{
 const f=fixture(),poll=f.window.createForegroundPoll();Object.assign(f.c,{[variable]:poll,deliveryGeneration:1,mountSequence:1,workspaceReady:()=>true,currentReadOwner:()=>()=>true,actor:()=>({id:'synthetic'}),host:null});
 vm.runInContext(declaration(read(file),fn)+'\n'+fn+'();',f.c);
 for(let i=0;i<100;i++){poll.schedule(()=>{throw Error('CALLBACK_EXECUTED');});poll.cancel();vm.runInContext(fn+'();',f.c);}
 poll.dispose();assert.deepEqual(f.state(),{requests:0,timers:0,listeners:0});
});
for(const file of ['bom-workspace.js','tooling.js'])void test(file+' actual startup scheduler statement is inert',()=>{
 const f=fixture(),source=read(file),start=source.indexOf(' const foregroundPoll=window.createForegroundPoll();'),end=source.indexOf(' foregroundPoll.schedule(pollTick);',start);assert(start>=0&&end>start);
 vm.runInContext(source.slice(start,end+' foregroundPoll.schedule(pollTick);'.length),f.c);assert.deepEqual(f.state(),{requests:0,timers:0,listeners:0});
});
void test('client import graph and timer aliases match the audited inventory',()=>{
 const {timers:actual}=browserTimerInventory(readBrowserSources());
 const expected=JSON.parse(fs.readFileSync('tests/fixtures/browser-timer-inventory.json','utf8'));
 assert.deepEqual(actual.map(({file,kind,hash})=>({file,kind,hash})).sort((a,b)=>(a.file+a.hash).localeCompare(b.file+b.hash)),expected.map(({file,kind,hash})=>({file,kind,hash})).sort((a,b)=>(a.file+a.hash).localeCompare(b.file+b.hash)));
 assert.doesNotMatch(shared,/permissionTimer|checkPermission/);
 for(const file of ['effective-version-notice.js','process-ipqc.js','process-authoring-v3.js'])assert.doesNotMatch(read(file),/setInterval\s*\(/,file);
 assert.doesNotMatch(read('effective-version-notice.js'),/addEventListener\(['"](?:focus|visibilitychange)/);
});

void test('inventory follows client imports and aliases without including server-only scheduling',()=>{
 const sources=new Map([
  ['app/page.tsx',"'use client';import '@/lib/client.mjs';"],
  ['lib/client.mjs',"const later=globalThis['setTimeout'].bind(globalThis);const alias=later;alias(()=>{},100);import('./other.mjs?v=1');"],
  ['lib/other.mjs',"const {setInterval:repeat}=globalThis;repeat(()=>{},250);"],
  ['lib/server-only.mjs',"setInterval(()=>fetch('/backup'),60000);"],
 ]);
 const result=browserTimerInventory(sources);assert.deepEqual(result.reachable,['app/page.tsx','lib/client.mjs','lib/other.mjs']);assert.deepEqual(result.timers.map(t=>t.kind),['setTimeout','setInterval']);
 sources.set('lib/client.mjs',"const setTimer=options.setTimeout||window.setTimeout.bind(window);setTimer(()=>{},250);");assert.equal(browserTimerInventory(sources).timers[0].kind,'setTimeout');
 sources.set('lib/client.mjs',"import('./'+unreviewed);");assert.throws(()=>browserTimerInventory(sources),/REQUIRES_AUDIT/);
 sources.set('lib/client.mjs',"import './missing.mjs';");assert.throws(()=>browserTimerInventory(sources),/UNRESOLVED_BROWSER_IMPORT/);
});
