import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import {fixture} from './process-ipqc-adoption-fixture.mjs';
const source=fs.readFileSync('public/process/process-ipqc.js','utf8');
function formatter(code=source){
 const anchor='window.ProcessIPQC={';assert.equal(code.split(anchor).length,2);
 const box={document:{documentElement:{lang:'zh'}},createScopedReadPause:()=>({}),addEventListener(){},fetch(){throw Error('DISPLAY_MUST_NOT_FETCH');}};box.window=box;
 vm.runInNewContext(code.replace(anchor,'window.ProcessIPQC={formatFrequency:frequency,'),box);
 return(item,lang)=>{box.document.documentElement.lang=lang;return box.ProcessIPQC.formatFrequency(item);};
}
const format=formatter(),rule=r=>({rules:[r]});
/** @type {Array<[string, Record<string, unknown>, string, string]>} */
const cases=[
 ['C AQL',rule({cadence:'batch',batchKind:'aql',aqlValue:'0.25'}),'按批次 · AQL 0.25','Theo lô · AQL 0.25'],
 ['C AQL string zero',rule({cadence:'batch',batchKind:'aql',aqlValue:'0'}),'按批次 · AQL 0','Theo lô · AQL 0'],
 ['incomplete AQL',rule({cadence:'batch',batchKind:'aql'}),'按批次 · AQL','Theo lô · AQL'],
 ['AB AQL unchanged',rule({cadence:'batch',kind:'aql',value:'0.25'}),'按批次 · AQL · 0.25','Theo lô · AQL · 0.25'],
 ['AB fixed',rule({cadence:'batch',kind:'fixed',value:'3'}),'按批次 · 固定件數 · 3','Theo lô · Số mẫu · 3'],
 ['AB quantity',rule({cadence:'batch',kind:'quantity',value:'100'}),'按批次 · 批次數量 · 100','Theo lô · Số lượng lô · 100'],
 ['C fixed',rule({cadence:'batch',batchKind:'fixed_count',fixedCount:'3'}),'按批次 · 固定件數 · 3','Theo lô · Số lượng cố định · 3'],
 ['C quantity',rule({cadence:'batch',batchKind:'batch_quantity',batchQuantity:'100'}),'按批次 · 批次數量 · 100','Theo lô · Số lượng lô · 100'],
 ['C custom',rule({cadence:'batch',batchKind:'custom',customBatchText:'AQL audit',customBatchValue:'2 / 箱'}),'按批次 · 自訂 · AQL audit · 2 / 箱','Theo lô · Tùy chỉnh · AQL audit · 2 / 箱'],
 ['AB custom',rule({cadence:'batch',kind:'custom',name:'AQL audit',value:'2 / 箱'}),'按批次 · 自訂 · AQL audit · 2 / 箱','Theo lô · Tùy chỉnh · AQL audit · 2 / 箱'],
 ['time custom',rule({cadence:'time',timeFrequency:'custom',customTimeText:'每班 / Mỗi ca'}),'按時間 · 自訂 · 每班 / Mỗi ca','Theo thời gian · Tùy chỉnh · 每班 / Mỗi ca'],
 ['none',rule({cadence:'none'}),'未設定','Chưa thiết lập'],
 ['empty rules',{rules:[]},'未設定','Chưa thiết lập'],
 ['legacy localized',{frequency:'Mỗi ca / 每班'},'每班','Mỗi ca'],
 ['legacy authored',{frequency:'AQL audit 每班'},'AQL audit 每班','AQL audit 每班'],
 ['unknown retained fields',rule({cadence:'other',kind:'retained-kind',aqlValue:'0.25',name:'Original'}),'other · retained-kind · Original · AQL 0.25','other · retained-kind · Original · AQL 0.25'],
 ['multiple rules',{rules:[{cadence:'batch',batchKind:'aql',aqlValue:'0.25'},{cadence:'time',timeFrequency:'monthly'}]},'按批次 · AQL 0.25 / 按時間 · 每月','Theo lô · AQL 0.25 / Theo thời gian · Hàng tháng'],
];
for(const [kind,zh,vi]of [['week','每週','Hàng tuần'],['month','每月','Hàng tháng'],['quarter','每季','Hàng quý'],['half-year','每半年','Nửa năm'],['year','每年','Hàng năm'],['weekly','每週','Hàng tuần'],['monthly','每月','Hàng tháng'],['quarterly','每季','Hàng quý'],['half_yearly','每半年','Nửa năm'],['yearly','每年','Hàng năm']])cases.push([kind,rule({cadence:'time',...(kind.includes('_')||kind.endsWith('ly')?{timeFrequency:kind}:{kind})}),'按時間 · '+zh,'Theo thời gian · '+vi]);
for(const [name,item,zh,vi]of cases)for(const lang of ['zh','vi'])void test(name+' / '+lang+' exact display preserves input',()=>{
 const original=structuredClone(item),freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
 assert.equal(format(freeze(item),lang),lang==='zh'?zh:vi);assert.deepEqual(item,original);
});
void test('exact merged main independently reproduces duplicate C AQL label',()=>{
 const before=formatter(execFileSync('git',['show','c6ac41a6a996ac88e1b68370b371aed400773e34:public/process/process-ipqc.js'],{encoding:'utf8'})),item=rule({cadence:'batch',batchKind:'aql',aqlValue:'0.25'});
 assert.equal(before(item,'zh'),'按批次 · AQL · AQL 0.25');assert.equal(before(item,'vi'),'Theo lô · AQL · AQL 0.25');assert.equal(format(item,'zh'),'按批次 · AQL 0.25');
});
for(const line of ['A','B','C'])for(const lang of ['zh','vi'])void test(line+'/'+lang+' actual source detail renders AQL once with zero writes',async()=>{
 const f=await fixture({line,lang}),item=f.versions[1].snapshot.items[0];
 if(line==='C')item.rule={cadence:'batch',batchKind:'aql',aqlValue:'0.25'};else item.rules=[{id:'rule',cadence:'batch',kind:'aql',value:'0.25'}];
 const original=structuredClone(f.quality),remote=structuredClone(f.remote);await f.open();const detail=f.panel().querySelector('.process-ipqc-item-details');detail.open=true;detail.dispatchEvent({type:'toggle'});
 const rendered=detail.querySelectorAll('p').at(-1).textContent;assert.equal((rendered.match(/AQL/g)||[]).length,1);assert.match(rendered,/0\.25/);assert(!rendered.includes('undefined'));assert.equal(f.posts().length,0);assert.equal(f.calls.length,1);assert.deepEqual(structuredClone(f.quality),original);assert.deepEqual(structuredClone(f.remote),remote);
});
for(const lang of ['zh','vi'])void test('C/'+lang+' legacy readonly query uses the same frequency display',async()=>{
 const f=await fixture({line:'C',lang});f.versions[1].snapshot.items[0].rule={cadence:'batch',batchKind:'aql',aqlValue:'0.25'};
 const panel=f.document.createElement('section');f.document.body.append(panel);const op=structuredClone(f.project());op.ipqcQueryEnabled=true;const remote=structuredClone(f.remote);
 await f.box.ProcessIPQC.mountCQuery(panel,op,{isCurrent:()=>true});assert.equal((panel.textContent.match(/AQL/g)||[]).length,1);assert.match(panel.textContent,/AQL 0\.25/);assert.equal(f.posts().length,0);assert.equal(f.calls.length,1);assert.deepEqual(structuredClone(f.remote),remote);
});
