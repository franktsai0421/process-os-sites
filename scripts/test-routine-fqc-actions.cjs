/* oxlint-disable typescript/no-require-imports -- Isolated CommonJS production-kernel harness. */
/* No HTTP, services, business DB or browser storage writes. */
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),{webcrypto}=require('node:crypto');
const load=require('./ipqc-ab-import-harness.cjs')(),m=load('lib/routine-fqc.ts');
const copy=x=>structuredClone(x),id=()=>webcrypto.randomUUID(),actor={id:'fixture',name:'Fixture',admin:true};
let control=m.emptyRoutine(),tick=0,seq=0,lang='zh-TW'; const requests=[];
const source={id:'fixture',name:'Fixture check',line:'A',category:'Fixture',code:'TEST',errorCode:'TEST',frequency:'monthly',frequencyText:'monthly',versionId:'v1',version:'1',description:'Fixture',products:[{code:'A',name:'Original sample'}]};
function run(cmd){const next=copy(control);const result=m.executeRoutine(next,{operationId:id(),expectedRevision:control.revision,...cmd},[source],{actor,at:new Date(1791320000000+tick++*1000).toISOString(),today:'2026-10-08',allowed:()=>true,settings:true,revoke:true,revise:true});control=next;return result;}
function draft(key,action,extra={}){const d=control.documents.find(d=>d.id===key),operationId=id();return run({action:'draft',documentId:key,operationId,command:{action,operationId,generation:d.flow.generation,clientId:'fixture-actions',sequence:++seq,...extra}});}
function approve(key){const current=()=>control.documents.find(d=>d.id===key);draft(key,'save',{expectedRevision:current().flow.revision});draft(key,'submit',{savedId:current().flow.saved.id,reason:''});draft(key,'approve',{caseId:current().flow.pendingId,selfReviewConfirmed:true});}
run({action:'configure',startDate:'2026-10-08'});run({action:'generate'});
const job=control.jobs[0],plan=run({action:'create-plan',jobIds:[job.id]}).documentId;approve(plan);
const report=run({action:'create-report',documentId:plan}).documentId;
const line=control.documents.find(d=>d.id===report).flow.working.lines[0],path=['lines',{id:line.id},'results'];
draft(report,'apply',{patches:[{op:'set',path,value:[{id:id(),outcome:'fail',samples:['A'],value:'10 mm',notes:'Defect',photos:['a'.repeat(64)]}]}],guards:[{path,value:line.results}]});approve(report);
const caseId=control.cases[0].id;
function view(){const c=copy(control);c.documents.forEach(d=>{d.dependencies=m.cancellationDependencies(c,d);if(d.kind==='plan')d.reportAvailability=m.reportAvailability(c,d)});c.cases.forEach(a=>a.unresolvedFailureSamples=m.unresolvedFailureSamples(c,a));return {today:'2026-10-08',identity:actor,permissions:{edit:true,approve:true,revoke:true,history:true},sources:[source],control:c};}
const root={isConnected:true,parentElement:null,innerHTML:'',querySelectorAll:()=>[],querySelector:()=>null};
const document={documentElement:{get lang(){return lang}},hidden:false,querySelector:()=>null};
const window={scrollX:0,scrollY:320,scrollTo:()=>{},matchMedia:()=>({matches:false}),addEventListener:()=>{}};
const fetch=async(url,options={})=>{if(options.method==='POST'){const command=JSON.parse(options.body);requests.push(command);try{const result=run(command);return {ok:true,json:async()=>({result})}}catch(e){return {ok:false,json:async()=>({error:e.code||e.message,details:e.details})}}}return {ok:true,json:async()=>view()};};
const code=fs.readFileSync('public/process/routine-fqc.js','utf8').replace('  window.RoutineFQCUI = {','  window.__contract = {s,setData:v=>data=v,setRoot:v=>root=v,act,toggleHighlight,highlighted,list,retestActions,followupState,setDialog:fn=>dialog=fn};\n  window.RoutineFQCUI = {');
vm.runInNewContext(code,{window,document,fetch,crypto:webcrypto,setInterval:()=>{},setTimeout:()=>{},location:{port:'3040',href:'http://127.0.0.1:3040/process/'},URL,console});
const ui=window.__contract;
let dialogNotes=null;ui.setDialog(async()=>dialogNotes===null?null:new Map([['notes',dialogNotes]]));
function sync(){ui.setData(view());ui.setRoot(root);ui.s.tab='cases';ui.s.selected=caseId;}
(async()=>{
 sync();const a=view().control.cases[0];assert.match(ui.retestActions(a),/改善措施/);assert.doesNotMatch(ui.retestActions(a),/data-action="followup-report" disabled/);
 const unchanged=JSON.stringify(control);
 assert.throws(()=>run({action:'followup',caseId,kind:'report',notes:'  '}),e=>e.code==='IMPROVEMENT_REQUIRED');
 assert.equal(JSON.stringify(control),unchanged);
 await ui.act('followup-report');assert.equal(JSON.stringify(control),unchanged,'Cancel modal writes neither improvement nor retest');assert.equal(requests.length,0);
 dialogNotes='Fixture combined repair';
 await ui.act('followup-report');assert.equal(ui.s.selected,caseId);assert.equal(ui.s.tab,'cases');assert.match(root.innerHTML,/已建立複測/);
 assert.equal(requests.length,1);assert.equal(requests[0].action,'followup');assert.equal(requests[0].notes,dialogNotes);
 assert.equal(control.cases[0].improvements.length,1);assert.equal(control.cases[0].improvements[0].notes,dialogNotes);
 const recorded=JSON.stringify(control);run(requests[0]);assert.equal(JSON.stringify(control),recorded,'Receipt replay preserves exactly one improvement and retest');
 assert.throws(()=>run({action:'followup',caseId,kind:'report',notes:'Duplicate repair'}),e=>e.code==='FOLLOWUP_OPEN');assert.equal(JSON.stringify(control),recorded);
 assert.throws(()=>run({action:'followup',caseId,kind:'report',notes:'Stale repair',expectedRevision:control.revision-1}),e=>e.code==='REVISION_CONFLICT');assert.equal(JSON.stringify(control),recorded);
 assert.throws(()=>m.executeRoutine(copy(control),{action:'followup',caseId,kind:'report',notes:'Forbidden repair',operationId:id(),expectedRevision:control.revision},[source],{actor,at:'2026-10-08T02:00:00Z',today:'2026-10-08',allowed:()=>false,settings:false,revoke:false,revise:false}),e=>e.code==='FORBIDDEN');
 let retest=control.documents.at(-1);assert.equal(retest.caseId,caseId);assert.equal(control.cases[0].status,'retest');
 await ui.act('followup-report');assert.equal(control.documents.length,3,'Existing followup cannot duplicate');assert.match(ui.s.error,/已有後續草稿/);
 const writes=requests.length;await ui.act('recall-retest');assert.match(root.innerHTML,/確認收回此複測草稿/);assert.equal(requests.length,writes,'Confirmation does not write');
 await ui.act('cancel-confirmation');assert.ok(!control.documents.at(-1).cancelled);assert.equal(requests.length,writes);
 await ui.act('recall-retest');await ui.act('confirm-recall-retest');assert.ok(control.documents.at(-1).cancelled);assert.equal(control.cases[0].status,'open');assert.equal(ui.s.selected,caseId);assert.match(root.innerHTML,/data-action="followup-report"/);
 assert.equal(control.documents.find(d=>d.id===report).flow.active.content.lines[0].results[0].outcome,'fail','Original formal failure is unchanged');
 assert.throws(()=>run({action:'restore-document',documentId:retest.id}),e=>e.code==='RESTORE_DISABLED');run({action:'followup',caseId,kind:'report',notes:'New attempt after discarded draft'});retest=control.documents.at(-1);sync();
 assert.throws(()=>run({action:'discard-draft',documentId:retest.id,expectedRevision:control.revision-1}),e=>e.code==='REVISION_CONFLICT');
 const retestLine=control.documents.at(-1).flow.working.lines[0],retestPath=['lines',{id:retestLine.id},'results'];draft(retest.id,'apply',{patches:[{op:'set',path:retestPath,value:[{id:id(),outcome:'pass',samples:['A'],value:'Verified after repair',notes:'',photos:[]}]}],guards:[{path:retestPath,value:retestLine.results}]});draft(retest.id,'save',{expectedRevision:control.documents.at(-1).flow.revision});draft(retest.id,'submit',{savedId:control.documents.at(-1).flow.saved.id,reason:''});sync();
 assert.match(ui.retestActions(view().control.cases[0]),/複測已送審/);assert.doesNotMatch(ui.retestActions(view().control.cases[0]),/data-action="recall-retest"/);
 assert.throws(()=>run({action:'discard-draft',documentId:retest.id}),e=>e.code==='WITHDRAW_BEFORE_DISCARD');
 draft(retest.id,'withdraw',{caseId:control.documents.at(-1).flow.pendingId,reason:''});sync();
 const before=JSON.stringify(control);ui.toggleHighlight('cases','cases');assert.match(ui.list(),/data-highlight="red"/);assert.doesNotMatch(ui.list(),/data-work-state=/);ui.toggleHighlight('cases','cases');assert.doesNotMatch(ui.list(),/data-highlight=/);
 ui.toggleHighlight('fail','cases');assert.match(ui.list(),/data-highlight="red"/);ui.toggleHighlight('fail','cases');assert.doesNotMatch(ui.list(),/data-highlight=/);
 const unfinishedView=view();unfinishedView.control.jobs.push({...unfinishedView.control.jobs[0],id:'unfinished-job',planId:null,completion:null});ui.setData(unfinishedView);ui.toggleHighlight('jobs','jobs');assert.match(ui.list(),/data-highlight="blue"/);assert.equal(ui.s.outcome,'');ui.toggleHighlight('jobs','jobs');assert.doesNotMatch(ui.list(),/data-highlight=/);
 assert.equal(JSON.stringify(control),before,'Marking never mutates data');
 const data=view(),closed=copy(data.control.cases[0]);closed.id='closed-case';closed.status='disposed';closed.number='Closed fixture';data.control.cases.push(closed);ui.setData(data);ui.toggleHighlight('cases','cases');
 assert.equal((ui.list().match(/data-highlight="red"/g)||[]).length,1,'Only open case marked, closed row retained');assert.match(ui.list(),/Closed fixture/);
 lang='vi';assert.match(ui.retestActions(data.control.cases[0]),/Đã tạo thử lại/);assert.match(ui.list(),/Bất thường chưa đóng/);
 const supplement=view();supplement.control.documents=supplement.control.documents.filter(d=>d.id!==retest.id);const approvedPlan=copy(supplement.control.documents.find(d=>d.id===plan));approvedPlan.id='supplement-plan';approvedPlan.caseId=caseId;approvedPlan.reportAvailability=[{jobId:job.id,assigned:true,reportIds:[]}];supplement.control.documents.push(approvedPlan);ui.setData(supplement);
 assert.match(ui.retestActions(supplement.control.cases[0]),/Kế hoạch thử lại đã duyệt/);assert.doesNotMatch(ui.retestActions(supplement.control.cases[0]),/data-action="recall-retest"/);
 console.log('PASS actions: real UI commands + production kernel atomic improvement/retest, cancel, receipt replay, permission, duplicate, confirm/restore-disabled/replacement/pending-lock/CAS/original history; scope toggle/count/context/immutability; Vietnamese');
})().catch(e=>{console.error(e);process.exitCode=1;});
