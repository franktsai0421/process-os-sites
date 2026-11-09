// Complete current initializers and inert compatibility shim. Synthetic ports, no live data.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import '../scripts/entry-performance/foreground-poll.test.mjs';
import {draftModules,assertNoDraftPoll,assertDraftInitializerIdle,assertExplicitHistoryPermissions} from '../scripts/entry-performance/draft-no-poll-fixture.mjs';
import {browserTimerInventory,readBrowserSources} from '../scripts/browser-timer-inventory.mjs';
const read=name=>fs.readFileSync('public/process/'+name,'utf8');
const shared=read('shared-draft-client.js');
const shim=shared.slice(shared.indexOf('  window.createForegroundPoll ='),shared.indexOf('  // Local Begin feedback only:'));
function assertRemoved(source,names){const ast=ts.createSourceFile('caller.js',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),found=[];function walk(n){if(ts.isFunctionDeclaration(n)&&names.includes(n.name?.text))found.push('declaration:'+n.name.text);if(ts.isCallExpression(n)){const e=n.expression;if(ts.isIdentifier(e)&&names.includes(e.text)||ts.isPropertyAccessExpression(e)&&e.name.text==='createForegroundPoll')found.push('call:'+e.getText(ast));}ts.forEachChild(n,walk);}walk(ast);assert.deepEqual(found,[],'retired declarations/startup calls must be absent');}
function fixture(){let requests=0,timers=0,listeners=0;const events=new Map(),window={addEventListener(name,fn){listeners++;events.set(name,fn);}},document={visibilityState:'visible',hasFocus:()=>true,addEventListener(){listeners++;}};const c={window,document,setTimeout(){timers++;throw Error('BACKGROUND_TIMER');},setInterval(){timers++;throw Error('BACKGROUND_INTERVAL');},clearTimeout(){},performance:{now:()=>0},fetch(){requests++;throw Error('BACKGROUND_FETCH');}};vm.createContext(c);vm.runInContext(shim,c);return{c,window,document,state:()=>({requests,timers,listeners})};}
for(const [file,fn] of [['master-data.js','pollMaster'],['fqc-master.js','pollShared'],['iqc-master.js','scheduleRefresh'],['ipqc-ab.js','scheduleRefresh'],['ipqc-c.js','scheduleSharedRefresh'],['bom-workspace.js','pollTick'],['tooling.js','poll']])void test(file+' removes its retired caller and keeps the compatibility shim inert',()=>{
 assertRemoved(read(file),[fn]);const f=fixture(),poll=f.window.createForegroundPoll();for(let i=0;i<100;i++){poll.schedule(()=>{throw Error('CALLBACK_EXECUTED');});poll.cancel();}poll.dispose();assert.deepEqual(f.state(),{requests:0,timers:0,listeners:0});
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

const root=process.cwd();
// Current source proof: removed producers stay absent and each complete shipped
// initializer/event wiring executes. foreground-poll.test.mjs tests the current
// inert compatibility shim; no removed legacy callback is fabricated here.
for(const file of draftModules)void test(file+' complete current initializer/events contain no draft scheduler or requests',async()=>{
 await assertDraftInitializerIdle(root,file);
});
for(const file of ['bom-workspace.js','tooling.js'])void test(file+' complete initializer/events without identity issue no request',async()=>{
 await assertDraftInitializerIdle(root,file,{identity:null});
});
void test('renamed schedulers and recovery callbacks cannot hide a draft reader',()=>{
 for(const text of ['setInterval(()=>read(),4000);','window.createForegroundPoll();','renamed.schedule(()=>read());','session.schedule(()=>{matrixSnapshot();return transport.read();});'])assert.throws(()=>assertNoDraftPoll(root,'negative-probe.js',text),/retired|hide a draft reader/);
});
void test('history and restore explicit actions require fresh exact-true permissions and current owner',async()=>{
 assert.deepEqual(await assertExplicitHistoryPermissions(root),{cases:44,negativeProbes:3,permissionTimers:0});
});
