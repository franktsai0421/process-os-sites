import {DraftConflict,stableDraftJSON} from './shared-draft';

type Item = {id:string; errorId:string; code?:string; checkNo?:string; deleted?:boolean; isDeleted?:boolean};
type Parent = {id:string; code:string};
type Snapshot = {errors:Parent[]; items:Item[]};

const visible = (row:Item) => !row.deleted && !row.isDeleted;
const key = (code:string) => code.trim().toLowerCase();

export function approvedCodes<S extends Snapshot>(control:{activeVersionId:string|null; versions:{id:string;snapshot:S}[]; workflow?:{active:{id:string|null;content:S}}}):S {
  const id=control.activeVersionId;
  if (!id) return {errors:[],items:[]} as unknown as S;
  const snapshot=control.versions.find(row=>row.id===id)?.snapshot;
  if (Array.isArray(snapshot?.items)) return snapshot;
  if (control.workflow?.active.id===id && Array.isArray(control.workflow.active.content?.items)) return control.workflow.active.content;
  throw new DraftConflict('ERROR_CODE_BASE_UNAVAILABLE',409);
}

function validItemCode(parent:string,candidate:unknown):candidate is string {
  if (typeof candidate!=='string' || candidate.length!==parent.length+3 || !candidate.startsWith(parent+'-')) return false;
  const suffix=candidate.slice(-2);
  return /^[0-9]{2}$/.test(suffix) && suffix!=='00';
}

export function requireItemCode(parent:string, candidate:unknown):string {
  if (!validItemCode(parent,candidate)) throw new DraftConflict('ITEM_CODE_INVALID',422);
  return candidate;
}

// Stable IDs identify owners across draft and effective snapshots. Untouched legacy
// numbers stay readable until that item or its parent's number is changed.
export function validateItemCodes(next:Snapshot, previous:Snapshot, active:Snapshot, field:'checkNo'|'code', extra:Item[]=[]) {
  const parents=new Map(next.errors.map(row=>[row.id,row.code]));
  const oldParents=new Map(previous.errors.map(row=>[row.id,row.code]));
  const oldItems=new Map(previous.items.map(row=>[row.id,row]));
  const occupied=new Map<string,Set<string>>();
  for (const row of [...active.items,...next.items,...extra]) {
    const code=row[field];
    if (!visible(row) || typeof code!=='string') continue;
    const normalized=key(code), owners=occupied.get(normalized) || new Set<string>();
    owners.add(row.id); occupied.set(normalized,owners);
  }
  for (const item of next.items) {
    if (!visible(item)) continue;
    const parent=parents.get(item.errorId), old=oldItems.get(item.id);
    const candidate=item[field];
    if (old && visible(old) && old.errorId===item.errorId && old[field]===candidate && oldParents.get(item.errorId)===parent) {
      // Avoid walking media and rules for ordinary unchanged, singly-owned numbers.
      if (typeof parent==='string' && validItemCode(parent,candidate) && occupied.get(key(candidate))?.size===1) continue;
      if (old===item || stableDraftJSON(old)===stableDraftJSON(item)) continue;
    }
    if (typeof parent!=='string') throw new DraftConflict('ERROR_PARENT_INVALID',422);
    const code=requireItemCode(parent,item[field]);
    const other=[...(occupied.get(key(code)) || [])].find(id=>id!==item.id);
    if (other) throw new DraftConflict('ITEM_CODE_DUPLICATE',422,{code,itemId:item.id,occupiedBy:other});
  }
}
