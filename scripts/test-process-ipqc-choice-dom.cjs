/* Production IPQC module with synthetic DOM/GET only; no browser timing or live data. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const baseline=process.env.IPQC_CHOICES_BASELINE_DIR;if(!baseline)throw Error('Set IPQC_CHOICES_BASELINE_DIR to captured pre-edit sources');
const sources={baseline:fs.readFileSync(path.join(baseline,'public/process/process-ipqc.js'),'utf8'),candidate:fs.readFileSync('public/process/process-ipqc.js','utf8')},checks=[],counts=[];
const key=row=>JSON.stringify([row.source,row.scope,row.itemId]),copy=structuredClone;
const tree=node=>({tag:node.tagName,attrs:{...node.attrs},text:node._text,checked:node.checked,disabled:node.disabled,children:node.children.map(tree)});
const count=node=>1+node.children.reduce((sum,child)=>sum+count(child),0);
function alignReviewedSourceLabel(before,after,lang){
 const old=lang==='vi'?'Xem tiêu chuẩn, sản phẩm và ảnh':'查看標準、適用產品與照片';
 const current=lang==='vi'?'Xem tiêu chuẩn nguồn hiện hành, sản phẩm và ảnh':'查看現行來源標準、適用產品與照片';
 const a=before.querySelector('summary'),b=after.querySelector('summary');assert(a&&b);
 assert.equal(a.children.length,1);assert.equal(b.children.length,1);
 assert.equal(a.children[0].tagName,'SPAN');assert.equal(b.children[0].tagName,'SPAN');
 assert.equal(a.children[0].textContent,old,'exact historical summary');assert.equal(b.children[0].textContent,current,'exact reviewed current-source summary');
 a.children[0].textContent=current;
}

function alignReviewedSingleSaveNotice(before,after,lang){
 const old=lang==='vi'?'Chỉ phân công hạng mục. Áp dụng để đồng bộ, sau đó lưu bản nháp.':'此處僅分配項目；套用後同步，再手動儲存草稿。';
 const current=lang==='vi'?'Chỉ phân công hạng mục. Hoàn tất để giữ trên trang hiện tại, rồi lưu bản nháp.':'此處僅分配項目；完成方塊後先留目前頁面，再存取草稿。';
 const a=before.children.filter(n=>n.tagName==='P'),b=after.children.filter(n=>n.tagName==='P');assert.equal(a.length,1);assert.equal(b.length,1);
 assert.equal(a[0].children.length,1);assert.equal(b[0].children.length,1);assert.equal(a[0].children[0].tagName,'SPAN');assert.equal(b[0].children[0].tagName,'SPAN');
 assert.equal(a[0].children[0].textContent,old,'exact historical manual-flow notice');assert.equal(b[0].children[0].textContent,current,'exact reviewed current-page-then-single-Save notice');
 a[0].children[0].textContent=current;
}
function alignReviewedAssignmentLabels(before,after,lang){
 const changes=lang==='vi'?[
  ['Mỗi hạng mục chỉ thuộc một bước trong công đoạn. Bỏ chọn ở bước đang giữ, áp dụng, rồi chọn ở bước này.','Mỗi hạng mục chỉ thuộc một bước trong công đoạn. Bỏ chọn ở bước đang giữ, hoàn tất và lưu bản nháp, rồi chọn ở bước này.']
 ]:[['本流程已選','本方塊已選取'],['其他流程使用中','其他方塊使用中'],['同工段每個項目只能分配一次。請先到占用方塊取消勾選並套用，再回來勾選此方塊。','同工段每個項目只能分配一次。請先到占用方塊取消勾選、完成編輯並存取草稿，再回來勾選此方塊。']];
 for(const [old,current]of changes){const a=[before,...before.querySelectorAll('*')].filter(node=>node._text===old),b=[after,...after.querySelectorAll('*')].filter(node=>node._text===current);assert(a.length>0,'exact historical assignment label present');assert.equal(a.length,b.length,'exact reviewed assignment label count');for(const node of a)node._text=current;}
}
// Only the pinned fixture's explicit retained warning/metric delta is aligned.
// Production state transitions and true-invalid reasons run in assignment-state tests.
function alignReviewedRetainedWarning(before,after,lang){
 const Node=before.constructor,metric=new Node('div'),wrapper=new Node('div'),k='[&quot;AB&quot;,&quot;A:SYN&quot;,&quot;retained-old&quot;]';
 metric.innerHTML=`<div class="process-ipqc-metric retained"><strong data-ipqc-count="retained">1</strong><span>${lang==='vi'?'Giữ liên kết cũ · cần xác nhận':'保留舊關聯・待確認'}</span></div>`;
 assert.deepEqual(tree(after.querySelector('.process-ipqc-metric.retained')),tree(metric.firstElementChild));
 before.querySelector('.process-ipqc-metric.selected').after(metric.firstElementChild);
 wrapper.innerHTML=`<div data-ipqc-warnings aria-live="polite"><div class="process-ipqc-warning" role="status" data-ipqc-warning="${k}" data-ipqc-reasons="unavailable"><p><span>${lang==='vi'?'Không còn trong nguồn được duyệt phù hợp với chuyền / nhóm / công đoạn / sản phẩm hiện tại':'現行核准來源已無符合線別／類別／工段／產品的項目'}</span></p><p><span>${lang==='vi'?'Liên kết cũ vẫn được giữ; chưa tự đổi sang nguồn hiện hành.':'原關聯仍保留；尚未自動改用現行來源。'}</span></p><code>retained-old</code><button type="button" data-ipqc-remove="${k}"><span>${lang==='vi'?'Bỏ liên kết':'移除關聯'}</span></button></div></div>`;
 assert.deepEqual(tree(after.querySelector('[data-ipqc-warnings]')),tree(wrapper.firstElementChild));
 const old=before.querySelector('.process-ipqc-warning');assert.equal(old.querySelector('code').textContent,'retained-old');assert(old.textContent.includes(lang==='vi'?'Liên kết cũ đã thay đổi':'既有關聯來源或產品條件已變更'));old.after(wrapper.firstElementChild);old.remove();
}
function choices(n=48){return Array.from({length:n},(_,i)=>({source:'AB',scope:'A:SYN',itemId:'item-'+i,sourceVersionId:'approved-1',code:'I'+i,errorId:'error-'+i%8,errorCode:'E'+i%8,errorName:'合成 lỗi '+i%8,productCodes:['P1','P2'],standard:'fresh standard '+i,description:'fresh description '+i,equipment:{assetCode:'EQ',pieceMark:'01',name:'Gauge'},rules:[{cadence:'batch',batchKind:'fixed_count',fixedCount:2}],frequency:'each',photos:[{id:'photo-'+i,name:'Photo '+i,note:'Note '+i}]}));}
(async()=>{
 const {canvasDOM}=await import('./login-reentry-dom.mjs');
 function fixture(variant,{lang='zh',readonly=false,malformed=false}={}){
  const dom=canvasDOM(),{document}=dom;document.documentElement.lang=lang;
  const rows=choices(),assignment=row=>(({source,scope,itemId,sourceVersionId,productCodes})=>({source,scope,itemId,sourceVersionId,productCodes}))(row);
  // Duplicate ID rows retain their own standards even though assignment lookup uses first ID.
  rows.push({...rows[2],standard:'later duplicate standard'});
  const op={id:'op',name:'Current',number:'A-01',stageCode:'A-CUT',productCodes:['P1','P2'],ipqcAssignments:[assignment(rows[0]),{source:'AB',scope:'A:SYN',itemId:'retained-old',sourceVersionId:'old',productCodes:['P1']}]},other={id:'other',name:'Owner',number:'A-02',ipqcAssignments:[assignment(rows[1])]},requests=[];
  let payload={source:'AB',scope:'A:SYN',revision:1,reason:'',choices:rows};if(malformed)payload.choices[0].photos=null;
  const c={window:null,document,console,URLSearchParams,URL,Response,Map,Set,Error,JSON,Date,Number,Math,queueMicrotask,Event:class{constructor(type,options){this.type=type;Object.assign(this,options);}},escapeHtml:value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;'),state:{view:'editor',editorLine:'A',category:'SYN'},ProcessSync:{identity:{id:'synthetic'},platformHeaders:()=>({})},setInterval(){},setTimeout(){},clearTimeout(){},addEventListener(){},ensureCategoryEditor:()=>({'A-CUT':[op,other]}),fetch:async(url,options={})=>{assert.equal(options.method||'GET','GET');requests.push(String(url));return Response.json(copy(payload));}};
  c.window=c;vm.createContext(c);vm.runInContext(fs.readFileSync('public/process/shared-draft-client.js','utf8'),c);vm.runInContext(sources[variant],c);
  const dialog=document.createElement('dialog');dialog.id='process-operation-dialog';dialog.innerHTML='<input id="operation-name"><button id="apply-operation"></button><section class="choices"></section>';document.body.append(dialog);dialog.querySelector('#apply-operation').disabled=readonly;
  const panel=dialog.querySelector('section');return{c,op,panel,requests,rows,load:()=>c.ProcessIPQC.mountChoices(panel,op),payload(value){payload=value;},open(detail){detail.setAttribute('open','');detail.dispatchEvent({type:'toggle'});},close(detail){detail.removeAttribute('open');detail.open=false;detail.dispatchEvent({type:'toggle'});}};
 }
 for(const lang of ['zh','vi']){
  const before=fixture('baseline',{lang}),after=fixture('candidate',{lang}),original=JSON.stringify(after.op);await before.load();await after.load();
  assert.equal(JSON.stringify(after.op),original);assert.equal(after.requests.length,1);assert.equal(after.panel.querySelectorAll('[data-ipqc-choice]').length,49);
  assert.equal(after.panel.querySelector('[data-ipqc-count="selected"]').textContent,'1');assert.equal(after.panel.querySelector('[data-ipqc-count="occupied"]').textContent,'1');assert(after.panel.textContent.includes('retained-old'));
  assert(after.panel.querySelectorAll('[data-ipqc-choice]').some(input=>input.dataset.ipqcChoice===key(after.rows[1])&&input.disabled));
  counts.push({language:lang,beforeNodes:count(before.panel),afterNodes:count(after.panel),items:49});assert(count(after.panel)<count(before.panel)*0.6);
  const a=before.panel.querySelectorAll('.process-ipqc-item-details'),b=after.panel.querySelectorAll('.process-ipqc-item-details');assert.equal(after.panel.querySelectorAll('.process-ipqc-photos').length,0);
  for(let i=0;i<a.length;i++){before.open(a[i]);after.open(b[i]);alignReviewedSourceLabel(a[i],b[i],lang);assert.deepEqual(tree(b[i]),tree(a[i]),'expanded standard/rules/photos match exact row '+i);const size=count(b[i]);after.close(b[i]);after.open(b[i]);assert.equal(count(b[i]),size,'reopening does not duplicate DOM');}
  alignReviewedSingleSaveNotice(before.panel,after.panel,lang);alignReviewedAssignmentLabels(before.panel,after.panel,lang);alignReviewedRetainedWarning(before.panel,after.panel,lang);assert.deepEqual(tree(after.panel),tree(before.panel),'entire expanded UI matches except explicitly asserted reviewed source, Save and assignment labels');assert.equal(after.requests.length,1,'expanding details has no extra fetch');checks.push(lang+' same choices, ownership, retained links, exact expanded details and no duplicate nodes');
  const input=after.panel.querySelectorAll('[data-ipqc-choice]').find(node=>node.dataset.ipqcChoice===key(after.rows[3]));input.checked=true;input.onchange();assert(after.op.ipqcAssignments.some(row=>row.itemId===after.rows[3].itemId));assert.equal(after.panel.querySelector('[data-ipqc-count="selected"]').textContent,'2');checks.push(lang+' assignment checkbox remains operative before any Save');
 }
 const stale=fixture('candidate');await stale.load();const retired=stale.panel.querySelector('.process-ipqc-item-details'),initial=count(retired);stale.c.ProcessSync.identity={id:'another'};stale.open(retired);assert.equal(count(retired),initial);checks.push('identity change prevents deferred private detail insertion');
 const reload=fixture('candidate');await reload.load();const old=reload.panel.querySelector('.process-ipqc-item-details');reload.payload({source:'AB',scope:'A:SYN',revision:2,reason:'',choices:choices(1).map(row=>({...row,sourceVersionId:'approved-2',standard:'new approved source'}))});await reload.load();reload.open(old);assert.equal(count(old),3,'detached old details stay retired');const fresh=reload.panel.querySelector('.process-ipqc-item-details');reload.open(fresh);assert(reload.panel.textContent.includes('new approved source'));assert(reload.panel.textContent.includes('retained-old'));assert.equal(reload.requests.length,2);checks.push('explicit reload consumes fresh version and ignores retired details, retaining old assignments');
 for(const variant of ['baseline','candidate']){const invalid=fixture(variant,{malformed:true}),saved=JSON.stringify(invalid.op);await invalid.load();assert.equal(invalid.panel.querySelectorAll('[data-ipqc-choice]').length,0);assert(invalid.panel.querySelector('[role="alert"]'));assert.equal(JSON.stringify(invalid.op),saved);}checks.push('malformed hidden details still fail before showing usable choices and preserve input');
 const readonly=fixture('candidate',{readonly:true});await readonly.load();assert(readonly.panel.querySelectorAll('[data-ipqc-choice]').every(input=>input.disabled));readonly.open(readonly.panel.querySelector('.process-ipqc-item-details'));assert(readonly.panel.textContent.includes('fresh standard 0'));checks.push('read-only details remain expandable while assignment controls stay disabled');
 const report={status:'PASS',checks,counts,sourceHashes:Object.fromEntries(Object.entries(sources).map(([name,source])=>[name,createHash('sha256').update(source).digest('hex')])),limits:['Synthetic DOM and GET response; no CSS layout, native keyboard or browser timing.','Fresh approved response fixtures, no business-data mutation or network.']};fs.mkdirSync('.sites-runtime/perf-500ms-round5',{recursive:true});fs.writeFileSync('.sites-runtime/perf-500ms-round5/ipqc-choice-dom.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
})().catch(error=>{console.error(error);process.exitCode=1;});
