import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { bindScenario, catalogVersion, execution, inventory, inventoryGroups, modules, scenarios, scopeNotes, sourceBaseline, validateScenario } from './draft-lifecycle-scenarios.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const sourceCache = new Map();
const read = file => { if (!sourceCache.has(file)) sourceCache.set(file, fs.readFileSync(root + file, 'utf8')); return sourceCache.get(file); };
const byId = new Map(scenarios.map(scenario => [scenario.id, scenario]));
const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

void test('metadata only: no browser or one-second timing acceptance is earned', () => {
  assert.equal(catalogVersion, 1);
  assert.match(sourceBaseline, /^[a-f0-9]{40}$/);
  assert.deepEqual(execution, { browser: 'NOTRUN', timing: 'UNMEASURED', implementation: 'MANIFEST_ONLY' });
  assert(scenarios.length > 0);
  for (const scenario of scenarios) assert.equal(validateScenario(scenario), true);
});

void test('all 173 public inventory entries map explicitly or retain a reasoned NOTIMPLEMENTED gap', () => {
  assert.equal(inventory.length, 173);
  assert.equal(new Set(inventory.map(row => row.id)).size, 173);
  assert.equal(new Set(inventory.map(row => `${row.scope}:${row.action}`)).size, 173);
  assert.equal(inventoryGroups.length, 13);
  assert.equal(byId.size, scenarios.length);
  for (const row of inventory) {
    assert.equal(row.browser, 'NOTRUN'); assert.equal(row.timing, 'UNMEASURED');
    if (row.status === 'NOTIMPLEMENTED') {
      assert.equal(row.scenarioIds.length, 0);
      assert(['EXTERNAL_OWNER', 'DYNAMIC_SEED_REQUIRED', 'SCOPE_GAP'].includes(row.blocker.code));
      assert(row.blocker.reason.length > 40);
    } else {
      assert.equal(row.status, 'MAPPED_NOTRUN'); assert(row.scenarioIds.length > 0);
      for (const id of row.scenarioIds) assert(byId.has(id), `unmapped ${row.id}: ${id}`);
    }
  }
  assert.equal(inventory.filter(row => row.scope === 'process:platform').length, 15);
  assert(inventory.filter(row => row.scope === 'process:platform').every(row => row.status === 'NOTIMPLEMENTED'));
});

void test('source anchors and exact selector ID tokens remain compatible (not DOM execution)', () => {
  for (const scenario of scenarios) {
    const texts = scenario.evidence.map(item => {
      const text = read(item.file);
      for (const token of item.tokens) assert(text.includes(token), `${scenario.id}: missing source anchor ${item.file} :: ${token}`);
      return item.file.endsWith('/shared-draft-client.js') ? '' : text;
    }).join('\n');
    for (const step of [...scenario.setupSteps, ...scenario.steps]) {
      for (const [, id] of step.target?.selector.matchAll(/#([\w-]+)/g) || []) {
        // Boundaries intentionally reject a wrong ID matching only a CSS class suffix.
        assert(new RegExp(`(?<![\\w-])${escape(id)}(?![\\w-])`).test(texts), `${scenario.id}: unknown selector ID #${id}`);
      }
      if (step.target?.exactTextByLanguage) for (const text of Object.values(step.target.exactTextByLanguage)) assert(texts.includes(text));
    }
  }
  assert(read(scopeNotes[0].source).includes('data-equipment-save'));
});

void test('strict schema rejects optional clicks, missing oracle, fabricated pass and empty plans', () => {
  const valid = byId.get('iqc.save');
  for (const mutate of [
    value => { value.steps[0].target.optional = true; },
    value => { value.steps[0].target.cardinality = 0; },
    value => { value.oracle.authority = 'TOAST'; },
    value => { value.execution.browser = 'PASS'; },
    value => { value.steps = []; },
    value => { value.network.classification = 'MEASURED'; },
  ]) { const bad = structuredClone(valid); mutate(bad); assert.throws(() => validateScenario(bad), /INVALID_SCENARIO/); }
});

void test('dynamic IDs require explicit synthetic bindings: never choose first matching row', () => {
  assert.throws(() => bindScenario('iqc.localEdit', {}), /SYNTHETIC_SEED_REQUIRED:rowId/);
  assert.throws(() => bindScenario('iqc.localEdit', { rowId: '"] button' }), /SYNTHETIC_SEED_REQUIRED/);
  assert.throws(() => bindScenario('does-not-exist', {}), /UNKNOWN_SCENARIO/);
  const bound = bindScenario('iqc.localEdit', { rowId: 'qa-error-1' });
  assert.equal(bound.steps[0].target.selector, '#iqc-page [data-edit-error="qa-error-1"]');
  assert.equal(bound.steps[0].target.optional, false);
  assert(byId.get('iqc.localEdit').steps[0].target.selector.includes('{{rowId}}'), 'binding does not mutate manifest');
});

void test('local buffers, Apply POST and Save are distinct; no invented non-canvas Sync', () => {
  for (const scenario of scenarios.filter(row => row.action === 'localEdit')) assert.deepEqual(scenario.network.mutationSequence, []);
  assert.deepEqual(byId.get('bom.editApply').network.mutationSequence, []);
  assert.deepEqual(byId.get('bom.save').network.mutationSequence, ['apply (one seeded manual patch batch)', 'save']);
  assert.deepEqual(byId.get('fqc.localEdit').network.mutationSequence, []);
  assert.deepEqual(byId.get('fqc.editApply').network.mutationSequence, ['apply']);
  assert.deepEqual(byId.get('iqc.editApply').network.mutationSequence, ['apply']);
  assert(!scenarios.some(row => row.action === 'sync'));
  for (const scenario of scenarios.filter(row => row.action === 'openSubmit')) assert.deepEqual(scenario.network.mutationSequence, []);
  for (const scenario of scenarios.filter(row => row.action === 'receipt')) assert.deepEqual(scenario.network.mutationSequence, []);
});

void test('lines share exact AB/C scope; IPQC-AB separates group editing from atomic module submission', () => {
  const lineRows = inventory.filter(row => row.scope === 'master:AB/C');
  assert.equal(lineRows.length, 13);
  assert(lineRows.every(row => row.scenarioIds.some(id => id.startsWith('lines-ab.')) && row.scenarioIds.some(id => id.startsWith('lines-c.'))));
  assert.equal(modules.find(row => row.id === 'lines-ab').scope, 'master:AB');
  assert.equal(modules.find(row => row.id === 'lines-c').scope, 'master:C');
  assert.match(byId.get('ipqc-ab.begin').network.endpoint, /scope=\{\{groupScope\}\}/);
  assert.match(byId.get('ipqc-ab.editApply').network.endpoint, /scope=\{\{groupScope\}\}/);
  assert.match(byId.get('ipqc-ab.save').network.endpoint, /module=1/);
  assert.match(byId.get('ipqc-ab.confirmSubmit').network.endpoint, /module=1/);
  assert.equal(byId.get('ipqc-ab.confirmSubmit').oracle.expectedScope, 'ipqc-ab:module');
  assert.equal(byId.get('ipqc-c.save').oracle.flowPath, 'workflow');
});

void test('routine documents keep distinct confirmation, dirty Save envelope and unresolved dynamic coverage', () => {
  assert(!byId.has('routine-fqc.begin'));
  assert(byId.get('routine-fqc.confirmSubmit').steps.some(step => step.target.selector === 'dialog.rf-modal[open] button[type="submit"]'));
  assert(!byId.get('routine-fqc.withdraw').steps.some(step => step.target.selector.includes('vd-confirm')));
  assert.deepEqual(byId.get('routine-fqc.save').network.mutationSequence, ['draft.apply', 'draft.save']);
  assert.match(byId.get('routine-fqc.save').network.envelope, /documentId/);
  for (const action of ['firstLoad', 'reload', 'returnPage', 'create', 'discard', 'revoke', 'followup']) {
    const row = inventory.find(item => item.scope === 'routine-fqc 每單據' && item.action === action);
    assert.equal(row.status, 'NOTIMPLEMENTED');
  }
});

void test('review plans require the actual approval route, module expansion and exact case selection', () => {
  for (const row of scenarios.filter(item => ['approve', 'return'].includes(item.action))) {
    assert.match(row.route, /view=approval.*approvalTab=/); assert(row.setupSteps.length > 0);
    const bad = structuredClone(row); bad.route = '/process/?view=data'; assert.throws(() => validateScenario(bad), /review entry/);
  }
  assert.equal(byId.get('iqc.approve').setupSteps[0].target.selector, '[data-review-jump="iqc"]');
  assert.equal(byId.get('iqc.approve').setupSteps[1].target.selector, '[data-iqc-review="{{caseId}}"]');
  assert.match(byId.get('routine-fqc.approve').steps[0].target.selector, /^#review-routine-fqc /);
});

void test('configured bases never masquerade as measured wire URLs or observer timing', () => {
  for (const row of scenarios) {
    assert.equal(row.network.endpointKind, 'configured_base');
    assert.equal(row.oracle.endpointKind, 'configured_base');
    assert.equal(row.oracle.observationTiming, 'AUTHORITY_ONLY_OUTSIDE_ACTION_TIMING');
    assert(!row.network.endpoint.includes('compact='));
    if (row.moduleId === 'routine-fqc') assert.deepEqual(row.network.wireQuery.always, {});
    else assert.equal(row.network.wireQuery.always.compact, '1');
    assert.equal(row.network.wireQuery.always.projection, row.moduleId === 'iqc' ? 'iqc-edit-v1' : undefined);
  }
  assert.match(byId.get('iqc.approve').oracle.projectionPolicy, /deliberately omits iqc-edit-v1/);
  assert.deepEqual(byId.get('iqc.approve').oracle.observerQuery, { compact: '1' });
  const bad = structuredClone(byId.get('iqc.save')); bad.network.endpointKind = 'wireURL';
  assert.throws(() => validateScenario(bad), /wire query contract/);
});
