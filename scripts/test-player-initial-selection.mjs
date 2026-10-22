import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
const source = fs.readFileSync('public/process/version-workflow.js', 'utf8');
const start = source.indexOf('  function initializePlayerSelection(');
const playerStart = source.indexOf('  function playerPage()');
const end = source.indexOf('\n  function bindApproval()', playerStart);

assert(playerStart > 0 && end > playerStart);
const lines = ['A', 'B', 'C'].map(code => ({code, name: code, stages: [{code: code + '-1'}, {code: code + '-2'}]}));

function fixture(board, user = {id: 'qa', role: 'staff', lines: ['A', 'B', 'C']}, state = {deviceLine: 'A', deviceStage: 'A-CUT'}) {
  const context = {currentUser: user, state, lines, dispatchBoard: board,
    data: {products: [{code: 'QA-A'}, {code: 'QA-B'}, {code: 'QA-C'}]},
    statusLines: () => lines.filter(line => user.role === 'admin' || user.lines.includes(line.code)),
    lineFor: code => lines.find(line => line.code === code) || lines[0],
    stageFor: code => lines.flatMap(line => line.stages).find(stage => stage.code === code),
    routeFor: code => ({stages: [code.slice(-1) + '-1']}),
    productionProduct: (product, line, stage) => [product.code, line, stage].join(':'),
    activeStageCodes: (_products, line) => line.stages.map(stage => stage.code), escapeHtml: value => String(value ?? '')};
  vm.createContext(context);
  vm.runInContext(source.slice(start < 0 ? playerStart : start, end) + '\nthis.render=playerPage;', context);
  return {state, user, render: context.render};
}
const cases = [];

function check(name, run) {run(); cases.push(name);}

check('sole B dispatch selects B at first entry and reload', () => {
  for (let index = 0; index < 2; index++) {
    const f = fixture({A: [], B: ['QA-B'], C: []}); assert(f.render().includes('QA-B:B:B-1'));
    assert.equal(f.state.deviceLine, 'B'); assert.equal(f.state.deviceStage, 'B-1');
  }
});

check('multiple active lines and empty board keep the initial valid selection', () => {
  for (const board of [{A: ['QA-A'], B: ['QA-B']}, {A: [], B: [], C: []}]) {
    const f = fixture(board); f.render(); assert.equal(f.state.deviceLine, 'A');
  }
});

check('later rerenders preserve an explicit valid selection even when it is empty', () => {
  const f = fixture({B: ['QA-B']}); f.render(); f.state.deviceLine = 'A'; f.state.deviceStage = 'A-2'; f.render();
  assert.equal(f.state.deviceLine, 'A'); assert.equal(f.state.deviceStage, 'A-2');
});

check('fixed device selection remains on its own line and stage', () => {
  const f = fixture({B: ['QA-B']}, {id: 'device-A', role: 'device', lines: ['A']}, {deviceLine: 'A', deviceStage: 'A-2'});
  assert(!f.render().includes('QA-B:B')); assert.equal(f.state.deviceLine, 'A'); assert.equal(f.state.deviceStage, 'A-2');
});

check('missing permission scope never falls back to an unauthorized line', () => {
  const f = fixture({B: ['QA-B']}, {id: 'disabled', role: 'staff', lines: []}); const html = f.render();
  assert.equal(f.state.deviceLine, ''); assert(!html.includes('QA-B:B')); assert(!html.includes('value="A"'));
});

check('changed actor initializes once using their current permitted scope', () => {
  const f = fixture({B: ['QA-B']}); f.render(); f.state.deviceLine = 'A'; f.user.id = 'qa-next'; f.render();
  assert.equal(f.state.deviceLine, 'B');
});

check('unknown dispatched codes do not select a line with no actual product', () => {
  const f = fixture({B: ['UNKNOWN']}); f.render(); assert.equal(f.state.deviceLine, 'A');
});

console.log(JSON.stringify({status: 'PASS', cases, scope: 'Actual playerPage renderer and selection only; no network, DB or dispatch writes'}));