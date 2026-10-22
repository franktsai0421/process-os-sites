import {legacyJsonValueText,type JsonValue} from './legacy-login-json';
export type Equipment = Record<string, unknown> & {
  id: string; assetCode: string; pieceMark: string; groupId: string;
  calibrationMethod: string; calibratedAt: string; expiresAt: string;
  categoryCode?: string; category?: string; subcategory?: string; categoryId?: string; subcategoryId?: string;
  name?: string; nameZh?: string; nameVi?: string; unit?: string;
  calibrationCycle?: string; customCycle?: string;
  enabled?: boolean; confirmed?: boolean; photoId?: string; photoHidden?: boolean; sourceRow?: number;
  effectiveAt?: string; calibrationChannels?: Record<string, Record<string, string | undefined>>;
  photoSource?: { workbookRow: number; column: number; webSha256: string };
};
export type EquipmentCategory = { id: string; code: string; name: string; sourceName?: string; photoId?: string };
export type EquipmentSubcategory = { id: string; categoryId: string; name: string; sourceName?: string; photoId?: string };
export type EquipmentGroup = Record<string, unknown> & { id: string; categoryId?: string; subcategoryId?: string; categoryCode?: string; category?: string; subcategory?: string; name?: string; nameZh?: string; nameVi?: string; photoId?: string; spec?: string; notes?: string };
export type EquipmentIssue = Record<string, unknown> & { sourceRow?: number; status?: string; resolution?: string; resolvedBy?: string; resolvedById?: string; resolvedAt?: string };
export type EquipmentVersion = {
  id: string; number: number; status: 'draft' | 'pending' | 'approved' | 'superseded' | 'returned' | 'withdrawn';
  equipment: Equipment[]; groups: EquipmentGroup[];
  categories?: EquipmentCategory[]; subcategories?: EquipmentSubcategory[]; issues?: EquipmentIssue[];
  creatorId: string; creatorName: string; createdAt: string; updatedAt: string;
  submittedBy?: string; submittedAt?: string; reviewedBy?: string;
  reviewedAt?: string; reviewComment?: string; revision: number;
  history: { action: string; actorId: string; actorName: string; at: string; comment?: string }[];
};
export type EquipmentControl = {
  schemaVersion: 1; activeVersionId: string | null; versions: EquipmentVersion[];
  source: { fileName: string; sha256: string } | null;
  issues: EquipmentIssue[]; reservedMarks: Record<string, string[]>;
  pendingReplacements?: import('./quality-equipment-replacement').PendingReplacement[];
};

export const emptyEquipmentControl = (): EquipmentControl => ({
  schemaVersion: 1, activeVersionId: null, versions: [], source: null,
  issues: [], reservedMarks: {},
});
export const openVersion = (control: EquipmentControl) =>
  control.versions.find(version => version.status === 'draft' || version.status === 'pending');
export const activeVersion = (control: EquipmentControl) =>
  control.versions.find(version => version.id === control.activeVersionId);
const groupText = (value: unknown) => {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') throw Error('群組欄位必須是文字');
  return value;
};

// Existing versions only store group labels. Derive deterministic IDs in memory, without
// rewriting old versions, so an empty node can be persisted on the next draft save.
export function hierarchy(version: EquipmentVersion) {
  const categories = [...(version.categories || [])];
  const subcategories = [...(version.subcategories || [])];
  const groups = version.groups.map(group => ({ ...group }));
  for (const group of groups) {
    const code = String(group.categoryCode || '').trim();
    const categoryName = String(group.category || '').trim();
    let category = categories.find(item => item.id === group.categoryId) || categories.find(item => item.code === code && item.name === categoryName);
    if (!category && code) {
      category = { id: `legacy-category:${encodeURIComponent(code)}`, code, name: categoryName || code, sourceName: categoryName };
      categories.push(category);
    }
    if (!category) continue;
    group.categoryId = category.id;
    const subName = String(group.subcategory || '').trim();
    let sub = subcategories.find(item => item.id === group.subcategoryId) || subcategories.find(item => item.categoryId === category.id && item.name === subName);
    if (!sub && subName) {
      sub = { id: `legacy-subcategory:${encodeURIComponent(category.id)}:${encodeURIComponent(subName)}`, categoryId: category.id, name: subName, sourceName: subName };
      subcategories.push(sub);
    }
    if (sub) group.subcategoryId = sub.id;
    group.name ||= String(group.nameVi || group.nameZh || group.id);
  }
  return { categories, subcategories, groups };
}

// Import grouping notes are provenance, not another equipment type or selection gate.
export const equipmentGroupLabel = (name: string) =>
  name.replace(/^(?:獨立|候選)\s*[／/]\s*/, '').replace(/候選$/, '').trim();

export const calibrationCode = (value: unknown) => {
  const method = typeof value === 'string' ? value.trim() : '';
  if (/^(none|不校正|Không hiệu chuẩn)/i.test(method)) return 'none';
  if (/^(internal|內部校正|Hiệu chuẩn nội bộ)/i.test(method) && !method.includes('＋')) return 'internal';
  if (/^(external|外部校正|Hiệu chuẩn bên ngoài)/i.test(method)) return 'external';
  return 'legacy-conflict';
};

export function reserveMarks(control: EquipmentControl, equipment: Pick<Equipment,'assetCode'|'pieceMark'>[]) {
  for (const item of equipment) {
    const code = String(item.assetCode || '').trim().toUpperCase();
    const mark = String(item.pieceMark || '').trim().toUpperCase();
    if (!code || !mark) continue;
    const list = control.reservedMarks[code] ||= [];
    if (!list.includes(mark)) list.push(mark);
  }
}

export function nextPieceMark(control: EquipmentControl, assetCode: string) {
  const code = assetCode.trim().toUpperCase();
  if (!code) throw Error('請輸入固定資產編號');
  const reserved = new Set(control.reservedMarks[code] || []);
  // Persisted reservations include deleted draft rows and every imported mark.
  const maximum = [...reserved].reduce((max, mark) => /^\d+$/.test(mark) ? Math.max(max, Number(mark)) : max, 0);
  const mark = String(maximum + 1).padStart(2, '0');
  (control.reservedMarks[code] ||= []).push(mark);
  return mark;
}

export const vietnamToday = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());

export function calibrationRequired(item: Equipment) {
  return calibrationCode(item.calibrationMethod) !== 'none';
}
export function calibrationChannels(item: Equipment) {
  const method = String(item.calibrationMethod || '');
  return method.startsWith('內部＋外部') ? ['internal', 'external'] : [];
}
export function changedEquipment(current: EquipmentVersion, base?: EquipmentVersion) {
  const prior = new Map((base?.equipment || []).map(item => [item.id, item]));
  return current.equipment.filter(item => JSON.stringify(item) !== JSON.stringify(prior.get(item.id)));
}
export function submitErrors(current: EquipmentVersion, base?: EquipmentVersion) {
  return submitProblems(current, base).map(problem => problem.message);
}
export function submitProblems(current: EquipmentVersion, base?: EquipmentVersion) {
  const problems: { id: string; field: string; message: string; blocking?:boolean }[] = [];
  const validDay = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
  for (const item of changedEquipment(current, base)) {
    if (!item.assetCode?.trim() || !String(item.name || item.nameVi || item.nameZh || '').trim() || !item.groupId?.trim())
      problems.push({ id: item.id, field: 'name', message: `${item.assetCode || item.id}: 編號、名稱與群組必填` });
    if (calibrationCode(item.calibrationMethod) === 'legacy-conflict')
      problems.push({ id: item.id, field: 'calibrationMethod', blocking:true, message: `${item.assetCode}/${item.pieceMark}: 舊雙軌校正需先選擇單一方式` });
    if (calibrationRequired(item)) {
      if (!String(item.calibrationCycle || '').trim() || item.calibrationCycle === 'custom' && !String(item.customCycle || '').trim())
        problems.push({ id: item.id, field: item.calibrationCycle === 'custom' ? 'customCycle' : 'calibrationCycle', message: `${item.assetCode}/${item.pieceMark}: 校正週期必填` });
      if (!item.calibratedAt || !item.expiresAt)
        problems.push({ id: item.id, field: !item.calibratedAt ? 'calibratedAt' : 'expiresAt', message: `${item.assetCode}/${item.pieceMark}: 校正日期及有效期限必填` });
      if (item.calibratedAt && item.expiresAt && (!validDay(item.calibratedAt) || !validDay(item.expiresAt) || item.expiresAt < item.calibratedAt))
        problems.push({ id: item.id, field: 'expiresAt', blocking:true, message: `${item.assetCode}/${item.pieceMark}: 有效期限不能早於校正日期` });
    }
  }
  return problems;
}

export function availability(item: Equipment, issues: EquipmentIssue[] = []) {
  if (!item.enabled || !item.confirmed || issues.some(issue => issue.sourceRow === item.sourceRow && issue.status !== 'resolved')) return false;
  if (calibrationCode(item.calibrationMethod) === 'legacy-conflict') return false;
  if (!calibrationRequired(item)) return true;
  const today = vietnamToday();
  const channels = calibrationChannels(item);
  if (channels.length) return channels.every(channel => {
    const values = item.calibrationChannels?.[channel];
    return !!values?.calibratedAt && !!values?.expiresAt && values.expiresAt >= today;
  });
  return !!item.calibratedAt && !!item.expiresAt && item.expiresAt >= today;
}

const mutableFields = [
  'assetCode', 'categoryCode', 'category', 'subcategory', 'categoryId', 'subcategoryId', 'groupId', 'name',
  'quantity', 'unit', 'spec', 'owner', 'enabled', 'calibrationMethod',
  'calibrationCycle', 'calibratedAt', 'expiresAt', 'notes', 'customCycle',
  'intakeDate', 'confirmed', 'photoId', 'photoHidden',
];
export function checkedSnapshot(version: EquipmentVersion, incoming: unknown) {
  const payload = incoming as { equipment?: Equipment[]; groups?: EquipmentGroup[]; categories?: EquipmentCategory[]; subcategories?: EquipmentSubcategory[]; issues?: EquipmentIssue[] } | null;
  if (!payload || !Array.isArray(payload.equipment) || !Array.isArray(payload.groups))
    throw Error('草稿格式錯誤');
  const legacy = hierarchy(version);
  const categories = payload.categories || legacy.categories;
  const subcategories = payload.subcategories || legacy.subcategories;
  if (!Array.isArray(categories) || !Array.isArray(subcategories)) throw Error('分類格式錯誤');
  const categoryIds = new Set<string>(), categoryCodes = new Set<string>();
  for (const category of categories) {
    if (!category?.id || !category?.code?.trim() || !category?.name?.trim() || categoryIds.has(category.id) || categoryCodes.has(category.code)) throw Error('類別 ID、編號或名稱無效或重複');
    if (category.photoId && !/^[a-f0-9]{64}$/.test(category.photoId)) throw Error(`類別 ${category.code} 照片參照無效`);
    categoryIds.add(category.id); categoryCodes.add(category.code);
  }
  for (const old of legacy.categories) {
    const next = categories.find(category => category.id === old.id);
    if (next && next.code !== old.code) throw Error(`類別 ${old.name} 的編號不可改寫`);
  }
  const subcategoryIds = new Set<string>();
  for (const sub of subcategories) {
    if (!sub?.id || !sub?.name?.trim() || !categoryIds.has(sub.categoryId) || subcategoryIds.has(sub.id)) throw Error('子類別 ID、名稱或上層無效');
    if (sub.photoId && !/^[a-f0-9]{64}$/.test(sub.photoId)) throw Error(`子類別 ${sub.name} 照片參照無效`);
    subcategoryIds.add(sub.id);
  }
  for (const old of legacy.categories) if (!categoryIds.has(old.id) && legacy.subcategories.some(sub => sub.categoryId === old.id)) throw Error(`類別 ${old.name} 仍有子類別，不能刪除`);
  for (const old of legacy.subcategories) if (!subcategoryIds.has(old.id) && legacy.groups.some(group => group.subcategoryId === old.id)) throw Error(`子類別 ${old.name} 仍有規格群組，不能刪除`);
  const current = new Map(version.equipment.map(item => [item.id, item]));
  const seen = new Set<string>();
  const equipment: Equipment[] = [];
  for (const raw of payload.equipment) {
    if (!raw?.id || typeof raw.id !== 'string') throw Error(`設備缺少有效 ID: 【${raw?.assetCode || '未命名'}】`);
    if (seen.has(raw.id)) throw Error(`設備 ID 重複: 【${raw.assetCode || raw.id}】`);
    seen.add(raw.id);
    const old = current.get(raw.id);
    let item: Equipment;
    if (!old) {
      const code = String(raw.assetCode || '').trim().toUpperCase();
      if (!/^[A-Z0-9-]{2,40}$/.test(code)) throw Error(`新增設備固定資產編號格式錯誤: 【${raw.assetCode || '?'}】`);
      item = {
        id: raw.id,
        assetCode: code,
        pieceMark: String(raw.pieceMark || '01').trim(),
        groupId: String(raw.groupId || '').trim(),
        calibrationMethod: String(raw.calibrationMethod || 'none'),
        calibrationCycle: String(raw.calibrationCycle || ''),
        customCycle: String(raw.customCycle || ''),
        calibratedAt: String(raw.calibratedAt || ''),
        expiresAt: String(raw.expiresAt || ''),
        intakeDate: legacyJsonValueText((raw.intakeDate || '') as JsonValue),
        name: String(raw.name || '').trim(),
        quantity: 1,
        unit: String(raw.unit || '個').trim(),
        owner: legacyJsonValueText((raw.owner || '') as JsonValue).trim(),
        enabled: typeof raw.enabled === 'boolean' ? raw.enabled : true,
        confirmed: typeof raw.confirmed === 'boolean' ? raw.confirmed : false,
        spec: legacyJsonValueText((raw.spec || '') as JsonValue),
        notes: legacyJsonValueText((raw.notes || '') as JsonValue),
        photoId: String(raw.photoId || ''),
        photoHidden: !!raw.photoHidden,
      };
    } else {
      item = { ...old };
    }
    for (const field of mutableFields) if (field in raw) item[field] = raw[field];
    for (const field of ['assetCode','name','nameVi','groupId','category','subcategory','unit','calibrationMethod','calibratedAt','expiresAt','photoId'])
      if (item[field] !== undefined && typeof item[field] !== 'string') throw Error(`${field} 格式錯誤: 【${item.assetCode || item.id}】`);
    if (typeof item.enabled !== 'boolean' || typeof item.confirmed !== 'boolean') throw Error(`設備狀態格式錯誤: 【${item.assetCode}】`);
    if (old && item.assetCode !== old.assetCode) throw Error(`固定資產編號不能在既有設備上改寫；請新增獨立設備: 【${old.assetCode}】`);
    if (!/^(個|支|台|組)/.test(String(item.unit || ''))) throw Error(`單位格式錯誤: 【${item.assetCode}】`);
    if (old && item.unit !== old.unit && !['個','支','台','組'].includes(String(item.unit))) throw Error(`新單位必須使用固定代碼: 【${item.assetCode}】`);
    if (old && item.calibrationMethod !== old.calibrationMethod && !['none','internal','external'].includes(item.calibrationMethod)) throw Error(`新校正方式必須使用固定代碼: 【${item.assetCode}】`);
    if (item.photoId && !/^[a-f0-9]{64}$/.test(item.photoId)) throw Error(`照片參照錯誤: 【${item.assetCode}】`);
    if (item.photoHidden !== undefined && typeof item.photoHidden !== 'boolean') throw Error(`照片狀態格式錯誤: 【${item.assetCode}】`);
    if (item.calibrationChannels !== undefined) {
      if (!item.calibrationChannels || typeof item.calibrationChannels !== 'object' || Array.isArray(item.calibrationChannels)) throw Error(`校正通道格式錯誤: 【${item.assetCode}】`);
      for (const channel of calibrationChannels(item)) {
        const values = item.calibrationChannels[channel];
        if (!values || ['calibratedAt','expiresAt','cycle'].some(key => values[key] !== undefined && typeof values[key] !== 'string')) throw Error(`內外校正欄位格式錯誤: 【${item.assetCode}】`);
      }
    }
    equipment.push(item);
  }
  for (const item of version.equipment) {
    if (!seen.has(item.id) && (item.sourceRow || item.effectiveAt)) throw Error(`已匯入或已生效設備不能刪除，請停用: 【${item.assetCode}／${item.pieceMark}】`);
  }
  const groupIds = new Set<string>();
  const groups: EquipmentGroup[] = payload.groups.map(raw => {
    const id = groupText(raw?.id).trim();
    if (!id || groupIds.has(id)) throw Error('群組編號空白或重複');
    groupIds.add(id);
    const previous = legacy.groups.find(group => group.id === id);
    const categoryId = groupText(raw.categoryId || previous?.categoryId);
    const subcategoryId = groupText(raw.subcategoryId || previous?.subcategoryId);
    const category = categories.find(value => value.id === categoryId);
    const sub = subcategories.find(value => value.id === subcategoryId);
    if (!category || !sub || sub.categoryId !== categoryId) throw Error(`群組 ${id} 所屬分類無效`);
    if (raw.photoId && !/^[a-f0-9]{64}$/.test(raw.photoId)) throw Error(`群組 ${id} 照片參照無效`);
    return { ...previous, id, name: groupText(raw.name || raw.nameVi || raw.nameZh || id), nameZh: groupText(raw.nameZh), nameVi: groupText(raw.nameVi),
      categoryId, subcategoryId, categoryCode: category.code, category: category.name,
      subcategory: sub.name, spec: groupText(raw.spec),
      sourceStatus: groupText(raw.sourceStatus), notes: groupText(raw.notes),
      photoId: raw.photoId ? String(raw.photoId) : (previous?.photoId ? String(previous.photoId) : '') };
  });
  for (const old of legacy.groups) if (!groupIds.has(old.id) && equipment.some(item => item.groupId === old.id)) throw Error(`群組 ${old.id} 仍有設備，不能刪除`);
  const groupById = new Map<string, EquipmentGroup>(groups.map(group => [group.id, group]));
  for (const item of equipment) {
    if (!groupIds.has(item.groupId)) throw Error('設備所屬規格群組不存在');
    const group = groupById.get(item.groupId);
    if (group) {
      item.categoryCode = group.categoryCode;
      item.category = group.category;
      item.subcategory = group.subcategory;
      item.categoryId = group.categoryId;
      item.subcategoryId = group.subcategoryId;
    }
  }
  const identity = new Set<string>();
  for (const item of equipment) {
    const key = `${item.assetCode.toUpperCase()}\u0000${item.pieceMark.toUpperCase()}`;
    // Source already contains unresolved duplicate marks; retain their distinct IDs.
    if (identity.has(key) && !item.sourceRow) throw Error(`同一固定資產編號已有相同分件標記: 【${item.assetCode}／${item.pieceMark}】`);
    identity.add(key);
  }
  const oldIssues = version.issues || [];
  const issues = payload.issues || oldIssues;
  if (!Array.isArray(issues) || issues.length !== oldIssues.length) throw Error('來源疑點不能刪除');
  const checkedIssues: EquipmentIssue[] = [];
  for (let i = 0; i < issues.length; i++) {
    if (issues[i]?.sourceRow !== oldIssues[i]?.sourceRow || issues[i]?.type !== oldIssues[i]?.type) throw Error('來源疑點原文不能改寫');
    if (issues[i].status === 'resolved' && !String(issues[i].resolution || '').trim()) throw Error('已處理疑點必須填寫處理結果');
    if (!['resolved','pending',oldIssues[i].status].includes(issues[i].status)) throw Error('來源疑點狀態無效');
    checkedIssues.push({ ...oldIssues[i], status: issues[i].status, resolution: String(issues[i].resolution || '') });
  }
  return { equipment, groups, categories, subcategories, issues: checkedIssues };
}

export function fillRepresentativePhotos(version: EquipmentVersion) {
  const tree = hierarchy(version);
  const eligibleCategoryCodes = new Set(['C01', 'C02', 'C03', 'C04', 'C05', 'C06']);
  const eligibleCategories = tree.categories.filter(c => eligibleCategoryCodes.has(c.code));
  const eligibleCatIds = new Set(eligibleCategories.map(c => c.id));

  // 1. Fill Groups under C01~C06
  for (const group of version.groups) {
    if (!eligibleCatIds.has(String(group.categoryId || ''))) continue;
    if (group.photoId) continue;
    const items = version.equipment.filter(e => e.groupId === group.id && e.photoId && !e.photoHidden);
    if (!items.length) continue;
    const best = items.find(e => e.pieceMark === '01') || items[0];
    if (best?.photoId) {
      group.photoId = best.photoId;
    }
  }

  // 2. Fill Subcategories under C01~C06
  if (version.subcategories) {
    for (const sub of version.subcategories) {
      if (!eligibleCatIds.has(sub.categoryId)) continue;
      if (sub.photoId) continue;
      const subGroups = version.groups.filter(g => g.subcategoryId === sub.id);
      const groupWithPhoto = subGroups.find(g => g.photoId);
      if (groupWithPhoto?.photoId) {
        sub.photoId = groupWithPhoto.photoId;
      } else {
        const items = version.equipment.filter(e => e.subcategoryId === sub.id && e.photoId && !e.photoHidden);
        const best = items.find(e => e.pieceMark === '01') || items[0];
        if (best?.photoId) sub.photoId = best.photoId;
      }
    }
  }
}
