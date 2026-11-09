import type {SharedDraft} from './shared-draft';
import {DraftConflict} from './shared-draft';
import type {RoutineFqc} from './routine-fqc';
export function routineApprovedQuery(request:Request){
 const q=new URL(request.url).searchParams;if(!q.has('approvedOnly'))return null;
 const list=q.has('uiHistory'),detail=q.has('versionId'),permissions=q.has('permissions'),kind=list?'list':detail?'detail':'permissions';
 const allowed=new Set(['approvedOnly','documentId',...(list?['uiHistory','versionBefore']:detail?['versionId']:['permissions'])]);
 if(new URL(request.url).pathname!=='/api/routine-fqc'||q.get('approvedOnly')!=='1'||Number(list)+Number(detail)+Number(permissions)!==1||[...q.keys()].some(k=>!allowed.has(k)||q.getAll(k).length!==1)||!q.get('documentId')||q.get('documentId')!.length>500||list&&q.get('uiHistory')!=='1'||detail&&(!q.get('versionId')||q.get('versionId')!.length>512)||permissions&&q.get('permissions')!=='1'||(q.get('versionBefore')?.length||0)>512)throw new DraftConflict('INVALID_APPROVED_HISTORY_QUERY',422);
 return{kind,documentId:q.get('documentId')!,versionId:q.get('versionId'),before:q.get('versionBefore')};
}
export function routineApprovedControl(value:unknown):RoutineFqc{
 const c=value as RoutineFqc;if(c?.schemaVersion!==1||!Array.isArray(c.documents)||!Array.isArray(c.jobs)||!Array.isArray(c.cases))throw new DraftConflict('FQC_DATA_INVALID',422);return c;
}
export function routineApprovedRows<T>(d:{flow:SharedDraft<T>}){const counts=new Map<string,number>();for(const c of d.flow.cases)counts.set(c.id,(counts.get(c.id)||0)+1);return d.flow.cases.flatMap((c,index)=>{
 const text=(value:unknown):value is string=>typeof value==='string'&&!!value.trim(),stamp=(value:unknown)=>text(value)&&Number.isFinite(Date.parse(value));
 if(counts.get(c.id)!==1||c.status!=='approved'||!text(c.id)||c.id.startsWith('shared-')||!text(c.savedId)||!text(c.actor?.id)||!text(c.actor?.name)||!stamp(c.at)||!text(c.result?.actor?.id)||!text(c.result?.actor?.name)||!stamp(c.result?.at))return[];
 return[{id:c.id,number:index+1,status:c.id===d.flow.active.id?'approved':'superseded',creatorName:c.actor.name,createdAt:c.at,approvalEvidence:{kind:'approved-case' as const,caseId:c.id,savedId:c.savedId,approvedBy:c.result.actor.name,approvedAt:c.result.at}}];
}).reverse();}
export function routineApprovedVersion<T>(d:{flow:SharedDraft<T>},id:string){const row=routineApprovedRows(d).find(v=>v.id===id);if(!row)return null;const c=d.flow.cases.find(c=>c.id===id)!;return{...row,snapshot:c.content};}
