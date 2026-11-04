/**
 * Source-supported acceptance PLAN, not a browser runner or a timing result.
 * Public synthetic metadata only. No fixture seeds, identities or report CSV.
 * A consumer MUST fail on missing/hidden/disabled/ambiguous controls; it must
 * never turn `if (exists) click()` into acceptance. Every plan is NOTRUN.
 */
export const catalogVersion = 1;
export const sourceBaseline = 'e4e485108fa69600a0832b1dfe27e00b6bd0903b';
export const execution = Object.freeze({ browser: 'NOTRUN', timing: 'UNMEASURED', implementation: 'MANIFEST_ONLY' });
const source = name => `public/process/${name}`;
const vd = source('version-draft-ui.js');
const evidence = (file, ...tokens) => ({ file: source(file), tokens });
const control = selector => ({ selector, cardinality: 1, visible: true, enabled: true, optional: false });
const click = selector => ({ action: 'click', target: control(selector) });
const fill = selector => ({ action: 'fill', target: control(selector), value: 'Synthetic acceptance change' });
const select = (selector, value) => ({ action: 'select', target: control(selector), value });
const sharedReview = { approve: '#master-unified-review [data-review-action="approve"]', return: '#master-unified-review [data-review-action="return"]' };
const sharedButtons = { begin: '#master-new-draft', save: '#master-save-draft', openSubmit: '#master-submit', withdraw: '#master-withdraw', ...sharedReview, draftRead: '#master-version-choice', receipt: '#master-shared-recover' };
const namedButtons = prefix => ({ begin: `#${prefix}-begin`, save: `#${prefix}-save`, openSubmit: `#${prefix}-submit`, withdraw: `#${prefix}-withdraw` });
function master(id, scope, lines = false) {
  return {
    id, inventoryScope: lines ? 'master:AB/C' : `master:${scope}`, scope: `master:${scope}`,
    route: `/process/?view=data&dataTab=${lines ? 'line-admin' : scope}`,
    ready: '.master-organized', endpoint: `/api/master/workflow?scope=${scope}&caseMetadata=1`, flowPath: 'control.workflow',
    entrySetup: lines ? [select('#master-lines-scope', scope)] : [], buttons: sharedButtons,
    edit: { open: lines ? '[data-line-edit="{{lineCode}}"]' : '[data-product-edit="{{productCode}}"]', input: '#master-edit-dialog [name="name"]', apply: '#master-edit-dialog button[type="submit"]', field: lines ? 'working.lines[code=seed.lineCode].name' : 'working.products[code=seed.productCode].name', mode: 'POST_APPLY' },
    seed: lines ? 'Exact line code/id in selected AB or C; lines entry is NOT a third combined workflow.' : 'Existing product with valid line/category/stage references and exact product code/id.',
    evidence: [evidence('master-admin-ui.js', 'master-new-draft', 'master-save-draft', 'master-submit', 'master-edit-dialog', lines ? 'master-lines-scope' : 'data-product-edit'), evidence('master-review.js', 'data-review-action'), evidence('master-shared-client.js', 'confirmReview')],
  };
}
export const modules = [
  master('master-ab', 'AB'), master('master-c', 'C'), master('lines-ab', 'AB', true), master('lines-c', 'C', true),
  {
    id: 'master-process', inventoryScope: 'master:PROCESS', scope: 'master:PROCESS', route: '/process/?view=data&dataTab=process-master', ready: '.master-template-grid', endpoint: '/api/master/workflow?scope=PROCESS&caseMetadata=1', flowPath: 'control.workflow',
    buttons: { begin: '#process-master-new-draft', save: '#save-master-data', openSubmit: '#process-master-submit', withdraw: '#process-master-withdraw', ...sharedReview, draftRead: '#process-master-version-choice', receipt: '[data-process-recover]' },
    edit: { input: '[data-template-key="{{templateKey}}"] [data-master-name]', apply: '[data-template-key="{{templateKey}}"] [data-name-action="apply"]', field: 'working[seed.stageCode][id=seed.templateId].name', mode: 'POST_APPLY' },
    seed: 'Existing editable template, exact templateKey/stageCode/templateId; no media or equipment mutation.',
    evidence: [evidence('app.js', 'process-master-new-draft', 'save-master-data', 'data-master-name', 'button.dataset.nameAction=action', 'data-process-recover'), evidence('master-review.js', 'data-review-action')],
  },
  {
    id: 'bom', inventoryScope: 'bom', scope: 'bom', route: '/process/?view=data&dataTab=bom', ready: '.bw-workspace', endpoint: '/api/bom/workflow?caseMetadata=1', flowPath: 'control.workflow',
    buttons: { begin: '[data-bw="begin"]', save: '[data-bw="save"]', openSubmit: '[data-bw="submit"]', withdraw: '[data-bw="withdraw"]', ...sharedReview, receipt: '[data-bw="retry"]' },
    edit: { open: '[data-bw="edit"]', input: '[data-bw-field="itemName"][data-root="{{rootCode}}"][data-id="{{rowId}}"]', apply: '[data-bw="finish"]', field: 'working.bom[seed.rootCode][id=seed.rowId].itemName', mode: 'LOCAL_ONLY' },
    saveSequence: ['apply (one seeded manual patch batch)', 'save'],
    seed: 'One visible selected BOM root/occurrence and existing row. One manual edit group, no import/recovery flight.',
    evidence: [evidence('bom-workspace.js', "action==='finish'", "action==='save'", 'data-bw-field', 'confirmSubmit', 'confirmReview'), evidence('master-review.js', 'data-review-action')],
  },
  {
    id: 'iqc', inventoryScope: 'iqc', scope: 'iqc', route: '/process/?view=data&dataTab=quality-iqc', ready: '#iqc-page', endpoint: '/api/iqc/workflow?caseMetadata=1', flowPath: 'control.workflow',
    buttons: { ...namedButtons('iqc'), approve: '#iqc-review-approve', return: '#iqc-review-reject', draftRead: '#iqc-version', receipt: '#iqc-operation-check' },
    edit: { open: '#iqc-page [data-edit-error="{{rowId}}"]', input: '#iqc-error-form [name="nameVi"]', apply: '#iqc-error-form button[type="submit"]', field: 'working.errors[id=seed.rowId].nameVi', mode: 'POST_APPLY' },
    seed: 'Existing non-deleted error in the selected part; exact part and error IDs. Name scalar only; no photo upload.',
    evidence: [evidence('iqc-master.js', 'iqc-begin', 'iqc-error-form', 'iqc-operation-check', 'iqc-review-approve', 'confirmSubmit', 'confirmReview')],
  },
  {
    id: 'ipqc-ab', inventoryScope: 'group A/B 與全模組', scope: 'ipqc-ab:module', route: '/process/?view=data&dataTab=quality-ipqc-ab', ready: '#data-content .vd-shell', endpoint: '/api/ipqc-ab/workflow?module=1&caseMetadata=1', flowPath: 'control.workflow',
    groupEndpoint: '/api/ipqc-ab/workflow?scope={{groupScope}}&caseMetadata=1',
    buttons: { ...namedButtons('ipqcab'), approve: '[data-ab-module-action="approve"][data-case-id="{{caseId}}"]', return: '[data-ab-module-action="reject"][data-case-id="{{caseId}}"]', draftRead: '#ipqcab-version', receipt: '#ipqcab-shared-status button' },
    receiptNames: { zh: '查詢上次操作', vi: 'Kiểm tra thao tác trước' },
    edit: { open: '[data-ab-edit-error="{{rowId}}"]', input: '#ab-error-name', apply: '#ab-apply', field: 'working.errors[id=seed.rowId].name', mode: 'POST_APPLY' },
    seed: 'Exact A/B line:group, existing error and editable group draft; module workflow separately initialized and saved before Submit. Module Save covers ALL group drafts, never only the selected group.',
    evidence: [evidence('ipqc-ab.js', 'ipqcab-begin', 'ipqcab-save', 'ipqcab-submit', 'ab-apply', 'data-ab-module-action', 'module=1&caseMetadata=1', 'confirmSubmit', 'confirmReview')],
  },
  {
    id: 'ipqc-c', inventoryScope: 'ipqc-c', scope: 'ipqc-c', route: '/process/?view=data&dataTab=quality-ipqc-c', ready: '#data-content .vd-shell', endpoint: '/api/ipqc-c/workflow?caseMetadata=1', flowPath: 'workflow',
    buttons: { ...namedButtons('ipqcc'), approve: '[data-ipqcc-review="approve"][data-id="{{caseId}}"]', return: '[data-ipqcc-review="reject"][data-id="{{caseId}}"]', draftRead: '#ipqcc-version', receipt: '#ipqcc-check-operation' },
    edit: { open: '[data-ipqcc-edit-error="{{rowId}}"]', input: '#ipqcc-editor [name="name"]', apply: '#ipqcc-editor button[type="submit"]', field: 'working.errors[id=seed.rowId].name', mode: 'POST_APPLY' },
    seed: 'Selected C product/stage and existing error. IPQC-C full GET exposes workflow at top level, not invented control.workflow.',
    evidence: [evidence('ipqc-c.js', 'ipqcc-begin', 'ipqcc-editor', 'data-ipqcc-review', 'ipqcc-check-operation', 'confirmSubmit', 'confirmReview')],
  },
  {
    id: 'fqc', inventoryScope: 'fqc', scope: 'fqc', route: '/process/?view=data&dataTab=quality-fqc', ready: '#fqc-page', endpoint: '/api/fqc/workflow?caseMetadata=1', flowPath: 'control.workflow',
    buttons: { ...namedButtons('fqc'), approve: '#quality-approve', return: '#quality-reject', draftRead: '#fqc-version', receipt: '#fqc-check-result' },
    edit: { toggle: '[data-matrix-item="{{rowId}}"][data-matrix-product="{{productCode}}"]', apply: '#fqc-matrix-apply', field: 'working.items[id=seed.rowId].productCodes', mode: 'LOCAL_THEN_POST_APPLY' },
    seed: 'One valid enabled FQC item and effective AB product in a visible matrix cell; invert a known membership exactly once, no media/rules edits.',
    evidence: [evidence('fqc-master.js', 'fqc-matrix-apply', 'data-matrix-item', 'data-matrix-product', 'fqc-check-result', 'confirmSubmit', 'confirmReview')],
  },
  {
    id: 'tooling', inventoryScope: 'tooling', scope: 'tooling', route: '/process/?view=data&dataTab=quality-mold-equipment', ready: '.tooling-page', endpoint: '/api/tooling/workflow?caseMetadata=1', flowPath: 'control.workflow',
    buttons: { ...namedButtons('tooling'), approve: '[data-tooling-action="approve"][data-case="{{caseId}}"]', return: '[data-tooling-action="return"][data-case="{{caseId}}"]', draftRead: '#tooling-version', receipt: '#tooling-retry' },
    edit: { open: '[data-tool-edit="{{rowId}}"]', input: '.tooling-dialog [name="nameVi"]', apply: '.tooling-dialog button[type="submit"]', field: 'working.tools[id=seed.rowId].nameVi', mode: 'POST_APPLY' },
    seed: 'Existing tool with valid current holder/category; matched IQC/checks version. No transfer, media, inactive-reason or Begin-recovery marker.',
    evidence: [evidence('tooling.js', 'tooling-begin', 'data-tool-edit', 'tooling-dialog', 'data-tooling-action', 'tooling-retry', 'confirmSubmit', 'confirmReview')],
  },
  {
    id: 'routine-equipment', inventoryScope: 'routine-equipment', scope: 'routine-equipment', route: '/process/?view=data&dataTab=quality-routine-equipment', ready: '#data-content .vd-shell', endpoint: '/api/routine-equipment/workflow?caseMetadata=1', flowPath: 'control.workflow',
    buttons: { ...namedButtons('routine'), approve: '[data-routine-review="approve"][data-version="{{caseId}}"]', return: '[data-routine-review="reject"][data-version="{{caseId}}"]', draftRead: '#routine-version-select', receipt: '#routine-shared-status button' },
    receiptNames: { zh: '查詢上次操作', vi: 'Kiểm tra thao tác trước' },
    edit: { open: '[data-equipment-edit="{{rowId}}"]', input: '#routine-editor [data-field="name"]', apply: '#routine-form-apply', field: 'working.equipment[id=seed.rowId].name', mode: 'POST_APPLY' },
    seed: 'Existing equipment and valid taxonomy/group; no pending photo or add-equipment recovery. This is measuring equipment, not process-machine data.',
    evidence: [evidence('routine-equipment.js', 'routine-begin', 'routine-form-apply', 'data-equipment-edit', 'data-routine-review', 'confirmSubmit', 'confirmReview')],
  },
  {
    id: 'routine-fqc', inventoryScope: 'routine-fqc 每單據', scope: 'routine-fqc:document', route: '/process/?view=quality-inspections', ready: '#routine-fqc-root', endpoint: '/api/routine-fqc', flowPath: 'control.documents[id=seed.documentId].flow', confirmation: 'routine-document',
    buttons: { save: '#routine-fqc-root [data-action="save"]', openSubmit: '#routine-fqc-root [data-action="submit"]', withdraw: '#routine-fqc-root [data-action="withdraw"]', approve: '#review-routine-fqc [data-action="approve"]', return: '#review-routine-fqc [data-action="return"]', receipt: '#routine-fqc-root [data-action="retry"]' },
    seed: 'Feature enabled, one exact selected synthetic documentId and fixed calendar/jobs. Separate non-self reviewer; all document dependencies seeded. No generic Begin or independent Apply button.',
    evidence: [evidence('routine-fqc.js', 'routine-fqc-root', "action === 'submit'", "action === 'withdraw'", 'confirmSubmission', "el.className = 'rf-modal'", 'data-return-reason', 'control.documents')],
  },
];

const baselinePrerequisites = [
  'Use isolated SYNTHETIC fixtures only; fixed actor object/ID, login epoch and module scope.',
  'Authoritative full GET grants view and the exact action permission; no pending/unknown except the scenario-specific prerequisite.',
  'Seed and selected target must be asserted exactly; missing, ambiguous, hidden or disabled selectors are failures, never skips.',
  'Capture before generation/revision/savedId/pendingId/active content; no unrelated edits or background mutation during the measured action.',
];
const rules = {
  begin: ['No shared draft and no pending case; approved baseline exists.', 'working draft exists in the SAME scope; active content unchanged; successful readback authorizes editing.'],
  save: ['Editable draft; one known change already Applied (BOM: one finished local group); all editors closed.', 'saved.id exists; saved.content equals the complete current working scope; active content unchanged.'],
  openSubmit: ['Existing successful saved snapshot equals working; no unapplied input, queued command or unknown.', 'Confirmation visibly identifies savedId/revision; pendingId remains absent; opening confirmation sends ZERO mutation POSTs.'],
  confirmSubmit: ['The exact source-supported confirmation is OPEN; savedId/generation/revision remain unchanged; reason populated where required.', 'Matching operation receipt then authoritative pendingId/case; fixed case content equals the captured saved snapshot; active unchanged.'],
  withdraw: ['Exact pending case selected; withdraw permission true; required reason supplied.', 'Original case becomes withdrawn; pendingId clears; draft unlocked; active unchanged; fixed case history retained.'],
  resubmit: ['Latest case withdrawn or returned; same saved snapshot retained; effective base unchanged; no deliberate new edit.', 'Fresh submit operation/case for the retained savedId; original withdrawn/returned case remains immutable; active unchanged.'],
  approve: ['Exact pending case selected in review view; reviewer differs from submitter and has approve permission.', 'Exact case approved; authoritative active content equals fixed case content, not a later working buffer; pendingId clears.'],
  return: ['Exact pending case selected in review view; distinct reviewer with return permission and nonempty reason.', 'Exact case returned; pendingId clears and editable draft available; active unchanged; reason/history retained.'],
  draftRead: ['Known draft version ID and clean editor; selected module scope matches fixture.', 'Selected draft content equals authoritative working; active and saved snapshots not mutated by selecting a version.'],
  receipt: ['Exactly one injected lost response and known original operationId; no forged outcome/proof or new command.', 'Query only the ORIGINAL operationId; ZERO mutation rePOST; 404 remains unknown; terminal read failure/deny retains unknown; only validated receipt plus authoritative state settles.'],
};
function reviewContext(m) {
  if (m.scope.startsWith('master:') || m.id === 'bom') return {
    route: '/process/?view=approval&approvalTab=master', ready: '#master-unified-review',
    setup: [click(`#master-unified-review [data-master-review="${m.id === 'bom' ? 'BOM' : m.scope.slice(7)}:{{caseId}}"]`)],
    evidence: [evidence('master-review.js', 'data-master-review', 'master-unified-review')],
  };
  if (m.id === 'routine-fqc') return {
    route: '/process/?view=approval&approvalTab=routine&rfDocument={{documentId}}&rfCase={{caseId}}', ready: '#review-routine-fqc',
    setup: [click('#review-routine-fqc [data-review-doc="{{documentId}}"]')],
    evidence: [evidence('routine-fqc.js', 'data-review-doc', 'review-routine-fqc', "state.approvalTab = 'routine'")],
  };
  const reviewModule = m.id === 'routine-equipment' ? 'equipment' : m.id;
  const choose = m.id === 'iqc' ? '[data-iqc-review="{{caseId}}"]' : m.id === 'fqc' ? '[data-quality-review="{{caseId}}"]' : null;
  return {
    route: '/process/?view=approval&approvalTab=quality', ready: '.quality-review-dashboard',
    setup: [click(`[data-review-jump="${reviewModule}"]`), ...(choose ? [click(choose)] : [])],
    evidence: [evidence('quality-review-overview.js', 'data-review-jump', 'row.wrapper.open=true'), evidence('master-data.js', 'qualityHTML', 'quality-review-section')],
  };
}
function scopeFor(m, action) { return m.groupEndpoint && endpointFor(m, action) === m.groupEndpoint ? 'ipqc-ab:{{groupScope}}' : m.id === 'routine-fqc' ? 'routine-fqc:{{documentId}}' : m.scope; }
function endpointFor(m, action) { return m.groupEndpoint && ['begin', 'editApply', 'localEdit', 'draftRead', 'receipt'].includes(action) ? m.groupEndpoint : m.endpoint; }
// A configured endpoint is NOT an on-the-wire URL or a measured response.
// The shared client appends compact=1 on every request and IQC's caller opts
// into iqc-edit-v1. Receipt/history/conditional queries are action-specific.
function wireContract(m) {
  return {
    endpointKind: 'configured_base',
    wireQuery: m.id === 'routine-fqc' ? {
      always: {}, actionSpecific: ['availability=1 on entry', 'operationId=<original id> for receipt'],
      source: 'routine-fqc.js read(query)/post(command); no automatic compact/projection parameter',
    } : {
      always: { compact: '1', ...(m.id === 'iqc' ? { projection: 'iqc-edit-v1' } : {}) },
      actionSpecific: ['operationId=<original id> for receipt', 'versionId/history/uiHistory for explicit history reads only', 'since=<generation:revision> for conditional poll only, never authoritative oracle'],
      source: 'shared-draft-client.js request; configured endpoint already retains scope/module/caseMetadata query',
    },
  };
}
function oracle(m, action, invariant) {
  return { authority: 'AUTHENTICATED_FULL_GET', endpointKind: 'configured_base', observationTiming: 'AUTHORITY_ONLY_OUTSIDE_ACTION_TIMING', observerQuery: m.id === 'routine-fqc' ? {} : { compact: '1' }, projectionPolicy: m.id === 'iqc' ? 'Oracle deliberately omits iqc-edit-v1 to verify complete active content; this extra full read is NOT the measured UI response.' : 'Full nonconditional authority read; not an application-action request-count or latency sample.', endpoint: endpointFor(m, action), expectedScope: scopeFor(m, action), flowPath: m.flowPath, require: ['exact actor/scope', 'explicit view permission', 'exact expected generation (or action-authorized rotation) and nonregressing revision', invariant], forbid: ['DOM toast as success proof', 'optimistic buffer as server proof'], receipt: !['firstLoad', 'reload', 'returnPage', 'load', 'openSubmit', 'draftRead', 'localEdit'].includes(action) ? 'Exact original operation/action receipt AND resulting full state; Begin-v1 modules require their exact original Begin receipt plus fresh full GET; legacy Begin uses authoritative response/full GET, never a fabricated receipt.' : null };
}
const mutationSequence = (m, action) => action === 'save' ? m.saveSequence || ['save'] : action === 'begin' ? [(['fqc', 'iqc', 'ipqc-c'].includes(m.id) ? 'begin-v1' : 'begin')] : action === 'resubmit' || action === 'confirmSubmit' ? ['submit'] : ['openSubmit', 'draftRead', 'receipt', 'load', 'localEdit'].includes(action) ? [] : [action === 'editApply' ? 'apply' : action];
function plan(m, action, steps, prerequisite, invariant, extra = {}) {
  return { id: `${m.id}.${action}`, moduleId: m.id, scope: scopeFor(m, action), action, status: 'SOURCE_SUPPORTED_PLAN', execution: { ...execution }, route: m.route, ready: control(m.ready), seedRequirements: m.seed, prerequisites: [...baselinePrerequisites, prerequisite], setupSteps: m.entrySetup || [], steps, oracle: oracle(m, action, invariant), network: { endpoint: endpointFor(m, action), mutationSequence: mutationSequence(m, action), inputPosts: 0, classification: 'EXPECTED_CONTRACT_NOT_MEASURED' }, evidence: [...m.evidence], ...extra };
}
function submitSteps(m, open) {
  const document = m.confirmation === 'routine-document', modal = document ? 'dialog.rf-modal[open]' : 'dialog.vd-confirm[open]';
  return [...(open ? [click(m.buttons.openSubmit)] : []), ...(!document ? [fill(`${modal} textarea`)] : []), click(`${modal} button[type="submit"]`)];
}
function reviewSteps(m, action) {
  const first = click(m.buttons[action]);
  if (m.confirmation === 'routine-document') return [...(action === 'return' ? [fill('#review-routine-fqc [data-return-reason]')] : []), first];
  return [first, ...(action !== 'approve' ? [fill('dialog.vd-confirm[open] textarea')] : []), click('dialog.vd-confirm[open] button[type="submit"]')];
}
export const scenarios = modules.flatMap(m => {
  const plans = [];
  if (m.id !== 'routine-fqc') {
    for (const action of ['firstLoad', 'reload', 'returnPage']) plans.push(plan(m, action,
      [...(action === 'returnPage' ? [{ action: 'navigate', url: '/process/?view=dashboard' }] : []), { action: action === 'reload' ? 'reload' : 'navigate', url: m.route }, ...(m.entrySetup || [])],
      'Clean/read-only fixture; no unknown receipt. Entry route and selected scope are explicit.',
      'Full permitted state is displayed; no new mutation or draft created solely by entering/reloading.', { network: { endpoint: m.endpoint, mutationSequence: [], inputPosts: 0, classification: 'EXPECTED_CONTRACT_NOT_MEASURED' } }));
  }
  for (const action of Object.keys(rules)) {
    if (['confirmSubmit', 'resubmit'].includes(action) ? !m.buttons.openSubmit : !m.buttons[action]) continue;
    const steps = action === 'save' && m.id === 'routine-fqc' ? [fill('#routine-fqc-root [data-field="title"]'), click(m.buttons.save)] : action === 'confirmSubmit' || action === 'resubmit' ? submitSteps(m, action === 'resubmit') : ['withdraw', 'approve', 'return'].includes(action) ? reviewSteps(m, action) : action === 'draftRead' ? [select(m.buttons.draftRead, '{{draftId}}')] : [click(m.buttons[action])];
    if (action === 'receipt' && m.receiptNames) steps[0].target.exactTextByLanguage = m.receiptNames;
    plans.push(plan(m, action, steps, ...rules[action]));
  }
  if (m.edit) {
    const e = m.edit, input = e.toggle ? [click(e.toggle)] : [...(e.open ? [click(e.open)] : []), fill(e.input)];
    plans.push(plan(m, 'localEdit', input, 'Editable draft; exact existing seeded row visible and untouched; test one scalar or matrix membership only.', `Server working/saved/active remain unchanged; local ${e.field} and dirty indicator reflect the synthetic input.`, { network: { endpoint: endpointFor(m, 'editApply'), mutationSequence: [], inputPosts: 0, classification: 'EXPECTED_CONTRACT_NOT_MEASURED' } }));
    plans.push(plan(m, 'editApply', [click(e.apply)], 'The matching localEdit plan has completed; exact same actor/editor/base/local revision still owns the edit.', e.mode === 'LOCAL_ONLY' ? `Finished local ${e.field} remains dirty; full GET still equals before; no mutation POST until explicit Save.` : `Original apply receipt and full GET show only seeded ${e.field} changed; saved and active unchanged.`, { network: { endpoint: endpointFor(m, 'editApply'), mutationSequence: e.mode === 'LOCAL_ONLY' ? [] : ['apply'], inputPosts: 0, classification: 'EXPECTED_CONTRACT_NOT_MEASURED' }, applySemantics: e.mode }));
  }
  for (const p of plans) {
    Object.assign(p.network, wireContract(m));
    p.evidence.push(m.id === 'routine-fqc' ? evidence('routine-fqc.js', 'fetch(endpoint + query') : evidence('shared-draft-client.js', "+'compact=1'", "responseProjection==='iqc-edit-v1'"));
    if (['approve', 'return'].includes(p.action)) { const review = reviewContext(m); p.route = review.route; p.ready = control(review.ready); p.setupSteps = review.setup; p.evidence.push(...review.evidence); }
    p.evidence.push({ file: vd, tokens: ['vd-shell', "const select=old.querySelector('select')"] });
    if (p.steps.some(step => step.target?.selector.includes('vd-confirm'))) p.evidence.push({ file: vd, tokens: ['confirmSubmit', 'confirmReview', 'vd-confirm'] });
    if (m.id === 'routine-fqc') {
      p.network.envelope = 'POST {action:draft, documentId:seed.documentId, command:{action:<logical action>, operationId, generation}}; receipt lookup uses the original outer operationId.';
      if (p.action === 'save') { p.network.mutationSequence = ['draft.apply', 'draft.save']; p.prerequisites.push('One changed title scalar in selected document; dirty Save sends draft.apply then draft.save. Neither an independent Apply nor Sync button exists.'); }
    }
    if (m.id === 'ipqc-ab' && p.action === 'receipt') p.prerequisites.push('This visible status control resolves the selected GROUP client only; a module=1 unknown has no equivalent dedicated visible receipt button in this profile.');
    if (m.id === 'ipqc-ab') p.prerequisites.push('Assert group endpoint for Begin/Apply, module=1 endpoint for Save/Submit/review. Module workflow exists before Save/openSubmit; no implicit Begin counted as free.');
  }
  return plans;
});

// These are source-derived public labels, not exported private report contents.
const common = [['firstLoad', '首次載入'], ['reload', '再次載入'], ['returnPage', '切頁返回'], ['begin', '開始修改草稿'], ['save', '儲存草稿'], ['openSubmit', '開啟送審確認'], ['confirmSubmit', '確認送審'], ['withdraw', '撤回送審'], ['resubmit', '撤回或發回後再送審'], ['approve', '核准確認'], ['return', '發回']];
const formTail = [['editApply', '編輯表單套用'], ['draftRead', '草稿版本讀取']];
export const inventoryGroups = [
  ['process:platform', [...common, ['localEdit', '方塊套用至本機'], ['sync', '同步目前畫布'], ['history', '歷史與還原'], ['receipt', '查詢未知收據']]],
  ...['master:AB', 'master:C', 'master:AB/C', 'master:PROCESS'].map(scope => [scope, [...common, ...formTail]]),
  ['bom', [...common, ['editApply', '編輯完成至本機'], ['import', '匯入預覽與套用'], ['recovery', '恢復本機副本']]],
  ...['iqc', 'group A/B 與全模組', 'ipqc-c'].map(scope => [scope, [...common, ...formTail]]),
  ['fqc', [...common, ['matrix', '矩陣本機套用'], ['draftRead', '草稿版本讀取']]],
  ...['tooling', 'routine-equipment'].map(scope => [scope, [...common, ...formTail]]),
  ['routine-fqc 每單據', [...common.map(([id, label]) => id === 'begin' ? ['create', '建立計畫或報告'] : [id, label]), ['discard', '捨棄草稿'], ['revoke', '撤銷確認'], ['followup', '追蹤報告與免驗或處置']]],
];
const gaps = {
  canvas: ['EXTERNAL_OWNER', 'Canvas action runner is owned separately. This non-canvas manifest does not mark any Canvas button executed.'],
  import: ['DYNAMIC_SEED_REQUIRED', 'BOM preview/decisions require a synthetic workbook, deterministic diff rows and a complete per-batch command oracle; not supplied in this small batch.'],
  recovery: ['DYNAMIC_SEED_REQUIRED', 'BOM restore requires a real v2 runtime+lineage lock, exact source metadata and explicit preview/two-read oracle; arbitrary localStorage injection is not a valid seed.'],
  routineLoad: ['DYNAMIC_SEED_REQUIRED', 'Routine-FQC entry has availability gate and refresh(true) may POST generate. Fixed calendar/startDate/jobs and generation oracle are not yet implemented.'],
  create: ['DYNAMIC_SEED_REQUIRED', 'Routine document creation is create-plan from exact checked jobs OR create-report from an approved plan, not generic Begin; requires separate dependency seeds.'],
  discard: ['DYNAMIC_SEED_REQUIRED', 'Document discard and approved-plan deletion differ and preserve dependency/history; require exact document status and cancellation confirmation seed.'],
  revoke: ['DYNAMIC_SEED_REQUIRED', 'Revoke needs an approved eligible document/plan plus dependency impact; it is not withdraw of a pending case.'],
  followup: ['DYNAMIC_SEED_REQUIRED', 'Retest report, waiver and disposal have distinct case/result/sample/evidence prerequisites; no generic followup click represents all three.'],
};
let ordinal = 0;
export const inventory = inventoryGroups.flatMap(([scope, actions]) => actions.map(([action, label]) => {
  const id = `ui-${String(++ordinal).padStart(3, '0')}`;
  let gap = scope === 'process:platform' ? gaps.canvas : scope === 'bom' ? gaps[action] : scope === 'routine-fqc 每單據' ? gaps[action] || (['firstLoad', 'reload', 'returnPage'].includes(action) ? gaps.routineLoad : null) : null;
  const matching = modules.filter(m => m.inventoryScope === scope);
  const scenarioIds = gap ? [] : matching.flatMap(m => (action === 'matrix' ? ['localEdit', 'editApply'] : action === 'editApply' ? ['localEdit', 'editApply'] : [action]).map(key => `${m.id}.${key}`));
  if (!gap && !scenarioIds.length) gap = ['SCOPE_GAP', 'No exact source-backed scenario in this batch.'];
  return { id, scope, action, label, status: gap ? 'NOTIMPLEMENTED' : 'MAPPED_NOTRUN', scenarioIds, ...(gap ? { blocker: { code: gap[0], reason: gap[1] } } : {}), browser: 'NOTRUN', timing: 'UNMEASURED' };
}));

/** Binding is intentionally strict. IDs are synthetic CSS-safe seed identifiers,
 * never employee input. No default first-row selection or optional controls. */
export function bindScenario(id, seed) {
  const scenario = scenarios.find(row => row.id === id);
  if (!scenario) throw Error(`UNKNOWN_SCENARIO:${id}`);
  const raw = JSON.stringify(scenario);
  return JSON.parse(raw.replace(/\{\{([A-Za-z][A-Za-z0-9]*)\}\}/g, (_match, key) => {
    const value = seed?.[key];
    if (typeof value !== 'string' || !/^[A-Za-z0-9_.:-]+$/.test(value)) throw Error(`SYNTHETIC_SEED_REQUIRED:${key}`);
    return value;
  }));
}

// Additional source scope distinction, deliberately outside the 173-row inventory.
export const scopeNotes = [{
  id: 'process-machine-equipment', scope: 'master:PROCESS', status: 'NOTIMPLEMENTED', browser: 'NOTRUN',
  knownAffordance: '[data-equipment-save]', source: source('process-equipment.js'),
  reason: 'Process machine editor calls saveVersion on the PROCESS master. It is not tooling or routine-equipment and has no independent shared-draft lifecycle. A machine-template seed and apply-path oracle remain outside this scalar first batch.',
}];

export function validateScenario(scenario) {
  const fail = reason => { throw Error(`INVALID_SCENARIO:${scenario?.id || 'missing'}:${reason}`); };
  if (!scenario?.id || !scenario.moduleId || !scenario.scope || !scenario.action) fail('identity');
  if (scenario.status !== 'SOURCE_SUPPORTED_PLAN' || scenario.execution?.browser !== 'NOTRUN' || scenario.execution?.timing !== 'UNMEASURED' || scenario.execution?.implementation !== 'MANIFEST_ONLY') fail('unearned acceptance');
  if (!scenario.seedRequirements || !Array.isArray(scenario.prerequisites) || scenario.prerequisites.length < 4) fail('prerequisites');
  if (['approve', 'return'].includes(scenario.action) && (!scenario.route.includes('view=approval') || !scenario.route.includes('approvalTab=') || !scenario.setupSteps?.length)) fail('review entry');
  if (!scenario.ready?.selector || !Array.isArray(scenario.steps) || !scenario.steps.length) fail('visible action');
  for (const step of [...(scenario.setupSteps || []), ...scenario.steps]) {
    if (['navigate', 'reload'].includes(step.action)) { if (!step.url?.startsWith('/process/')) fail('route'); continue; }
    if (!['click', 'fill', 'select'].includes(step.action)) fail('action');
    const target = step.target;
    if (!target?.selector || target.optional !== false || target.cardinality !== 1 || target.visible !== true || target.enabled !== true) fail('strict locator');
    if (['fill', 'select'].includes(step.action) && typeof step.value !== 'string') fail('input value');
  }
  if (scenario.oracle?.authority !== 'AUTHENTICATED_FULL_GET' || !scenario.oracle.endpoint?.startsWith('/api/') || !scenario.oracle.expectedScope || !scenario.oracle.flowPath || scenario.oracle.require?.length < 4 || scenario.oracle.forbid?.length < 2) fail('authoritative oracle');
  if (scenario.oracle.observationTiming !== 'AUTHORITY_ONLY_OUTSIDE_ACTION_TIMING' || scenario.oracle.endpointKind !== 'configured_base') fail('observer timing separation');
  if (scenario.network?.endpointKind !== 'configured_base' || !scenario.network.wireQuery?.always || !scenario.network.wireQuery?.actionSpecific?.length) fail('wire query contract');
  if (!Array.isArray(scenario.network?.mutationSequence) || scenario.network.inputPosts !== 0 || scenario.network.classification !== 'EXPECTED_CONTRACT_NOT_MEASURED') fail('network contract');
  if (!scenario.evidence?.length || scenario.evidence.some(item => !item.file?.startsWith('public/process/') || !item.tokens?.length)) fail('source evidence');
  return true;
}
