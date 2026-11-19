const test=require('node:test'),assert=require('node:assert/strict');
const load=require('../scripts/ipqc-ab-import-harness.cjs')(),r=load('lib/routine-fqc.ts'),cal=load('lib/routine-fqc-calendar.ts');
const copy=x=>JSON.parse(JSON.stringify(x));
const actor={id:'synthetic',name:'Synthetic',admin:true};
const context=(day='2026-05-20')=>({actor,at:day+'T08:00:00Z',today:day,allowed:()=>true,settings:false,revoke:false,revise:true});
const source=(extra={})=>({id:'standard',name:'Synthetic item',code:'S1',line:'A',category:'C',errorCode:'E',description:'Synthetic standard',versionId:'approved-v1',version:'1',effectiveDate:'2026-05-01',frequency:'monthly',frequencyText:'monthly',products:[{code:'P1',name:'Synthetic P1'},{code:'P2',name:'Synthetic P2'}],...extra});
function state(){return {...r.emptyRoutine(),startDate:'2026-05-12',calendarPolicy:{version:2,adoptedAt:'2026-05-12T00:00:00Z',scopes:{}}};}
let seq=0;const command=(c,action,extra={})=>({action,operationId:'synthetic-operation-'+(++seq),expectedRevision:c.revision,...extra});
void test('calendar months, quarters, half years and years never use last report anniversary',()=>{for(const [frequency,start,end]of [['monthly','2026-05-01','2026-05-31'],['quarterly','2026-04-01','2026-06-30'],['semiannual','2026-01-01','2026-06-30'],['yearly','2026-01-01','2026-12-31']])assert.deepEqual(copy(r.periodAt('2026-05-23',frequency)),{start,end,period:frequency+':'+start});});
void test('never-inspected products and lines are independent, generation is idempotent and no early backfill',()=>{const c=state(),sources=[source(),source({line:'B'})];assert.equal(cal.generateCalendar(c,sources,'2026-05-20','now'),4);assert.equal(new Set(c.jobs.map(j=>j.id)).size,4);assert(c.jobs.every(j=>j.start==='2026-05-01'&&j.source.products.length===1));assert.equal(cal.generateCalendar(c,sources,'2026-05-20','later'),0);});
void test('pending-confirmation/non-time sources do not generate',()=>{const c=state();assert.equal(cal.generateCalendar(c,[source({frequency:null})],'2026-05-20','now'),0);});
void test('queue persists and duplicate selection never duplicates jobs',()=>{const c=state();r.executeRoutine(c,command(c,'generate'),[source()],context());const ids=c.jobs.map(j=>j.id),q=command(c,'queue',{jobIds:ids});r.executeRoutine(c,q,[source()],context());r.executeRoutine(c,q,[source()],context());assert.equal(c.jobs.length,2);assert(c.jobs.every(j=>j.calendar.queuedAt));});
void test('ordinary old-period planning rejected; next period independently available',()=>{const c=state();cal.generateCalendar(c,[source()],'2026-06-02','now');const old=c.jobs.find(j=>j.end==='2026-05-31'),next=c.jobs.find(j=>j.start==='2026-06-01');assert.throws(()=>cal.validatePlanDates([old],'2026-06-01','2026-06-02','2026-06-02'),/EXPIRED_PERIOD_NO_NEW_PLAN/);cal.validatePlanDates([next],'2026-06-02','2026-06-30','2026-06-02');assert.throws(()=>cal.validatePlanDates([next],'2026-06-02','2026-07-01','2026-06-02'),/PLAN_DATES_OUTSIDE_PERIOD/);});
void test('multiple plans keep separate items/dates and freeze approved source at creation',()=>{const c=state(),a=source();cal.generateCalendar(c,[a],'2026-05-20','now');const newer=source({versionId:'approved-v2',version:'2',description:'Newly approved'});for(const job of c.jobs){const result=r.executeRoutine(c,command(c,'create-plan',{jobIds:[job.id],startDate:'2026-05-20',endDate:'2026-05-25'}),[newer],context());const d=c.documents.find(d=>d.id===result.documentId);assert.equal(d.flow.working.lines[0].source.versionId,'approved-v2');assert.equal(d.flow.working.planEnd,'2026-05-25');}assert.equal(c.documents.length,2);newer.description='Later mutation';assert(c.documents.every(d=>d.flow.working.lines[0].source.description==='Newly approved'));assert.throws(()=>r.executeRoutine(c,command(c,'create-plan',{jobIds:[c.jobs[0].id],startDate:'2026-05-20',endDate:'2026-05-25'}),[newer],context()),/JOB_ALREADY_ASSIGNED/);});
void test('retest may cross original quarter without ordinary catch-up exemption',()=>{const j={id:'retest',start:'2026-01-01',end:'2026-03-31',planId:null,completion:null,calendar:{retestCaseId:'case'}};cal.validatePlanDates([j],'2026-05-20','2026-05-25','2026-05-20');delete j.calendar.retestCaseId;assert.throws(()=>cal.validatePlanDates([j],'2026-05-20','2026-05-25','2026-05-20'),/EXPIRED/);});
void test('more frequent starts new current period without credit for old frequency',()=>{const c=state();cal.generateCalendar(c,[source({frequency:'quarterly'})],'2026-05-20','old');c.jobs[0].completion={kind:'pass',reportId:'old',at:'old'};cal.generateCalendar(c,[source({frequency:'monthly',effectiveDate:'2026-05-20'})],'2026-05-20','new');assert.equal(c.jobs.filter(j=>j.calendar.frequency==='monthly').length,2);assert(c.jobs.filter(j=>j.calendar.frequency==='monthly').every(j=>!j.completion&&j.start==='2026-05-01'));});
void test('frequency change uses current quarter for unplanned product and waits for committed product',()=>{const c=state();cal.generateCalendar(c,[source()],'2026-05-20','old');c.jobs[0].planId='kept';cal.generateCalendar(c,[source({frequency:'quarterly',effectiveDate:'2026-05-20'})],'2026-06-15','new');assert.equal(c.jobs.filter(j=>j.calendar.frequency==='quarterly').length,1);assert.equal(c.jobs[0].planId,'kept');assert(!c.jobs[0].calendar.stopped);assert(c.jobs[1].calendar.stopped);cal.generateCalendar(c,[source({frequency:'quarterly',effectiveDate:'2026-05-20'})],'2026-07-01','new');assert.equal(c.jobs.filter(j=>j.start==='2026-07-01').length,2);});
void test('disabled source retains expired work and all legacy bytes',()=>{const c=state();cal.generateCalendar(c,[source()],'2026-06-20','now');const legacy={id:'legacy',itemId:'old',start:'2026-01-01',end:'2026-12-31',source:source(),planId:'legacy-plan',completion:null,createdAt:'old',period:'legacy'};c.jobs.push(legacy);const before=JSON.stringify(legacy);cal.generateCalendar(c,[],'2026-06-20','disabled');assert(c.jobs.filter(j=>j.end==='2026-05-31').every(j=>!j.calendar.stopped));assert(c.jobs.filter(j=>j.start==='2026-06-01').every(j=>j.calendar.stopped));assert.equal(JSON.stringify(legacy),before);});
void test('request creation is draft only, no review/skip/official effects',()=>{const c=state();cal.generateCalendar(c,[source()],'2026-05-20','now');const result=r.executeRoutine(c,command(c,'request',{requestKind:'skip',jobIds:c.jobs.map(j=>j.id)}),[source()],context());const d=c.documents.find(d=>d.id===result.documentId);assert.equal(d.requestKind,'skip');assert.equal(d.flow.pendingId,null);assert.equal(d.flow.active.id,null);assert(c.jobs.every(j=>!j.completion&&!j.calendar.requestId));});
void test('new rules are opt-in and normal legacy generation identity remains unchanged',()=>{const c={...r.emptyRoutine(),startDate:'2026-05-01'};r.executeRoutine(c,command(c,'generate'),[source()],context());assert.equal(c.jobs.length,1);assert.equal(c.jobs[0].calendar,undefined);assert.equal(c.jobs[0].source.products.length,2);});
void test('calendar report validation uses three outcomes and conditional photos/reason',()=>{
 const c=state();cal.generateCalendar(c,[source()],'2026-05-20','now');const result=r.executeRoutine(c,command(c,'create-plan',{jobIds:[c.jobs[0].id],startDate:'2026-05-20',endDate:'2026-05-25'}),[source()],context());const plan=c.documents.find(d=>d.id===result.documentId),doc={...plan,kind:'report'},value=copy(plan.flow.working),line=value.lines[0];
 line.results=[{id:'result',samples:['P1'],outcome:'pass',value:'',notes:'',photos:[]}];
 const codes=()=>r.routineDocumentReviewIssues(c,doc,value).map(i=>i.message);
 assert.equal(codes().length,0);line.results[0].outcome='fail';assert(codes().includes('UPLOADED_PHOTO_REQUIRED'));assert(!codes().includes('EXPLANATION_REQUIRED'));line.results[0].photos=['a'.repeat(64)];assert.equal(codes().length,0);line.results[0].outcome='unable';line.results[0].photos=[];assert(codes().includes('EXPLANATION_REQUIRED'));assert(!codes().includes('UPLOADED_PHOTO_REQUIRED'));line.results[0].notes='Synthetic reason';assert.equal(codes().length,0);line.results[0].outcome='undetermined';assert(codes().includes('RESULT_REQUIRED'));
});
void test('calendar disposal requires actual result and next date, without inventing mandatory photos',()=>{
 const value={title:'Synthetic disposal',date:'2026-05-20',lines:[{}],notes:'',reason:'Synthetic reason',disposition:'Synthetic action',dispositionResult:'',nextDate:'',evidence:[]};const doc={kind:'disposal',calendarVersion:2};const issues=r.routineDocumentReviewIssues({cases:[]},doc,value).map(i=>i.message);assert(issues.includes('DISPOSITION_RESULT_REQUIRED'));assert(issues.includes('NEXT_DATE_REQUIRED'));assert(!issues.includes('EVIDENCE_REQUIRED'));value.dispositionResult='Synthetic result';value.nextDate='2026-07-01';assert.equal(r.routineDocumentReviewIssues({cases:[]},doc,value).length,0);
});
void test('source freeze includes native rule, equipment and media without aliases',()=>{
 const c=state(),native={id:'standard',rule:{cadence:'time',timeFrequency:'monthly'},equipmentSnapshot:{id:'synthetic-equipment'},mediaItems:[{src:'synthetic-only'}]},s=source({standardSnapshot:native});cal.generateCalendar(c,[s],'2026-05-20','now');const result=r.executeRoutine(c,command(c,'create-plan',{jobIds:[c.jobs[0].id],startDate:'2026-05-20',endDate:'2026-05-25'}),[s],context());native.rule.timeFrequency='yearly';native.equipmentSnapshot.id='later';const frozen=c.documents.find(d=>d.id===result.documentId).flow.working.lines[0].source.standardSnapshot;assert.equal(frozen.rule.timeFrequency,'monthly');assert.equal(frozen.equipmentSnapshot.id,'synthetic-equipment');
});
void test('cancelled mixed-plan items are excluded from report availability, remaining items retained',()=>{
 const c=state();cal.generateCalendar(c,[source()],'2026-05-20','now');const result=r.executeRoutine(c,command(c,'create-plan',{jobIds:c.jobs.map(j=>j.id),startDate:'2026-05-20',endDate:'2026-05-25'}),[source()],context());const d=c.documents.find(d=>d.id===result.documentId);d.cancelledJobIds=[c.jobs[0].id];const available=r.reportAvailability(c,d);assert.equal(available.length,1);assert.equal(available[0].jobId,c.jobs[1].id);
});
void test('invalid calendar dates rejected instead of silently normalizing',()=>{for(const d of ['2026-02-30','2026-13-01','2026-1-01',''])assert.equal(cal.validCalendarDate(d),false);assert.equal(cal.validCalendarDate('2028-02-29'),true);});
void test('next-date projection maps calendar period, creates missing future periods once and never mutates input',()=>{
 const c=state();cal.generateCalendar(c,[source()],'2026-05-20','now');const before=JSON.stringify(c),origin=c.jobs[0],selection=cal.calendarNextSelection(c,origin,'2026-08-17','later');assert.equal(selection.target.start,'2026-08-01');assert.deepEqual(copy(selection.skipped.map(j=>j.start)),['2026-06-01','2026-07-01']);assert.equal(selection.created.length,3);assert.equal(JSON.stringify(c),before);c.jobs.push(...copy(selection.created));const again=cal.calendarNextSelection(c,origin,'2026-08-30','later');assert.equal(again.created.length,0);assert.equal(again.target.id,selection.target.id);
});
void test('next-date projection preserves already completed periods and refuses to silently skip a plan',()=>{
 const c=state();cal.generateCalendar(c,[source()],'2026-07-20','now');const origin=c.jobs[0],june=c.jobs.find(j=>j.calendar.productCode==='P1'&&j.start==='2026-06-01');june.completion={kind:'pass',reportId:'preserved',at:'earlier'};const selection=cal.calendarNextSelection(c,origin,'2026-08-17','later');assert(!selection.skipped.some(j=>j.id===june.id));june.completion=null;june.planId='existing';assert.throws(()=>cal.calendarNextSelection(c,origin,'2026-08-17','later'),/NEXT_DATE_EXISTING_PLAN_CONFLICT/);
});
void test('delayed entry replays multiple approved source transitions at their original days',()=>{
 const c=state(),history=[{id:'v1',at:'2026-05-01T00:00:00Z',day:'2026-05-01',sources:[source()]},{id:'v2',at:'2026-06-15T00:00:00Z',day:'2026-06-15',sources:[source({frequency:'quarterly',versionId:'v2',effectiveDate:'2026-06-15'})]},{id:'v3',at:'2026-08-05T00:00:00Z',day:'2026-08-05',sources:[]}];
 cal.reconcileCalendar(c,history,'2026-09-20','2026-09-20T00:00:00Z');
 assert(c.jobs.filter(j=>j.start==='2026-05-01').every(j=>!j.calendar.stopped));assert(c.jobs.filter(j=>j.start==='2026-06-01').every(j=>j.calendar.stopped.at==='2026-06-15T00:00:00Z'));
 assert.equal(c.jobs.filter(j=>j.start==='2026-07-01').length,2);assert(c.jobs.filter(j=>j.start==='2026-07-01').every(j=>j.calendar.stopped.at==='2026-08-05T00:00:00Z'));assert(!c.jobs.some(j=>j.start==='2026-08-01'));
 const before=JSON.stringify(c);cal.reconcileCalendar(c,history,'2026-09-20','later');assert.equal(JSON.stringify(c),before);
});
// Pure business projections only: no submit/withdraw/approve command, transport or stored fixture.
function projectedReport(c,id,job,outcome,extra={}){const doc={id,number:id,kind:'report',planId:job.planId,caseId:null,correctionOf:null,calendarVersion:2,owner:actor,createdAt:'2026-05-20T00:00:00Z',...extra};const value={title:id,date:'2026-05-20',notes:'',reason:'Synthetic correction',disposition:'',evidence:[],lines:[{id:'line-'+id,jobId:job.id,source:copy(job.source),results:[{id:'row-'+id,samples:[job.source.products[0].code],outcome,value:'',notes:'Synthetic reason',photos:outcome==='fail'?['a'.repeat(64)]:[]}]}]};c.documents.push(doc);return {doc,value};}
void test('pure report projection: unable is an official abnormal result, never a pass',()=>{const c=state();cal.generateCalendar(c,[source()],'2026-05-20','now');const job=c.jobs[0];job.planId='synthetic-plan';const {doc,value}=projectedReport(c,'synthetic-report',job,'unable');r.applyRoutineDocumentApprovalEffects(c,doc,value,context());assert.equal(job.completion.kind,'unable');assert.equal(c.cases.length,1);assert.equal(c.cases[0].result,'unable');assert.equal(c.cases[0].status,'open');});
void test('pure retest projections keep the original abnormality and passing retest closes it',()=>{const c=state();cal.generateCalendar(c,[source()],'2026-05-20','now');const origin=c.jobs[0];origin.planId='synthetic-plan';let report=projectedReport(c,'original-fail',origin,'fail');r.applyRoutineDocumentApprovalEffects(c,report.doc,report.value,context());const item=c.cases[0],retest={...copy(origin),id:'synthetic-retest',completion:null,calendar:{...copy(origin.calendar),retestCaseId:item.id}};c.jobs.push(retest);item.lineageJobIds=[retest.id];report=projectedReport(c,'retest-fail',retest,'fail');r.applyRoutineDocumentApprovalEffects(c,report.doc,report.value,context());assert.equal(c.cases.length,1);assert.equal(item.reportIds.length,2);report=projectedReport(c,'retest-pass',retest,'pass');r.applyRoutineDocumentApprovalEffects(c,report.doc,report.value,context());assert.equal(item.status,'closed');assert.equal(c.cases.length,1);assert.equal(origin.completion.kind,'fail');});
void test('pure correction projection cancels only unfinished retest line, preserves completed downstream',()=>{const c=state();cal.generateCalendar(c,[source()],'2026-05-20','now');const origin=c.jobs[0];origin.planId='original-plan';const original=projectedReport(c,'original',origin,'fail');r.applyRoutineDocumentApprovalEffects(c,original.doc,original.value,context());const item=c.cases[0],pending={...copy(origin),id:'pending-retest',planId:'mixed',completion:null,calendar:{...copy(origin.calendar),retestCaseId:item.id}},completed={...copy(pending),id:'done-retest',completion:{kind:'pass',reportId:'approved-downstream',at:'earlier'}};c.jobs.push(pending,completed);item.lineageJobIds=[pending.id,completed.id];c.documents.push({id:'mixed',kind:'plan'},{id:'mixed-report',kind:'report',planId:'mixed'});const before=JSON.stringify(completed),correction=projectedReport(c,'correction',origin,'pass',{correctionOf:'original'});r.applyRoutineDocumentApprovalEffects(c,correction.doc,correction.value,context());assert.equal(item.status,'closed');assert.equal(pending.calendar.stopped.reason,'origin-report-corrected');assert.deepEqual(copy(c.documents.find(d=>d.id==='mixed').cancelledJobIds),['pending-retest']);assert.deepEqual(copy(c.documents.find(d=>d.id==='mixed-report').cancelledJobIds),['pending-retest']);assert.equal(JSON.stringify(completed),before);assert(correction.doc.impact.some(i=>i.id==='approved-downstream'));});

void test('next date reuses committed legacy period instead of creating a duplicate',()=>{const c=state();cal.generateCalendar(c,[source()],'2026-05-20','now');const origin=c.jobs[0],legacy={...copy(origin),id:'legacy-period',start:'2026-08-01',end:'2026-08-31',period:'monthly:2026-08-01',calendar:undefined,planId:'existing-legacy-plan'};c.jobs.push(legacy);const selection=cal.calendarNextSelection(c,origin,'2026-08-17','later');assert.equal(selection.target.id,legacy.id);assert(!selection.created.some(j=>j.start==='2026-08-01'));assert.throws(()=>cal.calendarNextSelection(c,origin,'2026-09-17','later'),/NEXT_DATE_EXISTING_PLAN_CONFLICT/);});
void test('adapted legacy plan dates remain explicitly unrecorded while all newly created plans require dates',()=>{const value={title:'old',lines:[{}]},old={kind:'plan',calendarVersion:2,calendarLegacy:{adoptedAt:'now',unrecordedPlanDates:true}},modern={kind:'plan',calendarVersion:2};assert(!r.routineDocumentReviewIssues({cases:[]},old,value).some(x=>x.message==='PLAN_DATES_REQUIRED'));assert(r.routineDocumentReviewIssues({cases:[]},modern,value).some(x=>x.message==='PLAN_DATES_REQUIRED'));});
void test('single-product legacy abnormality maps next period without changing its legacy job identity',()=>{const c=state();cal.generateCalendar(c,[source()],'2026-05-20','now');const origin={...copy(c.jobs[0]),id:'legacy-origin',calendar:undefined};const before=JSON.stringify(origin);const selection=cal.calendarNextSelection(c,origin,'2026-08-17','later');assert.equal(selection.target.start,'2026-08-01');assert.equal(JSON.stringify(origin),before);});
void test('approved retest waiting job creates identifiable plan without another abnormality or changing frozen source',()=>{const c=state();cal.generateCalendar(c,[source()],'2026-05-20','now');const j=c.jobs[0];j.calendar.retestCaseId='existing-case';j.calendar.originJobId='original-job';j.calendar.queuedAt='2026-05-20';c.cases=[{id:'existing-case',status:'retest',reportIds:['original-report']}];const before=copy(c.cases),frozen=copy(j.source);const result=r.executeRoutine(c,command(c,'create-plan',{jobIds:[j.id],startDate:'2026-05-20',endDate:'2026-05-21'}),[],context());const d=c.documents.find(x=>x.id===result.documentId);assert.match(d.number,/^FQC-RPL-/);assert.equal(d.kind,'plan');assert.equal(d.requestKind,undefined);assert.equal(d.flow.active.id,null);assert.deepEqual(copy(c.cases),before);assert.deepEqual(copy(d.flow.working.lines[0].source),frozen);assert.equal(j.calendar.retestCaseId,'existing-case');});

// Isolated in-memory projections are NOT actual review or live-data acceptance.
void test('retest request and plan approval are separate; approved plan produces editable durable report once',()=>{
 const c=state();cal.generateCalendar(c,[source()],'2026-05-20','now');const origin=c.jobs[0];origin.planId='origin-plan';
 const original=projectedReport(c,'original-failure',origin,'fail');r.applyRoutineDocumentApprovalEffects(c,original.doc,original.value,context());
 const item=c.cases[0];original.doc.flow=load('lib/shared-draft.ts').createSharedDraft('routine-fqc:'+original.doc.id,original.value,'approved-origin','retained-origin');
 const reqResult=r.executeRoutine(c,command(c,'request',{requestKind:'retest',caseId:item.id}),[],context());const req=c.documents.find(d=>d.id===reqResult.documentId);
 const attempt=d=>r.executeRoutine(c,command(c,'create-report',{documentId:d.id}),[],context());
 assert.throws(()=>attempt(req),/APPROVED_PLAN_REQUIRED/);assert.equal(c.jobs.filter(j=>j.calendar.retestCaseId).length,0);
 req.flow.working.reason='Synthetic retest';r.applyRoutineDocumentApprovalEffects(c,req,req.flow.working,context());req.flow.active={id:'synthetic-request-approval',content:copy(req.flow.working)};
 assert.throws(()=>attempt(req),/APPROVED_PLAN_REQUIRED/);const job=c.jobs.find(j=>j.calendar.retestCaseId);assert(job);assert.equal(c.documents.filter(d=>d.kind==='report'&&d.id!==original.doc.id).length,0);
 const createPlan=command(c,'create-plan',{jobIds:[job.id],startDate:'2026-05-20',endDate:'2026-05-25'});
 const p=r.executeRoutine(c,createPlan,[],context()),plan=c.documents.find(d=>d.id===p.documentId);
 assert.equal(r.executeRoutine(c,createPlan,[],context()).documentId,p.documentId);
 assert.equal(c.documents.filter(d=>d.kind==='plan'&&!d.requestKind&&d.flow.working.lines.some(l=>l.jobId===job.id)).length,1);
 assert.throws(()=>r.executeRoutine(c,command(c,'create-plan',{jobIds:[job.id],startDate:'2026-05-20',endDate:'2026-05-25'}),[],context()),/JOB_NOT_ARRANGEABLE|JOB_ALREADY_ASSIGNED/);
 assert.equal(copy(c).jobs.filter(j=>j.id==='retest:'+req.id).length,1);
 assert.throws(()=>attempt(plan),/APPROVED_PLAN_REQUIRED/);
 plan.flow.active={id:'synthetic-plan-approval',content:copy(plan.flow.working)};r.applyRoutineDocumentApprovalEffects(c,plan,plan.flow.active.content,context());
 const create=command(c,'create-report',{documentId:plan.id}),result=r.executeRoutine(c,create,[],context());assert.equal(r.executeRoutine(c,create,[],context()).documentId,result.documentId);
 let report=c.documents.find(d=>d.id===result.documentId);assert.match(report.number,/^FQC-RTS-/);assert.equal(r.docStatus(report),'draft');assert.equal(report.planId,plan.id);assert.equal(report.flow.working.lines[0].jobId,job.id);assert.equal(c.cases.length,1);assert.throws(()=>attempt(plan),/REPORT_ALREADY_EXISTS/);
 const value=copy(report.flow.working);Object.assign(value.lines[0].results[0],{
  outcome:'abnormal',samples:[],notes:'Synthetic instrument unavailable',
 });
 const path=['lines',{id:value.lines[0].id},'results'],cmd=command(c,'draft',{documentId:report.id});cmd.command={action:'save',moduleAction:'save-local-v1',operationId:cmd.operationId,clientId:'synthetic-client',sequence:1,generation:report.flow.generation,expectedRevision:report.flow.revision,patches:[{op:'set',path,value:value.lines[0].results}],guards:[{path,value:copy(report.flow.working.lines[0].results)}]};r.executeRoutine(c,cmd,[],context());
 const restored=copy(c);report=restored.documents.find(d=>d.id===result.documentId);assert.equal(report.flow.saved.content.lines[0].results[0].notes,'Synthetic instrument unavailable');assert.equal(r.docStatus(report),'draft');assert.equal(r.routineDocumentReviewIssues(restored,report,report.flow.saved.content).length,0);assert.equal(restored.cases.length,1);assert.equal(restored.jobs.find(j=>j.id===job.id).calendar.retestCaseId,item.id);
 assert.equal(report.flow.saved.content.lines[0].results[0].outcome,'abnormal');
});

void test('skip request cannot bypass an unresolved abnormality or retest job; original state remains intact',()=>{for(const mode of ['case','retest']){const c=state();cal.generateCalendar(c,[source()],'2026-05-20','now');const j=c.jobs[0];if(mode==='case')c.cases.push({id:'case',jobId:j.id,status:'open'});else j.calendar.retestCaseId='case';const before=JSON.stringify(c);assert.throws(()=>r.executeRoutine(c,command(c,'request',{requestKind:'skip',jobIds:[j.id]}),[source()],context()),/JOB_ALREADY_ASSIGNED/);assert.equal(JSON.stringify(c),before);}});

void test('an already retained legacy waiver preserves failed evidence when its closure is projected',()=>{
 const c=state();cal.generateCalendar(c,[source()],'2026-06-20','now');const j=c.jobs[0];j.planId='original-plan';
 const original=projectedReport(c,'original-failure',j,'fail');r.applyRoutineDocumentApprovalEffects(c,original.doc,original.value,context());
 original.doc.flow={active:{id:'synthetic-approved',content:copy(original.value)}};
 const item=c.cases[0],evidence=JSON.stringify(original),completion=copy(j.completion);
 const d=retainedWaiver(c,item),value=d.flow.working;
 assert.equal(item.status,'open');assert.equal(item.result,'fail');assert.deepEqual(copy(j.completion),completion);assert.equal(d.flow.pendingId,null);
 assert(r.routineDocumentReviewIssues(c,d,value).some(i=>i.message==='REASON_REQUIRED'));
 value.reason='Synthetic machine unavailable';value.nextDate='2026-06-20';
 assert.equal(r.routineDocumentReviewIssues(c,d,value).length,0);
 const target=c.jobs.find(x=>x.start==='2026-06-01'&&x.calendar.productCode===j.calendar.productCode);
 d.nextWork={targetId:target.id,skipIds:[],sourceVersionId:target.source.versionId};
 r.applyRoutineDocumentApprovalEffects(c,d,value,context());
 assert.equal(item.status,'waived');assert.equal(item.result,'fail');assert.equal(j.completion.kind,'waiver');
 assert.equal(JSON.stringify(original),evidence);assert.equal(item.events.at(-1).documentId,d.id);assert.equal(item.events.at(-1).reason,value.reason);
});

// Earlier retained records are constructed as fixtures since new applications are now refused.
function retainedWaiver(c,item){
 const built=r.buildRoutineDocumentDraft(c,'waiver',[c.jobs.find(job=>job.id===item.jobId)],context(),{caseId:item.id});
 const flow=load('lib/shared-draft.ts').createSharedDraft('routine-fqc:'+built.metadata.id,built.content,null,'legacy-fixture');
 const doc={...built.metadata,calendarVersion:2,flow,waiverRetests:r.waiverRetestSnapshot(c,item.id)};
 c.documents.push(doc);
 return doc;
}

function conversionFixture(){
 const c=state();cal.generateCalendar(c,[source()],'2026-06-20','now');const origin=c.jobs[0];origin.planId='original';const original=projectedReport(c,'original-failure',origin,'fail');r.applyRoutineDocumentApprovalEffects(c,original.doc,original.value,context());original.doc.flow={active:{id:'approved-original',content:copy(original.value)},revision:1};
 const item=c.cases[0],job={...copy(origin),id:'retest-job',planId:null,completion:null,calendar:{...copy(origin.calendar),retestCaseId:item.id,originJobId:origin.id}};c.jobs.push(job);item.status='retest';item.lineageJobIds=[job.id];
 return {c,origin,item,job,original};
}
void test('initial and retest cannot share a newly created plan; direct initial planning needs no queue',()=>{
 const {c,job}=conversionFixture(),regular=c.jobs.find(j=>!j.planId&&!j.calendar.retestCaseId&&j.start==='2026-05-01');const before=JSON.stringify(c);
 assert.throws(()=>r.executeRoutine(c,command(c,'create-plan',{jobIds:[regular.id,job.id],startDate:'2026-05-20',endDate:'2026-05-25'}),[source()],context()),/MIXED_INITIAL_RETEST_PLAN/);assert.equal(JSON.stringify(c),before);
 const result=r.executeRoutine(c,command(c,'create-plan',{jobIds:[regular.id],startDate:'2026-05-20',endDate:'2026-05-25'}),[source()],context());assert(result.documentId);assert.equal(regular.calendar.queuedAt,undefined);
});
void test('retained waiver keeps approved retest waiting before approval; pins survive reload',()=>{
 const {c,item,job,origin,original}=conversionFixture(),evidence=JSON.stringify(original);
 const d=retainedWaiver(c,item);
 assert.deepEqual(copy(d.waiverRetests.jobIds),[job.id]);assert(!job.calendar.stopped);assert.equal(item.status,'retest');
 const restored=copy(c);r.validateWaiverRetests(restored,restored.documents.find(x=>x.id===d.id));
 const value=d.flow.working;value.reason='Synthetic broken machine';value.nextDate='2026-06-20';d.nextWork={targetId:c.jobs.find(j=>j.start==='2026-06-01'&&j.calendar.productCode===origin.calendar.productCode).id,skipIds:[],sourceVersionId:'approved-v1'};
 r.applyRoutineDocumentApprovalEffects(c,d,value,context());assert.equal(item.status,'waived');assert.equal(item.result,'fail');assert.equal(job.calendar.stopped.reason,'approved-waiver:'+d.id);assert.equal(JSON.stringify(original),evidence);
});
void test('conversion snapshot detects intervening plans; pending conversion blocks mutations and return unlocks',()=>{
 const {c,item,job}=conversionFixture();const d=retainedWaiver(c,item);
 d.flow.pendingId='synthetic-pending';const before=JSON.stringify(c);assert.throws(()=>r.executeRoutine(c,command(c,'create-plan',{jobIds:[job.id],startDate:'2026-05-20',endDate:'2026-05-25'}),[],context()),/WAIVER_CONVERSION_PENDING/);assert.equal(JSON.stringify(c),before);
 d.flow.pendingId=null;r.executeRoutine(c,command(c,'create-plan',{jobIds:[job.id],startDate:'2026-05-20',endDate:'2026-05-25'}),[],context());assert.throws(()=>r.validateWaiverRetests(c,d),/WAIVER_RETEST_CHANGED/);
});
void test('waiver conversion preserves mixed legacy plan and report evidence and other work',()=>{
 const {c,item,job,origin}=conversionFixture();const made=r.executeRoutine(c,command(c,'create-plan',{jobIds:[job.id],startDate:'2026-05-20',endDate:'2026-05-25'}),[],context()),plan=c.documents.find(d=>d.id===made.documentId);
 const other=c.jobs.find(j=>j.id!==origin.id&&!j.planId&&!j.calendar.retestCaseId);other.planId=plan.id;plan.flow.working.lines.push({...copy(plan.flow.working.lines[0]),id:'unrelated-line',jobId:other.id,source:copy(other.source)});plan.flow.active={id:'synthetic-approved',content:copy(plan.flow.working)};
 const report={...copy(plan),id:'mixed-report',kind:'report',planId:plan.id};report.flow.active={id:null};report.flow.working.lines[0].results=[{id:'old-row',samples:['P1'],outcome:'fail',value:'bad',notes:'Preserve me',photos:['a'.repeat(64)]}];c.documents.push(report);const evidence=JSON.stringify(report.flow),unrelated=JSON.stringify(other);
 const d=retainedWaiver(c,item);r.validateWaiverRetests(c,d);
 d.flow.working.reason='Synthetic';d.nextWork={targetId:c.jobs.find(j=>j.start==='2026-06-01'&&j.calendar.productCode===origin.calendar.productCode).id,skipIds:[],sourceVersionId:'approved-v1'};r.applyRoutineDocumentApprovalEffects(c,d,d.flow.working,context());
 assert(!plan.cancelled);assert(!report.cancelled);assert.deepEqual(copy(report.cancelledJobIds),[job.id]);assert.equal(JSON.stringify(report.flow),evidence);assert.equal(JSON.stringify(other),unrelated);
 const edit=copy(report.flow.working);edit.lines[0].results[0].notes='tamper';assert.throws(()=>r.validateRoutineContentEdit(c,report,edit,report.flow.working),/STOPPED_ITEM_READ_ONLY/);
});
void test('pending or approved retest report is never silently cancelled by conversion',()=>{
 for(const phase of ['pending','approved']){const {c,item,job}=conversionFixture();const made=r.executeRoutine(c,command(c,'create-plan',{jobIds:[job.id],startDate:'2026-05-20',endDate:'2026-05-25'}),[],context()),plan=c.documents.find(d=>d.id===made.documentId);const report={...copy(plan),id:'retest-report',kind:'report',planId:plan.id};if(phase==='pending')report.flow.pendingId='pending';else report.flow.active={id:'approved',content:copy(report.flow.working)};c.documents.push(report);const before=JSON.stringify(c);assert.throws(()=>r.waiverRetestSnapshot(c,item.id),phase==='pending'?/WITHDRAW_RETEST_REVIEW_BEFORE_WAIVER/:/APPROVED_RETEST_CHANGED/);assert.throws(()=>r.executeRoutine(c,command(c,'request',{requestKind:'waiver',caseId:item.id}),[],context()),/FOLLOWUP_KIND_UNAVAILABLE/);assert.equal(JSON.stringify(c),before);}
});


void test('one approved report routes each line independently and only unable permits new disposal',()=>{
 const c=state();cal.generateCalendar(c,[source({products:['P1','P2','P3'].map(code=>({code,name:code}))})],'2026-05-20','now');
 const [passed,failed,unable]=c.jobs;
 for(const job of c.jobs)job.planId='one-plan';
 const initial=projectedReport(c,'one-mixed-report',passed,'pass');
 for(const [job,outcome] of [[failed,'fail'],[unable,'unable']]){
  const sample=projectedReport(c,'temporary-'+outcome,job,outcome);
  c.documents.pop();
  initial.value.lines.push(sample.value.lines[0]);
 }
 initial.doc.flow={active:{id:null,content:{lines:[]}},cases:[]};
 assert.equal(c.cases.length,0);
 assert(c.jobs.every(job=>!job.completion));
 initial.doc.flow.active={id:'synthetic-mixed-approval',content:copy(initial.value)};
 r.applyRoutineDocumentApprovalEffects(c,initial.doc,initial.value,context());
 assert.deepEqual(Array.from(c.jobs,job=>job.completion.kind),['pass','fail','unable']);
 const failedCase=c.cases.find(item=>item.jobId===failed.id);
 const unableCase=c.cases.find(item=>item.jobId===unable.id);
 assert.equal(r.routineCaseOutcome(c,failedCase),'fail');
 assert.equal(r.routineCaseOutcome(c,unableCase),'unable');
 const immutable=JSON.stringify(initial.doc);
 const request=(item,requestKind,ctx=context())=>r.executeRoutine(c,command(c,'request',{caseId:item.id,requestKind}),[],ctx);
 for(const kind of ['disposal','waiver'])assert.throws(()=>request(failedCase,kind),/FOLLOWUP_KIND_UNAVAILABLE/);
 assert.throws(()=>request(unableCase,'waiver'),/FOLLOWUP_KIND_UNAVAILABLE/);
 assert.throws(()=>request(unableCase,'disposal',{...context(),allowed:p=>p==='view'}),/FORBIDDEN/);
 const oldDraft=retainedWaiver(c,failedCase);
 assert(request(failedCase,'retest').documentId);
 assert.equal(oldDraft.flow.active.id,null);
 const result=request(unableCase,'disposal');
 const doc=c.documents.find(d=>d.id===result.documentId);
 assert.equal(doc.disposalPolicy,'skip-period');
 assert.equal(unable.completion.kind,'unable');
 assert.equal(unableCase.status,'open');
 assert.throws(()=>request(unableCase,'retest'),/FOLLOWUP_OPEN/);
 const value=doc.flow.working;
 assert.deepEqual(Array.from(r.routineDocumentReviewIssues(c,doc,value),i=>i.message).sort((a,b)=>a.localeCompare(b)),['DISPOSITION_REQUIRED','REASON_REQUIRED']);
 value.reason='Equipment unavailable';value.disposition='Power connection failed';
 assert.equal(r.routineDocumentReviewIssues(c,doc,value).length,0);
 r.applyRoutineDocumentApprovalEffects(c,doc,value,context());
 assert.equal(unable.completion.kind,'skip');
 assert.equal(unableCase.status,'disposed');
 assert.equal(unableCase.result,'unable');
 assert.equal(r.routineCaseOutcome(c,unableCase),'unable');
 assert(!doc.nextWork);
 assert.equal(JSON.stringify(initial.doc),immutable);
 assert.equal(failed.completion.kind,'fail');
 assert.equal(passed.completion.kind,'pass');
});

void test('ambiguous approved legacy item retains evidence without granting new follow-up',()=>{
 const c=state();cal.generateCalendar(c,[source()],'2026-05-20','now');
 const job=c.jobs[0];job.planId='legacy-plan';
 const initial=projectedReport(c,'legacy-mixed-outcome',job,'fail');
 initial.value.lines[0].results.push({...copy(initial.value.lines[0].results[0]),id:'other-sample',outcome:'unable'});
 initial.doc.flow={active:{id:'legacy-approval',content:copy(initial.value)},cases:[]};
 r.applyRoutineDocumentApprovalEffects(c,initial.doc,initial.value,context());
 const item=c.cases[0], before=JSON.stringify(c);
 assert.equal(r.routineCaseOutcome(c,item),null);
 assert.throws(()=>r.executeRoutine(c,command(c,'request',{caseId:item.id,requestKind:'disposal'}),[],context()),/FOLLOWUP_APPROVED_RESULT_REQUIRED/);
 assert.equal(JSON.stringify(c),before);
});

void test('unapproved report contents never reroute an open case; subsequent approved pass closes same lineage',()=>{
 const {c,item,job,original}=conversionFixture();
 const report=projectedReport(c,'retest-1',job,'unable');
 report.doc.flow={active:{id:null,content:{lines:[]}},pendingId:'review',cases:[{status:'pending',content:copy(report.value)}]};
 assert.equal(r.routineCaseOutcome(c,item),'fail');
 report.doc.flow.pendingId=null;report.doc.flow.cases[0].status='returned';
 assert.equal(r.routineCaseOutcome(c,item),'fail');
 report.value.lines[0].results[0].outcome='fail';
 report.doc.flow.active={id:'approved-retest1',content:copy(report.value)};
 r.applyRoutineDocumentApprovalEffects(c,report.doc,report.value,context('2026-06-21'));
 assert.equal(r.routineCaseOutcome(c,item),'fail');
 const second={...copy(job),id:'repeat-2',completion:null};c.jobs.push(second);item.lineageJobIds.push(second.id);
 const last=projectedReport(c,'retest-2',second,'pass');
 last.doc.flow={active:{id:'approved-retest2',content:copy(last.value)},cases:[]};
 r.applyRoutineDocumentApprovalEffects(c,last.doc,last.value,context('2026-06-22'));
 assert.equal(r.routineCaseOutcome(c,item),'pass');
 assert.equal(c.cases.length,1);
 assert.equal(item.status,'closed');
 assert.deepEqual(Array.from(item.reportIds),[original.doc.id,report.doc.id,last.doc.id]);
});

void test('pending current exemption locks plan creation; returned or withdrawn fixture unlocks',()=>{
 const c=state();cal.generateCalendar(c,[source()],'2026-05-20','now');
 const [job]=c.jobs;const all=[source()];
 const req=()=>r.executeRoutine(c,command(c,'request',{requestKind:'skip',jobIds:[job.id]}),all,context());
 const create=()=>r.executeRoutine(c,command(c,'create-plan',{jobIds:[job.id],startDate:'2026-05-20',endDate:'2026-05-21'}),all,context());
 const result=req();
 const request=c.documents.find(d=>d.id===result.documentId);
 Object.assign(request.flow.working,{reason:'Synthetic downtime'});
 // These are in-memory snapshots of each phase, not hosted review calls.
 request.flow.pendingId='waiting';job.calendar.requestId=request.id;
 assert.throws(create,/JOB_NOT_ARRANGEABLE/);
 request.flow.pendingId=null;delete job.calendar.requestId;
 assert(req().documentId);
 assert(create().documentId);
 assert.equal(job.completion,null);
});


void test('approved retest report disposition closes only its own origin; history and preapproval state survive',()=>{
 const {c,item,origin,job,original}=conversionFixture();
 const other=c.jobs.find(j=>j.id!==origin.id&&j.id!==job.id&&!j.planId);
 other.planId='retest-plan';
 const disposed=projectedReport(c,'retained-disposal-report',job,'dispose');
 const unrelated=projectedReport(c,'unrelated-snapshot',other,'pass');
 c.documents.pop();
 disposed.value.lines.push(unrelated.value.lines[0]);
 const row=disposed.value.lines[0].results[0];
 row.samples=[];
 const working=load('lib/shared-draft.ts').createSharedDraft('routine-fqc:'+disposed.doc.id,disposed.value,null,'disposal-fixture');
 disposed.doc.flow=working;
 const originalBytes=JSON.stringify(original);
 const previous=JSON.stringify({job,origin,item,original});
 const missing=Array.from(r.routineDocumentReviewIssues(c,disposed.doc,disposed.value),issue=>issue.message);
 assert(missing.includes('DISPOSAL_REASON_REQUIRED'));
 const draft=copy(disposed.value);
 draft.lines[0].results[0].notes='';
 assert(r.routineDocumentReviewIssues(c,disposed.doc,draft).some(i=>i.message==='DISPOSAL_PROBLEM_REQUIRED'));
 row.disposalReason='Machine failed again';
 assert.equal(r.routineDocumentReviewIssues(c,disposed.doc,disposed.value).length,0);
 assert.equal(JSON.stringify({job,origin,item,original}),previous);
 const nowOld=copy(disposed.value),legacy=copy(disposed.value);
 const rOld=legacy.lines[0].results[0];rOld.outcome='unable';
 assert.throws(()=>r.validateRoutineContentEdit(c,disposed.doc,legacy,nowOld),/LEGACY_UNABLE_KEEP_EXISTING/);
 r.validateRoutineContentEdit(c,disposed.doc,legacy,legacy);
 assert.equal(JSON.stringify(original),originalBytes);
 disposed.doc.flow.active={id:'disposal-approved-fixture',content:copy(disposed.value)};
 r.applyRoutineDocumentApprovalEffects(c,disposed.doc,disposed.value,context('2026-06-23'));
 assert.equal(c.cases.length,1);
 assert.equal(item.status,'disposed');
 assert.equal(item.result,'dispose');
 assert.equal(origin.completion.kind,'skip');
 assert.equal(job.completion.kind,'skip');
 assert.equal(other.completion.kind,'pass');
 assert.equal(r.routineCaseOutcome(c,item),'dispose');
 assert.equal(item.events.at(-1).documentId,disposed.doc.id);
 assert.equal(item.events.at(-1).reason,row.disposalReason);
 assert.equal(original.doc.flow.active.content.lines[0].results[0].outcome,'fail');
 const correct=copy(disposed.value);
 correct.lines[0].results[0].outcome='pass';
 assert.throws(()=>r.validateRoutineContentEdit(c,{...disposed.doc,correctionOf:'old'},correct,disposed.value),/DISPOSAL_CORRECTION_RULE_REQUIRED/);
});
void test('expired unplanned work stays immutable while every cadence opens the next period independently',()=>{
 for(const frequency of ['weekly','monthly','quarterly','semiannual','yearly']){
  const c=state(),s=source({frequency});cal.generateCalendar(c,[s],'2026-05-20','baseline');const old=c.jobs[0],before=JSON.stringify(old),boundary=r.nextDate(old.end);
  assert(cal.calendarCanArrange(old,old.end));assert(!cal.calendarCanArrange(old,boundary));
  cal.generateCalendar(c,[s],boundary,'next-period');const next=c.jobs.find(j=>j.calendar.productCode===old.calendar.productCode&&j.start===boundary);assert(next);assert(cal.calendarCanArrange(next,boundary));
  assert.throws(()=>cal.validatePlanDates([old],boundary,boundary,boundary),/EXPIRED_PERIOD_NO_NEW_PLAN/);
  r.executeRoutine(c,command(c,'create-plan',{jobIds:[next.id],startDate:boundary,endDate:next.end}),[s],context(boundary));assert(next.planId||c.jobs.find(j=>j.id===next.id).planId);assert.equal(JSON.stringify(c.jobs.find(j=>j.id===old.id)),before);assert.equal(old.completion,null);
  const count=c.jobs.length;assert.equal(cal.generateCalendar(c,[s],boundary,'repeat'),0);assert.equal(c.jobs.length,count);
 }
});
void test('expired draft returned and withdrawn plans reject all edits and resubmission without losing history',()=>{
 for(const mode of ['draft','saved','returned','withdrawn']){
  const c=state(),s=source();cal.generateCalendar(c,[s],'2026-05-20','baseline');const j=c.jobs[0];const created=r.executeRoutine(c,command(c,'create-plan',{jobIds:[j.id],startDate:'2026-05-20',endDate:'2026-05-31'}),[s],context());const d=c.documents.find(d=>d.id===created.documentId);
  d.flow.saved={id:'saved-fixture',content:copy(d.flow.working),at:'2026-05-31T08:00:00Z',actor};d.flow.saves=[copy(d.flow.saved)];if(['returned','withdrawn'].includes(mode))d.flow.cases.push({id:'past-submission',status:mode,at:'2026-05-31T08:00:00Z',content:copy(d.flow.working),actor});
  assert(!r.routinePlanExpired(c,d,'2026-05-31'));assert(r.routinePlanExpired(c,d,'2026-06-01'));const before=JSON.stringify(c);
  for(const action of ['apply','save','submit'])assert.throws(()=>r.executeRoutine(c,command(c,'draft',{documentId:d.id,command:{action}}),[s],context('2026-06-01')),/EXPIRED_PLAN_READ_ONLY/);
  for(const action of ['discard-draft','delete-plan','restore-document'])assert.throws(()=>r.executeRoutine(c,command(c,action,{documentId:d.id}),[s],context('2026-06-01')),/EXPIRED_PLAN_READ_ONLY/);
  assert.equal(JSON.stringify(c),before);cal.generateCalendar(c,[s],'2026-06-01','next');const next=c.jobs.find(v=>v.start==='2026-06-01'&&v.calendar.productCode===j.calendar.productCode);r.executeRoutine(c,command(c,'create-plan',{jobIds:[next.id],startDate:next.start,endDate:next.end}),[s],context('2026-06-01'));assert.equal(JSON.stringify(c.documents.find(v=>v.id===d.id)),JSON.stringify(JSON.parse(before).documents.find(v=>v.id===d.id)));
  d.flow.pendingId='pending';assert(!r.routinePlanExpired(c,d,'2026-06-01'));d.flow.pendingId=null;d.flow.active.id='approved';assert(!r.routinePlanExpired(c,d,'2026-06-01'));
 }
});
void test('same-period reenable reuses uncommitted work and retains stopped history',()=>{
 for(const frequency of ['weekly','monthly','quarterly','semiannual','yearly']){const c=state(),src=source({frequency});cal.generateCalendar(c,[src],'2026-05-20','initial');const ids=c.jobs.map(j=>j.id);cal.generateCalendar(c,[],'2026-05-20','disabled');assert(c.jobs.filter(j=>j.end>='2026-05-20').every(j=>j.calendar.stopped));cal.generateCalendar(c,[src],'2026-05-20','reenabled');assert.deepEqual(c.jobs.map(j=>j.id),ids);assert(c.jobs.filter(j=>j.end>='2026-05-20').every(j=>cal.calendarCanArrange(j,'2026-05-20')));assert(c.jobs.filter(j=>j.end>='2026-05-20').every(j=>j.calendar.resumeHistory[0].stopped.at==='disabled'));const stable=JSON.stringify(c);cal.generateCalendar(c,[src],'2026-05-20','again');assert.equal(JSON.stringify(c),stable);const activeId=c.jobs.find(j=>j.end>='2026-05-20').id;const result=r.executeRoutine(c,command(c,'create-plan',{jobIds:[activeId],startDate:'2026-05-20',endDate:'2026-05-20'}),[src],context());assert(result.documentId);assert.throws(()=>r.executeRoutine(c,command(c,'create-plan',{jobIds:[activeId],startDate:'2026-05-20',endDate:'2026-05-20'}),[src],context()),/JOB_ALREADY_ASSIGNED/);}
});
void test('reenable never revives expired committed retest or request stops',()=>{
 for(const guard of ['expired','plan','completion','request','retest']){const c=state(),src=source();cal.generateCalendar(c,[src],'2026-05-20','initial');cal.generateCalendar(c,[],'2026-05-20','disabled');const j=c.jobs[0];if(guard==='plan')j.planId='retained';if(guard==='completion')j.completion={kind:'pass'};if(guard==='request')j.calendar.requestId='pending-request';if(guard==='retest')j.calendar.retestCaseId='retained-case';if(guard==='frequency')j.calendar.stopped.reason='frequency-changed';const before=JSON.stringify(j),day=guard==='expired'?'2026-06-02':'2026-05-20';cal.generateCalendar(c,[{...src,effectiveDate:day}],day,'reenabled');assert.equal(JSON.stringify(j),before);assert(!cal.calendarCanArrange(j,day));if(guard==='expired')assert(c.jobs.some(x=>x.start==='2026-06-01'&&cal.calendarCanArrange(x,day)));}
});

void test('all frequency pairs preserve committed periods and start first complete nonoverlapping period',()=>{
 const frequencies=['weekly','monthly','quarterly','semiannual','yearly'];let cases=0;
 for(const from of frequencies)for(const to of frequencies)if(from!==to)for(const day of ['2026-11-18','2026-11-30','2026-12-31','2028-02-29'])for(const status of ['none','draft','pending','approved']){
  const c=state();c.startDate=day;c.calendarPolicy.adoptedAt=day+'T00:00:00Z';const old=source({frequency:from,effectiveDate:day,products:[{code:'P1'}]});cal.generateCalendar(c,[old],day,'initial');const j=c.jobs[0];
  if(status!=='none'){const result=r.executeRoutine(c,command(c,'create-plan',{jobIds:[j.id],startDate:day,endDate:day}),[old],context(day));const d=c.documents.find(d=>d.id===result.documentId);if(status==='pending')d.flow.pendingId='synthetic-pending';if(status==='approved')d.flow.active={id:'synthetic-approved',content:copy(d.flow.working)};}
  const preserved=JSON.stringify({documents:c.documents,cases:c.cases}),oldJob=JSON.stringify(j);const next=source({frequency:to,effectiveDate:day,versionId:'new-approved',products:[{code:'P1'}]});cal.generateCalendar(c,[next],day,'changed');let expected=r.periodAt(day,to).start;
  if(status!=='none'){const after=r.nextDate(j.end),p=r.periodAt(after,to);expected=p.start===after?after:r.nextDate(p.end);assert.equal(JSON.stringify(j),oldJob);assert(!c.jobs.some(x=>x!==j&&x.start<=j.end));}
  assert.equal(c.calendarPolicy.scopes[cal.calendarScope(next,'P1')].from,expected);cal.generateCalendar(c,[next],expected,'first-new-period');const added=c.jobs.find(x=>x.calendar.frequency===to&&x.start===expected);assert(added);assert.equal(JSON.stringify({documents:c.documents,cases:c.cases}),preserved);const bytes=JSON.stringify(c);cal.generateCalendar(c,[next],expected,'repeat');assert.equal(JSON.stringify(c),bytes);assert.equal(new Set(c.jobs.map(x=>x.id)).size,c.jobs.length);cases++;
 }
 assert.equal(cases,320);
});
void test('unplanned frequency reversal restores one current row with stop evidence',()=>{const c=state(),a=source(),b=source({frequency:'quarterly',effectiveDate:'2026-05-20'});cal.generateCalendar(c,[a],'2026-05-20','first');const id=c.jobs[0].id;cal.generateCalendar(c,[b],'2026-05-20','second');cal.generateCalendar(c,[{...a,effectiveDate:'2026-05-20'}],'2026-05-20','third');const job=c.jobs.find(j=>j.id===id);assert(cal.calendarCanArrange(job,'2026-05-20'));assert.equal(job.calendar.resumeHistory[0].stopped.reason,'frequency-changed');assert.equal(c.jobs.filter(j=>j.id===id).length,1);});
