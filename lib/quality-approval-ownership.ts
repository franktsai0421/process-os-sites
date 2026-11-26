import {DraftConflict} from './shared-draft';

type Item = {id:string; code?:string; checkNo?:string; deleted?:boolean; isDeleted?:boolean};
type Snapshot = {items:Item[]};
type Control = {
  activeVersionId:string|null;
  versions:{id:string; snapshot:Snapshot}[];
  workflow?:{active:{id:string|null; content:Snapshot}};
};

function owners(snapshot:Snapshot, field:'checkNo'|'code') {
  const result = new Map<string,string>();
  for (const row of snapshot.items) {
    const value = row[field];
    const code = typeof value === 'string' && value.trim().toLowerCase();
    if (code && !row.deleted && !row.isDeleted) result.set(row.id,code);
  }
  return result;
}

export function checkApprovalItemOwners(control:Control, before:Snapshot, proposed:Snapshot, field:'checkNo'|'code') {
  if (!control.activeVersionId) return;
  let active = control.versions.find(v => v.id === control.activeVersionId)?.snapshot;
  if (!Array.isArray(active?.items) && control.workflow?.active.id === control.activeVersionId)
    active = control.workflow.active.content;
  if (!active || !Array.isArray(active.items)) throw new DraftConflict('ACTIVE_VERSION_CHANGED');

  const reviewed = owners(before,field);
  const next = owners(proposed,field);
  const proposedCodes = new Set(next.values());
  for (const [id,code] of owners(active,field)) {
    // A full-snapshot approval would displace this unreviewed effective owner.
    if (proposedCodes.has(code) && next.get(id) !== code && reviewed.get(id) !== code)
      throw new DraftConflict('ACTIVE_VERSION_CHANGED');
  }
}
