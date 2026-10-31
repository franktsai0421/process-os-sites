import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { combineProcessScripts } from '../lib/process-scripts-build.mjs';
import { combineProcessStyles } from '../lib/process-styles-build.mjs';
const tag = name => `<script data-process-src="${name}"></script>`;

void test('real shell groups only expression scripts, retaining boundaries and private seed exclusions', () => {
  const html = combineProcessStyles(fs.readFileSync('public/process/index.html','utf8'), name => fs.readFileSync('public/process/'+name,'utf8')).html;
  const result = combineProcessScripts(html, name => fs.readFileSync('public/process/'+name,'utf8'));
  assert.equal(result.assets.length, 2);
  assert.equal(result.assets.reduce((n,a)=>n+a.sources.length,0), 46);
  assert(result.assets.some(asset=>asset.sources.includes('master-reference-viewer.js')),'latest52 reference viewer remains in source order');
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
