import {DraftConflict,sameDraftValue} from './shared-draft';
import {routineApprovedRows,routineApprovedVersion,routineApprovedControl} from './routine-fqc-approved-history';
import type {RoutinePageRoot} from './routine-fqc-page';
const prefix='legacy-routine-page:';
export function routinePageApprovedQuery(request:Request){
 const {pathname,searchParams:q}=new URL(request.url);if(!q.has('approvedOnly'))return null;
 const list=q.has('uiHistory'),detail=q.has('versionId'),permissions=q.has('permissions'),kind=list?'list':detail?'detail':'permissions';
 const allowed=new Set(['approvedOnly','compact',...(list?['uiHistory','versionBefore']:detail?['versionId']:['permissions'])]);
 if(pathname!=='/api/routine-fqc/page'||q.get('approvedOnly')!=='1'||q.has('compact')&&q.get('compact')!=='1'||Number(list)+Number(detail)+Number(permissions)!==1||[...q.keys()].some(key=>!allowed.has(key)||q.getAll(key).length!==1)||list&&q.get('uiHistory')!=='1'||detail&&(!q.get('versionId')||q.get('versionId')!.length>8192)||permissions&&q.get('permissions')!=='1'||(q.get('versionBefore')?.length||0)>8192)throw new DraftConflict('INVALID_APPROVED_HISTORY_QUERY',422);
 return{kind,versionId:q.get('versionId'),before:q.get('versionBefore')};
}
export function routinePageApprovedControl(value:unknown){
 const c=routineApprovedControl(value) as RoutinePageRoot & {page:RoutinePageRoot['page']&{historyCaseIds:string[]}};
 if(c.pageDraftLayout!=='page-v1')throw new DraftConflict('ROUTINE_PAGE_CUTOVER_REQUIRED',409);
 const flow=c.page?.workflow;if(flow?.scope!=='routine-fqc:page'||flow.schemaVersion!==3||!Array.isArray(flow.cases)||!c.page.baseline?.id||!Array.isArray(c.page.historyCaseIds)||!c.documents.every(d=>d.flow?.scope==='routine-fqc:'+d.id&&d.flow.schemaVersion===3&&!d.flow.pendingId&&!d.flow.cases.some(review=>review.status==='pending')))throw new DraftConflict('ROUTINE_PAGE_OWNER_MISMATCH',409);
 return c;
}
export function parseRoutinePageLegacyId(id:string){if(!id.startsWith(prefix))return null;try{const row=JSON.parse(id.slice(prefix.length));return Array.isArray(row)&&row.length===2&&row.every(value=>typeof value==='string'&&value.length>0&&value.length<=500)?{documentId:row[0] as string,versionId:row[1] as string}:null;}catch{return null;}}
const identity=(documentId:string,versionId:string)=>prefix+JSON.stringify([documentId,versionId]);
// Response-only projections retain original document/case owners. Old document
// approvals never become whole-page approvals or writable baselines.
export function routinePageApprovedRows(c:RoutinePageRoot){
 const modern=routineApprovedRows({flow:c.page.workflow});
 const seen=new Set(modern.map(row=>row.id)),counts=new Map<string,number>();for(const d of c.documents)counts.set(d.id,(counts.get(d.id)||0)+1);
 const legacy=c.documents.filter(d=>counts.get(d.id)===1).flatMap(d=>routineApprovedRows(d).map(row=>({...row,id:identity(d.id,row.id),sourceScope:'routine-fqc:'+d.id,sourceVersionId:row.id,sourceDocumentNumber:d.number}))).filter(row=>!seen.has(row.id));
 return [...modern.filter(row=>(c.page as RoutinePageRoot['page']&{historyCaseIds?:string[]}).historyCaseIds?.includes(row.id)),...legacy];
}
export function routinePageApprovedVersion(c:RoutinePageRoot,id:string){
 const row=routinePageApprovedRows(c).find(row=>row.id===id);if(!row)return null;
 const legacy=parseRoutinePageLegacyId(id);if(!legacy)return routineApprovedVersion({flow:c.page.workflow},id);
 const d=c.documents.find(d=>d.id===legacy.documentId)!,original=routineApprovedVersion(d,legacy.versionId);if(!original)return null;
 // Metadata fields are immutable document identities; no current lifecycle,
 // cancellation, jobs, report availability or other live business data is used.
 return{...row,snapshot:{documents:[{id:d.id,metadata:{id:d.id,number:d.number,kind:d.kind,planId:d.planId,caseId:d.caseId,correctionOf:d.correctionOf,createdAt:d.createdAt,owner:d.owner},content:original.snapshot}]}};
}

// Applied only after the stored aggregate SHA is verified. This presentation
// projection is never a writer/adoption input and never rewrites source bytes.
export function routinePageHistoryProjection(raw:string,selectedId:string|null){
 const c=JSON.parse(raw),legacy=selectedId?parseRoutinePageLegacyId(selectedId):null;
 const original=c.page?.workflow,saveCounts=new Map<string,number>();for(const save of original?.saves||[])saveCounts.set(save.id,(saveCounts.get(save.id)||0)+1);
 const historyCaseIds=(original?.cases||[]).filter((review:Record<string,unknown>)=>{const save=(original?.saves||[]).find((save:{id:unknown})=>save.id===review.savedId),base=review.baseId===c.page?.baseline?.id?c.page.baseline.content:original?.cases.find((old:{id:unknown;status:string})=>old.id===review.baseId&&old.status==='approved')?.content,pin=c.page?.caseDependencies?.[review.id as string];return save&&saveCounts.get(save.id)===1&&pin?.savedId===review.savedId&&Array.isArray(pin.changedDocumentIds)&&typeof pin.dependency==='string'&&base&&sameDraftValue(save.content,review.content)&&sameDraftValue(base,review.before);}).map((review:{id:string})=>review.id);
 const flow=(value:Record<string,unknown>,sourceId:string|null)=>{const reviews=Array.isArray(value?.cases)?value.cases:[];return{schemaVersion:value?.schemaVersion,scope:value?.scope,pendingId:value?.pendingId,active:{id:(value?.active as {id?:unknown})?.id},cases:reviews.map(review=>Object.fromEntries(Object.entries(review).filter(([key])=>key!=='before'&&(key!=='content'||review.id===sourceId))))};};
 return JSON.stringify({schemaVersion:c.schemaVersion,pageDraftLayout:c.pageDraftLayout,jobs:[],cases:[],documents:Array.isArray(c.documents)?c.documents.map((doc:Record<string,unknown>)=>({...Object.fromEntries(Object.entries(doc).filter(([key])=>key!=='flow')),flow:flow(doc.flow as Record<string,unknown>,legacy&&legacy.documentId===doc.id?legacy.versionId:null)})):c.documents,page:{historyCaseIds,baseline:{id:c.page?.baseline?.id},workflow:flow(c.page?.workflow,!legacy?selectedId:null)}});
}
