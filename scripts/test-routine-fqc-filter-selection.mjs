// Portable, isolated actual-module regression. No HTTP, business writes or native GUI claim.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export function runFilterSelectionRegression(productSource = fs.readFileSync('public/process/routine-fqc.js', 'utf8')) {
  let lang = 'zh-TW', routeCalls = 0;
  const itemSelect = {dataset: {filter: 'item'}, value: ''};
  const categorySelect = {dataset: {filter: 'category'}, value: ''};
  const root = {isConnected: false, querySelectorAll: (q) => q === '[data-filter]' ? [itemSelect, categorySelect] : [], querySelector: () => null};
  const window = {addEventListener() {}, ProcessDualSystem: {go: (view) => {assert.equal(view, 'quality-inspections'); routeCalls++;}}};
  const marker = '  window.RoutineFQCUI = {';
  assert.equal(productSource.split(marker).length, 2, 'Unique existing public UI seam');
  const instrumented = productSource.replace(marker,
    '  window.__filterContract = {s, filters, matches, bind, setData: (v) => data = v, setRoot: (v) => root = v};\n' + marker);
  vm.runInNewContext(instrumented, {window, document: {documentElement: {get lang() {return lang;}}, hidden: false, querySelector: () => null}, crypto: webcrypto,
    setInterval() {}, setTimeout() {}, location: {port: '61361'}, URL,
    fetch() {throw Error('UNEXPECTED_HTTP');}}, {timeout: 1000});
  const ui = window.__filterContract;
  const source = (id, name = 'Same display name', line = 'A') => ({id, name, line, category: 'Valve', code: 'CODE-' + id, errorCode: 'ERR', products: []});
  const a = source('schedule-a'), b = source('schedule-b', 'Other check', 'B'), historical = source('job-snapshot', 'Original historical name');
  const old = source('nonperiodic', 'Original nonperiodic check');
  const data = {sources: [a, b], catalog: {version: '27', lines: ['A', 'B'], categories: [], items: [{...old, enabled: true, cadence: 'each_batch'}]},
    control: {jobs: [{id: 'job-a', source: a, start: '2026-10-17', end: '2026-10-17'}, {id: 'job-b', source: b, start: '2026-10-17', end: '2026-10-17'}], documents: [], cases: []}};
  ui.setData(data); ui.setRoot(root);
  const reset = () => Object.assign(ui.s, {query: '', line: '', category: '', item: '', outcome: '', review: '', caseState: '', from: '', to: '', dateMode: 'period', selected: null});
  const decode = (v) => v.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  const renderedSelection = () => {
    const select = /<select data-filter="item">([\s\S]*?)<\/select>/.exec(ui.filters());
    assert.ok(select, 'Actual filters must render the item control');
    const options = [...select[1].matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/g)].map((m) => ({value: decode(/value="([^"]*)"/.exec(m[1])[1]), text: decode(m[2]), selected: /\bselected\b/.test(m[1])}));
    // Single-select default when no option has a selected attribute: the first option.
    return {options, selected: options.find((o) => o.selected) || options[0]};
  };
  const matchingJobs = () => data.control.jobs.filter((j) => ui.matches([{source: j.source, jobId: j.id, results: []}])).length;
  const originalData = JSON.stringify(data);
  let groups = 0;

  // Actual public backlink leaves an item filter that must remain visible after returning.
  window.RoutineFQCUI.historyForItem(old.id); ui.s.tab = 'jobs';
  assert.equal(routeCalls, 1);
  assert.equal(renderedSelection().selected.value, old.id, 'Active historical item filter must not masquerade as All');
  assert.match(renderedSelection().selected.text, /Original nonperiodic check/);
  assert.match(renderedSelection().selected.text, /CODE-nonperiodic/);
  assert.match(renderedSelection().selected.text, /目前清單外.*全部/);
  assert.equal(matchingJobs(), 0, 'Rendering does not silently remove a real filter');
  ui.bind(); itemSelect.value = ''; itemSelect.onchange();
  assert.equal(ui.s.item, ''); assert.equal(matchingJobs(), 2, 'Normal All selection clears only the item restriction'); groups++;

  reset(); ui.s.item = a.id;
  assert.equal(renderedSelection().selected.value, a.id);
  assert.equal(renderedSelection().options.filter((o) => o.value === a.id).length, 1);
  assert.doesNotMatch(renderedSelection().selected.text, /目前清單外/);
  assert.equal(matchingJobs(), 1); groups++;

  data.control.jobs.push({id: 'job-history', source: historical, start: '2026-09-01', end: '2026-09-30'});
  ui.s.item = historical.id;
  assert.equal(renderedSelection().selected.value, historical.id);
  assert.match(renderedSelection().selected.text, /Original historical name.*歷史版本/);
  assert.equal(matchingJobs(), 1);
  data.control.jobs.pop(); groups++;

  reset(); ui.s.item = b.id; ui.s.line = 'A';
  assert.equal(renderedSelection().selected.value, b.id, 'Out-of-scope exact ID remains visible');
  assert.match(renderedSelection().selected.text, /Other check/);
  assert.equal(matchingJobs(), 0);
  ui.bind(); categorySelect.value = 'Valve'; categorySelect.onchange();
  assert.equal(ui.s.item, '', 'Existing parent-filter reset remains intact');
  assert.equal(ui.s.line, 'A'); groups++;

  reset(); ui.s.item = 'missing"<&';
  const unknown = renderedSelection();
  assert.equal(unknown.selected.value, ui.s.item);
  assert.match(unknown.selected.text, /目前清單外.*全部/);
  assert.ok(!unknown.selected.text.includes(ui.s.item), 'Unknown internal ID is not the user label');
  assert.ok(!ui.filters().includes('value="missing"<&'), 'Dynamic value is escaped'); groups++;

  for (const language of ['zh-TW', 'vi']) {
    lang = language; reset(); ui.s.item = old.id;
    assert.equal(renderedSelection().selected.value, old.id);
    assert.match(renderedSelection().selected.text, language === 'vi' ? /ngoài danh sách.*tất cả/ : /目前清單外.*全部/);
  } groups++;

  reset(); Object.assign(ui.s, {item: a.id, query: 'same', line: 'A', category: 'Valve', outcome: 'pass', review: 'approved', caseState: 'open', from: '2026-10-01', to: '2026-10-31'});
  const stateBefore = JSON.stringify({...ui.s, buffers: [...ui.s.buffers], bases: [...ui.s.bases]});
  ui.filters();
  assert.equal(JSON.stringify({...ui.s, buffers: [...ui.s.buffers], bases: [...ui.s.bases]}), stateBefore, 'Render preserves filters, selection and unsaved buffers');
  assert.equal(JSON.stringify(data), originalData, 'Read-only render and filter changes never mutate jobs/catalog/documents');
  assert.equal(renderedSelection().options.filter((o) => o.value === a.id).length, 1);
  groups++;
  return {status: 'PASS_ACTUAL_MODULE_MEMORY_ONLY_NOT_GUI', groups, httpCalls: 0};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { console.log(JSON.stringify(runFilterSelectionRegression())); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
