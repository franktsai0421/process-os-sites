import {DraftConflict} from './shared-draft';

type ErrorRow = {id:string; code:string; deleted?:boolean; isDeleted?:boolean};

type ErrorControl<T extends ErrorRow> = {
  activeVersionId:string|null;
  versions:{id:string; snapshot:{errors:T[]}}[];
  workflow?:{active:{id:string|null; content:{errors:T[]}}};
};

export function activeErrorRows<T extends ErrorRow>(control:ErrorControl<T>):T[] | null {
  if (!control.activeVersionId) return [];
  const version = control.versions.find(row => row.id === control.activeVersionId);
  if (Array.isArray(version?.snapshot?.errors)) return version.snapshot.errors;
  const active = control.workflow?.active;
  return active?.id === control.activeVersionId && Array.isArray(active.content?.errors) ? active.content.errors : null;
}

const visible = (row:ErrorRow) => !row.deleted && !row.isDeleted;
const key = (value:string) => value.trim().toLowerCase();

export function manualErrorCode(value:unknown, id:string, draft:ErrorRow[], active:ErrorRow[] | null, describe?: (value:string,id:string)=>unknown):string {
  if (typeof value !== 'string' || !value.trim()) throw new DraftConflict('ERROR_CODE_REQUIRED',422);
  if (!Array.isArray(active)) throw new DraftConflict('ERROR_CODE_BASE_UNAVAILABLE',409);
  const wanted = key(value);
  for (const rows of [draft, active]) {
    if (rows.some(row => visible(row) && row.id !== id && key(row.code) === wanted)) {
      throw new DraftConflict('ERROR_CODE_DUPLICATE',422,describe?.(value,id));
    }
  }
  return value;
}

export function validateErrorCodeChanges(next:ErrorRow[], previous:ErrorRow[], active:ErrorRow[] | null, describe?: (value:string,id:string)=>unknown) {
  const old = new Map(previous.map(row => [row.id,row]));
  for (const row of next) {
    const before = old.get(row.id);
    if (visible(row) && (!before || !visible(before) || before.code !== row.code)) {
      manualErrorCode(row.code,row.id,next,active,describe);
    }
  }
}
