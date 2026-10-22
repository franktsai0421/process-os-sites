// One adapter contract for versioned quality standards; AB keeps its group scopes.
export const replacementModules = {
  fqc: { key: 'qualityMasterControl', label: 'FQC' },
  iqc: { key: 'iqcMasterControl', label: 'IQC' },
  'ipqc-c': { key: 'ipqcCMasterControl', label: 'IPQC-C' },
  'ipqc-ab': { key: 'ipqcABMasterControl', label: 'IPQC-AB' },
} as const;

export type ReplacementModule = keyof typeof replacementModules;
export type ReplacementItem = {
  id: string; equipmentId?: string; equipmentSnapshot?: unknown;
  checkNo?: string; code?: string; name?: string; nameVi?: string; standard?: string;
  isDeleted?: boolean; deleted?: boolean; inspectionMode?: string; tool?:string;
};
export type ReplacementVersion = {
  id: string; number: string | number; status: string; revision?: number;
  snapshot: { items: ReplacementItem[] }; baseVersionId?: string | null;
  history?: unknown[]; updatedAt?: string; creatorId?: string; creatorName?: string;
};
export type ReplacementLibrary = { activeVersionId?: string | null; versions: ReplacementVersion[] };
export type PendingReplacement = {
  id: string; moduleId: ReplacementModule; itemId: string; scopeKey?: string;
  sourceEquipmentId: string; targetEquipmentId: string;
  pendingVersionId: string; pendingVersionRevision: number;
  pendingVersionNumber?: string | number;
  activeEquipmentId: string; status: 'waiting' | 'conflict' | 'applied';
  reason: string; createdAt: string; updatedAt: string;
  createdById?: string; createdByName?: string;
  itemCode?: string; itemName?: string;
};

export const openReplacementVersion = (library: ReplacementLibrary) =>
  library.versions.find(row => ['draft','pending','pending-test'].includes(row.status));
export const activeReplacementVersion = (library: ReplacementLibrary) =>
  library.versions.find(row => row.id === library.activeVersionId && row.status === 'approved');
export const itemNumber = (item: ReplacementItem) => item.checkNo || item.code || item.id;
export const itemName = (item: ReplacementItem) => item.nameVi || item.name || item.standard || '';
export const replacementSelectionId = (moduleId: ReplacementModule, id: string, scopeKey = '') =>
  moduleId === 'ipqc-ab' ? JSON.stringify([scopeKey, id]) : id;
export const liveItems = (version?: ReplacementVersion) =>
  (version?.snapshot?.items || []).filter(item => !item.isDeleted && !item.deleted);
export const equipmentSnapshot = (item: { id: string; assetCode?: string; pieceMark?: string;
  name?: string; nameVi?: string; spec?: string; photoId?: string }) => ({
  id: item.id, assetCode: item.assetCode || '', pieceMark: item.pieceMark || '',
  name: item.name || item.nameVi || '', spec: item.spec || '',
  ...(item.photoId ? { photoId: item.photoId } : {}),
});
