import {isImmutableRecordBody} from './state-records';
import type {DraftIssue} from './shared-draft';
export type IpqcError = {
  id: string; code: string; productCode: string; stageCode: string;
  name: string; note: string; reason: string; sourceRow?: number; deleted?: boolean;
};
export type IpqcPhoto = { id: string; name: string; note: string; afterParagraph?: number };
export type IpqcRule = {
  cadence: 'none' | 'batch' | 'time'; batchKind?: 'aql' | 'fixed_count' | 'batch_quantity' | 'custom';
  aqlValue?: string; fixedCount?: string; batchQuantity?: string; customBatchText?: string; customBatchValue?: string;
  timeFrequency?: 'weekly' | 'monthly' | 'quarterly' | 'half_yearly' | 'yearly' | 'custom'; customTimeText?: string;
};
export type IpqcItem = {
  id: string; code: string; errorId: string; productCode: string; stageCode: string;
  standard: string; cpkEnabled: boolean; standardEnabled: boolean;
  description: string; tool: string; method: string; frequency: string; rule?: IpqcRule;
  note: string; reason: string; notApplicable?: boolean; notApplicableReason?: string;
  equipmentGroupId?: string; equipmentId?: string;
  equipmentSnapshot?: { id: string; assetCode: string; pieceMark: string; name: string; spec: string; photoId?: string } | null;
  mediaItems: IpqcPhoto[]; sourceRow?: number; deleted?: boolean;
};
export type IpqcSnapshot = { errors: IpqcError[]; items: IpqcItem[] };
export type IpqcVersion = {
  id: string; number: number; status: 'draft' | 'pending' | 'approved' | 'superseded' | 'returned' | 'withdrawn';
  snapshot: IpqcSnapshot; baseVersionId: string | null; revision: number;
  creatorId: string; creatorName: string; createdAt: string; updatedAt: string;
  submittedBy?: string; submittedAt?: string; reviewedBy?: string; reviewedAt?: string;
  reviewComment?: string; origin?: 'initial-build';
  contentIssues?:{policy:'ipqc-completeness-v1';issues:DraftIssue[]};
  history: { action: string; actorId: string; actorName: string; at: string; comment?: string }[];
};
export type IpqcControl = {
  schemaVersion: 1; activeVersionId: string | null; versions: IpqcVersion[];
  source: null | { fileName: string; sha256: string; rows: number; imported: number; builtAt: string; environment: 'local' };
  reservedErrorCodes: string[]; reservedItemCodes: string[];
};
export const emptyIpqcControl = (): IpqcControl => ({
  schemaVersion: 1, activeVersionId: null, versions: [], source: null,
  reservedErrorCodes: [], reservedItemCodes: [],
});
export const activeIpqc = (control: IpqcControl) => control.versions.find(v => v.id === control.activeVersionId);
export const openIpqc = (control: IpqcControl) => control.versions.find(v => v.status === 'draft' || v.status === 'pending');
export const copyIpqc = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

export function parseIpqcControl(raw: string | undefined, prepared?:unknown): IpqcControl {
  if (raw === undefined) return emptyIpqcControl();
  let value: IpqcControl;
  try { value = (prepared||JSON.parse(raw)) as IpqcControl; } catch { throw Error('IPQC-C 資料無法解析；已停止寫入'); }
  if (value?.schemaVersion !== 1 || !Array.isArray(value.versions) ||
      !Array.isArray(value.reservedErrorCodes) || !Array.isArray(value.reservedItemCodes) ||
      !value.versions.every(v => v && (prepared&&isImmutableRecordBody(v.snapshot)||Array.isArray(v.snapshot?.errors) && Array.isArray(v.snapshot?.items))))
    throw Error('IPQC-C 資料格式不相容；已停止寫入');
  return value;
}

export function nextErrorCode(control: IpqcControl, productCode: string, stageCode: string,index?:import('./state-records').AllocationIndex) {
  const suffix = stageCode.startsWith('C-') ? stageCode.slice(2) : stageCode;
  const prefix = `C-${productCode}-${suffix}-L`;
  const used = new Set([...control.reservedErrorCodes,
    ...(index?index.errors.map(e=>e.code):control.versions.flatMap(v => v.snapshot.errors.map(e => e.code)))]);
  let maximum = 0;
  for (const code of used) if (code.startsWith(prefix) && /^\d+$/.test(code.slice(prefix.length)))
    maximum = Math.max(maximum, Number(code.slice(prefix.length)));
  const code = `${prefix}${maximum + 1}`;
  control.reservedErrorCodes.push(code);
  return code;
}

export function nextItemCode(control: IpqcControl, errorCode: string,index?:import('./state-records').AllocationIndex) {
  const prefix = `${errorCode}-`;
  const used = new Set([...control.reservedItemCodes,
    ...(index?index.items.map(i=>i.code):control.versions.flatMap(v => v.snapshot.items.map(i => i.code)))]);
  let maximum = 0;
  for (const code of used) if (code.startsWith(prefix) && /^\d+$/.test(code.slice(prefix.length)))
    maximum = Math.max(maximum, Number(code.slice(prefix.length)));
  const code = `${prefix}${String(maximum + 1).padStart(2, '0')}`;
  control.reservedItemCodes.push(code);
  return code;
}

const textFields = ['note','reason','standard','description','tool','method','frequency',
  'notApplicableReason','equipmentGroupId','equipmentId'] as const;
export function checkedIpqcRule(raw: unknown): IpqcRule | undefined {
  if (raw === undefined) return undefined;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw Error('檢查規則格式錯誤');
  const row = raw as Record<string, unknown>;
  const get = (key: string) => typeof row[key] === 'string' ? String(row[key]).trim() : '';
  if (row.cadence === 'none') return { cadence: 'none' };
  if (row.cadence === 'time') {
    const frequency = get('timeFrequency');
    if (!['weekly','monthly','quarterly','half_yearly','yearly','custom'].includes(frequency) ||
        (frequency === 'custom' && !get('customTimeText'))) throw Error('按時間規則尚未完成');
    return { cadence: 'time', timeFrequency: frequency as IpqcRule['timeFrequency'],
      ...(frequency === 'custom' ? { customTimeText: get('customTimeText') } : {}) };
  }
  if (row.cadence === 'batch') {
    const kind = get('batchKind');
    if (!['aql','fixed_count','batch_quantity','custom'].includes(kind)) throw Error('批次取樣方式無效');
    if (kind === 'aql' && !get('aqlValue')) throw Error('AQL 不可空白');
    if (kind === 'fixed_count' && !/^[1-9]\d*$/.test(get('fixedCount'))) throw Error('固定件數必須是正整數');
    if (kind === 'batch_quantity' && !/^[1-9]\d*$/.test(get('batchQuantity'))) throw Error('批次數量必須是正整數');
    if (kind === 'custom' && (!get('customBatchText') || !get('customBatchValue'))) throw Error('自訂批次規則不可空白');
    return { cadence: 'batch', batchKind: kind as IpqcRule['batchKind'],
      ...(kind === 'aql' ? { aqlValue: get('aqlValue') } : {}),
      ...(kind === 'fixed_count' ? { fixedCount: get('fixedCount') } : {}),
      ...(kind === 'batch_quantity' ? { batchQuantity: get('batchQuantity') } : {}),
      ...(kind === 'custom' ? { customBatchText: get('customBatchText'), customBatchValue: get('customBatchValue') } : {}) };
  }
  throw Error('檢查規則方式無效');
}
export function checkedIpqcSnapshot(version: IpqcVersion, raw: unknown): IpqcSnapshot {
  const input = raw as IpqcSnapshot;
  if (!input || !Array.isArray(input.errors) || !Array.isArray(input.items)) throw Error('草稿格式錯誤');
  const oldErrors = new Map(version.snapshot.errors.map(e => [e.id, e]));
  const oldItems = new Map(version.snapshot.items.map(i => [i.id, i]));
  if (input.errors.length !== oldErrors.size || input.items.length !== oldItems.size)
    throw Error('草稿項目數量不符；新增與刪除請使用專用操作');
  if (new Set(input.errors.map(row => row.id)).size !== oldErrors.size ||
      new Set(input.items.map(row => row.id)).size !== oldItems.size)
    throw Error('草稿含重複項目 ID');
  const errors = input.errors.map(row => {
    const old = oldErrors.get(row?.id);
    if (!old || row.code !== old.code || row.productCode !== old.productCode || row.stageCode !== old.stageCode)
      throw Error('錯誤代碼身分或編號不可改寫');
    if (typeof row.name !== 'string' || typeof row.note !== 'string' || typeof row.reason !== 'string' || typeof row.deleted !== 'boolean')
      throw Error(`${old.code} 欄位格式錯誤`);
    return { ...old, name: row.name, note: row.note, reason: row.reason, deleted: row.deleted };
  });
  const items = input.items.map(row => {
    const old = oldItems.get(row?.id);
    if (!old || row.code !== old.code || row.errorId !== old.errorId || row.productCode !== old.productCode || row.stageCode !== old.stageCode)
      throw Error('檢查項目身分或編號不可改寫');
    if (textFields.some(field => row[field] !== undefined && typeof row[field] !== 'string') ||
        typeof row.cpkEnabled !== 'boolean' || typeof row.standardEnabled !== 'boolean' ||
        typeof row.deleted !== 'boolean' || typeof row.notApplicable !== 'boolean' ||
        !Array.isArray(row.mediaItems) || row.mediaItems.some(photo => !photo || !/^[a-f0-9]{64}$/.test(photo.id) ||
          typeof photo.name !== 'string' || typeof photo.note !== 'string' ||
          (photo.afterParagraph !== undefined && (!Number.isInteger(photo.afterParagraph) || photo.afterParagraph < 0))))
      throw Error(`${old.code} 欄位格式錯誤`);
    if (row.equipmentSnapshot !== undefined && row.equipmentSnapshot !== null &&
        (typeof row.equipmentSnapshot !== 'object' || typeof row.equipmentSnapshot.id !== 'string'))
      throw Error(`${old.code} 檢具快照格式錯誤`);
    const rule = checkedIpqcRule(row.rule);
    return { ...old, ...Object.fromEntries(textFields.filter(field => row[field] !== undefined).map(field => [field, row[field]])),
      cpkEnabled: row.cpkEnabled, standardEnabled: row.standardEnabled,
      deleted: row.deleted, notApplicable: row.notApplicable, mediaItems: row.mediaItems,
      ...(rule !== undefined ? { rule } : {}),
      equipmentSnapshot: row.equipmentSnapshot === undefined ? old.equipmentSnapshot : row.equipmentSnapshot };
  });
  const errorIds = new Set(errors.filter(e => !e.deleted).map(e => e.id));
  if (items.some(i => !i.deleted && !errorIds.has(i.errorId))) throw Error('仍有檢查項目的錯誤代碼不能單獨刪除');
  return { errors, items };
}

export function submitIpqcIssues(version: IpqcVersion, base: IpqcVersion | undefined,
  products: Array<{ code: string; stages: string[] }>) {
  const issues: DraftIssue[] = [];
  const add=(collection:string,id:string,field:string,code:string,message:string,advisory=false)=>issues.push({kind:advisory?'missing':'error',code,path:[collection,{id},field],message});
  const routes = new Map(products.map(p => [p.code, new Set(p.stages || [])]));
  const priorErrors = new Map(base?.snapshot.errors.map(e => [e.id, JSON.stringify(e)]) || []);
  const priorItems = new Map(base?.snapshot.items.map(i => [i.id, JSON.stringify(i)]) || []);
  for (const error of version.snapshot.errors) {
    if (error.deleted) continue;
    if (priorErrors.get(error.id)!==JSON.stringify(error)&&!error.name.trim())add('errors',error.id,'name','NAME_REQUIRED',`${error.code}: 錯誤名稱待補`,true);
    if (!routes.get(error.productCode)?.has(error.stageCode))add('errors',error.id,'productCode','PRODUCT_ROUTE_INVALID',`${error.code}: 產品已不在 C 線此工段路線`);
  }
  for (const item of version.snapshot.items) {
    if (item.deleted) continue;
    if (!routes.get(item.productCode)?.has(item.stageCode))add('items',item.id,'productCode','PRODUCT_ROUTE_INVALID',`${item.code}: 產品已不在 C 線此工段路線`);
    if (!item.description.trim())add('items',item.id,'description','IPQC_METHOD_MISSING',`${item.code}: 檢查方式敘述未填`,true);
    if ((!item.rule&&!item.frequency.trim()||item.rule?.cadence==='none')&&!item.notApplicable)add('items',item.id,'rule','IPQC_FREQUENCY_MISSING',`${item.code}: 檢查頻率未設定`,true);
    if (priorItems.get(item.id)!==JSON.stringify(item)&&!item.sourceRow && (!item.standard.trim() && !(item.notApplicable && item.notApplicableReason?.trim())))
      add('items',item.id,'standard','STANDARD_REQUIRED',`${item.code}: 檢查標準或不適用原因待補`,true);
    try{checkedIpqcRule(item.rule);}catch{add('items',item.id,'rule','FREQUENCY_INVALID',`${item.code}: 已填檢查頻率格式不合法`);}
  }
  for(const product of products)for(const stage of product.stages)if(!version.snapshot.items.some(i=>!i.deleted&&i.standardEnabled&&!i.notApplicable&&i.productCode===product.code&&i.stageCode===stage))add('products',product.code,stage,'IPQC_PRODUCT_COVERAGE',`${product.code} / ${stage}: 適用產品尚未完整涵蓋`,true);
  return issues;
}
export function submitIpqcErrors(version:IpqcVersion,base:IpqcVersion|undefined,products:Array<{code:string;stages:string[]}>){return submitIpqcIssues(version,base,products).filter(i=>i.kind==='error').map(i=>i.message);}
