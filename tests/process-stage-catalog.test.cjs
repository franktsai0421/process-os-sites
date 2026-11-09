/* oxlint-disable typescript/no-require-imports -- isolated production TypeScript loader. */
const test = require('node:test'),
  assert = require('node:assert/strict');
const load = require('../scripts/ipqc-ab-import-harness.cjs')();
const link = load('lib/master-stage-link.ts'),
  copy = (v) => JSON.parse(JSON.stringify(v));
const custom = {
  id: 'A-CUT-CUSTOM-one',
  catalogKey: 'custom-one',
  name: '特別流程',
  editorType: 'custom',
  mode: 'human',
  people: 2,
  machineIds: [],
  mediaItems: [
    { src: 'master/photos/synthetic', name: 'fixture.png', type: 'image/png' },
  ],
};
const machine = {
  ...custom,
  id: 'A-CUT-CUSTOM-two',
  catalogKey: 'custom-two',
  name: '特別機器',
  editorType: 'machine',
  mode: 'machine',
  machineIds: ['old-stage-machine'],
};
function root(templates = [custom, machine]) {
  const process = {
    'A-CUT': [...link.stageDefaultTemplates('A-CUT'), ...copy(templates)],
  };
  return {
    active: {
      AB: { lines: [{ code: 'A', stages: [{ code: 'A-CUT', name: '切割' }] }] },
      C: { lines: [] },
      PROCESS: process,
    },
    versions: [
      {
        id: 'process-active',
        scope: 'PROCESS',
        status: 'approved',
        number: 1,
        snapshot: copy(process),
      },
    ],
  };
}
function prepare(r) {
  return link.stageProcessLink(
    r,
    'AB',
    {
      lines: [
        {
          code: 'A',
          stages: [
            { code: 'A-CUT', name: '切割' },
            { code: 'A-NEW', name: '新工段' },
          ],
        },
      ],
    },
    {},
  );
}
void test('new stage inherits approved catalog types with distinct IDs and preserves source', () => {
  const r = root(),
    before = copy(r),
    fixed = prepare(r),
    rows = fixed.content['A-NEW'];
  assert.deepEqual(copy(r), before);
  for (const source of [custom, machine]) {
    const row = rows.find((t) => t.catalogKey === source.catalogKey);
    assert.ok(row);
    assert.notEqual(row.id, source.id);
    assert.equal(row.name, source.name);
    assert.equal(row.editorType, source.editorType);
    assert.deepEqual(copy(row.mediaItems), source.mediaItems);
    assert.deepEqual(copy(row.machineIds), []);
  }
  assert.equal(new Set(rows.map((t) => t.id)).size, rows.length);
  assert.deepEqual(
    copy(fixed.content['A-CUT']),
    before.active.PROCESS['A-CUT'],
  );
  assert.equal(fixed.baseVersionId, 'process-active');
});
void test('no custom catalog type adds one explicit custom choice to the new stage', () => {
  const r = root([]),
    fixed = prepare(r),
    customs = fixed.content['A-NEW'].filter((t) => t.editorType === 'custom');
  assert.equal(customs.length, 1);
  assert.equal(customs[0].name, '自訂');
  assert.deepEqual(copy(customs[0].mediaItems), []);
  assert.equal(r.active.PROCESS['A-CUT'].length, 5);
});
void test('catalog membership across approved stages deduplicates stable keys', () => {
  const r = root();
  r.active.PROCESS['B-PACK'] = [
    ...link.stageDefaultTemplates('B-PACK'),
    { ...copy(custom), id: 'B-PACK-CUSTOM-one' },
    {
      ...copy(custom),
      catalogKey: 'custom-third',
      id: 'B-PACK-third',
      name: '包裝',
    },
  ];
  r.versions[0].snapshot = copy(r.active.PROCESS);
  const rows = prepare(r).content['A-NEW'];
  assert.equal(
    rows.filter((t) => t.catalogKey === custom.catalogKey).length,
    1,
  );
  assert.ok(rows.some((t) => t.catalogKey === 'custom-third'));
});
void test('divergent values for one global catalog key fail before producing a review case', () => {
  const r = root();
  r.active.PROCESS['B-PACK'] = [
    { ...copy(custom), id: 'B-copy', name: '不同名稱' },
  ];
  r.versions[0].snapshot = copy(r.active.PROCESS);
  assert.throws(() => prepare(r), /PROCESS_CATALOG_TEMPLATE_CONFLICT/);
});
void test('working-only templates never enter linked approved content', () => {
  const r = root();
  r.workflowScopes = {
    PROCESS: {
      active: { content: copy(r.active.PROCESS) },
      working: {
        ...copy(r.active.PROCESS),
        'A-CUT': [
          ...r.active.PROCESS['A-CUT'],
          { ...copy(custom), catalogKey: 'not-approved', id: 'unsaved' },
        ],
      },
      pendingId: null,
      cases: [],
    },
  };
  assert.throws(() => prepare(r), /PROCESS_TEMPLATE_SCOPE_BUSY/);
});
void test('linked source change still rejects approval without activating or deleting content', () => {
  const r = root(),
    fixed = prepare(r);
  r.active.PROCESS['A-CUT'][0].name = 'after preview';
  assert.throws(
    () =>
      link.activateStageProcessLink(
        r,
        fixed,
        'case',
        { id: 'reviewer', name: '審核者' },
        'fixture',
      ),
    /PROCESS_SOURCE_VERSION_CHANGED/,
  );
  assert.equal(r.active.PROCESS['A-NEW'], undefined);
});
void test('approval activates exact pinned new types while retaining old references', () => {
  const r = root(),
    fixed = prepare(r);
  link.activateStageProcessLink(
    r,
    fixed,
    'case',
    { id: 'reviewer', name: '審核者' },
    'fixture',
  );
  assert.deepEqual(r.active.PROCESS, fixed.content);
  assert.equal(
    r.active.PROCESS['A-CUT'].find((t) => t.catalogKey === custom.catalogKey)
      .id,
    custom.id,
  );
  assert.equal(r.versions.at(-1).status, 'approved');
});

void test('stage and catalog delimiters cannot produce duplicate template IDs', () => {
  const approved = {
    'A-CUT': [
      { ...copy(custom), catalogKey: 'x-CATALOG-y' },
      { ...copy(custom), catalogKey: 'y' },
    ],
  };
  const a = link
    .stageCatalogTemplates('A', approved)
    .filter((t) => t.catalogKey);
  const b = link
    .stageCatalogTemplates('A-CATALOG-x', approved)
    .filter((t) => t.catalogKey);
  assert.equal(
    new Set([...a, ...b].map((t) => t.id)).size,
    a.length + b.length,
  );
});
void test('unkeyed legacy content remains at its source and is not guessed to be a global type', () => {
  const legacy = { ...copy(custom), id: 'legacy-local' };
  delete legacy.catalogKey;
  const r = root([legacy]),
    before = copy(r.active.PROCESS),
    fixed = prepare(r);
  assert.deepEqual(copy(fixed.content['A-CUT']), before['A-CUT']);
  assert.ok(!fixed.content['A-NEW'].some((t) => t.id === legacy.id));
  assert.ok(fixed.content['A-NEW'].some((t) => t.editorType === 'custom'));
});

void test('approved preset names and explicit empty media survive new-stage creation', () => {
  const r = root([]),
    original = r.active.PROCESS['A-CUT'].find((t) => t.presetKey === 'entry');
  original.name = '核准的進站';
  original.media = null;
  original.mediaName = '';
  original.mediaType = '';
  original.mediaItems = [];
  r.versions[0].snapshot = copy(r.active.PROCESS);
  const before = copy(r.active.PROCESS),
    fixed = prepare(r);
  const inherited = fixed.content['A-NEW'].find((t) => t.presetKey === 'entry');
  assert.equal(inherited.name, original.name);
  assert.equal(inherited.media, null);
  assert.deepEqual(copy(inherited.mediaItems), []);
  assert.notEqual(inherited.id, original.id);
  assert.deepEqual(copy(r.active.PROCESS), before);
});
void test('preset machine metadata is inherited while per-stage equipment stays local', () => {
  const r = root([]);
  r.active.PROCESS['B-PACK'] = copy(link.stageDefaultTemplates('B-PACK'));
  for (const [stage, rows] of Object.entries(r.active.PROCESS)) {
    const machine = rows.find((t) => t.presetKey === 'machine-assembly');
    machine.name = '已核准機器流程';
    machine.equipment = [
      { id: stage + '-equipment', line: stage[0], stageCode: stage },
    ];
    machine.machineIds = [stage + '-selected'];
  }
  r.versions[0].snapshot = copy(r.active.PROCESS);
  const inherited = prepare(r).content['A-NEW'].find(
    (t) => t.presetKey === 'machine-assembly',
  );
  assert.equal(inherited.name, '已核准機器流程');
  assert.deepEqual(copy(inherited.equipment), []);
  assert.deepEqual(copy(inherited.machineIds), []);
});
void test('conflicting approved preset catalog values refuse instead of choosing a stage arbitrarily', () => {
  const r = root([]);
  r.active.PROCESS['B-PACK'] = copy(link.stageDefaultTemplates('B-PACK'));
  r.active.PROCESS['B-PACK'][0].name = '另一份進站';
  r.versions[0].snapshot = copy(r.active.PROCESS);
  assert.throws(() => prepare(r), /PROCESS_CATALOG_TEMPLATE_CONFLICT/);
});

void test('legacy scalar preset media retains absence and never gains a fallback image', () => {
  for (const media of [null, 'master/photos/legacy-fixture']) {
    const r = root([]),
      entry = r.active.PROCESS['A-CUT'][0];
    entry.media = media;
    entry.mediaName = 'legacy.png';
    entry.mediaType = 'image/png';
    delete entry.mediaItems;
    r.versions[0].snapshot = copy(r.active.PROCESS);
    const inherited = prepare(r).content['A-NEW'].find(
      (t) => t.presetKey === 'entry',
    );
    assert.equal(inherited.media, media);
    assert.equal(Object.hasOwn(inherited, 'mediaItems'), false);
  }
});
