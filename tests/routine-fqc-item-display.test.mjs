import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { manualUI, posted } from './fixtures/routine-fqc-manual-ui.mjs';
import { fixture } from './fixtures/routine-fqc-durable.mjs';

for(const lang of ['zh','vi']){
  test(lang+' FQC generated rows retain both linked jobs and independent selection',()=>{
    const f=manualUI();
    f.document.documentElement.lang=lang;
    const jobs=['PART-ONE','PART-TWO'].map(code=>({
      id:'job-'+code,itemId:'inspection',start:'2026-10-01',end:'2026-10-31',
      source:{id:'inspection',name:'Torque check',code:'INSP-9',line:'A',category:'Fasteners',frequency:'monthly',
        description:'Keep standard text',version:'1',products:[{code,name:'Linked product'}]},
      calendar:{scope:code,productCode:code,frequency:'monthly'},planId:null,completion:null,
    }));
    Object.assign(f.remote.control,{startDate:'2026-10-01',calendarPolicy:{version:2,scopes:{}},documents:[],jobs,cases:[]});
    f.api.setData(structuredClone(f.remote));f.paint();
    for(const job of jobs){
      const group=()=>f.root.querySelector('[data-period-group="'+job.calendar.scope+'"]');
      group().querySelector('[data-period-toggle]').click();
      assert.match(group().textContent,/Torque check/);
      assert.match(group().textContent,/INSP-9/);
      assert.doesNotMatch(group().textContent,/PART-|Linked product/);
      for(const node of group().querySelectorAll('[title],[aria-label],[alt]')){
        for(const key of ['title','aria-label','alt'])assert.doesNotMatch(node.getAttribute(key)||'',/PART-|Linked product/);
      }
      assert.equal(group().querySelector('input[data-job]').dataset.job,job.id);
    }
    assert.equal(f.root.querySelectorAll('[data-period-group]').length,2);
    assert.deepEqual(posted(f),[]);
  });
  test(lang+' report input, fixed retest, abnormal and history preserve sample identity and literal text',()=>{
    const f=fixture();f.box.document.documentElement.lang=lang;
    vm.runInContext(readFileSync('public/process/routine-page-approved-history.js','utf8'),f.box);
    const source={name:'Torque',code:'INSP',description:'literal PART in standard',products:[{code:'PART-A',name:'Linked company'},{code:'PART-B',name:'Linked model'}],standardSnapshot:{description:'literal standard',productRefs:[{code:'PART-B'}],productCodes:['PART-B'],products:[{name:'Linked model'}]}};
    const r={id:'r',samples:['PART-B'],outcome:'fail',value:'3mm',notes:'literal PART in notes',photos:[]};
    const line={id:'line',jobId:'key-PART-B',source,results:[r]};
    const before=structuredClone(line);
    const html=f.api.resultHTML(line,r,0,true);
    assert.match(html,/data-sample="PART-B" checked/);
    assert.doesNotMatch(html, /樣品 ?[0-9]|Mẫu ?[0-9]|原樣品固定|Kiểm tra bằng mẫu gốc/);
    assert.doesNotMatch(html.replace(/<[^>]+>/g,''),/PART-[AB]|Linked model|Linked company/);
    const fixed={...line,requiredSamples:['PART-B']};
    assert.doesNotMatch(f.api.resultHTML(fixed,r,0,true),/data-sample=|PART-B|Linked model|原樣品|mẫu gốc|樣品 ?[0-9]|Mẫu ?[0-9]/i);
    assert.doesNotMatch(f.api.resultHTML(fixed,{...r,samples:[],outcome:'abnormal'},0,true),/data-sample=|PART-B|Linked model|原樣品|mẫu gốc|樣品 ?[0-9]|Mẫu ?[0-9]/i);
    const projected=JSON.stringify(f.win.RoutinePageApprovedHistory.displayLine(fixed));
    assert.doesNotMatch(projected,/PART-[AB]|Linked model|Linked company/);
    assert.match(projected,/literal PART in standard/);assert.match(projected,/literal PART in notes/);
    assert.deepEqual(line,before);
  });
}
