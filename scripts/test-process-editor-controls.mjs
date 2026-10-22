import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

let mutationAllowed = false;
let canvasAllowed = false;
const buttons = ['add', 'delete', 'save', 'input', 'output', 'layout', 'edit', 'fit']
  .map(pe => ({dataset: {pe}, disabled: false}));
const source = fs.readFileSync('public/process/process-editor.js', 'utf8');
const start = source.indexOf(' function updateControls(){');
const end = source.indexOf(' function bind(){', start);
assert.ok(start >= 0 && end > start, 'Production control handler must exist');
const context = {
  can: () => mutationAllowed,
  canvasCan: () => canvasAllowed,
  document: {querySelectorAll: () => buttons},
};
vm.createContext(context);
vm.runInContext(source.slice(start, end), context);
for (const [mutation, canvas] of [[false, false], [false, true], [true, false], [true, true]]) {
  mutationAllowed = mutation;
  canvasAllowed = canvas;
  context.updateControls();
  assert.ok(buttons.slice(0, 3).every(button => button.disabled === !mutation));
  assert.ok(buttons.slice(3, 6).every(button => button.disabled === !canvas));
  assert.ok(buttons.slice(6).every(button => !button.disabled), 'View controls remain available');
}
console.log(JSON.stringify({result: 'PASS', checks: [
  'Mutation and canvas denial lock their separate controls',
  'Canvas permission does not grant data mutation',
  'Data mutation permission does not grant canvas editing',
  'Granted permissions unlock their controls while view controls stay available',
]}));
