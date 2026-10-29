export type IqcRule = {
  id: string;
  cadence: 'source' | 'batch' | 'time';
  kind: string;
  value: string;
  nameVi?: string;
  sourceTextVi?: string;
};

export type IqcPhoto = {
  id: string;
  src: string;
  sourceRow?: number;
  sourceColumn?: number;
  name?: string;
};

export type IqcPart = {
  id: string;
  code: string;
  nameVi: string;
  specificationVi: string;
  categoryId: string;
  supplierIds: string[];
  supplierRaw: string;
  standardCode: string;
  inspectionType?: string;
  sourceRows?: number[];
  photos: IqcPhoto[];
  sourceRow?: number;
  isDeleted?: boolean;
  isEnabled?: boolean;
};

export type IqcError = {
  id: string;
  partCode: string;
  code: string;
  nameVi: string;
  sourceRow?: number;
  isDeleted?: boolean;
};

export type IqcItem = {
  id: string;
  partCode: string;
  errorId: string;
  checkNo: string;
  nameVi: string;
  toolVi: string;
  methodVi: string;
  frequencyRaw: string;
  rules: IqcRule[];
  isEnabled: boolean;
  inspectionSpecVi?: string;
  inspectionMode?: 'visual' | 'equipment';
  equipmentId?: string;
  equipmentSnapshot?: { id: string; assetCode: string; pieceMark: string; name: string; spec: string; photoId?: string } | null;
  mediaItems?: (IqcPhoto & { note?: string })[];
  sourceRow?: number;
  source?: { enabledRaw?: string; versionRaw?: string; dateRaw?: string;
    reasonVi?: string; creatorVi?: string; noteVi?: string };
  isDeleted?: boolean;
};

export type IqcSnapshot = {
  categories: { id: string; nameVi: string }[];
  suppliers: { id: string; nameVi: string }[];
  parts: IqcPart[];
  errors: IqcError[];
  items: IqcItem[];
};

export type IqcVersion = {
  id: string;
  number: number;
  status: 'draft' | 'pending' | 'approved' | 'superseded' | 'withdrawn' | 'returned';
  snapshot: IqcSnapshot;
  creatorId: string;
  creatorName: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
  baseVersionId?: string | null;
  submittedBy?: string;
  submittedAt?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewComment?: string;
  history: { action: string; actorId: string; actorName: string; at: string; comment?: string }[];
};

export type IqcControl = {
  schemaVersion: 1;
  activeVersionId: string | null;
  versions: IqcVersion[];
  source?: { fileName: string; sha256: string; mappingSha256: string };
  issues: { row?: number; partCode?: string; type: string; message: string }[];
  reservedErrorCodes: string[];
  reservedCheckNos: string[];
};

export const emptyIqcControl = (): IqcControl => ({
  schemaVersion: 1, activeVersionId: null, versions: [], issues: [],
  reservedErrorCodes: [], reservedCheckNos: [],
});

export const activeIqcVersion = (control: IqcControl) =>
  control.versions.find(version => version.id === control.activeVersionId);

export const openIqcVersion = (control: IqcControl) =>
  control.versions.find(version => version.status === 'draft' || version.status === 'pending');

export const emptyIqcSnapshot = (): IqcSnapshot => ({
  categories: [], suppliers: [], parts: [], errors: [], items: [],
});

const text = (value: unknown) => typeof value === 'string' ? value : '';
const unique = (values: string[]) => new Set(values).size === values.length;

export function checkedIqcSnapshot(previous: IqcSnapshot, value: unknown, working = false): IqcSnapshot {
  if (!value || typeof value !== 'object') throw Error('IQC 草稿格式錯誤');
  const next = value as IqcSnapshot;
  if (!['categories','suppliers','parts','errors','items'].every(key => Array.isArray(next[key as keyof IqcSnapshot])))
    throw Error('IQC 草稿缺少必要清單');
  const ids = (rows: { id: string }[]) => rows.map(row => row.id);
  for (const rows of [next.categories, next.suppliers, next.parts, next.errors, next.items])
    if (!unique(ids(rows)) || rows.some(row => !text(row.id).trim())) throw Error('IQC 資料 ID 重複或空白');
  if (!unique(next.parts.map(part => part.code)) || !unique(next.errors.map(error => error.code)) ||
      !unique(next.items.map(item => item.checkNo))) throw Error('IQC 原始編號或新增編號重複');
  for (const [oldRows, newRows, key] of [
    [previous.parts, next.parts, 'code'], [previous.errors, next.errors, 'code'],
    [previous.items, next.items, 'checkNo'],
  ] as const) {
    const newById = new Map((newRows as { id: string }[]).map(row => [row.id, row]));
    for (const old of oldRows as { id: string; code?: string; checkNo?: string }[]) {
      const current = newById.get(old.id) as typeof old | undefined;
      if (!current || current[key] !== old[key]) throw Error('既有 IQC 編號不可刪除或重編；請使用停用標記');
    }
  }
  const nextErrors = new Map(next.errors.map(error => [error.id, error]));
  for (const old of previous.errors)
    if (nextErrors.get(old.id)?.partCode !== old.partCode ||
        nextErrors.get(old.id)?.sourceRow !== old.sourceRow)
      throw Error(`${old.code} 的來源零件不可改動`);
  const nextItems = new Map(next.items.map(item => [item.id, item]));
  for (const old of previous.items) {
    const current = nextItems.get(old.id);
    if (current?.partCode !== old.partCode || current.errorId !== old.errorId ||
        current.sourceRow !== old.sourceRow || current.frequencyRaw !== old.frequencyRaw ||
        JSON.stringify(current.source) !== JSON.stringify(old.source))
      throw Error(`${old.checkNo} 的來源關聯不可改動`);
  }
  const nextParts = new Map(next.parts.map(part => [part.id, part]));
  for (const old of previous.parts) {
    const current = nextParts.get(old.id)!;
    if (current.sourceRow !== old.sourceRow ||
        JSON.stringify(current.sourceRows) !== JSON.stringify(old.sourceRows) ||
        current.supplierRaw !== old.supplierRaw || current.standardCode !== old.standardCode ||
        current.inspectionType !== old.inspectionType)
      throw Error(`${old.code} 的 Excel 來源欄位不可改動`);
    const currentPhotos = new Map(current.photos.map(photo => [photo.id, photo]));
    for (const photo of old.photos) {
      const existing = currentPhotos.get(photo.id);
      if (existing && (existing.sourceRow !== photo.sourceRow || existing.sourceColumn !== photo.sourceColumn))
        throw Error(`${old.code} 的照片來源錨點不可改動`);
    }
  }
  if (next.parts.some(part => !text(part.code).trim() || !Array.isArray(part.supplierIds) || !Array.isArray(part.photos)) ||
      next.errors.some(error => !text(error.code).trim() || !text(error.partCode).trim()) ||
      next.items.some(item => !text(item.checkNo).trim() || !Array.isArray(item.rules)))
    throw Error('IQC 資料欄位不完整');
  const categoryIds = new Set(next.categories.map(category => category.id));
  const supplierIds = new Set(next.suppliers.map(supplier => supplier.id));
  if (!working && (next.categories.some(category => !text(category.nameVi).trim()) ||
      next.suppliers.some(supplier => !text(supplier.nameVi).trim())) ||
      !unique(next.categories.map(category => text(category.nameVi).trim()).filter(Boolean)) ||
      !unique(next.suppliers.map(supplier => text(supplier.nameVi).trim()).filter(Boolean)))
    throw Error('類別或供應商名稱不可空白或重複');
  for (const part of next.parts) {
    if(part.isEnabled!==undefined&&typeof part.isEnabled!=='boolean')throw Error('IQC 停用標記格式錯誤');
    if (part.categoryId && !categoryIds.has(part.categoryId)) throw Error(`${part.code} 參照已刪除的類別`);
    if (part.supplierIds.some(id => !supplierIds.has(id))) throw Error(`${part.code} 參照已刪除的供應商`);
    if (!unique(part.supplierIds)) throw Error(`${part.code} 供應商順序不可重複`);
    if (!unique(part.photos.map(photo => photo.id)) ||
        part.photos.some(photo => !/^[a-f0-9]{64}$/.test(text(photo.id)) ||
          photo.src !== `/api/iqc/photo?id=${photo.id}`))
      throw Error(`${part.code} 照片來源或順序重複`);
  }
  const partCodes = new Set(next.parts.map(part => part.code));
  const errorById = new Map(next.errors.map(error => [error.id, error]));
  if (next.errors.some(error => !partCodes.has(error.partCode) || !working && !text(error.nameVi).trim()))
    throw Error('錯誤代碼找不到所屬零件或越文名稱空白');
  for (const item of next.items) {
    if (!partCodes.has(item.partCode) || errorById.get(item.errorId)?.partCode !== item.partCode)
      throw Error(`${item.checkNo} 找不到所屬零件或錯誤代碼`);
    if (item.rules.some(rule => !rule.id || !['source','batch','time'].includes(rule.cadence)))
      throw Error(`${item.checkNo} 檢查規則格式錯誤`);
    if (!working && !text(item.nameVi).trim() && !item.sourceRow)
      throw Error(`${item.checkNo} 越文檢查項目名稱空白`);
    if (item.inspectionSpecVi !== undefined && typeof item.inspectionSpecVi !== 'string')
      throw Error(`${item.checkNo} 檢查規格格式錯誤`);
    if (typeof item.isEnabled !== 'boolean') throw Error(`${item.checkNo} 啟用狀態格式錯誤`);
    if (item.inspectionMode !== undefined && !['visual', 'equipment'].includes(item.inspectionMode))
      throw Error(`${item.checkNo} 檢查方式格式錯誤`);
    if (item.inspectionMode === 'equipment' && !item.equipmentId)
      throw Error(`${item.checkNo} 尚未選擇檢具`);
    if (item.equipmentId && (item.inspectionMode !== 'equipment' || item.equipmentSnapshot?.id !== item.equipmentId))
      throw Error(`${item.checkNo} 檢具關聯格式錯誤`);
    if (item.inspectionMode === 'visual' && item.equipmentId)
      throw Error(`${item.checkNo} 目視檢查不可同時關聯檢具`);
    if (item.mediaItems !== undefined && (!Array.isArray(item.mediaItems) ||
        !unique(item.mediaItems.map(photo => photo.id)) ||
        item.mediaItems.some(photo => !/^[a-f0-9]{64}$/.test(text(photo.id)) ||
          photo.src !== `/api/iqc/photo?id=${photo.id}` ||
          photo.note !== undefined && typeof photo.note !== 'string')))
      throw Error(`${item.checkNo} 檢查照片格式錯誤`);
  }
  return next;
}

export function iqcSubmitErrors(snapshot: IqcSnapshot): string[] {
  const issues: string[] = [];
  const categoryIds = new Set(snapshot.categories.map(item => item.id));
  for (const part of snapshot.parts.filter(item => !item.isDeleted)) {
    if (!categoryIds.has(part.categoryId)) issues.push(`${part.code} 尚未指定有效類別`);
    if (!part.nameVi.trim()) issues.push(`${part.code} 零件名稱空白`);
  }
  for (const item of snapshot.items.filter(item => !item.isDeleted)) {
    if (!item.rules.length) issues.push(`${item.checkNo} 至少需要一條檢查規則`);
    for (const rule of item.rules) {
      if (rule.cadence === 'source') {
        if (!text(rule.sourceTextVi).trim()) issues.push(`${item.checkNo} 來源規則空白`);
      } else if (rule.cadence === 'batch') {
        const value = text(rule.value).trim();
        if (!['aql','fixed_count','batch_quantity','custom'].includes(rule.kind) || !value ||
            rule.kind === 'custom' && !text(rule.nameVi).trim() ||
            rule.kind !== 'custom' && (!Number.isFinite(Number(value)) || Number(value) <= 0))
          issues.push(`${item.checkNo} 按批次規則缺少有效數值或自訂名稱`);
      } else if (rule.cadence === 'time') {
        if (!['week','month','quarter','half_year','year','custom'].includes(rule.kind) ||
            rule.kind === 'custom' && !text(rule.nameVi).trim() || text(rule.value).trim())
          issues.push(`${item.checkNo} 按時間規則格式錯誤`);
      }
    }
  }
  return issues;
}

// Missing content is reviewable; supplied invalid values/references remain errors.
export function iqcSubmitBlockingErrors(snapshot:IqcSnapshot,all:readonly string[]=iqcSubmitErrors(snapshot)):string[]{
  const blocked=new Set<string>();
  for(const part of snapshot.parts.filter(p=>!p.isDeleted))if(part.categoryId&&!snapshot.categories.some(c=>c.id===part.categoryId))blocked.add(`${part.code} 尚未指定有效類別`);
  for(const item of snapshot.items.filter(i=>!i.isDeleted))for(const rule of item.rules){
    if(rule.cadence==='batch'&&(!['aql','fixed_count','batch_quantity','custom'].includes(rule.kind)||rule.kind!=='custom'&&text(rule.value).trim()&&(!Number.isFinite(Number(rule.value))||Number(rule.value)<=0)))blocked.add(`${item.checkNo} 按批次規則缺少有效數值或自訂名稱`);
    if(rule.cadence==='time'&&(!['week','month','quarter','half_year','year','custom'].includes(rule.kind)||text(rule.value).trim()))blocked.add(`${item.checkNo} 按時間規則格式錯誤`);
  }
  return all.filter(message=>blocked.has(message));
}

export function nextIqcErrorCode(control: IqcControl, partCode: string): string {
  const prefix = `${partCode}-IQC-L`;
  const taken = control.reservedErrorCodes.filter(code => code.startsWith(prefix))
    .map(code => Number(code.slice(prefix.length))).filter(Number.isInteger);
  return `${prefix}${Math.max(0, ...taken) + 1}`;
}

export function nextIqcCheckNo(control: IqcControl, errorCode: string): string {
  const prefix = `${errorCode}-`;
  const taken = control.reservedCheckNos.filter(code => code.startsWith(prefix))
    .map(code => Number(code.slice(prefix.length))).filter(Number.isInteger);
  return `${prefix}${String(Math.max(0, ...taken) + 1).padStart(2, '0')}`;
}
