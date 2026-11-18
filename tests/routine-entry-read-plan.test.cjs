const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const fixture = require('../scripts/fqc-apply-fixture.cjs');
const loader = require('../scripts/fqc-bootstrap-projection-fixture.cjs');
const route = 'app/api/routine-fqc/route.ts';
const predecessor = '8c94a7776ddbdf216e9f85b4c2cd7dd111634752';
const oldSource = execFileSync('git', ['show', predecessor + ':' + route], {
  encoding: 'utf8',
});

for (const format of ['inline', 'records']) {
  void test(
    format +
      ' routine entry preserves complete GETs and fails closed on required data',
    async (t) => {
      const f = await fixture({ format });
      t.after(() => f.close());
      await f.mutate((values) => {
        const users = JSON.parse(values.platformUsers);
        users[0].accessOverrides['routine.view'] = true;
        values.platformUsers = JSON.stringify(users);
        values.routineFqcEnabled = '1';
        const quality = JSON.parse(values.qualityMasterControl);
        const active = quality.libraries.fqc.versions[0];
        active.updatedAt = '2026-01-01T00:00:00Z';
        const historical = structuredClone(active);
        historical.id = 'old';
        historical.status = 'superseded';
        historical.snapshot.items[0].description = 'historical only';
        quality.libraries.fqc.versions.unshift(historical);
        values.qualityMasterControl = JSON.stringify(quality);
        values.unrelatedEntryTest = JSON.stringify({
          name: 'unrelated fixture',
        });
      });
      const root = path.resolve(__dirname, '..');
      const before = loader(root, f.env, {}, { [route]: oldSource }).load(
        route,
      );
      const after = f.load(route);
      const read = async (api, query = '', actor = 'editor') => {
        const r = await api.GET(
          new Request('https://fixture.invalid/api/routine-fqc' + query, {
            headers: { cookie: f.cookies[actor] },
          }),
        );
        return { status: r.status, body: await r.json() };
      };
      const snapshot = () =>
        f.db.prepare('SELECT revision,"values" FROM shared_state').get();
      const original = snapshot();
      const page = await read(before),
        availability = await read(before, '?availability=1');
      assert.equal(page.status, 200);
      assert.deepEqual(availability, { status: 200, body: { enabled: true } });
      assert.deepEqual(await read(after), page);
      assert.deepEqual(await read(after, '?availability=1'), availability);
      assert.equal((await read(after, '', 'other')).status, 403);
      if (format === 'records') {
        const refs = JSON.parse(original.values).__processRecords.values;
        const unrelated = refs.unrelatedEntryTest.key,
          quality = refs.qualityMasterControl.key,
          bytes = f.objects.get(quality);
        const versions = JSON.parse(bytes.toString()).libraries.fqc.versions;
        const archived = versions.find((row) => row.id === 'old').snapshot
          .__immutableBody.key;
        const active = versions.find((row) => row.status === 'approved')
          .snapshot.__immutableBody.key;
        assert.notEqual(active, archived);
        f.hooks.get = (key) => {
          if (key === unrelated || key === archived)
            throw Error('unrelated read');
        };
        assert.deepEqual(await read(after), page);
        f.objects.set(quality, Buffer.from('invalid'));
        assert.deepEqual(await read(after, '?availability=1'), availability);
        assert.equal((await read(after)).status, 503);
        f.objects.set(quality, bytes);
        const content = f.objects.get(active);
        f.objects.delete(active);
        assert.equal((await read(after)).status, 503);
        f.objects.set(active, content);
        assert.deepEqual(await read(after), page);
        // Revocation during immutable object I/O must win over any late success.
        f.hooks.get = (key) => {
          if (key === quality) {
            f.hooks.get = null;
            f.revoke();
          }
        };
        assert.equal((await read(after)).status, 401);
      }
      assert.deepEqual(snapshot(), original);
    },
  );
}

for (const query of ['', '?availability=1']) {
  void test(
    'routine entry fences late revocation and revision drift ' +
      (query || 'full'),
    async (t) => {
      const f = await fixture();
      t.after(() => f.close());
      await f.mutate((values) => {
        const users = JSON.parse(values.platformUsers);
        users[0].accessOverrides['routine.view'] = true;
        values.platformUsers = JSON.stringify(users);
        values.routineFqcEnabled = '1';
        const library = JSON.parse(values.qualityMasterControl);
        library.libraries.fqc.versions[0].updatedAt = '2026-01-01T00:00:00Z';
        values.qualityMasterControl = JSON.stringify(library);
      });
      const get = (suffix = query, cookie = f.cookies.editor) =>
        f
          .load(route)
          .GET(
            new Request('https://synthetic.invalid/api/routine-fqc' + suffix, {
              headers: { cookie },
            }),
          );
      f.events.length = 0;
      const ok = await get();
      assert.equal(ok.status, 200);
      assert.equal(
        f.events.filter(
          (e) =>
            e.kind === 'read' && e.sql.includes('process_revoked_sessions'),
        ).length,
        2,
      );
      assert.equal(
        f.events.filter(
          (e) => e.kind === 'read' && e.sql.startsWith('SELECT revision FROM'),
        ).length,
        1,
      );
      assert.equal((await get(query, '')).status, 401);
      assert.equal((await get(query, f.cookies.other)).status, 403);
      // Noncanonical entry URLs that reach the handler still use the original evaluator.
      assert.equal((await get('/' + query)).status, 200);
      f.hooks.sql = (statement) => {
        if (statement.startsWith('SELECT revision FROM')) {
          f.hooks.sql = null;
          f.db
            .prepare('UPDATE shared_state SET revision=revision+1 WHERE id=1')
            .run();
        }
      };
      const changed = await get();
      assert.equal(changed.status, 409);
      assert.deepEqual(await changed.json(), {
        error: 'CONCURRENT_CHANGE_RETRY',
      });
      assert.equal((await get()).status, 200);
      let revocationReads = 0;
      f.hooks.sql = (statement) => {
        if (
          statement.includes('process_revoked_sessions') &&
          ++revocationReads === 2
        )
          f.revoke();
      };
      const revoked = await get();
      assert.equal(revoked.status, 401);
      assert.deepEqual(await revoked.json(), { error: 'LOGIN_REQUIRED' });
    },
  );
}
