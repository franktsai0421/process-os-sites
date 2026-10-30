import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { smoke } from '../scripts/benchmark/preview-smoke.mjs';

// Two owned loopback servers, generated HTML and synthetic login fields only.
// Never start the application, connect a real account or write screenshots.
const config = {
  isolationConfirmed: true,
  account: 'synthetic',
  password: 'SENSITIVE_SENTINEL',
  expectedTitle: 'synthetic-preview',
  expectedComposition: 'synthetic-version',
  equipmentCount: 2,
  photoWidth: 640,
};
const page = (ready) => `<!doctype html><meta charset="utf-8">
<title>synthetic-preview</title><body>synthetic-preview synthetic-version 隔離合成資料
<form action="/submit" method="post"><input id="id" name="account">
<input id="password" name="password" type="password"><button class="site-entry-submit">login</button></form>
${ready ? '<div id="add-master-template">ready</div>' : ''}
<table id="equipment-panel"><tbody><tr><td>one</td></tr><tr><td>two</td></tr></tbody></table>
<div class="process-template-preview"><img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='640' height='100'%3E%3C/svg%3E"></div>
<button class="media-lightbox-zoom" aria-pressed="false" onclick="this.setAttribute('aria-pressed','true')">zoom</button>
<button class="media-lightbox-close">close</button>
<script>window.MasterDataWorkflow={shared:{flow:()=>({cases:[{status:'returned'},{status:'withdrawn'}]})}}</script>`;

async function listen(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address !== 'string');
  return `http://127.0.0.1:${address.port}`;
}

async function fixture(mode, t) {
  const observed = { requests: 0, credentialBytes: 0, primaryLoginPosts: 0 };
  const secondary = http.createServer((request, response) => {
    observed.requests++;
    request.on('data', (chunk) => { observed.credentialBytes += chunk.length; });
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(page(true));
  });
  const secondaryOrigin = await listen(secondary);
  t.after(() => new Promise((resolve, reject) => secondary.close((error) => error ? reject(error) : resolve())));
  const primary = http.createServer((request, response) => {
    const redirect = (status, location) => {
      response.writeHead(status, { Location: location });
      response.end();
    };
    if (request.url.startsWith('/login') && mode === 'GET 302') {
      redirect(302, secondaryOrigin + '/login');
      return;
    }
    if (request.url.startsWith('/login') && mode === 'same-origin chain') {
      redirect(302, '/next-hop');
      return;
    }
    if (request.url === '/next-hop') {
      redirect(307, secondaryOrigin + '/login');
      return;
    }
    if (request.url === '/submit' && request.method === 'POST') {
      observed.primaryLoginPosts++;
      request.resume();
      if (mode.startsWith('POST')) {
        redirect(Number(mode.split(' ')[1]), secondaryOrigin + '/capture');
        return;
      }
    }
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(page(request.url === '/submit'));
  });
  const origin = await listen(primary);
  t.after(() => new Promise((resolve, reject) => primary.close((error) => error ? reject(error) : resolve())));
  return { origin, observed };
}

const options = process.env.BENCHMARK_TEST_BROWSER_PATH
  ? { browserPath: process.env.BENCHMARK_TEST_BROWSER_PATH }
  : {};

await test('direct local synthetic preview completes all smoke checks', async (t) => {
  const { origin, observed } = await fixture('direct', t);
  const result = await smoke({ ...config, origin }, options);
  assert.equal(result.status, 'PASS_LOCAL_SYNTHETIC_PREVIEW');
  assert.equal(result.checks.length, 7);
  assert.deepEqual(observed, { requests: 0, credentialBytes: 0, primaryLoginPosts: 1 });
  assert(!JSON.stringify(result).includes(config.password));
});

for (const mode of ['GET 302', 'POST 307', 'POST 308', 'same-origin chain']) {
  await test(`${mode} cannot reach a second origin or forward login fields`, async (t) => {
    const { origin, observed } = await fixture(mode, t);
    await assert.rejects(smoke({ ...config, origin }, options));
    assert.deepEqual(observed, {
      requests: 0,
      credentialBytes: 0,
      primaryLoginPosts: mode.startsWith('POST') ? 1 : 0,
    });
  });
}
