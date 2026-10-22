const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

// Pure VM fixtures: no SDK, sockets, browser, storage or business-data writes.
const files = ['shared-draft-client.js', 'fqc-master.js', 'iqc-master.js', 'ipqc-ab.js', 'ipqc-c.js', 'routine-equipment.js', 'master-admin-ui.js', 'master-data.js', 'process-authoring-v3.js'];
const sources = Object.fromEntries(files.map(file => [file, fs.readFileSync('public/process/' + file, 'utf8')]));
for (const [file, source] of Object.entries(sources)) new vm.Script(source, { filename: file });
const document = { documentElement: { lang: 'zh' } }, window = {};
vm.runInNewContext(sources['shared-draft-client.js'], { window, document, crypto: webcrypto, setTimeout, clearTimeout, AbortController, fetch() { throw Error('Unexpected network'); } });
const format = window.sharedDraftErrorMessage;
const codes = ['DEPENDENCY_CHANGED_RECONFIRM', 'DEPENDENCY_GUARD_REQUIRED'];
assert.equal(typeof format, 'function');

function functionSource(source, signature) {
  const start = source.indexOf(signature);
  assert.ok(start >= 0, signature);
  const open = source.indexOf('{', start);
  let depth = 0, quote = '', escaped = false;
  for (let i = open; i < source.length; i++) {
    const char = source[i];
    if (quote) { if (escaped) escaped = false; else if (char === '\\') escaped = true; else if (char === quote) quote = ''; continue; }
    if (['"', "'", '`'].includes(char)) { quote = char; continue; }
    if (char === '{') depth++;
    if (char === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw Error('Unclosed fixture function: ' + signature);
}
function helper(file, context = {}) {
  const declaration = sources[file].split('\n').find(line => line.includes('const displayDraftError ='));
  assert.ok(declaration, file);
  return { declaration, context: { window, document, ...context } };
}
function evaluate(file, expression, extra = {}) {
  const { declaration, context } = helper(file, extra);
  return vm.runInNewContext(declaration + '\n' + expression, context);
}
const input = { value: 'B unsaved <input>', selectionStart: 2, selectionEnd: 7, scrollTop: 31 };
const inputBefore = JSON.stringify(input);
const escaped = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

// master-admin-ui loads before shared-draft-client. Each actual local helper must
// perform a late lookup rather than capture the formatter at module evaluation.
for (const file of files.slice(1)) {
  const earlyWindow = {}, { declaration } = helper(file);
  const late = vm.runInNewContext(declaration + '\ndisplayDraftError', { window: earlyWindow });
  assert.equal(late(Error(codes[0])), codes[0]);
  earlyWindow.sharedDraftErrorMessage = format;
  document.documentElement.lang = 'vi';
  assert.equal(late(Error(codes[0])), format(codes[0], 'vi'));
}
console.log('PASS actual eight helpers: early-load fallback and late language-aware lookup');

(async () => {
for (const language of ['zh', 'vi']) {
  document.documentElement.lang = language;
  for (const code of codes) {
    const error = Object.freeze(Object.assign(Error(code), { status: code === codes[0] ? 409 : 422, details: Object.freeze({ field: 'note' }) }));
    const expected = format(error), alerts = [], alert = { textContent: '', className: '' };
    const overlay = { querySelector(selector) { assert.equal(selector, '.fqc-modal-alert'); return alert; }, input };
    const show = evaluate('fqc-master.js', functionSource(sources['fqc-master.js'], 'function showModalAlert(') + '\nshowModalAlert', { toast: value => alerts.push(value) });
    show(overlay, 'error', code);
    assert.equal(alert.textContent, expected); assert.equal(alert.className, 'fqc-modal-alert error'); assert.deepEqual(alerts, [expected]);
    show(overlay, 'success', code); assert.equal(alert.textContent, code, 'success/business text is not translated');

    const errorBox = { textContent: '' }, iqcOverlay = { querySelector(selector) { assert.equal(selector, '#iqc-part-error'); return errorBox; }, input };
    const iqcLine = sources['iqc-master.js'].split('\n').find(line => line.includes('const showError = error => overlay.querySelector'));
    vm.runInNewContext(helper('iqc-master.js').declaration + '\n' + iqcLine + '\nshowError(error);', { window, overlay: iqcOverlay, error });
    assert.equal(errorBox.textContent, expected);

    for (const file of ['ipqc-ab.js', 'ipqc-c.js']) {
      const expression = sources[file].match(/h\(displayDraftError\(message\)\)/)?.[0];
      assert.ok(expression, file); assert.equal(evaluate(file, expression, { h: escaped, message: code }), escaped(expected));
      assert.equal(evaluate(file, expression, { h: escaped, message: '<img src=x onerror=x>' }), '&lt;img src=x onerror=x&gt;');
    }
    const status = { textContent: '' }, assignment = sources['routine-equipment.js'].match(/status\.textContent=displayDraftError\(message\)/)?.[0];
    assert.ok(assignment); evaluate('routine-equipment.js', assignment, { status, message: code, input }); assert.equal(status.textContent, expected);
    const toasts = [], expression = sources['master-data.js'].match(/toast\(displayDraftError\(error\)\)/)?.[0];
    assert.ok(expression); evaluate('master-data.js', expression, { toast: value => toasts.push(value), error, input }); assert.deepEqual(toasts, [expected]);

    // Execute the real master dialog handler, including both thrown errors and
    // an onSave-returned error; failed Apply must neither close nor redraw it.
    const admin = sources['master-admin-ui.js'], marker = "dialog.querySelector('form').onsubmit = ", start = admin.indexOf(marker) + marker.length;
    assert.ok(start >= marker.length); const end = admin.indexOf('\n      };', start); assert.ok(end > start);
    for (const throws of [false, true]) {
      const target = { textContent: '', replaceChildren() { this.textContent = ''; }, querySelector() { return null; } }, buttons = [{ disabled: false }, { disabled: true }];
      let closed = false, redrawn = false;
      const dialog = { querySelector() { return target; }, querySelectorAll() { return buttons; }, close() { closed = true; }, input };
      const onSave = async () => { if (throws) throw error; return code; };
      const handler = evaluate('master-admin-ui.js', '(' + admin.slice(start, end + 8).trim().replace(/;$/, '') + ')', { dialog, applying: false, onSave, FormData: class {}, redraw() { redrawn = true; }, toast() { throw Error('Unexpected success toast'); }, t() { throw Error('Unexpected success text'); } });
      await handler({ preventDefault() {}, target: {} });
      assert.equal(target.textContent, expected); assert.equal(closed, false); assert.equal(redrawn, false); assert.deepEqual(buttons.map(b => b.disabled), [false, true]);
    }
    const authoring = functionSource(sources['process-authoring-v3.js'], 'function error(e)');
    const authorContext = { window, document, loadError: '', loadIssues: [], validationSavedId: null, e: error, toast: value => { assert.equal(value, expected); }, panel() {}, flow: () => ({ saved: { id: 'unchanged' } }), input };
    vm.runInNewContext(helper('process-authoring-v3.js').declaration + '\n' + authoring + '\nerror(e);', authorContext);
    assert.equal(authorContext.loadError, code, 'raw authoring state remains classified by its original code');
    assert.equal(error.message, code); assert.equal(JSON.stringify(input), inputBefore);
  }
}

// The C-specific pretranslation must not consume either shared code. Its other
// workflow wording and unknown-create discriminator retain their original path.
const cSource = sources['ipqc-c.js'], termsStart = cSource.indexOf('const workflowErrors='), termsEnd = cSource.indexOf('\n  };', termsStart);
const terms = vm.runInNewContext(cSource.slice(termsStart, termsEnd + 5) + '\nworkflowErrors');
for (const code of codes) assert.equal(Object.hasOwn(terms, code), false);
assert.ok(terms.PENDING_LOCKED); assert.ok(terms.RESULT_UNKNOWN_CHECK_BEFORE_RETRY);
assert.ok(cSource.includes("error.message==='RESULT_UNKNOWN_CHECK_BEFORE_RETRY'"));
assert.ok(cSource.includes('const terms=workflowErrors[error.message];message=terms?t(...terms):error.message;'));

// The real shared history sink uses textContent; existing restore-specific
// reconfirmation stays distinct from these two field-guard messages.
for (const language of ['zh', 'vi']) {
  document.documentElement.lang = language;
  const rows = [], main = { prepend: row => rows.push(row) }, overlay = { querySelector: () => main };
  const sharedDocument = { ...document, createElement: () => ({ role: '', textContent: '' }) };
  const showHistory = vm.runInNewContext(functionSource(sources['shared-draft-client.js'], 'function showError(error)') + '\nshowError', { window, document: sharedDocument, overlay });
  for (const code of codes) { showHistory(Error(code)); assert.equal(rows.at(-1).textContent, format(code)); assert.equal(rows.at(-1).role, 'alert'); }
  showHistory(Error('<b>unrecognized</b>')); assert.equal(rows.at(-1).textContent, '<b>unrecognized</b>');
}
assert.ok(sources['shared-draft-client.js'].includes("error.message==='RESTORE_RECONFIRM'?"));
console.log('PASS actual display sinks in ZH/VI; raw state, form/cursor/scroll, dialog failure and escaping retained; no SDK/HTTP/GUI');
})().catch(error => { console.error(error); process.exitCode = 1; });
