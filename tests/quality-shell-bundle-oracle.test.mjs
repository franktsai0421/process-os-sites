import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {combineProcessScripts} from '../lib/process-scripts-build.mjs';
import {combineProcessStyles} from '../lib/process-styles-build.mjs';
import {assertProcessScriptBundles,assertServedProcessScriptBundles,expectedProcessBundleGroups,reviewedProcessBundleAdditions,processBundleBaselineCommit} from './quality-shell-bundle-oracle.mjs';
const read=name=>fs.readFileSync('public/process/'+name,'utf8');
const html=combineProcessStyles(read('index.html'),read).html,result=combineProcessScripts(html,read);
const copy=()=>result.assets.map(asset=>({...asset,sources:[...asset.sources]}));
void test('reviewed main50 plus exactly two named quality modules produces the independently ordered current bundles',()=>{
 assert.equal(processBundleBaselineCommit,'9fbba823090f03da8385c8d92f5e59293d19d2f1');
 assert.deepEqual(reviewedProcessBundleAdditions,['routine-page-approved-history.js','routine-fqc-page.js']);
 assertProcessScriptBundles(result.assets,read);
 const names=[...html.matchAll(/<script data-process-src="([^"]+)"><\/script>/g)].map(match=>match[1].split('?')[0]);
 for(const group of expectedProcessBundleGroups){let last=-1;for(const name of group){assert.equal(names.filter(n=>n===name).length,1);const index=names.indexOf(name);assert(index>last);last=index;}}
 for(const name of ['app.js','editor-line-selection.js','data/imported-data.js','spreadsheet-loader.js'])assert(!result.assets.some(asset=>asset.sources.includes(name)),name+' remains a boundary/private-seed exclusion');
});
for(const eol of ['LF','CRLF'])void test('reviewed source order and exact bytes survive '+eol+' checkout',()=>{
 const normalize=value=>value.replace(/\r\n/g,'\n'),convert=value=>eol==='LF'?normalize(value):normalize(value).replace(/\n/g,'\r\n');
 const port=name=>convert(read(name));const shell=combineProcessStyles(port('index.html'),port).html;
 assertProcessScriptBundles(combineProcessScripts(shell,port).assets,port);
});
const mutations={
 'missing bundle':a=>a.pop(),
 'extra bundle':a=>a.push({...a[0]}),
 'swapped bundles':a=>a.reverse(),
 'missing module':a=>a[1].sources.pop(),
 'duplicate module':a=>a[1].sources.push(a[1].sources[0]),
 'reordered modules':a=>{[a[1].sources[0],a[1].sources[1]]=[a[1].sources[1],a[1].sources[0]];},
 'omitted reviewed module':a=>a[1].sources.splice(a[1].sources.indexOf('routine-fqc-page.js'),1),
 'private seed leakage':a=>a[1].sources.push('data/imported-data.js'),
 'global boundary leakage':a=>a[1].sources.push('app.js'),
 'unreviewed module':a=>a[1].sources[0]='unreviewed.js',
 'wrong completion identity':a=>a[1].id='wrong',
 'wrong content cache URL':a=>a[1].name='shell-scripts.stale.js',
 'changed executable byte':a=>a[1].source=a[1].source.replace('version-workflow.js','version-workflow-corrupt.js'),
 'missing completion receipt':a=>a[1].source=a[1].source.slice(0,a[1].source.lastIndexOf('\n;(window.ProcessRuntimeBundles')),
 'false completion receipt':a=>a[1].source=a[1].source.replace('] = true;\n','] = false;\n'),
 'premature completion receipt':a=>{const at=a[1].source.lastIndexOf('\n;(window.ProcessRuntimeBundles');a[1].source=a[1].source.slice(at)+a[1].source.slice(0,at);},
 'executable suffix after receipt':a=>a[1].source+='\nwindow.unreviewed=true;\n',
};
for(const[name,mutate]of Object.entries(mutations))void test('bundle oracle rejects '+name,()=>{const assets=copy();mutate(assets);assert(assets.length!==result.assets.length||assets.some((a,i)=>a.source!==result.assets[i]?.source||a.id!==result.assets[i]?.id||a.name!==result.assets[i]?.name||JSON.stringify(a.sources)!==JSON.stringify(result.assets[i]?.sources)),'mutation is effective');assert.throws(()=>assertProcessScriptBundles(assets,read),{code:'ERR_ASSERTION'});});
void test('served bytes, status and MIME are verified independently with exactly one request per bundle',async()=>{
 const calls=[];await assertServedProcessScriptBundles(result.assets,read,async path=>{calls.push(path);const asset=result.assets.find(a=>path==='/process/'+a.name);assert(asset);return new Response(asset.source,{headers:{'Content-Type':'text/javascript; charset=utf-8'}});});
 assert.deepEqual(calls,result.assets.map(a=>'/process/'+a.name));
});
for(const fault of ['status','mime','bytes','missing-receipt','checkout-eol'])void test('served bundle oracle rejects '+fault,async()=>{
 await assert.rejects(()=>assertServedProcessScriptBundles(result.assets,read,async path=>{const asset=result.assets.find(a=>path==='/process/'+a.name);const source=fault==='checkout-eol'?asset.source.replace(/\n/g,'\r\n'):fault==='bytes'?asset.source+'\nCORRUPT':fault==='missing-receipt'?asset.source.slice(0,asset.source.lastIndexOf('\n;(window.ProcessRuntimeBundles')):asset.source;return new Response(source,{status:fault==='status'?503:200,headers:{'Content-Type':fault==='mime'?'application/json':'application/javascript'}});}),{code:'ERR_ASSERTION'});
});
const bundled=new Set(expectedProcessBundleGroups.flat());
function syntheticRead(failed){return name=>bundled.has(name)?`(()=>{if(window.ProcessRuntimeBundles?.[window.running])throw Error("EARLY_RECEIPT");window.order.push(${JSON.stringify(name)});${name===failed?'throw Error("SYNTHETIC_SOURCE_FAILURE");':''}})();`:`const boundary_${name.replace(/\W/g,'_')}=1;`;}
void test('actual builder executes every reviewed module once and issues each receipt only after its complete group',()=>{
 const read=syntheticRead(),built=combineProcessScripts(html,read),context={window:{order:[]}};assertProcessScriptBundles(built.assets,read);vm.createContext(context);
 for(const asset of built.assets){context.window.running=asset.id;assert.equal(context.window.ProcessRuntimeBundles?.[asset.id],undefined);vm.runInContext(asset.source,context);assert.equal(context.window.ProcessRuntimeBundles[asset.id],true);}
 assert.deepEqual(context.window.order,expectedProcessBundleGroups.flat());assert.deepEqual(Object.keys(context.window.ProcessRuntimeBundles).sort((a,b)=>a.localeCompare(b)),built.assets.map(a=>a.id).sort((a,b)=>a.localeCompare(b)));
});
for(const group of [0,1])void test('a failed module in group '+group+' cannot emit completion or execute later modules',()=>{
 const failed=expectedProcessBundleGroups[group][2],read=syntheticRead(failed),built=combineProcessScripts(html,read),context={window:{order:[]}};assertProcessScriptBundles(built.assets,read);vm.createContext(context);
 for(let i=0;i<group;i++){context.window.running=built.assets[i].id;vm.runInContext(built.assets[i].source,context);}
 context.window.running=built.assets[group].id;assert.throws(()=>vm.runInContext(built.assets[group].source,context),/SYNTHETIC_SOURCE_FAILURE/);
 assert.equal(context.window.ProcessRuntimeBundles?.[built.assets[group].id],undefined);
 assert.deepEqual(context.window.order,[...expectedProcessBundleGroups.slice(0,group).flat(),...expectedProcessBundleGroups[group].slice(0,3)]);
 for(let i=0;i<group;i++)assert.equal(context.window.ProcessRuntimeBundles[built.assets[i].id],true);
});
