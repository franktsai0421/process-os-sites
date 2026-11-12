import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { combineProcessScripts } from '../lib/process-scripts-build.mjs';
import { combineProcessStyles } from '../lib/process-styles-build.mjs';
import {assertProcessScriptBundles} from './process-shell-bundle-oracle.mjs';
const tag = name => `<script data-process-src="${name}"></script>`;

void test('real shell groups only expression scripts, retaining boundaries and private seed exclusions', () => {
  const html = combineProcessStyles(fs.readFileSync('public/process/index.html','utf8'), name => fs.readFileSync('public/process/'+name,'utf8')).html;
  const result = combineProcessScripts(html, name => fs.readFileSync('public/process/'+name,'utf8'));
  assert.equal(result.assets.length, 2);
  assertProcessScriptBundles(result.assets,name=>fs.readFileSync('public/process/'+name,'utf8'));
  assert.equal(result.assets.flatMap(asset=>asset.sources).filter(name=>name==='canvas-approved-history.js').length,1,'Canvas history is included exactly once');
  for(const name of ['page-draft-merge.js','master-page-transfer.js','master-page-approved-history.js','master-page-editor.js','master-page-excel.js'])assert.equal(result.assets.flatMap(a=>a.sources).filter(file=>file===name).length,1,name+' loads exactly once');
  const reporterAsset=result.assets.find(asset=>asset.sources.includes('access-event-reporter.js'));
  assert(reporterAsset,'optional event reporter remains in the ordered shell bundle');
  assert.equal(result.assets.flatMap(asset=>asset.sources).filter(name=>name==='access-event-reporter.js').length,1,'reporter is bundled exactly once');
  assert(reporterAsset.sources.indexOf('access-event-reporter.js')<reporterAsset.sources.indexOf('shared-draft-client.js'),'reporter is available before shared-client observations');
  assert(result.assets.some(asset=>asset.sources.includes('master-reference-viewer.js')),'latest52 reference viewer remains in source order');
  const recoveryAsset=result.assets.find(asset=>asset.sources.includes('local-draft-recovery.js'));
  assert(recoveryAsset,'local recovery helper stays in ordered bundle');
  assert(recoveryAsset.sources.indexOf('local-draft-recovery-session.js')>recoveryAsset.sources.indexOf('local-draft-recovery.js'));
  assert(result.html.indexOf(recoveryAsset.name)<result.html.indexOf('data-process-src="app.js?'),'recovery is available before PROCESS binder');
  const canvasAsset=result.assets.find(asset=>asset.sources.includes('canvas-recovery-store.js'));
  assert(canvasAsset.sources.indexOf('canvas-recovery-store.js')<canvasAsset.sources.indexOf('canvas-local.js'),'canvas store loads before runtime admission');
  for (const asset of result.assets) {
    let cursor = 0;
    for (const name of asset.sources) {
      assert(!['app.js','editor-line-selection.js'].includes(name));
      const source = fs.readFileSync('public/process/'+name,'utf8');
      const at = asset.source.indexOf(source, cursor);
      assert(at >= cursor, name+' keeps exact content/order');cursor = at + source.length;
    }
    assert.doesNotThrow(()=>new vm.Script(asset.source));
  }
  assert.match(result.html,/data-process-src="data\/imported-data\.js/);
  assert.match(result.html,/data-process-src="app\.js\?/);
  assert.match(result.html,/data-process-src="spreadsheet-loader\.js/);
  assert.doesNotMatch(result.html,/data-process-src="vendor\/xlsx/);
  assert.equal((result.html.match(/data-process-bundle=/g)||[]).length,2);
});

void test('global declarations, strict directives, currentScript and intervening DOM stay boundaries', () => {
  for (const boundary of ['const shared = 1;', 'function shared() {}', '"use strict";(()=>{})();', '(()=>document.currentScript)();']) {
    const files={'a.js':'(()=>{window.order.push("a")})();','b.js':boundary,'c.js':'(()=>{window.order.push("c")})();'};
    assert.equal(combineProcessScripts(Object.keys(files).map(tag).join(''),name=>files[name]).assets.length,0);
  }
  assert.equal(combineProcessScripts(tag('a.js')+'<script>window.bar=1</script>'+tag('b.js'),()=>'(function(){})();').assets.length,0);
});

void test('scope, strictness and order are retained; failure never issues completion receipt', () => {
  const files={'a.js':'(function(){"use strict"; const local=1; window.values.push([local,this===undefined]);})();','b.js':'(()=>{ const local=2; window.values.push(local); })();'};
  const result=combineProcessScripts(Object.keys(files).map(tag).join(''),name=>files[name]),asset=result.assets[0];
  const context={window:{values:[]}};vm.runInNewContext(asset.source,context);
  assert.deepEqual(structuredClone(context.window.values),[[1,true],2]);
  assert.equal(context.window.ProcessRuntimeBundles[asset.id],true);
  const broken=combineProcessScripts(tag('a.js')+tag('b.js'),name=>name==='a.js'?'(()=>{throw Error("fixture")})();':files[name]).assets[0];
  const failed={window:{values:[]}};assert.throws(()=>vm.runInNewContext(broken.source,failed),/fixture/);
  assert.equal(failed.window.ProcessRuntimeBundles,undefined);assert.deepEqual(failed.window.values,[]);
  assert.notEqual(asset.id,broken.id);
});

void test('shared-client executable bytes determine the built cache URL, independently of source query tags',()=>{
 const html=fs.readFileSync('public/process/index.html','utf8'),read=name=>fs.readFileSync('public/process/'+name,'utf8');
 const current=combineProcessScripts(html,read),asset=current.assets.find(a=>a.sources.includes('shared-draft-client.js'));assert(asset);
 const tagOnly=combineProcessScripts(html.replace(/shared-draft-client\.js\?v=[^" ]+/, 'shared-draft-client.js?v=synthetic-old-cache-token'),read);
 assert.equal(tagOnly.assets.find(a=>a.sources.includes('shared-draft-client.js')).name,asset.name,'same executable bytes keep the same content-addressed URL');
 const changed=combineProcessScripts(html,name=>read(name)+(name==='shared-draft-client.js'?'\nvoid "synthetic-content-change";':'')),next=changed.assets.find(a=>a.sources.includes('shared-draft-client.js'));
 assert.notEqual(next.name,asset.name,'changing executable bytes with an unchanged source tag must invalidate the built URL');
 assert(current.html.includes(`data-process-src="${asset.name}"`));assert(changed.html.includes(`data-process-src="${next.name}"`));assert(!changed.html.includes(`data-process-src="${asset.name}"`));
 assert.equal(asset.source.split(read('shared-draft-client.js')).length-1,1,'exact current transport is included once');
});
