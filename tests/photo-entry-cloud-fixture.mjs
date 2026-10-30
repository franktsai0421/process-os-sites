import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { createRootEntryFixture } from './root-entry-native-fixture.mjs';
export async function createPhotoEntryFixture() {
  const fixture = await createRootEntryFixture({
    syntheticBindings: {
      PROCESS_IMPORT_ENABLED: '0',
      PROCESS_SESSION_SECRET: randomBytes(32).toString('hex'),
      PROCESS_SESSION_REVOCATION_ENABLED: '0',
      WEB_FEEDBACK_ENABLED: '1',
    },
  });
  const load = createRequire(import.meta.url)(
    '../scripts/ipqc-ab-import-harness.cjs',
  )({ STATE_ARCHIVE: await fixture.mf.getR2Bucket('STATE_ARCHIVE') });
  const at = '2026-10-29T00:00:00.000Z',
    version = (id, snapshot) => ({
      id,
      number: 1,
      status: 'approved',
      revision: 0,
      snapshot,
      baseVersionId: null,
      creatorId: 'frank',
      creatorName: 'Synthetic Photo QA',
      createdAt: at,
      updatedAt: at,
      history: [],
    });
  const control = (id, snapshot, extra = {}) => ({
    schemaVersion: 1,
    activeVersionId: id,
    versions: [version(id, snapshot)],
    ...extra,
  });
  const catalog = (line, code) => ({
    products: [
      {
        code,
        name: 'Synthetic Product',
        category: 'G1',
        line,
        unit: 'pcs',
        stages: [line + '-CUT'],
      },
    ],
    lines: [
      {
        code: line,
        name: 'Synthetic line',
        stages: [
          {
            code: line + '-CUT',
            name: 'Synthetic stage',
            machine: 'fixture',
            assetNumber: 'PHOTO-QA',
            operators: 1,
          },
        ],
      },
    ],
    categoryGroups: [{ line, name: 'G1' }],
  });
  const template = (stage) => [
    {
      id: stage + '-manual',
      presetKey: 'manual',
      presetVersion: 'existing',
      name: 'Synthetic operation',
      mode: 'human',
      mediaItems: [],
    },
    {
      id: stage + '-machine',
      presetKey: 'machine-assembly',
      presetVersion: 'existing',
      name: 'Synthetic machine',
      mode: 'machine',
      mediaItems: [],
      equipment: [
        {
          id: 'process-equipment-' + stage,
          number: 'QA-EQ',
          name: 'Photo fixture equipment',
          nameVi: 'Thiết bị ảnh',
          line: stage[0],
          stageCode: stage,
          kind: 'machine-assembly',
          machineType: 'fixture',
          purpose: 'test',
          note: '',
          mediaItems: [],
        },
      ],
    },
  ];
  const active = {
    AB: catalog('A', 'P1'),
    C: catalog('C', 'C1'),
    PROCESS: { 'A-CUT': template('A-CUT'), 'C-CUT': template('C-CUT') },
  };
  const fqc = {
    errors: [
      {
        id: 'fqc-error',
        code: 'G1-FQC-L1',
        name: 'Synthetic photo check',
        line: 'A',
        category: 'G1',
        isDeleted: false,
      },
    ],
    items: [
      {
        id: 'fqc-item',
        checkNo: 'G1-FQC-L1-01',
        name: 'Synthetic label',
        description: 'Read nameplate',
        errorId: 'fqc-error',
        line: 'A',
        category: 'G1',
        isDeleted: false,
        isEnabled: true,
        tool: 'Visual',
        equipmentId: null,
        equipmentSnapshot: null,
        mediaItems: [],
        productCodes: ['P1'],
        rule: { cadence: 'batch', batchKind: 'aql', aqlValue: '0.25' },
      },
    ],
  };
  const iqc = {
    categories: [{ id: 'cat', nameVi: 'Linh kiện' }],
    suppliers: [{ id: 'sup', nameVi: 'Nhà cung cấp' }],
    parts: [
      {
        id: 'part',
        code: 'P1',
        nameVi: 'Chi tiết',
        specificationVi: '10 mm',
        categoryId: 'cat',
        supplierIds: ['sup'],
        supplierRaw: '',
        standardCode: '',
        photos: [],
      },
    ],
    errors: [
      { id: 'error', code: 'P1-IQC-L1', partCode: 'P1', nameVi: 'Kích thước' },
    ],
    items: [
      {
        id: 'item',
        partCode: 'P1',
        errorId: 'error',
        checkNo: 'P1-IQC-L1-01',
        nameVi: 'Chiều dài',
        toolVi: '',
        methodVi: 'Đo chiều dài',
        frequencyRaw: '',
        rules: [{ id: 'rule', cadence: 'batch', kind: 'aql', value: '0.25' }],
        isEnabled: true,
        inspectionMode: 'visual',
        equipmentId: '',
        mediaItems: [],
      },
    ],
  };
  const ab = {
    errors: [
      {
        id: 'ab-error',
        code: 'A-G1-CUT-L1',
        line: 'A',
        group: 'G1',
        stageCode: 'A-CUT',
        name: 'Synthetic AB',
        sourceRows: [],
        deleted: false,
      },
    ],
    items: [
      {
        id: 'ab-item',
        code: 'A-G1-CUT-L1-01',
        errorId: 'ab-error',
        standard: '10 mm',
        methodText: 'Read label',
        inspectionMode: 'visual',
        equipmentId: '',
        equipmentSnapshot: null,
        isEnabled: true,
        rules: [{ id: 'rule', cadence: 'batch', kind: 'aql', value: '0.25' }],
        standardPhotos: [],
        methodPhotos: [],
        productCodes: ['P1'],
        sourceRows: [],
        sourceTool: '',
        sourceMethod: '',
        sourceFrequency: '',
        reason: '',
        deleted: false,
      },
    ],
  };
  const c = {
    errors: [
      {
        id: 'c-error',
        code: 'C-C1-CUT-L1',
        productCode: 'C1',
        stageCode: 'C-CUT',
        name: 'Synthetic C',
        note: '',
        reason: '',
        deleted: false,
      },
    ],
    items: [
      {
        id: 'c-item',
        code: 'C-C1-CUT-L1-01',
        errorId: 'c-error',
        productCode: 'C1',
        stageCode: 'C-CUT',
        standard: '10 mm',
        cpkEnabled: false,
        standardEnabled: true,
        description: 'Read label',
        tool: 'Visual',
        method: 'Read',
        frequency: '',
        rule: { cadence: 'batch', batchKind: 'aql', aqlValue: '0.25' },
        note: '',
        reason: '',
        mediaItems: [],
        deleted: false,
      },
    ],
  };
  const eqVersion = {
    ...version('eq-active', {}),
    categories: [{ id: 'eq-cat', code: 'QA', name: 'Synthetic QA' }],
    subcategories: [
      { id: 'eq-sub', categoryId: 'eq-cat', name: 'Synthetic sub' },
    ],
    groups: [
      {
        id: 'eq-group',
        categoryId: 'eq-cat',
        subcategoryId: 'eq-sub',
        name: 'Synthetic group',
        spec: '10mm',
      },
    ],
    equipment: [
      {
        id: 'eq-one',
        assetCode: 'QA-001',
        unit: '個',
        quantity: 1,
        pieceMark: '001',
        groupId: 'eq-group',
        categoryId: 'eq-cat',
        subcategoryId: 'eq-sub',
        name: 'Synthetic gauge',
        nameVi: 'Dụng cụ kiểm tra',
        calibrationMethod: 'visual',
        calibratedAt: '2026-01-01',
        expiresAt: '2027-01-01',
        enabled: true,
        confirmed: true,
      },
    ],
    issues: [],
  };
  delete eqVersion.snapshot;
  const tool = {
    categories: [{ id: 'tool-cat', code: 'QA', nameVi: 'Dụng cụ' }],
    custodians: [{ id: 'holder', code: 'QA', nameVi: 'Kho' }],
    suppliers: [],
    manufacturers: [],
    tools: [
      {
        id: 'tool-one',
        code: 'QA-001',
        nameVi: 'Dụng cụ ảnh',
        nameZh: '照片測試器具',
        categoryId: 'tool-cat',
        assetCode: 'PHOTO-001',
        specification: '10mm',
        quantity: 1,
        unit: 'pcs',
        manufacturerId: '',
        location: { kind: 'internal', holderId: 'holder' },
        inboundDate: '2026-01-01',
        inboundDateLost: false,
        enabled: true,
        inactiveReason: '',
        archived: false,
        archiveReason: '',
        notes: 'Synthetic only',
        frequencyMonths: 12,
        photos: [],
        iqcIds: [],
      },
    ],
    transfers: [],
  };
  const op = {
    id: 'photo-operation',
    number: 'A-01',
    name: 'Photo operation',
    stageCode: 'A-CUT',
    editorType: 'manual',
    templateId: 'A-CUT-manual',
    productCodes: ['P1'],
    nextIds: [],
    machineIds: [],
    instructionSteps: [],
    mediaItems: [],
  };
  const content = {
    workspaces: [
      {
        id: JSON.stringify(['G1', 'A']),
        line: 'A',
        category: 'G1',
        stages: { 'A-CUT': [op] },
      },
    ],
  };
  const password = 'Synthetic-photo-qa-29102026';
  const values = {
    platformUsers: JSON.stringify([
      {
        id: 'frank',
        name: 'Synthetic Photo QA',
        role: 'admin',
        enabled: true,
        authMode: 'platform',
        authEpoch: 1,
        password,
      },
    ]),
    backupSettings: '{"enabled":false}',
    masterDataControl: JSON.stringify({
      active,
      versions: Object.entries(active).map(([scope, snapshot]) => ({
        ...version('master-' + scope, snapshot),
        scope,
      })),
    }),
    processMasterData: JSON.stringify(active.PROCESS),
    processAuthoringControl: JSON.stringify({
      ...control('authoring-active', content),
      workflow: load('lib/shared-draft.ts').createSharedDraft(
        'process:platform',
        content,
        'authoring-active',
        'photo-generation',
      ),
    }),
    qualityMasterControl: JSON.stringify({
      schemaVersion: 1,
      libraries: { fqc: control('fqc-active', fqc) },
    }),
    iqcMasterControl: JSON.stringify(
      control('iqc-active', iqc, {
        issues: [],
        reservedErrorCodes: [],
        reservedCheckNos: [],
      }),
    ),
    ipqcABMasterControl: JSON.stringify({
      schemaVersion: 1,
      scopes: {
        'A:G1': {
          line: 'A',
          group: 'G1',
          activeVersionId: 'ab-active',
          versions: [version('ab-active', ab)],
        },
      },
      source: null,
      reservedErrorCodes: [],
      reservedItemCodes: [],
    }),
    ipqcCMasterControl: JSON.stringify(
      control('c-active', c, {
        source: null,
        reservedErrorCodes: [],
        reservedItemCodes: [],
      }),
    ),
    routineEquipmentControl: JSON.stringify({
      schemaVersion: 1,
      activeVersionId: 'eq-active',
      versions: [eqVersion],
      source: null,
      issues: [],
      reservedMarks: {},
    }),
    toolingMasterControl: JSON.stringify(
      control('tool-active', tool, { reservedCodes: {} }),
    ),
    routineFqcEnabled: '1',
    routineFqcControl: JSON.stringify(
      load('lib/routine-fqc.ts').emptyRoutine(),
    ),
    bomOverrides: '{"replaceAll":true,"data":{}}',
    dispatchBoard: '{"A":[],"B":[],"C":[]}',
  };
  const routine = load('lib/routine-fqc.ts').emptyRoutine();
  const source = {
    id: 'fqc-item',
    name: 'Synthetic label',
    code: 'G1-FQC-L1-01',
    line: 'A',
    category: 'G1',
    errorCode: 'G1-FQC-L1',
    description: 'Read nameplate',
    versionId: 'fqc-active',
    version: '1',
    effectiveDate: at,
    frequency: null,
    frequencyText: '',
    products: [{ code: 'P1', name: 'Synthetic Product' }],
  };
  routine.jobs = [
    {
      id: 'photo-job',
      itemId: source.id,
      period: '2026-10',
      start: '2026-10-01',
      end: '2026-10-31',
      source,
      planId: null,
      completion: null,
      createdAt: at,
    },
  ];
  for (const kind of ['report', 'waiver', 'disposal']) {
    const id = 'photo-' + kind,
      c = {
        title: 'Synthetic ' + kind,
        date: '2026-10-29',
        notes: '',
        reason: 'Synthetic evidence',
        disposition: 'Synthetic only',
        evidence: [],
        lines: [
          {
            id: 'photo-line',
            jobId: 'photo-job',
            source,
            results:
              kind === 'report'
                ? [
                    {
                      id: 'photo-result',
                      samples: ['P1'],
                      outcome: 'pass',
                      value: '10 mm',
                      notes: '',
                      photos: [],
                    },
                  ]
                : [],
          },
        ],
      };
    const flow = load('lib/shared-draft.ts').createSharedDraft(
      'routine-fqc:' + id,
      c,
      null,
      'photo-' + kind + '-generation',
    );
    flow.active.content = { ...c, lines: [] };
    routine.documents.push({
      id,
      number: 'PHOTO-' + kind,
      kind,
      planId: null,
      caseId: null,
      correctionOf: null,
      createdAt: at,
      owner: { id: 'frank', name: 'Synthetic Photo QA', admin: true },
      flow,
    });
  }
  values.routineFqcControl = JSON.stringify(routine);
  const encoded = await load('lib/state-records.ts').encodeRecordValues(
    await fixture.mf.getR2Bucket('STATE_ARCHIVE'),
    values,
  );
  await fixture.db
    .prepare(
      'INSERT INTO shared_state(id,revision,"values",updated_at) VALUES(1,1,?,?)',
    )
    .bind(encoded, at)
    .run();
  await fixture.db
    .prepare(
      'INSERT INTO web_feedback_store(id,revision,payload) VALUES(1,0,?)',
    )
    .bind(
      JSON.stringify({
        issues: [],
        attachments: [],
        batches: [],
        handoffs: [],
      }),
    )
    .run();
  return {
    ...fixture,
    password,
    async readValues() {
      const row = await fixture.db
        .prepare('SELECT "values" FROM shared_state WHERE id=1')
        .first();
      return (
        await load('lib/state-records.ts').decodeRecordValues(
          await fixture.mf.getR2Bucket('STATE_ARCHIVE'),
          JSON.parse(row.values),
        )
      ).values;
    },
  };
}
