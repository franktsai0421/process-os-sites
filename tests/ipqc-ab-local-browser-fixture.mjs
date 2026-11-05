import fs from 'node:fs';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
const { fixture } = createRequire(import.meta.url)(
  '../scripts/quality-replacement-preview-fixture.cjs',
);
const read = (name) =>
  fs.readFileSync(
    new URL('../public/process/' + name, import.meta.url),
    'utf8',
  );
export async function setup({
  width = 1280,
  lang = 'zh',
  who = 'editor',
  sharedFixture = null,
  controllerHooks = false,
} = {}) {
  const master = {
    active: {
      AB: {
        products: ['A', 'B'].flatMap((line) =>
          ['1', '2'].map((n) => ({
            code: line + n,
            name: line + n,
            line,
            category: 'G',
            stages: [line + '-CUT'],
          })),
        ),
        lines: ['A', 'B'].map((code) => ({
          code,
          stages: [{ code: code + '-CUT', name: 'Cut' }],
        })),
        categoryGroups: ['A', 'B'].map((line) => ({
          line,
          name: 'G',
          defaultStages: [line + '-CUT'],
        })),
      },
    },
  };
  const f =
      sharedFixture ||
      (await fixture({ masterDataControl: JSON.stringify(master) })),
    browser = await chromium.launch({
      ...(process.env.PROCESS_TEST_CHROMIUM
        ? { executablePath: process.env.PROCESS_TEST_CHROMIUM }
        : fs.existsSync('/usr/bin/chromium')
          ? { executablePath: '/usr/bin/chromium' }
          : {}),
      headless: true,
    });
  const requests = [],
    errors = [],
    timings = [];
  let lose = null,
    missing = false,
    transform = null,
    intercept = null;
  const holds = new Set();
  async function held(phase, entry) {
    const h = [...holds].find(
      (h) => !h.used && h.phase === phase && h.predicate(entry),
    );
    if (h) {
      h.used = true;
      h.start(entry);
      await h.wait;
      holds.delete(h);
    }
  }
  const context = await browser.newContext({
      viewport: { width, height: 850 },
    }),
    page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  await context.route('**/*', async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    if (url.origin !== 'https://fixture') return route.abort();
    if (url.pathname === '/process/')
      return route.fulfill({
        contentType: 'text/html',
        body: `<!doctype html><html lang="${lang}"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${['styles.css', 'ipqc-ab.css', 'version-draft-ui.css'].map(read).join('\n')}</style><main id="data-content" data-active-tab="quality-ipqc-ab"></main></html>`,
      });
    if (
      url.pathname.startsWith('/process/') &&
      /\.(?:js|mjs)$/.test(url.pathname)
    )
      return route.fulfill({
        contentType: 'text/javascript',
        body: read(url.pathname.slice('/process/'.length)),
      });
    if (!url.pathname.startsWith('/api/'))
      return route.fulfill({ status: 404, body: 'Synthetic only' });
    const body = request.postData(),
      parsed = body && request.method() === 'POST' ? JSON.parse(body) : null,
      entry = {
        method: request.method(),
        url: url.pathname + url.search,
        body: parsed,
      };
    requests.push(entry);
    await held('request', entry);
    const intercepted = await intercept?.(entry);
    if (intercepted) return route.fulfill(intercepted);
    if (missing && url.searchParams.has('operationId'))
      return route.fulfill({
        status: 404,
        json: { error: 'OPERATION_NOT_FOUND' },
      });
    const started = performance.now(),
      handler = f.load('app' + url.pathname + '/route.ts'),
      response = await handler[request.method()](
        new Request('http://fixture' + url.pathname + url.search, {
          method: request.method(),
          headers: {
            ...f.sessions[who],
            ...(request.method() === 'PUT'
              ? { 'Content-Type': request.headers()['content-type'] }
              : {}),
          },
          ...(body
            ? {
                body:
                  request.method() === 'PUT' ? request.postDataBuffer() : body,
              }
            : {}),
        }),
      );
    entry.status = response.status;
    let bytes = await response.arrayBuffer();
    await held('response', entry);
    if (transform) {
      const next = await transform(entry, Buffer.from(bytes), f);
      if (next) {
        entry.status = next.status ?? entry.status;
        bytes = Buffer.from(JSON.stringify(next.body));
      }
    }
    timings.push({
      kind: parsed?.action || parsed?.command?.action || 'read',
      ms: performance.now() - started,
    });
    if (lose && (parsed?.action === lose || parsed?.command?.action === lose)) {
      lose = null;
      return route.abort('failed');
    }
    return route.fulfill({
      status: entry.status,
      headers: Object.fromEntries(response.headers),
      body: Buffer.from(bytes),
    });
  });
  async function boot() {
    await page.goto('https://fixture/process/');
    await page.evaluate((id) => {
      window.ProcessSync = {
        identity: { id: 'preview-' + id, name: 'Synthetic', role: 'staff' },
        _epoch: 1,
        _delivery: 1,
        identityGeneration() {
          return this._epoch;
        },
        captureDelivery() {
          return this._delivery;
        },
        isCurrentDelivery(e) {
          return e === this._delivery;
        },
        platformHeaders: () => ({ 'Content-Type': 'application/json' }),
        requiresReload: false,
      };
      window.hasPermission = () => true;
      window.state = { view: 'data', dataTab: 'quality-ipqc-ab' };
      window.ProcessIPQC = {
        referenceMarkup: () => '',
        mountReferences: async () => {},
      };
      window.toast = () => {};
      window.bindDataInner = () => {};
    }, who);
    for (const file of [
      'shared-draft-client.js',
      'version-draft-ui.js',
      'ipqc-ab.js',
    ])
      await page.addScriptTag({
        content:
          controllerHooks && file === 'ipqc-ab.js'
            ? instrument(read(file))
            : read(file),
      });
    await page.evaluate(async () => {
      await IPQCABUI.mount(document.querySelector('main'));
    });
    await page.locator('#ipqcab-line').waitFor();
  }
  try {
    await boot();
  } catch (error) {
    error.message +=
      '\nSynthetic DOM: ' +
      (await page.locator('body').innerText()) +
      '\nErrors: ' +
      JSON.stringify(errors) +
      '\nRequests: ' +
      JSON.stringify(requests);
    await browser.close();
    if (!sharedFixture) f.close();
    throw Error(error.message, { cause: error });
  }
  return {
    f,
    page,
    context,
    requests,
    errors,
    timings,
    boot,
    hold(predicate, phase = 'response') {
      let start, release;
      const started = new Promise((r) => {
          start = r;
        }),
        wait = new Promise((r) => {
          release = r;
        });
      const h = { predicate, phase, start, wait, release, used: false };
      holds.add(h);
      return { started, release };
    },
    transform(fn) {
      transform = fn;
    },
    intercept(fn) {
      intercept = fn;
    },
    lose(kind = 'save') {
      lose = kind;
      missing = true;
    },
    receipts() {
      missing = false;
    },
    async close() {
      for (const h of holds) h.release();
      await browser.close();
      if (!sharedFixture) f.close();
    },
  };
}
export const writes = (s) => s.requests.filter((r) => r.method === 'POST');
export async function addError(s, name = '本機錯誤 / Lỗi') {
  if (await s.page.locator('#ipqcab-begin').count())
    await s.page.locator('#ipqcab-begin').click();
  await s.page.locator('#ipqcab-add-error').click();
  await s.page.locator('#ab-error-name').fill(name);
  await s.page.locator('#ab-apply').click();
}
export async function addItem(s, name = '本機標準 / Tiêu chuẩn') {
  await s.page.locator('#ipqcab-add-item').click();
  await s.page.locator('#ab-standard').fill(name);
  await s.page.locator('#ab-method').fill('目視 / Quan sát');
  await s.page.locator('#ab-apply').click();
}
export async function save(s) {
  await s.page.locator('#ipqcab-save').click();
  await s.page.waitForFunction(
    () =>
      !sharedDraftAccountState().queued &&
      !document.querySelector('#ipqcab-save')?.disabled,
  );
}

// Test-only access to current controller internals. Production source is never changed.
function instrument(source) {
  const anchor = '  window.IPQCABUI = {';
  if (source.split(anchor).length !== 2) throw Error('AB_TEST_ANCHOR_CHANGED');
  return source.replace(
    anchor,
    `  window.__ABTest={
  view(){return{control,revision,working,busy,message,modal,viewer,accessBlocked,privateQuarantine,localScopes:[...localScopes.values()],localSent,localBeginReceipt,localModuleGeneration,localConflict};},
  save:saveLocalModule,query:queryLocalOperation,load,draw,start:startLocal,bind,poll:scheduleRefresh,
  command:()=>moduleTransport(),entry:()=>localEntry(),dirty:()=>localDirty(),scopes:()=>localSaveScopes(),
  set(key,value){if(key==='revision')revision=value;if(key==='modal')modal=value;if(key==='host')host=value;if(key==='client')moduleClient=value;if(key==='busy')busy=value;},
  pin(){window.__ABPin={control,revision,working,modal,localSent,entries:[...localScopes.values()]};},
  pinState(){const p=window.__ABPin;return{control:control===p.control,revision:revision===p.revision,working:working===p.working,modal:modal===p.modal,sent:localSent===p.localSent,entries:p.entries.every(e=>localScopes.get(e.scope)===e)};},
  replaceSent(){localSent={...localSent,command:{...localSent.command,operationId:crypto.randomUUID()}};},
  replaceHost(){host=host.cloneNode(true);},replaceClient(){moduleClient=null;moduleActor='';},
  switchGeneration(){if(control?.moduleDraft?.workflow)control.moduleDraft.workflow.generation='synthetic-new-generation';},
  keepBusy(){busy=true;},reset:()=>IPQCABUI.navigation.reset()
 };
` + anchor,
  );
}
