import {assertRoutineResetFence} from './routine-reset-fence';
import type { State } from './process-state';
import { emptyRoutine, type Job, type RoutineFqc } from './routine-fqc';
import { calendarCanArrange, reconcileCalendar, validatePlanDates, validCalendarDate } from './routine-fqc-calendar';
import { RI_KEY, routineIqcSources, routineIqcTimeline, type IqcRoutineSource } from './routine-iqc';
import { applyDraftCommand, cloneDraft, createSharedDraft, DraftConflict, stableDraftJSON,
  type DraftActor, type DraftCommand, type DraftContext, type DraftIssue, type DraftPatch, type DraftPermission, type SharedDraft } from './shared-draft';

type Kind = 'plan' | 'report' | 'retest-plan' | 'retest-report' | 'disposal' | 'waiver';
type Outcome = '' | 'pass' | 'fail' | 'abnormal';
export type Lot = { partId: string; batchNo: string; quantity: number | null };
type Batch = { partId: string; batchNo: string; quantity: number; unit: 'pcs' };
type Inspection = { id: string; jobId: string; batch: Batch; outcome: Outcome; value: string; notes: string; photos: string[] };
type Content = { title?: string; notes: string; reason: string; disposition: string; start: string; end: string; date: string;
  lots: Lot[]; inspections: Inspection[]; photos: string[] };
export type IqcDocument = { id: string; number: string; kind: Kind; planId: string | null; caseId: string | null;
  jobs: {id: string; source: IqcRoutineSource}[]; createdAt?: string; cancelledAt?: string; flow: SharedDraft<Content> };
type IqcCase = { id: string; batch: Batch; planId: string; originReportId: string; reports: string[];
  result: 'fail'|'abnormal'; status: 'open'|'retest'|'closed'|'disposed'; jobIds: string[] };
type OperationResult = { documentId?: string };
type Receipt = { actorId: string; fingerprint: string; result: OperationResult };
export type RoutineIqc = {resetGenerationRevision?:number;schemaVersion:1; revision:number; calendar:RoutineFqc; lastScheduleDay?:string; documents:IqcDocument[];
  cases:IqcCase[]; receipts:Record<string,Receipt>;
  lastStart?:{actorId:string;at:string;reason:string;date:string}};
export type Command = { action: string; operationId: string; expectedRevision: number; documentId?: string;
  caseId?: string; jobIds?: string[]; start?: string; end?: string; draft?: DraftCommand;
  fields?: Partial<Content>; expectedStateRevision?:number; scope?:string; confirm?:string; reason?:string; startAck?:boolean; irreversibleAck?:boolean };
type Permissions = Record<DraftPermission, boolean> & {create:boolean;delete:boolean;settings:boolean};
export type IqcContext = {actor:DraftActor;permissions:Permissions;today:string;at:string;id:()=>string};

const fail=(code:string,status=422):never=>{throw new DraftConflict(code,status);};
function requireThat(value:unknown, code:string,status=422): asserts value { if(!value)fail(code,status); }
const same=(a:unknown,b:unknown)=>stableDraftJSON(a)===stableDraftJSON(b);
export const iqcDocStatus=(doc:IqcDocument)=>doc.cancelledAt?'cancelled':doc.flow.pendingId?'pending':doc.flow.active.id?'approved':'draft';
export const iqcDocContent=(doc:IqcDocument)=>doc.flow.pendingId?doc.flow.cases.find(c=>c.id===doc.flow.pendingId)!.content:
  doc.flow.active.id?doc.flow.active.content:doc.flow.working;
export const iqcBatchKey=(batch:Pick<Batch,'partId'|'batchNo'>)=>JSON.stringify([batch.partId,batch.batchNo.trim()]);
const emptyContent=(today:string):Content=>({notes:'',reason:'',disposition:'',start:'',end:'',date:today,lots:[],inspections:[],photos:[]});
const empty=():RoutineIqc=>({schemaVersion:1,revision:0,calendar:emptyRoutine(),documents:[],cases:[],receipts:{}});

export function readRoutineIqc(state:State) {
  const raw=state.values[RI_KEY];
  if(!raw)return empty();
  const value=JSON.parse(raw) as RoutineIqc;
  requireThat(value.schemaVersion===1&&value.calendar?.schemaVersion===1&&Array.isArray(value.calendar.jobs)&&
    Array.isArray(value.documents)&&Array.isArray(value.cases)&&value.receipts, 'IQC_STATE_INVALID',503);
  return value;
}
function document(state:RoutineIqc,id?:string) {return state.documents.find(doc=>doc.id===id);}
const isPlan=(doc:IqcDocument)=>doc.kind==='plan'||doc.kind==='retest-plan';
const isReport=(doc:IqcDocument)=>doc.kind==='report'||doc.kind==='retest-report';
export const iqcExpired=(state:RoutineIqc,doc:IqcDocument,today:string)=>doc.kind==='plan'&&iqcDocStatus(doc)==='draft'&&
  doc.jobs.some(line=>state.calendar.jobs.some(job=>job.id===line.id&&job.end<today));
function waiverLockAvailable(state:RoutineIqc,job:Job,waiverId?:string) {
  const existing=document(state,job.planId||undefined);
  const legacyDraft=existing?.kind==='waiver'&&iqcDocStatus(existing)==='draft';
  return (!job.planId||existing?.id===waiverId&&existing?.kind==='waiver'||legacyDraft)&&
    (!job.calendar?.requestId||job.calendar.requestId===waiverId);
}
function canRequestWaiver(state:RoutineIqc,job:Job|undefined,today:string,waiverId?:string) {
  return !!job?.calendar&&job.start<=today&&!job.completion&&!job.calendar.stopped&&!job.calendar.retestCaseId&&
    waiverLockAvailable(state,job,waiverId)&&!state.cases.some(item=>item.jobIds.includes(job.id)&&!['closed','disposed'].includes(item.status));
}
// A job can remain in the calendar for history after its source changes.
export function iqcPlanEligibility(state:RoutineIqc,latest:ReadonlyMap<string,Pick<IqcRoutineSource,'frequency'>>,today:string){
  return (job:Job|undefined):job is Job=>!!job&&job.end>=today&&canRequestWaiver(state,job,today)&&
    calendarCanArrange({...job,planId:null},today)&&latest.get(job.itemId)?.frequency===job.calendar?.frequency;
}
function releaseWaiver(state:RoutineIqc,doc:IqcDocument){
  for(const job of state.calendar.jobs.filter(job=>doc.jobs.some(line=>line.id===job.id))){
    if(job.planId===doc.id)job.planId=null;
    if(job.calendar?.requestId===doc.id)delete job.calendar.requestId;
  }
}
export const iqcStartLocked = (state:RoutineIqc)=>!!(state.calendar.startDate||state.documents.length||state.cases.length||
  state.calendar.jobs.some(job=>job.planId||job.completion||job.calendar?.stopped));
function createDocument(state:RoutineIqc,kind:Kind,jobs:IqcDocument['jobs'],content:Content,ctx:IqcContext,planId:string|null=null,caseId:string|null=null) {
  const id=ctx.id(), prefix={plan:'PLN',report:'RPT','retest-plan':'RPL','retest-report':'RTS',disposal:'DSP',waiver:'WVR'}[kind];
  const number='IQC-'+prefix+'-'+ctx.today.replaceAll('-','')+'-'+String(state.documents.filter(doc=>doc.kind===kind).length+1).padStart(4,'0');
  const working=['plan','retest-plan','report','retest-report'].includes(kind)?{...content,title:number}:content;
  const flow=createSharedDraft('routine-iqc:'+id,working,null,ctx.id());
  flow.active.content=emptyContent(ctx.today);
  const doc={id,number,kind,jobs:cloneDraft(jobs),planId,caseId,createdAt:ctx.at,flow};
  state.documents.push(doc);
  return doc;
}
export function iqcDraftIssues(doc:IqcDocument, content:Content, today?:string):DraftIssue[] {
  const issues:DraftIssue[]=[];
  const add=(field:string,code:string)=>issues.push({kind:'error',path:[field],code,message:code});
  if(content.title!==undefined&&(typeof content.title!=='string'||!content.title.trim()))add('title','IQC_TITLE_REQUIRED');
  if(doc.kind==='plan'){
    const parts=new Set(doc.jobs.map(job=>job.source.iqc.partId));
    if([...parts].some(part=>!content.lots.some(lot=>lot.partId===part))||
      content.lots.some(lot=>!lot.batchNo.trim()||!Number.isSafeInteger(lot.quantity)||lot.quantity!<1))add('lots','IQC_BATCH_FIELDS_REQUIRED');
    if(doc.jobs.reduce((sum,job)=>sum+content.lots.filter(lot=>lot.partId===job.source.iqc.partId).length,0)>1000)add('lots','IQC_REPORT_TOO_LARGE');
  }
  if(isPlan(doc)&&(!validCalendarDate(content.start)||!validCalendarDate(content.end)||content.start>content.end))add('start','IQC_PLAN_DATES_REQUIRED');
  if(['retest-plan','disposal','waiver'].includes(doc.kind)&&!content.reason.trim())add('reason','IQC_REASON_REQUIRED');
  if(doc.kind==='disposal'&&!content.disposition.trim())add('disposition','IQC_DISPOSITION_REQUIRED');
  if(isReport(doc)){
    if(!validCalendarDate(content.date))add('date','IQC_DATE_REQUIRED');
    if(content.end&&(content.date>content.end||today&&today>content.end)&&!content.reason.trim())add('reason','IQC_OVERDUE_REASON_REQUIRED');
    if(!content.inspections.length||content.inspections.some(row=>!row.outcome))add('inspections','IQC_ALL_BATCHES_REQUIRED');
    if(content.inspections.some(row=>row.outcome==='pass'&&!row.value.trim()))add('inspections','IQC_VALUE_REQUIRED');
    if(content.inspections.some(row=>['fail','abnormal'].includes(row.outcome)&&!row.notes.trim()))add('inspections','IQC_EXPLANATION_REQUIRED');
    if(content.inspections.some(row=>row.outcome==='fail'&&!row.photos.length))add('inspections','IQC_DEFECT_PHOTO_REQUIRED');
  }
  return issues;
}
const editable:Record<Kind,ReadonlySet<keyof Content>>={
  plan:new Set(['title','notes','lots']),report:new Set(['title','date','notes','reason','inspections']),
  'retest-plan':new Set(['title','notes','reason','start','end']),'retest-report':new Set(['title','date','notes','reason','inspections']),
  disposal:new Set(['reason','disposition','notes','photos']),waiver:new Set(['reason','notes'])
};
const photoList=(value:unknown):value is string[]=>Array.isArray(value)&&value.length<=20&&
  value.every(p=>typeof p==='string'&&/^[a-f0-9]{64}$/.test(p))&&new Set(value).size===value.length;
function contentStructure(doc:IqcDocument,next:Content,before:Content){
  requireThat(next.title===undefined||typeof next.title==='string'&&next.title.length<=20000,'IQC_TEXT_INVALID');
  for(const key of ['notes','reason','disposition','start','end','date'] as const)
    requireThat(typeof next[key]==='string'&&next[key].length<=20000,'IQC_TEXT_INVALID');
  requireThat(photoList(next.photos),'IQC_PHOTOS_INVALID');
  requireThat(Array.isArray(next.lots)&&next.lots.length<=500,'IQC_LOTS_INVALID');
  const seen=new Set<string>();
  for(const lot of next.lots){
    requireThat(lot&&Object.keys(lot).sort().join(',')==='batchNo,partId,quantity'&&doc.jobs.some(job=>job.source.iqc.partId===lot.partId)&&
      typeof lot.batchNo==='string'&&lot.batchNo.length<=120&&(lot.quantity===null||Number.isSafeInteger(lot.quantity)&&lot.quantity>0),'IQC_LOTS_INVALID');
    const key=iqcBatchKey(lot);
    if(lot.batchNo.trim()){requireThat(!seen.has(key),'IQC_DUPLICATE_LOT');seen.add(key);}
  }
  requireThat(Array.isArray(next.inspections)&&next.inspections.length===before.inspections.length,'IQC_REPORT_MEMBERSHIP_FIXED');
  for(const [index,row] of next.inspections.entries()){
    const old=before.inspections[index];
    requireThat(row&&Object.keys(row).sort().join(',')==='batch,id,jobId,notes,outcome,photos,value'&&row.id===old.id&&row.jobId===old.jobId&&same(row.batch,old.batch),'IQC_BATCH_SNAPSHOT_FIXED');
    requireThat(['','pass','fail','abnormal'].includes(row.outcome)&&typeof row.value==='string'&&row.value.length<=20000&&
      typeof row.notes==='string'&&row.notes.length<=20000&&photoList(row.photos),'IQC_RESULT_INVALID');
  }
}
export const iqcContentPhotos=(value:Content)=>[...value.photos,...value.inspections.flatMap(row=>row.photos)];

function reportRows(doc:IqcDocument,batch:Batch,jobIds:string[],ctx:IqcContext):Inspection[] {
  return doc.jobs.filter(job=>jobIds.includes(job.id)&&job.source.iqc.partId===batch.partId)
    .map(job=>({id:ctx.id(),jobId:job.id,batch:cloneDraft(batch),outcome:'',value:'',notes:'',photos:[]}));
}
function busyCase(state:RoutineIqc,target:IqcCase) {
  return state.documents.some(doc=>doc.caseId===target.id&&['draft','pending'].includes(iqcDocStatus(doc)))||target.status==='retest';
}
export function iqcCanDispose(state:RoutineIqc, target:IqcCase) {
  if(target.status!=='open')return false;
  if(target.result==='abnormal')return true;
  const latest=document(state,target.reports.at(-1));
  return target.result==='fail'&&latest?.kind==='retest-report'&&latest.caseId===target.id&&
    iqcDocStatus(latest)==='approved'&&latest.flow.active.content.inspections.some(row=>row.outcome==='fail');
}
function closeReports(state:RoutineIqc, doc:IqcDocument, content:Content,ctx:IqcContext) {
  if(doc.kind==='report'){
    const batches=new Map<string,Inspection[]>();
    for(const row of content.inspections){const key=iqcBatchKey(row.batch);const rows=batches.get(key)||[];rows.push(row);batches.set(key,rows);}
    for(const rows of batches.values()){
      const failed=rows.filter(row=>row.outcome!=='pass');
      if(failed.length)state.cases.push({id:ctx.id(),batch:cloneDraft(rows[0].batch),planId:doc.planId!,originReportId:doc.id,
        reports:[doc.id],result:failed.some(row=>row.outcome==='fail')?'fail':'abnormal',status:'open',jobIds:failed.map(row=>row.jobId)});
    }
    for(const job of state.calendar.jobs.filter(row=>row.planId===doc.planId)){
      const results=content.inspections.filter(row=>row.jobId===job.id);
      job.completion={kind:results.some(row=>row.outcome==='fail')?'fail':results.some(row=>row.outcome==='abnormal')?'abnormal':'pass',reportId:doc.id,at:ctx.at};
    }
    return;
  }
  const target=state.cases.find(item=>item.id===doc.caseId);
  if(doc.kind==='waiver'){
    releaseWaiver(state,doc);
    for(const job of state.calendar.jobs.filter(job=>doc.jobs.some(row=>row.id===job.id)))job.completion={kind:'skip',reportId:doc.id,at:ctx.at};
    return;
  }
  if(!target)return;
  if(doc.kind==='retest-plan')target.status='retest';
  if(doc.kind==='disposal'){target.status='disposed';target.reports.push(doc.id);}
  if(doc.kind==='retest-report'){
    target.reports.push(doc.id);
    const failed=content.inspections.filter(row=>row.outcome!=='pass');
    target.status=failed.length?'open':'closed';
    if(failed.length){target.jobIds=failed.map(row=>row.jobId);target.result=failed.some(row=>row.outcome==='fail')?'fail':'abnormal';}
  }
}
const requiredAction=(cmd:Command): DraftPermission|'create'|'delete'|'settings' => {
  if(cmd.action==='draft'){
    const action=cmd.draft?.action;
    requireThat(action&&['save','submit','approve','return','withdraw'].includes(action),'IQC_ACTION_INVALID');
    return action as DraftPermission;
  }
  if(cmd.action==='configure')return 'settings';
  if(cmd.action==='dispose-draft')return 'delete';
  if(cmd.action.startsWith('create-'))return 'create';
  requireThat(cmd.action==='generate','IQC_ACTION_INVALID');
  return 'edit';
};

export function initializeIqcCalendar(calendar:RoutineFqc,start:string,timeline:ReturnType<typeof routineIqcTimeline>,today:string,at:string){
  calendar.startDate=start;
  calendar.jobs=[];
  calendar.calendarPolicy={version:2,adoptedAt:new Date(start+'T00:00:00+07:00').toISOString(),scopes:{}};
  reconcileCalendar(calendar,timeline,today,at);
}

export function executeRoutineIqc(state:RoutineIqc, command:Command, sourceState:State, ctx:IqcContext) {
  requireThat(command&&typeof command.action==='string'&&/^[\w-]{8,100}$/.test(command.operationId),'IQC_OPERATION_INVALID');
  const permission=requiredAction(command);
  requireThat(ctx.permissions.view&&ctx.permissions[permission],'FORBIDDEN',403);
  if(['settings','create','delete','save'].includes(permission))requireThat(ctx.permissions.edit,'FORBIDDEN',403);
  if(command.action==='configure')requireThat(ctx.actor.admin,'FORBIDDEN',403);
  assertRoutineResetFence(state,command.expectedRevision,command.operationId);
  const fingerprint=stableDraftJSON(command), old=state.receipts[command.operationId];
  if(old){requireThat(old.actorId===ctx.actor.id&&old.fingerprint===fingerprint,'OPERATION_ID_REUSED',409);return {replayed:true,result:old.result};}
  requireThat(command.expectedRevision===state.revision,'REVISION_CONFLICT',409);
  const calendar=state.calendar, doc=document(state,command.documentId);
  const timeline=routineIqcTimeline(sourceState);
  if(command.action!=='configure')reconcileCalendar(calendar,timeline,ctx.today,ctx.at);
  const result:OperationResult={};
  switch(command.action){
    case 'configure': {
      requireThat(command.expectedStateRevision===sourceState.revision,'REVISION_CONFLICT',409);
      requireThat(command.scope==='routine-iqc-only'&&command.confirm==='START IQC'&&command.startAck===true,'IQC_START_CONFIRMATION_REQUIRED');
      requireThat(typeof command.reason==='string'&&command.reason.trim()&&command.reason.length<=2000,'IQC_START_REASON_REQUIRED');
      requireThat(validCalendarDate(command.start),'IQC_DATE_REQUIRED');
      requireThat(!iqcStartLocked(state),'START_DATE_LOCKED',409);
      state.lastStart={actorId:ctx.actor.id,at:ctx.at,reason:command.reason.trim(),date:command.start};
      initializeIqcCalendar(calendar,command.start,timeline,ctx.today,ctx.at);
      break;
    }
    case 'generate':
      break;
    case 'create-plan':
    case 'create-waiver': {
      const ids=command.jobIds;
      requireThat(Array.isArray(ids)&&ids.length>0&&ids.length<=200&&new Set(ids).size===ids.length,'IQC_WORK_REQUIRED');
      const latest=new Map(routineIqcSources(sourceState).map(source=>[source.id,source]));
      const jobs=ids.map(id=>calendar.jobs.find(job=>job.id===id));
      requireThat(jobs.every(iqcPlanEligibility(state,latest,ctx.today)),'IQC_WORK_NOT_AVAILABLE',409);
      if(command.action==='create-plan')validatePlanDates(jobs.map(job=>({...job,planId:null})),command.start||'',command.end||'',ctx.today);
      const content={...emptyContent(ctx.today),start:command.start||'',end:command.end||''};
      const kind=command.action==='create-plan'?'plan':'waiver';
      const existing=kind==='waiver'?state.documents.find(row=>row.kind==='waiver'&&iqcDocStatus(row)==='draft'&&
        row.jobs.length===ids.length&&row.jobs.every(line=>ids.includes(line.id))):undefined;
      const created=existing||createDocument(state,kind,jobs.map(job=>({id:job.id,source:latest.get(job.itemId)!})),content,ctx);
      if(kind==='plan')for(const job of jobs){job.planId=created.id;job.source=cloneDraft(latest.get(job.itemId)!);}
      result.documentId=created.id;
      break;
    }
    case 'create-report': {
      requireThat(doc&&isPlan(doc)&&iqcDocStatus(doc)==='approved','IQC_APPROVED_PLAN_REQUIRED',409);
      requireThat(!state.documents.some(child=>child.planId===doc.id&&isReport(child)&&!child.cancelledAt),'IQC_REPORT_EXISTS',409);
      const plan=doc.flow.active.content, content={...emptyContent(ctx.today),start:plan.start,end:plan.end};
      if(doc.kind==='plan'){
        requireThat(iqcDraftIssues(doc,plan).length===0,'IQC_APPROVED_PLAN_INVALID',409);
        content.inspections=plan.lots.flatMap(lot=>reportRows(doc,{...lot,batchNo:lot.batchNo.trim(),quantity:lot.quantity!,unit:'pcs'},doc.jobs.map(job=>job.id),ctx));
      }else{
        const target=state.cases.find(item=>item.id===doc.caseId&&item.status==='retest');
        requireThat(target,'IQC_CASE_CHANGED',409);
        content.inspections=reportRows(doc,target.batch,target.jobIds,ctx);
      }
      requireThat(content.inspections.length>0,'IQC_REPORT_MEMBERSHIP_FIXED',409);
      result.documentId=createDocument(state,doc.kind==='plan'?'report':'retest-report',doc.jobs,content,ctx,doc.id,doc.caseId).id;
      break;
    }
    case 'create-retest':
    case 'create-disposal': {
      const target=state.cases.find(item=>item.id===command.caseId);
      requireThat(target?.status==='open'&&!busyCase(state,target),'IQC_CASE_NOT_AVAILABLE',409);
      const plan=document(state,target.planId);
      requireThat(plan&&iqcDocStatus(plan)==='approved','IQC_APPROVED_PLAN_REQUIRED',409);
      const jobs=plan.jobs.filter(job=>target.jobIds.includes(job.id));
      const kind=command.action==='create-retest'?'retest-plan':'disposal';
      if(kind==='disposal')requireThat(iqcCanDispose(state,target),'IQC_CASE_NOT_AVAILABLE',409);
      result.documentId=createDocument(state,kind,jobs,emptyContent(ctx.today),ctx,plan.id,target.id).id;
      break;
    }
    case 'dispose-draft':
      requireThat(doc&&iqcDocStatus(doc)==='draft'&&!iqcExpired(state,doc,ctx.today),'IQC_DRAFT_LOCKED',409);
      doc.cancelledAt=ctx.at;
      if(doc.kind==='waiver')releaseWaiver(state,doc);
      if(doc.kind==='plan')for(const job of calendar.jobs)if(job.planId===doc.id)job.planId=null;
      break;
    case 'draft': {
      const inner=command.draft!;
      requireThat(doc&&!doc.cancelledAt&&inner.operationId===command.operationId,'IQC_DOCUMENT_NOT_FOUND',404);
      requireThat(!doc.flow.active.id,'IQC_DOCUMENT_FIXED',409);
      requireThat(!iqcExpired(state,doc,ctx.today),'EXPIRED_PLAN_READ_ONLY',409);
      requireThat(inner.expectedRevision===doc.flow.revision,'DRAFT_REVISION_CHANGED_RECONFIRM',409);
      const context:DraftContext<Content>={actor:ctx.actor,at:ctx.at,id:ctx.id,activeId:doc.flow.active.id,
        allowed:op=>ctx.permissions[op],semantic:content=>content,commandFingerprint:fingerprint,
        structure:(next,before)=>contentStructure(doc,next,before),validate:content=>iqcDraftIssues(doc,content,ctx.today)};
      let flow=doc.flow;
      const keyFields=new Set(['action','operationId','clientId','sequence','generation','expectedRevision','savedId','caseId','reason','selfReviewConfirmed']);
      requireThat(Object.keys(inner).every(key=>keyFields.has(key)),'IQC_ACTION_INVALID');
      if(inner.action==='save'){
        const fields=command.fields||{};
        requireThat(!Array.isArray(fields)&&Object.keys(fields).every(key=>editable[doc.kind].has(key as keyof Content)),'IQC_BATCH_SNAPSHOT_FIXED');
        const keys=Object.keys(fields) as (keyof Content)[];
        const patches:DraftPatch[]=keys.filter(key=>!same(fields[key],flow.working[key])).map(key=>({op:'set',path:[key],value:fields[key]}));
        if(patches.length){
          const staged=applyDraftCommand(flow,{...inner,action:'apply',patches,guards:patches.map(p=>({path:p.path,value:flow.working[p.path[0] as keyof Content]}))},context);
          flow={...flow,working:staged.state.working,contributors:staged.state.contributors};
        }
      }else{
        requireThat(!command.fields,'IQC_ACTION_INVALID');
      }
      if(inner.action==='approve'&&doc.flow.cases.find(review=>review.id===doc.flow.pendingId)?.actor.id===ctx.actor.id)
        requireThat(ctx.actor.admin,'SELF_REVIEW_ADMIN_ONLY',403);
      if(doc.kind==='waiver'&&['submit','approve'].includes(inner.action))
        requireThat(doc.jobs.every(line=>canRequestWaiver(state,calendar.jobs.find(job=>job.id===line.id),ctx.today,doc.id)),'IQC_WORK_NOT_AVAILABLE',409);
      const reviewed={...inner};
      if(inner.action==='submit'||inner.action==='withdraw')reviewed.reason=inner.reason|| (inner.action==='submit'?'IQC submission':'IQC withdrawal');
      doc.flow=applyDraftCommand(flow,reviewed,context).state;
      if(doc.kind==='waiver'&&inner.action==='submit')for(const job of calendar.jobs.filter(job=>doc.jobs.some(line=>line.id===job.id))){
        if(job.planId===doc.id)job.planId=null;
        job.calendar!.requestId=doc.id;
      }
      if(doc.kind==='waiver'&&['withdraw','return'].includes(inner.action))releaseWaiver(state,doc);
      if(inner.action==='approve')closeReports(state,doc,doc.flow.active.content,ctx);
      break;
    }
  }
  if(calendar.startDate&&calendar.startDate<=ctx.today)state.lastScheduleDay=ctx.today;
  state.revision++;
  state.receipts[command.operationId]={actorId:ctx.actor.id,fingerprint,result};
  return {replayed:false,result};
}
