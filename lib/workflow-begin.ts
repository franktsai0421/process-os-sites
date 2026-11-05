import {DraftConflict,stableDraftJSON,type SharedDraft,type DraftReceipt} from './shared-draft';
export type BeginBasis={generation:string|null;activeVersionId:string|null;openVersionId:string|null;openVersionStatus:string|null;openVersionRevision:number|null};
export type BeginIdentity={operationId:string;basis:BeginBasis};
type Control={activeVersionId:string|null;versions:{id:string;status:string;revision:number}[];workflow?:SharedDraft<unknown>};
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const exact=(v:Record<string,unknown>,keys:string[])=>Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
export function parseBeginIdentity(body:unknown):BeginIdentity|null{
 if(!object(body)||body.action!=='begin-v1')return null;
 const b=body.begin;
 if(!exact(body,['action','begin'])||!object(b)||!exact(b,['operationId','basis'])||typeof b.operationId!=='string'||! /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(b.operationId)||!object(b.basis))throw new DraftConflict('INVALID_BEGIN_IDENTITY',422);
 const basis=b.basis,keys=['generation','activeVersionId','openVersionId','openVersionStatus','openVersionRevision'];
 if(!exact(basis,keys)||keys.slice(0,4).some(k=>basis[k]!==null&&(typeof basis[k]!=='string'||!basis[k]||String(basis[k]).length>200))||basis.openVersionRevision!==null&&(!Number.isSafeInteger(basis.openVersionRevision)||Number(basis.openVersionRevision)<0)||
  (basis.openVersionId===null)!==(basis.openVersionStatus===null)||basis.openVersionId===null&&basis.openVersionRevision!==null||basis.openVersionStatus!==null&&!['draft','pending','pending-test'].includes(basis.openVersionStatus as string))throw new DraftConflict('INVALID_BEGIN_IDENTITY',422);
 return b as BeginIdentity;
}
export function beginBasis(control:Control):BeginBasis{
 const open=control.versions.find(v=>['draft','pending','pending-test'].includes(v.status));
 return {generation:control.workflow?.generation??null,activeVersionId:control.activeVersionId??null,openVersionId:open?.id??null,openVersionStatus:open?.status??null,openVersionRevision:open?.revision??null};
}
const fingerprint=(begin:BeginIdentity)=>stableDraftJSON({action:'begin-v1',begin});
export function replayBegin(control:Control,begin:BeginIdentity,actorId:string):DraftReceipt|null{
 const old=control.workflow?.receipts[begin.operationId];if(!old)return null;
 if(old.actorId!==actorId||old.fingerprint!==fingerprint(begin))throw new DraftConflict('OPERATION_ID_REUSED');
 return old.result;
}
export function assertBeginBasis(control:Control,begin:BeginIdentity){if(stableDraftJSON(beginBasis(control))!==stableDraftJSON(begin.basis))throw new DraftConflict('BEGIN_BASIS_CHANGED',409);}
export function recordBegin(control:Control,begin:BeginIdentity,actorId:string,unchanged:boolean):DraftReceipt{
 const flow=control.workflow!;const receipt={operationId:begin.operationId,generation:flow.generation,revision:flow.revision,savedId:flow.saved?.id??null,caseId:flow.pendingId,unchanged};
 flow.receipts={...flow.receipts,[begin.operationId]:{actorId,fingerprint:fingerprint(begin),result:receipt}};return receipt;
}
