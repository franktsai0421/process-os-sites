/** Product/line calendar scheduling. Pure staged state changes; caller owns auth/CAS/receipt. */
import type {RoutineFqc,Source,Job,Frequency} from './routine-fqc';
import {periodAt,nextDate} from './routine-fqc';
import {DraftConflict,cloneDraft} from './shared-draft';
export type CalendarTimelineEntry={id:string;at:string;day:string;sources:Source[]};
export type CalendarPolicy={version:2;adoptedAt:string;appliedVersions?:string[];transitions?:{scope:string;at:string;from:Frequency;to:Frequency|null;starts:string|null}[];scopes:Record<string,{source:Source;from:string;until?:string}>};
export type CalendarWork={scope:string;productCode:string;frequency:Frequency;queuedAt?:string;resumeHistory?:{stopped:{at:string;reason:string};resumedAt:string;sourceVersionId:string}[];stopped?:{at:string;reason:string};requestId?:string;retestCaseId?:string;originJobId?:string};
// Renumbering changes the planner label by stable ID. Once work has a document,
// its captured source also owns the labels shown for subsequent reports and retests.
export function periodItemCode(job:Job, latest:Pick<Source,'code'>|undefined, documented:boolean):Job {
  if (!latest || documented || job.planId || job.completion || job.calendar?.requestId ||
      job.calendar?.retestCaseId || job.calendar?.originJobId || job.calendar?.stopped ||
      job.source.code === latest.code) return job;
  return {...job, source:{...job.source, code:latest.code}};
}

export const calendarScope=(s:Source,product:string)=>JSON.stringify([s.line,product,s.id]);
const adoptionDay=(p:CalendarPolicy)=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(p.adoptedAt));
function frequencyStart(c:RoutineFqc,scope:string,source:Source,day:string){
 const frequency=source.frequency!,current=periodAt(day,frequency);
 const ends=c.jobs.filter(j=>!j.calendar?.retestCaseId&&!!j.planId&&j.end>=current.start&&(j.calendar?.scope===scope||!j.calendar&&j.itemId===source.id&&j.source.line===source.line&&j.source.products.some(p=>p.code===source.products[0].code))).map(j=>j.end).sort();
 if(!ends.length)return current.start;
 const after=nextDate(ends.at(-1)!),period=periodAt(after,frequency);
 return period.start===after?after:nextDate(period.end);
}
export function validCalendarDate(value:unknown):value is string{return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;}
export function calendarCanArrange(j:Job,today:string){return !!j.calendar&&!j.planId&&!j.completion&&!j.calendar.stopped&&!j.calendar.requestId&&(!!j.calendar.retestCaseId||j.end>=today);}
export function validatePlanDates(jobs:Job[],start:string,end:string,today:string){
 if(!validCalendarDate(start)||!validCalendarDate(end)||start>end)throw new DraftConflict('PLAN_DATES_REQUIRED',422);
 for(const j of jobs){if(!calendarCanArrange(j,today))throw new DraftConflict(j.end<today&&!j.calendar?.retestCaseId?'EXPIRED_PERIOD_NO_NEW_PLAN':'JOB_NOT_ARRANGEABLE',409);if(!j.calendar?.retestCaseId&&(start<j.start||end>j.end))throw new DraftConflict('PLAN_DATES_OUTSIDE_PERIOD',422);}
}
export function generateCalendar(c:RoutineFqc,sources:Source[],today:string,at:string){
 const policy=c.calendarPolicy;if(!policy||!c.startDate||c.startDate>today)return 0;
 const current=new Map<string,Source>();
 for(const source of sources)if(source.frequency)for(const product of source.products){const scope=calendarScope(source,product.code);current.set(scope,{...cloneDraft(source),products:[cloneDraft(product)]});}
 for(const [scope,old]of Object.entries(policy.scopes)){
  const source=current.get(scope),changed=!source||source.frequency!==old.source.frequency;
  if(!changed)continue;
  const changeDay=source?.effectiveDate||today;
  if(!old.until){old.until=changeDay;policy.transitions||=[];policy.transitions.push({scope,at,from:old.source.frequency!,to:source?.frequency||null,starts:source?frequencyStart(c,scope,source,changeDay):null});}
  for(const j of c.jobs)if(j.calendar?.scope===scope&&!j.calendar.retestCaseId&&!j.planId&&!j.completion&&!j.calendar.stopped&&j.end>=changeDay)j.calendar.stopped={at,reason:source?'frequency-changed':'source-disabled'};
 }
 let count=0;
 for(const [scope,source]of current){
  let rule=policy.scopes[scope];
  if(!rule||rule.source.frequency!==source.frequency||rule.until){
   const change=source.effectiveDate||today;
   const day=[c.startDate,change,adoptionDay(policy)].sort().at(-1)!;
   const from=rule?frequencyStart(c,scope,source,day):periodAt(day,source.frequency!).start;
   rule={source:cloneDraft(source),from};policy.scopes[scope]=rule;
  }else rule.source=cloneDraft(source);
  let cursor=rule.from,limit=0;
  while(cursor<=today&&limit++<600){
   const p=periodAt(cursor,source.frequency!),key='calendar:'+encodeURIComponent(scope)+'@'+p.period;
   // Existing legacy commitments remain authoritative; never split or rewrite their history.
   const legacy=c.jobs.some(j=>!j.calendar&&j.itemId===source.id&&j.source.line===source.line&&j.source.products.some(x=>x.code===source.products[0].code)&&j.start===p.start&&j.end===p.end&&(j.planId||j.completion));
   const existing=c.jobs.find(j=>j.id===key);
   // Reuse only uncommitted current work stopped by source disablement.
   // Reverting to this frequency may reuse its stopped period; retain every stop event.
   if(!legacy&&existing?.calendar?.stopped&&['source-disabled','frequency-changed'].includes(existing.calendar.stopped.reason)&&existing.calendar.frequency===source.frequency&&!existing.calendar.retestCaseId&&!existing.calendar.requestId&&!existing.planId&&!existing.completion&&p.end>=today){
    (existing.calendar.resumeHistory||=[]).push({stopped:cloneDraft(existing.calendar.stopped),resumedAt:at,sourceVersionId:source.versionId});
    delete existing.calendar.stopped;
   }
   if(!legacy&&!existing){c.jobs.push({id:key,itemId:source.id,period:p.period,start:p.start,end:p.end,source:cloneDraft(source),planId:null,completion:null,createdAt:at,calendar:{scope,productCode:source.products[0].code,frequency:source.frequency!}});count++;}
   cursor=nextDate(p.end);
  }
  if(limit>=600)throw new DraftConflict('SCHEDULE_RANGE_TOO_LARGE',422);
 }
 return count;
}
/** Replay approved source snapshots at their approval timestamps, not visit time. */
export function reconcileCalendar(c:RoutineFqc,history:CalendarTimelineEntry[],today:string,at:string){
 const policy=c.calendarPolicy;if(!policy||!c.startDate||c.startDate>today)return 0;
 const entries=history.filter(e=>e.day<=today).sort((a,b)=>a.at.localeCompare(b.at)||a.id.localeCompare(b.id));
 const applied=new Set(policy.appliedVersions||[]),adopted=adoptionDay(policy);let count=0;
 const baseline=entries.filter(e=>e.at<=policy.adoptedAt).at(-1);
 if(!applied.size&&baseline){count+=generateCalendar(c,baseline.sources,adopted,policy.adoptedAt);applied.add(baseline.id);}
 for(const entry of entries){
  if(applied.has(entry.id)||entry.at<policy.adoptedAt)continue;
  const prior=Object.values(policy.scopes).filter(s=>!s.until).map(s=>s.source);
  const previousDay=new Date(Date.parse(entry.day+'T00:00:00Z')-86400000).toISOString().slice(0,10);
  if(previousDay>=adopted)count+=generateCalendar(c,prior,previousDay,entry.at);
  count+=generateCalendar(c,entry.sources,entry.day,entry.at);applied.add(entry.id);
 }
 policy.appliedVersions=[...applied];
 const active=Object.values(policy.scopes).filter(s=>!s.until).map(s=>s.source);
 count+=generateCalendar(c,active,today,at);
 return count;
}
/** Read-only next-date projection. Caller commits created work and locks atomically. */
export function calendarNextSelection(c:RoutineFqc,job:Job,next:string,at:string){
 if(!job.calendar&&job.source.products.length===1&&job.source.frequency)job={...job,calendar:{scope:calendarScope(job.source,job.source.products[0].code),productCode:job.source.products[0].code,frequency:job.source.frequency}};
 if(!validCalendarDate(next)||!job.calendar||!job.source.frequency)throw new DraftConflict('NEXT_DATE_REQUIRED',422);
 const policy=c.calendarPolicy?.scopes[job.calendar.scope];
 if(!policy||policy.until)throw new DraftConflict('NEXT_DATE_SOURCE_DISABLED',409);
 const source=policy.source,frequency=source.frequency!;
 const targetPeriod=periodAt(next,frequency);
 if(targetPeriod.start<=job.start)throw new DraftConflict('NEXT_PERIOD_REQUIRED',422);
 if(targetPeriod.start<policy.from)throw new DraftConflict('NEXT_DATE_FREQUENCY_TRANSITION',422);
 const created:Job[]=[],skipped:Job[]=[];let target:Job|undefined,cursor=periodAt(nextDate(job.end),frequency).start,limit=0;
 while(cursor<=targetPeriod.start&&limit++<600){
  const p=periodAt(cursor,frequency);cursor=nextDate(p.end);
  if(p.start<policy.from||p.start<=job.start)continue;
  const id='calendar:'+encodeURIComponent(job.calendar.scope)+'@'+p.period;
  let candidate=c.jobs.find(j=>j.id===id)||c.jobs.find(j=>!j.calendar&&j.itemId===source.id&&j.source.line===source.line&&j.source.products.some(p=>p.code===job.calendar!.productCode)&&j.start===p.start&&j.end===p.end&&(j.planId||j.completion));
  if(!candidate){candidate={id,itemId:source.id,period:p.period,start:p.start,end:p.end,source:cloneDraft(source),planId:null,completion:null,createdAt:at,calendar:{scope:job.calendar.scope,productCode:job.calendar.productCode,frequency}};created.push(candidate);}
  if(p.start===targetPeriod.start){target=candidate;continue;}
  if(candidate.completion||candidate.calendar?.stopped)continue;
  if(candidate.planId)throw new DraftConflict('NEXT_DATE_EXISTING_PLAN_CONFLICT',409);
  skipped.push(candidate);
 }
 if(!target)throw new DraftConflict('NEXT_PERIOD_REQUIRED',422);
 if(limit>=600)throw new DraftConflict('SCHEDULE_RANGE_TOO_LARGE',422);
 return {target,skipped,created};
}
