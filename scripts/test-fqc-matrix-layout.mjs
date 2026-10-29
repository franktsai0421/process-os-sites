// Actual renderer + bounded synthetic DOM and CSS contracts. Not browser/layout acceptance.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {canvasDOM} from './login-reentry-dom.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=fs.readFileSync(path.join(root,'public/process/fqc-master.js'),'utf8');
const css=fs.readFileSync(path.join(root,'public/process/fqc-master.css'),'utf8');
const results=[];
function check(name,run){run();results.push({name,status:'PASS'});console.log('PASS',name);}
function fixture(language='zh-Hant',script=source){
  const {document}=canvasDOM();document.documentElement.lang=language;
  const forbidden=()=>{throw Error('NO_NETWORK_STORAGE_OR_TIMER_ALLOWED');};
  const context={document,console,localStorage:{getItem:forbidden,setItem:forbidden,removeItem:forbidden},fetch:forbidden,setTimeout:forbidden,clearTimeout(){},addEventListener(){}};
  context.window=context;
  const end='})(window);';assert.equal(script.indexOf(end),script.lastIndexOf(end));
  vm.runInNewContext(script.replace(end,'window.__layout={matrixHTML,ruleSummaryHTML,ui};'+end),context);
  const host=document.createElement('section');document.body.append(host);
  return {document,host,api:context.__layout,paint(version,products,canEdit=true){host.innerHTML=context.__layout.matrixHTML(version,'QA',products,canEdit);return host;}};
}
const products=[{code:'P1',name:'Synthetic product one'},{code:'P2',name:'Synthetic product two',kind:'semi-finished'}];
function version(enabled=true,included=true){return {id:'fixture',snapshot:{errors:[],items:[{id:'I1',checkNo:'QA-01',name:'Synthetic item',category:'QA',isEnabled:enabled,productCodes:included?['P1']:[]}]}};}
function cell(host,code='P1'){const result=host.querySelector(`[data-matrix-product="${code}"]`);assert(result);return result;}
function rules(selector){const found=[...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find(match=>match[1].trim()===selector);assert(found,`missing CSS selector ${selector}`);return Object.fromEntries(found[2].split(';').filter(s=>s.trim()).map(entry=>{const at=entry.indexOf(':');return [entry.slice(0,at).trim(),entry.slice(at+1).trim()];}));}
for(const language of ['zh-Hant','vi']){
  check(`two independent axes in all four combinations (${language})`,()=>{
    const f=fixture(language);
    for(const enabled of [true,false])for(const included of [true,false]){
      const model=version(enabled,included),before=JSON.stringify(model),host=f.paint(model,products);
      const button=cell(host);
      assert.equal(button.textContent,included?'✓':'—');assert.equal(button.getAttribute('aria-pressed'),String(included));
      assert.equal(button.classList.contains('included'),included);assert.equal(button.classList.contains('disabled-item'),!enabled);
      assert.equal(button.disabled,false,'inactive item is not a permission-denied control');
      assert.equal(host.querySelectorAll('.fqc-matrix-item-status').length,enabled?0:1);
      if(!enabled)assert.equal(host.querySelector('.fqc-matrix-item-status').textContent,language==='vi'?'Đã tắt':'停用');
      assert.match(button.getAttribute('aria-label'),included?(language==='vi'?/Đã chọn cho sản phẩm/:/已納入產品標準/):(language==='vi'?/Chưa chọn cho sản phẩm/:/未納入產品標準/));
      assert.match(button.getAttribute('aria-label'),enabled?(language==='vi'?/Đang dùng/:/啟用中/):(language==='vi'?/Đã tắt/:/停用/));
      assert.equal(button.getAttribute('title'),button.getAttribute('aria-label'));
      assert.equal(JSON.stringify(model),before,'render must not change inclusion or enabled data');
    }
  });
  check(`missing legacy activation agrees with edit checkbox (${language})`,()=>{
    const f=fixture(language),model=version();delete model.snapshot.items[0].isEnabled;
    const before=JSON.stringify(model),host=f.paint(model,products);
    assert.equal(cell(host).textContent,'✓');assert.equal(host.querySelectorAll('.fqc-matrix-item-status').length,0);assert.equal(cell(host).classList.contains('disabled-item'),false);
    assert.equal(JSON.stringify(model),before);assert.match(source,/name="enabled" \$\{existing\?\.isEnabled !== false \? 'checked' : ''\}/);
  });
  check(`localized legend, empty state, and read-only gate (${language})`,()=>{
    const f=fixture(language),host=f.paint(version(false),products,false);
    for(const button of host.querySelectorAll('[data-matrix-item]'))assert.equal(button.disabled,true);
    const legend=host.querySelector('.fqc-matrix-legend');assert.equal(legend.getAttribute('data-i18n-skip'),'true');
    assert.match(legend.textContent,language==='vi'?/lựa chọn sản phẩm được giữ nguyên/:/不改變產品選擇/);
    if(language==='vi')assert.doesNotMatch(host.textContent,/停用|半成品|檢查編號/);
    const empty=f.paint({snapshot:{items:[]}},products);assert.match(empty.textContent,language==='vi'?/Chưa có hạng mục kiểm tra/:/尚無檢查項目/);
  });
  check(`long custom rules remain complete and escaped (${language})`,()=>{
    const f=fixture(language),text='長規則 Kiểm tra theo lô '+ 'ABC無空白'.repeat(120)+' <not-a-tag> & "sample"';
    for(const rule of [{cadence:'batch',batchKind:'custom',customBatchText:text,customBatchValue:'3 pieces from start and 1 from end'},{cadence:'time',timeFrequency:'custom',customTimeText:text}]){
      const input={rule},before=JSON.stringify(input);f.host.innerHTML=f.api.ruleSummaryHTML(input);
      const badge=f.host.querySelector('.fqc-rule-badge');assert(badge);assert(badge.textContent.includes(text));assert.equal(f.host.querySelector('not-a-tag'),null);assert.equal(JSON.stringify(input),before);
    }
  });
}
check('category/deleted/search filters and raw identifiers retained',()=>{
  const f=fixture(),model=version(false);model.snapshot.items.push({...model.snapshot.items[0],id:'deleted',isDeleted:true},{...model.snapshot.items[0],id:'other',category:'OTHER'});
  const item=model.snapshot.items[0];item.id='item<"&>';item.checkNo='QA<"&>';item.name='原文 <keep> Tên';
  const selectionBefore=JSON.stringify(model);f.api.ui.search='two';const host=f.paint(model,products);
  assert.equal(host.querySelectorAll('[data-matrix-item]').length,1);assert.equal(cell(host,'P2').dataset.matrixItem,item.id);assert.equal(cell(host,'P2').textContent,'—');assert.equal(host.querySelector('.fqc-matrix-item-name').textContent,item.name);assert.equal(JSON.stringify(model),selectionBefore);
});
check('repeat rendering and language switching keep selection and raw text',()=>{
  const f=fixture(),model=version(false),before=JSON.stringify(model);model.snapshot.items[0].name='保留原文 Tên gốc';
  for(const language of ['zh-Hant','vi','zh-Hant']){f.document.documentElement.lang=language;const host=f.paint(model,products);assert.equal(cell(host).textContent,'✓');assert.equal(host.querySelector('.fqc-matrix-item-name').textContent,model.snapshot.items[0].name);}
  assert.equal(JSON.stringify(model.snapshot.items[0].productCodes),'["P1"]');assert.equal(model.snapshot.items[0].isEnabled,false);assert.equal(JSON.parse(before).snapshot.items[0].isEnabled,false);
});
check('CSS contract: bounded wrapped rules and independent table scroller',()=>{
  const badge=rules('.fqc-rule-badge');assert.equal(badge['max-width'],'100%');assert.equal(badge['box-sizing'],'border-box');assert.equal(badge['white-space'],'normal');assert.equal(badge['overflow-wrap'],'anywhere');assert.equal(badge['word-break'],'normal');assert.equal(badge.overflow,undefined,'no clipping to hide a rule');
  assert.equal(rules('.fqc-table-wrap')['overflow-x'],'auto');assert.equal(rules('.fqc-table')['table-layout'],'fixed');assert.equal(rules('.fqc-item-table')['min-width'],'900px');assert.equal(rules('.fqc-item-table .master-row-actions')['flex-wrap'],'wrap');
  for(const name of ['rule','products','actions'])assert(rules(`.fqc-item-table th.col-item-${name},.fqc-item-table td.col-item-${name}`).width);
});
check('CSS contract: fixed single-glyph touch target overrides master-history padding',()=>{
  const button=rules('.fqc-matrix .matrix-cell');assert.equal(button.width,'44px');assert.equal(button.height,'44px');assert.equal(button.padding,'0');assert.equal(button['white-space'],'nowrap');assert.equal(button['box-sizing'],'border-box');assert.equal(rules('.fqc-matrix .matrix-cell.disabled-item')['text-decoration'],undefined);
  assert.equal(rules('.fqc-matrix-item-status')['white-space'],'nowrap');assert.equal(rules('.fqc-matrix-legend')['flex-wrap'],'wrap');assert(rules('.fqc-matrix .matrix-cell:focus-visible').outline);
  const inherited=fs.readFileSync(path.join(root,'public/process/master-admin-ui.css'),'utf8');assert.match(inherited,/\.master-history button\{[^}]*padding:10px/,'regression covers actual inherited padding');
});
check('JS and CSS retain their independently versioned local references',()=>{
  const html=fs.readFileSync(path.join(root,'public/process/index.html'),'utf8');
  const expected={'fqc-master.js':'20261029-fqc-dependencies1','fqc-master.css':'20261028-matrix-rule-layout1'};
  const references=[...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(match=>match[1]);
  for(const [file,version] of Object.entries(expected))assert.deepEqual(references.filter(value=>value.split('?')[0]===file),[`${file}?v=${version}`],file);
});
if(process.argv[2]==='--before')check('old actual renderer reproduces substituted marker and legacy mismatch',()=>{
  const before=fs.readFileSync(process.argv[3],'utf8'),f=fixture('vi',before);
  assert.equal(cell(f.paint(version(false),products)).textContent,'停用');
  const legacy=version();delete legacy.snapshot.items[0].isEnabled;assert.equal(cell(f.paint(legacy,products)).textContent,'停用');
  assert.equal(cell(f.paint(version(false,false),products)).textContent,'—');
});
console.log(JSON.stringify({status:'PASS_SYNTHETIC_DOM_AND_CSS_CONTRACTS_NOT_BROWSER_LAYOUT',cases:results.length,sourceSHA256:createHash('sha256').update(source).digest('hex'),cssSHA256:createHash('sha256').update(css).digest('hex'),network:false,storageWrites:false,browser:false,tests:results}));
