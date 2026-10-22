import __esmImport0 from "node:assert/strict";
import __esmImport1 from "node:fs";
import __esmImport2 from "node:vm";
import __esmImport3 from "typescript";
import {createRequire as __esmFactory} from 'node:module';
const __esmRequire=__esmFactory(import.meta.url);
/* oxlint-disable typescript/no-require-imports -- Executes actual import handlers with isolated acknowledgements. */
const assert = __esmImport0;
const fs = __esmImport1;
const vm = __esmImport2;
const ts = __esmImport3;
const source = fs.readFileSync('public/process/app.js', 'utf8');
const tree = ts.createSourceFile('app.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const declaration = tree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'beginProcessMasterDraft');
assert.ok(declaration, 'Production draft entry must exist');
const begin = source.slice(declaration.getStart(tree), declaration.end);
const start = source.indexOf('      importButton.onclick =');
const handler = source.slice(start, source.indexOf('    if (importFile)', start));
function fixture() {
  let draft = null, pending = false, editable = true, resolve, reject;
  const events = [], button = {}, picker = {click: () => events.push('picker')};
  const context = {currentUser: {id: 'qa'}, state: {processMasterVersionId: 'approved-old'}, importButton: button, importFile: picker,
    document: {querySelector: () => picker}, processMasterDraft: () => draft,
    processMasterPending: () => pending, editableProcessMasterData: () => editable && context.state.processMasterVersionId === 'draft-qa' ? draft : null,
    render: () => events.push('render'), toast: message => events.push('error:' + message),
    window: {MasterDataWorkflow: {shared: {permissions: () => ({edit: editable}), execute: () => new Promise((a, b) => {resolve = a; reject = b;})}}}};
  vm.createContext(context); vm.runInContext(begin + '\n' + handler, context);
  return {context, events, click: () => button.onclick(), ack: () => resolve(), fail: () => reject(Error('BEGIN_FAILED')),
    draft: () => {draft = {id: 'draft-qa'};}, pending: () => {pending = true;}, revoke: () => {editable = false;}};
}
(async () => {
  const cases = [];
  const f = fixture(), waiting = f.click(); assert.deepEqual(f.events, []); f.draft(); f.ack(); await waiting;
  assert.deepEqual(f.events, ['render', 'picker']); cases.push('picker waits for confirmed draft creation');
  assert.equal(f.context.state.processMasterVersionId, 'draft-qa');
  cases.push('begin selects the new draft even when an approved history version was selected');
  const failed = fixture(), error = failed.click(); failed.fail(); await error;
  assert.deepEqual(failed.events, ['error:BEGIN_FAILED']); cases.push('failed begin never opens picker');
  for (const mutation of ['actor', 'pending', 'permission']) {
    const changed = fixture(), request = changed.click(); changed.draft();
    if (mutation === 'actor') changed.context.currentUser = {id: 'another'};
    if (mutation === 'pending') changed.pending();
    if (mutation === 'permission') changed.revoke();
    changed.ack(); await request; assert.deepEqual(changed.events, []); cases.push(mutation + ' change prevents stale import continuation');
  }
  const existing = fixture(); existing.draft(); existing.context.state.processMasterVersionId = 'draft-qa'; await existing.click(); assert.deepEqual(existing.events, ['picker']);
  cases.push('existing editable draft retains direct chooser behavior');
  const locked = fixture(); locked.draft(); locked.pending(); await locked.click(); assert.deepEqual(locked.events, []);
  cases.push('pending draft remains locked');
  console.log(JSON.stringify({status: 'PASS', cases, scope: 'Production begin/import handlers; no network, DB or browser mutations'}));
})().catch(error => {console.error(error); process.exitCode = 1;});
