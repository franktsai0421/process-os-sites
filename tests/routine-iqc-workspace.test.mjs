import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import postcss from 'postcss';
import {canvasDOM} from '../scripts/login-reentry-dom.mjs';
import {manualUI} from './fixtures/routine-fqc-manual-ui.mjs';

const fixtureOrigin = 'https://synthetic.invalid';

function switchFixture(lang,{data=null,review=false,simulateRequest=null,confirmAction=false,fqcPending=null,listNavigation={},displayDocument=null,manualDialog=false,pageDraft=false,badgeAvailability={fqc:false,iqc:false}}={}){
 let onClick, changed, iqcClick, iqcChange, fqcMounts=0, epoch=1, allowed=false;
 let recoveryText={textContent:''}, badgeChanged, adminModal;
 let dialogCount=0, closeDialog;
 const pendingBadge=fqcPending===null?null:{textContent:String(fqcPending)}, fqcBadgeReads=[], badgeErrors=[];
 const visits=[],confirmations=[],localForm={value:'TEST ONLY unsaved notes'}, originalReceipt='synthetic-receipt';
 const switchButton={focus(){}};
 class Element {}
 const entry=new Element(),retry=new Element();
 const returnToFqc=new Element();returnToFqc.dataset={riAction:'module:0'};
 returnToFqc.closest=()=>returnToFqc;
 entry.closest=selector=>selector.includes('data-module')?entry:null;
 retry.closest=selector=>selector==='[data-action="retry"]'?retry:null;
 const errorText={nodeType:3,nodeValue:'OPERATION_NOT_FOUND'};
 retry.parentElement={firstChild:errorText};
 const pageDom=canvasDOM(),pagePanel=pageDom.document.createElement('section');
 const fqcRoot={hasAttribute:name=>pageDraft&&name==='data-routine-page',matches:()=>false,contains:node=>node===retry||node===entry,
  querySelector:selector=>selector==='[data-routine-page-panel]'&&pageDraft?pagePanel:selector.includes('[data-module')?entry:
   selector.endsWith('[data-action="retry"]')?retry:recoveryText
 };
 const listeners={};
 const iqcRoot={isConnected:true,append(){},querySelector:selector=>selector==='[data-ri-start]'?{value:'2026-11-19'}:null,addEventListener(kind,handler){listeners[kind]=handler;if(kind==='click')iqcClick=handler;if(kind==='change')iqcChange=handler;}};
 const fqc={matches:()=>false, contains:el=>[retry,entry,fqcRoot].includes(el),
   querySelector(selector){return selector.includes('routine-fqc-root')?fqcRoot:switchButton;}};
 const iqc={matches:()=>false,contains:node=>node===iqcRoot,
   querySelector:selector=>selector==='.ri-app'?iqcRoot:switchButton};
 const root={isConnected:true,querySelector:selector=>selector==='[data-ri-fqc]'?fqc:iqc};
 const container={querySelector:()=>root};
 const document={documentElement:{lang},querySelector:()=>pendingBadge,addEventListener(_name,handler){onClick=handler;},
   createElement(tag){
    if(pageDraft&&tag!=='dialog')return pageDom.document.createElement(tag);
    assert.equal(tag,'dialog');
    const elements={start:{value:'2026-11-19'},reason:{value:'TEST ONLY reason'},confirm:{value:'START IQC'},ack:{checked:true}};
    const help={}, submit={};
    const form={elements,querySelector:selector=>selector.includes('confirm')?submit:help,addEventListener(){}};
    dialogCount++;
    adminModal={querySelector:()=>form,setAttribute(){},showModal(){},remove(){},
      addEventListener(_event,listener){
       closeDialog=value=>{this.returnValue=value;listener();};
       if(!manualDialog)queueMicrotask(()=>closeDialog(confirmAction?'confirm':'cancel'));
      }};
    return adminModal;
   }};

 const location={href:fixtureOrigin+'/process/?'+(review?'view=approval&approvalTab=routine&rfModule=iqc':'view=quality-inspections')+'&system=quality'+(displayDocument?'&riDocument='+displayDocument:''),assign:url=>visits.push(url.href)};
 const departure={inspect:()=>({state:'unknown'})};
 const window={hasPermission:key=>pageDraft&&key==='iqc.view',scrollTo(){},addEventListener(){},ProcessSync:{identity:{id:'synthetic'},identityGeneration:()=>epoch},
  ProcessDeliveryNavigation:{replaceDisplayURL(url){location.href=url.href;return true;}},
  RoutineFQCUI:{...listNavigation,html:()=>'<section id="routine-fqc-root"><p role="status">Loading</p></section>',mount(){fqcMounts++;},pendingCount:()=>fqcPending||0,
    approvalPendingAvailability:async()=>badgeAvailability,
    async refreshPending(enabled){if(enabled)fqcBadgeReads.push('pending-count');},navigation:{departure,canLeave:()=>allowed,reset(){}}}};
 class MutationObserver {
  constructor(callback){this.callback=callback;}
  observe(target){if(target===pendingBadge)badgeChanged=this.callback;else changed=this.callback;}
  disconnect(){}
  takeRecords(){return [];}
 }
 const fetch=simulateRequest||(()=>data?Promise.resolve(Response.json(data)):new Promise(()=>{}));
 const pendingWrites=new Map();
 const sessionStorage={getItem:key=>pendingWrites.get(key)||null,setItem:(key,value)=>pendingWrites.set(key,value),removeItem:key=>pendingWrites.delete(key)};
 vm.runInNewContext(fs.readFileSync('public/process/routine-iqc.js','utf8'),{window,document,location,URL,Element,MutationObserver,fetch,crypto,sessionStorage,structuredClone,console:{warn:(...args)=>badgeErrors.push(args)},matchMedia:()=>({matches:false}),confirm:message=>{confirmations.push(message);return confirmAction;}});
 if(review)window.RoutineFQCUI.bindReview(container);else window.RoutineFQCUI.mount(container);
 const press=node=>onClick({target:node,preventDefault(){},stopImmediatePropagation(){}});
 return {entry,retry,pagePanel,loadingMarkup:window.RoutineFQCUI.html(),errorText,visits,press,changed,clearCheck:()=>{recoveryText=null;},showCheck:()=>recoveryText,
  states:()=>[fqc.hidden,fqc.inert,iqc.hidden,iqc.inert,fqcMounts],goBack:()=>iqcClick({target:returnToFqc}),
  stage(name){this.action('tab:'+name);},
  clickControl(node){iqcClick({target:node,preventDefault(){}});},
  action(action){
   const node=new Element();node.dataset={riAction:action};
   node.closest=selector=>selector==='[data-ri-action]'?node:null;
   this.clickControl(node);
  },
  input(key,value){listeners.input({target:{dataset:{riField:key},value}});},
  filter(key,value){iqcChange({target:{dataset:{riFilter:key},value}});},
  queryReports(value){listeners.submit({target:{matches:selector=>selector==='[data-ri-report-search]',elements:{query:{value}}},preventDefault(){}});},
  queryPeriods(values){const elements=Object.fromEntries(['search','periodFrom','periodTo','outcome'].map(key=>[key,{value:values[key]||''}]));
   listeners.submit({target:{matches:selector=>selector==='[data-ri-period-search]',elements},preventDefault(){}});},
  adminMarkup:()=>adminModal?.innerHTML,
  dialogCount:()=>dialogCount, closeDialog:value=>closeDialog(value),
  pick(id){iqcChange({target:{dataset:{riPick:id},checked:true}});},
  changePick(target,checked){target.checked=checked;iqcChange({target});},
  pendingBadge,fqcBadgeReads,badgeErrors,refreshApprovalCounts:()=>window.RoutineFQCUI.refreshPending(),fqcRefresh(value){pendingBadge.textContent=String(value);badgeChanged();},
  opensRoutineApproval:()=>window.RoutineFQCUI.opensRoutineApproval(),
  confirmations,localForm,originalReceipt,pendingWrites,iqcRoot,location,navigation:window.RoutineFQCUI.navigation,departure,
  expireIdentity:()=>{epoch++;},unlockFqc:()=>{allowed=true;}};
}

void test('both languages keep the FQC panel mounted and fenced while using IQC in the same document',()=>{
 for(const lang of ['zh','vi']){
  const ui=switchFixture(lang);
  assert.match(ui.errorText.nodeValue,lang==='zh'?/寫入結果仍待確認/:/chưa được xác nhận/);
  ui.press(ui.entry);
  assert.deepEqual(ui.states(),[true,true,false,false,1]);
  assert.equal(ui.navigation.departure,ui.departure);
  assert.equal(ui.navigation.canLeave(),false);
  assert.match(ui.iqcRoot.innerHTML,lang==='zh'?/載入 IQC/:/Đang tải IQC/);
  assert.match(ui.location.href,/rfModule=iqc/);
  ui.goBack();
  assert.deepEqual(ui.states(),[false,false,true,true,1]);
  assert.equal(ui.localForm.value,'TEST ONLY unsaved notes');
  assert.equal(ui.originalReceipt,'synthetic-receipt');
  assert(!ui.location.href.includes('rfModule'));
  assert.deepEqual(ui.visits,[]);
  ui.press(ui.retry);ui.changed();
  assert.match(ui.showCheck().textContent,lang==='zh'?/正在查詢原操作回執/:/Đang tra biên nhận/);
  ui.clearCheck();ui.errorText.nodeValue='Failed to fetch';ui.changed();
  assert.match(ui.errorText.nodeValue,lang==='zh'?/暫時無法查詢回執/:/Tạm thời chưa tra được/);
 }
});

void test('whole-page FQC provides one IQC entry after rendering, without replacing the editor',()=>{
 for(const lang of ['zh','vi']){
  const ui=switchFixture(lang,{pageDraft:true});
  const entries=()=>ui.pagePanel.querySelectorAll('[data-module="1"]');
  assert.equal(entries().length,1);
  ui.changed();assert.equal(entries().length,1);
  assert.equal(entries()[0].textContent,'IQC');
  assert.equal(ui.localForm.value,'TEST ONLY unsaved notes');
 }
});

void test('only the original module control switches during lookup, and never reopens a stale owner',()=>{
 const ui=switchFixture('zh');
 ui.entry.disabled=true;ui.changed();
 assert.match(ui.loadingMarkup,/role="status"/);
 assert.doesNotMatch(ui.loadingMarkup,/<button/);
 assert.equal(ui.entry.disabled,false);
 ui.press(ui.entry);
 assert.deepEqual(ui.states(),[true,true,false,false,1]);
 ui.expireIdentity();ui.goBack();
 assert.deepEqual(ui.states(),[true,true,false,false,1]);
 assert.deepEqual(ui.visits,[]);
});


void test('IQC makes the plan prerequisites and empty stages accessible in both languages',async()=>{
 for(const lang of ['zh','vi']){
  const data={identity:{id:'synthetic',role:'admin'},permissions:{view:true,edit:true,create:true,settings:true},
    catalog:{version:'1',items:[],categories:[]},today:'2026-11-19',documents:[],jobs:[],cases:[],startDate:null,scheduleDue:false};
  const ui=switchFixture(lang,{data});
  ui.press(ui.entry);
  await new Promise(resolve=>setImmediate(resolve));
  let html=ui.iqcRoot.innerHTML;
  assert.match(html,/aria-current="page"/);
  assert.match(html,/ri-flow-return-arrow/);
  assert.match(html,lang==='zh'?/沒有可排程的 IQC 檢查項目/:/Chưa có hạng mục IQC để lập lịch/);
  assert.match(html,lang==='zh'?/模具檢查/:/Kiểm tra khuôn/);
  ui.stage('plan');
  html=ui.iqcRoot.innerHTML;
  assert.match(html,lang==='zh'?/目前沒有待處理的檢查計畫/:/Hiện chưa có kế hoạch cần xử lý/);
  assert.match(html,lang==='zh'?/前往檢查項目/:/Mở hạng mục kiểm tra/);
  for(const stage of ['fail','abnormal']){
   ui.stage(stage);
   assert.match(ui.iqcRoot.innerHTML,lang==='zh'?/目前沒有待處理項目/:/Hiện không có hạng mục cần xử lý/);
   assert.match(ui.iqcRoot.innerHTML,/rf-calendar-document-list/);
  }
 }
});

void test('IQC supplier filters keep selections visible in the summary and let users remove hidden picks',async()=>{
 const jobs=[
  ['week','weekly','2026-11-16','2026-11-22',['north','shared']],
  ['month','monthly','2026-11-01','2026-11-30',['south','shared']],
  ['quarter','quarterly','2026-10-01','2026-12-31',[]]
 ].map(([id,frequency,start,end,supplierIds])=>({id,itemId:id,start,end,
  source:{name:id+' inspection',code:id+'-check',products:[{code:id+'-part',name:id}],category:'Category',
   iqc:{categoryId:id==='quarter'?'other':'cat',partId:id,supplierIds},version:'1',frequency}}));
 const data={identity:{id:'synthetic',role:'admin'},permissions:{view:true,edit:true,create:true,settings:true},
  catalog:{version:'1',items:jobs,categories:[{id:'cat',name:'Category'},{id:'other',name:'Other'}],
   suppliers:['north','south','shared'].map(id=>({id,name:id}))},today:'2026-11-19',
  documents:[],jobs,cases:[],startDate:'2026-11-01',scheduleDue:false};
 for(const lang of ['zh','vi']){
  const ui=switchFixture(lang,{data}), html=()=>ui.iqcRoot.innerHTML;
  ui.press(ui.entry);
  await new Promise(resolve=>setImmediate(resolve));
  assert.match(html(),/data-ri-pick="quarter"/);
  ui.pick('week');ui.pick('month');
  ui.filter('supplier','south');
  assert.doesNotMatch(html(),/data-ri-pick="(?:week|quarter)"/);
  assert.match(html(),/data-ri-pick="month"\s+checked/);
  assert.match(html(),lang==='zh'?/已選 2 項[\s\S]*其中 1 項不在目前結果/:/Đã chọn 2 hạng mục[\s\S]*Trong đó có 1 hạng mục ngoài kết quả/);
  ui.action('toggle-hidden-picks');
  assert.match(html(),/aria-expanded="true" aria-controls="ri-hidden-picks"/);
  assert.match(html(),/week-part[\s\S]*2026-11-16 — 2026-11-22[\s\S]*remove-pick:week/);
  ui.action('clear-hidden-picks');
  assert.doesNotMatch(html(),/remove-pick:week/);
  assert.match(html(),/data-ri-pick="month"\s+checked/);
  ui.filter('supplier','shared');
  assert.match(html(),/data-ri-pick="week"/);
  assert.match(html(),/data-ri-pick="month"\s+checked/);
  assert.doesNotMatch(html(),/data-ri-pick="quarter"/);
  ui.filter('category','other');
  assert.doesNotMatch(html(),/data-ri-pick="(?:week|month|quarter)"/);
  ui.filter('supplier','');
  assert.match(html(),/data-ri-pick="quarter"/);
  assert.doesNotMatch(html(),/data-ri-pick="(?:week|month)"/);
  ui.filter('category','cat');
  assert.match(html(),/data-ri-pick="month"\s+checked/);
 }
});

function parityState(jobs,documents=[],cases=[]){
 return {stateRevision:1,identity:{id:'synthetic',role:'admin'},permissions:{view:true,edit:true,create:true,history:true},
  catalog:{version:1,items:jobs,categories:[]},today:'2026-11-19',documents,jobs,cases,startDate:'2026-01-01',scheduleDue:false};
}

function parityJob(id,{start='2026-11-01',end='2026-11-30',itemId=id,planId=null,completion}={}){
 return {id,itemId,start,end,planId,completion,
  source:{name:'TEST check '+itemId,code:'CHECK-'+itemId,products:[{code:'P',name:'Part'}],category:'Category',
   iqc:{categoryId:'cat',partId:'part',itemId},version:1,frequency:'monthly'}};
}

function parityDoc(id,kind,status,jobs,{inspections=[],caseId=null,planId=null,prior,expired}={}){
 const snapshot={start:'2026-11-19',end:'2026-11-19',inspections,lots:[],photos:[]};
 return {id,number:id,kind,status,jobs,caseId,planId,expired,issues:[],savedIssues:[],
  flow:{pendingId:status==='pending'?id+'-review':null,cases:status==='pending'||prior?
   [{id:id+'-review',status:prior||status,content:snapshot,actor:{name:'Synthetic reviewer',id:'reviewer'}}]:[],
   working:snapshot,active:{id:status==='approved'?id+'-approved':null,content:snapshot}}};
}

void test('IQC plan and report queues separate approvals and find original snapshots in both languages',async()=>{
 const job=parityJob('active',{planId:'APPROVED-PLAN'});
 const docs=[parityDoc('APPROVED-PLAN','plan','approved',[job]),parityDoc('PENDING-PLAN','plan','pending',[]),
  parityDoc('RETURNED-PLAN','plan','draft',[],{prior:'returned'}),
  parityDoc('APPROVED-REPORT','report','approved',[job],{planId:'APPROVED-PLAN'}),
  parityDoc('PENDING-REPORT','report','pending',[]),parityDoc('WITHDRAWN-REPORT','report','draft',[],{prior:'withdrawn'}),
  parityDoc('APPROVED-OTHER-REPORT','retest-report','approved',[])];
 for(const lang of ['zh','vi']){
  const ui=switchFixture(lang,{data:parityState([job],docs)}),html=()=>ui.iqcRoot.innerHTML;
  ui.press(ui.entry);await new Promise(resolve=>setImmediate(resolve));
  ui.stage('plan');
  assert.match(html(),/PENDING-PLAN/);
  assert.match(html(),lang==='zh'?/已發回 · 草稿/:/Đã trả lại · Bản nháp/);
  assert.doesNotMatch(html(),/APPROVED-PLAN/);
  ui.action('work:approved');
  assert.match(html(),/APPROVED-PLAN/);
  assert.doesNotMatch(html(),/PENDING-PLAN/);
  ui.stage('report');
  assert.match(html(),/PENDING-REPORT/);
  assert.match(html(),lang==='zh'?/已撤回 · 草稿/:/Đã rút · Bản nháp/);
  assert.doesNotMatch(html(),/APPROVED-REPORT/);
  ui.action('work:approved');ui.queryReports('APPROVED-PLAN');
  assert.match(html(),/APPROVED-REPORT/);
  assert.doesNotMatch(html(),/PENDING-REPORT|APPROVED-OTHER-REPORT/);

  const review=switchFixture(lang,{data:parityState([job],docs),review:true});
  await new Promise(resolve=>setImmediate(resolve));
  const [queue,history]=review.iqcRoot.innerHTML.split('data-ri-panel="review"');
  assert.match(queue,/PENDING-PLAN[\s\S]*PENDING-REPORT/);
  assert.doesNotMatch(queue,/APPROVED-PLAN|RETURNED-PLAN|WITHDRAWN-REPORT/);
  assert.match(history,/APPROVED-PLAN/);
  assert.match(history,/RETURNED-PLAN/);
  assert.match(history,/WITHDRAWN-REPORT/);
  review.action('review-kind:report');
  assert.match(review.iqcRoot.innerHTML,/PENDING-REPORT/);
  assert.doesNotMatch(review.iqcRoot.innerHTML,/PENDING-PLAN|APPROVED-OTHER-REPORT/);
 }
});

void test('each routine IQC document opens and filters only in routine approval IQC',async()=>{
 const kinds=['plan','report','retest-plan','retest-report','disposal','waiver'];
 const data=parityState([],kinds.map(kind=>parityDoc('IQC-PENDING-'+kind,kind,'pending',[])));
 for(const lang of ['zh','vi']){
  const source=switchFixture(lang,{data});
  source.press(source.entry);source.unlockFqc();
  await new Promise(resolve=>setImmediate(resolve));
  const review=switchFixture(lang,{data,review:true});
  await new Promise(resolve=>setImmediate(resolve));
  for(const kind of kinds){
   const id='IQC-PENDING-'+kind;
   source.action('review:'+id);
   const target=new URL(source.visits.at(-1));
   assert.equal(target.searchParams.get('view'),'approval');
   assert.equal(target.searchParams.get('approvalTab'),'routine');
   assert.equal(target.searchParams.get('rfModule'),'iqc');
   assert.equal(target.searchParams.get('riDocument'),id);
   review.action('review-kind:'+kind);
   const queue=review.iqcRoot.innerHTML.split('data-ri-panel="review"')[0];
   assert.deepEqual(Array.from(queue.matchAll(/data-ri-action="doc:([^"]+)"/g),match=>match[1]),[id]);
  }
 }
});

void test('IQC follows the FQC plan list and only exposes an applicable report overdue reason',async()=>{
 const job=parityJob('late-check',{planId:'DRAFT-PLAN'});
 const docs=[
  {...parityDoc('DRAFT-PLAN','plan','draft',[job]),createdAt:'2026-11-19T08:45:30.000+07:00'},
  parityDoc('DRAFT-REPORT','report','draft',[job],{planId:'DRAFT-PLAN'})
 ];
 for(const lang of ['zh','vi']){
  for(const due of ['2026-11-19','2026-11-20']){
   const data=parityState([job],docs);
   data.today=due;
   const ui=switchFixture(lang,{data});ui.press(ui.entry);
   await new Promise(resolve=>setImmediate(resolve));
   ui.stage('plan');
   assert.match(ui.iqcRoot.innerHTML,/rf-calendar-tools rf-work-states/);
   assert.match(ui.iqcRoot.innerHTML,/2026\/11\/19 08:45/);
   ui.action('doc:DRAFT-PLAN');
   assert.doesNotMatch(ui.iqcRoot.innerHTML,/data-ri-overdue-reason|data-ri-field="reason"/);
   ui.stage('report');ui.action('doc:DRAFT-REPORT');
   if(due==='2026-11-19')assert.match(ui.iqcRoot.innerHTML,/data-ri-overdue-reason hidden/);
   else{
    assert.match(ui.iqcRoot.innerHTML,/data-ri-overdue-reason >/);
    assert.match(ui.iqcRoot.innerHTML,lang==='zh'?/逾期送審原因/:/Lý do gửi quá hạn/);
   }
  }
 }
});

void test('shared mobile period filters use one date track at 320, 375, 390 and 430 CSS pixels',()=>{
 const style=postcss.parse(fs.readFileSync('public/process/routine-fqc.css','utf8'));
 for(const width of [320,375,390,430]){
  let columns;
  style.walkRules('.rf-period-search',rule=>{
   const limit=rule.parent.type==='atrule'?Number(rule.parent.params.match(/max-width:\s*(\d+)px/)?.[1]):Infinity;
   if(width>limit)return;
   rule.walkDecls('grid-template-columns',decl=>{columns=decl.value;});
  });
  assert.equal(columns,'minmax(0,1fr)','width '+width);
 }
 assert.match(style.toString(),/::-webkit-date-and-time-value\s*\{\s*min-width:0;\s*text-align:start/);
});

void test('IQC mobile flow keeps bilingual text and separate history and refresh controls',async()=>{
 const cases=[
  ['zh','該批復測申請核准後，回檢查報告','復測與結案說明','流程歷史','有效 IQC 主檔 · V5 · 6 個時間檢查規則','重新整理','排程開始日為 2026-11-20'],
  ['vi','Sau khi duyệt thử lại lô, quay về Báo cáo kiểm tra','Hướng dẫn thử lại và đóng hồ sơ','Lịch sử quy trình','Nguồn IQC hiện hành · V5 · 6 quy tắc theo thời gian','Tải lại','Lịch bắt đầu ngày 2026-11-20'],
 ];
 for(const [lang,returnNote,help,history,source,refresh,start] of cases){
  const data={...parityState([]),startDate:'2026-11-20',catalog:{version:5,items:Array.from({length:6},(_,i)=>parityJob('timed-'+i)),categories:[]}};
  const requests=[];
  const ui=switchFixture(lang,{simulateRequest:async(url,options)=>{
   requests.push(options.method||'GET');
   return Response.json(data);
  }});
  ui.press(ui.entry);
  await new Promise(resolve=>setImmediate(resolve));
  const html=ui.iqcRoot.innerHTML;
  assert.ok(html.includes('<div class="rf-retest-return"><span>'+returnNote+'</span>'));
  assert.ok(html.includes('<summary>'+help+'</summary>'));
  assert.ok(html.includes('data-ri-action="tab:history" aria-current="false">'+history+'</button>'));
  assert.ok(html.includes('<p class="rf-subtle">'+source+'</p>'));
  assert.ok(html.includes('data-ri-action="refresh" >'+refresh+'</button>'));
  assert.ok(html.includes('<p>'+start+'</p>'));
  assert.ok(requests.length>0&&requests.every(method=>method==='GET'));
 }
 const style=postcss.parse(fs.readFileSync('public/process/routine-iqc.css','utf8'));
 const layoutAt=width=>{
  const result={};
  style.walkRules('.ri-app :is(.ri-flow-actions,.ri-work-context)',rule=>{
   const limit=rule.parent.type==='atrule'?Number(rule.parent.params.match(/max-width:\s*(\d+)px/)?.[1]):Infinity;
   if(width>limit)return;
   rule.walkDecls(decl=>{result[decl.prop]=decl.value;});
  });
  return result;
 };
 for(const width of [320,375,390,430]){
  const properties=layoutAt(width);
  assert.equal(properties.display,'grid','width '+width);
  assert.equal(properties['grid-template-columns'],'minmax(0,1fr)','width '+width);
 }
 assert.equal(layoutAt(1024).display,'flex');
 const narrow=style.nodes.find(node=>node.type==='atrule'&&node.params==='(max-width: 480px)');
 const assertWrap=(fragment,minHeight)=>{
  const rule=narrow.nodes.find(node=>node.selector?.includes(fragment));
  const declarations=Object.fromEntries(rule.nodes.map(({prop,value})=>[prop,value]));
  assert.equal(declarations['min-inline-size'],'0',fragment);
  assert.equal(declarations['white-space'],'normal',fragment);
  assert.equal(declarations['overflow-wrap'],'anywhere',fragment);
  if(minHeight)assert.equal(declarations['min-height'],'44px',fragment);
 };
 for(const label of ['.rf-retest-return > span','.rf-flow-terminal','.rf-flow-help,','.ri-work-context > p','.ri-empty > :is(h3,p)']){
  assertWrap(label,false);
 }
 for(const button of ['.rf-modules > button','.ri-flow-actions > button','.ri-work-context > button','.rf-flow-help > summary']){
  assertWrap(button,true);
 }
});

void test('IQC retains active older work and adjacent periods, and folds older overdue and closed work',async()=>{
 const current=parityJob('nov',{itemId:'line'});
 const stillCurrent=parityJob('nov-shared',{itemId:'shared',planId:'SEPT-EXPIRED'});
 const prev=parityJob('oct',{itemId:'line',start:'2026-10-01',end:'2026-10-31'});
 const expired=parityJob('sept',{itemId:'line',start:'2026-09-01',end:'2026-09-30',planId:'SEPT-EXPIRED'});
 const active=parityJob('aug',{itemId:'line',start:'2026-08-01',end:'2026-08-31',planId:'AUG-PENDING'});
 const closed=parityJob('jul',{itemId:'line',start:'2026-07-01',end:'2026-07-31',planId:'JUL-WAIVER',completion:{kind:'skip'}});
 const future=parityJob('dec',{itemId:'future',start:'2026-12-01',end:'2026-12-31'});
 const docs=[parityDoc('SEPT-EXPIRED','plan','draft',[expired,stillCurrent],{expired:true}),parityDoc('AUG-PENDING','plan','pending',[active]),
  parityDoc('JUL-WAIVER','waiver','approved',[closed])];
 const ui=switchFixture('zh',{data:parityState([current,stillCurrent,prev,expired,active,closed,future],docs)}),html=()=>ui.iqcRoot.innerHTML;
 ui.press(ui.entry);await new Promise(resolve=>setImmediate(resolve));
 const [regular,older]=html().split('data-ri-older="line"');
 assert.match(regular,/data-ri-pick="nov"\s*>/);
 assert.match(regular,/data-ri-action="waive-period:nov"/);
 assert.doesNotMatch(html(),/data-ri-action="waive-period:(?:oct|aug|sept|jul|dec|nov-shared)"/);
 assert.match(html(),/rf-period-search" data-ri-period-search/);
 assert.match(html(),/rf-period-group-toggle/);
 assert.match(regular,/data-ri-pick="oct"\s+disabled[\s\S]*已逾期/);
 assert.match(regular,/data-ri-pick="aug"\s+disabled[\s\S]*待審核/);
 assert.doesNotMatch(regular,/data-ri-pick="(?:sept|jul)"/);
 assert.match(older,/data-ri-pick="sept"\s+disabled[\s\S]*已逾期/);
 assert.match(older,/data-ri-pick="jul"\s+disabled[\s\S]*當期已核准免測/);
 assert.match(html(),/data-ri-pick="dec"\s+disabled[\s\S]*未到開始日/);
 const ongoing=html().match(/data-ri-pick="nov-shared"[\s\S]*?<\/article>/)?.[0];
 assert.match(ongoing,/既有計畫含逾期項目，只能查看/);
 assert.doesNotMatch(ongoing,/rf-period-chip alert[^>]*>已逾期/);
 ui.queryPeriods({periodFrom:'2026-08-01',periodTo:'2026-09-30'});
 assert.match(html(),/data-ri-pick="sept"/);
 assert.match(html(),/data-ri-pick="aug"/);
 assert.doesNotMatch(html(),/data-ri-pick="(?:nov|oct|jul|dec)"|data-ri-older/);
});

void test('IQC Back anchors the period and focuses the exact report entry when actions are duplicated',async()=>{
 const job=parityJob('period-origin',{completion:{kind:'pass'}});
 const batch={partId:'part',batchNo:'0001',quantity:2,unit:'pcs'};
 const report=parityDoc('ORIGINAL-REPORT','report','approved',[job],{
  inspections:[{id:'test-result',jobId:job.id,batch,outcome:'pass',photos:[]}]
 });
 const action='history-doc:'+report.id;
 for(const [lang,viewport,initialY,rowTop,shortcutTop,historyTop] of [
  ['zh',1180,544,959,1032,1170], ['vi',390,1320,1350,1560,1648]
 ]){
  const f=manualUI(),{document,Node}=canvasDOM(),root=document.createElement('section');
  document.body.append(root);
  f.win.innerWidth=viewport;f.win.scrollY=initialY;f.win.scrollX=0;
  f.win.scrollTo=({top})=>{f.win.scrollY=top;};
  Node.prototype.getClientRects=()=>[{}];
  Node.prototype.getBoundingClientRect=function(){
   const top=this.dataset.riPeriod?rowTop:this.tagName==='A'?shortcutTop:historyTop;
   return {top:top-f.win.scrollY};
  };
  const data=parityState([job],[report]);
  const ui=switchFixture(lang,{data,listNavigation:{
   keepListAnchor:f.win.RoutineFQCUI.keepListAnchor,
   revealRoutineDetail(){f.win.scrollY=initialY+138;}
  }});
  let rendered;
  const readDOM=()=>{
   if(rendered!==ui.iqcRoot.innerHTML){rendered=ui.iqcRoot.innerHTML;root.innerHTML=rendered;}
   return root;
  };
  ui.iqcRoot.querySelectorAll=selector=>readDOM().querySelectorAll(selector);
  ui.press(ui.entry);await new Promise(resolve=>setImmediate(resolve));
  ui.action('toggle-group:period-origin');
  const row=()=>readDOM().querySelector('[data-ri-period="period-origin"]');
  const selectorFor=tag=>tag+'[data-ri-action="'+action+'"]';
  const openingY=row().getBoundingClientRect().top;
  const history=()=>row().querySelector('.rf-period-history');
  history().open=true;
  for(const tag of ['button','a']){
   const initial=row().querySelector(selectorFor(tag));
   assert.equal(row().querySelectorAll('[data-ri-action="'+action+'"]').length,2);
   ui.clickControl(initial);
   assert.match(ui.iqcRoot.innerHTML,lang==='zh'?/返回檢查項目/:/Về hạng mục kiểm tra/);
   assert.match(ui.iqcRoot.innerHTML,/<h3>ORIGINAL-REPORT/);
   assert.doesNotMatch(ui.iqcRoot.innerHTML,/data-ri-period="period-origin"/);
   assert.equal(f.win.scrollY,initialY+138);
   ui.clickControl(readDOM().querySelector('[data-ri-action="back"]'));
   assert.equal(history().getAttribute('open'),'');
   assert.equal(f.win.scrollY,initialY);
   assert.equal(row().getBoundingClientRect().top,openingY);
   assert.equal(document.activeElement,row().querySelector(selectorFor(tag)));
  }
 }
});

void test('IQC explains missing exemption only where no applicable period is listed',async()=>{
 for(const lang of ['zh','vi']){
  const ready=parityJob('ready'), draft=parityJob('draft',{planId:'PLAN-D'}),
   pending=parityJob('pending',{planId:'PLAN-P'}), processed=parityJob('processed',{completion:{kind:'pass'}}),
   overdue=parityJob('past',{start:'2026-10-01',end:'2026-10-31'});
  const docs=[parityDoc('PLAN-D','plan','draft',[draft]),parityDoc('PLAN-P','plan','pending',[pending])];
  const without=switchFixture(lang,{data:parityState([draft,pending,processed,overdue],docs)});
  without.press(without.entry);await new Promise(resolve=>setImmediate(resolve));
  assert.match(without.iqcRoot.innerHTML,/ri-waiver-note/);
  assert.doesNotMatch(without.iqcRoot.innerHTML,/data-ri-action="waive-period:/);
  const withReady=switchFixture(lang,{data:parityState([ready,draft,pending,processed,overdue],docs)});
  withReady.press(withReady.entry);await new Promise(resolve=>setImmediate(resolve));
  assert.doesNotMatch(withReady.iqcRoot.innerHTML,/ri-waiver-note/);
  assert.deepEqual([...withReady.iqcRoot.innerHTML.matchAll(/data-ri-action="waive-period:([^"]+)"/g)].map(row=>row[1]),['ready']);
 }
});

void test('IQC takes follow-ups from the true inspection and batch and preserves partial retest success',async()=>{
 const batch={partId:'part',batchNo:'0002',quantity:7,unit:'pcs'};
 const ids=['original-pass','retest-pass','still-fail'];
 const jobs=ids.map(id=>parityJob(id,{planId:'PLAN',completion:{kind:id==='original-pass'?'pass':'fail'}}));
 const inspection=(jobId,outcome)=>({jobId,batch,outcome,photos:[]});
 const docs=[parityDoc('PLAN','plan','approved',jobs),
  parityDoc('FIRST-REPORT','report','approved',jobs,{inspections:ids.map(id=>inspection(id,id==='original-pass'?'pass':'fail')),planId:'PLAN'}),
  parityDoc('RETEST-REPORT','retest-report','approved',jobs.slice(1),{caseId:'failure',inspections:[inspection(ids[1],'pass'),inspection(ids[2],'fail')]}),
  parityDoc('FOLLOWUP','retest-plan','pending',[jobs[2]],{caseId:'failure'})];
 const failure={id:'failure',originReportId:'FIRST-REPORT',result:'fail',status:'open',reports:['FIRST-REPORT','RETEST-REPORT'],jobIds:[ids[2]],batch};
 const ui=switchFixture('zh',{data:parityState(jobs,docs,[failure])}),html=()=>ui.iqcRoot.innerHTML;
 ui.press(ui.entry);await new Promise(resolve=>setImmediate(resolve));
 const result=id=>html().match(new RegExp('data-ri-pick="'+id+'"[\\s\\S]*?</article>'))?.[0];
 assert.match(result('original-pass'),/ERP 0002[\s\S]*合格 · 已結案/);
 assert.doesNotMatch(result('original-pass'),/不合格|case:failure/);
 assert.match(result('retest-pass'),/第 1 次：不合格 · 第 2 次：合格 · 曾未合格 · 最終合格結案/);
 assert.match(result('still-fail'),/第 1 次：不合格 · 第 2 次：不合格 · 復測申請 · 待審核/);
 assert.match(result('still-fail'),/rf-location-link" data-ri-action="case:failure">不合格 · ERP 0002/);
 assert.doesNotMatch(result('still-fail'),/waive-period:/);

 ui.queryPeriods({outcome:'retest-pass'});
 assert.match(html(),/data-ri-pick="retest-pass"/);
 assert.doesNotMatch(html(),/data-ri-pick="(?:original-pass|still-fail)"/);
 ui.stage('plan');assert.doesNotMatch(html(),/FOLLOWUP/);
 ui.stage('fail');assert.match(html(),/復測申請 · 待審核/);
 ui.action('case:failure');
 assert.match(html(),/FOLLOWUP/);
 assert.doesNotMatch(html(),/data-ri-action="create-retest/);
 ui.stage('report');ui.action('work:approved');ui.action('doc:FIRST-REPORT');
 assert.match(html(),/data-approved-result="pass"[\s\S]*data-approved-result="fail"/);

 failure.status='retest';
 docs[3]=parityDoc('FOLLOWUP','retest-plan','approved',[jobs[2]],{caseId:'failure'});
 const after=switchFixture('zh',{data:parityState(jobs,docs,[failure])}),afterHtml=()=>after.iqcRoot.innerHTML;
 after.press(after.entry);await new Promise(resolve=>setImmediate(resolve));
 after.stage('fail');assert.doesNotMatch(afterHtml(),/data-ri-action="case:failure"/);
 after.stage('report');assert.match(afterHtml(),/data-ri-action="create-report:FOLLOWUP"/);
});

void test('IQC distinguishes approved disposal, successful retest and mixed closed batches in each period',async()=>{
 const jobs=['disposed','passed-after-retest','mixed'].map(id=>
  parityJob(id,{completion:{kind:'abnormal'}}));
 const batch=(batchNo)=>({partId:'part',batchNo,quantity:7,unit:'pcs'});
 const failed=batch('0002'), clean=batch('0003');
 const report=(job,id,inspections)=>parityDoc(id,'report','approved',[job],{inspections:inspections.map(([batch,outcome])=>({jobId:job.id,batch,outcome,photos:[]}))});
 const caseFor=(job,number,result,status,reports=[])=>({id:job.id,originReportId:number,result,status,reports,batch:failed,jobIds:[job.id]});
 const [disposed,retested,mixed]=jobs;
 const docs=[report(disposed,'DISPOSED-ORIGINAL',[[failed,'abnormal']]),
  report(retested,'RETESTED-ORIGINAL',[[failed,'fail']]),
  parityDoc('FINAL-RETEST','retest-report','approved',[retested],{caseId:retested.id,
    inspections:[{jobId:retested.id,batch:failed,outcome:'pass',photos:[]}]}),
  report(mixed,'MIXED-ORIGINAL',[[failed,'abnormal'],[clean,'pass']])];
 const cases=[caseFor(disposed,'DISPOSED-ORIGINAL','abnormal','disposed'),
  caseFor(retested,'RETESTED-ORIGINAL','fail','closed',['FINAL-RETEST']),
  caseFor(mixed,'MIXED-ORIGINAL','abnormal','disposed')];
 for(const lang of ['zh','vi']){
  const ui=switchFixture(lang,{data:parityState(jobs,docs,cases)});
  ui.press(ui.entry);await new Promise(resolve=>setImmediate(resolve));
  const status=id=>{
   const row=ui.iqcRoot.innerHTML.split('data-ri-period="'+id+'"')[1].split('</article>')[0];
   return row.match(/class="rf-period-chip [^"]+">([^<]+)/)[1];
  };
  assert.equal(status('disposed'),lang==='zh'?'處置核准 · 已結案':'Đã duyệt xử lý · Đã đóng');
  assert.equal(status('passed-after-retest'),lang==='zh'?'曾經不合格 · 最終合格結案':'Từng không đạt · Cuối cùng đạt và đã đóng');
  assert.equal(status('mixed'),lang==='zh'?'已結案':'Đã đóng');
 }
});

void test('IQC never resends an unknown write, keeps a missing receipt, and distinguishes confirmed write from failed readback',async()=>{
 for(const lang of ['zh','vi']){
  const state=parityState([]);
  let configured=false,post=0,lookups=0,lastOperation=null,failReload=true,confirmed=false;
  state.permissions.settings=true;
  state.startDate=null;
  const simulateRequest=async(url,options)=>{
   if(options?.method==='POST'){
    ++post;lastOperation=JSON.parse(options.body).operationId;
    throw new Error('TEST ONLY interrupted response');
   }
   if(url.includes('?operationId=')){
    assert.equal(new URL(url,fixtureOrigin).searchParams.get('operationId'),lastOperation);
    if(++lookups===1)return Response.json({error:'OPERATION_NOT_FOUND'},{status:404});
    confirmed=true;
    return Response.json({result:{}});
   }
   if(confirmed&&!configured&&failReload){
    failReload=false;
    return Response.json({error:'REVISION_CONFLICT'},{status:409});
   }
   configured=confirmed;
   return Response.json({...state,startDate:configured?'2026-11-19':null});
  };
  const ui=switchFixture(lang,{simulateRequest,confirmAction:true}),html=()=>ui.iqcRoot.innerHTML;
  const flush=()=>new Promise(resolve=>setImmediate(resolve));
  ui.press(ui.entry);await flush();
  ui.action('configure');await flush();
  assert.match(html(),lang==='zh'?/操作結果待確認/:/Chưa xác định kết quả thao tác/);
  assert.equal(ui.pendingWrites.get('routine-iqc-receipt:synthetic'),lastOperation);
  ui.action('receipt');await flush();
  assert.match(html(),lang==='zh'?/目前尚無回執/:/Chưa có biên nhận/);
  assert.equal(ui.pendingWrites.get('routine-iqc-receipt:synthetic'),lastOperation);
  assert.equal(post,1);
  ui.action('receipt');await flush();
  assert.match(html(),lang==='zh'?/操作已確認。請更新清單/:/Đã xác nhận thao tác. Hãy tải lại danh sách/);
  assert.doesNotMatch(html(),/data-ri-action="receipt"/);
  assert.equal(ui.pendingWrites.size,0);
  ui.action('refresh');await flush();
  assert.doesNotMatch(html(),lang==='zh'?/操作已確認。請更新清單/:/Đã xác nhận thao tác. Hãy tải lại danh sách/);
  assert.equal(post,1);
 }
});

void test('routine review badge composes FQC and IQC counts without losing either module after refresh',async()=>{
 const plan=parityDoc('PLAN','plan','pending',[]);
 const state=parityState([],[plan]);state.revision=11;
 const ui=switchFixture('zh',{data:state,review:true,fqcPending:2});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(ui.pendingBadge.textContent,'3');
 ui.fqcRefresh(3);
 assert.equal(ui.pendingBadge.textContent,'4');
 state.revision++;
 state.documents=[parityDoc('PLAN','plan','approved',[])];
 ui.action('refresh');await new Promise(resolve=>setImmediate(resolve));
 assert.equal(ui.pendingBadge.textContent,'3');
 assert.match(ui.iqcRoot.innerHTML,/IQC 待審案件 · 0/);
});

for (const [name, availability] of Object.entries({
 disabled:{fqc:false,iqc:false}, fqcOnly:{fqc:true,iqc:false}, both:{fqc:true,iqc:true},
})) void test('routine approval background does not read inactive or denied modules: '+name, async()=>{
 const requests=[];
 const ui=switchFixture('zh',{fqcPending:2,badgeAvailability:availability,simulateRequest:(url,options)=>{
  requests.push([url,options.method||'GET']);
  return Promise.resolve(Response.json({revision:10,identityId:'synthetic',pendingCount:3}));
 }});
 await ui.refreshApprovalCounts();
 assert.deepEqual(ui.fqcBadgeReads,availability.fqc?['pending-count']:[]);
 assert.deepEqual(requests,availability.iqc?[['/api/routine-iqc?pending-count=1','GET']]:[]);
 assert.equal(ui.badgeErrors.length,0);
 if(availability.iqc)assert.equal(ui.pendingBadge.textContent,'5');
});

void test('routine IQC pending errors remain visible to diagnostics without retry', async()=>{
 let requests=0;
 const ui=switchFixture('zh',{fqcPending:2,badgeAvailability:{fqc:true,iqc:true},simulateRequest:()=>{
  requests++;return Promise.resolve(Response.json({error:'UNAVAILABLE'},{status:503}));
 }});
 await ui.refreshApprovalCounts();
 assert.equal(requests,1);
 assert.equal(ui.badgeErrors.length,1);
 assert.match(ui.badgeErrors[0][1].message,/503/);
 assert.equal(ui.pendingBadge.textContent,'2');
});

void test('same-state FQC and IQC plan and report details bind to the selected source and its saved evidence',async()=>{
 const jobs=['selected-1','selected-2','not-selected'].map(id=>parityJob(id,{planId:'PLAN'}));
 for(const job of jobs){
  Object.assign(job.source,{id:job.itemId,versionId:'approved-source',line:'Line A',errorCode:'Test code',
   description:'Method '+job.id+' · Standard '+job.id});
  Object.assign(job.source.iqc,{method:'Method '+job.id,inspectionSpecification:'Standard '+job.id});
  job.calendar={scope:job.id};
 }
 const selected=jobs.slice(0,2), batch={partId:'part',batchNo:'0007',quantity:4,unit:'pcs'};
 const proof='a'.repeat(64);
 const inspections=selected.map(job=>({id:'row-'+job.id,jobId:job.id,batch,outcome:'fail',
  value:'Reading '+job.id,notes:'Finding '+job.id,photos:[proof]}));
 for(const lang of ['zh','vi']){
  for(const state of ['draft','pending','approved']){
   for(const kind of ['plan','report','retest-report']){
    const isReport=kind!=='plan';
    const candidate=parityDoc(isReport?'REPORT':'PLAN',kind,state,selected,{inspections:isReport?inspections:[],planId:isReport?'PLAN':null,
     prior:state==='approved'?'approved':undefined});
    const title=isReport?'Inspection QA report':'Inspection QA plan', notes='Document note QA';
    Object.assign(candidate.flow.working,{title,notes,date:'2026-11-19',lots:[batch]});
    const iqcPlan=parityDoc('PLAN','plan','approved',selected);
    const ui=switchFixture(lang,{data:parityState(jobs,isReport?[iqcPlan,candidate]:[candidate])});
    ui.press(ui.entry);await new Promise(resolve=>setImmediate(resolve));ui.stage(isReport?'report':'plan');
    if(state==='approved')ui.action('work:approved');
    const list=ui.iqcRoot.innerHTML;
    assert.match(list,new RegExp(title));
    assert.match(list,lang==='zh'?/2 項/:/2 hạng mục/);
    ui.action('doc:'+candidate.id);
    const iqc=ui.iqcRoot.innerHTML.match(/<article class="rf-document">[\s\S]*?<\/article>/)?.[0];
    assert.ok(iqc);
    const fqcRows=selected.map((job,index)=>({id:'fqc-'+job.id,jobId:job.id,source:job.source,
     results:isReport?[{...inspections[index],samples:['P'],sampleCount:1}]:[]}));
    const content={title,notes,date:'2026-11-19',planStart:'2026-11-19',planEnd:'2026-11-19',reason:'',evidence:[],lines:fqcRows};
    const flow={generation:'one',revision:1,working:content,active:{id:state==='approved'?'v1':null,content},saves:[],
     pendingId:state==='pending'?'review':null,cases:state==='pending'?[{id:'review',content,status:'pending',actor:{id:'reviewer',name:'Reviewer'}}]:[]};
    const doc={id:candidate.id,number:candidate.id,calendarVersion:2,kind:isReport?'report':'plan',planId:isReport?'PLAN':null,
     familyId:candidate.id,createdAt:'2026-11-19T08:45:00+07:00',owner:{name:'QA'},flow};
    const baselinePlan={...doc,id:'PLAN',number:'PLAN',kind:'plan',planId:null,
     flow:{...flow,pendingId:null,active:{id:'plan-v1',content:{...content,lines:fqcRows.map(row=>({...row,results:[]}))}}}};
    const f=manualUI({remote:{today:'2026-11-19',revision:1,identity:{id:'owner'},
     permissions:{view:true,edit:true,create:true,history:true},sources:jobs.map(job=>job.source),catalog:{},
     control:{revision:1,startDate:'2026-01-01',calendarPolicy:{version:2,scopes:{}},jobs,cases:[],documents:isReport?[baselinePlan,doc]:[doc]}}});
    f.document.documentElement.lang=lang;
    f.api.s.tab=isReport?'reports':'plans';f.api.s.selected=doc.id;f.paint();
    const fqc=f.root.innerHTML;
    const checklist=lang==='zh'?['文件名稱','展開當次標準','備註']:['Tên hồ sơ','Xem tiêu chuẩn tại thời điểm này','Ghi chú'];
    for(const markup of [fqc,iqc]){
     for(const value of [...checklist,title,notes,'TEST check selected-1','TEST check selected-2','Standard selected-1','Standard selected-2'])assert.ok(markup.includes(value),lang+' '+kind+' '+state+' '+value);
     assert.ok(markup.indexOf('TEST check selected-1')<markup.indexOf('TEST check selected-2'));
     assert.doesNotMatch(markup,/TEST check not-selected|Standard not-selected/);
     if(isReport){
      for(const value of ['Reading selected-1','Finding selected-1',proof])assert.ok(markup.includes(value),lang+' '+kind+' '+state+' '+value);
     }else{
      for(const value of (lang==='zh'?['計畫起日','計畫迄日']:['Ngày bắt đầu','Hạn kết thúc']))assert.ok(markup.includes(value));
      assert.doesNotMatch(markup,lang==='zh'?/逾期送審原因/:/Lý do gửi quá hạn/);
     }
    }
    if(isReport){
     assert.match(iqc,/ERP 0007<\/strong> · 4 pcs/);
     assert.equal(/data-ri-photo=/.test(iqc),state==='draft');
     assert.equal(/data-ri-key="value" readonly/.test(iqc),state!=='draft');
    }else assert.equal(/data-ri-field="title" type="text" value="[^"]*" readonly/.test(iqc),state!=='draft');
   }
  }
 }
});

void test('IQC failure detail preserves all originally failed rows and their attachments for exactly one ERP batch',async()=>{
 const jobs=['earlier-recovered','still-fails','same-batch-pass'].map(id=>parityJob(id,{planId:'PLAN'}));
 const batch={partId:'part',batchNo:'0002',quantity:7,unit:'pcs'}, otherBatch={...batch,batchNo:'0003'};
 const evidence=['a','b','c','d'].map(id=>id.repeat(64));
 const row=(job,outcome,lot,photoId)=>({id:job.id+lot.batchNo,jobId:job.id,batch:lot,outcome,
  value:'Original value '+job.id,notes:'Original notes '+job.id,photos:[photoId]});
 jobs.forEach(job=>job.source.description='Historical standard '+job.id);
 const original=parityDoc('ORIGINAL','report','approved',jobs,{planId:'PLAN',inspections:[
  row(jobs[0],'fail',batch,evidence[0]),row(jobs[1],'fail',batch,evidence[1]),
  row(jobs[2],'pass',batch,evidence[2]),row(jobs[1],'fail',otherBatch,evidence[3])
 ]});
 for(const lang of ['zh','vi']){
  for(const stage of ['initial','draft','pending','report-ready','retest-fail','closed']){
   const failure={id:'failure',originReportId:'ORIGINAL',result:'fail',
    status:stage==='report-ready'?'retest':stage==='closed'?'closed':'open',
    reports:['ORIGINAL'],jobIds:[jobs[1].id],batch};
   const docs=[original];
   if(stage==='draft'||stage==='pending'||stage==='report-ready'||stage==='retest-fail'||stage==='closed')
    docs.push(parityDoc('RETEST-REQUEST','retest-plan',stage==='draft'||stage==='pending'?stage:'approved',[jobs[1]],{caseId:'failure'}));
   if(stage==='retest-fail'||stage==='closed'){
    docs.push(parityDoc('RETEST-RESULT','retest-report','approved',[jobs[1]],{caseId:'failure',planId:'RETEST-REQUEST',
     inspections:[row(jobs[1],stage==='closed'?'pass':'fail',batch,evidence[1])] }));
    failure.reports.push('RETEST-RESULT');
    failure.disposalAvailable=stage==='retest-fail';
   }
   const ui=switchFixture(lang,{data:parityState(jobs,docs,[failure])});ui.press(ui.entry);
   await new Promise(resolve=>setImmediate(resolve));
   ui.stage('fail');ui.action('case:'+failure.id);
   const html=ui.iqcRoot.innerHTML, detail=html.split('class="ri-original-result"')[1];
   assert.ok(detail,lang+' '+stage);
   for(const value of ['ERP 0002','7 pcs','TEST check earlier-recovered','Historical standard still-fails',evidence[0],evidence[1]])assert.ok(detail.includes(value));
   assert.doesNotMatch(detail,new RegExp('ERP 0003|TEST check same-batch-pass|'+evidence[2]+'|'+evidence[3]));
   assert.equal(/data-ri-action="create-retest:failure"/.test(html),['initial','retest-fail'].includes(stage));
   assert.equal(/data-ri-action="create-report:RETEST-REQUEST"/.test(html),stage==='report-ready');
   assert.equal(/data-ri-action="create-disposal:failure"/.test(html),stage==='retest-fail');
   if(stage==='draft'||stage==='pending')assert.match(html,lang==='zh'?/接續處理 · RETEST-REQUEST/:/Tiếp tục xử lý · RETEST-REQUEST/);
   if(stage==='retest-fail'||stage==='closed')assert.match(detail,/RETEST-RESULT/);
   if(stage==='closed')assert.match(html,lang==='zh'?/最新已核准結果 · 合格/:/Kết quả đã duyệt mới nhất · Đạt/);

   const originJob={...jobs[1],calendar:{scope:'fqc-origin'},completion:{kind:'fail',reportId:'ORIGINAL'}};
   const retestJob={...originJob,id:'fqc-retest',planId:'RETEST-REQUEST',calendar:{...originJob.calendar,retestCaseId:failure.id}};
   retestJob.completion=stage==='closed'||stage==='retest-fail'?
    {kind:stage==='closed'?'pass':'fail',reportId:'RETEST-RESULT'}:null;
   const fqcDocs=docs.map(doc=>{
    const retest=doc.id!=='ORIGINAL',isReport=doc.kind!=='retest-plan',job=retest?retestJob:originJob;
    const outcome=stage==='closed'&&retest?'pass':'fail';
    const snapshot={title:doc.number,date:'2026-11-19',planStart:'2026-11-19',planEnd:'2026-11-19',notes:'',reason:'',evidence:[],
     lines:[{id:'fqc-check',jobId:job.id,source:job.source,results:isReport?[{id:'measurement',outcome,samples:['P'],photos:[evidence[1]],notes:'finding'}]:[]}]};
    return {id:doc.id,number:doc.number,kind:isReport?'report':'plan',calendarVersion:2,owner:{name:'QA'},
     caseId:retest?failure.id:null,retestApplicationCaseId:!isReport?failure.id:null,createdAt:'2026-11-19T09:00:00+07:00',planId:doc.planId,
     flow:{working:snapshot,active:{id:doc.status==='approved'?'approved':null,content:snapshot},
      pendingId:doc.status==='pending'?'pending':null,cases:doc.status==='pending'?[{id:'pending',status:'pending',content:snapshot,actor:{name:'Reviewer'}}]:[]}};
   });
   const fqcJobs=['report-ready','retest-fail','closed'].includes(stage)?[originJob,retestJob]:[originJob];
   const fqcCase={...failure,number:'FQC-CASE',jobId:originJob.id,reportIds:failure.reports,
    workflowOutcome:stage==='closed'?'pass':'fail'};
   const f=manualUI({remote:{today:'2026-11-19',revision:1,identity:{id:'owner'},
    permissions:{view:true,edit:true,create:true,history:true},sources:[originJob.source],catalog:{},
    control:{revision:1,startDate:'2026-01-01',calendarPolicy:{version:2,scopes:{}},jobs:fqcJobs,cases:[fqcCase],documents:fqcDocs}}});
   f.document.documentElement.lang=lang;
   f.api.s.tab='failed';f.api.s.selected=fqcCase.id;f.paint();
   const fqc=f.root.innerHTML;
   assert.match(fqc,lang==='zh'?/最新已核准結果 · (?:不)?合格/:/Kết quả đã duyệt mới nhất · (?:Không đạt|Đạt)/);
   assert.match(fqc,/data-timeline-doc="ORIGINAL"/);
   assert.equal(/data-action="calendar-retest"/.test(fqc),['initial','retest-fail'].includes(stage));
   if(stage==='draft'||stage==='pending')assert.match(fqc,lang==='zh'?/接續申請 · RETEST-REQUEST/:/Tiếp tục đề nghị · RETEST-REQUEST/);
   if(stage==='retest-fail'||stage==='closed')assert.match(fqc,/data-timeline-doc="RETEST-RESULT"/);
  }
 }
});

void test('only the active IQC inspection workspace requests the routine approval sidebar destination',async()=>{
 const plan=parityDoc('STALE-REVIEW','plan','approved',[]);
 const data=parityState([], [plan]);
 const iqc=switchFixture('zh',{data,displayDocument:plan.id});
 assert.equal(iqc.opensRoutineApproval(),false);
 iqc.press(iqc.entry);await new Promise(resolve=>setImmediate(resolve));
 assert.equal(iqc.opensRoutineApproval(),true);
 assert.doesNotMatch(iqc.iqcRoot.innerHTML,/<h3>STALE-REVIEW/);
 const review=switchFixture('zh',{data,review:true,displayDocument:plan.id});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(review.opensRoutineApproval(),false);
 assert.match(review.iqcRoot.innerHTML,/<h3>STALE-REVIEW/);
 iqc.goBack();
 assert.equal(iqc.opensRoutineApproval(),false);
});

void test('the ordinary IQC Save sends edited titles for each plan and report, and reads back the saved title',async()=>{
 for(const kind of ['plan','report','retest-plan','retest-report']){
  const doc=parityDoc('SYNTHETIC-'+kind,kind,'draft',[]);
  const data=parityState([], [doc]),writes=[];
  const ui=switchFixture('zh',{data,simulateRequest:async (_url,options)=>{
   if(options?.method==='POST'){
    const body=JSON.parse(options.body);
    writes.push(body);
    Object.assign(doc.flow.working,body.fields);
    return Response.json({result:{}});
   }
   return Response.json(data);
  }});
  ui.press(ui.entry);await new Promise(resolve=>setImmediate(resolve));
  ui.action('doc:'+doc.id);
  const title='TEST ONLY - '+kind;
  ui.input('title',title);
  ui.action('save');
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(writes.length,1);
  assert.equal(writes[0].draft.action,'save');
  assert.equal(writes[0].fields.title,title);
  assert.match(ui.iqcRoot.innerHTML,new RegExp('data-ri-field="title"[^>]*value="'+title+'"'));
 }
});

void test('IQC checkbox rerender anchors the active period and keeps the toolbar height stable near the end of the list',async()=>{
 const job=parityJob('scroll-last');
 for(const [lang,width,scroll,initialY,reflow] of [
  ['zh',1331,769,654,0],['zh',320,1890,118,36],['vi',390,1640,270,24],
 ]){
  const shared=manualUI(),{document,Node}=canvasDOM();
  const root=document.createElement('section');
  document.body.append(root);
  shared.win.innerWidth=width;
  shared.win.scrollX=0;
  shared.win.scrollY=scroll;
  const moves=[];
  let rendered,offset=0;
  const readDOM=()=>{
   if(rendered!==ui.iqcRoot.innerHTML){
    rendered=ui.iqcRoot.innerHTML;
    root.innerHTML=rendered;
    // Model a wrapped label above the row plus the browser's lower scroll clamp.
    // The extra summary panel would add still more space if it reappeared.
    offset=/data-ri-pick="scroll-last"\s+checked/.test(rendered)?reflow:0;
    if(root.querySelector('.ri-picks'))offset+=64;
    shared.win.scrollY=Math.min(shared.win.scrollY,scroll+offset);
   }
   return root;
  };
  shared.win.scrollTo=({top,behavior})=>{
   assert.equal(behavior,'instant');
   moves.push(top);
   shared.win.scrollY=Math.min(top,scroll+offset);
  };
  Node.prototype.getClientRects=()=>[{}];
  Node.prototype.getBoundingClientRect=function(){
   const base=this.dataset.riPick?scroll+initialY+offset:scroll-500;
   return {top:base-shared.win.scrollY};
  };
  const ui=switchFixture(lang,{data:parityState([job]),listNavigation:{keepListAnchor:shared.win.RoutineFQCUI.keepListAnchor}});
  const input=()=>readDOM().querySelector('[data-ri-pick="scroll-last"]');
  const count=()=>readDOM().querySelector('[data-ri-pick-count]');
  const querySelector=ui.iqcRoot.querySelector;
  ui.iqcRoot.querySelector=selector=>readDOM().querySelector(selector)||querySelector(selector);
  ui.iqcRoot.querySelectorAll=selector=>readDOM().querySelectorAll(selector);
  ui.press(ui.entry);await new Promise(resolve=>setImmediate(resolve));
  ui.action('toggle-group:scroll-last');

  for(const checked of [true,false]){
   const original=input();
   const before=original.getBoundingClientRect().top;
   ui.changePick(original,checked);
   const next=input();
   assert.notEqual(next,original,'the actual render replaced the input');
   assert.equal(next.hasAttribute('checked'),checked);
   assert.equal(document.activeElement,next);
   assert.equal(next.getBoundingClientRect().top,before,lang+' '+width);
   assert.equal(shared.win.scrollY,scroll+(checked?reflow:0));
   assert.equal(readDOM().querySelector('.ri-picks'),null);
   assert.equal(count().textContent,lang==='zh'?'已選 '+Number(checked)+' 項':'Đã chọn '+Number(checked)+' hạng mục');
  }
  assert.deepEqual(moves,reflow?[scroll+reflow]:[]);

  ui.changePick(input(),true);
  // Clear is in the toolbar, which is the keyboard/source view while it is used.
  shared.win.scrollY=scroll-520;
  const toolbarTop=count().getBoundingClientRect().top;
  ui.clickControl(readDOM().querySelector('[data-ri-action="clear-picks"]'));
  assert.equal(input().hasAttribute('checked'),false);
  assert.equal(count().getBoundingClientRect().top,toolbarTop);
  assert.equal(document.activeElement,readDOM().querySelector('[data-ri-filter="part"]'));
 }
});

void test('IQC visible outcome buttons edit only the chosen batch and preserve its other report evidence',async()=>{
 const jobs=[parityJob('item-a'),parityJob('item-b')];
 const lot=(batchNo,quantity)=>({partId:'part',batchNo,quantity,unit:'pcs'});
 const photo='a'.repeat(64);
 const rows=[
  {id:'row-a',jobId:'item-a',batch:lot('00123',5),outcome:'fail',value:'TEST ONLY 3.4',notes:'Previous note',photos:[photo]},
  {id:'row-b',jobId:'item-b',batch:lot('00124',2),outcome:'',value:'',notes:'',photos:[]}
 ];
 for(const [lang,kind] of [['zh','report'],['vi','retest-report']]){
  const doc=parityDoc('SYNTHETIC-DRAFT',kind,'draft',jobs,{inspections:structuredClone(rows)}),writes=[];
  const data=parityState(jobs,[doc]);
  const ui=switchFixture(lang,{data,simulateRequest:async (_url,options)=>{
   if(options?.method==='POST'){
    const body=JSON.parse(options.body);
    writes.push(body);
    Object.assign(doc.flow.working,body.fields);
    return Response.json({result:{}});
   }
   return Response.json(data);
  }});
  const {document}=canvasDOM(),root=document.createElement('section');
  document.body.append(root);
  let rendered;
  const readDOM=()=>{
   if(rendered!==ui.iqcRoot.innerHTML){rendered=ui.iqcRoot.innerHTML;root.innerHTML=rendered;}
   return root;
  };
  ui.iqcRoot.querySelectorAll=query=>readDOM().querySelectorAll(query);
  ui.press(ui.entry);await new Promise(resolve=>setImmediate(resolve));
  ui.stage('report');ui.action('doc:'+doc.id);
  const row=id=>readDOM().querySelector('[data-ri-inspection="row-'+id+'"]');
  const choice=(id,outcome)=>row(id).querySelector('button[data-outcome="'+outcome+'"]');
  assert.equal(row('a').querySelector('select'),null);
  assert.match(row('a').querySelector('[role="group"]').getAttribute('aria-label'),/TEST check item-a · ERP 00123/);
  assert.equal(row('a').querySelectorAll('[data-outcome]').length,3);
  assert.equal(choice('a','fail').getAttribute('aria-pressed'),'true');
  assert.equal(choice('b','fail').getAttribute('aria-pressed'),'false');
  ui.clickControl(row('a').querySelector('[data-ri-action="inspection-outcome:row-a:clear"]'));
  assert.equal(row('a').querySelectorAll('[aria-pressed="true"]').length,0);
  assert.equal(document.activeElement,choice('a','pass'));
  assert.equal(row('a').querySelector('[data-ri-action="inspection-outcome:row-a:clear"]').disabled,true);
  for(const outcome of ['pass','abnormal']){
   ui.clickControl(choice('a',outcome));
   assert.equal(choice('a',outcome).getAttribute('aria-pressed'),'true');
   assert.equal(row('a').querySelectorAll('[aria-pressed="true"]').length,1);
   assert.equal(row('b').querySelectorAll('[aria-pressed="true"]').length,0);
   assert.equal(document.activeElement,choice('a',outcome));
   assert.match(row('a').querySelector('a[href*="/photo"]').getAttribute('href'),new RegExp(photo));
  }
  assert.equal(writes.length,0);
  ui.action('save');await new Promise(resolve=>setImmediate(resolve));
  assert.equal(writes.length,1);
  assert.deepEqual(writes[0].fields.inspections,[{...rows[0],outcome:'abnormal'},rows[1]]);
  assert.equal(choice('a','abnormal').getAttribute('aria-pressed'),'true');

  for(const status of ['pending','approved']){
   const history=parityDoc('SYNTHETIC-READONLY',kind,status,jobs,{inspections:rows});
   const view=switchFixture(lang,{data:parityState(jobs,[history])});
   view.press(view.entry);await new Promise(resolve=>setImmediate(resolve));
   view.stage('report');view.action('doc:'+history.id);
   assert.doesNotMatch(view.iqcRoot.innerHTML,/inspection-outcome:/);
   assert.match(view.iqcRoot.innerHTML,lang==='zh'?/不合格/:/Không đạt/);
   assert.match(view.iqcRoot.innerHTML,new RegExp(photo));
  }
 }
});

void test('IQC confirmation is compact, protects the exact saved version and submits at most once',async()=>{
 for(const lang of ['zh','vi']){
  const job=parityJob('plan-item');
  const doc=parityDoc('SYNTHETIC-PLAN','plan','draft',[job]);
  doc.flow.saved={id:'internal-snapshot-do-not-display',actor:{name:'TEST ONLY author'},at:'2026-11-19T15:51:28.263Z',
   content:doc.flow.working};
  doc.flow.revision=4;
  doc.flow.generation='generation';
  const data=parityState([job],[doc]),writes=[];
  data.permissions.submit=true;
  const ui=switchFixture(lang,{data,manualDialog:true,simulateRequest:async(_url,options)=>{
   if(options?.method==='POST'){
    writes.push(JSON.parse(options.body));
    return Response.json({result:{}});
   }
   return Response.json(data);
  }});
  const {document}=canvasDOM(),root=document.createElement('section');
  document.body.append(root);
  ui.press(ui.entry);await new Promise(resolve=>setImmediate(resolve));
  ui.stage('plan');ui.action('doc:'+doc.id);
  root.innerHTML=ui.iqcRoot.innerHTML;
  const opener=root.querySelector('[data-ri-action="submit"]');
  ui.clickControl(opener);ui.clickControl(opener);
  assert.equal(ui.dialogCount(),1);
  const html=ui.adminMarkup();
  assert.match(html,/ri-submit-content[\s\S]*<dl>/);
  assert.match(html,/SYNTHETIC-PLAN[\s\S]*TEST ONLY author[\s\S]*2026\/11\/19 22:51/);
  assert.doesNotMatch(html,/internal-snapshot-do-not-display/);
  assert.match(html,lang==='zh'?/value="cancel" autofocus>取消[\s\S]*value="confirm">確認送審/:/value="cancel" autofocus>Hủy[\s\S]*value="confirm">Xác nhận gửi duyệt/);
  ui.closeDialog('cancel');await new Promise(resolve=>setImmediate(resolve));
  assert.equal(writes.length,0);
  assert.equal(document.activeElement,opener);
  ui.clickControl(opener);ui.clickControl(opener);
  assert.equal(ui.dialogCount(),2);
  ui.closeDialog('confirm');await new Promise(resolve=>setImmediate(resolve));
  assert.equal(writes.length,1);
  assert.equal(writes[0].draft.action,'submit');
  assert.equal(writes[0].draft.savedId,doc.flow.saved.id);
  assert.equal(writes[0].draft.expectedRevision,4);
  assert.equal(writes[0].draft.generation,'generation');
 }
});

void test('IQC controls use wrap-safe mobile tracks and FQC colors plus a non-color selected mark',()=>{
 const iqc=fs.readFileSync('public/process/routine-iqc.css','utf8'),fqc=fs.readFileSync('public/process/routine-fqc.css','utf8');
 assert.match(iqc,/\.ri-outcome-choices button\s*\{\s*flex:1 1 94px/);
 assert.match(iqc,/\.ri-submit-dialog\s*\{[^}]*width:min\(440px, calc\(100vw - 24px\)\)[^}]*overflow:auto/);
 assert.match(iqc,/\.ri-submit-dialog \.rf-actions\s*\{[^}]*repeat\(2, minmax\(0, 1fr\)\)[^}]*safe-area-inset-bottom/);
 assert.match(iqc,/\.ri-submit-dialog \.rf-actions \.rf-btn\s*\{[^}]*min-height:44px/);
 assert.match(fqc,/\[aria-pressed='true'\]::before\s*\{[^}]*rotate\(-45deg\)/);
 for(const hex of ['176443','a22837','744515']){
  const rgb=hex.match(/../g).map(value=>Number.parseInt(value,16)/255).map(value=>
   value<=0.04045?value/12.92:((value+0.055)/1.055)**2.4);
  const luminance=rgb[0]*0.2126+rgb[1]*0.7152+rgb[2]*0.0722;
  assert.ok(1.05/(luminance+0.05)>=4.5);
  assert.match(fqc,new RegExp('#'+hex));
 }
});
