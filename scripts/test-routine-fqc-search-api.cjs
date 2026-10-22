/* Actual route permission gates; synthetic SQLite/R2, no listener. */
(async () => {
  const fs = await import('node:fs'),
    path = await import('node:path'),
    assert = await import('node:assert/strict'),
    { DatabaseSync } = await import('node:sqlite'),
    { randomUUID } = await import('node:crypto');
  const db = new DatabaseSync(':memory:'),
    objects = new Map();
  for (const file of fs
    .readdirSync('drizzle')
    .filter((f) => f.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b)))
    db.exec(fs.readFileSync(path.join('drizzle', file), 'utf8'));
  const env = {
      PROCESS_SESSION_SECRET: randomUUID(),
      DB: {
        prepare(sql) {
          let args = [];
          return {
            bind(...a) {
              args = a;
              return this;
            },
            async first() {
              return db.prepare(sql).get(...args) || null;
            },
            async run() {
              return {
                meta: { changes: Number(db.prepare(sql).run(...args).changes) },
              };
            },
          };
        },
      },
      STATE_ARCHIVE: {
        async get(key) {
          const b = objects.get(key);
          return b
            ? {
                text: async () => b.toString(),
                arrayBuffer: async () =>
                  b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength),
              }
            : null;
        },
        async head(key) {
          return objects.has(key) ? {} : null;
        },
        async put(key, value) {
          objects.set(key, Buffer.from(value));
        },
      },
    },
    load = (await import('./ipqc-ab-import-harness.cjs')).default(env),
    core = load('lib/process-state.ts'),
    route = load('app/api/routine-fqc/route.ts'),
    user = {
      id: 'fixture',
      name: 'Fixture',
      role: 'staff',
      enabled: true,
      inheritRole: false,
      accessOverrides: {
        'routine.view': true,
        'routine.edit': false,
        'routine.save': false,
        'routine.submit': false,
        'routine.withdraw': false,
        'routine.approve': false,
        'routine.return': false,
        'routine.create': false,
        'routine.delete': false,
      },
    },
    values = {
      platformUsers: JSON.stringify([user]),
      routineFqcEnabled: '1',
      sentinel: 'preserved',
    };
  db.prepare(
    'INSERT INTO shared_state(id,revision,"values",updated_at) VALUES(1,1,?,?)',
  ).run(JSON.stringify(values), 'fixture');
  const url = 'http://fixture/api/routine-fqc',
    cookie =
      'process_demo=' +
      (await core.demoSession(new Request(url), 'fixture', false));
  const get = async (path, authenticated = true) =>
    route.GET(
      new Request(url + path, {
        headers: authenticated ? { Cookie: cookie } : {},
      }),
    );
  assert.equal((await get('?search-preview=1', false)).status, 401);
  user.accessOverrides['routine.settings'] = false;
  values.platformUsers = JSON.stringify([user]);
  db.prepare('UPDATE shared_state SET "values"=?').run(JSON.stringify(values));
  assert.equal(
    (await get('?preview=1')).status,
    403,
    'existing schedule settings gate remains',
  );
  const viewOnly = await (await get('')).json();
  assert.equal(viewOnly.permissions.view, true);
  for (const op of [
    'edit',
    'save',
    'submit',
    'withdraw',
    'approve',
    'return',
    'settings',
  ])
    assert.equal(viewOnly.permissions[op], false, 'view-only has no ' + op);
  const before = db.prepare('SELECT revision,"values" FROM shared_state').get(),
    objectCount = objects.size;
  const preview = await get('?search-preview=1');
  assert.equal(preview.status, 200);
  assert.deepEqual((await preview.json()).jobs, []);
  assert.deepEqual(
    db.prepare('SELECT revision,"values" FROM shared_state').get(),
    before,
  );
  assert.equal(
    objects.size,
    objectCount,
    'GET does not create backups or objects',
  );

  const model = load('lib/routine-fqc.ts'),
    today = model.companyDate(),
    year = +today.slice(0, 4),
    futureDate = year + 1 + '-01-01';
  const item = (id, frequency, extra = {}) => ({
    id,
    name: id,
    checkNo: id,
    line: 'A',
    category: 'QA',
    isEnabled: true,
    productCodes: ['QA-A'],
    rule: { cadence: 'time', timeFrequency: frequency },
    ...extra,
  });
  const lib = {
    activeVersionId: 'formal',
    versions: [
      {
        id: 'formal',
        number: 1,
        status: 'approved',
        reviewedAt: today + 'T00:00:00Z',
        snapshot: {
          errors: [],
          items: [
            item('monthly', 'monthly'),
            item('unknown', 'custom'),
            item('disabled', 'monthly', { isEnabled: false }),
            item('deleted', 'weekly', { isDeleted: true }),
          ],
        },
      },
      {
        id: 'pending',
        number: 2,
        status: 'pending',
        snapshot: { errors: [], items: [item('pending-only', 'monthly')] },
      },
    ],
  };
  values.qualityMasterControl = JSON.stringify({ libraries: { fqc: lib } });
  const routine = model.emptyRoutine();
  routine.startDate = today;
  values.routineFqcControl = JSON.stringify(routine);
  const persist = () =>
    db
      .prepare('UPDATE shared_state SET "values"=?')
      .run(JSON.stringify(values));
  persist();
  let body = await (await get('?search-preview=1')).json();
  assert.deepEqual(
    body.jobs.map((j) => j.itemId),
    ['monthly'],
  );
  assert.ok(body.jobs[0].start > today);
  assert.deepEqual(
    body.unresolved.map((s) => s.id),
    ['unknown'],
  );
  const readonlyBefore = db
    .prepare('SELECT revision,"values" FROM shared_state')
    .get();
  const archiveBefore = objects.size;
  await get('?search-preview=1');
  assert.deepEqual(
    db.prepare('SELECT revision,"values" FROM shared_state').get(),
    readonlyBefore,
  );
  assert.equal(objects.size, archiveBefore);
  lib.versions[0].reviewedAt = futureDate + 'T00:00:00Z';
  values.qualityMasterControl = JSON.stringify({ libraries: { fqc: lib } });
  persist();
  body = await (await get('?search-preview=1')).json();
  assert.equal(body.jobs[0].start, futureDate);
  routine.jobs = body.jobs;
  values.routineFqcControl = JSON.stringify(routine);
  persist();
  body = await (await get('?search-preview=1')).json();
  assert.equal(body.jobs[0].previewExisting, true);
  assert.equal(body.jobs.length, 1);
  console.log(
    'PASS populated search-preview: formal-only, next period, future effective date, disabled/deleted/custom exclusions, existing future job, repeated zero writes',
  );
  user.accessOverrides['routine.view'] = false;
  values.platformUsers = JSON.stringify([user]);
  db.prepare('UPDATE shared_state SET "values"=?').run(JSON.stringify(values));
  assert.equal(
    (await get('?search-preview=1')).status,
    403,
    'server rejects no-view users',
  );
  console.log(
    'PASS actual FQC search-preview route: authenticated view-only allowed, no-view denied, settings gate unchanged, zero writes',
  );
  db.close();
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
