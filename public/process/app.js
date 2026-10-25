const data = window.IMPORTED_DATA;
const routing = window.LINE_PROCESS_DATA;
const state = {
  view: 'dashboard',
  category: 'BORUAXE1021',
  productCode: '105B100051',
  line: 'A',
  station: 'A-CUT',
  published: JSON.parse(localStorage.getItem('publishedProcess') || 'null'),
  processes: [],
  editorByCategory: {},
  editorLine: 'A',
  selectedOperation: null,
  masterStage: 'A-CUT',
  addingStage: null,
  editorProblemPlaceholder: null,
  inspectorWidth: 390,
  draggingOperation: null,
};

const defaultUsers = [
  {
    id: 'admin',
    name: '系統管理員',
    role: 'admin',
    lines: ['A', 'B', 'C'],
    views: [
      'dashboard',
      'player',
      'dispatch',
      'productStatus',
      'approval',
      'editor',
      'data',
    ],
  },
  {
    id: 'rd',
    name: 'RD 主管',
    role: 'rd',
    lines: ['A', 'B', 'C'],
    views: ['dashboard', 'productStatus', 'approval', 'editor'],
  },
  {
    id: 'operator',
    name: '製程人員',
    role: 'staff',
    lines: ['A'],
    views: ['dashboard', 'productStatus', 'editor'],
  },
];
function readStore(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback;
  } catch {
    return fallback;
  }
}
// oxlint-disable-next-line prefer-const -- Other classic scripts replace this shared global; keep its mutable binding.
let platformUsers = readStore('platformUsers', defaultUsers),
  currentUser = readStore('currentPlatformUser', null),
// oxlint-disable-next-line prefer-const -- Other classic scripts replace this shared global; keep its mutable binding.
  approvalVersions = readStore('approvalVersions', []),
// oxlint-disable-next-line prefer-const -- Other classic scripts replace this shared global; keep its mutable binding.
  dispatchBoard = readStore('dispatchBoard', { A: [], B: [], C: [] });
platformUsers.forEach((user) => {
  if (user.role === 'rd' && !user.views.includes('editor'))
    user.views.push('editor');
});
approvalVersions.forEach((version) => {
  version.history = version.history || [
    {
      action: 'created',
      label: '版本建立',
      actor: version.creatorName || '本機使用者',
      at: version.createdAt || new Date().toISOString(),
    },
  ];
  if (
    version.reviewedAt &&
    !version.history.some((item) => item.at === version.reviewedAt)
  )
    version.history.push({
      action: version.status === 'approved' ? 'approved' : 'revision_requested',
      label: version.status === 'approved' ? '確認核准' : '要求修改',
      actor: version.reviewerName || 'RD 主管',
      at: version.reviewedAt,
      note: version.reviewNote || '',
    });
});
state.deviceLine = state.deviceLine || 'A';
state.deviceStage = state.deviceStage || 'A-CUT';
// Display intent only. Server identity and player.view remain authoritative.
function applyPlayerIntent(){
  const intent=new URL(location.href).searchParams;
  if(intent.get('view')!=='player')return;
  const selected=routing.lines.find(line=>line.code===intent.get('line'));
  if(selected){state.deviceLine=selected.code;state.deviceStage=selected.stages.find(stage=>stage.code===intent.get('stage'))?.code||selected.stages[0]?.code||'';}
}
applyPlayerIntent();
window.addEventListener('popstate',applyPlayerIntent);
function rememberPlayerPosition(){
  const url=new URL(location.href);url.searchParams.set('system','process');url.searchParams.set('view','player');
  url.searchParams.set('line',state.deviceLine);url.searchParams.set('stage',state.deviceStage||'');
  if(!window.ProcessDeliveryNavigation?.replaceDisplayURL?.(url))history.replaceState(history.state,'',url);
}
state.approvalVersionId = null;
state.approvalCompareId = null;
state.editorVersionId = null;
state.dispatchPreviewLine = 'A';
state.dispatchPreviewStage = 'A-CUT';
const roleLabels = {
  admin: 'ADMIN',
  rd: 'RD 主管',
  staff: '製程人員',
  device: '產線設備',
};
function persistPlatform() {
  localStorage.setItem('platformUsers', JSON.stringify(platformUsers));
  localStorage.setItem('approvalVersions', JSON.stringify(approvalVersions));
  localStorage.setItem('dispatchBoard', JSON.stringify(dispatchBoard));
  if (currentUser)
    localStorage.setItem('currentPlatformUser', JSON.stringify(currentUser));
  else localStorage.removeItem('currentPlatformUser');
}
function canView(view) {
  return (
    currentUser?.views?.includes(view) ||
    (currentUser?.role === 'device' && view === 'player')
  );
}
function canApprove() {
  return currentUser?.role === 'admin' || currentUser?.role === 'rd';
}

const lines = routing.lines.map((line, index) => ({
  ...line,
  stations: line.stages.map((stage) => stage.code),
  load: [82, 64, 48][index] || 50,
}));
const machines = [
  {
    line: 'A',
    station: 'A2',
    name: '扭力鎖附機',
    no: 'M-A-001',
    asset: 'FA-2024-018',
    people: 2,
  },
  {
    line: 'A',
    station: 'A3',
    name: '油壓壓合機',
    no: 'M-A-003',
    asset: 'FA-2022-074',
    people: 2,
  },
  {
    line: 'A',
    station: 'A4',
    name: '氣密測試機',
    no: 'M-A-006',
    asset: 'FA-2025-011',
    people: 1,
  },
  {
    line: 'B',
    station: 'B2',
    name: '自動裁管機',
    no: 'M-B-002',
    asset: 'FA-2021-103',
    people: 1,
  },
  {
    line: 'C',
    station: 'C3',
    name: '熱縮包膜機',
    no: 'M-C-004',
    asset: 'FA-2023-052',
    people: 2,
  },
];
const defaultProcessMaster = {};
const PROCESS_TEMPLATE_PRESET_VERSION = '20260911-5900';
const PROCESS_MASTER_EXCEL_FORMAT = 'PROCESS_OS_PROCESS_MASTER_EXCEL';
const PROCESS_MASTER_EXCEL_FORMAT_VERSION = 3;
const PROCESS_TEMPLATE_PRESETS = [
  { key: 'entry', name: '進站', mode: 'human', asset: 'entry.png' },
  { key: 'manual', name: '人工', mode: 'human', asset: 'manual.png' },
  {
    key: 'manual-inspection',
    name: '人工檢查',
    mode: 'human',
    asset: 'manual-inspection.png',
  },
  {
    key: 'machine-assembly',
    name: '機器設定',
    mode: 'machine',
    asset: 'machine-assembly.png',
  },
  { key: 'exit', name: '出站', mode: 'human', asset: 'exit.png' },
];
function processTemplateMediaItems(template) {
  if (Array.isArray(template?.mediaItems)) return template.mediaItems;
  return template?.media
    ? [
        {
          src: template.media,
          name: template.mediaName || `${template.name || '流程照片'}.png`,
          type: template.mediaType || 'image/png',
        },
      ]
    : [];
}
function setProcessTemplateMedia(template, items) {
  template.mediaItems = (items || []).map((item) => ({ ...item }));
  const first = template.mediaItems[0];
  template.media = first?.src || null;
  template.mediaName = first?.name || '';
  template.mediaType = first?.type || '';
}
function defaultTemplatesForStage(stage) {
  if (!stage?.code) return [];
  return PROCESS_TEMPLATE_PRESETS.map((preset, index) => {
    const src = `assets/process-templates/${preset.asset}`;
    return {
      id: `${stage.code}-FLOW-${String(index + 1).padStart(2, '0')}`,
      presetKey: preset.key,
      presetVersion: PROCESS_TEMPLATE_PRESET_VERSION,
      name: preset.name,
      mode: preset.mode,
      people: 1,
      machineIds: [],
      media: src,
      mediaName: preset.asset,
      mediaType: 'image/png',
      mediaItems: [{ src, name: preset.asset, type: 'image/png' }],
    };
  });
}
function mergeRequiredProcessPresets(stage, templates, preserveLegacyCustoms) {
  const rawSource = Array.isArray(templates) ? templates : [],
    source = rawSource.map((template) => ({ ...template })),
    retiredPresetKeys = new Set(['machine-setting']),
    knownPresetKeys = new Set(
      PROCESS_TEMPLATE_PRESETS.map((preset) => preset.key),
    ),
    hasKnownPreset = source.some((template) =>
      knownPresetKeys.has(template?.presetKey),
    ),
    required = defaultTemplatesForStage(stage).map((fallback) => {
      const imported = source.find(
        (template) => template?.presetKey === fallback.presetKey,
      );
      if (!imported) return fallback;
      const merged = {
            ...fallback,
            ...imported,
            presetVersion: PROCESS_TEMPLATE_PRESET_VERSION,
          };
      if (
        fallback.presetKey === 'machine-assembly' &&
        imported.presetVersion !== PROCESS_TEMPLATE_PRESET_VERSION
      )
        merged.name = fallback.name;
      if (fallback.presetKey === 'machine-assembly') {
        const equipment = [
          ...(Array.isArray(imported.equipment) ? imported.equipment : []),
          ...source.flatMap((template) =>
            template?.presetKey === 'machine-setting' && Array.isArray(template.equipment)
              ? template.equipment
              : [],
          ),
        ];
        if (equipment.length) {
          const seen = new Set();
          merged.equipment = equipment
            .filter((item) => item?.id && !seen.has(item.id) && seen.add(item.id))
            .map((item) => ({ ...item, kind: 'machine-assembly' }));
        }
      }
      return merged;
    }),
    custom = source.filter(
      (template) =>
        template &&
        !retiredPresetKeys.has(template.presetKey) &&
        !knownPresetKeys.has(template.presetKey) &&
        (preserveLegacyCustoms || hasKnownPreset),
    );
  return [...required, ...custom];
}
// oxlint-disable-next-line no-unused-vars -- Called by process-equipment.js in the shared classic-script scope.
function normalizeProcessMasterPresetCatalog(snapshot) {
  const next = JSON.parse(JSON.stringify(snapshot || {}));
  routing.lines
    .flatMap((line) => line.stages)
    .forEach((stage) => {
      next[stage.code] = mergeRequiredProcessPresets(
        stage,
        next[stage.code],
        true,
      );
    });
  return next;
}
function processMasterReferenceStage() {
  return routing.lines.flatMap((line) => line.stages)[0];
}
function processMasterTemplateKey(template) {
  return template?.presetKey || template?.catalogKey || template?.id || '';
}
function processMasterCatalogTemplates(snapshot) {
  const stage = processMasterReferenceStage();
  return (snapshot?.[stage?.code] || []).filter(
    (template) => template?.presetKey !== 'machine-setting',
  );
}
function processMasterCatalogMatches(snapshot, key) {
  return Object.values(snapshot || {})
    .flat()
    .filter((template) => processMasterTemplateKey(template) === key);
}
routing.lines
  .flatMap((line) => line.stages)
  .forEach((stage) => {
    defaultProcessMaster[stage.code] = defaultTemplatesForStage(stage);
  });
let processMaster;
try {
  processMaster =
    JSON.parse(localStorage.getItem('processMasterData') || 'null') ||
    defaultProcessMaster;
} catch {
  processMaster = defaultProcessMaster;
}
function ensureProcessMasterStages() {
  let changed = false;
  const valid = new Set();
  routing.lines
    .flatMap((line) => line.stages)
    .forEach((stage) => {
      valid.add(stage.code);
      const templates = processMaster[stage.code],
        usesLatestPreset =
          Array.isArray(templates) &&
          PROCESS_TEMPLATE_PRESETS.every(
            (preset) =>
              templates.some(
                (template) =>
                  template?.presetKey === preset.key &&
                  template?.presetVersion ===
                    PROCESS_TEMPLATE_PRESET_VERSION,
              ),
          );
      if (!usesLatestPreset) {
        processMaster[stage.code] = mergeRequiredProcessPresets(
          stage,
          templates,
          false,
        );
        changed = true;
      }
    });
  Object.keys(processMaster).forEach((code) => {
    if (!valid.has(code)) {
      delete processMaster[code];
      changed = true;
    }
  });
  if (changed)
    localStorage.setItem('processMasterData', JSON.stringify(processMaster));
  return changed;
}
// Adopted master/process catalogs belong to their revision-checked workflows.
// Opening a page must not reseed templates or delete stored stage entries.
if (!globalThis.window?.ProcessSync?.deliveryProjection&&!['masterDataControl', 'processAuthoringControl'].some((key) => {
  const stored = localStorage.getItem(key);
  return stored && stored !== 'null';
})) ensureProcessMasterStages();

const titles = {
  dashboard: ['CONTROL CENTER', '生產總覽'],
  player: ['LINE DISPLAY', '產線播放台'],
  dispatch: ['DISPATCH', '發送介面'],
  editor: ['PROCESS BUILDER', '製程編輯台'],
  productStatus: ['PRODUCT PROCESS', '產品製程狀態'],
  approval: ['VERSION CONTROL', '版本確認平台'],
  data: ['MASTER DATA', '資料後台'],
};
const root = document.querySelector('#view-root');
const productsForCategory = () =>
  data.products.filter(
    (p) =>
      p.category === state.category &&
      (state.view !== 'editor' || routeFor(p.code)?.line === state.editorLine),
  );
const currentProduct = () =>
  data.products.find((p) => p.code === state.productCode) ||
  productsForCategory()[0] ||
  data.products[0] || {
    code: '',
    name: '尚無產品',
    category: '',
    specification: '',
  };
const normalizedSku = (value) =>
  String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
const bomRowsFor = (code) => {
  const wanted = normalizedSku(code),
    key = Object.keys(data.bom).find((item) => normalizedSku(item) === wanted);
  return key ? data.bom[key] || [] : [];
};
function rootBom(code) {
  const occurrenceRows = Object.values(data.bom).some(rows=>rows.some(row=>row.id?.startsWith('bom:')));
  if (occurrenceRows) return bomRowsFor(code).filter(row=>row.level===1).map(row=>({...row,bomConsumerLine:routing.productRoutes[code]?.line||''}));
  const ownRows = bomRowsFor(code).filter((row) => Number(row.level) === 1);
  if (ownRows.length) return ownRows;
  const engine = window.BomSearchEngine?.create?.(
      data.bom,
      data.products,
      routing.productRoutes,
    ),
    branches = engine?.branches(code) || [];
  let rows = branches[0]?.rows || [];
  if (!rows.length) {
    const wanted = normalizedSku(code), candidates = [];
    Object.values(data.bom).forEach((sourceRows) =>
      sourceRows.forEach((row, index) => {
        if (normalizedSku(row.itemCode) !== wanted) return;
        const base = Number(row.level), branch = [];
        for (let next = index + 1; next < sourceRows.length; next += 1) {
          const level = Number(sourceRows[next].level);
          if (!Number.isFinite(level) || level <= base) break;
          branch.push({...sourceRows[next], relativeLevel: level - base});
        }
        candidates.push(branch);
      }),
    );
    rows = candidates.sort((a, b) => b.length - a.length)[0] || [];
  }
  const seen = new Set();
  return rows
    .filter((row) => Number(row.relativeLevel) === 1)
    .filter((row) => {
      const key = normalizedSku(row.itemCode);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((row) => ({...row, level: 1}));
}
const bomReferenceKey = row => row.id?.startsWith('bom:') ? row.id : row.itemCode;
const routeFor = (code) => routing.productRoutes[code] || null;
const lineFor = (code) =>
  lines.find((line) => line.code === code) ||
  lines[0] || { code: '', name: '尚無線別', stations: [], stages: [] };
const stageFor = (code) =>
  routing.lines
    .flatMap((line) => line.stages)
    .find((stage) => stage.code === code);
const processesForProduct = (code) => {
  const route = routeFor(code);
  return (route?.stages || []).map((stageCode, _index) => {
    const stage = stageFor(stageCode) || {};
    return {
      id: `${code}-${stageCode}`,
      code: stageCode,
      name: stage.name || stageCode,
      description: '作業內容、品質標準與注意事項待製程編輯台補充。',
      bom: '待設定',
      machine: stage.machine || '待設定',
      people: stage.operators || 0,
    };
  });
};
function syncProductRoute() {
  const route = routeFor(state.productCode);
  if (!route) return;
  state.line = route.line || state.line;
  state.station = route.stages[0] || lineFor(state.line).stations[0];
  state.processes = processesForProduct(state.productCode);
}
function categoryStageCodes(category = state.category) {
  const products = data.products
    .filter(product => product.category === category && routeFor(product.code)?.line === state.editorLine)
    .map(product => ({code:product.code,stages:routeFor(product.code)?.stages || []}));
  // Visibility only: retain the complete workspace when a route hides a stage.
  return window.MasterAdminUI.maximumRoute({lines:routing.lines},state.editorLine,products).stages;
}


function editorKey() {
  return `${state.category}:${state.editorLine}`;
}
function workspaceProductCodes() {
  const workspace = state.editorByCategory[editorKey()] || {},
    allowed = new Set(
      productsForCategory()
        .filter((product) => routeFor(product.code)?.line === state.editorLine)
        .map((product) => product.code),
    );
  return [
    ...new Set(
      Object.values(workspace)
        .flat()
        .flatMap((operation) => operation.productCodes || []),
    ),
  ].filter((code) => allowed.has(code));
}
function inheritedOperationProducts(stageCode) {
  const allowed = new Set(productsForCategory().filter(product => {
    const route = routeFor(product.code);
    return route?.line === state.editorLine && route.stages.includes(stageCode);
  }).map(product => product.code));
  return workspaceProductCodes().filter(code => allowed.has(code));
}
function bomItemCodeKey(value) {
  return String(value || '').trim().toUpperCase();
}
function bomUsageOperations(productCode, itemCode) {
  const wanted = bomItemCodeKey(itemCode);
  return Object.values(ensureCategoryEditor())
    .flat()
    .filter((operation) => {
      const selected = operation.bomSelections?.[productCode];
      if (Array.isArray(selected))
        return selected.some((code) => bomItemCodeKey(code) === wanted);
      return (
        operation.bomProductCode === productCode &&
        (operation.bomItems || []).some(
          (code) => bomItemCodeKey(code) === wanted,
        )
      );
    });
}
function bomUsageMarkup(productCode, itemCode, currentOperationId) {
  const usages = bomUsageOperations(productCode, itemCode);
  const locked =
    usages.length > 0 && !usages.some((used) => used.id === currentOperationId);
  return `<span class="bom-usage ${usages.length ? '' : 'is-empty'} ${locked ? 'is-locked' : ''}" data-bom-usage-product="${escapeHtml(productCode)}" data-bom-usage-code="${escapeHtml(itemCode)}" aria-label="${usages.length ? '已使用於' : '尚未使用'}">${
    usages.length
      ? `<small>已使用於</small><span class="bom-usage-chips">${usages
          .map(
            (used) =>
              `<b><code>${escapeHtml(used.number || used.id)}</code><span>${escapeHtml(used.name || '未命名流程')}</span>${used.id === currentOperationId ? '<i>本方塊</i>' : ''}</b>`,
          )
          .join('')}</span>${locked ? '<em>請先到原方塊取消勾選</em>' : ''}`
      : ''
  }</span>`;
}
function bomSelectionRowMarkup(productCode, row, operation, currentSelection) {
  const selected = currentSelection.some(
      (code) => bomItemCodeKey(code) === bomItemCodeKey(bomReferenceKey(row)),
    ),
    usedElsewhere = bomUsageOperations(productCode, bomReferenceKey(row)).filter(
      (used) => used.id !== operation.id,
    ),
    locked = usedElsewhere.length > 0 && !selected,
    lockTitle = locked
      ? `此料號已由 ${usedElsewhere.map((used) => used.number || used.id).join('、')} 使用；請先到原方塊取消勾選。`
      : '';
  return `<label class="${locked ? 'bom-assigned-elsewhere' : ''}" ${lockTitle ? `title="${escapeHtml(lockTitle)}"` : ''}><input type="checkbox" data-bom-product="${escapeHtml(productCode)}" data-bom-code="${escapeHtml(bomReferenceKey(row))}" ${selected ? 'checked' : ''} ${locked ? 'disabled data-bom-locked="true"' : ''}><span class="bom-item-main"><code>${escapeHtml(row.itemCode)}</code>${escapeHtml(row.itemName)} <small>${escapeHtml(row.quantity)} ${escapeHtml(row.unit)}</small></span>${bomUsageMarkup(productCode,bomReferenceKey(row),operation.id)}</label>`;
}
function synchronizeOperationBomSelections(_operation) {
  // Selection is explicit and per product. Rendering never allocates BOM items.
}
function synchronizeWorkspaceBomSelections(workspace) {
  categoryStageCodes().map(code => workspace?.[code] || [])
    .flat()
    .forEach(synchronizeOperationBomSelections);
}
function synchronizeWorkspaceProducts(operation, previousCodes = []) {
  const workspace = state.editorByCategory[editorKey()] || {},
    selected = new Set(operation.productCodes || []),
    previous = new Set(previousCodes || []),
    active = new Set(workspaceProductCodes());
  previous.forEach((code) => {
    if (!selected.has(code)) active.delete(code);
  });
  selected.forEach((code) => active.add(code));
  const ordered = productsForCategory()
    .filter((product) => active.has(product.code) && routeFor(product.code)?.line === state.editorLine)
    .map((product) => product.code);
  categoryStageCodes().flatMap(code => workspace[code] || []).forEach((item) => {
    const routeStagesByProduct = new Set(
      ordered.filter((code) => (routeFor(code)?.stages || []).includes(item.stageCode)),
    );
    item.productCodes = ordered.filter((code) => routeStagesByProduct.has(code));
    item.bomSelections = item.bomSelections || {};
    Object.keys(item.bomSelections).forEach((code) => {
      if (!item.productCodes.includes(code)) delete item.bomSelections[code];
    });
    item.bomProductCode = item.productCodes.includes(item.bomProductCode)
      ? item.bomProductCode
      : item.productCodes[0] || '';
    synchronizeOperationBomSelections(item);
  });
  return ordered;
}
function newOperation(stageCode, index, chosenTemplate = null) {
  const existing = state.editorByCategory[editorKey()]?.[stageCode] || [];
  const template = chosenTemplate || (processMaster[stageCode] || [])[index - 1];
  return {
    id: `${state.category}-${stageCode}-${Date.now()}-${index}`,
    stageCode,
    number: `${stageCode}-${String(index).padStart(2, '0')}`,
    templateId: template?.id || '',
    name: template?.name || `流程 ${index}`,
    productCodes: inheritedOperationProducts(stageCode),
    bomProductCode: '',
    bomItems: [],
    mode: template?.mode || 'human',
    people: template?.people || 1,
    machineId: template?.machineIds?.[0] || '',
    machineIds: [...(template?.machineIds || [])],
    nextIds: [],
    x: existing.length ? Math.max(...existing.map((op,i)=>operationGeometry(op,i).x)) + 340 : 24 + ((index - 1) % 4) * 340,
    y: 26 + Math.floor((index - 1) / 4) * 250,
    media: null,
    mediaName: '',
    mediaType: '',
    mediaItems: [],
    instructions: '',
    ipqc: '',
  };
}
function nextOperationIndex(operations) {
  for (let index = 1; index <= 99; index++) {
    const suffix = String(index).padStart(2, '0');
    if (
      !operations.some((operation) => operation.number.endsWith(`-${suffix}`))
    )
      return index;
  }
  return 99;
}
function normalizeEditorData(editorData) {
  Object.entries(editorData).forEach(([stageCode, operations]) =>
    operations.forEach((operation, index) => {
      operation.stageCode = operation.stageCode || stageCode;
      operation.nextIds = Array.isArray(operation.nextIds)
        ? operation.nextIds
        : operations[index + 1]
          ? [operations[index + 1].id]
          : [];
    }),
  );
  return editorData;
}
const demoMediaByStage = {
  'A-CUT': {
    index: 1,
    src: 'assets/demo-process/hose-cutting.png',
    name: 'hose-cutting.png',
  },
  'A-ASSY': {
    index: 0,
    src: 'assets/demo-process/hose-assembly.png',
    name: 'hose-assembly.png',
  },
  'A-FINAL': {
    index: 0,
    src: 'assets/demo-process/hose-inspection.png',
    name: 'hose-inspection.png',
  },
};
function operationMediaItems(operation) {
  if (Array.isArray(operation.mediaItems) && operation.mediaItems.length)
    return operation.mediaItems;
  return operation.media
    ? [
        {
          src: operation.media,
          name: operation.mediaName || operation.name,
          type: operation.mediaType || 'image/png',
        },
      ]
    : [];
}
function operationTemplate(operation) {
  const stageCode =
    operation.stageCode || operation.number?.split('-').slice(0, 2).join('-');
  return (processMaster?.[stageCode] || []).find(
    (template) => template.id === operation.templateId,
  );
}
const mediaSourceKey = (item) => String(item?.src || '').trim();
function operationTemplateMediaItems(operation) {
  return processTemplateMediaItems(operationTemplate(operation));
}
function operationWorkMediaItems(operation) {
  const templateSources = new Set(
    operationTemplateMediaItems(operation).map(mediaSourceKey).filter(Boolean),
  );
  return operationMediaItems(operation).filter(
    (item) => !templateSources.has(mediaSourceKey(item)),
  );
}
function operationTemplateMediaMarkup(operation) {
  const items = operationTemplateMediaItems(operation);
  if (!items.length) return '';
  const item = items[0], title = item.name || `${operation.name} 流程資料照片`;
  return `<div class="operation-template-header-media"><button type="button" aria-label="查看流程類別照片" title="查看流程類別照片" data-lightbox-src="${escapeHtml(item.src)}" data-lightbox-type="${escapeHtml(item.type || 'image/jpeg')}" data-lightbox-title="${escapeHtml(title)}" data-lightbox-group="template-${escapeHtml(operation.id || operation.number)}">${item.type?.startsWith('video/') ? '<span class="media-video-mark">▶</span>' : `<img src="${escapeHtml(item.src)}" alt="${escapeHtml(title)}">`}</button></div>`;
}
function readUploadAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('檔案讀取失敗'));
    reader.readAsDataURL(file);
  });
}
// Process instructions may contain dimensions/text and transparent drawings.
// Lossless PNG only; never re-encode existing WebP/JPEG through a second lossy
// 1600px canvas pass. Old saved WebP content remains readable and untouched.
async function prepareMediaUpload(file) {
  const {prepareBrowserPhoto}=await import('./photo-policy.mjs?v=20261023-lossless1');
  const prepared=await prepareBrowserPhoto(file);
  return {item:{src:await readUploadAsDataUrl(prepared.blob),name:file.name,type:file.type},compressed:prepared.changed};
}
async function prepareMediaUploads(files) {
  const items = [];
  let compressedCount = 0;
  for (const file of files) {
    const prepared = await prepareMediaUpload(file);
    items.push(prepared.item);
    if (prepared.compressed) compressedCount += 1;
  }
  return { items, compressedCount };
}
function operationProductMediaItems(operation, productCode) {
  return Array.isArray(operation.productMediaItems?.[productCode])
    ? operation.productMediaItems[productCode]
    : [];
}
function operationProductInstruction(operation, productCode) {
  const saved = operation.productInstructions?.[productCode]?.trim();
  if (saved) return saved;
  return (operation.productInstructionSteps?.[productCode] || [])
    .filter((step) => step.text?.trim() || step.standard?.trim())
    .map(
      (step, index) =>
        `${index + 1}. ${step.text || '待補操作內容'}${
          step.standard ? `｜標準：${step.standard}` : ''
        }`,
    )
    .join('\n');
}
function applyDemoMedia(editorData) {
  if (state.category !== 'BORUAXE1021' || state.editorLine !== 'A')
    return editorData;
  Object.entries(demoMediaByStage).forEach(([stageCode, demo]) => {
    const operation = editorData[stageCode]?.[demo.index];
    if (operation && !operationMediaItems(operation).length) {
      const approvedMedia = approvalVersions
        .filter(version => version.category === state.category && version.line === state.editorLine && ['approved', 'superseded'].includes(version.status))
        .sort((a, b) => Number(b.status === 'approved') - Number(a.status === 'approved') || (b.number || 0) - (a.number || 0))
        .flatMap(version => (version.stages?.[stageCode] || []).flatMap(operationMediaItems))
        .find(item => item.name === demo.name);
      const item = approvedMedia ? { ...approvedMedia } : { src: demo.src, name: demo.name, type: 'image/png' };
      operation.media = item.src;
      operation.mediaName = item.name;
      operation.mediaType = item.type;
      operation.mediaItems = [item];
    }
  });
  return editorData;
}
function ensureCategoryEditor() {
  const key = editorKey();
  if (state.editorByCategory[key]) return state.editorByCategory[key];
  if(localStorage.getItem('processAuthoringControl')){
    const stages=window.ProcessAuthoringV3?.workspace(state.category,state.editorLine)?.stages||{};
    state.editorByCategory[key]=structuredClone(stages);
    const allowed = new Set(lineFor(state.editorLine).stages.map(stage=>stage.code));
    categoryStageCodes(state.category).filter(code=>allowed.has(code)).forEach(code=>state.editorByCategory[key][code]||=[]);
    return state.editorByCategory[key];
  }
  try {
    const saved = JSON.parse(
      localStorage.getItem(`processEditor:${key}`) || 'null',
    );
    if (saved?.stages && typeof saved.stages === 'object') {
      const allowed = new Set(
          lineFor(state.editorLine).stages.map((stage) => stage.code),
        ),
        required = categoryStageCodes(state.category).filter((code) =>
          allowed.has(code),
        );
      required.forEach((stageCode) => {
        if (!Array.isArray(saved.stages[stageCode]))
          saved.stages[stageCode] = [];
      });
      state.editorByCategory[key] = applyDemoMedia(
        normalizeEditorData(saved.stages),
      );
      state.selectedOperation =
        Object.values(saved.stages).flat()[0]?.id || null;
      return saved.stages;
    }
  } catch (error) {
    console.warn('無法讀取已儲存的製程版本', error);
  }
  const allowed = new Set(
      lineFor(state.editorLine).stages.map((stage) => stage.code),
    ),
    stageCodes = categoryStageCodes(state.category).filter((code) =>
      allowed.has(code),
    );
  const editorData = {};
  stageCodes.forEach((stageCode) => {
    const count = stageCode === 'A-CUT' ? 4 : 1;
    editorData[stageCode] = Array.from({ length: count }, (_, index) =>
      newOperation(stageCode, index + 1),
    );
  });
  Object.values(editorData).forEach((operations) =>
    operations.forEach(
      (operation, index) =>
        (operation.nextIds = operations[index + 1]
          ? [operations[index + 1].id]
          : []),
    ),
  );
  applyDemoMedia(editorData);
  state.editorByCategory[key] = editorData;
  state.selectedOperation = stageCodes.length
    ? editorData[stageCodes[0]][0]?.id
    : null;
  return editorData;
}
function selectedEditorOperation() {
  const editorData = ensureCategoryEditor();
  return (
    categoryStageCodes().flatMap(code => editorData[code] || [])
      .find((operation) => operation.id === state.selectedOperation) || null
  );
}
function operationGeometry(operation, index) {
  return {
    x: Number.isFinite(operation.x) ? operation.x : 24 + (index % 4) * 178,
    y: Number.isFinite(operation.y)
      ? operation.y
      : 26 + Math.floor(index / 4) * 128,
  };
}
function calculateGraphLayout(operations, xGap = 220, yGap = 140) {
  const byId = Object.fromEntries(
      operations.map((operation) => [operation.id, operation]),
    ),
    ids = new Set(Object.keys(byId)),
    originalOrder = Object.fromEntries(
      operations.map((operation, index) => [operation.id, index]),
    ),
    indegree = Object.fromEntries(
      operations.map((operation) => [operation.id, 0]),
    ),
    layer = Object.fromEntries(
      operations.map((operation) => [operation.id, 0]),
    ),
    parents = Object.fromEntries(
      operations.map((operation) => [operation.id, []]),
    );
  operations.forEach((operation) =>
    (operation.nextIds || [])
      .filter((id) => ids.has(id))
      .forEach((id) => {
        indegree[id]++;
        parents[id].push(operation.id);
      }),
  );
  const queue = operations.filter((operation) => indegree[operation.id] === 0),
    visited = new Set();
  while (queue.length) {
    const operation = queue.shift();
    if (!operation || visited.has(operation.id)) continue;
    visited.add(operation.id);
    (operation.nextIds || [])
      .filter((id) => ids.has(id))
      .forEach((id) => {
        layer[id] = Math.max(layer[id], layer[operation.id] + 1);
        indegree[id]--;
        if (indegree[id] === 0) queue.push(byId[id]);
      });
  }
  operations
    .filter((operation) => !visited.has(operation.id))
    .forEach((operation, index) => (layer[operation.id] = index));
  operations
    .slice()
    .sort((a, b) => layer[b.id] - layer[a.id])
    .forEach((operation) => {
      const childLayers = (operation.nextIds || [])
        .filter((id) => ids.has(id))
        .map((id) => layer[id]);
      if (childLayers.length) {
        const latestAllowed = Math.min(...childLayers) - 1;
        if (latestAllowed > layer[operation.id])
          layer[operation.id] = latestAllowed;
      }
    });
  const groups = {};
  operations.forEach((operation) =>
    (groups[layer[operation.id]] || (groups[layer[operation.id]] = [])).push(
      operation,
    ),
  );
  const columns = Object.keys(groups)
      .map(Number)
      .sort((a, b) => a - b),
    rowIndex = () =>
      Object.fromEntries(
        columns.flatMap((column) =>
          groups[column].map((operation, row) => [operation.id, row]),
        ),
      );
  for (let sweep = 0; sweep < 4; sweep++) {
    let rows = rowIndex();
    columns.slice(1).forEach((column) =>
      groups[column].sort((a, b) => {
        const average = (operation) =>
          parents[operation.id].length
            ? parents[operation.id].reduce(
                (sum, id) => sum + (rows[id] ?? 0),
                0,
              ) / parents[operation.id].length
            : originalOrder[operation.id];
        return (
          average(a) - average(b) || originalOrder[a.id] - originalOrder[b.id]
        );
      }),
    );
    rows = rowIndex();
    columns
      .slice(0, -1)
      .reverse()
      .forEach((column) =>
        groups[column].sort((a, b) => {
          const average = (operation) => {
            const children = (operation.nextIds || []).filter((id) =>
              ids.has(id),
            );
            return children.length
              ? children.reduce((sum, id) => sum + (rows[id] ?? 0), 0) /
                  children.length
              : originalOrder[operation.id];
          };
          return (
            average(a) - average(b) || originalOrder[a.id] - originalOrder[b.id]
          );
        }),
      );
  }
  const maxRows = Math.max(
      1,
      ...columns.map((column) => groups[column].length),
    ),
    positions = {};
  columns.forEach((column) => {
    const offset = (maxRows - groups[column].length) / 2;
    groups[column].forEach(
      (operation, row) =>
        (positions[operation.id] = {
          x: 30 + column * xGap,
          y: 30 + (row + offset) * yGap,
        }),
    );
  });
  return positions;
}
function connectionMarkup(
  operations,
  stageCode,
  positions,
  width = 154,
  yOffset = 52,
  markerPrefix = 'arrow',
) {
  const byId = Object.fromEntries(
      operations.map((operation) => [operation.id, operation]),
    ),
    edges = [];
  operations.forEach((operation) =>
    (operation.nextIds || [])
      .filter((id) => byId[id] && positions[id] && positions[operation.id])
      .forEach((targetId) =>
        edges.push({ source: operation, target: byId[targetId] }),
      ),
  );
  edges.sort(
    (a, b) =>
      positions[a.source.id].x - positions[b.source.id].x ||
      positions[a.target.id].x - positions[b.target.id].x ||
      positions[a.source.id].y - positions[b.source.id].y ||
      positions[a.target.id].y - positions[b.target.id].y,
  );
  const forwardGroups = {};
  edges.forEach((edge) => {
    const from = positions[edge.source.id],
      to = positions[edge.target.id],
      key = `${Math.round(from.x + width)}:${Math.round(to.x - 8)}`;
    (forwardGroups[key] || (forwardGroups[key] = [])).push(edge);
  });
  return edges
    .map((edge, edgeIndex) => {
      const operation = edge.source,
        targetId = edge.target.id,
        from = positions[operation.id],
        to = positions[targetId],
        outgoing = (operation.nextIds || []).filter((id) => byId[id]),
        outIndex = outgoing.indexOf(targetId),
        incoming = operations.filter((item) =>
          (item.nextIds || []).includes(targetId),
        ),
        inIndex = incoming.findIndex((item) => item.id === operation.id),
        sx = from.x + width + 4,
        sy = from.y + yOffset + (outIndex - (outgoing.length - 1) / 2) * 24,
        tx = to.x - 6,
        ty = to.y + yOffset + (inIndex - (incoming.length - 1) / 2) * 24;
      let d;
      if (tx > sx + 12) {
        const group = forwardGroups[
            `${Math.round(from.x + width)}:${Math.round(to.x - 8)}`
          ] || [edge],
          rank = group.indexOf(edge),
          usable = Math.max(20, tx - sx - 36),
          channel = sx + 18 + (usable * (rank + 1)) / (group.length + 1),
          secondChannel = Math.max(channel + 16, tx - 22);
        d = `M ${sx} ${sy} C ${channel} ${sy} ${secondChannel} ${ty} ${tx} ${ty}`;
      } else {
        const detour = Math.max(from.y, to.y) + yOffset + 120 + edgeIndex * 18,
          leftOfTarget = to.x - 22 - edgeIndex * 8;
        d = `M ${sx} ${sy} C ${sx + 34 + edgeIndex * 7} ${sy} ${sx + 34 + edgeIndex * 7} ${detour} ${leftOfTarget} ${detour} C ${leftOfTarget - 20} ${detour} ${leftOfTarget - 20} ${ty} ${tx} ${ty}`;
      }
      return `<g class="flow-connection"><path class="flow-link-visible" d="${d}" marker-end="url(#${markerPrefix}-${stageCode})"></path><path class="flow-link-hit" d="${d}" data-link-from="${operation.id}" data-link-to="${targetId}"></path></g>`;
    })
    .join('');
}
function operationConnections(operations, stageCode) {
  const positions = Object.fromEntries(
    operations.map((operation, index) => [
      operation.id,
      operationGeometry(operation, index),
    ]),
  );
  return connectionMarkup(operations, stageCode, positions);
}
function autoLayoutStage(stageCode) {
  const operations = ensureCategoryEditor()[stageCode] || [],
    positions = calculateGraphLayout(operations);
  operations.forEach((operation) => {
    operation.x = positions[operation.id].x;
    operation.y = positions[operation.id].y;
  });
}
function wouldCreateCycle(operations, sourceId, targetId) {
  const byId = Object.fromEntries(
      operations.map((operation) => [operation.id, operation]),
    ),
    stack = [targetId],
    visited = new Set();
  while (stack.length) {
    const id = stack.pop();
    if (id === sourceId) return true;
    if (visited.has(id)) continue;
    visited.add(id);
    (byId[id]?.nextIds || []).forEach((nextId) => stack.push(nextId));
  }
  return false;
}
const escapeHtml = (value) =>
  String(value ?? '').replace(
    /[&<>'"]/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[
        char
      ],
  );

function toast(message) {
  const el = document.querySelector('#toast');
  el.textContent = message;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2200);
}
function bindLightbox() {
  document.querySelectorAll('[data-lightbox-src]').forEach(
    (button) =>
      (button.onclick = (event) => {
        event.stopPropagation();
        let dialog = document.querySelector('#media-lightbox');
        if (!dialog) {
          dialog = document.createElement('dialog');
          dialog.id = 'media-lightbox';
          dialog.className = 'media-lightbox';
          dialog.innerHTML =
            '<button type="button" class="media-lightbox-close" aria-label="關閉大圖">×</button><button type="button" class="media-lightbox-nav previous" aria-label="上一個媒體">‹</button><figure><img alt="照片放大檢視"><video controls playsinline></video><figcaption></figcaption></figure><button type="button" class="media-lightbox-nav next" aria-label="下一個媒體">›</button>';
          document.body.appendChild(dialog);
          dialog.querySelector('.media-lightbox-close').onclick = () =>
            dialog.close();
          dialog.onclick = (e) => {
            if (e.target === dialog) dialog.close();
          };
          dialog.addEventListener('cancel', () => dialog.close());
        }
        const group = [
            ...document.querySelectorAll(
              `[data-lightbox-group="${CSS.escape(button.dataset.lightboxGroup || 'default')}"]`,
            ),
          ],
          show = (index) => {
            const current =
              group[(index + group.length) % group.length] || button;
            dialog.dataset.index = String(group.indexOf(current));
            const isVideo = current.dataset.lightboxType?.startsWith('video/'),
              image = dialog.querySelector('img'),
              video = dialog.querySelector('video');
            video.pause();
            image.hidden = isVideo;
            video.hidden = !isVideo;
            if (isVideo) video.src = current.dataset.lightboxSrc;
            else image.src = current.dataset.lightboxSrc;
            dialog.querySelector('figcaption').textContent =
              current.dataset.lightboxTitle || '操作照片';
            dialog
              .querySelectorAll('.media-lightbox-nav')
              .forEach((nav) => (nav.hidden = group.length < 2));
          };
        dialog.querySelector('.previous').onclick = (e) => {
          e.stopPropagation();
          show(Number(dialog.dataset.index) - 1);
        };
        dialog.querySelector('.next').onclick = (e) => {
          e.stopPropagation();
          show(Number(dialog.dataset.index) + 1);
        };
        show(Math.max(0, group.indexOf(button)));
        dialog.showModal?.();
      }),
  );
  document.querySelectorAll('[data-lightbox-src][role="button"]').forEach((button) => {
    button.onkeydown = (event) => {
      if (!['Enter', ' '].includes(event.key)) return;
      event.preventDefault();
      button.click();
    };
  });
  document.querySelectorAll('[data-node-bom-open]').forEach((button) => {
    button.onclick = (event) => {
      event.stopPropagation();
      let dialog = document.querySelector('#node-bom-dialog');
      if (!dialog) {
        dialog = document.createElement('dialog');
        dialog.id = 'node-bom-dialog';
        dialog.className = 'node-bom-dialog';
        dialog.innerHTML = '<header><div><small>PRODUCT BOM</small><h3></h3></div><button type="button" aria-label="關閉 BOM">×</button></header><div class="node-bom-dialog-body"></div>';
        document.body.appendChild(dialog);
        dialog.querySelector('header button').onclick = () => dialog.close();
        dialog.onclick = (clickEvent) => {
          if (clickEvent.target === dialog) dialog.close();
        };
      }
      const source = button.parentElement?.querySelector(':scope > .node-bom-source');
      dialog.querySelector('h3').textContent = button.dataset.bomTitle || '產品 BOM';
      dialog.querySelector('.node-bom-dialog-body').innerHTML = source?.innerHTML || '<p>尚未分配 BOM</p>';
      dialog.showModal?.();
    };
  });
}
function bindCommon() {
  document
    .querySelectorAll('[data-go]')
    .forEach((el) => (el.onclick = () => navigate(el.dataset.go)));
  bindLightbox();
}
function bindProductSelects(callback = render) {
  const cat = document.querySelector('#category-select'),
    product = document.querySelector('#product-select');
  if (cat)
    cat.onchange = () => {
      state.category = cat.value;
      state.productCode = productsForCategory()[0]?.code;
      syncProductRoute();
      callback();
    };
  if (product)
    product.onchange = () => {
      state.productCode = product.value;
      syncProductRoute();
      callback();
    };
}
function statusLines() {
  return lines.filter(line => currentUser?.role === 'admin' || !Array.isArray(currentUser?.lines) || currentUser.lines.includes(line.code));
}
function statusProducts(line = state.statusLine, category = state.statusCategory) {
  return data.products.filter(product => (routeFor(product.code)?.line || product.line) === line && (!category || product.category === category));
}
function selectedStatusProduct() {
  const choices=statusLines(), current=currentProduct();
  if (!choices.some(line=>line.code===state.statusLine)) state.statusLine=choices.find(line=>line.code===(routeFor(current.code)?.line || current.line))?.code || choices[0]?.code || '';
  const products=statusProducts(state.statusLine,''), categories=[...new Set(products.map(product=>product.category))];
  if (!categories.includes(state.statusCategory)) state.statusCategory=categories.includes(current.category)?current.category:categories[0] || '';
  const matched=statusProducts();
  const selected=matched.find(product=>product.code===state.statusProductCode) || matched.find(product=>product.code===current.code) || matched[0];
  state.statusProductCode=selected?.code || '';
  return selected;
}
function productStatusSelects() {
  const categories=[...new Set(statusProducts(state.statusLine,'').map(product=>product.category))];
  const select=(id,label,options)=>`<div class="field"><label for="${id}">${label}</label><select id="${id}" ${options?'':'disabled'}>${options || '<option value="">—</option>'}</select></div>`;
  return select('status-line-select','線別',statusLines().map(line=>`<option value="${escapeHtml(line.code)}" ${line.code===state.statusLine?'selected':''}>${escapeHtml(line.code)} · ${escapeHtml(line.name)}</option>`).join(''))+
    select('status-category-select','產品類別',categories.map(category=>`<option value="${escapeHtml(category)}" ${category===state.statusCategory?'selected':''}>${escapeHtml(category)}</option>`).join(''))+
    select('status-product-select','產品編號／名稱／規格',statusProducts().map(product=>`<option value="${escapeHtml(product.code)}" ${product.code===state.statusProductCode?'selected':''}>${escapeHtml(product.code)} · ${escapeHtml(product.name)}${product.specification?` · ${escapeHtml(product.specification)}`:''}</option>`).join(''));
}
function bindStatusSelects() {
  for (const [id,key] of [['status-line-select','statusLine'],['status-category-select','statusCategory'],['status-product-select','statusProductCode']]) {
    const select=document.getElementById(id);
    if (select) select.onchange=()=>{state[key]=select.value;if(key==='statusLine'){state.statusCategory='';state.statusProductCode='';}else if(key==='statusCategory')state.statusProductCode='';render();};
  }
}


function dashboard() {
  return `<section class="page"><div class="hero"><div><p class="eyebrow">今日工廠狀態</p><h2>生產管理中心</h2></div><div class="hero-meta"><strong>${new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false })}</strong><span>${new Date().toLocaleDateString('zh-TW')}</span></div></div><div class="grid stats"><article class="stat"><label>PDF 產品分類</label><strong>${data.meta.productCount}</strong><small>${data.meta.categoryCount} 個產品類別</small></article><article class="stat"><label>BOM 對應產品</label><strong>${data.meta.bomProductCount}</strong><small>${data.meta.bomRowCount.toLocaleString()} 筆組成資料</small></article><article class="stat"><label>成品製程路線</label><strong>${routing.meta.finishedCount}</strong><small>${routing.meta.matchedCategoryCount} 筆已連結 PDF 類別</small></article><article class="stat"><label>半成品製程</label><strong>${routing.meta.semiFinishedCount}</strong><small>來自 SKU BTP</small></article></div><div class="grid two-col"><section class="panel"><div class="panel-head"><h3>產線即時狀態</h3><span class="tag">即時</span></div><div class="line-list">${lines.map((line, _i) => `<div class="line-row"><span class="line-badge">${line.code}</span><div><b>${line.name}</b><span>${escapeHtml((dispatchBoard[line.code] || []).map((code) => data.products.find((p) => p.code === code)?.name || code).join('、') || '尚未發送產品')}</span></div><div class="progress"><i style="width:${Math.min(100, ((dispatchBoard[line.code] || []).length / 3) * 100)}%"></i></div><b>${line.load}%</b></div>`).join('')}</div></section><section class="panel"><div class="panel-head"><h3>快速操作</h3></div><div class="quick-list"><button class="quick" data-go="dispatch">發送新製程 <span>↗</span></button><button class="quick" data-go="editor">編輯 BORUAXE 流程 <span>→</span></button><button class="quick" data-go="data">查看匯入資料 <span>→</span></button><button class="quick" data-go="player">開啟產線電視畫面 <span>↗</span></button></div></section></div></section>`;
}
function editorDataForProduct(product, lineCode) {
  const key = `${product.category}:${lineCode}`;
  if (state.editorByCategory[key]) return state.editorByCategory[key];
  const saved = readStore(`processEditor:${key}`, null);
  return saved?.stages || {};
}
function compactBomMarkup(rows, label = 'BOM 零件', open = false) {
  if (!rows.length) return `<p class="status-muted">未分配 BOM</p>`;
  const content = `<div class="status-compact-list">${rows.map((row) => `<div><code>${escapeHtml(row.itemCode)}</code><b>${escapeHtml(row.itemName)}</b><span>${escapeHtml(row.specification || '')} · ${escapeHtml(row.unit || '')}${row.bomConsumerLine==='C'?'':` · 用量 ${escapeHtml(row.quantity ?? '')} · 分母 ${escapeHtml(row.denominator ?? '')} · 損耗 ${escapeHtml(row.waste ?? '')}`}</span></div>`).join('')}</div>`;
  return rows.length > 4
    ? `<details class="status-bom-details" ${open ? 'open' : ''}><summary>${label} · ${rows.length} 項 <span>點擊展開</span></summary>${content}</details>`
    : content;
}
function mediaGalleryMarkup(
  operation,
  items = operationWorkMediaItems(operation),
  groupSuffix = '',
) {
  if (!items.length)
    return `<div class="status-no-photo">尚未上傳操作照片</div>`;
  const group = `media-${operation.id || operation.number}${groupSuffix ? `-${groupSuffix}` : ''}`;
  return `<div class="status-media-gallery media-count-${Math.min(items.length, 4)}">${items.map((item, index) => `<button type="button" class="media-enlarge" data-lightbox-src="${escapeHtml(item.src)}" data-lightbox-type="${escapeHtml(item.type || 'image/jpeg')}" data-lightbox-title="${escapeHtml(item.name || operation.name)}" data-lightbox-group="${escapeHtml(group)}" aria-label="查看第 ${index + 1} 個媒體">${item.type?.startsWith('video/') ? '<span class="media-video-mark">▶ 影片</span>' : `<img src="${escapeHtml(item.src)}" alt="${escapeHtml(item.name || operation.name)}">`}<span>查看</span></button>`).join('')}</div>`;
}

function operationTypeMeta(operation) {
  const stageCode = operation.stageCode || operation.number?.split('-').slice(0, 2).join('-'),
    template = (processMaster?.[stageCode] || []).find((item) => item.id === operation.templateId),
    key = template?.presetKey || operation.presetKey || '';
  if (key === 'entry' || operation.name === '進站') return {key:'entry',label:'進站'};
  if (key === 'manual-inspection' || operation.name?.includes('人工檢查')) return {key:'inspection',label:'人工檢查'};
  if (['machine-assembly','machine-setting'].includes(key) || operation.mode === 'machine') return {key:'machine',label:'機器設定'};
  if (key === 'exit' || operation.name === '出站') return {key:'exit',label:'出站'};
  if (key === 'manual' || operation.name?.includes('人工')) return {key:'manual',label:'人工'};
  return {key:'custom',label:'自訂流程'};
}
function operationMachineRows(operation) {
  const ids = operation.machineIds?.length ? operation.machineIds : operation.machineId ? [operation.machineId] : [];
  return ids.map((id) => window.ProcessEquipment?.display(id, operation) || machines.find((item) => item.no === id)).filter(Boolean);
}
function operationMediaGroups(operation, productCode = '') {
  const groups = [], common = operationWorkMediaItems(operation), product = productCode ? operationProductMediaItems(operation, productCode) : [];
  if (common.length) groups.push({key:'common',label:'作業說明媒體',items:common});
  if (product.length) groups.push({key:'product',label:`${productCode} 產品補充媒體`,items:product});
  const equipmentItems = operationMachineRows(operation).flatMap((machine) => (machine.mediaItems || []).map((item) => ({...item,name:`${machine.no || machine.number || ''} ${machine.name || ''} · ${item.name || '機器照片'}`})));
  if (equipmentItems.length) groups.push({key:'machine',label:'機器照片',items:equipmentItems});
  return groups;
}
function operationStepsMarkup(operation, productCode = '') {
  const common = (operation.instructionSteps || []).filter((step) => step.text?.trim() || step.standard?.trim()),
    specific = (operation.productInstructionSteps?.[productCode] || []).filter((step) => step.text?.trim() || step.standard?.trim()),
    fallback = common.length ? [] : [{text:operation.instructions || '依核准作業標準操作。',standard:operation.ipqc || '依核准品質標準檢查並記錄。'}],
    commonMedia = operationWorkMediaItems(operation),
    productMedia = productCode ? operationProductMediaItems(operation, productCode) : [],
    group = (label, rows, items, className = '', mediaLabel = '照片／影片') => rows.length || items.length ? `<section class="node-step-group node-guidance-section ${className}"><h5>${escapeHtml(label)}</h5>${rows.length ? `<ol>${rows.map((step) => `<li><b>${escapeHtml(step.text || '待補操作內容')}</b><span>${escapeHtml(step.standard || '待補完成標準')}</span></li>`).join('')}</ol>` : '<p class="status-muted">尚未填寫操作內容</p>'}${items.length ? `<div class="node-guidance-media"><b>${escapeHtml(mediaLabel)}</b>${mediaGalleryMarkup(operation,items,`${productCode || 'common'}-${className || 'common'}`)}</div>` : ''}</section>` : '';
  return `<div class="node-step-groups">${group('作業說明與完成標準',common.length ? common : fallback,commonMedia,'common','作業說明照片／影片')}${group(`${productCode} 產品補充操作`,specific,productMedia,'product','產品補充照片／影片')}</div>`;
}
function productionOperationHeaderMarkup(operation, type, machineCount, photoCount) {
  const duplicateTitle = String(operation.name || '').trim() === String(type.label || '').trim();
  return `<header class="${duplicateTitle ? 'is-duplicate-title' : ''}"><code>${escapeHtml(operation.number)}</code>${duplicateTitle ? '' : `<h4>${escapeHtml(operation.name)}</h4>`}<span>設備 ${machineCount} · 作業媒體 ${photoCount}</span><b class="process-type-badge">${escapeHtml(type.label)}</b></header>`;
}
function operationNodeBody(operation, product) {
  const code = product?.code || '', bomItems = operation.bomSelections?.[code] || (operation.productCodes?.includes(code) ? operation.bomItems || [] : []),
    allBomRows = code ? rootBom(code) : [], bomRows = allBomRows.filter((row) => bomItems.includes(bomReferenceKey(row))), machinesForOperation = operationMachineRows(operation);
  const productTitle = `${code || '未指定產品'} ${product?.name || ''}`.trim(),
    language = document.documentElement.lang === 'vi' ? 'vi' : 'zh',
    machineName = (machine) => language === 'vi' ? machine.nameVi || machine.name : machine.name || machine.nameVi;
  return `<div class="node-product-bom-launch"><button type="button" class="node-product-chip" data-node-bom-open data-bom-title="${escapeHtml(`${productTitle} · BOM ${bomRows.length}/${allBomRows.length}`)}"><b>${escapeHtml(code || '未指定產品')}</b><span>${escapeHtml(product?.name || '')}</span><em>BOM ${bomRows.length}/${allBomRows.length} · 點擊查看</em></button><div class="node-bom-source" hidden>${compactBomMarkup(bomRows,'BOM 零件',true)}</div></div><section class="node-machine-section"><h5>使用機器</h5>${machinesForOperation.length ? `<div class="node-machine-grid">${machinesForOperation.map((machine) => `<article>${machine.mediaItems?.[0] ? `<button type="button" class="machine-photo-button" data-lightbox-src="${escapeHtml(machine.mediaItems[0].src)}" data-lightbox-type="${escapeHtml(machine.mediaItems[0].type || 'image/jpeg')}" data-lightbox-title="${escapeHtml(`${machine.no || machine.number || ''} ${machineName(machine) || ''}`)}" data-lightbox-group="machine-${escapeHtml(operation.id || operation.number)}"><img src="${escapeHtml(machine.mediaItems[0].src)}" alt="${escapeHtml(machineName(machine) || '機器照片')}"></button>` : ''}<div><code>${escapeHtml(machine.no || machine.number || '')}</code><b>${escapeHtml(machineName(machine) || '')}</b></div></article>`).join('')}</div>` : '<p class="status-muted">人工流程／未指定設備</p>'}</section>${operationStepsMarkup(operation,code)}`;
}
window.ProcessOperationPresentation = {operationTypeMeta,operationMachineRows,operationMediaGroups,operationNodeBody,operationTemplateMediaItems,operationWorkMediaItems,operationTemplateMediaMarkup,productionOperationHeaderMarkup};
function playerOperationCard(operation, product) {
  const bomItems = operation.bomSelections?.[product.code] || [],
    bomRows = rootBom(product.code).filter((row) =>
      bomItems.includes(bomReferenceKey(row)),
    ),
    machineIds = operation.machineIds || [],
    commonMediaItems = operationWorkMediaItems(operation),
    productMediaItems = operationProductMediaItems(operation, product.code),
    note =
      operationProductInstruction(operation, product.code) ||
      operation.instructions ||
      (window.ProcessAuthoringV3?.enabled()? (document.documentElement.lang==='vi'?'Cần bổ sung hướng dẫn thao tác':'操作說明待補'):'依標準書內容操作');
  return `<article class="device-operation"><header><code>${escapeHtml(operation.number)}</code><b>${escapeHtml(operation.name)}</b></header>${commonMediaItems.length ? `<h5>共用操作照片</h5>${mediaGalleryMarkup(operation, commonMediaItems)}` : ''}${productMediaItems.length ? `<h5>${escapeHtml(product.code)} 專用照片</h5>${mediaGalleryMarkup(operation, productMediaItems, product.code)}` : ''}${!commonMediaItems.length && !productMediaItems.length ? mediaGalleryMarkup(operation, []) : ''}<div><span>BOM ${bomItems.length} 項</span><span>設備 ${machineIds.length} 台</span><span>照片 ${commonMediaItems.length + productMediaItems.length} 張</span></div>${compactBomMarkup(bomRows, 'BOM')}<p>${escapeHtml(note)}</p><small>IPQC：${escapeHtml(operation.ipqc || '依核准標準檢查')}</small></article>`;
}
function player() {
  const line = lineFor(state.deviceLine),
    stageCodes = (line?.stages||[]).map((stage) => stage.code);
  if (!stageCodes.includes(state.deviceStage))
    state.deviceStage = stageCodes[0];
  const activeCodes = dispatchBoard[state.deviceLine] || [],
    activeProducts = activeCodes
      .map((code) => data.products.find((product) => product.code === code))
      .filter(Boolean),
    stage = stageFor(state.deviceStage) || { name: state.deviceStage };
  return `<section class="page device-page"><button class="fullscreen-exit" id="fullscreen-exit" type="button" aria-label="退出全螢幕">退出全螢幕</button><div class="device-toolbar"><div><p class="eyebrow">LINE DEVICE MONITOR</p><h2>${state.deviceLine} 線 · ${escapeHtml(stage.name)}</h2><p>只播放目前選擇工段收到的產品與操作標準。</p></div><div class="toolbar"><div class="field"><label>線別</label><select id="device-line">${lines.map((item) => `<option value="${item.code}" ${item.code === state.deviceLine ? 'selected' : ''}>${item.code} 線 · ${escapeHtml(item.name)}</option>`).join('')}</select></div><div class="field"><label>工段</label><select id="device-stage">${stageCodes.map((code) => `<option value="${code}" ${code === state.deviceStage ? 'selected' : ''}>${code} · ${escapeHtml(stageFor(code)?.name || code)}</option>`).join('')}</select></div><button class="button ghost" id="fullscreen">全螢幕</button></div></div><div class="device-live-strip"><span>● LIVE</span><b>${activeProducts.length} 項產品正在此線發送</b><small id="board-clock">--:--</small></div>${
    activeProducts.length
      ? `<div class="device-products">${activeProducts
          .map((product) => {
            const editorData = editorDataForProduct(product, state.deviceLine),
              operations = (editorData[state.deviceStage] || []).filter(
                (operation) =>
                  !operation.productCodes?.length ||
                  operation.productCodes.includes(product.code),
              );
            return `<section class="device-product"><header><div><code>${product.code}</code><h3>${escapeHtml(product.name)}</h3><span>${escapeHtml(product.specification || '')}</span></div><b>${state.deviceStage}</b></header><div class="device-operation-grid">${operations.length ? operations.map((operation) => playerOperationCard(operation, product)).join('') : `<div class="empty">此產品在本公段尚無已建立流程</div>`}</div></section>`;
          })
          .join('')}</div>`
      : `<div class="device-empty"><strong>此線目前尚未發送產品</strong><p>請由發送介面選擇最多三項產品並發送。</p></div>`
  }</section>`;
}
function dispatchProducts(lineCode, category = '') {
  return data.products.filter(
    (product) =>
      routeFor(product.code)?.line === lineCode &&
      (!category || product.category === category),
  );
}
function dispatchProductText(product) {
  return `${product.code} · ${product.name} · 規格：${product.specification || '未設定'}`;
}
function prepareDispatchProductSelect(card, select) {
  [...select.options].forEach((option) => {
    const product = data.products.find((item) => item.code === option.value);
    if (product) {
      option.textContent = dispatchProductText(product);
      option.title = dispatchProductText(product);
    }
  });
}
function dispatch() {
  return `<section class="page dispatch-v2"><div class="dispatch-head"><div><p class="eyebrow">MULTI PRODUCT DISPATCH</p><h2>三線生產發送監控</h2><p>每個欄位先選產品類別，再選該類別的產品；每條線最多同時發送三項。</p></div><span class="tag">A／B／C LIVE</span></div><div class="dispatch-lines">${lines
    .map((line) => {
      const eligible = dispatchProducts(line.code),
        categories = [
          ...new Set(eligible.map((product) => product.category)),
        ].sort((a, b) => a.localeCompare(b, 'zh-TW')),
        selected = dispatchBoard[line.code] || [];
      return `<section class="dispatch-line-card" data-dispatch-line="${line.code}"><header><span class="line-badge">${line.code}</span><div><h3>${line.code}線</h3><small>${line.stages.length} 個公段 · 已發送 ${selected.length}/3</small></div></header><div class="dispatch-slots">${[
        0, 1, 2,
      ]
        .map((index) => {
          const chosen = eligible.find(
              (product) => product.code === selected[index],
            ),
            category = chosen?.category || '',
            products = category ? dispatchProducts(line.code, category) : [];
          return `<section class="dispatch-slot-group"><b>產品 ${index + 1}</b><div class="field"><label>產品類別</label><select data-dispatch-category-slot="${index}"><option value="">先選類別</option>${categories.map((item) => `<option value="${escapeHtml(item)}" ${item === category ? 'selected' : ''}>${escapeHtml(item)}（${eligible.filter((product) => product.category === item).length}）</option>`).join('')}</select></div><div class="field"><label>產品</label><select data-dispatch-slot="${index}" ${category ? '' : 'disabled'}><option value="">${category ? '未使用' : '請先選產品類別'}</option>${products.map((product) => `<option value="${product.code}" title="${escapeHtml(dispatchProductText(product))}" ${product.code === selected[index] ? 'selected' : ''}>${escapeHtml(dispatchProductText(product))}</option>`).join('')}</select></div></section>`;
        })
        .join('')}</div><div class="dispatch-monitor">${
        selected.length
          ? selected
              .map((code) => {
                const product = data.products.find(
                  (item) => item.code === code,
                );
                return product
                  ? `<span><code>${code}</code>${escapeHtml(product.name)}</span>`
                  : '';
              })
              .join('')
          : `<p>目前沒有發送中的產品</p>`
      }</div><button class="button signal publish-line" data-line="${line.code}">發送 ${line.code} 線設定</button></section>`;
    })
    .join('')}</div></section>`;
}
function refreshDispatchChoices(card) {
  const selects = [...card.querySelectorAll('[data-dispatch-slot]')],
    values = selects.map((select) => select.value).filter(Boolean);
  selects.forEach((select) =>
    [...select.options].forEach((option) => {
      const used =
        option.value &&
        option.value !== select.value &&
        values.includes(option.value);
      option.hidden = used;
      option.disabled = used;
    }),
  );
}
function updateDispatchSelectionDetail() {}
function updateDispatchProductOptions(card, index) {
  const lineCode = card.dataset.dispatchLine,
    categorySelect = card.querySelector(
      `[data-dispatch-category-slot="${index}"]`,
    ),
    productSelect = card.querySelector(`[data-dispatch-slot="${index}"]`),
    category = categorySelect?.value || '',
    previous = productSelect?.value || '',
    products = dispatchProducts(lineCode, category);
  if (!productSelect) return;
  productSelect.innerHTML = `<option value="">${category ? '未使用' : '請先選產品類別'}</option>${products.map((product) => `<option value="${product.code}" title="${escapeHtml(dispatchProductText(product))}">${escapeHtml(dispatchProductText(product))}</option>`).join('')}`;
  productSelect.disabled = !category;
  if (products.some((product) => product.code === previous))
    productSelect.value = previous;
  refreshDispatchChoices(card);
}
function editor() {
  normalizeEditorSelection();
  if (!editorSelectionReady())
    return `<section class="page editor-page"><div class="editor-toolbar"><h2>工段流程編輯</h2></div>${editorSelectionPath()}<p class="editor-no-category" data-i18n-skip="true">${editorEmptyMessage()}</p></section>`;
  const editorData = ensureCategoryEditor(),
    selectedLine = lineFor(state.editorLine),
    allowedStages = new Set(selectedLine.stages.map((stage) => stage.code)),
    stageCodes = categoryStageCodes(state.category).filter((code) =>
      allowedStages.has(code),
    );
  const selectedVersion = approvalVersions.find(
    (version) => version.id === state.editorVersionId,
  );
  if (!selectedVersion || selectedVersion.status === 'draft')
    synchronizeWorkspaceBomSelections(editorData);
  const header = `<section class="page editor-page"><div class="editor-toolbar"><div><p class="eyebrow">LINE → CATEGORY → STAGE → OPERATION</p><h2>工段流程編輯</h2><p>黑色標題代表工段；在畫布新增、拖曳及排列流程方塊，箭頭代表下一個流程。</p></div><button class="button signal" id="save-process">儲存製程版本</button></div>${editorSelectionPath(stageCodes.length, stageCodes.reduce((total,code)=>total+(editorData[code]||[]).length,0))}`;
  if(window.ProcessAuthoringV3?.enabled() && window.ProcessEditorV2?.workspace) return header + window.ProcessEditorV2.workspace() + '</section>';
  return `${header}<div class="editor-workspace" style="--inspector-width:${state.inspectorWidth}px"><section class="process-canvas">${stageCodes
    .map((stageCode) => {
      const stage = stageFor(stageCode) || { name: stageCode },
        operations = editorData[stageCode] || [],
        templates = processMaster[stageCode] || [],
        diagnostic = state.editorProblemPlaceholder?.stageCode === stageCode
          ? state.editorProblemPlaceholder
          : null,
        diagnosticY = diagnostic
          ? Math.max(26, ...operations.map((operation, index) => operationGeometry(operation, index).y + 218))
          : 0,
        height = Math.max(
          220,
          ...operations.map(
            (operation, index) => operationGeometry(operation, index).y + 150,
          ),
          diagnostic ? diagnosticY + 170 : 0,
        );
      return `<article class="stage-editor"><header><div><span>${stageCode}</span><h3>${escapeHtml(stage.name)}</h3><small>拖曳方塊調整位置 · 箭頭依流程編號連接</small></div><button class="button ghost add-operation" data-stage="${stageCode}">＋ 新增流程</button></header>${state.addingStage === stageCode ? `<div class="add-flow-menu"><strong>選擇要建立的流程</strong><div>${templates.map((template) => { const photo = processTemplateMediaItems(template)[0]; return `<button class="photo-template-choice" data-add-template="${template.id}" data-stage="${stageCode}">${photo ? `<img src="${escapeHtml(photo.src)}" alt="">` : ''}<b>${escapeHtml(template.name)}</b><small>自動帶入流程照片，可在方塊內更換</small></button>`; }).join('')}<button data-add-custom data-stage="${stageCode}"><b>自訂流程</b><small>自行輸入全部內容</small></button></div></div>` : ''}<div class="flow-canvas" data-stage-canvas="${stageCode}" style="height:${height}px"><svg class="flow-links" width="100%" height="${height}"><defs><marker id="arrow-${stageCode}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z"></path></marker></defs>${operationConnections(operations, stageCode)}</svg>${
        operations.length
          ? operations
              .map((operation, index) => {
                const position = operationGeometry(operation, index);
                return `<article class="operation-block draggable ${operation.id === state.selectedOperation ? 'selected' : ''}" role="button" tabindex="0" draggable="true" style="left:${position.x}px;top:${position.y}px" data-operation="${operation.id}">${operation.media ? `<span class="operation-thumb">${operation.mediaType.startsWith('image/') ? `<img src="${operation.media}" alt="">` : `<span>VIDEO</span>`}</span>` : ''}<span class="operation-number">${operation.number}</span><strong>${escapeHtml(operation.name || '未命名流程')}</strong><small>${operation.productCodes[0] ? `產品 ${operation.productCodes[0]}` : '尚未指定產品'}</small><span class="operation-mode">${operation.mode === 'machine' ? '機器' : '人工'} · ${operation.people || 1} 人</span></article>`;
              })
              .join('')
          : `<div class="stage-empty">點擊「新增流程」開始建立</div>`
      }${diagnostic ? `<aside class="validation-placeholder" data-diagnostic-placeholder style="left:24px;top:${diagnosticY}px"><button type="button" data-dismiss-diagnostic aria-label="關閉提示">×</button><code>${escapeHtml(stageCode)} · 待建立</code><strong>此工段缺少適用流程</strong><span>${escapeHtml(diagnostic.productCode)} 尚未有任何流程方塊套用。</span><small>這是暫時提示，不會寫入正式資料；請從上方選擇流程建立。</small></aside>` : ''}</div></article>`;
    })
    .join(
      '',
    )}</section><dialog class="inspector inspector-v2 editor-modal" id="process-operation-dialog"><div class="inspector-head"><h3>流程設定</h3></div><div id="inspector-form"></div></dialog></div></section>`;
}

function productStatus() {
  const product = selectedStatusProduct() || currentProduct(),
    route = routeFor(product.code);
  if (route?.line) state.editorLine = route.line;
  const editorData = ensureCategoryEditor(),
    stageCodes =
      route?.stages ||
      lineFor(state.editorLine).stages.map((stage) => stage.code);
  const statusStages = stageCodes
    .map((stageCode) => {
      const stage = stageFor(stageCode) || { name: stageCode },
        operations = (editorData[stageCode] || []).filter((operation) =>
          operation.productCodes?.includes(product.code),
        );
      if (!operations.length)
        return `<section class="status-stage"><header><div><code>${stageCode}</code><h3>${escapeHtml(stage.name)}</h3></div><span>0 個流程</span></header><div class="empty">此產品在本工段尚未建立流程</div></section>`;
      const positions = calculateGraphLayout(operations, 540, 560),
        canvasWidth = Math.max(
          1180,
          ...Object.values(positions).map((position) => position.x + 430),
        ),
        canvasHeight = Math.max(
          580,
          ...Object.values(positions).map((position) => position.y + 550),
        );
      const blocks = operations
        .map((operation) => {
          const position = positions[operation.id], type = operationTypeMeta(operation),
            machineCount = operationMachineRows(operation).length,
            photoCount = operationMediaGroups(operation,product.code).filter((group) => group.key !== 'machine').reduce((sum,group) => sum + group.items.length,0);
          return `<article class="status-product-node process-type-${type.key}" data-process-type="${type.key}" style="left:${position.x}px;top:${position.y}px">${productionOperationHeaderMarkup(operation,type,machineCount,photoCount)}<section class="status-node-scroll">${operationNodeBody(operation,product)}</section></article>`;
        })
        .join('');
      return `<section class="status-stage"><header><div><code>${stageCode}</code><h3>${escapeHtml(stage.name)}</h3></div><span>${operations.length} 個流程 · 顯示目前產品的核准版本</span></header><div class="status-product-canvas" style="height:${canvasHeight}px"><svg class="flow-links" width="${canvasWidth}" height="${canvasHeight}"><defs><marker id="status-arrow-${stageCode}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z"></path></marker></defs>${connectionMarkup(operations, stageCode, positions, 390, 68, 'status-arrow')}</svg>${blocks}</div></section>`;
    })
    .join('');
  return `<section class="page status-page"><div class="toolbar status-filters">${productStatusSelects()}</div><div class="status-hero"><div><p class="eyebrow">SINGLE PRODUCT PROCESS</p><h2>產品製程結果</h2><p>依編輯台連線呈現單一產品的流程分支、匯流、BOM、設備、照片、備註與 IPQC。</p></div><div class="status-product-meta"><code>${escapeHtml(product.code)}</code><b>${escapeHtml(product.name)}</b><span>${escapeHtml(product.specification || '')} · ${state.editorLine} 線</span></div></div><div class="status-route">${stageCodes.map((stageCode) => `<span>${stageCode}</span>`).join('<i>→</i>')}</div>${statusStages}</section>`;
}
function approval() {
  const selected =
      approvalVersions.find(
        (version) => version.id === state.approvalVersionId,
      ) || approvalVersions[0],
    statusLabel = {
      pending: '待確認',
      approved: '已核准',
      rejected: '退回修改',
    };
  return `<section class="page approval-page"><div class="approval-head"><div><p class="eyebrow">PROCESS VERSION CONTROL</p><h2>製程版本確認平台</h2><p>製程編輯台每次儲存後會建立送審版本，保留完整歷史供 RD 主管確認。</p></div><div class="approval-stats"><span><b>${approvalVersions.length}</b>全部版本</span><span><b>${approvalVersions.filter((item) => item.status === 'pending').length}</b>待確認</span><span><b>${approvalVersions.filter((item) => item.status === 'approved').length}</b>已核准</span></div></div><div class="approval-layout"><aside class="version-list">${approvalVersions.length ? approvalVersions.map((version) => `<button class="version-item ${selected?.id === version.id ? 'active' : ''}" data-version="${version.id}"><span class="version-status ${version.status}">${statusLabel[version.status]}</span><b>V${version.number} · ${escapeHtml(version.category)}</b><small>${version.line} 線 · ${escapeHtml(version.creatorName)} · ${new Date(version.createdAt).toLocaleString('zh-TW')}</small></button>`).join('') : `<div class="empty">尚無送審版本</div>`}</aside><section class="version-detail">${
    selected
      ? `<header><div><code>VERSION ${selected.number}</code><h3>${escapeHtml(selected.category)} · ${selected.line} 線</h3><p>建立者 ${escapeHtml(selected.creatorName)} · ${new Date(selected.createdAt).toLocaleString('zh-TW')}</p></div><span class="version-status ${selected.status}">${statusLabel[selected.status]}</span></header><div class="version-stage-grid">${Object.entries(
          selected.stages || {},
        )
          .map(
            ([stageCode, operations]) =>
              `<article><b>${stageCode} · ${escapeHtml(stageFor(stageCode)?.name || stageCode)}</b><span>${operations.length} 個流程</span><div>${operations.map((operation) => `<small>${escapeHtml(operation.number)}　${escapeHtml(operation.name)}</small>`).join('')}</div></article>`,
          )
          .join(
            '',
          )}</div>${selected.reviewNote ? `<div class="review-note"><b>確認紀錄</b><p>${escapeHtml(selected.reviewNote)}</p><small>${escapeHtml(selected.reviewerName || '')} · ${selected.reviewedAt ? new Date(selected.reviewedAt).toLocaleString('zh-TW') : ''}</small></div>` : ''}${canApprove() && selected.status === 'pending' ? `<div class="approval-actions"><div class="field"><label>確認意見</label><textarea id="review-note" placeholder="填寫核准或退回原因"></textarea></div><button class="button ghost" data-review="rejected">退回修改</button><button class="button signal" data-review="approved">確認核准</button></div>` : ''}`
      : `<div class="empty">從左側選擇版本查看內容</div>`
  }</section></div></section>`;
}
function userManagementView() {
  const allViews = [
    ['dashboard', '總覽'],
    ['player', '產線播放台'],
    ['dispatch', '發送介面'],
    ['productStatus', '產品製程狀態'],
    ['approval', '版本確認平台'],
    ['editor', '製程編輯台'],
    ['data', '資料後台'],
  ];
  return `<div class="user-admin"><div class="master-toolbar"><div><p class="eyebrow">USERS & PERMISSIONS</p><h2>平台使用者與功能權限</h2><p>勾選使用者可以看到的左側功能與可操作線別。</p></div></div><div class="user-create panel"><div class="field"><label>帳號</label><input id="new-user-id" placeholder="例如 chen.rd"></div><div class="field"><label>姓名</label><input id="new-user-name" placeholder="使用者姓名"></div><div class="field"><label>密碼</label><input id="new-user-password" type="password" autocomplete="new-password"></div><div class="field"><label>角色</label><select id="new-user-role"><option value="staff">製程人員</option><option value="rd">RD 主管</option><option value="admin">ADMIN</option></select></div><button class="button signal" id="add-user">建立使用者</button></div><div class="user-grid">${platformUsers.map((user) => `<article class="user-card" data-user-id="${user.id}"><header><div><b>${escapeHtml(user.name)}</b><code>${escapeHtml(user.id)}</code></div><span>${roleLabels[user.role] || user.role}</span></header><fieldset><legend>線別權限</legend>${['A', 'B', 'C'].map((line) => `<label><input type="checkbox" data-user-line="${line}" ${user.lines?.includes(line) ? 'checked' : ''}>${line} 線</label>`).join('')}</fieldset><fieldset><legend>左側功能權限</legend>${allViews.map(([view, label]) => `<label><input type="checkbox" data-user-view="${view}" ${user.views?.includes(view) ? 'checked' : ''}>${label}</label>`).join('')}</fieldset><button class="button ghost save-user">儲存權限</button></article>`).join('')}</div></div>`;
}
function dataView() {
  return `<section class="page"><div class="tabs"><button class="tab active" data-tab="products">產品與線別</button><button class="tab" data-tab="bom">BOM 資料</button><button class="tab" data-tab="lines">線別與工段</button><button class="tab" data-tab="process-master">流程資料</button><button class="tab" data-tab="users">使用者與權限</button></div><div id="data-content">${productTable()}</div></section>`;
}
function productTable() {
  return `<div class="import-drop"><strong>✓ 產品分類與製程路線已合併</strong><p>分類：${data.meta.productSource} · 線別／製程：${routing.meta.source} · ${routing.meta.matchedCategoryCount} 筆成功對應</p><button class="button ghost" id="simulate-import">重新匯入 PDF / Excel</button></div><div class="toolbar"><div class="field"><label>搜尋產品</label><input id="product-search" placeholder="輸入類別、編號或名稱"></div><span class="tag">分類不採用 Excel</span></div><div class="table-wrap"><table><thead><tr><th>PDF 產品類別</th><th>產品編號</th><th>產品名稱</th><th>規格</th><th>線別</th><th>製程路線</th></tr></thead><tbody id="product-body">${productRows(data.products.slice(0, 120))}</tbody></table></div>`;
}
function productRows(rows) {
  return rows
    .map((p) => {
      const route = routeFor(p.code);
      return `<tr><td>${escapeHtml(p.category)}</td><td><code>${p.code}</code></td><td>${escapeHtml(p.name)}</td><td>${escapeHtml(p.specification || '—')}</td><td>${escapeHtml(route?.line || '待建立')}</td><td><code>${escapeHtml(route?.stages.join(' → ') || '待建立')}</code></td></tr>`;
    })
    .join('');
}
function bomTable() {
  const bomProducts = Object.keys(data.bom);
  const selected = data.bom[state.productCode]
    ? state.productCode
    : bomProducts[0];
  return `<div class="import-drop"><strong>✓ BOM 表已匯入</strong><p>${data.meta.bomSource} · ${data.meta.bomProductCount} 個成品 · ${data.meta.bomRowCount.toLocaleString()} 筆組成</p></div><div class="toolbar"><div class="field"><label>成品編號</label><select id="bom-product-select">${bomProducts.map((code) => `<option ${code === selected ? 'selected' : ''}>${code}</option>`).join('')}</select></div></div><div class="table-wrap"><table><thead><tr><th>層級</th><th>料號</th><th>品名</th><th>規格</th><th>單位</th><th>定額</th><th>損耗</th></tr></thead><tbody>${(data.bom[selected] || []).map((r) => `<tr><td>${r.levelLabel}</td><td><code>${escapeHtml(r.itemCode || '成品')}</code></td><td>${escapeHtml(r.itemName)}</td><td>${escapeHtml(r.specification)}</td><td>${escapeHtml(r.unit)}</td><td>${escapeHtml(r.quantity)}</td><td>${escapeHtml(r.waste)}</td></tr>`).join('')}</tbody></table></div>`;
}
function lineData() {
  return `<div class="grid stats"><article class="stat"><label>成品製程</label><strong>${routing.meta.finishedCount}</strong><small>${routing.meta.matchedCategoryCount} 筆對應 PDF 類別</small></article><article class="stat"><label>半成品製程</label><strong>${routing.meta.semiFinishedCount}</strong><small>來自 SKU BTP</small></article><article class="stat"><label>生產線</label><strong>${routing.lines.length}</strong><small>A／B／C 線</small></article><article class="stat"><label>待確認分類</label><strong>${routing.meta.unmatchedCount}</strong><small>Excel 有資料、PDF 無產品碼</small></article></div><div class="panel"><div class="panel-head"><h3>線別與製程工段</h3><span class="tag">MASTER SKU</span></div>${routing.lines.map((line) => `<section class="route-section"><div class="route-title"><span class="line-badge">${line.code}</span><div><b>${escapeHtml(line.name)}</b><small>${line.stages.length} 個製程工段</small></div></div><div class="grid machine-grid">${line.stages.map((stage) => `<article class="machine"><b>${stage.code}　${escapeHtml(stage.name)}</b><small>設備：${escapeHtml(stage.machine)}</small><small>固定資產：${escapeHtml(stage.assetNumber)} · 人數：${stage.operators || '待設定'}</small></article>`).join('')}</div></section>`).join('')}</div>`;
}
function canDeleteProcessMaster() {
  const allowed =
    typeof window.hasPermission === 'function'
      ? window.hasPermission('master.delete')
      : currentUser?.role === 'admin';
  if (!allowed) return false;
  return !processMasterPending();
}
function canExchangeProcessMaster(permission) {
  return typeof window.hasPermission === 'function'
    ? window.hasPermission(permission)
    : currentUser?.role === 'admin';
}
function processMasterControl() {
  return window.MasterDataWorkflow?.control?.() || null;
}
function processMasterVersions() {
  return (processMasterControl()?.versions || [])
    .filter((item) => item.scope === 'PROCESS')
    .sort((a, b) => (b.number || 0) - (a.number || 0));
}
function processMasterDraft() {
  return processMasterVersions().find((item) => item.status === 'draft');
}
function processMasterPending() {
  return processMasterVersions().find((item) => item.status === 'pending');
}
function selectedProcessMasterVersion() {
  const versions = processMasterVersions();
  return (
    versions.find((item) => item.id === state.processMasterVersionId) ||
    processMasterDraft() ||
    processMasterPending() ||
    versions[0]
  );
}
function currentProcessMasterData() {
  return selectedProcessMasterVersion()?.snapshot || processMaster;
}
function editableProcessMasterData() {
  const selected = selectedProcessMasterVersion();
  return selected?.status === 'draft'&&window.MasterDataWorkflow?.shared.permissions('PROCESS')?.edit!==false ? selected.snapshot : null;
}
function persistProcessMasterControl() {
  return window.MasterDataWorkflow?.persist?.('PROCESS');
}
async function applyProcessMasterSnapshot(before,next) {
  const shared=window.MasterDataWorkflow.shared,{patches,guards}=shared.diff(before,next);
  if(patches.length)await shared.patch('PROCESS',patches,guards);
}
const processMasterNameBindings=new Set();
function bindProcessMasterName(input) {
  const shared=window.MasterDataWorkflow.shared,owner=window.ProcessSync?.identity,generation=shared.flow('PROCESS')?.generation;
  const key=input.closest('.master-template')?.dataset.templateKey,snapshot=editableProcessMasterData();
  if(!snapshot)return;
  const previous=[...processMasterNameBindings].find(binding=>binding.owner===owner&&binding.generation===generation&&binding.key===key&&!binding.input.isConnected&&!binding.clean());
  if(previous){previous.transfer(input);return;}
  const ids=new Set(processMasterCatalogMatches(snapshot,key).map(template=>template.id));
  let baseline=Object.entries(snapshot).flatMap(([stage,list])=>list.filter(template=>ids.has(template.id)).map(template=>({path:[stage,{id:template.id},'name'],value:template.name})));
  let pending=Promise.resolve(),failure=null,lastQueued=input.value,composing=false,active=0;
  const owned=()=>input.isConnected&&window.ProcessSync?.identity===owner&&shared.flow('PROCESS')?.generation===generation&&Boolean(editableProcessMasterData());
  const synchronize=()=>{
    const value=input.value;
    if(failure||lastQueued===value)return;
    lastQueued=value;active++;
    pending=pending.then(async()=>{
      if(failure)return;
      if(!owned())throw Error('DEPENDENCY_CHANGED_RECONFIRM');
      const changed=baseline.filter(row=>row.value!==value);
      if(!changed.length)return;
      const patches=changed.map(row=>({op:'set',path:row.path,value})),guards=changed.map(row=>({path:row.path,value:row.value}));
      await shared.patch('PROCESS',patches,guards);
      if(!owned())throw Error('DEPENDENCY_CHANGED_RECONFIRM');
      // Advance only values confirmed by this successful command, never a fresh remote snapshot.
      baseline=baseline.map(row=>({path:row.path,value}));
      updateProcessSharedStatus();
    }).catch(error=>{if(!failure){failure=error;if(owned())toast(window.sharedDraftErrorMessage?.(error)||error.message);}}).finally(()=>{active--;});
  };
  const drain=async()=>{
    let current;do{current=pending;await current;}while(current!==pending);
    if(failure)throw failure;
    if(composing)throw Error('OPERATION_IN_PROGRESS');
    if(!owned())throw Error('DEPENDENCY_CHANGED_RECONFIRM');
  };
  const binding={input,owner,generation,key,drain,clean:()=>!active&&!failure&&!composing};
  const attach=()=>{
    const attached=input;
    input.processMasterNameFlush=drain;
    input.oncompositionstart=()=>{if(input===attached)composing=true;};
    input.oninput=event=>{if(input!==attached)return;composing=!!event.isComposing;if(!composing)synchronize();};
    input.oncompositionend=()=>{if(input!==attached)return;composing=false;synchronize();};
  };
  binding.transfer=next=>{
    const visible=input.value;
    input.oninput=input.oncompositionstart=input.oncompositionend=null;
    input=next;binding.input=next;input.value=visible;attach();
  };
  processMasterNameBindings.add(binding);attach();
}
async function flushProcessMasterNames() {
  const owner=window.ProcessSync?.identity,generation=window.MasterDataWorkflow.shared.flow('PROCESS')?.generation,waiting=[];
  for(const binding of processMasterNameBindings){
    if(binding.owner!==owner||binding.generation!==generation){if(binding.input.isConnected)throw Error('DEPENDENCY_CHANGED_RECONFIRM');processMasterNameBindings.delete(binding);continue;}
    if(!binding.input.isConnected&&binding.clean()){processMasterNameBindings.delete(binding);continue;}
    waiting.push(binding.drain());
  }
  await Promise.all(waiting);
  if(window.ProcessSync?.identity!==owner||window.MasterDataWorkflow.shared.flow('PROCESS')?.generation!==generation)throw Error('DEPENDENCY_CHANGED_RECONFIRM');
}
function updateProcessSharedStatus() {
  const shared=window.MasterDataWorkflow?.shared,flow=shared?.flow('PROCESS');
  const bar=document.querySelector('.process-master-version')||(state.dataTab==='process-master'?document.querySelector('#data-content .vd-card'):null);if(!bar||!flow)return;
  const t=(zh,vi)=>document.documentElement.lang==='vi'?vi:zh;
  let panel=document.querySelector('#process-shared-status');
  if(!panel){panel=document.createElement('section');panel.id='process-shared-status';panel.className='master-edit-note';panel.setAttribute('role','status');bar.before(panel);}
  const dirty=JSON.stringify(flow.working)!==JSON.stringify(flow.saved?.content);
  panel.innerHTML=`<p>${t('共用草稿範圍','Phạm vi bản nháp chung')}: PROCESS · ${flow.pendingId?t('待審鎖定','Đang chờ duyệt · đã khóa'):dirty?t('尚未儲存','Chưa lưu'):t('已儲存','Đã lưu')} · ${t('儲存者','Người lưu')}: ${escapeHtml(flow.saved?.actor.name||'—')}</p><div class="master-version-actions"><button type="button" class="button ghost" data-process-history>${t('固定案件／歷史還原','Hồ sơ cố định / Khôi phục')}</button><button type="button" class="button ghost" data-process-recover>${t('查詢未知操作結果','Kiểm tra kết quả chưa rõ')}</button></div>`;
  shared.renderValidation('PROCESS',{after:panel,label:issue=>issue.path?.[0]+' / '+(issue.path?.[1]?.id||''),onLocate:issue=>{
    if(shared.permissions('PROCESS')?.edit===false)return;
    state.processMasterVersionId=processMasterDraft()?.id;render();
    const template=shared.flow('PROCESS')?.working[issue.path?.[0]]?.find(row=>row.id===issue.path?.[1]?.id);
    const key=processMasterTemplateKey(template),card=[...document.querySelectorAll('[data-template-key]')].find(row=>row.dataset.templateKey===key);
    if(issue.path?.[2]==='equipment'){
      window.ProcessEquipment?.locate(issue.path?.[3]?.id, 'name');
    }else{const target=card?.querySelector('[data-master-name]');target?.scrollIntoView({block:'center'});target?.focus({preventScroll:true});}
  }});
  panel.querySelector('[data-process-history]').onclick=()=>shared.history('PROCESS').catch(error=>toast(error.message));
  panel.querySelector('[data-process-recover]').onclick=()=>shared.recover('PROCESS').catch(error=>toast(error.message));
  window.VersionDraftUI?.updateSaved(document.querySelector('#data-content .vd-card'),flow);
  if(bar.classList.contains('vd-card'))panel.replaceChildren();
}
function recordProcessMasterVersion(version, label, note = '') {
  window.MasterDataWorkflow?.record?.(version, label, note);
}
function validateProcessMasterSnapshot(snapshot) {
  const errors = [],
    allStages = routing.lines.flatMap((line) => line.stages);
  allStages.forEach((stage) => {
    const templates = snapshot?.[stage.code];
    if (!Array.isArray(templates)) {
      errors.push(`${stage.code}：缺少流程清單`);
      return;
    }
    const ids = new Set();
    PROCESS_TEMPLATE_PRESETS.forEach((preset) => {
      if (!templates.some((template) => template.presetKey === preset.key))
        errors.push(`${stage.code}：缺少標準流程 ${preset.name}`);
    });
    templates.forEach((template, index) => {
      const id = String(template?.id || '').trim(),
        name = String(template?.name || '').trim();
      if (!id || !name)
        errors.push(`${stage.code} 第 ${index + 1} 項：缺少流程編號或名稱`);
      if (id && ids.has(id)) errors.push(`${stage.code}：流程編號 ${id} 重複`);
      ids.add(id);
    });
  });
  errors.push(...(window.ProcessEquipment?.validate(snapshot) || []));
  return errors;
}
window.ProcessMasterVersioning = {
  validate: validateProcessMasterSnapshot,
  showVersion(id) {
    state.processMasterVersionId = id;
    state.dataTab = 'process-master';
    state.view = 'data';
    render();
  },
};
async function beginProcessMasterDraft() {
  const actorId=currentUser?.id;
  try{await window.MasterDataWorkflow.shared.execute('PROCESS','begin');
    const draft=processMasterDraft();
    if(currentUser?.id!==actorId||!draft||processMasterPending()||window.MasterDataWorkflow.shared.permissions('PROCESS')?.edit===false)return false;
    state.processMasterVersionId=draft.id;render();return true;
  }catch(error){toast(error.message);return false;}
}

async function saveProcessMasterDraft() {
  try{await flushProcessMasterNames();await window.MasterDataWorkflow.shared.execute('PROCESS','save');
    toast(document.documentElement.lang==='vi'?'Đã lưu nội dung đã đồng bộ.':'已儲存全員已同步內容。');
    if(!document.querySelector('#equipment-editor-dialog[open]'))render();
  }catch(error){toast(window.sharedDraftErrorMessage?.(error)||error.message);}
}
async function submitProcessMasterDraft() {
  try{await flushProcessMasterNames();const result=await window.MasterDataWorkflow.shared.submit('PROCESS');if(!result)return;
    state.masterReviewId=result.receipt.caseId;state.processMasterVersionId=result.receipt.caseId;render();
  }catch(error){updateProcessSharedStatus();toast(window.sharedDraftErrorMessage?.(error)||error.message);}
}
async function withdrawProcessMasterDraft() {
  const version = processMasterPending();
  if(!version)return;
  try{const result=await window.MasterDataWorkflow.shared.review('PROCESS','withdraw',version.id);if(!result)return;
    state.processMasterVersionId=processMasterDraft()?.id;render();
  }catch(error){toast(error.message);}
}
function processMasterVersionBar() {
  const versions = processMasterVersions(),
    selected = selectedProcessMasterVersion(),
    active = versions.find((item) => item.status === 'approved'),
    draft = processMasterDraft(),
    pending = processMasterPending(),
    status = {
      draft: '草稿 · 未送審',
      pending: '主管審核中',
      approved: '已核准',
      superseded: '歷史核准',
    };
  if (!selected) return '';
  return `<section class="master-version-bar process-master-version"><div><small>PROCESS MASTER VERSION</small><h3>流程資料 · V${selected.number} <span class="master-status ${selected.status}">${status[selected.status] || selected.status}</span></h3><p>${selected.status === 'draft' ? '先儲存草稿，再送主管審核；核准前不會影響製程編輯台。' : '唯讀查閱；製程編輯台目前使用已核准版本。'} 目前生效：V${active?.number || 1}</p></div><label class="master-version-select">選擇版本／草稿<select id="process-master-version-choice">${versions.map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === selected.id ? 'selected' : ''}>V${item.number} · ${status[item.status] || item.status} · ${new Date(item.updatedAt).toLocaleString('zh-TW')}</option>`).join('')}</select></label><div class="master-version-actions">${!draft && !pending ? '<button class="button signal" id="process-master-new-draft">建立新版本草稿</button>' : ''}${selected.status === 'draft' ? '<button class="button ghost" id="save-master-data">儲存草稿</button><button class="button signal" id="process-master-submit">送出主管審核</button>' : ''}${selected.status === 'pending' && (selected.creatorId === currentUser?.id || currentUser?.role === 'admin' || canExchangeProcessMaster('approval.withdraw')) ? '<button class="button ghost" id="process-master-withdraw">解除送審，繼續修改</button>' : ''}${selected.status === 'pending' ? '<button class="button ghost" id="process-master-review">查看送審案件</button>' : ''}</div></section><details class="master-history process-master-history"><summary>版本紀錄與操作歷程 · ${versions.length}</summary><div>${versions.map((item) => `<button type="button" data-process-master-history="${escapeHtml(item.id)}"><b>V${item.number} · ${status[item.status] || item.status}</b><small>${escapeHtml(item.creatorName)} · ${new Date(item.updatedAt).toLocaleString('zh-TW')}</small></button>`).join('')}</div></details>`;
}
function processMasterExcelRows(source) {
  const templates = [],
    photos = [],
    chunkSize = 28000;
  Object.entries(source || {}).forEach(([stageCode, list]) => {
    (list || []).forEach((template, index) => {
      const extra = { ...template };
      for (const key of [
        'id',
        'name',
        'presetKey',
        'presetVersion',
        'mode',
        'people',
        'machineIds',
        'media',
        'mediaName',
        'mediaType',
        'mediaItems',
        'equipment',
      ])
        delete extra[key];
      templates.push({
        工段編號: stageCode,
        流程順序: index + 1,
        流程編號: template.id,
        流程名稱: template.name,
        標準流程代碼: template.presetKey || '',
        標準流程版本: template.presetVersion || '',
        相容方式: template.mode || 'human',
        相容人數: template.people || 1,
        相容設備: (template.machineIds || []).join('|'),
        其他資料JSON: Object.keys(extra).length ? JSON.stringify(extra) : '',
      });
      processTemplateMediaItems(template).forEach((media, mediaIndex) => {
        const src = String(media.src || ''),
          parts = Math.max(1, Math.ceil(src.length / chunkSize));
        for (let part = 0; part < parts; part++)
          photos.push({
            工段編號: stageCode,
            流程編號: template.id,
            照片順序: mediaIndex + 1,
            檔名: media.name || '',
            類型: media.type || '',
            分段順序: part + 1,
            分段總數: parts,
            照片資料: src.slice(part * chunkSize, (part + 1) * chunkSize),
          });
      });
    });
  });
  return { templates, photos };
}
async function exportProcessMasterData() {
  if(window.MasterDataWorkflow?.shared){toast('NON_BOM_EXCHANGE_DISABLED');return;}
  if (!canExchangeProcessMaster('master.export')) {
    toast('此帳號沒有匯出權限。');
    return;
  }
  let source;
  try {
    toast('正在整理全部流程、設備與照片，請稍候');
    source = window.ProcessEquipment ? await window.ProcessEquipment.portable(currentProcessMasterData()) : currentProcessMasterData();
  } catch (error) { toast(error.message || '照片匯出失敗'); return; }
  const
    rows = processMasterExcelRows(source),
    workbook = XLSX.utils.book_new(),
    metadata = [
      ['欄位', '內容'],
      ['格式', PROCESS_MASTER_EXCEL_FORMAT],
      ['格式版本', PROCESS_MASTER_EXCEL_FORMAT_VERSION],
      ['網站版本', '2026.09.11.6200'],
      ['匯出時間', new Date().toISOString()],
      ['版本編號', selectedProcessMasterVersion()?.number || 1],
    ];
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet(metadata),
    '格式說明',
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(rows.templates),
    '流程資料',
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(rows.photos),
    '照片資料',
  );
  window.ProcessEquipment?.exportSheets(workbook, source);
  XLSX.writeFile(
    workbook,
    `流程資料_全部_${new Date().toISOString().slice(0, 10)}.xlsx`,
  );
  toast('全部流程、設備資料與照片已匯出為 Excel');
}
function normalizeImportedProcessMaster(parsed) {
  if (
    parsed?.format === 'PROCESS_OS_PROCESS_MASTER' &&
    Number(parsed.formatVersion) > 1
  )
    throw new Error('此匯入檔版本較新，請先更新系統後再匯入。');
  const imported =
    parsed?.data?.processMasterData ??
    parsed?.processMasterData ??
    (parsed?.format ? null : parsed);
  if (!imported || typeof imported !== 'object' || Array.isArray(imported))
    throw new Error('這不是有效的流程資料匯出檔。');
  const result = {},
    allStages = routing.lines.flatMap((line) => line.stages),
    validCodes = new Set(allStages.map((stage) => stage.code));
  let skippedStages = 0;
  Object.keys(imported).forEach((code) => {
    if (!validCodes.has(code)) skippedStages++;
  });
  allStages.forEach((stage) => {
    const rawTemplates = imported[stage.code];
    if (rawTemplates !== undefined && !Array.isArray(rawTemplates))
      throw new Error(`${stage.code} 的流程清單格式不正確。`);
    const ids = new Set(),
      normalized = (rawTemplates || []).map((raw, index) => {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw))
          throw new Error(`${stage.code} 第 ${index + 1} 項流程格式不正確。`);
        const id = String(raw.id || '').trim(),
          name = String(raw.name || '').trim();
        if (!id || !name)
          throw new Error(`${stage.code} 第 ${index + 1} 項缺少流程編號或名稱。`);
        if (ids.has(id)) throw new Error(`${stage.code} 有重複的流程編號 ${id}。`);
        ids.add(id);
        const template = {
          ...raw,
          id,
          name,
          mode: raw.mode === 'machine' ? 'machine' : 'human',
          people: Math.max(1, Number(raw.people) || 1),
          machineIds: Array.isArray(raw.machineIds)
            ? raw.machineIds.map(String)
            : [],
        };
        setProcessTemplateMedia(
          template,
          processTemplateMediaItems(raw)
            .filter((item) => item && typeof item.src === 'string')
            .map((item) => ({
              ...item,
              src: item.src,
              name: String(item.name || `${name} 流程照片`),
              type: String(item.type || 'image/png'),
            })),
        );
        return template;
      });
    result[stage.code] = mergeRequiredProcessPresets(
      stage,
      normalized,
      true,
    );
  });
  return { data: result, skippedStages };
}
async function readProcessMasterExcel(file) {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' }),
    metaRows = XLSX.utils.sheet_to_json(workbook.Sheets['格式說明'], {
      header: 1,
      defval: '',
    }),
    metadata = Object.fromEntries(metaRows.slice(1).map((row) => [row[0], row[1]]));
  if (metadata['格式'] !== PROCESS_MASTER_EXCEL_FORMAT)
    throw new Error('這不是流程資料 Excel 匯出檔。');
  if (Number(metadata['格式版本']) > PROCESS_MASTER_EXCEL_FORMAT_VERSION)
    throw new Error('此 Excel 版本較新，請先更新系統後再匯入。');
  const templateSheet = workbook.Sheets['流程資料'],
    photoSheet = workbook.Sheets['照片資料'];
  if (!templateSheet) throw new Error('Excel 缺少「流程資料」工作表。');
  const templateRows = XLSX.utils.sheet_to_json(templateSheet, { defval: '' }),
    photoRows = photoSheet
      ? XLSX.utils.sheet_to_json(photoSheet, { defval: '' })
      : [],
    photoGroups = new Map();
  photoRows.forEach((row) => {
    const key = `${row['工段編號']}\u0000${row['流程編號']}\u0000${Number(row['照片順序']) || 1}`;
    const group = photoGroups.get(key) || [];
    group.push(row);
    photoGroups.set(key, group);
  });
  const imported = {};
  templateRows
    .sort(
      (a, b) =>
        String(a['工段編號']).localeCompare(String(b['工段編號'])) ||
        (Number(a['流程順序']) || 0) - (Number(b['流程順序']) || 0),
    )
    .forEach((row) => {
      const stageCode = String(row['工段編號'] || '').trim(),
        id = String(row['流程編號'] || '').trim();
      let extra = {};
      if (row['其他資料JSON']) {
        try {
          extra = JSON.parse(row['其他資料JSON']);
        } catch {
          throw new Error(`${stageCode} · ${id} 的其他資料 JSON 格式錯誤。`);
        }
      }
      const mediaItems = [...photoGroups.entries()]
        .filter(([key]) => key.startsWith(`${stageCode}\u0000${id}\u0000`))
        .sort((a, b) => Number(a[0].split('\u0000')[2]) - Number(b[0].split('\u0000')[2]))
        .map(([, parts]) => {
          const ordered = parts.sort(
            (a, b) =>
              (Number(a['分段順序']) || 0) - (Number(b['分段順序']) || 0),
          );
          if (ordered.length !== Number(ordered[0]['分段總數'] || 1))
            throw new Error(`${stageCode} · ${id} 的照片資料不完整。`);
          return {
            src: ordered.map((part) => String(part['照片資料'] || '')).join(''),
            name: String(ordered[0]['檔名'] || ''),
            type: String(ordered[0]['類型'] || ''),
          };
        });
      const template = {
        ...extra,
        id,
        name: String(row['流程名稱'] || '').trim(),
        presetKey: String(row['標準流程代碼'] || '').trim() || undefined,
        presetVersion:
          String(row['標準流程版本'] || '').trim() || undefined,
        mode: row['相容方式'] === 'machine' ? 'machine' : 'human',
        people: Math.max(1, Number(row['相容人數']) || 1),
        machineIds: String(row['相容設備'] || '')
          .split('|')
          .map((value) => value.trim())
          .filter(Boolean),
        mediaItems,
      };
      setProcessTemplateMedia(template, mediaItems);
      (imported[stageCode] || (imported[stageCode] = [])).push(template);
    });
  window.ProcessEquipment?.readSheets(workbook, imported, Number(metadata['格式版本']));
  await window.ProcessEquipment?.restorePhotos(workbook, imported, Number(metadata['格式版本']));
  return normalizeImportedProcessMaster(imported);
}
async function importProcessMasterData(file) {
  if(window.MasterDataWorkflow?.shared){toast('NON_BOM_EXCHANGE_DISABLED');return;}
  if (!file || !canExchangeProcessMaster('master.import')) {
    if (file) toast('此帳號沒有匯入權限。');
    return;
  }
  const version = processMasterDraft();
  if (!version) {
    toast('請先建立新版本草稿再匯入 Excel');
    return;
  }
  let normalized;
  try {
    normalized = await readProcessMasterExcel(file);
  } catch (error) {
    toast(error.message || '流程資料匯入失敗');
    return;
  }
  if (
    !window.confirm(
      'Excel 匯入會取代目前流程資料草稿內所有工段、流程、設備與照片，確定繼續？',
    )
  )
    return;
  if (version !== processMasterDraft() || !editableProcessMasterData()) {
    toast('草稿狀態已改變，請重新選擇草稿後匯入');
    return;
  }
  version.snapshot = normalized.data;
  recordProcessMasterVersion(version, '匯入流程資料 Excel');
  persistProcessMasterControl();
  document.querySelector('#data-content').innerHTML = processMasterView();
  bindDataInner('process-master');
  toast(
    normalized.skippedStages
      ? `Excel 已匯入草稿；略過 ${normalized.skippedStages} 個已不存在的工段`
      : '全部流程資料與照片已匯入草稿',
  );
}
function processTemplateImpact(templateIds) {
  const ids = new Set(Array.isArray(templateIds) ? templateIds : [templateIds]);
  const drafts = Object.values(state.editorByCategory || {})
      .flatMap((set) => Object.values(set || {}).flat())
      .filter((operation) => ids.has(operation.templateId)).length,
    versions = approvalVersions.filter((version) =>
      Object.values(version.stages || {})
        .flat()
        .some((operation) => ids.has(operation.templateId)),
    ).length;
  return { drafts, versions };
}
async function deleteProcessTemplate(stageCode, templateKey) {
  const before = editableProcessMasterData();
  if (!before) {
    toast('請先建立或切回流程資料草稿');
    return;
  }
  const editable=JSON.parse(JSON.stringify(before));
  if (!canDeleteProcessMaster()) {
    toast(
      typeof window.hasPermission === 'function' &&
        !window.hasPermission('master.delete')
        ? '此帳號沒有刪除權限。'
        : '目前有主資料正在送審，為避免版本衝突，暫停刪除。',
    );
    return;
  }
  const matches = processMasterCatalogMatches(editable, templateKey),
    template = matches[0],
    impact = processTemplateImpact(matches.map((item) => item.id));
  if (
    !window.confirmMasterDeletion(
      `刪除流程資料「${template?.name || templateKey}」？\n\n影響範圍：\n• 所有工段的新增流程選項：移除 1 項\n• 編輯中草稿引用：${impact.drafts} 個（保留內容，改為自訂流程）\n• 歷史／送審版本：${impact.versions} 版（保留紀錄，不會刪除）\n\n確定刪除？`,
    )
  )
    return;
  Object.keys(editable).forEach((code) => {
    editable[code] = (editable[code] || []).filter(
      (item) => processMasterTemplateKey(item) !== templateKey,
    );
  });
  try{await applyProcessMasterSnapshot(before,editable);}catch(error){toast(error.message);return;}
  document.querySelector('#data-content').innerHTML = processMasterView();
  bindDataInner('process-master');
  toast('流程已從草稿移除；既有製程方塊與歷史版本不受影響');
}
function processMasterView() {
  const pageMaster = currentProcessMasterData(),
    templates = processMasterCatalogTemplates(pageMaster),
    editable = Boolean(editableProcessMasterData());

  return `${processMasterVersionBar()}<div class="master-toolbar process-photo-master"><div><p class="eyebrow">OPERATION MASTER</p><h2>製程編輯台可用流程</h2><p>流程核准後可供製程編輯台使用。</p></div><div class="process-master-toolbar"><div class="process-master-actions">${editable ? '<button class="button signal" type="button" id="add-master-template">＋ 新增流程</button>' : ''}</div></div></div><div class="master-template-grid flow-photo-presets">${templates
    .map(
      (template, index) => {
        const mediaItems = processTemplateMediaItems(template),
          key = processMasterTemplateKey(template),
          equipmentButton = window.ProcessEquipment?.cardButton(template) || '';
        return `<article class="master-template photo-template" data-template-id="${escapeHtml(template.id)}" data-template-key="${escapeHtml(key)}"><div class="template-head"><span class="template-order">${index + 1}</span><div><label class="template-name-field"><span>流程名稱</span><input data-master-name value="${escapeHtml(template.name)}" maxlength="80" ${editable ? '' : 'disabled'}></label></div><div class="template-head-actions"><span class="template-auto-tag">${template.presetKey ? '標準流程 · 自動帶入方塊' : '自訂流程 · 自動帶入方塊'}</span>${equipmentButton}${editable && !template.presetKey && canDeleteProcessMaster() ? `<button class="button danger compact" type="button" data-delete-template="${escapeHtml(key)}">刪除流程</button>` : ''}</div></div>${mediaItems.length ? `<div class="master-template-media-grid">${mediaItems.map((item, mediaIndex) => `<figure><img decoding="async" loading="lazy" src="${escapeHtml(item.src)}" alt="${escapeHtml(template.name)}">${editable ? `<button type="button" data-remove-template-media="${mediaIndex}" aria-label="移除照片">×</button>` : ''}</figure>`).join('')}</div>` : `<div class="master-template-empty">此流程尚未設定照片</div>`}${editable ? '<label class="media-upload master-template-upload"><input data-master-media type="file" accept="image/*" multiple><span>＋ 上傳或加入更多照片</span><small>照片會自動壓縮並套用到所有工段的新方塊。</small></label>' : ''}</article>`;
      },
    )
    .join(
      '',
    )}</div>`;
}

function bindView() {
  bindCommon();
  bindProductSelects();
  if (state.view === 'productStatus') bindStatusSelects();
  if (state.view === 'player') {
    const lineSelect = document.querySelector('#device-line'),
      stageSelect = document.querySelector('#device-stage');
    if (currentUser?.role === 'device') {
      lineSelect.innerHTML = `<option value="${state.deviceLine}">${state.deviceLine} 線 · ${escapeHtml(lineFor(state.deviceLine).name)}</option>`;
      stageSelect.innerHTML = `<option value="${state.deviceStage}">${state.deviceStage} · ${escapeHtml(stageFor(state.deviceStage)?.name || state.deviceStage)}</option>`;
      lineSelect.disabled = true;
      stageSelect.disabled = true;
    } else {
      lineSelect.onchange = (event) => {
        state.deviceLine = event.target.value;
        state.deviceStage = lineFor(state.deviceLine).stages[0]?.code;
        rememberPlayerPosition();
        render();
      };
      stageSelect.onchange = (event) => {
        state.deviceStage = event.target.value;
        rememberPlayerPosition();
        render();
      };
    }
    document.querySelector('#fullscreen').onclick = () =>
      document.querySelector('.device-page').requestFullscreen?.();
  }
  if (state.view === 'dispatch') {
    document.querySelectorAll('[data-dispatch-line]').forEach((card) => {
      refreshDispatchChoices(card);
      card
        .querySelectorAll('[data-dispatch-category-slot]')
        .forEach(
          (select) =>
            (select.onchange = () =>
              updateDispatchProductOptions(
                card,
                select.dataset.dispatchCategorySlot,
              )),
        );
      card.querySelectorAll('[data-dispatch-slot]').forEach((select) => {
        prepareDispatchProductSelect(card, select);
        select.onchange = () => {
          refreshDispatchChoices(card);
          updateDispatchSelectionDetail(card, select.dataset.dispatchSlot);
        };
      });
    });
    document.querySelectorAll('.publish-line').forEach(
      (button) =>
        (button.onclick = () => {
          const card = button.closest('[data-dispatch-line]'),
            lineCode = button.dataset.line,
            codes = [...card.querySelectorAll('[data-dispatch-slot]')]
              .map((select) => select.value)
              .filter(Boolean);
          if (new Set(codes).size !== codes.length) {
            toast('同一條線不能重複發送相同產品');
            return;
          }
          dispatchBoard[lineCode] = codes.slice(0, 3);
          persistPlatform();
          toast(`${lineCode} 線已發送 ${codes.length} 項產品`);
          render();
        }),
    );
  }
  if (state.view === 'approval') {
    document.querySelectorAll('[data-version]').forEach(
      (button) =>
        (button.onclick = () => {
          state.approvalVersionId = button.dataset.version;
          render();
        }),
    );
    document.querySelectorAll('[data-review]').forEach(
      (button) =>
        (button.onclick = () => {
          const version =
            approvalVersions.find(
              (item) => item.id === state.approvalVersionId,
            ) || approvalVersions[0];
          if (!version) return;
          version.status = button.dataset.review;
          version.reviewNote =
            document.querySelector('#review-note')?.value ||
            (version.status === 'approved'
              ? '版本內容確認完成'
              : '請依確認意見修改後重新送審');
          version.reviewerName = currentUser.name;
          version.reviewedAt = new Date().toISOString();
          persistPlatform();
          toast(
            version.status === 'approved' ? '版本已核准' : '版本已退回修改',
          );
          render();
        }),
    );
  }
  if (state.view === 'editor') bindEditor();
  if (state.view === 'data') bindData();
}
function bindEditor() {
  const category = document.querySelector('#category-select');
  category.onchange = () =>
    changeEditorSelection(state.editorLine, category.value);
  document.querySelector('#editor-line-select').onchange = (event) =>
    changeEditorSelection(event.target.value, state.category);
  if (!editorSelectionReady()) return;
  document.querySelector('#save-process').onclick = async () => {
    if(window.ProcessAuthoringV3?.enabled())return window.ProcessAuthoringV3.save();
    const editorData = ensureCategoryEditor(),
      savedAt = new Date().toISOString(),
      version = {
        category: state.category,
        line: state.editorLine,
        stages: editorData,
        savedAt,
      };
    try {
      localStorage.setItem(
        `processEditor:${editorKey()}`,
        JSON.stringify(version),
      );
      const sameVersions = approvalVersions.filter(
          (item) =>
            item.category === state.category && item.line === state.editorLine,
        ),
        approvalVersion = {
          id: `PV-${Date.now()}`,
          number: sameVersions.length + 1,
          category: state.category,
          line: state.editorLine,
          stages: JSON.parse(JSON.stringify(editorData)),
          createdAt: savedAt,
          creatorId: currentUser?.id || 'local',
          creatorName: currentUser?.name || '本機使用者',
          status: 'pending',
        };
      approvalVersions.unshift(approvalVersion);
      state.approvalVersionId = approvalVersion.id;
      persistPlatform();
      const saved = await window.ProcessSync?.flush?.();
      if (saved === false)
        throw Error('雲端儲存失敗，資料仍保留在目前頁面，請勿關閉並重新確認連線');
      toast(`${state.category} · ${state.editorLine} 線已儲存並送至確認平台`);
    } catch (error) {
      console.warn('製程版本儲存失敗', error);
      toast(error?.message || '雲端儲存失敗，請確認連線後再試一次');
    }
  };
  if (window.ProcessEditorV2?.active()) { window.ProcessEditorV2.bind(); return; }
  const editorToolbar = document.querySelector('.editor-toolbar');
  if (editorToolbar) {
    const arrangeAll = document.createElement('button');
    arrangeAll.className = 'button ghost arrange-all-stages';
    arrangeAll.textContent = '↻ 整理全部工段';
    arrangeAll.onclick = () => {
      Object.keys(ensureCategoryEditor()).forEach(autoLayoutStage);
      toast('所有工段流程圖已自動整理');
      render();
    };
    editorToolbar.insertBefore(
      arrangeAll,
      document.querySelector('#save-process'),
    );
  }
  document.querySelectorAll('.stage-editor').forEach((stageElement) => {
    const stageCode = stageElement.querySelector('[data-stage-canvas]')?.dataset
        .stageCanvas,
      header = stageElement.querySelector(':scope > header');
    if (!stageCode || !header) return;
    const arrange = document.createElement('button');
    arrange.className = 'button ghost auto-layout-stage';
    arrange.textContent = '↻ 自動整理';
    arrange.onclick = () => {
      autoLayoutStage(stageCode);
      toast(`${stageCode} 線圖已重新整理`);
      render();
    };
    header.insertBefore(arrange, header.querySelector('.add-operation'));
    const operations = ensureCategoryEditor()[stageCode] || [],
      canvas = stageElement.querySelector('[data-stage-canvas]'),
      svg = canvas?.querySelector('svg');
    if (canvas && svg) {
      const canvasWidth = Math.max(
          canvas.clientWidth,
          ...operations.map(
            (operation, index) => operationGeometry(operation, index).x + 210,
          ),
        ),
        canvasHeight = Math.max(
          360,
          ...operations.map(
            (operation, index) => operationGeometry(operation, index).y + 155,
          ),
        );
      svg.setAttribute('width', String(canvasWidth));
      svg.setAttribute('height', String(canvasHeight));
      canvas.style.height = `${canvasHeight}px`;
    }
  });
  document.querySelectorAll('.add-operation').forEach(
    (button) =>
      (button.onclick = () => {
        state.addingStage =
          state.addingStage === button.dataset.stage
            ? null
            : button.dataset.stage;
        render();
      }),
  );
  document.querySelectorAll('[data-dismiss-diagnostic]').forEach(
    (button) =>
      (button.onclick = () => {
        state.editorProblemPlaceholder = null;
        render();
      }),
  );
  document.querySelectorAll('[data-add-template]').forEach(
    (button) =>
      (button.onclick = () => {
        const stageCode = button.dataset.stage,
          operations = ensureCategoryEditor()[stageCode],
          template = (processMaster[stageCode] || []).find(
            (item) => item.id === button.dataset.addTemplate,
          ),
          operation = newOperation(
            stageCode,
            nextOperationIndex(operations),
            template,
        );
        operations.push(operation);
        autoLayoutStage(stageCode);
        state.editorProblemPlaceholder = null;
        state.selectedOperation = operation.id;
        state.focusOperationAfterRender = operation.id;
        state.addingStage = null;
        render();
      }),
  );
  document.querySelectorAll('[data-add-custom]').forEach(
    (button) =>
      (button.onclick = () => {
        const stageCode = button.dataset.stage,
          operations = ensureCategoryEditor()[stageCode],
          operation = newOperation(
            stageCode,
            nextOperationIndex(operations),
            {},
        );
        operations.push(operation);
        autoLayoutStage(stageCode);
        state.editorProblemPlaceholder = null;
        state.selectedOperation = operation.id;
        state.focusOperationAfterRender = operation.id;
        state.addingStage = null;
        render();
      }),
  );
  document.querySelectorAll('[data-operation]').forEach(
    (button) =>
      (button.onclick = () => {
        state.selectedOperation = button.dataset.operation;
        document
          .querySelectorAll('.operation-block')
          .forEach((block) =>
            block.classList.toggle('selected', block === button),
          );
        renderInspector(selectedEditorOperation());
      }),
  );
  document.querySelectorAll('.operation-block').forEach((block) => {
    const operation = Object.values(ensureCategoryEditor())
        .flat()
        .find((item) => item.id === block.dataset.operation),
      productLabel = block.querySelector('small');
    if (operation && productLabel)
      productLabel.textContent = operation.productCodes.length
        ? `已選 ${operation.productCodes.length} 樣產品`
        : '尚未指定產品';
    if (operation?.media && operation.mediaType?.startsWith('image/')) {
      const preview = document.createElement('figure');
      preview.className = 'operation-card-photo';
      preview.innerHTML = `<img src="${operation.media}" alt="${escapeHtml(operation.name)} 操作照片"><figcaption>${escapeHtml(operation.mediaName || operation.name)}</figcaption>`;
      block.appendChild(preview);
    }
    const remove = document.createElement('span');
    remove.className = 'operation-delete';
    remove.textContent = '×';
    remove.title = '刪除此流程';
    remove.onclick = (event) => {
      event.stopPropagation();
      if (!confirm('確定要刪除此流程方塊？\n刪除後相關連線也會一起移除。'))
        return;
      const editorData = ensureCategoryEditor(),
        operation = Object.values(editorData)
          .flat()
          .find((item) => item.id === block.dataset.operation),
        stageCode = operation?.stageCode;
      if (!operation || !stageCode) return;
      editorData[stageCode] = editorData[stageCode].filter(
        (item) => item.id !== operation.id,
      );
      Object.values(editorData)
        .flat()
        .forEach(
          (item) =>
            (item.nextIds = (item.nextIds || []).filter(
              (id) => id !== operation.id,
            )),
        );
      state.selectedOperation = editorData[stageCode][0]?.id || null;
      render();
    };
    block.appendChild(remove);
  });
  document.querySelectorAll('.operation-block').forEach((block) => {
    const operation = Object.values(ensureCategoryEditor())
        .flat()
        .find((item) => item.id === block.dataset.operation),
      items = operation ? operationWorkMediaItems(operation) : [];
    block.querySelector('.operation-card-photo')?.remove();
    block.querySelector('.operation-thumb')?.remove();
    if (items.length) {
      const gallery = document.createElement('div');
      gallery.className = `operation-card-gallery media-count-${Math.min(items.length, 4)}`;
      gallery.innerHTML =
        items
          .slice(0, 4)
          .map((item, _index) =>
            item.type?.startsWith('video/')
              ? `<span>VIDEO</span>`
              : `<img src="${item.src}" alt="${escapeHtml(item.name || operation.name)}">`,
          )
          .join('') +
        `${items.length > 4 ? `<b>+${items.length - 4}</b>` : ''}`;
      block.appendChild(gallery);
    }
  });
  document.querySelectorAll('.operation-block[draggable]').forEach((block) => {
    block.ondragstart = (event) => {
      state.draggingOperation = block.dataset.operation;
      event.dataTransfer.effectAllowed = 'all';
    };
    block.ondragend = () => {
      state.draggingOperation = null;
    };
  });
  document.querySelectorAll('.operation-block[draggable]').forEach((block) => {
    block.ondragover = (event) => {
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = 'link';
    };
    block.ondrop = (event) => {
      event.preventDefault();
      event.stopPropagation();
      const source = Object.values(ensureCategoryEditor())
          .flat()
          .find((item) => item.id === state.draggingOperation),
        target = Object.values(ensureCategoryEditor())
          .flat()
          .find((item) => item.id === block.dataset.operation);
      if (
        !source ||
        !target ||
        source.id === target.id ||
        source.stageCode !== target.stageCode
      )
        return;
      const stageOperations = ensureCategoryEditor()[source.stageCode] || [];
      if (wouldCreateCycle(stageOperations, source.id, target.id)) {
        state.draggingOperation = null;
        toast('無法建立反向循環；請依製程方向重新連接');
        return;
      }
      source.nextIds = source.nextIds || [];
      const replaced =
        source.nextIds.length && !source.nextIds.includes(target.id);
      source.nextIds = [target.id];
      autoLayoutStage(source.stageCode);
      state.draggingOperation = null;
      if (replaced) toast('每個流程只能有一個去向，已改接到新的下一流程');
      render();
    };
  });
  document.querySelectorAll('[data-link-from]').forEach(
    (line) =>
      (line.onclick = (event) => {
        event.stopPropagation();
        if (
          !confirm('確定刪除這條流程連線？\n刪除後可以重新拖曳方塊建立連線。')
        )
          return;
        const source = Object.values(ensureCategoryEditor())
          .flat()
          .find((item) => item.id === line.dataset.linkFrom);
        if (source)
          source.nextIds = (source.nextIds || []).filter(
            (id) => id !== line.dataset.linkTo,
          );
        render();
      }),
  );
  document.querySelectorAll('[data-stage-canvas]').forEach((canvas) => {
    canvas.ondragover = (event) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
    };
    canvas.ondrop = (event) => {
      event.preventDefault();
      const operation = Object.values(ensureCategoryEditor())
          .flat()
          .find((item) => item.id === state.draggingOperation),
        operationStage =
          operation?.stageCode ||
          operation?.number.split('-').slice(0, 2).join('-');
      if (!operation || operationStage !== canvas.dataset.stageCanvas) return;
      const rect = canvas.getBoundingClientRect(),
        scale = Number(canvas.dataset.flowScale) || 1;
      operation.stageCode = operationStage;
      operation.x = Math.max(
        8,
        Math.min(
          canvas.scrollWidth / scale - 170,
          (event.clientX - rect.left + canvas.scrollLeft) / scale - 80,
        ),
      );
      operation.y = Math.max(
        8,
        (event.clientY - rect.top + canvas.scrollTop) / scale - 52,
      );
      state.draggingOperation = null;
      render();
    };
  });
  const resizer = document.querySelector('.editor-resizer'),
    workspace = document.querySelector('.editor-workspace');
  if (resizer && workspace)
    resizer.onpointerdown = (event) => {
      event.preventDefault();
      resizer.setPointerCapture?.(event.pointerId);
      resizer.classList.add('dragging');
      const move = (moveEvent) => {
        const rect = workspace.getBoundingClientRect(),
          maximum = Math.max(280, rect.width - 300);
        state.inspectorWidth = Math.max(
          280,
          Math.min(maximum, rect.right - moveEvent.clientX),
        );
        workspace.style.setProperty(
          '--inspector-width',
          `${state.inspectorWidth}px`,
        );
      };
      const stop = (stopEvent) => {
        resizer.releasePointerCapture?.(stopEvent.pointerId);
        resizer.classList.remove('dragging');
        resizer.onpointermove = null;
        resizer.onpointerup = null;
        resizer.onpointercancel = null;
      };
      resizer.onpointermove = move;
      resizer.onpointerup = stop;
      resizer.onpointercancel = stop;
    };
  renderInspector(selectedEditorOperation());
}
function renderInspector(operation) {
  const form = document.querySelector('#inspector-form');
  if (!form) return;
  if (!operation) {
    form.innerHTML = `<div class="inspector-empty"><strong>選擇工段內的流程</strong><p>點選流程 1、2、3、4，再設定產品、設備與作業標準。</p></div>`;
    return;
  }
  const stageCode =
      operation.stageCode || operation.number.split('-').slice(0, 2).join('-'),
    products = productsForCategory().filter((product) => {
      const route = routeFor(product.code);
      return route?.line === state.editorLine && route.stages.includes(stageCode);
    }),
    templates = processMaster[stageCode] || [];
  operation.stageCode = stageCode;
  operation.productCodes = operation.productCodes || [];
  operation.bomItems = operation.bomItems || [];
  operation.people = operation.people || 1;
  const selectedProduct = products.find(
      (product) => product.code === operation.productCodes[0],
    ),
    allBomRows = selectedProduct ? rootBom(selectedProduct.code) : [],
    usedBomItems = new Set(
      Object.values(ensureCategoryEditor())
        .flat()
        .filter(
          (item) =>
            item.id !== operation.id &&
            item.bomProductCode === selectedProduct?.code,
        )
        .flatMap((item) => item.bomItems || []),
    ),
    bomRows = allBomRows.filter(
      (row) =>
        !usedBomItems.has(row.itemCode) ||
        operation.bomItems.includes(bomReferenceKey(row)),
    ),
    selectedTemplate = templates.find(
      (template) => template.id === operation.templateId,
    );
  const allowedMachines = window.ProcessEquipment ? window.ProcessEquipment.choices(operation, selectedTemplate) : selectedTemplate?.machineIds?.length
      ? machines.filter((machine) =>
          selectedTemplate.machineIds.includes(machine.no),
        )
      : machines.filter((machine) => machine.line === state.editorLine),
    selectedMachine = machines.find(
      (machine) => machine.no === operation.machineId,
    );
  form.innerHTML = `<div class="inspector-form"><div class="field"><label>流程編號（自動產生）</label><input value="${operation.number}" readonly></div><div class="field"><label>後台流程資料</label><select id="operation-template"><option value="">自訂流程</option>${templates.map((template) => `<option value="${template.id}" ${template.id === operation.templateId ? 'selected' : ''}>${escapeHtml(template.name)}</option>`).join('')}</select></div><div class="field"><label>流程名稱</label><input id="operation-name" value="${escapeHtml(operation.name)}" placeholder="例如：裁切、封口、人工組裝"></div><div class="two-field"><div class="field"><label>作業方式</label><select id="operation-mode"><option value="human" ${operation.mode === 'human' ? 'selected' : ''}>人工流程</option><option value="machine" ${operation.mode === 'machine' ? 'selected' : ''}>機器流程</option></select></div><div class="field"><label>建議操作人數</label><input id="operation-people" type="number" min="1" value="${operation.people}"></div></div><div class="machine-fields ${operation.mode === 'machine' ? '' : 'hidden'}"><div class="field"><label>後台設備</label><select id="operation-machine"><option value="">請選擇機器</option>${allowedMachines.map((machine) => `<option value="${machine.no}" ${machine.no === operation.machineId ? 'selected' : ''}>${machine.no} · ${escapeHtml(machine.name)}</option>`).join('')}</select></div><div class="machine-info">${selectedMachine ? `<b>${escapeHtml(selectedMachine.name)}</b><span>機器編號 ${selectedMachine.no}</span><span>固定資產 ${selectedMachine.asset}</span><span>設備建議 ${selectedMachine.people} 人操作</span>` : '選擇機器後自動帶出設備資訊'}</div></div><div class="field"><label>適用產品（${escapeHtml(state.category)}）</label><select id="operation-product"><option value="">稍後設定產品</option>${products.map((product) => `<option value="${product.code}" ${product.code === operation.productCodes[0] ? 'selected' : ''}>${product.code} · ${escapeHtml(product.name)}</option>`).join('')}</select></div><details class="bom-details"><summary>${selectedProduct ? `選擇 ${selectedProduct.code} 的 BOM 零件（${bomRows.length}）` : `BOM 零件（先選產品後使用）`}</summary>${selectedProduct ? `<div class="check-list bom-check-list">${bomRows.length ? bomRows.map((row) => `<label><input type="checkbox" data-bom-code="${escapeHtml(bomReferenceKey(row))}" ${operation.bomItems.includes(bomReferenceKey(row)) ? 'checked' : ''}><span><code>${escapeHtml(row.itemCode)}</code>${escapeHtml(row.itemName)} <small>${escapeHtml(row.quantity)} ${escapeHtml(row.unit)}</small></span></label>`).join('') : `<p>此產品沒有第一層 BOM 資料。</p>`}</div>` : `<p>產品選定後才會載入 BOM，不占用主要畫面。</p>`}</details><div class="field"><label>操作照片或影片</label><label class="media-upload"><input id="operation-media" type="file" accept="image/*,video/*"><span>＋ 上傳照片／影片</span><small>${escapeHtml(operation.mediaName || '支援 JPG、PNG、MP4')}</small></label>${operation.media ? `<div class="media-preview">${operation.mediaType.startsWith('image/') ? `<img src="${operation.media}" alt="操作照片預覽">` : `<video src="${operation.media}" controls></video>`}<button type="button" id="remove-media">移除</button></div>` : ''}</div><div class="field"><label>操作流程</label><textarea id="operation-instructions" placeholder="逐步鍵入操作方式、注意事項與品質重點">${escapeHtml(operation.instructions)}</textarea></div><div class="inspector-actions"><button class="button ghost" id="delete-operation">刪除流程</button><button class="button signal" id="apply-operation">套用流程內容</button></div></div>`;
  operation.machineIds = Array.isArray(operation.machineIds)
    ? operation.machineIds
    : operation.machineId
      ? [operation.machineId]
      : [];
  operation.mediaItems = operationMediaItems(operation);
  const workMediaRecords = operationWorkMediaItems(operation).map((item) => ({
    item,
    index: operation.mediaItems.indexOf(item),
  }));
  const stageOperations = ensureCategoryEditor()[stageCode] || [],
    currentSequence = operation.number.split('-').pop(),
    usedSequences = new Set(
      stageOperations
        .filter((item) => item.id !== operation.id)
        .map((item) => item.number.split('-').pop()),
    ),
    numberField = form.querySelector('.inspector-form .field');
  if (numberField) {
    const choices = Array.from({ length: 99 }, (_, index) =>
        String(index + 1).padStart(2, '0'),
      ).filter(
        (sequence) =>
          sequence === currentSequence || !usedSequences.has(sequence),
      ),
      limited = [
        currentSequence,
        ...choices.filter((sequence) => sequence !== currentSequence),
      ].slice(0, 4);
    numberField.outerHTML = `<div class="field"><label>流程編號（最多顯示 4 個可用編號）</label><select id="operation-sequence">${limited.map((sequence) => `<option value="${sequence}" ${sequence === currentSequence ? 'selected' : ''}>${stageCode}-${sequence}</option>`).join('')}</select></div>`;
  }
  const machineArea = document.querySelector('.machine-fields');
  if (machineArea && operation.mode === 'machine')
    machineArea.innerHTML = `<fieldset class="machine-multi"><legend>後台設備 · 可複選</legend><div class="multi-actions"><button type="button" id="select-all-machines">全選</button><button type="button" id="clear-machines">清除</button><span>已選 ${operation.machineIds.length} 台</span></div><div class="check-list machine-multi-list">${allowedMachines.map((machine) => `<label><input type="checkbox" data-operation-machine="${machine.no}" ${operation.machineIds.includes(machine.no) ? 'checked' : ''}><span><code>${machine.no}</code>${escapeHtml(machine.name)} <small>固定資產 ${machine.asset} · ${machine.people} 人操作</small></span></label>`).join('')}</div></fieldset>`;
  if (machineArea && operation.mode === 'machine' && window.ProcessEquipment)
    machineArea.innerHTML = window.ProcessEquipment.selector(operation, allowedMachines);
  document.querySelector('#operation-mode')?.closest('.two-field')?.remove();
  if (
    operation.mode === 'human' &&
    (selectedTemplate?.name || operation.name).includes('人工')
  ) {
    const peopleField = document.createElement('div');
    peopleField.className = 'field';
    peopleField.innerHTML = `<label>人工組裝建議人數</label><input id="operation-people" type="number" min="1" value="${operation.people || 1}">`;
    document
      .querySelector('#operation-name')
      ?.closest('.field')
      ?.after(peopleField);
  }
  const mediaField = document
    .querySelector('#operation-media')
    ?.closest('.field');
  if (mediaField)
    mediaField.outerHTML = `<div class="field common-operation-media"><label>作業說明照片或影片 · 可多選</label><label class="media-upload"><input id="operation-media" type="file" accept="image/*,video/*" multiple><span>＋ 上傳照片／影片</span><small>保存此流程的作業說明照片與影片。</small></label><div class="inspector-media-grid media-count-${Math.min(workMediaRecords.length, 4)}">${workMediaRecords.map(({item,index}, displayIndex) => `<figure><button type="button" class="inspector-media-preview" data-lightbox-src="${escapeHtml(item.src)}" data-lightbox-type="${escapeHtml(item.type || 'image/jpeg')}" data-lightbox-title="${escapeHtml(item.name || operation.name)}" data-lightbox-group="operation-${escapeHtml(operation.id || operation.number)}">${item.type?.startsWith('video/') ? '<span class="media-video-mark">▶ 影片</span>' : `<img src="${escapeHtml(item.src)}" alt="${escapeHtml(item.name || operation.name)}">`}</button><button type="button" data-remove-media-index="${index}">×</button><figcaption>${escapeHtml(item.name || `照片 ${displayIndex + 1}`)}</figcaption></figure>`).join('')}</div></div>`;
  operation.bomSelections = operation.bomSelections || {};
  if (
    operation.bomProductCode &&
    operation.bomItems.length &&
    !operation.bomSelections[operation.bomProductCode]
  )
    operation.bomSelections[operation.bomProductCode] = [...operation.bomItems];
  const productField = document
      .querySelector('#operation-product')
      ?.closest('.field'),
    selectedProducts = products.filter((product) =>
      operation.productCodes.includes(product.code),
    );
  if (productField)
    productField.outerHTML = `<fieldset class="product-multi"><legend>適用產品（${escapeHtml(state.category)}）· 可複選</legend><div class="check-list product-multi-list">${products.map((product) => `<label><input type="checkbox" data-operation-product="${product.code}" ${operation.productCodes.includes(product.code) ? 'checked' : ''}><span><code>${product.code}</code>${escapeHtml(product.name)} <small>${escapeHtml(product.specification || '')}</small></span></label>`).join('')}</div></fieldset>`;
  const productMulti = document.querySelector('.product-multi');
  if (productMulti) {
    const actions = document.createElement('div');
    actions.className = 'multi-actions';
    actions.innerHTML = `<button type="button" id="select-all-products">全選</button><button type="button" id="clear-products">清除</button><span>已選 ${operation.productCodes.length}／${products.length}</span>`;
    productMulti.insertBefore(
      actions,
      productMulti.querySelector('.product-multi-list'),
    );
  }
  const legacyBom = document.querySelector('.bom-details');
  if (legacyBom)
    legacyBom.outerHTML = `<section class="bom-groups"><div class="bom-groups-title"><b>BOM 零件分配</b><span>${selectedProducts.length} 組產品</span></div>${
      selectedProducts.length
        ? selectedProducts
            .map((product) => {
              const currentSelection =
                  operation.bomSelections[product.code] || [],
                available = rootBom(product.code),
                selectedCount = available.filter((row) =>
                  currentSelection.includes(bomReferenceKey(row)),
                ).length,
                selectable = available.filter(
                  (row) =>
                    currentSelection.some(
                      (code) =>
                        bomItemCodeKey(code) === bomItemCodeKey(bomReferenceKey(row)),
                    ) ||
                    !bomUsageOperations(product.code, bomReferenceKey(row)).some(
                      (used) => used.id !== operation.id,
                    ),
                ),
                allSelected =
                  selectable.length > 0 &&
                  selectable.every((row) =>
                    currentSelection.some(
                      (code) =>
                        bomItemCodeKey(code) === bomItemCodeKey(bomReferenceKey(row)),
                    ),
                  );
              return `<article class="bom-product-group" data-bom-group="${product.code}"><header><div><code>${product.code}</code><b>${escapeHtml(product.name)}</b></div><div class="bom-group-actions"><span class="bom-count">${selectedCount} 已選／${available.length} 個料號</span><button type="button" data-bom-select-all="${product.code}">${allSelected ? '清除' : '全選'}</button><i>⌄</i></div></header><div class="check-list bom-check-list">${available.length ? available.map((row) => bomSelectionRowMarkup(product.code,row,operation,currentSelection)).join('') : `<p>此產品沒有根層 BOM 零件。</p>`}</div></article>`;
            })
            .join('')
        : `<div class="bom-groups-empty">先從上方勾選產品，這裡會依產品分組顯示 BOM。</div>`
    }</section>`;
  document.querySelectorAll('[data-bom-product]').forEach((input) => {
    const row = rootBom(input.dataset.bomProduct).find(
        (item) => bomReferenceKey(item) === input.dataset.bomCode,
      ),
      meta = input.closest('label')?.querySelector('small');
    if (row && meta)
      meta.textContent = `定額／用量 ${row.quantity || '—'} · 單位 ${row.unit || '—'} · 損耗 ${row.waste || 0}`;
  });
  operation.productInstructions = operation.productInstructions || {};
  operation.noteProductCode = operation.productCodes.includes(
    operation.noteProductCode,
  )
    ? operation.noteProductCode
    : selectedProducts[0]?.code || '';
  const generalInstructions = document
    .querySelector('#operation-instructions')
    ?.closest('.field');
  if (generalInstructions && selectedProducts.length) {
    const productNote = document.createElement('section');
    productNote.className = 'product-note-panel';
    productNote.innerHTML = `<div class="field"><label>指定產品的補充操作流程</label><select id="operation-note-product">${selectedProducts.map((product) => `<option value="${product.code}" ${product.code === operation.noteProductCode ? 'selected' : ''}>${product.code} · ${escapeHtml(product.name)}</option>`).join('')}</select></div><div class="field"><label>${operation.noteProductCode} 專用備註</label><textarea id="operation-product-instructions" placeholder="只在產品製程狀態選到此產品時顯示">${escapeHtml(operation.productInstructions[operation.noteProductCode] || '')}</textarea></div>`;
    generalInstructions.after(productNote);
  }
  const syncText = () => {
    operation.name = document.querySelector('#operation-name').value;
    const peopleInput = document.querySelector('#operation-people');
    if (peopleInput) operation.people = Number(peopleInput.value) || 1;
    operation.instructions = document.querySelector(
      '#operation-instructions',
    ).value;
    // Legacy IPQC text stays intact; assignments use their own stable IDs.
    const productInstructions = document.querySelector(
      '#operation-product-instructions',
    );
    if (productInstructions && operation.noteProductCode)
      operation.productInstructions[operation.noteProductCode] =
        productInstructions.value;
  };
  const noteProduct = document.querySelector('#operation-note-product');
  if (noteProduct)
    noteProduct.onchange = (event) => {
      syncText();
      operation.noteProductCode = event.target.value;
      renderInspector(operation);
    };
  document.querySelector('#operation-sequence').onchange = (event) => {
    syncText();
    operation.number = `${stageCode}-${event.target.value}`;
    render();
  };
  document.querySelector('#operation-template').onchange = (event) => {
    const oldTemplateSources = new Set(
      operationTemplateMediaItems(operation).map(mediaSourceKey).filter(Boolean),
    );
    const template = templates.find((item) => item.id === event.target.value);
    operation.templateId = event.target.value;
    operation.mediaItems = operationMediaItems(operation).filter(
      (item) => !oldTemplateSources.has(mediaSourceKey(item)),
    );
    if (template) {
      operation.name = template.name;
      operation.mode = template.mode;
      operation.people = template.people;
      operation.machineIds = [...(template.machineIds || [])];
      operation.machineId = operation.machineIds[0] || '';
      const firstMedia = operation.mediaItems[0];
      operation.media = firstMedia?.src || null;
      operation.mediaName = firstMedia?.name || '';
      operation.mediaType = firstMedia?.type || '';
    }
    renderInspector(operation);
  };
  const updateProducts = () => {
    syncText();
    operation.productCodes = [
      ...document.querySelectorAll('[data-operation-product]:checked'),
    ].map((item) => item.dataset.operationProduct);
    Object.keys(operation.bomSelections).forEach((code) => {
      if (!operation.productCodes.includes(code))
        delete operation.bomSelections[code];
    });
    operation.bomProductCode = operation.productCodes[0] || '';
    operation.bomItems = Object.values(operation.bomSelections).flat();
    renderInspector(operation);
  };
  document
    .querySelectorAll('[data-operation-product]')
    .forEach((input) => (input.onchange = updateProducts));
  const selectAllProducts = document.querySelector('#select-all-products'),
    clearProducts = document.querySelector('#clear-products');
  if (selectAllProducts)
    selectAllProducts.onclick = () => {
      document
        .querySelectorAll('[data-operation-product]')
        .forEach((input) => (input.checked = true));
      updateProducts();
    };
  if (clearProducts)
    clearProducts.onclick = () => {
      document
        .querySelectorAll('[data-operation-product]')
        .forEach((input) => (input.checked = false));
      updateProducts();
    };
  const bomCodeKey = (value) => String(value || '').trim().toUpperCase();
  const refreshBomUsageLabels = () => {
    document.querySelectorAll('[data-bom-usage-product][data-bom-usage-code]').forEach((label) => {
      const container = document.createElement('div');
      container.innerHTML = bomUsageMarkup(
        label.dataset.bomUsageProduct,
        label.dataset.bomUsageCode,
        operation.id,
      );
      label.replaceWith(container.firstElementChild);
    });
  };
  const updateBomSelection = (productCode, refreshIssues = true) => {
    syncText();
    operation.bomSelections[productCode] = [
      ...document.querySelectorAll('[data-bom-product]:checked'),
    ]
      .filter((item) => item.dataset.bomProduct === productCode)
      .map((item) => item.dataset.bomCode);
    operation.bomItems = Object.values(operation.bomSelections).flat();
    const group = [
        ...document.querySelectorAll('[data-bom-group]'),
      ].find((item) => item.dataset.bomGroup === productCode),
      total = group?.querySelectorAll('[data-bom-product]').length || 0,
      count = operation.bomSelections[productCode].length;
    const label = group?.querySelector('.bom-count'),
      button = group?.querySelector('[data-bom-select-all]');
    if (label) label.textContent = `${count} 已選／${total} 個料號`;
    const editableInputs = [
        ...(group?.querySelectorAll('[data-bom-product]:not(:disabled)') || []),
      ],
      allEditableSelected =
        editableInputs.length > 0 && editableInputs.every((input) => input.checked);
    if (button) button.textContent = allEditableSelected ? '清除' : '全選';
    refreshBomUsageLabels();
    if (refreshIssues)
      setTimeout(
        () => window.ProcessVersionValidation?.refreshIssues?.(),
        0,
      );
  };
  const synchronizeBomCodes = (
    itemCodes,
    checked,
    refreshIssues = true,
  ) => {
    const keys = new Set(itemCodes.map(bomCodeKey).filter(Boolean)),
      affectedProducts = new Set();
    document.querySelectorAll('[data-bom-product][data-bom-code]').forEach(
      (input) => {
        if (!keys.has(bomCodeKey(input.dataset.bomCode))) return;
        if (input.disabled) return;
        input.checked = checked;
        affectedProducts.add(input.dataset.bomProduct);
      },
    );
    affectedProducts.forEach((productCode) =>
      updateBomSelection(productCode, false),
    );
    if (refreshIssues && affectedProducts.size)
      setTimeout(
        () => window.ProcessVersionValidation?.refreshIssues?.(),
        0,
      );
  };
  const initiallySelectedBomCodes = [
    ...document.querySelectorAll('[data-bom-product][data-bom-code]:checked'),
  ].map((item) => item.dataset.bomCode);
  if (initiallySelectedBomCodes.length)
    synchronizeBomCodes(initiallySelectedBomCodes, true);
  document
    .querySelectorAll('[data-bom-product]')
    .forEach(
      (input) =>
        (input.onchange = () =>
          synchronizeBomCodes([input.dataset.bomCode], input.checked)),
    );
  document.querySelectorAll('[data-bom-select-all]').forEach(
    (button) =>
      (button.onclick = (event) => {
        event.stopPropagation();
        const code = button.dataset.bomSelectAll,
          inputs = [
            ...document.querySelectorAll(`[data-bom-product="${code}"]`),
          ].filter((input) => !input.disabled),
          shouldSelect = inputs.some((input) => !input.checked);
        synchronizeBomCodes(
          inputs.map((input) => input.dataset.bomCode),
          shouldSelect,
        );
      }),
  );
  const modeSelect = document.querySelector('#operation-mode');
  if (modeSelect)
    modeSelect.onchange = (event) => {
      syncText();
      operation.mode = event.target.value;
      if (operation.mode === 'human') {
        operation.machineId = '';
        operation.machineIds = [];
      }
      renderInspector(operation);
    };
  const updateMachines = () => {
    syncText();
    operation.machineIds = [
      ...document.querySelectorAll('[data-operation-machine]:checked'),
    ].map((input) => input.dataset.operationMachine);
    operation.machineId = operation.machineIds[0] || '';
    if (window.ProcessEquipment) operation.machineDetails = operation.machineIds.map(id => allowedMachines.find(m => m.no === id)).filter(Boolean).map(m => JSON.parse(JSON.stringify(m)));
    operation.people =
      operation.machineIds.reduce(
        (total, id) =>
          total + (machines.find((machine) => machine.no === id)?.people || 0),
        0,
      ) || 1;
    renderInspector(operation);
  };
  document
    .querySelectorAll('[data-operation-machine]')
    .forEach((input) => (input.onchange = updateMachines));
  const selectAllMachines = document.querySelector('#select-all-machines'),
    clearMachines = document.querySelector('#clear-machines');
  if (selectAllMachines)
    selectAllMachines.onclick = () => {
      document
        .querySelectorAll('[data-operation-machine]')
        .forEach((input) => (input.checked = true));
      updateMachines();
    };
  if (clearMachines)
    clearMachines.onclick = () => {
      document
        .querySelectorAll('[data-operation-machine]')
        .forEach((input) => (input.checked = false));
      updateMachines();
    };
  document.querySelector('#operation-media').onchange = async (event) => {
    const files = [...(event.target.files || [])];
    if (!files.length) return;
    syncText();
    try {
      const { items, compressedCount } = await prepareMediaUploads(files);
      operation.mediaItems.push(...items);
      const first = operationWorkMediaItems(operation)[0];
      operation.media = first?.src || null;
      operation.mediaName = first?.name || '';
      operation.mediaType = first?.type || '';
      if (compressedCount) toast('照片已自動壓縮後加入');
      renderInspector(operation);
    } catch (error) {
      console.warn('媒體上傳失敗', error);
      toast('照片處理失敗，請改用 JPG、PNG 或 WebP');
    }
  };
  document.querySelectorAll('[data-remove-media-index]').forEach(
    (button) =>
      (button.onclick = () => {
        syncText();
        operation.mediaItems.splice(Number(button.dataset.removeMediaIndex), 1);
        const first = operationWorkMediaItems(operation)[0];
        operation.media = first?.src || null;
        operation.mediaName = first?.name || '';
        operation.mediaType = first?.type || '';
        renderInspector(operation);
      }),
  );
  document.querySelector('#delete-operation').onclick = () => {
    if (!confirm('確定要刪除此流程方塊？\n刪除後相關連線也會一起移除。'))
      return;
    const editorData = ensureCategoryEditor();
    editorData[stageCode] = editorData[stageCode].filter(
      (item) => item.id !== operation.id,
    );
    Object.values(editorData)
      .flat()
      .forEach(
        (item) =>
          (item.nextIds = (item.nextIds || []).filter(
            (id) => id !== operation.id,
          )),
      );
    state.selectedOperation = editorData[stageCode][0]?.id || null;
    render();
  };
  document.querySelector('#apply-operation').onclick = () => {
    syncText();
    const previousProducts = state.editingOperationProductCodes || operation.productCodes;
    // V3 field edits must not normalize other operations and create unrelated
    // BOM patches/guards. Explicit applicability edits retain workspace sync.
    if (!window.ProcessAuthoringV3?.enabled() ||
      JSON.stringify(previousProducts) !== JSON.stringify(operation.productCodes)) {
      synchronizeWorkspaceProducts(operation, previousProducts);
    }
    state.editingOperationProductCodes = [...operation.productCodes];
    state.appliedOperationId = operation.id;
    if(!window.ProcessAuthoringV3?.enabled())toast(`${operation.number} 儲存成功`);
    render();
    const button = document.querySelector('#apply-operation');
    if (button && state.appliedOperationId === operation.id) {
      button.textContent = window.ProcessAuthoringV3?.enabled()?'Đang đồng bộ / 同步中':'✓ 儲存成功';
      if(!window.ProcessAuthoringV3?.enabled())button.classList.add('saved-success');
      setTimeout(() => {
        if (button.isConnected) {
          button.textContent = '套用流程內容';
          button.classList.remove('saved-success');
        }
      }, 1800);
    }
  };
}
function bindData() {
  document.querySelectorAll('[data-tab]').forEach(
    (tab) =>
      (tab.onclick = () => {
        document
          .querySelectorAll('.tab')
          .forEach((t) => t.classList.toggle('active', t === tab));
        const content = document.querySelector('#data-content');
        content.innerHTML =
          tab.dataset.tab === 'products'
            ? productTable()
            : tab.dataset.tab === 'bom'
              ? bomTable()
              : tab.dataset.tab === 'process-master'
                ? processMasterView()
                : tab.dataset.tab === 'users'
                  ? userManagementView()
                  : lineData();
        bindDataInner(tab.dataset.tab);
      }),
  );
  bindDataInner('products');
}
function bindDataInner(tab) {
  if (tab === 'products') {
    const q = document.querySelector('#product-search');
    q.oninput = () => {
      const value = q.value.toLowerCase();
      document.querySelector('#product-body').innerHTML = productRows(
        data.products
          .filter((p) =>
            Object.values(p).join(' ').toLowerCase().includes(value),
          )
          .slice(0, 120),
      );
    };
    document.querySelector('#simulate-import').onclick = () =>
      toast('匯入入口已就緒；正式版可上傳 PDF / Excel');
  }
  if (tab === 'bom') {
    document.querySelector('#bom-product-select').onchange = (e) => {
      state.productCode = e.target.value;
      document.querySelector('#data-content').innerHTML = bomTable();
      bindDataInner('bom');
    };
  }
  if (tab === 'process-master') {
    updateProcessSharedStatus();
    const permissions=window.MasterDataWorkflow?.shared.permissions('PROCESS');
    for(const [id,permission]of[['#process-master-new-draft','edit'],['#save-master-data','save'],['#process-master-submit','submit'],['#process-master-withdraw','withdraw']]){const button=document.querySelector(id);if(button&&permissions?.[permission]===false)button.disabled=true;}
    const addMasterTemplate = document.querySelector('#add-master-template');
    if (addMasterTemplate) addMasterTemplate.onclick = async () => {
      const before = editableProcessMasterData();
      if (!before||addMasterTemplate.disabled) return;
      const editable=JSON.parse(JSON.stringify(before));
      addMasterTemplate.disabled=true;
      const timestamp = Date.now(),
        catalogKey = `custom-${timestamp}`;
      routing.lines.flatMap((line) => line.stages).forEach((stage) => {
        const list = editable[stage.code] || (editable[stage.code] = []);
        list.push({
          id: `${stage.code}-CUSTOM-${timestamp}`,
          catalogKey,
          name: '新流程',
          mode: 'human',
          people: 1,
          machineIds: [],
          media: null,
          mediaName: '',
          mediaType: '',
          mediaItems: [],
        });
      });
      try{await applyProcessMasterSnapshot(before,editable);}catch(error){toast(error.message);return;}finally{addMasterTemplate.disabled=false;}
      document.querySelector('#data-content').innerHTML = processMasterView();
      bindDataInner('process-master');
      const latest = document.querySelector('.photo-template:last-child');
      latest?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      latest?.querySelector('[data-master-name]')?.select();
    };
    document.querySelectorAll('[data-master-name]').forEach(bindProcessMasterName);
    document.querySelector('#process-master-version-choice')?.addEventListener(
      'change',
      (event) => {
        state.processMasterVersionId = event.target.value;
        document.querySelector('#data-content').innerHTML = processMasterView();
        bindDataInner('process-master');
      },
    );
    document.querySelectorAll('[data-process-master-history]').forEach(
      (button) =>
        (button.onclick = () => {
          state.processMasterVersionId = button.dataset.processMasterHistory;
          document.querySelector('#data-content').innerHTML = processMasterView();
          bindDataInner('process-master');
        }),
    );
    document.querySelector('#process-master-new-draft')?.addEventListener(
      'click',
      beginProcessMasterDraft,
    );
    document.querySelector('#process-master-submit')?.addEventListener(
      'click',
      submitProcessMasterDraft,
    );
    document.querySelector('#process-master-withdraw')?.addEventListener(
      'click',
      withdrawProcessMasterDraft,
    );
    document.querySelector('#process-master-review')?.addEventListener(
      'click',
      () => {
        window.MasterReview.open('PROCESS', selectedProcessMasterVersion()?.id);
      },
    );
    const exportButton = document.querySelector('#export-process-master');
    if (exportButton) exportButton.onclick = exportProcessMasterData;
    const importButton = document.querySelector('#import-process-master'),
      importFile = document.querySelector('#process-master-import-file');
    if (importButton)
      importButton.onclick = async () => {
        const actorId=currentUser?.id;
        if (processMasterDraft()) {
          if(processMasterPending()||!editableProcessMasterData())return;
          importFile?.click();
          return;
        }
        if (processMasterPending()) {
          toast('流程資料正在主管審核中，請先解除送審再匯入');
          return;
        }
        if(!(await beginProcessMasterDraft())||currentUser?.id!==actorId||!processMasterDraft()||processMasterPending()||!editableProcessMasterData())return;
        document.querySelector('#process-master-import-file')?.click();
      };
    if (importFile)
      importFile.onchange = async () => {
        const file = importFile.files?.[0];
        importFile.value = '';
        await importProcessMasterData(file);
      };
    document
      .querySelectorAll('[data-delete-template]')
      .forEach(
        (button) =>
            (button.onclick = () =>
              deleteProcessTemplate(
                processMasterReferenceStage()?.code,
                button.dataset.deleteTemplate,
              )),
      );
    document.querySelectorAll('[data-master-media]').forEach((input) => {
      input.onchange = async () => {
        const before=editableProcessMasterData();if(!before||input.disabled)return;
        const requestDraft=processMasterDraft(), requestActor=window.ProcessSync?.identity || currentUser,
          requestActorId=requestActor?.id, requestEpoch=window.ProcessSync?.identityGeneration?.();
        const sameActor=()=>{const actor=window.ProcessSync?.identity || currentUser;return actor===requestActor && actor?.id===requestActorId && window.ProcessSync?.identityGeneration?.()===requestEpoch;};
        const next=JSON.parse(JSON.stringify(before));
        const card = input.closest('.master-template'),
          matches = processMasterCatalogMatches(
            next,
            card?.dataset.templateKey,
          ),
          template = matches[0];
        if (!template || !input.files?.length) return;
        input.disabled=true;
        try{
        const prepared = await prepareMediaUploads([...input.files]);
        if(input.isConnected===false || !sameActor() || before!==editableProcessMasterData() || requestDraft!==processMasterDraft())return;
        const nextMedia = [
          ...processTemplateMediaItems(template),
          ...prepared.items,
        ];
        matches.forEach((item) => setProcessTemplateMedia(item, nextMedia));
        await applyProcessMasterSnapshot(before,next);
        if(input.isConnected===false || !sameActor())return;
        document.querySelector('#data-content').innerHTML =
          processMasterView();
        bindDataInner('process-master');
        toast(
          prepared.compressedCount
            ? `已加入 ${prepared.items.length} 張照片，其中 ${prepared.compressedCount} 張已自動壓縮`
            : `已加入 ${prepared.items.length} 張照片`,
        );
        }catch(error){toast(error.message);}finally{input.disabled=false;input.value='';}
      };
    });
    document
      .querySelectorAll('[data-remove-template-media]')
      .forEach((button) => {
        button.onclick = async () => {
          const before=editableProcessMasterData();if(!before||button.disabled)return;
          const next=JSON.parse(JSON.stringify(before));
          const card = button.closest('.master-template'),
            matches = processMasterCatalogMatches(
              next,
              card?.dataset.templateKey,
            ),
            template = matches[0],
            items = processTemplateMediaItems(template).slice();
          items.splice(Number(button.dataset.removeTemplateMedia), 1);
          matches.forEach((item) => setProcessTemplateMedia(item, items));
          button.disabled=true;
          try{await applyProcessMasterSnapshot(before,next);}catch(error){toast(error.message);return;}finally{button.disabled=false;}
          document.querySelector('#data-content').innerHTML =
            processMasterView();
          bindDataInner('process-master');
        };
      });
    document.querySelector('#save-master-data')?.addEventListener(
      'click',
      saveProcessMasterDraft,
    );
  }
  if (tab === 'users') {
    document.querySelector('#add-user').onclick = () => {
      const id = document.querySelector('#new-user-id').value.trim(),
        name = document.querySelector('#new-user-name').value.trim(),
        password = document.querySelector('#new-user-password').value,
        role = document.querySelector('#new-user-role').value;
      if (!id || !name) {
        toast('請輸入帳號與姓名');
        return;
      }
      if (platformUsers.some((user) => user.id === id)) {
        toast('此帳號已存在');
        return;
      }
      const defaults =
        role === 'admin'
          ? [
              'dashboard',
              'player',
              'dispatch',
              'productStatus',
              'approval',
              'editor',
              'data',
            ]
          : role === 'rd'
            ? ['dashboard', 'productStatus', 'approval']
            : ['dashboard', 'productStatus', 'editor'];
      platformUsers.push({
        id,
        name,
        password,
        role,
        lines: role === 'admin' ? ['A', 'B', 'C'] : ['A'],
        views: defaults,
      });
      persistPlatform();
      document.querySelector('#data-content').innerHTML = userManagementView();
      bindDataInner('users');
      toast('使用者已建立');
    };
    document.querySelectorAll('.save-user').forEach(
      (button) =>
        (button.onclick = () => {
          const card = button.closest('[data-user-id]'),
            user = platformUsers.find(
              (item) => item.id === card.dataset.userId,
            );
          user.lines = [
            ...card.querySelectorAll('[data-user-line]:checked'),
          ].map((input) => input.dataset.userLine);
          user.views = [
            ...card.querySelectorAll('[data-user-view]:checked'),
          ].map((input) => input.dataset.userView);
          persistPlatform();
          toast(`${user.name} 權限已儲存`);
        }),
    );
  }
}
function applyPlatformIdentity() {
  document
    .querySelectorAll('.nav-item')
    .forEach((item) => (item.hidden = !canView(item.dataset.view)));
  const avatar = document.querySelector('#account-button'),
    name = document.querySelector('#account-name'),
    role = document.querySelector('#account-role');
  if (avatar)
    avatar.textContent =
      currentUser?.role === 'admin'
        ? 'AD'
        : currentUser?.role === 'rd'
          ? 'RD'
          : currentUser?.role === 'device'
            ? state.deviceLine
            : 'OP';
  if (name) name.textContent = currentUser?.name || '尚未登入';
  if (role)
    role.textContent = roleLabels[currentUser?.role] || '';
}
function enterPlatform(user) {
  sessionStorage.removeItem('process-platform-signed-out');
  const stored = platformUsers.find((item) => item.id === user.id),
    source = stored ? { ...stored, ...user } : user;
  currentUser = { ...source };
  state.view = 'dashboard';
  state.dataTab = window.ProcessSync?.deliveryProjection ? window.ProcessSync.destination?.dataTab || null : null;
  state.selectedOperation = null;
  if (typeof window.normalizePlatformUser === 'function')
    window.normalizePlatformUser(currentUser);
  if (stored) Object.assign(stored, currentUser);
  persistPlatform();
  document.querySelector('#login-root').innerHTML = '';
  document.querySelector('.app-shell').classList.remove('platform-locked');
  applyPlatformIdentity();
  const first = canView('dashboard')
    ? 'dashboard'
    : canView('player')
      ? 'player'
      : currentUser.views?.[0] || 'dashboard';
  navigate(first);
}
function renderLogin() {
  document.querySelector('.app-shell').classList.add('platform-locked');
  const loginRoot = document.querySelector('#login-root');
  loginRoot.innerHTML = `<section class="login-screen"><div class="login-brand"><div class="brand-mark">製</div><p class="eyebrow">製程中控平台</p><h1>製程中控入口</h1><p>依帳號權限進入管理、確認、編輯或產線播放功能。</p></div><div class="login-panel"><div class="demo-identities"><h2>選擇示範身分</h2><div class="role-login-grid"><button data-quick-login="admin"><b>ADMIN</b><span>全部功能與使用者管理</span></button><button data-quick-login="rd"><b>RD 主管</b><span>版本確認與製程檢視</span></button><button data-quick-login="operator"><b>製程人員（STAFF）</b><span>製程編輯與送審</span></button></div></div><div class="login-divider"><span>或輸入帳號密碼</span></div><div class="login-form"><div class="field"><label>帳號</label><input id="login-id" autocomplete="username"></div><div class="field"><label>密碼</label><input id="login-password" type="password" autocomplete="current-password"></div><button class="button signal" id="login-submit">登入平台</button></div><div class="device-entry"><h3>產線設備直接播放</h3><div class="two-field"><div class="field"><label>線別</label><select id="entry-line">${lines.map((line) => `<option value="${line.code}">${line.code} 線 · ${escapeHtml(line.name)}</option>`).join('')}</select></div><div class="field"><label>工段</label><select id="entry-stage">${(lines[0]?.stages || []).map((stage) => `<option value="${stage.code}">${stage.code} · ${escapeHtml(stage.name)}</option>`).join('')}</select></div></div><button class="button ghost" id="device-entry-button">進入工段播放</button></div><small class="login-hint">請輸入由 ADMIN 建立的平台帳號與密碼。</small></div></section>`;
  document
    .querySelectorAll('[data-quick-login]')
    .forEach(
      (button) =>
        (button.onclick = () =>
          enterPlatform(
            platformUsers.find(
              (user) => user.id === button.dataset.quickLogin,
            ) ||
              defaultUsers.find(
                (user) => user.id === button.dataset.quickLogin,
              ),
          )),
    );
  document.querySelector('#login-submit').onclick = () => {
    const id = document.querySelector('#login-id').value,
      password = document.querySelector('#login-password').value,
      user = platformUsers.find(
        (item) => item.id === id && item.password === password,
      );
    if (!user) {
      const hint = document.querySelector('.login-hint');
      hint.textContent = '帳號或密碼錯誤';
      hint.classList.add('error');
      return;
    }
    enterPlatform(user);
  };
  const entryLine = document.querySelector('#entry-line'),
    entryStage = document.querySelector('#entry-stage');
  entryLine.onchange = () => {
    entryStage.innerHTML = lineFor(entryLine.value)
      .stages.map(
        (stage) =>
          `<option value="${stage.code}">${stage.code} · ${escapeHtml(stage.name)}</option>`,
      )
      .join('');
  };
  document.querySelector('#device-entry-button').onclick = () => {
    state.deviceLine = entryLine.value;
    state.deviceStage = entryStage.value;
    enterPlatform({
      id: `device-${state.deviceLine}-${state.deviceStage}`,
      name: `${state.deviceLine} 線 ${state.deviceStage} 設備`,
      role: 'device',
      lines: [state.deviceLine],
      views: ['player'],
    });
  };
}
function navigate(view) {
  if (!canView(view)) {
    toast('目前帳號沒有此功能權限');
    return;
  }
  state.view = view;
  document
    .querySelectorAll('.nav-item')
    .forEach((n) => n.classList.toggle('active', n.dataset.view === view));
  document.querySelector('#eyebrow').textContent = titles[view][0];
  document.querySelector('#page-title').textContent = titles[view][1];
  document.querySelector('.sidebar').classList.remove('open');
  render();
}
function render() {
  root.innerHTML = {
    dashboard,
    player,
    dispatch,
    editor,
    productStatus,
    approval,
    data: dataView,
  }[state.view]();
  bindView();
}
document
  .querySelectorAll('.nav-item')
  .forEach((item) => (item.onclick = () => navigate(item.dataset.view)));
document.querySelector('#menu-toggle').onclick = () =>
  document.querySelector('.sidebar').classList.toggle('open');
document.querySelector('#account-button').onclick = () =>
  document.querySelector('#account-menu').classList.toggle('open');
document.querySelector('#logout-button').onclick = async () => {
  const draftAccount=window.sharedDraftAccountState?.();
  if(draftAccount?.queued||draftAccount?.unknown||draftAccount?.failed){
    if(!confirm('Thao tác chưa đồng bộ hoặc chưa rõ kết quả. Bản đã lưu vẫn ở máy chủ; hãy đăng nhập lại bằng cùng tài khoản để kiểm tra mã thao tác. Đăng xuất mà không lưu thêm?\n尚有未同步或結果未知的操作。已儲存資料仍在伺服器；請以相同帳號重新登入查證操作。是否登出而不補存？'))return;
  }
  if(await window.ProcessSync?.flush?.()!==true){
    if(!confirm('Không thể xác nhận đồng bộ. Dữ liệu đã lưu vẫn ở máy chủ; đầu vào chưa đồng bộ được giữ riêng theo tài khoản, không tự gửi lại. Không đóng trang trước khi tải bản phục hồi. Đăng xuất?\n無法確認同步。已儲存資料仍在伺服器；未同步輸入按帳號保留，不自動補送。下載保全檔前請勿關閉本頁。仍要登出？'))return;
  }
  try{const response=await fetch('/api/platform-login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'logout'}),signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('LOGOUT_NOT_CONFIRMED');}catch{toast('Chưa xác nhận đăng xuất; tài khoản và đầu vào vẫn được giữ. / 尚未確認登出，帳號及輸入仍保留。');return;}
  window.ProcessSync?.clearIdentity?.();
  sessionStorage.setItem('process-platform-signed-out', '1');
  currentUser = null;
  persistPlatform();
  document.querySelector('#account-menu').classList.remove('open');
  renderLogin();
};
setInterval(() => {
  const now = new Date();
  document.querySelector('#clock').textContent = now.toLocaleString('zh-TW', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  const bc = document.querySelector('#board-clock');
  if (bc)
    bc.textContent = now.toLocaleTimeString('zh-TW', {
      hour: '2-digit',
      minute: '2-digit',
    });
}, 1000);
syncProductRoute();
if (currentUser) {
  applyPlatformIdentity();
  const initial = canView(state.view)
    ? state.view
    : canView('dashboard')
      ? 'dashboard'
      : 'player';
  navigate(initial);
} else renderLogin();

// A fresh destination replaces every business mirror, not a merge/cache of pages.
window.ProcessRuntimeProjection={
  applyPlayerIntent,
  canLeave:()=>[...processMasterNameBindings].every(binding=>binding.clean()),
  install(catalog){
    if(catalog?.format!=='PROCESS_RUNTIME_CATALOG_V1'||!catalog.imported||!catalog.routing||!catalog.lineC)throw Error('BOOTSTRAP_INVALID_CATALOG');
    const replace=(target,value)=>{for(const key of Object.keys(target))delete target[key];Object.assign(target,value);};
    replace(data,catalog.imported);replace(routing,catalog.routing);
    if(window.LINE_C_MASTER&&typeof window.LINE_C_MASTER==='object')replace(window.LINE_C_MASTER,catalog.lineC);else window.LINE_C_MASTER=catalog.lineC;
    window.IMPORTED_DATA=data;window.LINE_PROCESS_DATA=routing;
    lines.splice(0,lines.length,...routing.lines.map((line,index)=>({...line,stations:line.stages.map(stage=>stage.code),load:[82,64,48][index]||50})));
    platformUsers=readStore('platformUsers',[]);approvalVersions=readStore('approvalVersions',[]);dispatchBoard=readStore('dispatchBoard',{});processMaster=readStore('processMasterData',{});
    const actor=window.ProcessSync?.identity,stored=platformUsers.find(user=>user.id===actor?.id);
    if(!actor||!stored)throw Error('BOOTSTRAP_IDENTITY_REQUIRED');
    currentUser={...stored,...actor};window.normalizePlatformUser?.(currentUser);
    state.published=readStore('publishedProcess',null);state.processes=[];state.editorByCategory={};state.selectedOperation=null;state.addingStage=null;state.editorProblemPlaceholder=null;state.editorVersionId=null;
    state.category=data.categories?.[0]||'';state.productCode=data.products?.[0]?.code||'';state.editorLine=routing.lines?.[0]?.code||'';state.masterStage=routing.lines?.[0]?.stages?.[0]?.code||'';
    for(const binding of processMasterNameBindings){binding.input.oninput=binding.input.oncompositionstart=binding.input.oncompositionend=null;}processMasterNameBindings.clear();
    window.ProcessRoles?.refresh?.();applyPlatformIdentity();
  }
};
