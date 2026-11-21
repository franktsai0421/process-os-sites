import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {test} from 'node:test';
import {manualUI} from './fixtures/routine-fqc-manual-ui.mjs';

const require=createRequire(import.meta.url);
const load=require('../scripts/ipqc-ab-import-harness.cjs')();
const domain=load('lib/routine-fqc.ts'),{generateCalendar}=load('lib/routine-fqc-calendar.ts');
const today='2026-11-21',at=today+'T03:00:00Z';
const item=(id,productCodes,frequency='weekly')=>({id,name:id,line:'A',category:'SYN',isEnabled:true,productCodes,rule:{cadence:'time',timeFrequency:frequency}});
const items=[item('two-pairs',['P1','P2','P1']),item('unmapped',[]),item('same-code',['P1']),item('custom',['P2'],'custom'),
  item('missing-frequency',['P2'],''),{...item('pending',[]),rule:{cadence:'pending_confirmation'}},
  {...item('disabled',['P2']),isEnabled:false},{...item('arrival',[]),rule:{cadence:'event'}}];
items[3].rule.customTimeText='synthetic';
const state={values:{qualityMasterControl:JSON.stringify({libraries:{fqc:{activeVersionId:'approved',versions:[{id:'approved',status:'approved',number:1,reviewedAt:at,snapshot:{items}}]}}}),
  masterDataControl:JSON.stringify({active:{AB:{products:[{code:'P1',name:'Synthetic one'}]}}})}};
const sources=domain.routineSources(state),catalog=domain.routineCatalog(state);
const policy=()=>({version:2,adoptedAt:at,scopes:{}});
for(const lang of ['zh','vi'])void test('calendar readiness counts approved product scopes and preserves legacy semantics · '+lang,()=>{
  const ui=manualUI();ui.document.documentElement.lang=lang;
  Object.assign(ui.remote,{sources,catalog,today});
  const control=domain.emptyRoutine();
  const paint=()=>{ui.remote.control=control;ui.api.setData(structuredClone(ui.remote));ui.api.s.tab='sources';ui.paint();return ui.root.textContent;};
  assert(catalog.items.some(i=>i.id==='missing-frequency'&&i.enabled&&i.cadence==='time'));
  assert(!sources.some(i=>i.id==='missing-frequency'));
  const initial=paint();
  for(const re of lang==='zh'?[/已核准標準時間項目 3/,/已指定產品的項目 2/,/項目與產品配對 3/,/未指定產品的項目 1/,/指定產品並核准/,/非定期 1/,/停用 1/,/頻率待確認 3/]:
    [/Hạng mục có tần suất chuẩn đã duyệt 3/,/Hạng mục đã gán sản phẩm 2/,/Cặp hạng mục và sản phẩm 3/,/Hạng mục chưa gán sản phẩm 1/,/gán sản phẩm trong dữ liệu FQC/,/Không định kỳ 1/,/Đã tắt 1/,/Chờ xác nhận tần suất 3/])assert.match(initial,re);
  control.calendarPolicy=policy();control.startDate='2026-11-22';
  assert.equal(generateCalendar(control,sources,today,at),0);
  assert.match(paint(),lang==='zh'?/尚未到開始日期/:/Chưa đến ngày bắt đầu/);
  control.startDate=today;
  assert.equal(generateCalendar(control,sources,today,at),3);
  assert.deepEqual(Array.from(control.jobs,j=>j.itemId+'@'+j.calendar.productCode).sort(),['same-code@P1','two-pairs@P1','two-pairs@P2']);
  paint();
  const details=ui.root.querySelector('details.rf-source-readiness');
  assert(details);assert(!details.hasAttribute('open'));
  assert.match(details.querySelector('summary').textContent,lang==='zh'?/查看 FQC 排程來源/:/Xem nguồn lập lịch FQC/);
  assert.match(details.textContent,lang==='zh'?/未指定產品的項目 1/:/Hạng mục chưa gán sản phẩm 1/);
  assert.match(details.textContent,lang==='zh'?/頻率待確認 3/:/Chờ xác nhận tần suất 3/);
  // Existing code-only references still schedule, even when the product name is absent.
  assert.equal(control.jobs.find(j=>j.calendar.productCode==='P2').source.products[0].name,'P2');
  const lone=domain.emptyRoutine();lone.startDate=today;lone.calendarPolicy=policy();
  const unmapped=sources.filter(source=>source.id==='unmapped');
  assert.equal(generateCalendar(lone,unmapped,today,at),0);
  Object.assign(ui.remote,{control:lone,sources:unmapped,catalog:{...catalog,items:catalog.items.filter(i=>i.id==='unmapped')}});
  ui.api.setData(structuredClone(ui.remote));ui.paint();
  assert.match(ui.root.textContent,lang==='zh'?/已指定產品的項目 0.*項目與產品配對 0.*未指定產品的項目 1/:/Hạng mục đã gán sản phẩm 0.*Cặp hạng mục và sản phẩm 0.*Hạng mục chưa gán sản phẩm 1/);
  const legacy=domain.emptyRoutine();legacy.startDate=today;
  assert(domain.schedulePreview(legacy,sources,today,today).some(j=>j.itemId==='unmapped'));
  ui.remote.control=legacy;ui.api.setData(structuredClone(ui.remote));ui.paint();
  assert.doesNotMatch(ui.root.textContent,/未指定產品的時間項目不會產生期別|Hạng mục định kỳ chưa gán sản phẩm sẽ không tạo kỳ/);
});
