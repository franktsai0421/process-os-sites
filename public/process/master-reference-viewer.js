// Read-only exact-reference links. The endpoint rechecks both scope and source
// permissions; account/navigation changes invalidate in-flight presentation.
(() => {
 'use strict';
 let controller=null,generation=0,handled='';
 const t=(zh,vi)=>document.documentElement.lang==='vi'?vi:zh;
 function cancel(){generation++;controller?.abort();controller=null;document.getElementById('master-reference-record')?.close();}
 async function show(){
  const hash=location.hash;if(!hash.startsWith('#stage-reference=')||hash===handled||document.documentElement.dataset.processNavigationStatus!=='ready')return;
  cancel();handled=hash;const token=generation,owner=window.ProcessSync?.identity,epoch=window.ProcessSync?.identityGeneration?.();const requestController=new AbortController();controller=requestController;
  const current=()=>token===generation&&!window.ProcessSync?.requiresReload&&location.hash===hash&&owner===window.ProcessSync?.identity&&epoch===window.ProcessSync?.identityGeneration?.();
  const dialog=document.createElement('dialog');dialog.id='master-reference-record';dialog.className='master-edit-dialog';dialog.dataset.i18nSkip='true';
  const heading=document.createElement('h2');heading.textContent=t('引用紀錄 · 唯讀','Bản ghi tham chiếu · Chỉ đọc');
  const body=document.createElement('div');body.className='master-dialog-body';body.setAttribute('role','status');body.textContent=t('正在確認引用與權限…','Đang kiểm tra tham chiếu và quyền…');
  const close=document.createElement('button');close.type='button';close.className='button ghost';close.textContent=t('關閉','Đóng');close.onclick=()=>dialog.close();
  dialog.append(heading,body,close);dialog.addEventListener('close',()=>{requestController.abort();if(controller===requestController){generation++;controller=null;}dialog.remove();});document.body.append(dialog);dialog.showModal();close.focus();
  try{
   const query=new URLSearchParams(decodeURIComponent(hash.slice('#stage-reference='.length)));
   const response=await fetch('/api/master/stage-reference?'+query,{credentials:'same-origin',signal:requestController.signal});
   const result=await response.json();if(!current()||!dialog.isConnected)return;
   if(!response.ok){body.textContent=response.status===403?t('沒有查看此引用紀錄的權限。','Không có quyền xem bản ghi này.'):response.status===404?t('引用來源已改變或不再存在，請回到原頁重新檢查。','Nguồn tham chiếu đã thay đổi hoặc không còn; hãy kiểm tra lại ở trang gốc.'):t('無法讀取引用紀錄，請關閉後重新開啟。','Không thể đọc bản ghi; hãy đóng và mở lại.');return;}
   body.replaceChildren();const note=document.createElement('p');note.textContent=t('這是造成刪除阻擋的指定來源，不會切換或修改目前草稿。','Đây là đúng nguồn đang chặn xóa; không thay thế hoặc sửa bản nháp hiện tại.');body.append(note);
   const labels={source:t('來源','Nguồn'),stage:t('工段','Công đoạn'),id:t('紀錄識別碼','Mã bản ghi'),code:t('編號','Mã'),number:t('流程編號','Số bước'),name:t('名稱','Tên'),nameVi:t('越文名稱','Tên tiếng Việt'),line:t('線別','Chuyền'),category:t('類別','Nhóm'),workspaceId:t('工作區','Vùng làm việc'),stages:t('引用工段','Công đoạn tham chiếu'),productCodes:t('適用產品','Sản phẩm')};
   const fields={source:result.reference.source,stage:result.reference.stage,...result.record},list=document.createElement('dl');
   for(const [key,value]of Object.entries(fields)){if(value==null||!Object.hasOwn(labels,key))continue;const title=document.createElement('dt'),content=document.createElement('dd');title.textContent=labels[key];content.textContent=Array.isArray(value)?value.join('、'):String(value);content.style.overflowWrap='anywhere';list.append(title,content);}body.append(list);
   const link=document.createElement('a');link.href=result.moduleURL;link.textContent=t('前往來源模組','Đi tới mô-đun nguồn');body.append(link);
  }catch(error){if(current()&&error.name!=='AbortError')body.textContent=t('讀取失敗，請關閉後重新開啟。','Đọc thất bại; hãy đóng và mở lại.');}
 }
 window.addEventListener('process-ui-ready',()=>void show());
 window.addEventListener('hashchange',()=>{cancel();handled='';void show();});
 window.addEventListener('process-destination-ready',()=>{if(!location.hash.startsWith('#stage-reference=')){cancel();handled='';}void show();});
 window.addEventListener('process-delivery-invalidated',()=>{cancel();handled='';});
 void show();
})();
