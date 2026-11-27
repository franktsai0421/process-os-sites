// Only the FQC module's authorized draft and effective rows are passed here.
// A draft deletion releases a code only when the approved owner is gone too.
export function fqcCodeOwner(field, value, id, draft, approved) {
  const key = value.trim().toLowerCase();
  if (!key) return;
  const matches = row => row.id !== id && typeof row[field] === 'string' && row[field].trim().toLowerCase() === key;
  const live = row => !row.isDeleted && !row.deleted;
  const inDraft = draft.filter(matches), inApproved = approved.filter(matches);
  const draftOwner = inDraft.find(live), approvedOwner = inApproved.find(live);
  const row = draftOwner || approvedOwner;
  if (!row) return;
  const source = !draftOwner ? 'approved'
    : inApproved.some(other => other.id === draftOwner.id && live(other)) ? 'both' : 'draft';
  const location = r => ({occupiedName:r.name || r.nameVi || '', line:r.line || '', category:r.category || ''});
  const otherApproved = draftOwner && inApproved.find(other => live(other) && other.id !== draftOwner.id);
  return {
    fqcOwnerSource:source, ...location(row),
    ...(field === 'checkNo' ? {occupiedBy:row.id} : {}),
    ...(otherApproved ? {otherApproved:location(otherApproved)} : {}),
  };
}
