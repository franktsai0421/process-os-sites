import fs from 'node:fs';import assert from 'node:assert/strict';import vm from 'node:vm';
import {prepareBrowserPhoto} from '../public/process/photo-policy.mjs';
import {pngFixture} from './photo-fixtures.mjs';
const source=fs.readFileSync(new URL('../public/process/fqc-master.js',import.meta.url),'utf8');
const start=source.indexOf('  async function fileData(file) {'),end=source.indexOf('  function openExistingModal(',start);
assert.ok(start>=0&&end>start);
class Reader {readAsDataURL(blob){blob.arrayBuffer().then(bytes=>{this.result='data:'+blob.type+';base64,'+Buffer.from(bytes).toString('base64');this.onload();},e=>{this.error=e;this.onerror();});}}
const context=vm.createContext({FileReader:Reader});
const policy=new vm.SyntheticModule(['prepareBrowserPhoto'],function(){this.setExport('prepareBrowserPhoto',prepareBrowserPhoto);},{context});
await policy.link(()=>{});await policy.evaluate();
const uploadModule=new vm.SourceTextModule(source.slice(start,end)+'\nexport {fileData};',{context,importModuleDynamically:async spec=>{assert.equal(spec,'./photo-policy.mjs?v=20261023-lossless1');return policy;}});
await uploadModule.link(()=>{});await uploadModule.evaluate();
const bytes=pngFixture({alpha:true}),blob=new File([bytes],'synthetic.png',{type:'image/png'});
const expected=await prepareBrowserPhoto(blob),actual=await uploadModule.namespace.fileData(blob);
assert.deepEqual(Buffer.from(actual.split(',')[1],'base64'),Buffer.from(await expected.blob.arrayBuffer()));
assert.ok(expected.changed);
const corrupt=Buffer.from(bytes);corrupt[corrupt.length-5]^=1;await assert.rejects(uploadModule.namespace.fileData(new File([corrupt],'bad.png',{type:'image/png'})),/PHOTO_PNG_INVALID/);
console.log(JSON.stringify({status:'PASS_FQC_ACTUAL_UPLOAD_HELPER',cases:2,originalUntouched:true}));

// Composition contracts: execute the actual composed handlers. Transport,
// preparation, paint and DOM are explicit ports; this is not an HTTP/browser test.
function normalizedPhotoSource(text) { return text.replace(/\r\n/g, '\n'); }
const appSource = normalizedPhotoSource(fs.readFileSync(new URL('../public/process/app.js', import.meta.url), 'utf8'));
function exactSpan(text, first, last) {
  const begin = text.indexOf(first);
  assert.ok(begin >= 0 && text.indexOf(first, begin + first.length) < 0, `unique start: ${first}`);
  const finish = text.indexOf(last, begin + first.length);
  assert.ok(finish > begin && text.indexOf(last, finish + last.length) < 0, `unique end: ${last}`);
  return text.slice(begin, finish);
}
// EOL conversion is limited to CRLF. Missing/duplicate anchors still fail closed.
for (const eol of ['\n', '\r\n']) {
  const sample = ['BEGIN', 'body', 'END'].join(eol);
  assert.equal(exactSpan(normalizedPhotoSource(sample), 'BEGIN\n', 'END'), 'BEGIN\nbody\n');
  for (const invalid of [sample.replace('BEGIN', 'MISSING'), sample.replace('END', 'MISSING'),
    `BEGIN${eol}${sample}`, `${sample}${eol}END`]) {
    assert.throws(() => exactSpan(normalizedPhotoSource(invalid), 'BEGIN\n', 'END'), /unique (start|end)/);
  }
}
assert.equal(normalizedPhotoSource('body\rvalue'), 'body\rvalue', 'do not silently remove non-CRLF source bytes');
const templateBinding = exactSpan(appSource,
  "    document.querySelectorAll('[data-master-media]').forEach((input) => {",
  "    document\n      .querySelectorAll('[data-remove-template-media]')");
const formOwnership = exactSpan(source,
  '    const formActor=identity(),formActorId=formActor?.id,formGeneration=library().workflow?.generation,formVersionId=editable()?.id;',
  '    const version = editable(), errors = errorRows(version, categoryName(version)), items = version.snapshot.items, existing = items.find(item => item.id === id), error = errors.find(item => item.id === (existing?.errorId || ui.selectedErrorId)) || errors[0]; if (!error) return;');
const fqcBinding = exactSpan(source,
  "    overlay.querySelector('#fqc-file-input').onchange = async e => {",
  "    overlay.querySelectorAll('input[name=\"toolType\"]').forEach(r => {");
const lightboxBinding = exactSpan(appSource, 'function bindLightbox() {', 'function bindCommon() {');
function deferredPhoto() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
let compositionCases = 0;
async function photoCase(name, run) {
  await run();
  compositionCases++;
  console.log(`PASS photo composition: ${name}`);
}
function templateFixture(replace = false) {
  const files = [{ name: 'selected.png' }], initial = [{ src: 'old-photo' }];
  const state = { actor: { id: 'staff' }, epoch: 1, draft: { id: 'draft' },
    model: { rows: [{ id: 'template', mediaItems: initial }] }, prepareFailure: false,
    applyFailure: false, unknown: false, gate: null, prepareCalls: 0, applied: [],
    paints: 0, recoveries: 0, messages: [], retry: null };
  const card = { dataset: { templateKey: 'template' },
    querySelector: () => state.retry, append: retry => { state.retry = retry; } };
  const input = { files, value: 'selected.png', disabled: false, isConnected: true,
    dataset: { replaceIndex: '0' }, closest: () => card,
    hasAttribute: name => replace && name === 'data-replace-index' };
  const body = { innerHTML: '' };
  const document = { documentElement: { lang: replace ? 'vi' : 'zh-Hant' },
    querySelectorAll: selector => { assert.equal(selector, '[data-master-media]'); return [input]; },
    querySelector: selector => { assert.equal(selector, '#data-content'); return body; },
    createElement: tag => { assert.equal(tag, 'button'); return { remove() { state.retry = null; } }; } };
  const shared = { client: scope => { assert.equal(scope, 'PROCESS'); return { hasUnknown: () => state.unknown }; },
    recover: async scope => { assert.equal(scope, 'PROCESS'); state.recoveries++; } };
  const ProcessSync = { get identity() { return state.actor; }, identityGeneration: () => state.epoch };
  vm.runInNewContext(templateBinding, {
    document, window: { ProcessSync, MasterDataWorkflow: { shared } }, currentUser: state.actor,
    editableProcessMasterData: () => state.model, processMasterDraft: () => state.draft,
    processMasterCatalogMatches: (snapshot, key) => snapshot.rows.filter(row => row.id === key),
    processTemplateMediaItems: row => row.mediaItems,
    setProcessTemplateMedia: (row, items) => { row.mediaItems = items; },
    prepareMediaUploads: async selected => {
      state.prepareCalls++; assert.equal(selected[0], files[0]);
      if (state.gate) await state.gate.promise;
      if (state.prepareFailure) throw Error('PREPARE_FAILED');
      return { items: [{ src: 'new-photo' }] };
    },
    applyProcessMasterSnapshot: async (before, next) => {
      assert.equal(before, state.model); state.applied.push(next);
      if (state.applyFailure) throw Error('APPLY_FAILED');
      state.model = next;
    },
    processMasterView: () => { state.paints++; return 'painted'; }, bindDataInner: () => {},
    toast: message => state.messages.push(message), processMasterText: zh => zh,
    repaintProcessMasterPage: () => { state.paints++; },
  });
  return { state, input, files, body };
}
for (const replace of [false, true]) await photoCase(`template ${replace ? 'replace' : 'add'} succeeds with truthful localized toast`, async () => {
  const f = templateFixture(replace);
  await f.input.onchange();
  assert.equal(f.state.applied.length, 1); assert.equal(f.state.paints, 1);
  assert.deepEqual(Array.from(f.state.model.rows[0].mediaItems, item => item.src), replace ? ['new-photo'] : ['old-photo', 'new-photo']);
  assert.equal(f.state.messages.at(-1), replace ? 'Đã thêm 1 ảnh' : '已加入 1 張照片');
  assert.equal(f.input.disabled, false);
});
for (const failure of ['prepareFailure', 'applyFailure']) await photoCase(`template ${failure} preserves selection and actual retry succeeds`, async () => {
  const f = templateFixture(); f.state[failure] = true;
  await f.input.onchange();
  assert.equal(f.input.files, f.files); assert.equal(f.input.value, 'selected.png');
  assert.equal(f.input.disabled, false); assert.equal(f.state.paints, 0);
  assert.deepEqual(f.state.model.rows[0].mediaItems.map(item => item.src), ['old-photo']);
  assert.ok(f.state.retry); const attempts = f.state.applied.length;
  f.state[failure] = false; await f.state.retry.onclick();
  assert.equal(f.state.applied.length, attempts + 1); assert.equal(f.state.paints, 1);
});
await photoCase('template unknown retry performs receipt recovery without another apply', async () => {
  const f = templateFixture(); f.state.applyFailure = true; f.state.unknown = true;
  await f.input.onchange(); assert.equal(f.state.applied.length, 1);
  await f.state.retry.onclick(); await f.state.retry.onclick();
  assert.equal(f.state.applied.length, 1); assert.equal(f.state.prepareCalls, 1);
  assert.equal(f.state.recoveries, 2); assert.equal(f.state.paints, 0);
  assert.equal(f.input.files, f.files); assert.equal(f.input.value, 'selected.png');
});
const templateOwnerChanges = {
  actorReference: f => { f.state.actor = { id: 'staff' }; },
  actorId: f => { f.state.actor.id = 'other'; },
  epoch: f => { f.state.epoch++; },
  draft: f => { f.state.draft = { id: 'draft' }; },
  model: f => { f.state.model = { rows: f.state.model.rows }; },
  disconnected: f => { f.input.isConnected = false; },
};
for (const [name, change] of Object.entries(templateOwnerChanges)) await photoCase(`template preparation loses ${name}: zero apply/paint`, async () => {
  const f = templateFixture(); const original = f.state.model;
  f.state.gate = deferredPhoto(); const pending = f.input.onchange();
  assert.equal(f.state.prepareCalls, 1); change(f); f.state.gate.resolve(); await pending;
  assert.equal(f.state.applied.length, 0); assert.equal(f.state.paints, 0);
  assert.deepEqual(original.rows[0].mediaItems.map(item => item.src), ['old-photo']);
  assert.equal(f.input.files, f.files); assert.equal(f.input.disabled, false);
});
function fqcPhotoFixture() {
  const state = { actor: { id: 'staff' }, workflow: { generation: 'one' }, version: { id: 'draft' },
    media: [], renders: 0, messages: [], calls: 0, gate: null };
  const input = { value: 'chosen' };
  const overlay = { isConnected: true, querySelector: selector => { assert.equal(selector, '#fqc-file-input'); return input; } };
  vm.runInNewContext(formOwnership + '\n' + fqcBinding, {
    overlay, identity: () => state.actor, library: () => ({ workflow: state.workflow }),
    editable: () => state.version, transport: () => ({ permission: () => true }),
    currentMedia: state.media, crypto: { randomUUID: () => 'synthetic-photo' },
    fileData: async file => { state.calls++; if (state.gate) await state.gate.promise; return uploadModule.namespace.fileData(file); },
    renderPhotoList: () => { state.renders++; },
    showModalAlert: (_overlay, level, message) => { assert.equal(level, 'error'); state.messages.push(message); },
  });
  return { state, input, overlay, run: file => input.onchange({ target: Object.assign(input, { files: [file] }) }) };
}
await photoCase('FQC actual onchange accepts actual prepared photo once', async () => {
  const f = fqcPhotoFixture(); await f.run(blob);
  assert.equal(f.state.media.length, 1); assert.equal(f.state.renders, 1);
  assert.equal(f.state.media[0].src, actual); assert.equal(f.input.value, '');
  assert.deepEqual(f.state.messages, []);
});
for (const owner of ['actor', 'generation']) await photoCase(`FQC deferred actual fileData loses ${owner}: zero push/render`, async () => {
  const f = fqcPhotoFixture(); f.state.gate = deferredPhoto(); const pending = f.run(blob);
  assert.equal(f.state.calls, 1);
  if (owner === 'actor') f.state.actor = { id: 'staff' }; else f.state.workflow.generation = 'two';
  f.state.gate.resolve(); await pending;
  assert.equal(f.state.media.length, 0); assert.equal(f.state.renders, 0);
  assert.deepEqual(f.state.messages, ['DEPENDENCY_CHANGED_RECONFIRM']); assert.equal(f.input.value, '');
});
await photoCase('FQC actual policy rejection never enters the model', async () => {
  const f = fqcPhotoFixture(); await f.run(new File([corrupt], 'corrupt.png', { type: 'image/png' }));
  assert.equal(f.state.calls, 1); assert.equal(f.state.media.length, 0); assert.equal(f.state.renders, 0);
  assert.match(f.state.messages[0], /PHOTO_PNG_INVALID/); assert.equal(f.input.value, '');
});
function viewerFixture(lang) {
  const nodes = new Map(), dialogs = [], events = {}, group = ['one', 'two', 'movie'].map((name, index) => ({
    dataset: { lightboxSrc: name, lightboxType: index === 2 ? 'video/mp4' : 'image/png', lightboxTitle: name, lightboxGroup: 'album' },
  }));
  let pauses = 0;
  function node() {
    const attributes = new Map(), classes = new Set();
    return { hidden: false, textContent: '', scrolls: [],
      setAttribute: (key, value) => attributes.set(key, value), getAttribute: key => attributes.get(key),
      classList: { toggle: (key, on) => on ? classes.add(key) : classes.delete(key), contains: key => classes.has(key) },
      scrollTo(...position) { this.scrolls.push(position); }, pause: () => { pauses++; } };
  }
  for (const key of ['.media-lightbox-close', '.media-lightbox-viewport', '.media-lightbox-zoom', 'img', 'video', 'figcaption', '.previous', '.next']) nodes.set(key, node());
  const dialog = { dataset: {}, open: false, innerHTML: '',
    querySelector: selector => { assert.ok(nodes.has(selector), selector); return nodes.get(selector); },
    querySelectorAll: selector => { assert.equal(selector, '.media-lightbox-nav'); return [nodes.get('.previous'), nodes.get('.next')]; },
    addEventListener: (event, callback) => { events[event] = callback; },
    close() { this.open = false; }, showModal() { this.open = true; } };
  const document = { documentElement: { lang }, body: { appendChild: value => dialogs.push(value) },
    querySelector: selector => { assert.equal(selector, '#media-lightbox'); return dialogs[0] || null; },
    createElement: tag => { assert.equal(tag, 'dialog'); return dialog; },
    querySelectorAll: selector => {
      if (selector === '[data-lightbox-src]' || selector === '[data-lightbox-group="album"]') return group;
      assert.ok(['[data-lightbox-src][role="button"]', '[data-node-bom-open]'].includes(selector), selector); return [];
    } };
  vm.runInNewContext(lightboxBinding + '\nbindLightbox();', { document, CSS: { escape: value => value } });
  return { group, nodes, dialogs, dialog, events, pauseCount: () => pauses };
}
for (const lang of ['zh-Hant', 'vi']) await photoCase(`actual lightbox ${lang}: zoom/navigation/video/close/cancel/reopen`, async () => {
  const f = viewerFixture(lang), event = { stopPropagation() {} };
  f.group[0].onclick(event);
  assert.equal(f.dialogs.length, 1); assert.equal(f.dialog.open, true);
  assert.match(f.dialog.innerHTML, /class="media-lightbox-viewport" tabindex="0"/);
  const zoom = f.nodes.get('.media-lightbox-zoom'), viewport = f.nodes.get('.media-lightbox-viewport');
  assert.equal(zoom.textContent, lang === 'vi' ? 'Phóng to' : '放大');
  zoom.onclick(); assert.equal(zoom.getAttribute('aria-pressed'), 'true'); assert.equal(viewport.classList.contains('is-expanded'), true);
  assert.equal(zoom.textContent, lang === 'vi' ? 'Vừa cửa sổ' : '適合視窗');
  f.nodes.get('.next').onclick(event); assert.equal(f.nodes.get('img').src, 'two');
  assert.equal(zoom.getAttribute('aria-pressed'), 'false'); assert.equal(viewport.classList.contains('is-expanded'), false);
  zoom.onclick(); f.nodes.get('.previous').onclick(event); assert.equal(f.nodes.get('img').src, 'one');
  assert.equal(zoom.getAttribute('aria-pressed'), 'false');
  f.nodes.get('.previous').onclick(event); assert.equal(f.nodes.get('video').src, 'movie');
  assert.equal(zoom.hidden, true); assert.equal(f.nodes.get('video').hidden, false); assert.equal(f.nodes.get('img').hidden, true);
  assert.equal(f.pauseCount(), 4);
  f.nodes.get('.media-lightbox-close').onclick(); assert.equal(f.dialog.open, false);
  f.group[1].onclick(event); assert.equal(f.dialog.open, true); assert.equal(zoom.hidden, false);
  zoom.onclick(); f.events.cancel(); assert.equal(f.dialog.open, false);
  f.group[0].onclick(event); assert.equal(f.dialog.open, true); assert.equal(f.dialogs.length, 1);
  assert.equal(zoom.getAttribute('aria-pressed'), 'false'); assert.equal(viewport.classList.contains('is-expanded'), false);
  assert.equal(f.pauseCount(), 6);
  assert.ok(viewport.scrolls.every(position => position[0] === 0 && position[1] === 0));
  assert.match(viewport.getAttribute('aria-label'), lang === 'vi' ? /Vùng ảnh/ : /照片檢視區/);
});
assert.equal(compositionCases, 17);
console.log(JSON.stringify({ status: 'PASS_PHOTO_COMPOSITION', cases: compositionCases, transport: 'synthetic ports', browser: false }));
