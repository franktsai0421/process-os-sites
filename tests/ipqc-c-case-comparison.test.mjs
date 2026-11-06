import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const source=fs.readFileSync('public/process/ipqc-c.js','utf8');
const start=source.indexOf('  function caseRowsById('),end=source.indexOf('  function caseHistoryHTML()',start),box={};vm.createContext(box);vm.runInContext(source.slice(start,end),box);
const row=(id,extra={})=>({id,deleted:false,standardEnabled:true,mediaItems:[],...extra});
void test('case comparison preserves exact first-match and serialization semantics for 1735 rows',()=>{
 const before={errors:Array.from({length:869},(_,i)=>row('e'+i)),items:Array.from({length:866},(_,i)=>row('i'+i))},after=structuredClone(before);after.items[7].standardEnabled=false;after.items[8].note='changed';
 const old=after.items.filter(item=>JSON.stringify(item)!==JSON.stringify(before.items.find(x=>x.id===item.id)));
 const actual=box.caseComparison(before,after);assert.equal(actual.changed,2);assert.deepEqual(JSON.parse(JSON.stringify(actual.changedItems)),old);assert.equal(actual.errorsBefore,869);assert.equal(actual.itemsAfter,866);
 const duplicate=[row('same',{note:'first'}),row('same',{note:'second'})];assert.equal(box.caseRowsById(duplicate)('same').note,'first');
 const malformed=[row(NaN),row(1)];assert.equal(box.caseRowsById(malformed)(NaN),undefined);assert.equal(box.caseRowsById(malformed)(1),malformed[1]);
});
void test('missing named base cannot manufacture zero counts or all-added changes',()=>{
 assert.equal(box.caseComparison(null,{errors:[row('e')],items:[row('i')]}),null);
 assert.match(source,/fixed\?\.before\|\|base\?\.snapshot\|\|\(!v\.baseVersionId\?/);
 assert.match(source,/基準版尚未載入/);assert.match(source,/comparison\?\.changedItems\|\|\[\]/);
});
void test('fixed case inactive and deleted labels differ without altering stored rows',()=>{
 const segment=source.slice(source.indexOf('const itemHTML=item=>'),source.indexOf('return `<div class="ipqcc-overlay"><section class="ipqcc-dialog ipqcc-case-dialog"'));
 const ctx={t:(vi,zh)=>zh,h:v=>String(v??''),ruleSummary:()=>'',photoUrl:()=>''};vm.createContext(ctx);vm.runInContext(segment+'\nthis.render=itemHTML;',ctx);
 for(const [extra,expected]of [[{standardEnabled:false},'停用'],[{standardEnabled:true},'使用中'],[{standardEnabled:false,deleted:true},'已刪除']]){const item=row('i',extra),before=JSON.stringify(item);assert(ctx.render(item).includes(expected));assert.equal(JSON.stringify(item),before);}
});
void test('actual approved review draw uses exact fixed before and never zero-fills an absent named base',()=>{
 const base={errors:[row('e')],items:[row('i')]},after=structuredClone(base);after.items[0].note='updated';
 const version={id:'approved',status:'approved',number:31,baseVersionId:'not-loaded',snapshot:after,history:[],creatorName:'Synthetic'};
 const body={innerHTML:'',insertAdjacentHTML(){}},root={isConnected:true,querySelector:()=>body,querySelectorAll:()=>[]};
 const ctx={reviewHost:root,control:{versions:[version],workflow:{cases:[]}},readAccessBlocked:()=>false,window:{VersionDraftUI:{preserveView:()=>()=>{}}},document:{activeElement:null,querySelector:()=>null},t:(vi,zh)=>zh,h:v=>String(v??''),date:()=>'',status:v=>v,message:'',pendingCount:()=>0,permitted:()=>false};
 vm.createContext(ctx);vm.runInContext(source.slice(start,end)+source.slice(source.indexOf('  function reviewDraw() {'),source.indexOf("  window.addEventListener('process-language-change'")),ctx);
 ctx.reviewDraw();assert(body.innerHTML.includes('基準版尚未載入'));assert(!body.innerHTML.includes('0 → 1'));assert(!body.innerHTML.includes('<code>i</code>'));
 ctx.control.workflow.cases=[{id:'approved',before:base}];ctx.reviewDraw();assert(body.innerHTML.includes('1 → 1'));assert(body.innerHTML.includes('變動 1'));assert(!body.innerHTML.includes('基準版尚未載入'));
});
