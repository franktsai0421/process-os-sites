(function(host){
 'use strict';
 const text=(zh,vi)=>document.documentElement.lang==='vi'?vi:zh;
 const parse=id=>{if(!id.startsWith('legacy-master-page:'))return null;try{const v=JSON.parse(id.slice(19));return Array.isArray(v)&&v.length===3?v:null;}catch{return null;}};
 host.ProcessMasterPageHistory={create(context){
  const {page,client}=context;let view=null,epoch=0,root=null;
  const mutable=()=>!view?.historical;
  const assertMutable=()=>{if(!mutable())throw Error('APPROVED_HISTORY_READ_ONLY');};
  const stamp=()=>epoch;
  const current=ticket=>ticket===epoch&&mutable()&&context.owner();
  const retire=()=>{epoch++;view?.retire();view=null;root=null;};
  const permissions=()=>Object.fromEntries(['view','create','edit','save','submit','withdraw','approve','return','history','delete'].map(key=>[key,client.permission(key)===true]));
  const objects=rows=>Array.isArray(rows)&&rows.every(row=>row&&typeof row==='object'&&!Array.isArray(row));
  const validate=snapshot=>snapshot&&typeof snapshot==='object'&&!Array.isArray(snapshot)&&(page==='LINES'?Object.keys(snapshot).length>0&&Object.entries(snapshot).every(([part,value])=>['AB','C'].includes(part)&&value&&objects(value.lines)):objects(snapshot.products)&&(snapshot.categoryGroups===undefined||objects(snapshot.categoryGroups)));
  function mount(container){
   if(!container?.isConnected||!context.owner()||!context.control())return;
   // A working repaint is not a history boundary and must not retire an admitted Save.
   view?.retire();view=null;root=container;
   const header=document.createElement('section');header.className='master-page-version';const title=document.createElement('h3');title.textContent=text('版本／草稿','Phiên bản / bản nháp');header.append(title);container.querySelector('.panel')?.prepend(header);
   const control=context.control(),flow=control.workflow;
   host.VersionDraftUI.mount(container,{header:'.master-page-version',module:page==='LINES'?text('線別與工段','Chuyền và công đoạn'):page+text(' 產線與類別',' · Sản phẩm và nhóm'),scope:flow?.scope||'master:'+(page==='LINES'?'LINES':page+'.catalog'),version:control.versions.find(v=>['draft','pending','pending-test'].includes(v.status))||control.versions.find(v=>v.id===control.activeVersionId),versions:control.versions,active:control.versions.find(v=>v.id===control.activeVersionId),flow,busy:context.busy(),localUnsaved:context.dirty(),historyClient:()=>client,mountApprovedHistory(shell,_log,empty){
    view=host.VersionDraftUI.createApprovedHistory({root:container,shell,empty,client,selectId:'master-page-approved-version',
     isCurrent:()=>root===container&&context.owner()&&context.control()===control&&container.dataset.activeTab===(page==='LINES'?'line-admin':page),
     canChoose:()=>!context.busy()&&!context.dialog()&&!document.querySelector('dialog[open]'),
     onBoundary(){epoch++;},onDenied(){epoch++;},
     onIdle(){if(context.owner()&&mutable()){context.permissions(permissions());}},
     renderCurrent(){context.permissions(permissions());view=null;context.render();document.querySelector('#master-page-approved-version')?.focus({preventScroll:true});},
     validateProjectedIdentity:row=>{const v=parse(row.id);return !!v&&v[0]===page&&['AB','C'].includes(v[1])&&(page==='LINES'||v[1]===page)&&row.sourceScope==='master:'+v[1]&&row.sourceVersionId===v[2]&&(row.approvalEvidence.kind!=='approved-case'||row.approvalEvidence.caseId===v[2]);},
     versionLabel:row=>'V'+row.number+(row.sourceScope?' · '+text('舊核准來源 ','Nguồn duyệt cũ ')+row.sourceScope.slice(7):''),
     validateSnapshot:validate,
     renderSnapshot(target,snapshot,isCurrent){
      const fields={products:['產品','Sản phẩm'],categoryGroups:['類別與路線','Nhóm và lộ trình'],part:['來源產線','Chuyền nguồn'],lines:['線別與工段','Chuyền và công đoạn'],stages:['工段','Công đoạn'],code:['代碼','Mã'],name:['名稱','Tên'],line:['線別','Chuyền'],category:['類別','Nhóm'],defaultStages:['預設路線','Lộ trình mặc định'],machine:['機器','Máy'],assetNumber:['資產編號','Mã tài sản'],operators:['人數','Số người'],photos:['歷史圖片','Ảnh lịch sử']};
      if(page==='LINES'){const note=document.createElement('p');note.textContent=text('各來源核准內容獨立保留；舊單一來源不代表兩邊共同核准。','Giữ riêng từng nguồn đã duyệt; một nguồn cũ không phải phê duyệt chung cả hai chuyền.');target.append(note);host.VersionDraftUI.renderApprovedCollections(target,{lines:Object.entries(snapshot).map(([part,value])=>({part,lines:value.lines}))},{collections:['lines'],fields,mediaURL:photo=>client.mediaURL(photo)},isCurrent);}
      else{if(snapshot.categoryGroups===undefined){const note=document.createElement('p');note.textContent=text('此舊核准來源未另存類別清單，產品保留原類別。','Nguồn cũ không lưu danh sách nhóm riêng; giữ nhóm gốc trong sản phẩm.');target.append(note);}const body={...snapshot,products:snapshot.products.map(row=>({...row,...(row.photoId?{photos:[{id:row.photoId}]}:row.photo?{photos:[{src:row.photo}]}:{})}))};host.VersionDraftUI.renderApprovedCollections(target,body,{collections:['products',...(snapshot.categoryGroups?['categoryGroups']:[])],fields,mediaURL:photo=>client.mediaURL(photo)},isCurrent);}
     }
    });
   }});
  }
  function guardDOM(container){const ticket=stamp();for(const node of container.querySelectorAll('input,select,button,textarea')){if(node.closest('.vd-shell,[data-vd-approved-view]'))continue;for(const key of ['onclick','oninput','onchange']){const fn=node[key];if(typeof fn!=='function')continue;node[key]=function(...args){if(!current(ticket)||!node.isConnected)return;return fn.apply(this,args);};}}}
  return {mutable,assertMutable,stamp,current,retire,mount,guardDOM,historical(){if(!view?.historical)return false;view.relabel();return true;},refreshControls:()=>view?.refreshControls()};
 }};
})(window);
