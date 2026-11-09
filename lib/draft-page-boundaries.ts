import { DraftConflict } from './shared-draft';

// Functional pages, not component files, tabs or filter values. This registry
// describes ownership; it never grants access or enables a migration/route.
export const draftPageBoundaries = Object.freeze(([
  { page: 'PROCESS_EDITOR', scope: 'process:platform', permissionModule: 'editor', endpoint: '/api/process-authoring/workflow', stateKey: 'processAuthoringControl', migration: 'existing' },
  { page: 'AB', scope: 'master:AB.catalog', permissionModule: 'ab', endpoint: '/api/master/pages?scope=AB', stateKey: 'masterDataControl', migration: 'master-split', legacyScope: 'master:AB' },
  { page: 'C', scope: 'master:C.catalog', permissionModule: 'c', endpoint: '/api/master/pages?scope=C', stateKey: 'masterDataControl', migration: 'master-split', legacyScope: 'master:C' },
  { page: 'LINES', scope: 'master:LINES', permissionModule: 'lines', endpoint: '/api/master/pages?scope=LINES', stateKey: 'masterDataControl', migration: 'master-split' },
  { page: 'PROCESS', scope: 'master:PROCESS', permissionModule: 'templates', endpoint: '/api/master/workflow?scope=PROCESS', stateKey: 'masterDataControl', migration: 'existing' },
  { page: 'FQC', scope: 'fqc', permissionModule: 'fqc', endpoint: '/api/fqc/workflow', stateKey: 'qualityMasterControl', migration: 'existing' },
  { page: 'IQC', scope: 'iqc', permissionModule: 'iqc', endpoint: '/api/iqc/workflow', stateKey: 'iqcMasterControl', migration: 'existing' },
  { page: 'IPQC_AB', scope: 'ipqc-ab:module', permissionModule: 'ipqc-ab', endpoint: '/api/ipqc-ab/workflow?module=1', stateKey: 'ipqcABMasterControl', migration: 'existing' },
  { page: 'IPQC_C', scope: 'ipqc-c', permissionModule: 'ipqc-c', endpoint: '/api/ipqc-c/workflow', stateKey: 'ipqcCMasterControl', migration: 'existing' },
  { page: 'BOM', scope: 'bom', permissionModule: 'bom', endpoint: '/api/bom/workflow', stateKey: 'bomMasterControl', migration: 'existing' },
  { page: 'EQUIPMENT', scope: 'routine-equipment', permissionModule: 'equipment', endpoint: '/api/routine-equipment/workflow', stateKey: 'routineEquipmentControl', migration: 'existing' },
  { page: 'TOOLING', scope: 'tooling', permissionModule: 'tooling', endpoint: '/api/tooling/workflow', stateKey: 'toolingMasterControl', migration: 'existing' },
  { page: 'ROUTINE_FQC', scope: 'routine-fqc:page', permissionModule: 'routine', endpoint: '/api/routine-fqc', stateKey: 'routineFqcControl', migration: 'routine-page' },
] as const).map(entry => Object.freeze(entry)));
export type DraftPage = typeof draftPageBoundaries[number]['page'];
export const privateDraftBoundaries = Object.freeze([Object.freeze({ page: 'PRIVATE_FEEDBACK',
  permissionModule: 'feedback', storage: 'process-web-feedback-v1/drafts', isolation: 'origin-and-actor', sharedWorkflow: false })]);
export function draftPageBoundary(page: string) {
  const boundary = draftPageBoundaries.find(entry => entry.page === page);
  if (!boundary) throw new DraftConflict('DRAFT_PAGE_INVALID', 422);
  return boundary;
}
export function assertDraftPageOwner(page: string, scope: string): void {
  if (draftPageBoundary(page).scope !== scope) throw new DraftConflict('DRAFT_PAGE_OWNER_MISMATCH', 409);
}
// The three business choices are explicit. Draft disposal is a plan for old
// unapproved working/saved data only: pending cases, approved history, immutable
// Saves, receipts and original source/media remain protected, never auto-deleted.
export const confirmedDraftBoundaryPolicy = Object.freeze({
  discardUnapprovedWorking: true,
  wholePageABSubmission: true,
  routineFqcWholePage: true,
  resolvePendingBeforeCutover: true,
  preserveApprovedHistoryAndReceipts: true,
  requireExplicitRealCutoverConfirmation: true,
});
