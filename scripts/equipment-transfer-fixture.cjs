// Full actual equipment transfer UI -> actual routes, normal synthetic approvals.
// No browser, HTTP server or live records. IPQC-C test rights are fixture-local.
const { fixture, json } = require('./quality-replacement-preview-fixture.cjs');
const insert = (collection, value) => ({ op: 'insert', path: [collection], value });
const empty = { AB: { products: [], lines: [], categoryGroups: [] }, C: { products: [], lines: [], categoryGroups: [] }, PROCESS: {} };
const master = { active: json(empty), versions: Object.entries(empty).map(([scope, snapshot]) => ({ id: 'initial-empty-' + scope, scope, number: 1, status: 'approved', snapshot, revision: 1, creatorId: 'fixture-initializer', creatorName: 'Synthetic empty initialization', createdAt: 'synthetic', updatedAt: 'synthetic', history: [] })) };
const emptyC = { schemaVersion: 1, activeVersionId: null, source: null, issues: [], reservedErrorCodes: [], reservedItemCodes: [], versions: [{ id: 'synthetic-empty-draft', number: 1, status: 'draft', snapshot: { errors: [], items: [] }, baseVersionId: null, revision: 1, creatorId: 'fixture-initializer', creatorName: 'Synthetic empty initialization', createdAt: 'synthetic', updatedAt: 'synthetic', history: [] }] };
const scopeQ = '&scope=' + encodeURIComponent('A:G-A');
async function createTransferFixture(){
  const h = await fixture({ masterDataControl: JSON.stringify(master), processMasterData: '{}', ipqcCMasterControl: JSON.stringify(emptyC) }, { includeIPQCC: true });
  const fullRead = async(moduleId, q) => moduleId === 'ipqc-c' ? {control:JSON.parse((await h.core.readState()).values.ipqcCMasterControl)} : h.read(moduleId, 'editor', q);
  try {
    for (const [scope, line, group, product] of [['AB', 'A', 'G-A', 'A100'], ['C', 'C', 'G-C', 'C100']]) {
      const q = '&scope=' + scope, stage = line + '-CUT';
      await h.begin('master', 'editor', 200, q);
      await h.command('master', 'apply', { patches: [insert('lines', { id: 'line-' + line, code: line, name: 'Synthetic ' + line, stages: [{ id: 'stage-' + stage, code: stage, name: 'Synthetic cut' }] }), insert('categoryGroups', { id: 'group-' + group, line, name: group, defaultStages: [stage] })] }, 'editor', 200, q); await h.promote('master', q);
      await h.begin('master', 'editor', 200, q);
      await h.command('master', 'apply', { patches: [insert('products', { id: 'product-' + product, code: product, name: 'Synthetic ' + product, line, category: group, routeMode: 'group', stages: [stage], specification: '10 mm', unit: 'PCS' })] }, 'editor', 200, q); await h.promote('master', q);
    }
    await h.begin('routine-equipment');
    await h.command('routine-equipment', 'apply', { patches: [insert('categories', { id: 'category', name: 'Synthetic category' }), insert('subcategories', { id: 'subcategory', categoryId: 'category', name: 'Synthetic subcategory' }), insert('groups', { id: 'group', categoryId: 'category', subcategoryId: 'subcategory', name: 'Synthetic group' })] });
    await h.command('routine-equipment', 'apply', { patches: ['source', 'target'].map((id, i) => insert('equipment', { id, assetCode: 'SYN-X-' + i, name: 'Synthetic ' + id, groupId: 'group', unit: '支', enabled: true, confirmed: true, calibrationMethod: 'none', calibratedAt: '', expiresAt: '' })) }); await h.promote('routine-equipment');
    await h.begin('fqc'); await h.command('fqc', 'apply', { patches: [insert('errors', { id: 'fqc-error', name: 'Synthetic defect', line: 'A', category: 'G-A' }), insert('items', { id: 'fqc-item', errorId: 'fqc-error', name: 'Synthetic standard', description: 'Preserve method', line: 'A', category: 'G-A', isEnabled: true, equipmentId: 'source', tool: '01', mediaItems: [], productCodes: ['A100'], rule: { cadence: 'batch', batchKind: 'aql', aqlValue: '0.25' } })] }); await h.promote('fqc');
    await h.begin('iqc'); await h.command('iqc', 'apply', { patches: [insert('categories', { id: 'iqc-category', nameVi: 'Synthetic' }), insert('suppliers', { id: 'supplier', nameVi: 'Synthetic' }), insert('parts', { id: 'part', code: 'PART1', nameVi: 'Synthetic part', specificationVi: '10 mm', categoryId: 'iqc-category', supplierIds: ['supplier'], supplierRaw: '', standardCode: '', photos: [] })] });
    await h.command('iqc', 'apply', { moduleAction: 'createError', input: { partCode: 'PART1', nameVi: 'Synthetic defect' } });
    await h.command('iqc', 'apply', { moduleAction: 'createItem', input: { errorId: h.flow(await h.read('iqc')).working.errors[0].id, nameVi: 'Synthetic standard', methodVi: 'Preserve method', inspectionMode: 'equipment', equipmentId: 'source', rules: [{ id: 'rule', cadence: 'batch', kind: 'aql', value: '0.25' }] } }); await h.promote('iqc');
    for (const [moduleId, q, product, stage] of [['ipqc-ab', scopeQ, 'A100', 'A-CUT'], ['ipqc-c', '', 'C100', 'C-CUT']]) {
      await h.begin(moduleId, 'editor', 200, q); await h.command(moduleId, 'apply', { moduleAction: 'create-error', input: { productCode: product, stageCode: stage, name: 'Synthetic defect' } }, 'editor', 200, q);
      const errorId = h.flow(await fullRead(moduleId, q)).working.errors[0].id;
      const item = moduleId === 'ipqc-ab' ? { standard: '10 mm', methodText: 'Preserve method', inspectionMode: 'equipment', equipmentId: 'source', productCodes: [product], rules: [{ id: 'rule', cadence: 'batch', kind: 'aql', value: '0.25' }] } : { standard: '10 mm', standardEnabled: true, description: 'Preserve method', equipmentId: 'source', equipmentGroupId: 'group', rule: { cadence: 'batch', batchKind: 'aql', aqlValue: '0.25' }, mediaItems: [] };
      await h.command(moduleId, 'apply', { moduleAction: 'create-item', input: { errorId, item } }, 'editor', 200, q);
      if (moduleId === 'ipqc-ab') await h.begin(moduleId, 'editor', 200, '&module=1');
      await h.promote(moduleId, moduleId === 'ipqc-ab' ? '&module=1' : q);
    }
    return h;
  } catch(error){h.close();throw error;}
}
module.exports={createTransferFixture};
