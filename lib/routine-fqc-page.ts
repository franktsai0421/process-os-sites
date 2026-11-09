import {
  applyDraftCommand, cloneDraft, DraftConflict, sameDraftValue, stableDraftJSON,
  type DraftActor, type DraftCommand, type DraftContext, type DraftPatch, type SharedDraft,
} from './shared-draft';
import {
  schedulePreview as schedulePage, buildRoutineDocumentDraft, validateRoutineContentEdit, validateRoutineCaseLink,
  routineDocumentReviewIssues, applyRoutineDocumentApprovalEffects, photoIds,
  type Content, type RoutineFqc, type RoutineDocumentMetadata, type Job,
} from './routine-fqc';

export const ROUTINE_PAGE_SCOPE = 'routine-fqc:page';
type Metadata = Pick<RoutineDocumentMetadata, 'id'|'number'|'kind'|'planId'|'caseId'|'correctionOf'|'createdAt'|'owner'>;
type DocumentState = Partial<Pick<RoutineDocumentMetadata, 'cancelled'|'reopened'|'lifecycle'|'impact'>>;
export type RoutinePageDocument = {id:string;metadata:Metadata;content:Content;cancelled:boolean};
export type RoutineWholePage = {documents:RoutinePageDocument[]};
type Pins = {savedId:string;changedDocumentIds:string[];dependency:string};
export type RoutinePageRoot = RoutineFqc & {pageDraftLayout:'page-v1';page:{
  baseline:{id:string;content:RoutineWholePage};workflow:SharedDraft<RoutineWholePage>;
  documentState:Record<string,DocumentState>;caseDependencies:Record<string,Pins>;operationPermissions?:Record<string,string[]>;
}};
export type RoutinePageContext = {actor:DraftActor;at:string;today:string;
  allowed:DraftContext<RoutineWholePage>['allowed'];create:boolean;delete:boolean;revise:boolean;revoke:boolean;settings?:boolean};
type Creation = {id:string;type:'plan'|'report'|'followup'|'correction';jobIds?:string[];documentId?:string;caseId?:string;
  kind?:'report'|'waiver'|'disposal';notes?:string;photos?:string[];reason?:string;content?:Content};
type Batch = {patches:DraftPatch[];guards:{path:DraftPatch['path'];value:unknown}[]};
export type RoutineWholePageCommand = DraftCommand & {moduleAction?:'save-page-v1';input?:{
  creates:Creation[];batches:Batch[];cancels:{id:string;guard:RoutinePageDocument}[];
}};
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
function demand(ok:unknown,code:string,status=409):asserts ok {if(!ok)throw new DraftConflict(code,status);}
const metadataKeys=['id','number','kind','planId','caseId','correctionOf','createdAt','owner'];
export const routinePageMetadata=(doc:RoutineDocumentMetadata):Metadata=>Object.fromEntries(metadataKeys.map(key=>[key,cloneDraft(doc[key as keyof RoutineDocumentMetadata])])) as Metadata;
const stateOf=(doc:RoutineDocumentMetadata):DocumentState=>Object.fromEntries(['cancelled','reopened','lifecycle','impact'].filter(key=>Object.hasOwn(doc,key)).map(key=>[key,cloneDraft(doc[key as keyof RoutineDocumentMetadata])]));
const docState=(c:RoutinePageRoot,id:string)=>Object.hasOwn(c.page.documentState,id)?c.page.documentState[id]:undefined;
const putDocState=(c:RoutinePageRoot,id:string,state:DocumentState)=>Object.defineProperty(c.page.documentState,id,{value:state,enumerable:true,writable:true,configurable:true});
const exact=(v:Record<string,unknown>,keys:string[])=>Object.keys(v).sort().join(',')===[...keys].sort().join(',');
function shape(page:RoutineWholePage){
  demand(object(page)&&exact(page,['documents'])&&Array.isArray(page.documents),'ROUTINE_PAGE_CONTENT_INVALID',422);
  const seen=new Set<string>();
  for(const row of page.documents){
    demand(object(row)&&exact(row,['id','metadata','content','cancelled'])&&typeof row.id==='string'&&!!row.id&&!seen.has(row.id)&&typeof row.cancelled==='boolean'&&object(row.metadata)&&exact(row.metadata,metadataKeys)&&row.metadata.id===row.id&&['plan','report','waiver','disposal'].includes(row.metadata.kind)&&object(row.content),'ROUTINE_PAGE_CONTENT_INVALID',422);seen.add(row.id);
    demand(['number','createdAt'].every(key=>typeof row.metadata[key as 'number'|'createdAt']==='string')&&['planId','caseId','correctionOf'].every(key=>row.metadata[key as 'planId']===null||typeof row.metadata[key as 'planId']==='string')&&object(row.metadata.owner)&&exact(row.metadata.owner,['id','name','admin'])&&typeof row.metadata.owner.id==='string'&&typeof row.metadata.owner.name==='string'&&typeof row.metadata.owner.admin==='boolean','ROUTINE_PAGE_METADATA_INVALID',422);
  }
}
export function parseRoutinePage(root:RoutineFqc):RoutinePageRoot {
  const c=root as RoutinePageRoot;
  demand(c.pageDraftLayout==='page-v1','ROUTINE_PAGE_CUTOVER_REQUIRED');
  demand(c.page&&c.page.workflow?.scope===ROUTINE_PAGE_SCOPE&&c.page.workflow.schemaVersion===3&&object(c.page.documentState)&&object(c.page.caseDependencies)&&typeof c.page.baseline?.id==='string'&&!!c.page.baseline.id,'ROUTINE_PAGE_OWNER_MISMATCH');
  demand(c.documents.every(doc=>doc.flow.schemaVersion===3&&doc.flow.scope==='routine-fqc:'+doc.id),'ROUTINE_PAGE_LEGACY_OWNER_MISMATCH');
  demand(!c.documents.some(doc=>doc.flow.pendingId||doc.flow.cases.some(review=>review.status==='pending')),'LEGACY_PENDING_REQUIRES_REVIEW');
  const original={documents:c.documents.filter(doc=>doc.flow.active.id&&!doc.cancelled).map(doc=>({id:doc.id,metadata:routinePageMetadata(doc),content:doc.flow.active.content,cancelled:false}))};
  shape(c.page.baseline.content);demand(sameDraftValue(original,c.page.baseline.content),'ROUTINE_PAGE_BASELINE_REQUIRED');
  demand(new Set(c.jobs.map(job=>job.id)).size===c.jobs.length&&new Set(c.cases.map(item=>item.id)).size===c.cases.length&&new Set(c.documents.map(doc=>doc.id)).size===c.documents.length,'ROUTINE_PAGE_OWNER_MISMATCH');
  const flow=c.page.workflow;
  demand(typeof flow.generation==='string'&&!!flow.generation&&Number.isSafeInteger(flow.revision)&&flow.revision>=0,'ROUTINE_PAGE_OWNER_MISMATCH');
  for(const job of c.jobs)if(job.planId)demand(flow.working.documents.some(row=>row.id===job.planId&&row.metadata.kind==='plan'&&!row.cancelled),'ROUTINE_PAGE_ASSIGNMENT_SOURCE_REQUIRED');
  for(const value of [flow.active.content,flow.working,...(flow.saved?[flow.saved.content]:[]),...flow.saves.map(save=>save.content),...flow.cases.flatMap(review=>[review.before,review.content])])shape(value);
  const approved=flow.active.id===c.page.baseline.id?c.page.baseline.content:flow.cases.find(review=>review.id===flow.active.id&&review.status==='approved')?.content;
  demand(approved&&sameDraftValue(approved,flow.active.content)&&flow.baseId===flow.active.id,'ROUTINE_PAGE_BASELINE_REQUIRED');
  demand(new Set(flow.saves.map(save=>save.id)).size===flow.saves.length&&new Set(flow.cases.map(review=>review.id)).size===flow.cases.length,'ROUTINE_PAGE_OWNER_MISMATCH');
  if(flow.saved)demand(flow.saves.some(save=>sameDraftValue(save,flow.saved)),'ROUTINE_PAGE_SAVE_SOURCE_REQUIRED');
  for(const review of flow.cases){const save=flow.saves.find(save=>save.id===review.savedId),before=review.baseId===c.page.baseline.id?c.page.baseline.content:flow.cases.find(prior=>prior.id===review.baseId&&prior.status==='approved'&&prior.id!==review.id)?.content;const proof=c.page.caseDependencies[review.id];demand(save&&sameDraftValue(save.content,review.content)&&before&&sameDraftValue(before,review.before)&&proof?.savedId===review.savedId&&typeof proof.dependency==='string'&&sameDraftValue(proof.changedDocumentIds,changed(review.before,review.content)),'ROUTINE_PAGE_CASE_SOURCE_REQUIRED');}
  const pending=flow.cases.filter(review=>review.status==='pending');demand(pending.length===(flow.pendingId?1:0)&&(!flow.pendingId||pending[0].id===flow.pendingId&&sameDraftValue(pending[0].content,flow.working)),'ROUTINE_PAGE_OWNER_MISMATCH');
  const known=new Map<string,Metadata>();
  for(const page of [c.page.baseline.content,...flow.saves.map(save=>save.content),...flow.cases.map(review=>review.content),flow.working])for(const row of page.documents){const old=known.get(row.id);demand(!old||sameDraftValue(old,row.metadata),'ROUTINE_PAGE_METADATA_CHANGED');known.set(row.id,row.metadata);}
  demand(Object.entries(c.page.documentState).every(([id,state])=>known.has(id)&&object(state)&&Object.keys(state).every(key=>['cancelled','reopened','lifecycle','impact'].includes(key))),'ROUTINE_PAGE_OWNER_MISMATCH');
  for(const row of flow.working.documents)demand(row.cancelled===!!docState(c,row.id)?.cancelled,'ROUTINE_PAGE_LIFECYCLE_CHANGED');
  return c;
}
export function routinePageDocuments(c:RoutinePageRoot,page=c.page.workflow.working){
  return page.documents.map(row=>({...cloneDraft(row.metadata),...cloneDraft(docState(c,row.id)||{}),content:row.content,
    status:row.cancelled?'cancelled':c.page.workflow.active.content.documents.some(active=>active.id===row.id&&!active.cancelled)&&!docState(c,row.id)?.reopened?'approved':'draft'}));
}
const family=(docs:ReturnType<typeof routinePageDocuments>,id:string)=>{const seen=new Set<string>();let doc=docs.find(row=>row.id===id);while(doc?.correctionOf&&!seen.has(doc.id)){seen.add(doc.id);const parent=docs.find(row=>row.id===doc!.correctionOf&&row.kind===doc!.kind);if(!parent)break;doc=parent;}return doc?.id;};
export function routinePageAvailability(c:RoutinePageRoot,id:string){
  const docs=routinePageDocuments(c),plan=docs.find(doc=>doc.id===id);if(!plan)return [];
  return plan.content.lines.map(line=>({jobId:line.jobId,assigned:plan.caseId?c.cases.some(item=>item.id===plan.caseId&&['open','retest'].includes(item.status)):docs.some(doc=>doc.id===c.jobs.find(job=>job.id===line.jobId)?.planId&&doc.kind==='plan'&&doc.status==='approved'&&family(docs,doc.id)===family(docs,plan.id)),reportIds:docs.filter(doc=>doc.status!=='cancelled'&&doc.kind==='report'&&!doc.correctionOf&&(plan.caseId?doc.planId===plan.id:!doc.caseId)&&doc.content.lines.some(row=>row.jobId===line.jobId)).map(doc=>doc.id)}));
}
function dependencies(c:RoutinePageRoot,id:string){const docs=routinePageDocuments(c),doc=docs.find(row=>row.id===id)!;const ids=new Set(docs.filter(row=>row.kind==='plan'&&family(docs,row.id)===family(docs,id)).map(row=>row.id));return{documents:docs.filter(row=>row.status!=='cancelled'&&row.id!==id&&(doc.kind==='plan'&&row.planId&&ids.has(row.planId)||row.correctionOf===id)).map(row=>row.id),cases:doc.kind==='plan'?c.cases.filter(item=>ids.has(item.planId)).map(item=>item.id):[]};}
function unresolved(c:RoutinePageRoot,item:RoutineFqc['cases'][number]){const result=new Set<string>();for(const event of item.events){const doc=routinePageDocuments(c,c.page.workflow.active.content).find(row=>row.id===event.documentId);if(!doc||doc.kind!=='report')continue;for(const line of doc.content.lines.filter(row=>row.jobId===item.jobId))for(const row of line.results)for(const sample of row.samples){if(row.outcome==='pass')result.delete(sample);else result.add(sample);}}return [...result];}
const changed=(before:RoutineWholePage,after:RoutineWholePage)=>after.documents.filter(row=>!sameDraftValue(row,before.documents.find(old=>old.id===row.id))).map(row=>row.id);
function pin(c:RoutinePageRoot,page:RoutineWholePage,ids:string[]){const jobs=new Set(page.documents.filter(row=>ids.includes(row.id)).flatMap(row=>row.content.lines.map(line=>line.jobId)));return stableDraftJSON({jobs:c.jobs.filter(job=>jobs.has(job.id)),cases:c.cases.filter(item=>jobs.has(item.jobId)),documents:routinePageDocuments(c,page).filter(doc=>doc.content.lines.some(line=>jobs.has(line.jobId))).map(doc=>({metadata:routinePageMetadata(doc),state:stateOf(doc)}))});}
function fixedContent(content:Content){const result=cloneDraft(content) as Content & Record<string,unknown>;for(const field of ['title','date','notes','reason','disposition','evidence'])delete result[field];for(const line of result.lines)delete (line as unknown as Record<string,unknown>).results;return result;}
function validateWorking(c:RoutinePageRoot,page:RoutineWholePage){shape(page);const flow=c.page.workflow;
  for(const row of page.documents){
    const original=[c.page.baseline.content,...flow.saves.map(save=>save.content),flow.working].flatMap(value=>value.documents).find(doc=>doc.id===row.id);
    demand(original&&sameDraftValue(original.metadata,row.metadata),'ROUTINE_PAGE_METADATA_CHANGED');
    demand(sameDraftValue(fixedContent(original.content),fixedContent(row.content)),'ROUTINE_PAGE_SOURCE_FIXED');
    validateRoutineContentEdit(c,row.metadata,row.content,row.content);
    const active=flow.active.content.documents.find(doc=>doc.id===row.id),state=docState(c,row.id);
    if(active&&!state?.reopened)demand(sameDraftValue(active.content,row.content),'FORMAL_DOCUMENT_IMMUTABLE');
    if(row.cancelled||active&&!state?.reopened)continue;
    validateRoutineCaseLink(c,row.metadata,row.content);
    for(const line of row.content.lines){const job=c.jobs.find(item=>item.id===line.jobId);demand(job&&sameDraftValue(job.source,line.source),'ROUTINE_PAGE_REFERENCE_CHANGED');if(row.metadata.caseId){const item=c.cases.find(item=>item.id===row.metadata.caseId);demand(item&&sameDraftValue(line.requiredSamples||[],item.requiredSamples),'ROUTINE_PAGE_REFERENCE_CHANGED');}}
  }
}
function createDocument(c:RoutinePageRoot,intent:Creation,ctx:RoutinePageContext){
  demand(ctx.create&&ctx.allowed('edit'),'FORBIDDEN',403);
  demand(object(intent)&&Object.keys(intent).every(key=>['id','type','jobIds','documentId','caseId','kind','notes','photos','reason','content'].includes(key))&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(intent.id)&&['plan','report','followup','correction'].includes(intent.type),'ROUTINE_PAGE_CREATE_INVALID',422);
  demand(['notes','reason'].every(key=>intent[key as 'notes']===undefined||typeof intent[key as 'notes']==='string')&&(intent.photos===undefined||Array.isArray(intent.photos)&&intent.photos.every(id=>typeof id==='string'&&/^[a-f0-9]{64}$/.test(id))),'ROUTINE_PAGE_CREATE_INVALID',422);
  const flow=c.page.workflow,docs=routinePageDocuments(c),parent=docs.find(doc=>doc.id===intent.documentId),item=c.cases.find(item=>item.id===intent.caseId);
  demand(!c.documents.some(doc=>doc.id===intent.id)&&![c.page.baseline.content,...flow.saves.map(save=>save.content),flow.working].some(page=>page.documents.some(doc=>doc.id===intent.id)),'ENTITY_ID_RESERVED');
  let kind:RoutineDocumentMetadata['kind']='plan',jobs:Job[]=[],links:{planId?:string|null;caseId?:string|null;correctionOf?:string|null}={};
  const selected=(ids:unknown)=>{demand(Array.isArray(ids)&&ids.length&&new Set(ids).size===ids.length&&ids.every(id=>typeof id==='string'),'ITEM_REQUIRED',422);const found=ids.map(id=>c.jobs.find(job=>job.id===id));demand(found.every(Boolean),'JOB_NOT_FOUND');return found as Job[];};
  if(intent.type==='plan'){jobs=selected(intent.jobIds);demand(jobs.every(job=>!job.planId&&!job.completion),'JOB_ALREADY_ASSIGNED');}
  if(intent.type==='report'){
    demand(parent?.kind==='plan'&&parent.status==='approved','APPROVED_PLAN_REQUIRED');kind='report';jobs=selected(intent.jobIds||parent.content.lines.map(line=>line.jobId));demand(jobs.every(job=>parent.content.lines.some(line=>line.jobId===job.id)),'PLAN_ITEM_INVALID',422);
    const availability=routinePageAvailability(c,parent.id).filter(row=>jobs.some(job=>job.id===row.jobId));demand(availability.every(row=>row.assigned),'PLAN_NOT_CURRENTLY_ASSIGNED');demand(availability.every(row=>!row.reportIds.length),'REPORT_ALREADY_EXISTS');links={planId:parent.id,caseId:parent.caseId};
  }
  if(intent.type==='correction'){
    demand(ctx.revise,'FORBIDDEN',403);demand(parent?.status==='approved','FORMAL_DOCUMENT_REQUIRED');demand(intent.reason?.trim(),'REASON_REQUIRED',422);validateRoutineCaseLink(c,parent,parent.content);demand(!docs.some(doc=>doc.correctionOf===parent.id&&doc.status==='draft'),'CORRECTION_OPEN');kind=parent.kind;jobs=selected(parent.content.lines.map(line=>line.jobId));links={planId:parent.planId,caseId:parent.caseId,correctionOf:parent.id};
  }
  if(intent.type==='followup'){
    demand(item&&!['closed','disposed','waived'].includes(item.status),'CASE_CLOSED');demand(!docs.some(doc=>doc.status!=='approved'&&doc.status!=='cancelled'&&doc.caseId===item.id),'FOLLOWUP_OPEN');kind=intent.kind||'report';demand(['report','waiver','disposal'].includes(kind),'KIND_INVALID',422);
    if(kind==='waiver'){demand(item.result==='unable','WAIVER_ONLY_UNABLE',422);demand(!unresolved(c,item).length,'OPEN_FAILURE_REQUIRES_RETEST_OR_DISPOSAL',422);}
    if(kind==='disposal')demand(item.result==='fail'||unresolved(c,item).length,'DISPOSAL_ONLY_FAIL',422);
    if(kind==='report'&&item.result==='fail'){const at=[...item.events].reverse().find(event=>event.action==='fail')?.at;demand(intent.notes?.trim()||item.improvements.some(improvement=>at&&improvement.at>=at),'IMPROVEMENT_REQUIRED',422);}
    if(kind==='report'&&intent.notes?.trim()){item.improvements.push({id:crypto.randomUUID(),notes:intent.notes.trim(),photos:intent.photos||[],actor:cloneDraft(ctx.actor),at:ctx.at});item.events.push({action:'improvement',actor:cloneDraft(ctx.actor),at:ctx.at,reason:intent.notes.trim()});}
    if(kind==='report'&&item.result==='unable')kind='plan';jobs=selected([item.jobId]);links={planId:item.planId,caseId:item.id};
  }
  const legacy=c.documents.map(doc=>({kind:doc.kind})),extra=docs.filter(doc=>!c.documents.some(old=>old.id===doc.id));
  const built=buildRoutineDocumentDraft({cases:c.cases,documents:[...legacy,...extra]},kind,jobs,ctx,links);built.metadata.id=intent.id;
  const seed=intent.type==='correction'?cloneDraft(parent!.content):built.content;seed.title=built.metadata.number;if(intent.type==='correction')seed.reason=intent.reason!;
  if(intent.type!=='correction')seed.lines.forEach((line,index)=>{line.id=intent.id+':line:'+index;line.results.forEach((row,rowIndex)=>{row.id=intent.id+':result:'+index+':'+rowIndex;});});
  const content=cloneDraft(intent.content||seed);if(!content.title)content.title=built.metadata.number;demand(sameDraftValue(fixedContent(content),fixedContent(seed)),'ROUTINE_PAGE_SOURCE_FIXED');validateRoutineContentEdit(c,built.metadata,content,seed);
  const row={id:intent.id,metadata:routinePageMetadata(built.metadata),content,cancelled:false};flow.working.documents.push(row);
  if(intent.type==='plan')for(const job of jobs)job.planId=row.id;
  if(intent.type==='followup'){item!.events.push({action:kind,actor:cloneDraft(ctx.actor),at:ctx.at,reason:intent.reason||'',documentId:row.id});if(kind==='report'||kind==='plan')item!.status='retest';}
  return row;
}
function cancelDocument(c:RoutinePageRoot,entry:{id:string;guard:RoutinePageDocument},ctx:RoutinePageContext){
  demand(ctx.delete&&ctx.allowed('edit'),'FORBIDDEN',403);demand(object(entry)&&exact(entry,['id','guard']),'ROUTINE_PAGE_CANCEL_INVALID',422);
  const row=c.page.workflow.working.documents.find(doc=>doc.id===entry.id),doc=routinePageDocuments(c).find(doc=>doc.id===entry.id);demand(row&&doc,'DOCUMENT_NOT_FOUND',404);demand(sameDraftValue(row,entry.guard),'DEPENDENCY_CHANGED_RECONFIRM');demand(!row.cancelled,'DOCUMENT_CANCELLED');
  if(c.page.workflow.active.content.documents.some(active=>active.id===row.id&&!active.cancelled))demand(ctx.revoke,'FORBIDDEN',403);
  if(doc.status==='approved')demand(doc.kind==='plan'&&ctx.revoke,'FORBIDDEN',403);
  const deps=dependencies(c,row.id);demand(!deps.documents.length&&!deps.cases.length,'DOCUMENT_HAS_DEPENDENCIES');const linked=c.cases.find(item=>item.id===doc.caseId),action=doc.status==='approved'?'delete-plan':'discard-draft';
  const state=docState(c,row.id)||{};putDocState(c,row.id,state);state.cancelled={at:ctx.at,actor:cloneDraft(ctx.actor),status:doc.status,caseStatus:linked?.status};state.lifecycle||=[];state.lifecycle.push({action,at:ctx.at,actor:cloneDraft(ctx.actor)});row.cancelled=true;
  if(doc.kind==='plan'&&!doc.caseId)for(const job of c.jobs)if(job.planId===doc.id)job.planId=null;
  if(linked&&['plan','report'].includes(doc.kind)&&linked.status==='retest')linked.status='open';if(linked)linked.events.push({action,at:ctx.at,actor:cloneDraft(ctx.actor),reason:'',documentId:doc.id});
}
function patchAllowed(patch:DraftPatch){const path=patch.path;demand(patch.op==='set'&&Array.isArray(path)&&path[0]==='documents'&&object(path[1])&&exact(path[1],['id'])&&typeof path[1].id==='string'&&path[2]==='content'&&(path.length===4&&['title','date','notes','reason','disposition','evidence'].includes(path[3] as string)||path.length===6&&path[3]==='lines'&&object(path[4])&&exact(path[4],['id'])&&typeof path[4].id==='string'&&path[5]==='results'),'ROUTINE_PAGE_PATCH_NOT_ALLOWED',422);}
export type RoutinePageReceiptOwner={page:{workflow:Pick<SharedDraft<RoutineWholePage>,'scope'|'receipts'>;operationPermissions?:Record<string,string[]>}};
export function assertRoutinePageReceiptAccess(c:RoutinePageReceiptOwner,id:string,ctx:RoutinePageContext){
 demand(c.page.workflow.scope===ROUTINE_PAGE_SCOPE,'ROUTINE_PAGE_OWNER_MISMATCH');
 const record=Object.hasOwn(c.page.workflow.receipts,id)?c.page.workflow.receipts[id]:undefined;demand(record&&record.actorId===ctx.actor.id,'OPERATION_NOT_FOUND',404);
 const caps=c.page.operationPermissions?.[id];demand(Array.isArray(caps)&&caps.every(cap=>['view','edit','save','submit','withdraw','approve','return','create','delete','revise','revoke','settings','admin'].includes(cap)),'ROUTINE_PAGE_RECEIPT_SOURCE_REQUIRED');
 for(const cap of caps)demand(cap==='admin'?ctx.actor.admin:cap==='create'||cap==='delete'||cap==='revise'||cap==='revoke'||cap==='settings'?ctx[cap]:ctx.allowed(cap as 'view'),'FORBIDDEN',403);
}
function stageRoutinePage(source:RoutinePageRoot):RoutinePageRoot{
 const flow=source.page.workflow;
 // Historical Saves/cases/baseline and the original document archive are
 // immutable. Copy mutable business indexes and the live page only.
 return {...source,jobs:source.jobs.map(job=>({...job,completion:job.completion?{...job.completion}:null})),cases:cloneDraft(source.cases),events:[...source.events],page:{...source.page,documentState:cloneDraft(source.page.documentState),caseDependencies:{...source.page.caseDependencies},operationPermissions:{...source.page.operationPermissions},workflow:{...flow,working:cloneDraft(flow.working),contributors:{...flow.contributors},saves:[...flow.saves],cases:[...flow.cases],receipts:{...flow.receipts},sequences:{...flow.sequences},tombstones:[...flow.tombstones]}}};
}
export function executeRoutinePage(source:RoutinePageRoot,command:RoutineWholePageCommand,ctx:RoutinePageContext){
  const old=source.page.workflow,mutating=command.action==='save'&&(!!command.input?.creates?.length||!!command.input?.cancels?.length||!!command.patches?.length);
  demand(ctx.allowed('view')&&ctx.allowed(command.action==='save'?'save':command.action as 'submit'),'FORBIDDEN',403);if(mutating)demand(ctx.allowed('edit'),'FORBIDDEN',403);
  if(command.input?.creates?.length)demand(ctx.create,'FORBIDDEN',403);if(command.input?.cancels?.length)demand(ctx.delete,'FORBIDDEN',403);
  if(command.input?.creates?.some(row=>row.type==='correction'))demand(ctx.revise,'FORBIDDEN',403);
  demand(object(command)&&Object.keys(command).every(key=>['action','operationId','clientId','sequence','generation','expectedRevision','moduleAction','input','patches','savedId','caseId','reason','selfReviewConfirmed'].includes(key)),'ROUTINE_PAGE_COMMAND_INVALID',422);
  const c=stageRoutinePage(source),flow=c.page.workflow;
  const context:DraftContext<RoutineWholePage>={actor:ctx.actor,at:ctx.at,id:()=>crypto.randomUUID(),allowed:ctx.allowed,activeId:flow.active.id,optionalReasonPolicy:'routine-fqc',commandFingerprint:stableDraftJSON(command),semantic:page=>page,
    structure(after,before){demand(sameDraftValue(after.documents.map(row=>row.id),before.documents.map(row=>row.id)),'ROUTINE_PAGE_DOCUMENT_MEMBERSHIP_FIXED',422);for(const row of after.documents){const previous=before.documents.find(doc=>doc.id===row.id)!;if(!sameDraftValue(row.content,previous.content))validateRoutineContentEdit(c,row.metadata,row.content,previous.content);}validateWorking(c,after);},
    validate(page){return page.documents.filter(row=>changed(flow.active.content,page).includes(row.id)&&!row.cancelled).flatMap(row=>routineDocumentReviewIssues(c,row.metadata,row.content).map(issue=>({...issue,path:['documents',{id:row.id},'content',...issue.path]})));}};
  if(old.receipts[command.operationId]){assertRoutinePageReceiptAccess(source,command.operationId,ctx);return{root:source,...applyDraftCommand(old,command,context),replayed:true};}
  demand(['save','submit','withdraw','return','approve'].includes(command.action),'ROUTINE_PAGE_EXPLICIT_SAVE_REQUIRED',422);
  demand(Number.isSafeInteger(command.expectedRevision)&&command.expectedRevision===old.revision,'DRAFT_REVISION_CHANGED_RECONFIRM');
  let applied:ReturnType<typeof applyDraftCommand<RoutineWholePage>>;
  if(command.action==='save'){
    demand(!old.pendingId,'PENDING_LOCKED');demand(command.moduleAction==='save-page-v1'&&object(command.input)&&exact(command.input,['creates','batches','cancels'])&&Array.isArray(command.input.creates)&&command.input.creates.length<=64&&Array.isArray(command.input.cancels)&&command.input.cancels.length<=64&&Array.isArray(command.input.batches)&&command.input.batches.length<=256,'INVALID_LOCAL_SAVE',422);
    for(const intent of command.input.creates)createDocument(c,intent,ctx);
    for(const entry of command.input.cancels)cancelDocument(c,entry,ctx);
    validateWorking(c,flow.working);
    let staged=flow;const intents=new Map<string,{before:unknown;after:unknown}>();
    demand(Array.isArray(command.patches)&&command.patches.length<=256&&sameDraftValue(command.patches,command.input.batches.flatMap(batch=>batch.patches)),'INVALID_LOCAL_SAVE',422);
    for(const batch of command.input.batches){demand(object(batch)&&exact(batch,['patches','guards'])&&Array.isArray(batch.patches)&&Array.isArray(batch.guards)&&batch.guards.length<=256,'INVALID_LOCAL_SAVE',422);for(const patch of batch.patches){patchAllowed(patch);demand(!staged.working.documents.find(row=>row.id===(patch.path[1] as {id:string}).id)?.cancelled||!old.working.documents.find(row=>row.id===(patch.path[1] as {id:string}).id)?.cancelled&&command.input!.cancels.some(entry=>entry.id===(patch.path[1] as {id:string}).id),'DOCUMENT_CANCELLED');const guard=batch.guards.find(guard=>object(guard)&&exact(guard,['path','value'])&&sameDraftValue(guard.path,patch.path));demand(guard,'DEPENDENCY_GUARD_REQUIRED',422);if(patch.op==='set'){const key=stableDraftJSON(patch.path),previous=intents.get(key);intents.set(key,{before:previous?previous.before:guard.value,after:patch.value});}}staged=applyDraftCommand(staged,{...command,action:'apply',patches:batch.patches,guards:batch.guards},context).state;staged={...staged,revision:old.revision,receipts:old.receipts,sequences:old.sequences};}
    validateWorking(c,staged.working);
    const contributors={...staged.contributors};for(const [key,intent] of intents)if(sameDraftValue(intent.before,intent.after)){if(Object.hasOwn(old.contributors,key))contributors[key]=old.contributors[key];else delete contributors[key];}
    for(const intent of command.input.creates)contributors[stableDraftJSON(['documents',{id:intent.id}])]={actor:cloneDraft(ctx.actor),at:ctx.at};
    staged={...staged,contributors};
    applied=applyDraftCommand(staged,command,context);if(!sameDraftValue(old.working,applied.state.working)&&applied.receipt.unchanged){applied.state.revision=old.revision+1;applied.receipt.revision=applied.state.revision;applied.receipt.unchanged=false;applied.state.receipts[command.operationId].result=cloneDraft(applied.receipt);}
  }else{
    demand(command.moduleAction===undefined&&command.input===undefined&&!command.patches?.length,'ROUTINE_PAGE_PATCH_NOT_ALLOWED',422);
    if(!['withdraw','return'].includes(command.action))validateWorking(c,flow.working);
    if(command.action==='submit'){const saved=flow.saves.find(save=>save.id===command.savedId);demand(saved&&sameDraftValue(saved,flow.saved),'ROUTINE_PAGE_SAVE_SOURCE_REQUIRED');}
    if(['approve','return'].includes(command.action)){const review=flow.cases.find(review=>review.id===command.caseId);if(review?.actor.id===ctx.actor.id)demand(ctx.actor.admin,'SELF_REVIEW_ADMIN_ONLY',403);}
    if(command.action==='approve'){const review=flow.cases.find(review=>review.id===command.caseId),fixed=review&&c.page.caseDependencies[review.id];demand(review&&fixed&&fixed.savedId===review.savedId&&flow.saves.some(save=>save.id===review.savedId&&sameDraftValue(save.content,review.content))&&sameDraftValue(fixed.changedDocumentIds,changed(review.before,review.content))&&fixed.dependency===pin(c,review.content,fixed.changedDocumentIds),'ROUTINE_PAGE_DEPENDENCY_CHANGED');}
    applied=applyDraftCommand(flow,command,context);
  }
  c.page.workflow=applied.state;
  if(command.action==='submit'){const review=applied.state.cases.find(review=>review.id===applied.state.pendingId)!;const ids=changed(review.before,review.content);c.page.caseDependencies[review.id]={savedId:review.savedId,changedDocumentIds:ids,dependency:pin(c,review.content,ids)};}
  if(command.action==='approve'){
    const review=applied.state.cases.find(review=>review.id===command.caseId)!;const fixed=c.page.caseDependencies[review.id],documents=routinePageDocuments(c).map(doc=>({...doc}));const business={...c,documents};
    for(const id of fixed.changedDocumentIds){const row=review.content.documents.find(doc=>doc.id===id)!;if(row.cancelled)continue;const doc=documents.find(doc=>doc.id===id)!;doc.reopened=false;applyRoutineDocumentApprovalEffects(business,doc,row.content,ctx);}
    c.jobs=business.jobs;c.cases=business.cases;for(const doc of documents)putDocState(c,doc.id,stateOf(doc));
  }
  const caps=['view',command.action];if(mutating)caps.push('edit');if(command.input?.creates.length)caps.push('create');if(command.input?.cancels.length)caps.push('delete');if(command.input?.creates.some(row=>row.type==='correction'))caps.push('revise');
  if(command.input?.cancels.some(entry=>old.active.content.documents.some(row=>row.id===entry.id&&!row.cancelled)))caps.push('revoke');
  if(['approve','return'].includes(command.action)&&old.cases.find(review=>review.id===command.caseId)?.actor.id===ctx.actor.id)caps.push('admin');
  c.page.operationPermissions={...c.page.operationPermissions,[command.operationId]:[...new Set(caps)]};
  c.revision++;c.events.push({action:'page:'+command.action,actor:cloneDraft(ctx.actor),at:ctx.at,reason:command.reason||''});
  return {root:c,...applied,replayed:false};
}
export const routineWholePagePhotoIds=(page:RoutineWholePage)=>[...new Set(page.documents.flatMap(row=>photoIds(row.content)))];

// Existing scheduling/case administration shares the page's CAS and original
// operation ledger, but never fabricates a document or immutable draft Save.
export type RoutinePageDomainCommand=DraftCommand&{action:'save';moduleAction:'domain-v1';input:{
 action:'configure'|'generate'|'improve'|'close'|'resolve-impact'|'revoke-plan';startDate?:string;caseId?:string;documentId?:string;notes?:string;reason?:string;photos?:string[];
}};
export function executeRoutinePageDomain(source:RoutinePageRoot,command:RoutinePageDomainCommand,sources:import('./routine-fqc').Source[],ctx:RoutinePageContext&{settings:boolean}){
 demand(object(command)&&Object.keys(command).every(key=>['action','operationId','clientId','sequence','generation','expectedRevision','moduleAction','input'].includes(key))&&command.action==='save'&&command.moduleAction==='domain-v1'&&object(command.input)&&Object.keys(command.input).every(key=>['action','startDate','caseId','documentId','notes','reason','photos'].includes(key)),'ROUTINE_PAGE_COMMAND_INVALID',422);
 const input=command.input,review=['close','resolve-impact'].includes(input.action);demand(['configure','generate','improve','close','resolve-impact','revoke-plan'].includes(input.action),'ACTION_INVALID',422);
 demand(ctx.allowed('view')&&ctx.allowed(review?'approve':'edit'),'FORBIDDEN',403);if(input.action==='configure')demand(ctx.settings,'FORBIDDEN',403);if(input.action==='revoke-plan')demand(ctx.revoke,'FORBIDDEN',403);
 const old=source.page.workflow,fingerprint=stableDraftJSON(command);if(old.receipts[command.operationId]){assertRoutinePageReceiptAccess(source,command.operationId,ctx);demand(old.receipts[command.operationId].fingerprint===fingerprint,'OPERATION_ID_REUSED');return{root:source,state:old,receipt:cloneDraft(old.receipts[command.operationId].result),replayed:true};}
 demand(/^[a-zA-Z0-9_-]{8,100}$/.test(command.operationId)&&/^[a-zA-Z0-9_-]{8,100}$/.test(command.clientId)&&Number.isSafeInteger(command.sequence)&&command.sequence>0,'INVALID_OPERATION',422);demand(command.generation===old.generation,'STALE_GENERATION');demand(command.expectedRevision===old.revision,'DRAFT_REVISION_CHANGED_RECONFIRM');const client=stableDraftJSON([ctx.actor.id,command.clientId]);demand(command.sequence>(old.sequences[client]||0),'STALE_CLIENT_OPERATION');
 demand(['notes','reason','startDate','caseId','documentId'].every(key=>input[key as 'notes']===undefined||typeof input[key as 'notes']==='string')&&(input.photos===undefined||Array.isArray(input.photos)&&input.photos.every(id=>/^[a-f0-9]{64}$/.test(id))),'ROUTINE_PAGE_COMMAND_INVALID',422);
 const c=stageRoutinePage(source),flow=c.page.workflow,item=c.cases.find(item=>item.id===input.caseId),doc=routinePageDocuments(c).find(doc=>doc.id===input.documentId);let unchanged=false;
 if(input.action==='configure'){
  demand(!flow.pendingId,'PENDING_LOCKED');demand(!flow.working.documents.length&&!c.documents.length&&c.jobs.every(job=>!job.planId&&!job.completion),'START_DATE_LOCKED');
  // schedulePreview supplies the established real-calendar date validation.
  schedulePage(c,[],input.startDate||'',ctx.today);c.startDate=input.startDate!;c.jobs=[];
 }else if(input.action==='generate'){
  const jobs=c.startDate?schedulePage(c,sources,c.startDate,ctx.today):[];c.jobs.push(...jobs.map(job=>({...job,createdAt:ctx.at})));unchanged=jobs.length===0;
 }else if(input.action==='improve'){
  demand(item&&!['closed','disposed','waived'].includes(item.status),'CASE_CLOSED');demand(input.notes?.trim(),'REASON_REQUIRED',422);item.improvements.push({id:crypto.randomUUID(),notes:input.notes!.trim(),photos:input.photos||[],actor:cloneDraft(ctx.actor),at:ctx.at});item.events.push({action:'improvement',actor:cloneDraft(ctx.actor),at:ctx.at,reason:input.notes!.trim()});
 }else if(input.action==='close'){
  demand(item?.status==='ready-close','APPROVED_PASS_RETEST_REQUIRED');demand(input.reason?.trim(),'REASON_REQUIRED',422);item.status='closed';item.events.push({action:'close',actor:cloneDraft(ctx.actor),at:ctx.at,reason:input.reason!.trim()});
 }else if(input.action==='resolve-impact'){
  demand(doc&&input.reason?.trim(),'REASON_REQUIRED',422);const impacts=docState(c,doc.id)?.impact;demand(impacts?.some(impact=>!impact.resolvedAt),'NO_OPEN_IMPACT',422);for(const impact of impacts!)if(!impact.resolvedAt){impact.resolvedAt=ctx.at;impact.resolvedBy=ctx.actor.id;impact.reason+='\n'+input.reason;}
 }else{
  demand(!flow.pendingId,'PENDING_LOCKED');demand(doc?.kind==='plan'&&doc.status==='approved','APPROVED_PLAN_REQUIRED');demand(!routinePageDocuments(c).some(row=>row.planId===doc.id),'USE_CORRECTION_WITH_REPORTS');demand(input.reason?.trim(),'REASON_REQUIRED',422);const state=docState(c,doc.id)||{};state.reopened=true;putDocState(c,doc.id,state);flow.generation=crypto.randomUUID();flow.saved=null;
 }
 if(!unchanged)flow.revision++;flow.sequences[client]=command.sequence;const receipt={operationId:command.operationId,generation:flow.generation,revision:flow.revision,savedId:flow.saved?.id||null,caseId:flow.pendingId,unchanged};flow.receipts[command.operationId]={actorId:ctx.actor.id,fingerprint,result:cloneDraft(receipt)};
 c.page.operationPermissions={...c.page.operationPermissions,[command.operationId]:['view',review?'approve':'edit',...(input.action==='configure'?['settings']:[]),...(input.action==='revoke-plan'?['revoke']:[])]};c.revision++;c.events.push({action:'page-domain:'+input.action,actor:cloneDraft(ctx.actor),at:ctx.at,reason:input.reason||''});return{root:c,state:flow,receipt,replayed:false};
}

export function routinePageReviewContext(c:RoutinePageRoot){const review=c.page.workflow.cases.find(review=>review.id===c.page.workflow.pendingId);if(!review)return null;const fixed=c.page.caseDependencies[review.id],captured=JSON.parse(fixed.dependency);demand(Array.isArray(captured.jobs)&&Array.isArray(captured.cases),'ROUTINE_PAGE_CASE_SOURCE_REQUIRED');return{jobs:captured.jobs as Job[],cases:captured.cases as RoutineFqc['cases'],changed:fixed.dependency!==pin(c,review.content,fixed.changedDocumentIds)};}
