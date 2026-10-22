import __esmImport0 from "node:fs";
import __esmImport1 from "node:path";
import __esmImport2 from "node:vm";
import __esmImport3 from "node:assert/strict";
import {createRequire as __esmFactory} from 'node:module';
import {fileURLToPath as __esmPath} from 'node:url';
import __esmPathModule from 'node:path';
const __filename=__esmPath(new URL("./test-bom-search.cjs",import.meta.url));
const __dirname=__esmPathModule.dirname(__filename);
const __esmRequire=__esmFactory(__filename);
const fs = __esmImport0;
const path = __esmImport1;
const vm = __esmImport2;
const assert = __esmImport3;
const base = path.resolve(process.argv[2] || path.join(__dirname, '..', 'public', 'process'));
const sandbox = { window: {}, module: { exports: {} } };
vm.createContext(sandbox);
for (const name of ['data/imported-data.js', 'data/line-process-data.js', 'data/line-c-master.js', 'bom-search-engine.js']) {
  vm.runInContext(fs.readFileSync(path.join(base, name), 'utf8'), sandbox, { filename: name });
}
const engineApi = sandbox.module.exports;
const sample = [
  { level: 0, itemCode: '' }, { level: 1, itemCode: 'X' },
  { level: 2, itemCode: 'X1' }, { level: 3, itemCode: 'X11' },
  { level: 2, itemCode: 'X2' }, { level: 1, itemCode: 'PEER' },
];
assert.equal(engineApi.subtree(sample, 1).map(row => row.itemCode).join(','), 'X1,X11,X2');
assert.equal(engineApi.subtree(sample, 2).map(row => row.itemCode).join(','), 'X11');
assert.equal(engineApi.subtree(sample, 4).length, 0);
assert.equal(engineApi.subtree(sample, 1).map(row => row.relativeLevel).join(','), '1,2,1');
const variantEngine = engineApi.create({
  P1: [{level:0}, {level:1,itemCode:'X'}, {level:2,itemCode:'Y',quantity:'1'}],
  P2: [{level:0}, {level:1,itemCode:'X'}, {level:2,itemCode:'Y',quantity:'2'}],
  P3: [{level:0}, {level:1,itemCode:'X'}, {level:2,itemCode:'Y',quantity:'1'}],
}, [], {});
assert.equal(variantEngine.branches('X').length, 2, 'Different quantities remain different BOM branches');
assert.equal(variantEngine.branches('X')[0].sources.length, 2, 'Identical branches share provenance');
assert.equal(variantEngine.branches('Y')[0].rows.length, 0, 'Leaf never falls back to the finished BOM');
assert.equal(variantEngine.branches('NOT_FOUND').length, 0);

const data = sandbox.window.IMPORTED_DATA, routing = sandbox.window.LINE_PROCESS_DATA;
const products = [...data.products, ...sandbox.window.LINE_C_MASTER.products];
const engine = engineApi.create(data.bom, products, routing.productRoutes);
assert.equal(engine.search('105B100051')[0].code, '105B100051');
assert.equal(engine.search('3060301B', 'C', 'TIEN')[0].code, '3060301B');
assert.equal(engine.search('3060301B', 'A').length, 0);
assert.ok(engine.search('bo rua xe').some(item => item.code === '105B100051'), 'Vietnamese accent-insensitive search');
assert.ok(engine.search('', 'B').length > 0, 'B line products are searchable');
const finished = engine.branches('105B100051')[0];
assert.equal(finished.rows.length, data.bom['105B100051'].length - 1);
const semi = engine.branches('3060301B').find(branch => branch.sources.some(source => source.sourceCode === '105B100051'));
assert.ok(semi, 'C SKU exists inside finished product BOM');
assert.equal(semi.rows.length, 1);
assert.equal(semi.rows[0].itemCode, '2016G001');
assert.equal(semi.rows[0].relativeLevel, 1);
assert.equal(semi.rows[0].quantity, '0,014');
assert.ok(!semi.rows.some(row => ['3080601', '403XX007', '3060301'].includes(row.itemCode)));
// Every extracted branch must exactly match its source's contiguous subtree.
let checked = 0;
for (const item of engine.entries) for (const branch of engine.branches(item.code)) for (const source of branch.sources) {
  const expected = engineApi.subtree(data.bom[source.sourceCode], source.index);
  assert.equal(JSON.stringify(branch.rows.map(r => [r.relativeLevel, r.itemCode, r.quantity])), JSON.stringify(expected.map(r => [r.relativeLevel, r.itemCode, r.quantity])));
  checked++;
}

// Render/interaction smoke test without a browser or changes to shared data.
const elements = new Map();
function element(selector) {
  if (!elements.has(selector)) elements.set(selector, { innerHTML: '', handlers: {}, addEventListener(name, fn) { this.handlers[name] = fn; }, focus() {} });
  return elements.get(selector);
}
const uiContext = {
  data: { ...data, products }, routing, BomSearchEngine: engineApi,
  bomTable() {}, bindDataInner() {},
  document: { documentElement: { lang: 'zh-Hant' }, querySelector: element, querySelectorAll: () => [] },
  MutationObserver: class { observe() {} },
};
vm.createContext(uiContext);
vm.runInContext(fs.readFileSync(path.join(base, 'bom-search.js'), 'utf8'), uiContext);
assert.match(uiContext.bomTable(), /bom-query/);
assert.match(uiContext.bomTable(), /bom-line/);
uiContext.bindDataInner('bom');
element('#bom-query').handlers.input({ target: { value: '3060301B' } });
assert.match(element('#bom-detail').innerHTML, /2016G001/);
assert.doesNotMatch(element('#bom-detail').innerHTML, /3080601/);
uiContext.document.documentElement.lang = 'vi';
assert.match(uiContext.bomTable(), /Tra cứu BOM/);
console.log(JSON.stringify({ status: 'passed', catalog: engine.entries.length, checkedBranches: checked, finishedComponents: finished.rows.length, semiFinishedComponents: semi.rows.length, cases: ['ABC filters', 'Vietnamese search', 'subtree boundaries', 'relative levels', 'variant provenance', 'missing and leaf BOM', 'UI search and bilingual rendering'] }, null, 2));
