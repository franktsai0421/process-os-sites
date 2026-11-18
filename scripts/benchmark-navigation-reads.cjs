// Actual read handlers, ephemeral SQLite and Map R2. Fixed latency is synthetic.
const assert = require('node:assert/strict');
const fixture = require('./fqc-apply-fixture.cjs');
const {
  deliveryViews,
  deliveryTabs,
} = require('../public/process/delivery-purpose.mjs');
async function main() {
  const f = await fixture();
  try {
    await f.mutate((values) => {
      const users = JSON.parse(values.platformUsers);
      for (const key of Object.keys(users[0].accessOverrides))
        users[0].accessOverrides[key] = true;
      values.platformUsers = JSON.stringify(users);
      values.bomOverrides = '{"replaceAll":true,"data":{}}';
      values.routineFqcEnabled = '1';
      const master = JSON.parse(values.masterDataControl);
      master.active.C = { products: [], lines: [] };
      values.masterDataControl = JSON.stringify(master);
      const quality = JSON.parse(values.qualityMasterControl),
        version = quality.libraries.fqc.versions[0];
      version.updatedAt = '2026-01-01T00:00:00Z';
      version.snapshot.items = Array.from({ length: 80 }, (_, i) => ({
        ...version.snapshot.items[0],
        id: 'item-' + i,
        rule: { cadence: 'time', timeFrequency: 'monthly' },
      }));
      values.qualityMasterControl = JSON.stringify(quality);
      for (let i = 0; i < 16; i++)
        values['unrelated' + i] = JSON.stringify({
          notes: 'x'.repeat(8192),
          i,
        });
    });
    const delay = Number(process.env.NAV_IO_MS || 5);
    const pause = () => new Promise((resolve) => setTimeout(resolve, delay));
    f.hooks.get = pause;
    f.hooks.sql = pause;
    const routes = [
      ...Object.keys(deliveryViews).map((view) => [
        'process-bootstrap',
        '?view=' + view,
      ]),
      ...Object.keys(deliveryTabs)
        .filter((key) => !['web-feedback', 'users'].includes(key))
        .map((tab) => ['process-bootstrap', '?view=data&dataTab=' + tab]),
      ['routine-fqc', '?availability=1'],
      ['routine-fqc', ''],
    ];
    for (const [module, query] of routes) {
      const api = f.load('app/api/' + module + '/route.ts');
      for (let sample = 0; sample < 5; sample++) {
        f.events.length = 0;
        const start = performance.now();
        const response = await api.GET(
          new Request('https://fixture.invalid/api/' + module + query, {
            headers: { cookie: f.cookies.editor },
          }),
        );
        const text = await response.text();
        assert.equal(
          response.status,
          200,
          module + query + ' ' + text.slice(0, 100),
        );
        console.log(
          JSON.stringify({
            module,
            query,
            sample,
            ms: Math.round(performance.now() - start),
            bytes: Buffer.byteLength(text),
            gets: f.events.filter((e) => e.kind === 'get').length,
            db: f.events.filter((e) => e.kind === 'read').length,
          }),
        );
      }
    }
  } finally {
    f.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
