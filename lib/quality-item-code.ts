import {DraftConflict} from './shared-draft';
import {checkApprovalItemOwners} from './quality-approval-ownership';

type Field = 'checkNo' | 'code';
type Item = {
  id:string; code?:string; checkNo?:string; deleted?:boolean; isDeleted?:boolean;
  name?:string; nameVi?:string; standard?:string;
};
type Snapshot = {items:Item[]; errors?:unknown[]};
type Control = {
  activeVersionId:string|null; versions:{id:string; snapshot:Snapshot}[];
  workflow?:{active:{id:string|null; content:Snapshot}};
};
type Peer = {scope:string; items:Item[]};

const visible = (row:Item) => !row.deleted && !row.isDeleted;
const normalized = (value:unknown) => typeof value === 'string' ? value.trim().toLowerCase() : '';

export function approvedCodes(control:Control):Snapshot {
  if (!control.activeVersionId) return {items:[]};
  const approved = control.versions.find(row => row.id === control.activeVersionId)?.snapshot;
  if (Array.isArray(approved?.items)) return approved;
  const active = control.workflow?.active;
  if (active?.id === control.activeVersionId && Array.isArray(active.content?.items)) return active.content;
  throw new DraftConflict('ACTIVE_VERSION_CHANGED');
}

export function requireItemCode(value:unknown) {
  if (typeof value !== 'string' || !value.trim()) throw new DraftConflict('ITEM_CODE_REQUIRED',422);
  return value.trim();
}

export function chooseItemCode(value:unknown, allocate:()=>string, reserved:string[]) {
  if (value === undefined) return allocate();
  const code = requireItemCode(value);
  if (!reserved.includes(code)) reserved.push(code);
  return code;
}

type Peers = () => Peer[];
type CodeCheck = [next:Snapshot, previous:Snapshot, active:Snapshot, field:Field, peers?:Peers];

export function itemCodeReview(control:Control, field:Field, peers?:Peers) {
  return {
    checkSave(proposed:Snapshot) {
      const active = approvedCodes(control);
      validateItemCodes(proposed,active,active,field,peers);
    },
    checkApproval(before:Snapshot, proposed:Snapshot) {
      validateItemCodes(proposed,before,approvedCodes(control),field,peers);
      checkApprovalItemOwners(control,before,proposed,field);
    }
  };
}

export function validateItemCodes(...args:CodeCheck) {
  checkChangedCodes(false,...args);
}

// Only mutable editor input may be normalized. Pending, saved and historical bodies are immutable.
export function prepareItemCodes(...args:CodeCheck) {
  checkChangedCodes(true,...args);
}

function checkChangedCodes(prepare:boolean, next:Snapshot, previous:Snapshot, active:Snapshot, field:Field, peers?:Peers) {
  const old = new Map(previous.items.map(row => [row.id,row]));
  const changes = next.items.filter(row => {
    const before = old.get(row.id);
    return visible(row) && (!before || !visible(before) || before[field] !== row[field]);
  });
  if (!changes.length) return;
  const claims = new Map<string,Map<string,{row:Item; scope?:string}>>();
  function index(rows:Item[], scope?:string) {
    for (const row of rows) {
      if (!visible(row) && field !== 'checkNo') continue;
      const key = normalized(row[field]);
      if (!key) continue;
      let owners = claims.get(key);
      if (!owners) { owners = new Map(); claims.set(key,owners); }
      owners.set(JSON.stringify([scope,row.id]),{row,scope});
    }
  }
  index(active.items);
  index(next.items);
  for (const peer of peers?.() || []) index(peer.items,peer.scope);
  for (const row of changes) {
    const code = requireItemCode(row[field]);
    const before = old.get(row.id);
    const sameOwnership = before && visible(before) && normalized(before[field]) === normalized(code);
    if (!sameOwnership) {
      for (const owner of claims.get(normalized(code))?.values() || []) {
        if (owner.scope === undefined && owner.row.id === row.id) continue;
        throw new DraftConflict('ITEM_CODE_DUPLICATE',422,{
          code,itemId:row.id,occupiedBy:owner.row.id,occupiedName:owner.row.nameVi || owner.row.name || owner.row.standard || owner.row.id,
          ...(owner.scope === undefined ? {} : {scope:owner.scope})
        });
      }
    }
    if (prepare && row[field] !== code) row[field] = code;
  }
}
