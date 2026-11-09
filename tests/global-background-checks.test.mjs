// Actual retired scheduler and exact caller closures. Synthetic ports, no live data.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {createHash} from 'node:crypto';
const read=name=>fs.readFileSync('public/process/'+name,'utf8');
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
void test('all browser timeout/interval sites are explicitly inventoried; new timer requires audit',()=>{
 const roots=['public','app','components','hooks'],actual=[];
 for(const root of roots)for(const rel of fs.readdirSync(root,{recursive:true})){const file=(root+'/'+rel).replaceAll('\\','/');if(!/\.(?:m?js|tsx?|html)$/.test(file)||!fs.statSync(file).isFile())continue;const source=fs.readFileSync(file,'utf8'),ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true);function walk(n){if(ts.isCallExpression(n)&&/(?:^|\.)(?:setTimeout|setInterval)$/.test(n.expression.getText(ast))){const text=n.getText(ast).replace(/\r\n/g,'\n');actual.push({file,hash:createHash('sha256').update(text).digest('hex')});}ts.forEachChild(n,walk);}walk(ast);}
 const expected=JSON.parse(fs.readFileSync('tests/fixtures/browser-timer-inventory.json','utf8'));
 assert.deepEqual(actual.sort((a,b)=>(a.file+a.hash).localeCompare(b.file+b.hash)),expected.map(({file,hash})=>({file,hash})).sort((a,b)=>(a.file+a.hash).localeCompare(b.file+b.hash)));
 assert.doesNotMatch(shared,/permissionTimer|checkPermission/);
 for(const file of ['effective-version-notice.js','process-ipqc.js','process-authoring-v3.js'])assert.doesNotMatch(read(file),/setInterval\s*\(/,file);
 assert.doesNotMatch(read('effective-version-notice.js'),/addEventListener\(['"](?:focus|visibilitychange)/);
});
