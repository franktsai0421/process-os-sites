// Complete product closure and shared helpers, parsed product DOM. No browser,
// listener or external HTTP. UI binding is never replaced by a test action.
import { fixture } from './routine-fqc-durable.mjs';
import { canvasDOM } from '../../scripts/login-reentry-dom.mjs';
export function manualUI(options = {}) {
  const f = fixture(options), { document } = canvasDOM();
  document.hidden = false;
  f.box.document = document;
  f.box.location = { port: '', href: 'https://routine-fixture.invalid/process/' };
  f.win.scrollTo = () => {};
  f.win.matchMedia = () => ({ matches: false });
  f.win.skipPaint = false;
  f.remote.enabled = true;
  f.remote.catalog = { items: [], lines: [], categories: [], ...f.remote.catalog };
  for (const doc of f.remote.control.documents) {
    doc.number ||= 'SYNTHETIC-PLAN'; doc.familyId ||= doc.id; doc.flow.saves ||= [];
  }
  f.api.setData(structuredClone(f.remote));
  // Native childNodes is required by the real content-issue redraw path.
  const prototype=Object.getPrototypeOf(document.createElement('div'));
  Object.defineProperty(prototype,'childNodes',{get(){return this.children;}});
  const root = document.createElement('section'); root.id = 'routine-fqc-root';
  document.body.append(root); f.api.setRoot(root); f.api.s.selected = null;
  f.api.setHistorySearch({ html: () => '<div class="rf-history"></div>', bind() {}, update() {}, openForItem() {} });
  const paint = () => f.event('process-language-change');
  const button = (action = 'update-current') => root.querySelector('[data-action="' + action + '"]');
  paint();
  return { ...f, document, root, paint, button };
}
export const posted = f => f.calls.filter(call => call.method === 'POST').map(call => JSON.parse(call.body));
export const inputs = f => JSON.stringify({ buffers: [...f.api.s.buffers], bases: [...f.api.s.bases] });
export function dirty(f) {
  for (const doc of f.api.getData().control.documents) {
    const value = f.api.buffer(doc);
    value.notes = 'Unsent notes for ' + doc.id;
    value.title = 'Unsent title for ' + doc.id;
    value.evidence = ['unsent-photo-reference'];
  }
  return inputs(f);
}
export function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
