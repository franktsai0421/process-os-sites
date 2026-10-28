// Synthetic module data only. No real accounts, credentials, imported photos or live records.
export function toolingIsolatedSnapshot(count = 366) {
  const categories = Array.from({length: 3}, (_, i) => ({id: 'SYN-CAT-' + i, code: 'DC' + String(i + 1).padStart(2, '0'), nameVi: 'Loại tổng hợp ' + i, nameZh: '隔離類別 ' + i}));
  const custodians = Array.from({length: 12}, (_, i) => ({id: 'SYN-HOLDER-' + i, nameVi: 'Đơn vị tổng hợp ' + i, nameZh: '隔離保管單位 ' + i}));
  const suppliers = Array.from({length: 12}, (_, i) => ({id: 'SYN-SUP-' + i, code: 'SUP' + String(i + 1).padStart(3, '0'), nameVi: 'Nhà cung cấp tổng hợp ' + i, nameZh: '隔離供應商 ' + i, erp: 'SYN-ERP-' + i, addresses: [], phones: [], contacts: []}));
  const manufacturers = [{id: 'SYN-MFR', code: 'MFR001', nameVi: 'Nhà sản xuất tổng hợp', nameZh: '隔離製造商', erp: 'SYN-MFR', addresses: [], phones: [], contacts: []}];
  const tools = Array.from({length: count}, (_, i) => ({id: 'SYN-TOOL-' + i, code: categories[i % 3].code + '-' + String(i + 1).padStart(4, '0'), nameVi: 'Khuôn tổng hợp ' + i, nameZh: i % 7 ? '隔離模具 ' + i : '', categoryId: categories[i % 3].id, assetCode: 'SYN-ASSET-' + i, specification: 'Synthetic fixture — never production', quantity: i % 2 + 1, unit: 'PCS', manufacturerId: i % 11 ? 'SYN-MFR' : '', location: {kind: 'internal', holderId: 'SYN-HOLDER-0'}, inboundDate: i % 5 ? '2026-10-01' : '', inboundDateLost: i % 5 === 0, enabled: i % 9 !== 0, inactiveReason: i % 9 ? '' : 'Synthetic inspection hold', archived: false, archiveReason: '', notes: '', frequencyMonths: 12, photos: [], iqcIds: ['SYN-IQC-' + i % 3]}));
  const transfers = tools.flatMap(t => {
    const move = (suffix, from, to, extra = {}) => ({id: t.id + '-' + suffix, toolId: t.id, from, to, reason: 'Synthetic approved transfer ' + suffix, ...extra});
    const internal = i => ({kind: 'internal', holderId: 'SYN-HOLDER-' + i}), external = i => ({kind: 'external', holderId: i === null ? '' : 'SYN-SUP-' + i});
    return [move('m0', internal(0), internal(1)), move('c0', internal(0), external(0), {correctionOf: t.id + '-m0'}), move('m1', external(0), internal(2)), move('c1', internal(0), external(1), {correctionOf: t.id + '-c0'}), move('missing', internal(2), external(null), {reason: ''}), move('m2', internal(2), external(2))];
  });
  return {categories, custodians, suppliers, manufacturers, tools, transfers};
}

export function toolingIsolatedIqc() {
  return {activeVersionId: 'SYN-IQC-ACTIVE', versions: [{id: 'SYN-IQC-ACTIVE', number: 1, status: 'approved', snapshot: {parts: Array.from({length: 3}, (_, i) => ({id: 'SYN-IQC-' + i, code: 'SYN-IQC-' + i, nameVi: 'Sản phẩm tổng hợp ' + i, nameZh: '隔離 IQC 產品 ' + i, specificationVi: 'Fixture', specificationZh: '測試', categoryId: 'SYN-IQC-CAT-' + i % 2, supplierIds: ['SYN-IQC-SUP-' + i % 2], isEnabled: true, photos: []})), categories: [{id: 'SYN-IQC-CAT-0', nameVi: 'A'}, {id: 'SYN-IQC-CAT-1', nameVi: 'B'}], suppliers: [{id: 'SYN-IQC-SUP-0', nameVi: 'A'}, {id: 'SYN-IQC-SUP-1', nameVi: 'B'}], errors: [], items: []}}]};
}
