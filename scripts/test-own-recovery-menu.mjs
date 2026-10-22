import __esmImport0 from "node:fs";
import __esmImport1 from "node:vm";
import __esmImport2 from "node:assert/strict";
import {createRequire as __esmFactory} from 'node:module';
const __esmRequire=__esmFactory(import.meta.url);
/* Production recovery UI handlers; synthetic DOM/storage, no network or login. */
const fs = __esmImport0;
const vm = __esmImport1;
const assert = __esmImport2;

async function main() {
  const source = fs.readFileSync('public/process/data-safety-ui.js', 'utf8');
  const identity = source.slice(source.indexOf('  const priorIdentity ='), source.indexOf('  function updateOwnRecovery('));
  const recovery = source.slice(source.indexOf('  function updateOwnRecovery('), source.indexOf('  async function platformLogin('));
  assert(identity && recovery, 'Production recovery hooks must exist');
  const records = new Map(), events = new Map(), blobs = new Map(), downloads = [];
  const menu = {
    button: null,
    querySelector() { return this.button; },
    append(button) { this.button = button; button.remove = () => { if (this.button === button) this.button = null; }; },
  };
  let networkCalls = 0;
  const ctx = {
    sync: { identity: { id: 'frank' }, ownRecovery() { return records.get(this.identity?.id) || null; } },
    currentUser: { id: 'frank' },
    applyPlatformIdentity() {},
    canView() { return true; },
    window: { normalizePlatformUser() {}, addEventListener(name, handler) { events.set(name, handler); } },
    document: {
      documentElement: { lang: 'zh-TW' },
      querySelector(selector) { assert.equal(selector, '#account-menu'); return menu; },
      querySelectorAll() { return []; },
      createElement(tag) {
        return tag === 'button' ? { dataset: {} } : { click() { downloads.push({ href: this.href, name: this.download }); } };
      },
    },
    Blob,
    URL: { createObjectURL(blob) { const key = 'blob:qa-' + blobs.size; blobs.set(key, blob); return key; }, revokeObjectURL() {} },
    setTimeout() {},
    toast() {},
    fetch() { networkCalls++; throw Error('Recovery must never submit input'); },
  };
  vm.createContext(ctx);
  vm.runInContext(identity + recovery, ctx);
  const input = { actorId: 'frank', baseRevision: 5, baseline: { dispatchBoard: 'saved' }, updates: { dispatchBoard: 'uncertain' } };
  records.set('frank', input);
  ctx.applyPlatformIdentity();
  assert.equal(menu.button.textContent, '下載未同步輸入', 'Restored identity must expose its persisted recovery');
  menu.button.onclick();
  assert.equal(downloads[0].name, 'unsynced-input-recovery.json');
  assert.deepEqual(JSON.parse(await blobs.get(downloads[0].href).text()), input);

  const staleClick = menu.button.onclick;
  ctx.currentUser = { id: 'qa-process-manager' };
  ctx.sync.identity = ctx.currentUser;
  staleClick();
  assert.equal(downloads.length, 1, 'Stale account button must not download under another identity');
  assert.equal(menu.button, null, 'Other identity must not inherit the original recovery menu');

  ctx.currentUser = { id: 'frank' };
  ctx.sync.identity = ctx.currentUser;
  records.delete('frank');
  ctx.applyPlatformIdentity();
  assert.equal(menu.button, null);
  records.set('frank', input);
  events.get('process-sync-status')();
  assert.equal(menu.button.textContent, '下載未同步輸入', 'A failed save must expose recovery without another login');
  const sameButton = menu.button;
  ctx.document.documentElement.lang = 'vi';
  events.get('process-language-change')();
  assert.equal(menu.button, sameButton);
  assert.equal(menu.button.textContent, 'Tải bản phục hồi');
  assert.equal(menu.button.title, 'Tải đầu vào chưa đồng bộ');
  assert.equal(menu.button.dataset.i18nSkip, 'true');

  records.set('frank', { ...input, actorId: 'another-actor' });
  menu.button.onclick();
  assert.equal(menu.button, null);
  assert.equal(downloads.length, 1, 'Mismatched recovery owner must not export');
  assert.equal(networkCalls, 0);
  console.log(JSON.stringify({ status: 'PASS', cases: [
    'automatic identity restore exposes exact persisted own recovery',
    'stale account button cannot export across identity switch',
    'new save failure exposes recovery without relogin',
    'language change updates one button in the selected language',
    'mismatched recovery owner is rejected without network or replay',
  ], networkCalls }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
