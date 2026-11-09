(function(host){
 'use strict';
 const text=(zh,vi)=>document.documentElement.lang==='vi'?vi:zh,prefix='legacy-routine-page:';
 const legacy=id=>{if(!id.startsWith(prefix))return null;try{const row=JSON.parse(id.slice(prefix.length));return Array.isArray(row)&&row.length===2&&row.every(v=>typeof v==='string'&&!!v)?row:null;}catch{return null;}};
 host.RoutinePageApprovedHistory={create(context){
  const {client}=context,numbers=new Map();let view=null,epoch=0,root=null;
  const mutable=()=>!view?.historical,assertMutable=()=>{if(!mutable())throw Error('APPROVED_HISTORY_READ_ONLY');};
  const retire=()=>{epoch++;view?.retire();view=null;root=null;},stamp=()=>epoch,current=ticket=>ticket===epoch&&mutable()&&context.owner();
  const permissions=()=>Object.fromEntries(['view','create','edit','delete','save','submit','withdraw','approve','return','history','settings','revise','revoke'].map(key=>[key,client.permission(key)===true]));
  const validate=snapshot=>snapshot&&Array.isArray(snapshot.documents)&&snapshot.documents.every(row=>row&&typeof row.id==='string'&&row.metadata&&row.metadata.id===row.id&&['plan','report','waiver','disposal'].includes(row.metadata.kind)&&row.content&&Array.isArray(row.content.lines));
  function mount(container){
   if(!container?.isConnected||!context.owner()||!context.data()||context.reviewOnly())return;
   view?.retire();view=null;root=container;const data=context.data(),flow=data.control.workflow;
   const header=document.createElement('section');header.className='routine-page-version';container.querySelector('[data-routine-page-panel]')?.prepend(header);
   const pending=flow.cases.find(c=>c.id===flow.pendingId),active=flow.cases.find(c=>c.id===flow.active.id),version={id:pending?.id||'shared-'+flow.generation,number:pending?flow.cases.indexOf(pending)+1:flow.cases.length+1,status:pending?'pending':'draft'};
   host.VersionDraftUI.mount(container,{header:'.routine-page-version',module:text('例行 FQC','FQC định kỳ'),scope:'routine-fqc:page',version,versions:[],active:active?{id:active.id,number:flow.cases.indexOf(active)+1,status:'approved'}:null,flow,busy:context.busy(),localUnsaved:context.dirty(),historyClient:()=>client,mountApprovedHistory(shell,_log,empty){
    view=host.VersionDraftUI.createApprovedHistory({root:container,shell,empty,client,selectId:'routine-page-approved-version',cacheKey:flow.active.id||null,
     isCurrent:()=>root===container&&context.root()===container&&context.data()===data&&context.owner()&&!context.reviewOnly(),
     canChoose:()=>!context.busy()&&!context.dialog()&&!context.locked()&&!document.querySelector('dialog[open]'),
     onBoundary(){epoch++;},onDenied(){epoch++;},onIdle(){if(context.owner()&&mutable())context.permissions(permissions());},
     renderCurrent(){context.permissions(permissions());view=null;context.render();document.querySelector('#routine-page-approved-version')?.focus({preventScroll:true});},
     validateProjectedIdentity:row=>{const ids=legacy(row.id);return !!ids&&row.sourceScope==='routine-fqc:'+ids[0]&&row.sourceVersionId===ids[1]&&row.approvalEvidence.kind==='approved-case'&&row.approvalEvidence.caseId===ids[1];},
     versionLabel:row=>{if(row.sourceDocumentNumber)numbers.set(row.id,row.sourceDocumentNumber);return row.sourceScope?text('舊文件 ','Hồ sơ cũ ')+(numbers.get(row.id)||'')+' · V'+row.number:text('整頁 ','Cả trang ')+'V'+row.number;},validateSnapshot:validate,
     renderSnapshot(target,snapshot,isCurrent){
      const note=document.createElement('p');note.textContent=text('整頁核准與舊文件核准各自保留原來源；舊文件版本只代表該文件。','Giữ nguồn duyệt cả trang và hồ sơ cũ riêng biệt; bản cũ chỉ đại diện hồ sơ đó.');target.append(note);
      const fields={documents:['文件','Hồ sơ'],metadata:['固定文件資料','Thông tin hồ sơ cố định'],content:['核准內容','Nội dung đã duyệt'],id:['識別碼','Mã'],number:['文件編號','Số hồ sơ'],kind:['文件類型','Loại hồ sơ'],title:['標題','Tiêu đề'],date:['日期','Ngày'],notes:['備註','Ghi chú'],reason:['原因','Lý do'],disposition:['處置','Xử lý'],evidence:['證據圖片','Ảnh bằng chứng'],photos:['結果圖片','Ảnh kết quả'],lines:['檢查項目','Hạng mục kiểm tra'],results:['結果','Kết quả'],samples:['樣品','Mẫu'],outcome:['結果','Kết quả'],value:['實際值','Giá trị thực tế'],cancelled:['取消標記','Đánh dấu hủy'],source:['固定來源','Nguồn cố định']};
      host.VersionDraftUI.renderApprovedCollections(target,snapshot,{collections:['documents'],fields,mediaFields:['evidence'],mediaURL:photo=>{const id=typeof photo==='string'?photo:photo?.id;return /^[a-f0-9]{64}$/.test(id||'')?'/api/routine-fqc/page/photo?id='+id:'';}},isCurrent);
     }
    });
   }});
  }
  function guardDOM(container){const ticket=stamp();for(const node of container.querySelectorAll('input,select,button,textarea')){if(node.closest('.vd-shell,[data-vd-approved-view]'))continue;for(const key of ['onclick','oninput','onchange']){const fn=node[key];if(typeof fn!=='function')continue;node[key]=function(...args){if(!current(ticket)||!node.isConnected)return;return fn.apply(this,args);};}}}
  return{mutable,assertMutable,retire,stamp,current,mount,guardDOM,historical(){if(!view?.historical)return false;view.relabel();return true;}};
 }};
})(window);
