import __esmImport0 from "node:fs";
import __esmImport1 from "node:vm";
import __esmImport2 from "node:assert/strict";
import {createRequire as __esmFactory} from 'node:module';
const __esmRequire=__esmFactory(import.meta.url);
// Real search event handlers and hierarchy domain; isolated data, no browser writes.
const fs=__esmImport0,vm=__esmImport1,assert=__esmImport2;
(async()=>{const D=await import('../public/process/bom-domain.mjs'),source=fs.readFileSync('public/process/bom-workspace.js','utf8'),section=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a)));
 const row=(root,level,ordinal,code,name)=>[root,level,ordinal,code,name,'規格','PCS','2','10','1'];
 const bom=D.parseMatrices([{name:'fixture',rows:[D.columns,row('R','0','','','根'),row('R','.1','01','P','子件'),row('R','..2','01','Q','孫件'),row('R','...3','01','L','葉'),row('R','.1','02','P','子件'),row('R','..2','01','Q','孫件'),row('S','0','','','另一主件'),row('S','.1','01','P','子件')]}]),idx=D.createIndex(bom);
 assert.deepEqual(idx.children('R')[0].rows.map(r=>r.level),[1,2,3,1,2]);assert.equal(idx.parents('P').length,3);assert.equal(idx.children('L')[0].rows.length,0);assert.equal(idx.children('P').length,3);assert.equal(idx.children('Q').flatMap(g=>g.rows).length,1);for(const g of idx.children('P'))for(const r of g.rows)assert.equal(r.quantity,'');assert.equal(idx.children('R')[0].rows[0].quantity,'2');
 const input={value:'',readOnly:false},result={innerHTML:''},detail={innerHTML:''},file={},error={textContent:''};let preserve=0;
 const host={querySelector:s=>s==='#bw-query'?input:s==='#bw-file'?file:s==='.bw-results'?result:s==='.bw-detail'?detail:s==='.bw-error'?error:null,querySelectorAll:()=>[]};
 // Only the current owner/quarantine ports used by the actual bind closure are
 // supplied. No transport, storage, server or successful-write stub is added.
 const context={ui:{query:'',code:'R',position:'chosen'},edit:null,error:'',ownerQuarantined:false,actor:'fixture-owner',index:()=>idx,document:{querySelector:s=>s==='.bw-workspace'?host:s==='.bw-error'?error:null},window:{ProcessSync:{identity:{id:'fixture-owner'}},VersionDraftUI:{preserveView:()=>()=>preserve++}},remember(){},detail:()=>context.ui.code,h:s=>String(s??''),t:zh=>zh};
 const handlers=section(' function updateSearch(', '\n function selectedRows(')+section(' function resultsHTML(', '\n function contentHTML(')+section(' function bind(){', '\n function renderReview(')+';this.bindSearch=bind;';
 const missingPort={...context};delete missingPort.ownerQuarantined;vm.createContext(missingPort);vm.runInContext(handlers,missingPort);assert.throws(()=>missingPort.bindSearch(),/ownerQuarantined is not defined/,'the original missing-port fixture failure is not hidden by production fallback');
 vm.createContext(context);vm.runInContext(handlers,context);
 for(const owner of ['quarantined','different','logged-out']){
  context.ownerQuarantined=owner==='quarantined';context.window.ProcessSync.identity=owner==='logged-out'?null:{id:owner==='different'?'other-owner':'fixture-owner'};
  input.oninput=null;input.oncompositionend=null;file.onchange=null;const before=JSON.stringify(context.ui);context.bindSearch();
  assert.equal(input.oninput,null,owner+' must not bind search input');assert.equal(input.oncompositionend,null,owner+' must not bind composition');assert.equal(file.onchange,null,owner+' must not bind import');assert.equal(JSON.stringify(context.ui),before);
 }
 context.ownerQuarantined=false;context.window.ProcessSync.identity={id:'fixture-owner'};context.bindSearch();assert.equal(typeof input.oninput,'function');assert.equal(typeof input.oncompositionend,'function');
 input.value='中';input.oninput({target:input,isComposing:true});assert.equal(context.ui.query,'');assert.equal(input.value,'中');input.value='中文';input.oncompositionend({target:input});assert.equal(context.ui.query,'中文');assert.equal(host.querySelector('#bw-query'),input);
 for(const value of ['1','12','P','P 子件','ĐẦU TRÒN','paste 2026','']){input.value=value;input.oninput({target:input,isComposing:false});assert.equal(input.value,value);assert.equal(context.ui.query,value);assert.equal(host.querySelector('#bw-query'),input);}
 context.ui.code='P';context.ui.position='chosen';input.value='P';input.oninput({target:input,isComposing:false});assert.equal(context.ui.position,'chosen');assert.equal(context.ui.code,'P');context.edit={};input.value='blocked';input.oninput({target:input});assert.equal(input.value,'P');assert(preserve>0);
 console.log('PASS explicit owner/quarantine ports with original missing-port counterproof and quarantine/different/null-owner non-binding guards; stable search input identity, composing/commit event sequence, Chinese/Vietnamese/ASCII/paste/clear, selected occurrence retention and edit guard; all descendants, multi-parent and leaves; L2 numeric exclusion. Native IME device acceptance not performed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
