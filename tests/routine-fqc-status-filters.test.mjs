import assert from 'node:assert/strict';
import test from 'node:test';
import {manualUI,posted} from './fixtures/routine-fqc-manual-ui.mjs';

function setup(lang){
  const f=manualUI(),{remote}=f;
  remote.today='2026-11-24';
  f.document.documentElement.lang=lang;
  const job=(id,scope,end,extra={})=>({id,itemId:scope,start:end,end,planId:null,completion:null,
    calendar:{scope,frequency:'weekly',productCode:scope},source:{id:scope,name:scope,code:scope,line:'A',category:'C',
      products:[{code:scope,name:scope}],frequency:'weekly',version:'1',description:'Synthetic'},...extra});
  const old=job('older','ONE','2026-05-24'),recent=job('recent','ONE','2026-11-23'),other=job('other','TWO','2026-10-24');
  const planned=job('planned','ONE','2026-11-20',{planId:'plan'});
  const retest={...planned,id:'retest',calendar:{...planned.calendar,retestCaseId:'case',originJobId:'planned'}};
  const current=job('current','ONE','2026-11-29',{start:'2026-11-23'});
  const passed=job('pass','TWO','2026-11-20',{completion:{kind:'pass',reportId:'pass-report'}});
  const exempt=job('exempt','TWO','2026-11-23',{completion:{kind:'skip',reportId:'approved-skip'}});
  const snapshot=(j,outcome)=>({title:'Synthetic',lines:[{source:j.source,jobId:j.id,results:outcome?[{outcome,samples:['test'],photos:[]}]:[]}]});
  const actor={id:'admin',name:'Synthetic Admin'};
  function doc(id,kind,j,result,reviewStatus,caseId){
    const value=snapshot(j,result);
    const review={id:id+'-case',status:reviewStatus,content:value,actor,at:'2026-11-24T02:00:00Z'};
    const approved=reviewStatus==='approved';
    return {id,number:id,kind,caseId,createdAt:review.at,owner:actor,flow:{active:{id:approved?review.id:null,content:value},saved:null,
      working:value,cases:reviewStatus?[review]:[],pendingId:null,saves:[]}};
  }
  const abnormal=job('abnormal','THREE','2026-11-23',{planId:'ab-plan'});
  abnormal.source.line='B';abnormal.source.category='D';
  const documents=[doc('plan','plan',planned,null,'approved'),doc('ab-plan','plan',abnormal,null,'approved'),doc('fail-report','report',planned,'fail','approved'),
    doc('retest-report','report',retest,'pass','approved','case'),doc('second-retest','report',retest,'fail','approved','case'),
    doc('pass-report','report',passed,'pass','approved'),doc('ab-report','report',abnormal,'abnormal','approved'),
    doc('disposal','disposal',planned,null,'withdrawn','case'),doc('unsent-disposal','disposal',abnormal)];
  const cases=[{id:'case',number:'CASE',jobId:planned.id,originReportId:'fail-report',reportIds:['retest-report','second-retest'],
    status:'disposed',lineageJobIds:[retest.id],events:[]}];
  Object.assign(remote.control,{jobs:[recent,current,other,old,planned,retest,passed,exempt,abnormal],cases,documents,
    calendarPolicy:{version:2,scopes:{}},startDate:'2026-05-01'});
  f.api.setData(structuredClone(remote));f.paint();
  return f;
}
for(const lang of ['zh','vi'])test('period status facets intersect, deduplicate and preserve selection in '+lang,()=>{
  const f=setup(lang),q=s=>f.root.querySelector(s),all=s=>[...f.root.querySelectorAll(s)];
  const tile=k=>q('[data-period-status="'+k+'"]');
  const counts=()=>all('[data-period-status]').map(el=>Number(el.querySelector('b').textContent));
  const groups=()=>all('[data-period-group]').map(el=>el.dataset.periodGroup);
  const change=(s,v)=>{const el=q(s);el.value=v;el.onchange();};
  assert.match(q('.rf-status-filters').textContent,lang==='zh'?/狀態篩選/:/Lọc trạng thái/);
  assert.equal(all('[data-period-range] option').length,6);
  assert.deepEqual(counts(),[2,1,1,1,1,1]);
  f.api.s.checked.add('current');f.paint();
  tile('overdue').click();
  assert.deepEqual(groups(),['ONE','TWO']);
  q('[data-period-group="ONE"] [data-period-toggle]').click();
  assert.deepEqual(all('[data-period-id]').map(el=>el.dataset.periodId),['older','recent']);
  assert.match(q('.rf-period-late').textContent,/2026-05-24.*184/);
  assert.deepEqual(counts(),[2,1,1,1,1,1]);
  change('[data-period-range]','week');assert.deepEqual(groups(),['ONE']);
  assert.deepEqual(all('[data-period-id]').map(el=>el.dataset.periodId),['recent']);
  tile('disposal').click();assert.deepEqual(groups(),['ONE']);
  assert.match(q('[data-period-id="planned"]').textContent,lang==='zh'?/已撤回/:/Đã rút/);
  tile('disposal').click();assert.equal(tile('disposal').getAttribute('aria-pressed'),'false');
  change('[data-source-filter="sourceProduct"]','TWO');assert.deepEqual(counts(),[0,1,0,0,0,0]);
  change('[data-source-filter="sourceLine"]','A');assert.equal(f.api.s.sourceProduct,'TWO');
  change('[data-source-filter="sourceLine"]','B');assert.equal(f.api.s.sourceProduct,'');
  assert.deepEqual(counts(),[0,0,0,0,0,0]);
  const form=q('[data-period-search]');form.querySelector('[name="query"]').value='THREE';
  form.querySelector('[name="from"]').value='2026-11-01';form.querySelector('[name="to"]').value='2026-11-23';
  form.querySelector('[name="outcome"]').value='ever-fail';form.onsubmit({preventDefault(){}});
  assert.deepEqual(groups(),[]);
  q('[data-period-search-reset]').click();assert.deepEqual(counts(),[2,1,1,1,1,1]);
  for(const key of ['sourceLine','sourceCategory','sourceProduct','periodStatus','periodRange','periodSearch','periodOutcome','periodFrom','periodTo'])assert.equal(f.api.s[key],'');
  assert.deepEqual([...f.api.s.checked],['current']);assert.deepEqual(posted(f),[]);
});

test('all rolling windows use original due dates and hide unknown historical evidence',()=>{
  const f=setup('zh'),q=s=>f.root.querySelector(s);
  const select=(selector,value)=>{const e=q(selector);e.value=value;e.onchange();};
  q('[data-period-status="overdue"]').click();
  for(const [range,n] of [['week',1],['1',1],['3',2],['6',2],['12',2],['',2]]){
    select('[data-period-range]',range);
    assert.equal(Number(q('[data-period-status="overdue"] b').textContent),n);
  }
  const data=f.api.getData();
  const fail=data.control.documents.find(d=>d.id==='fail-report');
  fail.flow.active={id:null};fail.flow.cases[0].content=null;
  const retest=data.control.documents.find(d=>d.id==='second-retest');
  retest.flow.cases=[];retest.flow.active={id:null};
  f.paint();
  assert.equal(q('[data-period-status="fail"] b').textContent,'0');
  data.permissions.history=false;f.paint();
  for(const e of f.root.querySelectorAll('[data-period-status]')){
    if(e.dataset.periodStatus==='overdue')continue;
    assert.equal(e.disabled,true);assert.equal(e.querySelector('b').textContent,'—');
  }
  assert.deepEqual(posted(f),[]);
});

test('repaint retains focus on the FQC filter that was used, including clear after zero matches',()=>{
  const f=setup('zh'), q=selector=>f.root.querySelector(selector);
  const focused=selector=>assert.equal(f.document.activeElement,q(selector),selector);
  const status='[data-period-status="fail"]', range='[data-period-range]';
  const source='[data-source-filter="sourceLine"]', reset='[data-period-search-reset]';
  q(status).click();focused(status);
  q(range).value='week';q(range).onchange();focused(range);
  q(source).value='B';q(source).onchange();focused(source);
  assert.equal(q('[data-period-group]'),null);
  q(reset).click();focused(reset);
  assert.ok(q('[data-period-group]'));
  assert.deepEqual(posted(f),[]);
});

for(const height of [844,900])for(const nested of [false,true]){
  test('clamped FQC results restore '+height+'px '+(nested?'panel':'window')+' scroll',()=>{
    const f=setup('zh'), q=selector=>f.root.querySelector(selector);
    const {root,win,document}=f, panel=root.parentElement;
    const main=()=>q('.rf-calendar'), groups=()=>root.querySelectorAll('[data-period-group]').length;
    const naturalHeight=()=>groups()?4800:400;
    const renderedHeight=()=>Math.max(naturalHeight(),parseInt(main()?.style.minHeight)||0);
    let offset=1400;
    const scrollTo=y=>{offset=Math.max(0,Math.min(y,renderedHeight()-height));};
    win.innerHeight=height;win.scrollX=0;
    Object.defineProperty(win,'scrollY',{get:()=>nested?0:offset});
    win.scrollTo=(_x,y)=>{if(!nested)scrollTo(y);};
    document.scrollingElement=document.documentElement;
    if(nested){
      panel.clientTop=0;
      Object.defineProperty(panel,'clientHeight',{value:height});
      Object.defineProperty(panel,'scrollTop',{get:()=>offset,set:scrollTo});
    }
    win.getComputedStyle=node=>({overflowY:nested&&node===panel?'auto':'visible'});
    const prototype=Object.getPrototypeOf(root),rect=prototype.getBoundingClientRect;
    prototype.getBoundingClientRect=function(){
      return this.matches('.rf-calendar')?{top:-offset,height:renderedHeight()}:rect.call(this);
    };
    f.api.s.checked.add('current');
    const select=(selector,value)=>{q(selector).value=value;q(selector).onchange();};
    select('[data-source-filter="sourceLine"]','B');
    q('[data-period-status="fail"]').click();
    assert.equal(groups(),0);
    assert.equal(offset,1400);
    assert.equal(document.activeElement,q('[data-period-status="fail"]'));
    q('[data-period-search-reset]').click();
    assert.equal(groups(),3);
    assert.equal(offset,1400);
    assert.equal(main().style.minHeight,undefined);
    assert.deepEqual([...f.api.s.checked],['current']);
    assert.deepEqual(posted(f),[]);
  });
}

test('FQC overdue chip, count and filtered list follow the same effective plan state',()=>{
  const f=setup('zh'), q=s=>f.root.querySelector(s), data=f.api.getData();
  const j=data.control.jobs.find(j=>j.id==='planned'), plan=data.control.documents.find(d=>d.id==='plan');
  data.control.jobs=[j];data.control.documents=[plan];data.control.cases=[];
  const due=j.end, review=plan.flow.cases[0], tile='[data-period-status="overdue"]';
  function verify(name,expected){
    f.paint();
    let group=q('[data-period-toggle]');
    if(group && group.getAttribute('aria-expanded')!=='true')group.click();
    const chip=q('[data-period-id="planned"] .rf-period-chip');
    assert.ok(chip,name+' row');
    assert.equal(chip.textContent.startsWith('已逾期'),expected,name+' chip');
    assert.equal(Number(q(tile+' b').textContent),+expected,name+' tile count');
    q(tile).click();
    assert.equal(!!q('[data-period-group="ONE"]'),expected,name+' filtered group');
    q(tile).click();
  }
  plan.flow.active.id=null;plan.flow.cases=[];j.planId=null;
  verify('unplanned',true);
  j.planId=plan.id;plan.flow.saved={content:plan.flow.working};
  verify('saved draft',true);
  plan.flow.cases=[review];review.status='pending';plan.flow.pendingId=review.id;
  verify('submitted',false);
  plan.cancelled={status:'pending'};verify('cancelled pending plan',true);delete plan.cancelled;
  plan.flow.pendingId=null;review.status='withdrawn';verify('withdrawn',true);
  review.status='returned';verify('returned',true);
  review.status='approved';plan.flow.active.id=review.id;verify('approved',false);
  plan.cancelled={status:'approved'};verify('cancelled approved plan',true);delete plan.cancelled;
  plan.flow.active.id=null;plan.flow.cases=[];j.end=data.today;verify('due today',false);
  j.end='2026-11-25';verify('due tomorrow',false);
  j.end=due;j.calendar.stopped=true;verify('stopped period',false);
  j.calendar.stopped=false;j.completion={kind:'skip'};verify('completed period',false);
  assert.deepEqual(posted(f),[]);
});
