import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {setup} from './iqc-save-choice-fixture.mjs';

void test('Approved legacy batch rules survive IQC master Save, Submit and approval without entering the calendar', async () => {
  const h=await setup();
  try {
    const {routineIqcCatalog,routineIqcSources,routineIqcTimeline}=h.f.load('lib/routine-iqc.ts');
    const {companyDate,emptyRoutine,periodAt,nextDate}=h.f.load('lib/routine-fqc.ts');
    const {reconcileCalendar,calendarCanArrange,validatePlanDates}=h.f.load('lib/routine-fqc-calendar.ts');
    const {readRoutineIqc,executeRoutineIqc,iqcExpired}=h.f.load('lib/routine-iqc-workflow.ts');
    const at=new Date().toISOString(), day=companyDate(new Date(at));
    await h.f.mutate(values=>{
      const iqc=JSON.parse(values.iqcMasterControl);
      // Existing imported source-only text is a legacy row, not a newly invented time rule.
      const textRule={id:'legacy-text',cadence:'source',kind:'raw',value:'',sourceTextVi:'mỗi 45 ngày (TEST ONLY)'};
      const preserveLegacy=snap=>snap.items.push({...snap.items[0],id:'old-all',checkNo:'DEMO-I0-C1',frequencyRaw:'每批',
        rules:[{id:'old-all-rule',cadence:'batch',kind:'all',value:'1'}]});
      for(const version of iqc.versions){
        version.createdAt=at;version.updatedAt=at;
        version.snapshot.items[0].rules=[textRule];
        version.snapshot.items[0].frequencyRaw=textRule.sourceTextVi;
        preserveLegacy(version.snapshot);
      }
      for(const snap of [iqc.workflow.working,iqc.workflow.active.content]){
        snap.items[0].rules=[textRule];snap.items[0].frequencyRaw=textRule.sourceTextVi;preserveLegacy(snap);
      }
      values.iqcMasterControl=JSON.stringify(iqc);
    });
    const read=()=>h.f.core.readState({deferHistory:false});
    const baseline=await read();
    assert.equal(routineIqcSources(baseline).length,0);
    const specs=[['WEEK','time','week',''],['MONTH','time','month',''],['QUARTER','time','quarter',''],['BATCH','batch','fixed_count','1']];
    const initial=await h.state(), working=initial.workflow.working;
    const inserts=specs.flatMap(([name,cadence,kind,value])=>{
      const code='TEST-ONLY-IQC-'+name, part='test-part-'+name, error='test-error-'+name;
      return [
        {op:'insert',path:['parts'],value:{...working.parts[0],id:part,code,nameVi:'TEST ONLY · '+name}},
        {op:'insert',path:['errors'],value:{id:error,partCode:code,code:'Visual '+name,nameVi:'TEST ONLY · Visual'}},
        {op:'insert',path:['items'],value:{...working.items[0],id:'test-item-'+name,partCode:code,errorId:error,checkNo:'',nameVi:'TEST ONLY · '+name,frequencyRaw:'',rules:[{id:'test-rule-'+name,cadence,kind,value}]}}
      ];
    });
    const mixed='TEST-ONLY-IQC-MIXED';
    inserts.push(
      {op:'insert',path:['parts'],value:{...working.parts[0],id:'mixed-part',code:mixed,nameVi:'TEST ONLY · MIXED'}},
      {op:'insert',path:['errors'],value:{id:'mixed-error',partCode:mixed,code:'Visual mixed',nameVi:'TEST ONLY · Visual'}},
      ...['WEEK','MONTH','BATCH'].map((name,i)=>({op:'insert',path:['items'],value:{...working.items[0],
        id:'mixed-'+name,partCode:mixed,errorId:'mixed-error',checkNo:'',nameVi:'TEST ONLY · MIXED '+name,frequencyRaw:'',
        rules:[{id:'mixed-rule-'+name,cadence:i===2?'batch':'time',kind:['week','month','fixed_count'][i],value:i===2?'1':''}]}})),
    );
    let seq=0;
    async function command(action,details={},actor='editor',status=200){
      const state=await h.state(), flow=state.workflow;
      const body={command:{action,operationId:randomUUID(),clientId:'routine-iqc-fixture-'+actor,sequence:++seq,generation:flow.generation,expectedRevision:flow.revision,...details}};
      const r=await h.call('/api/iqc/workflow?caseMetadata=1',{method:'POST',body:JSON.stringify(body)},actor);
      const data=await r.json();
      assert.equal(r.status,status,JSON.stringify(data));
      return data;
    }
    await command('save',{moduleAction:'save-local-v1',patches:inserts,guards:[]});
    const legacy=JSON.parse(baseline.values.iqcMasterControl).workflow.active.content.items.find(item=>item.id==='old-all');
    assert.ok(legacy);
    const setRules=async(id,rules)=>{
      const path=['items',{id},'rules'];
      const before=(await h.state()).workflow.working.items.find(item=>item.id===id).rules;
      return command('save',{moduleAction:'save-local-v1',
        patches:[{op:'set',path,value:rules}],guards:[{path,value:before}]});
    };
    const rejectSubmission=async id=>{
      const savedId=(await h.state()).workflow.saved.id;
      const rejected=await command('submit',{savedId,reason:'TEST ONLY invalid batch rule'},'editor',422);
      assert.equal(rejected.error,'VALIDATION_FAILED');
      assert(rejected.details.issues.some(issue=>issue.kind==='error'&&issue.path[1]?.id===id));
      assert.equal((await h.state()).workflow.pendingId,null);
      assert.equal((await h.state()).workflow.saved.id,savedId);
    };
    await setRules('old-all',[{...legacy.rules[0],value:'2'}]);
    await rejectSubmission('old-all');
    await setRules('old-all',[{...legacy.rules[0],value:''}]);
    await rejectSubmission('old-all');
    await setRules('old-all',legacy.rules);
    await setRules('test-item-BATCH',legacy.rules);
    await rejectSubmission('test-item-BATCH');
    await setRules('test-item-BATCH',[{id:'test-rule-BATCH',cadence:'batch',kind:'fixed_count',value:'1'}]);
    assert.equal(routineIqcSources(await read()).length,0);
    await command('submit',{savedId:(await h.state()).workflow.saved.id,reason:'TEST ONLY time and batch controls'});
    assert.equal(routineIqcSources(await read()).length,0);
    const pending=(await h.state()).workflow.pendingId;
    await command('approve',{caseId:pending},'other');
    const approved=await read(), sources=routineIqcSources(approved), catalog=routineIqcCatalog(approved);
    assert.equal(catalog.versionId,pending);
    assert.deepEqual((await h.state()).workflow.active.content.items.find(item=>item.id==='old-all'),legacy);
    assert.deepEqual(Array.from(sources,source=>[source.products[0].code,source.frequency,source.iqc.ruleId,source.versionId]),[
      ['TEST-ONLY-IQC-WEEK','weekly','test-rule-WEEK',pending],
      ['TEST-ONLY-IQC-MONTH','monthly','test-rule-MONTH',pending],
      ['TEST-ONLY-IQC-QUARTER','quarterly','test-rule-QUARTER',pending],
      [mixed,'weekly','mixed-rule-WEEK',pending],
      [mixed,'monthly','mixed-rule-MONTH',pending],
    ]);
    assert.equal(catalog.categories[0].name,'Category');
    assert.equal(catalog.suppliers[0].name,'Supplier');
    const state=emptyRoutine();state.startDate=day;state.calendarPolicy={version:2,adoptedAt:day+'T00:00:00+07:00',scopes:{}};
    assert.equal(reconcileCalendar(state,routineIqcTimeline(approved),day,at),5);
    assert.equal(reconcileCalendar(state,routineIqcTimeline(approved),day,at),0);
    assert.equal(state.jobs.length,5);
    for(const job of state.jobs){
      assert(calendarCanArrange(job,day));
      validatePlanDates([job],day,day,day);
      assert.equal(job.source.versionId,pending);
      assert(job.start<=day&&job.end>=day);
    }
    const mixedRows=state.jobs.filter(job=>job.source.products[0].code===mixed);
    assert.deepEqual(Array.from(mixedRows,job=>job.calendar.frequency),['weekly','monthly']);
    assert.notEqual(mixedRows[0].period,mixedRows[1].period);
    const iqc=readRoutineIqc(approved), context={actor:{id:'editor',name:'Synthetic editor',admin:true},
      today:day, at, id:randomUUID,permissions:new Proxy({}, {get:()=>true})};
    executeRoutineIqc(iqc,{action:'configure',operationId:randomUUID(),expectedRevision:0,start:day,expectedStateRevision:approved.revision,
      scope:'routine-iqc-only',confirm:'START IQC',startAck:true,reason:'TEST ONLY schedule'},approved,context);
    const selected=Array.from(mixedRows,job=>job.id);
    const batchScope=JSON.stringify(['','mixed-part',JSON.stringify(['mixed-BATCH','mixed-rule-BATCH'])]);
    assert.throws(()=>executeRoutineIqc(iqc,{action:'create-plan',operationId:randomUUID(),expectedRevision:1,
      jobIds:[...selected,'calendar:'+encodeURIComponent(batchScope)+'@'+mixedRows[0].period],start:day,end:day},approved,context),
      error=>error.message==='IQC_WORK_NOT_AVAILABLE');
    const created=executeRoutineIqc(iqc,{action:'create-plan',operationId:randomUUID(),expectedRevision:1,
      jobIds:selected,start:day,end:day},approved,context);
    const plan=iqc.documents.find(doc=>doc.id===created.result.documentId);
    assert.deepEqual(Array.from(plan.jobs,job=>[job.source.iqc.partId,job.source.iqc.ruleId]),[
      ['mixed-part','mixed-rule-WEEK'],['mixed-part','mixed-rule-MONTH']
    ]);
    const periods=Array.from(state.jobs,job=>({part:job.source.products[0].code,frequency:job.calendar.frequency,start:job.start,end:job.end}));
    console.log(JSON.stringify({approvedVersion:catalog.version,periods,excluded:['TEST-ONLY-IQC-BATCH','P (legacy source text)','TEST-ONLY-IQC-MIXED batch check']}));
    // A plan may contain a short and a longer period. Both stay pending
    // beyond the shorter one until review returns a decision.
    const due=iqc.calendar.jobs.find(job=>job.id===selected[0]);
    const deadline=due.end, late=nextDate(deadline);
    const lots=[{partId:'mixed-part',batchNo:'0001',quantity:2}];
    const reviewer={...context.actor,id:'other',name:'Synthetic reviewer'};
    for(const decision of ['withdraw','return','approve']){
      const scenario=structuredClone(iqc), document=scenario.documents.find(doc=>doc.id===plan.id);
      const submitCommand=(action,today,actor,extra={},fields)=>{
        const operationId=randomUUID();
        return executeRoutineIqc(scenario,{action:'draft',operationId,expectedRevision:scenario.revision,documentId:document.id,
          draft:{action,operationId,clientId:'synthetic-expiry-review',sequence:document.flow.revision+1,
            generation:document.flow.generation,expectedRevision:document.flow.revision,...extra},...(fields?{fields}:{})},
          approved,{...context,today,at:today+'T08:00:00+07:00',actor});
      };
      submitCommand('save',deadline,context.actor,{},{lots});
      assert(!iqcExpired(scenario,document,deadline));
      submitCommand('submit',deadline,context.actor,{savedId:document.flow.saved.id});
      assert(!iqcExpired(scenario,document,late));
      const pendingId=document.flow.pendingId;
      const snapshot=structuredClone(document.flow.cases.find(review=>review.id===pendingId).content);
      submitCommand(decision,late,decision==='withdraw'?context.actor:reviewer,{caseId:pendingId,reason:'TEST ONLY deadline decision'});
      if(decision==='approve'){
        assert(!iqcExpired(scenario,document,late));
      }else{
        assert(iqcExpired(scenario,document,late));
        assert.throws(()=>submitCommand('submit',late,context.actor,{savedId:document.flow.saved.id}),/EXPIRED_PLAN_READ_ONLY/);
        assert.throws(()=>submitCommand('save',late,context.actor,{},{notes:'must remain unchanged'}),/EXPIRED_PLAN_READ_ONLY/);
        assert(scenario.calendar.jobs.some(job=>job.itemId===due.itemId&&job.start===late&&calendarCanArrange(job,late)));
      }
      assert.deepEqual(JSON.parse(JSON.stringify(document.flow.cases.find(review=>review.id===pendingId).content)),snapshot);
    }
    // Exercise approved frequency transitions through the same IQC master writer.
    const keep=structuredClone(plan);
    const begun=await h.call('/api/iqc/workflow?caseMetadata=1',{method:'POST',body:JSON.stringify({action:'begin'})});
    assert.equal(begun.status,200);
    const current=await h.state();
    const edits=[['mixed-MONTH','week'],['test-item-MONTH','quarter']];
    const rules=edits.map(([id,kind])=>{
      const original=current.workflow.working.items.find(item=>item.id===id).rules;
      return {path:['items',{id},'rules'],before:original,after:[{...original[0],kind}]};
    });
    await command('save',{moduleAction:'save-local-v1',patches:rules.map(rule=>({op:'set',path:rule.path,value:rule.after})),
      guards:rules.map(rule=>({path:rule.path,value:rule.before}))});
    assert.equal(routineIqcSources(await read()).find(source=>source.iqc.itemId==='mixed-MONTH').frequency,'monthly');
    await command('submit',{savedId:(await h.state()).workflow.saved.id,reason:'TEST ONLY change schedule'});
    assert.equal(routineIqcSources(await read()).find(source=>source.iqc.itemId==='test-item-MONTH').frequency,'monthly');
    const changedId=(await h.state()).workflow.pendingId;
    await command('approve',{caseId:changedId},'other');
    const changed=await read(), actualEffective=routineIqcTimeline(changed).find(version=>version.id===changedId).day;
    const run=(action,ctx,extra={})=>executeRoutineIqc(iqc,{action,operationId:randomUUID(),expectedRevision:iqc.revision,...extra},changed,ctx);
    run('generate',{...context,today:actualEffective});
    const forItem=(id)=>iqc.calendar.jobs.filter(job=>job.source.iqc.itemId===id);
    const unplanned=forItem('test-item-MONTH');
    assert.equal(unplanned.find(job=>job.calendar.frequency==='monthly').calendar.stopped.reason,'frequency-changed');
    assert.equal(unplanned.find(job=>job.calendar.frequency==='quarterly').start,periodAt(actualEffective,'quarterly').start);
    const kept=forItem('mixed-MONTH').find(job=>job.planId===plan.id);
    assert.equal(kept.calendar.frequency,'monthly');
    const after=nextDate(kept.end), p=periodAt(after,'weekly'), firstComplete=p.start===after?after:nextDate(p.end);
    assert(!forItem('mixed-MONTH').some(job=>job.calendar.frequency==='weekly'&&job.start<firstComplete));
    const afterCtx={...context,today:firstComplete,at:firstComplete+'T08:00:00+07:00'};
    run('generate',afterCtx);
    assert(forItem('mixed-MONTH').some(job=>job.calendar.frequency==='weekly'&&job.start===firstComplete && !job.planId));
    const saved=iqc.documents.find(doc=>doc.id===plan.id);
    assert.equal(JSON.stringify(saved),JSON.stringify(keep));
    assert(iqcExpired(iqc,saved,firstComplete));
    const saveId=randomUUID();
    assert.throws(()=>executeRoutineIqc(iqc,{action:'draft',operationId:saveId,expectedRevision:iqc.revision,documentId:plan.id,
      draft:{action:'save',operationId:saveId,clientId:'synthetic-expiry',sequence:1,generation:plan.flow.generation,
        expectedRevision:plan.flow.revision},fields:{notes:'overdue edit'}},changed,afterCtx),/EXPIRED_PLAN_READ_ONLY/);
    assert.equal(changed.values.routineFqcControl,baseline.values.routineFqcControl);
  }finally{h.close();}
});
