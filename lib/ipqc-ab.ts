import {isImmutableRecordBody} from './state-records';
import type {DraftIssue} from './shared-draft';
export type AbPhoto = { id: string; name: string; note: string };
export type AbRule = { id: string; cadence: 'batch' | 'time'; kind: string; value?: string; name?: string };
export type AbError = { id: string; code: string; line: string; group: string; stageCode: string;
  name: string; sourceRows: number[]; deleted: boolean;
  sourceImport?: {sha256:string;nameBaseline:string} };
export type AbItem = { id: string; code: string; errorId: string; standard: string; methodText: string;
  inspectionMode: 'visual' | 'equipment'; equipmentId: string;
  equipmentSnapshot: { id: string; assetCode: string; pieceMark: string; name: string; photoId?: string } | null;
  isEnabled: boolean; rules: AbRule[]; standardPhotos: AbPhoto[]; methodPhotos: AbPhoto[];
  productCodes: string[]; sourceRows: number[]; sourceTool: string; sourceMethod: string;
  sourceFrequency: string; sourceVersion?: string; sourceChangedAt?: string;
  sourceReason?: string; sourceCreator?: string; sourceNote?: string;
  reason: string; deleted: boolean;
  sourceImport?: { key: string; sha256: string; sourceItemCodes: string[];
    baseline: Partial<AbItem>; previousKeys: string[] } };
export type AbSnapshot = { errors: AbError[]; items: AbItem[] };
export type AbVersion = { id: string; number: number; status: 'draft' | 'pending' | 'pending-test' | 'approved' | 'superseded' | 'tested' | 'withdrawn' | 'returned';
  revision: number; snapshot: AbSnapshot; baseVersionId: string | null; creatorId: string; creatorName: string;
  createdAt: string; updatedAt: string; submittedBy?: string; submittedAt?: string;
  reviewedBy?: string; reviewedAt?: string; reviewComment?: string;
  contentIssues?:{policy:'ipqc-completeness-v1';issues:DraftIssue[]};
  history: Array<{ action: string; actorId: string; actorName: string; at: string; comment?: string }> };
export type AbScope = { line: string; group: string; activeVersionId: string | null; versions: AbVersion[] };
export type AbControl = { schemaVersion: 1; scopes: Record<string, AbScope>;
  source: null | { fileName: string; sha256: string; rows: number; importedRelations: number; builtAt: string };
  reservedErrorCodes: string[]; reservedItemCodes: string[] };
export type AbProduct = { code: string; name: string; category: string; line: string; stages: string[] };
export type AbCatalog = { groups: Array<{ line: string; name: string; defaultStages?:string[] }>; products: AbProduct[];
  stages: Array<{ line: string; code: string; name: string }> };

export const scopeKey = (line: string, group: string) => `${line}:${group}`;
export const emptyAbControl = (): AbControl => ({ schemaVersion: 1, scopes: {}, source: null,
  reservedErrorCodes: [], reservedItemCodes: [] });
export const copyAb = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
export function parseAbControl(raw?: string, prepared?:unknown): AbControl {
  if (raw === undefined) return emptyAbControl();
  let value: AbControl;
  try { value = (prepared||JSON.parse(raw)) as AbControl; } catch { throw Error('IPQC-AB 資料無法解析；已停止寫入'); }
  if (value?.schemaVersion !== 1 || !value.scopes || typeof value.scopes !== 'object' ||
      !Array.isArray(value.reservedErrorCodes) || !Array.isArray(value.reservedItemCodes) ||
      !Object.values(value.scopes).every(scope => scope && Array.isArray(scope.versions) &&
        scope.versions.every(version => prepared&&isImmutableRecordBody(version.snapshot)||Array.isArray(version.snapshot?.errors) && Array.isArray(version.snapshot?.items))))
    throw Error('IPQC-AB 資料格式不相容；已停止寫入');
  return value;
}
export const openAb = (scope?: AbScope) => scope?.versions.find(v => ['draft','pending','pending-test'].includes(v.status));
export const activeAb = (scope?: AbScope) => scope?.versions.find(v => v.id === scope.activeVersionId);

export function catalogFromMaster(raw?: string): AbCatalog {
  const active = raw ? JSON.parse(raw)?.active?.AB : null;
  if (!active || !Array.isArray(active.products) || !Array.isArray(active.lines))
    throw Error('中控 AB 主資料無法讀取；不建立 IPQC-AB 對應');
  const products: AbProduct[] = active.products.filter((p: AbProduct) => ['A','B'].includes(p.line))
    .map((p: AbProduct) => ({ code: String(p.code), name: String(p.name || ''),
      category: String(p.category || ''), line: String(p.line), stages: Array.isArray(p.stages) ? p.stages : [] }));
  const groups = new Map<string, { line: string; name: string; defaultStages?:string[] }>();
  for (const group of active.categoryGroups || []) if (['A','B'].includes(group.line) && group.name)
    groups.set(scopeKey(group.line, group.name), { line: group.line, name: group.name, ...(Array.isArray(group.defaultStages)?{defaultStages:group.defaultStages}:{}) });
  for (const p of products) if (p.category)
    if(!groups.has(scopeKey(p.line,p.category)))groups.set(scopeKey(p.line, p.category), { line: p.line, name: p.category });
  return { groups: [...groups.values()], products,
    stages: active.lines.filter((l: { code: string }) => ['A','B'].includes(l.code))
      .flatMap((l: { code: string; stages?: Array<{ code: string; name: string }> }) =>
        (l.stages || []).map(s => ({ line: l.code, code: String(s.code), name: String(s.name || '') }))) };
}
export function candidateProducts(catalog: AbCatalog, line: string, group: string, stageCode: string) {
  return catalog.products.filter(p => p.line === line && p.category === group && p.stages.includes(stageCode));
}
export function nextAbCode(control: AbControl, kind: 'error' | 'item', prefix: string, index?:import('./state-records').AllocationIndex) {
  const reserved = kind === 'error' ? control.reservedErrorCodes : control.reservedItemCodes;
  const known = new Set([...reserved, ...(index?(kind==='error'?index.errors:index.items).map(row=>row.code):Object.values(control.scopes).flatMap(scope =>
    scope.versions.flatMap(v => (kind === 'error' ? v.snapshot.errors : v.snapshot.items).map(row => row.code))))]);
  let max = 0;
  for (const code of known) if (code.startsWith(prefix) && /^\d+$/.test(code.slice(prefix.length)))
    max = Math.max(max, Number(code.slice(prefix.length)));
  const code = prefix + String(max + 1).padStart(kind === 'item' ? 2 : 1, '0');
  reserved.push(code);
  return code;
}

const validPhotos = (photos: unknown): photos is AbPhoto[] => Array.isArray(photos) && photos.every(photo =>
  photo && /^[a-f0-9]{64}$/.test(photo.id) && typeof photo.name === 'string' && typeof photo.note === 'string');
const batchKinds = new Set(['aql','fixed','quantity','custom']);
const timeKinds = new Set(['week','month','quarter','half-year','year','custom']);
export function validRules(rules: unknown, working=false): rules is AbRule[] {
  return Array.isArray(rules) && rules.every(rule => {
    if (!rule || typeof rule.id !== 'string' || !rule.id ||
        typeof rule.kind !== 'string' || (rule.value !== undefined && typeof rule.value !== 'string') ||
        (rule.name !== undefined && typeof rule.name !== 'string')) return false;
    if (rule.cadence === 'batch') {
      if (!batchKinds.has(rule.kind)) return false;
      if (working) return true;
      if (rule.kind === 'custom') return !!rule.name?.trim() && !!rule.value?.trim();
      return Number(rule.value) > 0;
    }
    return rule.cadence === 'time' && timeKinds.has(rule.kind) &&
      (working || rule.kind !== 'custom' || !!rule.value?.trim());
  }) && new Set(rules.map(rule => rule.id)).size === rules.length;
}
export function checkedAbSnapshot(version: AbVersion, incoming: unknown, catalog: AbCatalog,
  line: string, group: string, working=false): AbSnapshot {
  const raw = incoming as AbSnapshot;
  if (!raw || !Array.isArray(raw.errors) || !Array.isArray(raw.items) ||
      raw.errors.length !== version.snapshot.errors.length || raw.items.length !== version.snapshot.items.length)
    throw Error('草稿結構不符；新增項目請使用新增操作');
  const oldErrors = new Map(version.snapshot.errors.map(e => [e.id,e]));
  const oldItems = new Map(version.snapshot.items.map(i => [i.id,i]));
  const products = new Map(catalog.products.map(p => [p.code,p]));
  const errors = raw.errors.map(e => {
    const prior = oldErrors.get(e?.id);
    if (!prior || e.code !== prior.code || e.line !== prior.line || e.group !== prior.group ||
        e.stageCode !== prior.stageCode || typeof e.name !== 'string' || typeof e.deleted !== 'boolean')
      throw Error('錯誤代碼身分或欄位不可改寫');
    return { ...prior, name: e.name, deleted: e.deleted };
  });
  const items = raw.items.map(i => {
    const prior = oldItems.get(i?.id);
    if (!prior || i.code !== prior.code || i.errorId !== prior.errorId ||
        typeof i.standard !== 'string' || typeof i.methodText !== 'string' ||
        typeof i.sourceTool !== 'string' || i.sourceTool !== prior.sourceTool ||
        i.sourceMethod !== prior.sourceMethod || i.sourceFrequency !== prior.sourceFrequency ||
        i.sourceVersion !== prior.sourceVersion || i.sourceChangedAt !== prior.sourceChangedAt ||
        i.sourceReason !== prior.sourceReason || i.sourceCreator !== prior.sourceCreator ||
        i.sourceNote !== prior.sourceNote ||
        typeof i.reason !== 'string' || typeof i.equipmentId !== 'string' ||
        typeof i.isEnabled !== 'boolean' || typeof i.deleted !== 'boolean' ||
        !['visual','equipment'].includes(i.inspectionMode) || !validPhotos(i.standardPhotos) ||
        !validPhotos(i.methodPhotos) || !validRules(i.rules,working) || !Array.isArray(i.productCodes) ||
        i.productCodes.some(code => typeof code !== 'string') ||
        new Set(i.productCodes).size !== i.productCodes.length)
      throw Error(`${prior?.code || '檢查項目'} 欄位格式錯誤`);
    const parent = oldErrors.get(i.errorId);
    if (!parent || parent.line !== line || parent.group !== group ||
        i.productCodes.some(code => {
          const p = products.get(code);
          const invalid=!p || p.line !== line || p.category !== group || !p.stages.includes(parent.stageCode);
          // Keep old invalid links repairable in working; new invalid links and
          // submission/approval still fail. Never silently delete old products.
          return invalid&&!(working&&prior.productCodes.includes(code));
        })) throw Error(`${prior.code} 的產品與中控線別、群組或工段不符`);
    return { ...prior, standard: i.standard, methodText: i.methodText,
      inspectionMode: i.inspectionMode, equipmentId: i.inspectionMode === 'equipment' ? i.equipmentId : '',
      isEnabled: i.isEnabled, rules: i.rules, standardPhotos: i.standardPhotos,
      methodPhotos: i.methodPhotos, productCodes: i.productCodes, reason: i.reason, deleted: i.deleted };
  });
  if (new Set(errors.map(e => e.id)).size !== errors.length || new Set(items.map(i => i.id)).size !== items.length)
    throw Error('草稿有重複項目 ID');
  const visibleErrors = new Set(errors.filter(e => !e.deleted).map(e => e.id));
  if (items.some(i => !i.deleted && !visibleErrors.has(i.errorId))) throw Error('有檢查項目的錯誤代碼不能刪除');
  return { errors, items };
}

export function submissionIssues(snapshot: AbSnapshot, catalog: AbCatalog, line: string, group: string) {
  const issues: Array<{ itemId?: string; errorId?:string; code: string; reason: string; issueCode:string; blocking:boolean;field:string }> = [];
  const errors = snapshot.errors.filter(e => !e.deleted);
  for (const error of errors) {
    const candidates = candidateProducts(catalog,line,group,error.stageCode);
    const enabled = snapshot.items.filter(i => !i.deleted && i.isEnabled && i.errorId === error.id);
    const assigned = new Set(enabled.flatMap(i => i.productCodes).filter(code => candidates.some(p => p.code === code)));
    for (const p of candidates) if (!assigned.has(p.code))
      issues.push({ errorId:error.id,code:error.code, reason:`產品 ${p.code} 尚未涵蓋`,issueCode:'IPQC_PRODUCT_COVERAGE',blocking:false,field:'productCodes' });
    for(const item of snapshot.items.filter(i=>!i.deleted&&i.errorId===error.id)){
      const invalid=item.productCodes.filter(code=>!candidates.some(p=>p.code===code));
      if(invalid.length)issues.push({itemId:item.id,code:item.code,reason:`產品與中控線別、群組或工段不符：${invalid.join('、')}`,issueCode:'PRODUCT_ROUTE_INVALID',blocking:true,field:'productCodes'});
      if(item.rules.length&&!validRules(item.rules))issues.push({itemId:item.id,code:item.code,reason:'已填檢查頻率格式不合法',issueCode:'FREQUENCY_INVALID',blocking:true,field:'rules'});
    }
    for (const item of enabled.filter(i => i.productCodes.some(code => candidates.some(p => p.code === code)))) {
      if (!item.standard.trim()) issues.push({ itemId:item.id, code:item.code, reason:'項目標準未填',issueCode:'STANDARD_REQUIRED',blocking:false,field:'standard' });
      if (!item.methodText.trim()) issues.push({ itemId:item.id, code:item.code, reason:'檢查方式敘述未填',issueCode:'IPQC_METHOD_MISSING',blocking:false,field:'methodText' });
      if(!item.rules.length)issues.push({itemId:item.id,code:item.code,reason:'檢查頻率未設定',issueCode:'IPQC_FREQUENCY_MISSING',blocking:false,field:'rules'});
      if (item.inspectionMode === 'equipment' && !item.equipmentId)
        issues.push({ itemId:item.id, code:item.code, reason:'檢查設備未選',issueCode:'EQUIPMENT_REQUIRED',blocking:false,field:'equipmentId' });
    }
  }
  return issues;
}
export function abDraftIssues(snapshot:AbSnapshot,catalog:AbCatalog,line:string,group:string):DraftIssue[]{return submissionIssues(snapshot,catalog,line,group).map(i=>({kind:i.blocking?'error':'missing',code:i.issueCode,path:[i.itemId?'items':'errors',{id:(i.itemId||i.errorId)!},i.field],message:i.reason}));}
