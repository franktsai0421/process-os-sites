// One source per dialog. Preview is read-only; generating never completes issues.
export function openProblemExport({source,ids,request,current,t,downloadURL,imageURL,history=false}) {
 const document=globalThis.document,dialog=document.createElement('dialog');dialog.className='wf-export-dialog';dialog.dataset.problemExport=source;
 let disposed=false,busy=false,plan=null,completed=[],pending=null,includeImages=true,selectedImages=null;
 const alive=()=>!disposed&&current()&&dialog.isConnected;
 const node=(tag,text)=>{const value=document.createElement(tag);if(text!==undefined)value.textContent=text;return value;};
 const button=(text,run)=>{const value=node('button',text);value.type='button';value.onclick=()=>{if(alive()&&!busy)void run();};return value;};
 const heading=node('h3',source==='helper'?t('小幫手問題 ZIP 匯出','Xuất ZIP báo lỗi trợ lý'):t('存取待確認 ZIP 匯出','Xuất ZIP thao tác chờ xác minh'));
 const status=node('p'),body=node('div'),results=node('div'),close=button(t('取消／關閉','Hủy / đóng'),()=>dispose());status.setAttribute('role','status');dialog.append(heading,node('p',t('關閉會停止後續分批；正在生成的包仍可能完成，請稍後查看匯出紀錄。','Đóng sẽ dừng các lô sau; gói đang tạo có thể vẫn hoàn tất, hãy kiểm tra lịch sử xuất sau.')),status,body,results,close);
 function dispose(){disposed=true;dialog.remove();}
 close.onclick=()=>{if(alive())dispose();};
 function link(value){const item=node('p'),download=node('a',t('下載 ZIP','Tải ZIP')+' · '+value.id);download.href=downloadURL(value.id);download.onclick=event=>{if(!alive())event.preventDefault();};item.append(download,node('small',' · '+(value.count??value.issues?.length??0)+' '+t('筆 · 已生成，尚不代表已下載','mục · đã tạo, chưa có nghĩa đã tải')));results.append(item);}
 function reportError(error){const messages={EXPORT_CAPACITY_LIMIT:t('存取匯出紀錄已達 10,000 筆上限，這包未生成；既有歷史保留，請洽管理者安排容量。','Lịch sử xuất đã đạt 10.000 mục, chưa tạo gói; giữ lịch sử, liên hệ quản trị để xử lý dung lượng.'),FEEDBACK_CAPACITY_LIMIT:t('小幫手案件及交接儲存已達 1.5 MB 上限，這包尚未確認；既有紀錄保留，請洽管理者安排容量。','Kho báo lỗi và bàn giao đã đạt 1,5 MB; chưa xác nhận gói, giữ lịch sử, liên hệ quản trị.'),SELECT_EXPORT_RECORDS:t('請先勾選 1–200 筆要匯出的紀錄。','Chọn 1–200 bản ghi cần xuất trước.'),INVALID_EXPORT_SELECTION:t('選取數量超過單次預覽上限或內容無效；請縮小選取分批處理。','Lựa chọn vượt giới hạn xem trước hoặc không hợp lệ; chia nhỏ lựa chọn.'),EXPORT_IMAGE_PERMISSION_REQUIRED:t('部分截圖目前沒有查看權，不能匯出。可取消包含截圖後重新預覽。','Không có quyền xem một số ảnh; bỏ ảnh rồi xem trước lại.'),EXPORT_SELECTION_CHANGED:t('紀錄已更新，這包未確認生成；請重看匯出紀錄及最新內容。','Bản ghi đã đổi; chưa xác nhận gói này được tạo. Kiểm tra lịch sử xuất và nội dung mới.'),EXPORT_BATCH_LIMIT:t('本包超出容量，請減少勾選或截圖後重新預覽。','Gói vượt dung lượng; giảm bản ghi hoặc ảnh rồi xem trước.'),SINGLE_RECORD_EXPORT_LIMIT:t('單筆內容超過上限；不會省略內容或宣稱已匯出。請先改為不含截圖，或另行處理此筆。','Một bản ghi vượt giới hạn; không lược bỏ hay báo đã xuất. Bỏ ảnh hoặc xử lý riêng bản ghi này.')};status.textContent=messages[error?.message]||t('尚未確認生成。可重試同一批次；關閉不會刪除問題或解除原操作防護。','Chưa xác nhận tạo. Có thể thử lại cùng lô; đóng không xóa vấn đề hay gỡ bảo vệ thao tác gốc.');}
 async function preview(){
  if(busy||!alive())return;busy=true;close.disabled=false;status.textContent=t('核驗選取、權限及分批容量…','Đang kiểm tra lựa chọn, quyền và dung lượng…');body.replaceChildren();results.replaceChildren();completed=[];pending=null;
  try{if(!ids.length)throw Error('SELECT_EXPORT_RECORDS');const value=await request('preview',{ids,...(source==='helper'?(includeImages?selectedImages?{imageIds:[...selectedImages]}:{}:{imageIds:[]}):{})});if(!alive())return;if(value.source!==source||value.scope!=='selected-records-only'||!Array.isArray(value.batches)||value.selectedCount!==ids.length)throw Error('INVALID_EXPORT_PLAN');plan=value;paint();}
  catch(error){if(alive()){plan=null;reportError(error);paintImageOption();body.append(button(t('重新預覽','Xem trước lại'),preview));}}
  finally{if(alive()){busy=false;close.disabled=false;}}
 }
 function paintImageOption(){if(source!=='helper')return;const label=node('label'),input=node('input');input.type='checkbox';input.checked=includeImages;input.dataset.exportImages='true';input.onchange=()=>{if(busy){input.checked=includeImages;return;}includeImages=input.checked;selectedImages=null;void preview();};label.append(input,node('span',t('包含有權查看的相關截圖（請先核對圖片，必要時取消）','Kèm ảnh liên quan được phép xem (kiểm tra ảnh, bỏ nếu cần)')));body.append(label);}
 function paint(){
  body.replaceChildren();paintImageOption();status.textContent=t('本次只包含所選','Chỉ gồm lựa chọn lần này: ')+plan.selectedCount+t('筆，分成',' mục, chia thành ')+plan.batches.length+t('包；不包含未選取或其他分頁紀錄。',' gói; không gồm mục chưa chọn hoặc trang khác.');
  body.append(node('p',t('單次預覽最多 200 筆；每包最多 ','Xem trước tối đa 200 mục; mỗi gói tối đa ')+plan.limits.records+t('筆；ZIP 上限 ',' mục; ZIP tối đa ')+(plan.limits.zip/1_000_000)+' MB'+(source==='helper'?t('；原圖合計上限 ','; tổng ảnh gốc tối đa ')+(plan.limits.images/1_000_000)+' MB':'')),node('p',t('文字會遮蔽可辨識的常見秘密；請核對人工備註與圖片後再建立、下載或轉交。','Văn bản che thông tin bí mật nhận diện được; kiểm tra ghi chú và ảnh trước khi tạo, tải hoặc chuyển tiếp.')));
  for(const [index,batch]of plan.batches.entries())body.append(node('p',t('第 ','Gói ')+(index+1)+' · '+batch.count+t('筆',' mục')+' · '+t('預估 ','ước tính ')+((batch.imageBytes+batch.metadataBytes)/1_000_000).toFixed(2)+' MB'));
  const details=node('details');details.append(node('summary',t('查看本次內容與截圖預覽','Xem nội dung và ảnh lần này')));const seen=new Set();
  for(const item of plan.preview||[]){const article=node('article');article.append(node('strong',item.id+' · '+(item.reporter||'')),node('p',item.description||[item.module,item.action].filter(Boolean).join(' · ')));
   const {images:ignoredImages,...textPreview}=item;void ignoredImages;article.append(node('pre',JSON.stringify(textPreview,null,2)));
   for(const image of item.images||[]){if(seen.has(image.id))continue;seen.add(image.id);const row=node('label'),pick=node('input');pick.type='checkbox';pick.checked=true;pick.onchange=()=>{if(busy)return;selectedImages||=new Set((plan.preview||[]).flatMap(item=>(item.images||[]).map(image=>image.id)));if(pick.checked)selectedImages.add(image.id);else selectedImages.delete(image.id);create.disabled=true;status.textContent=t('截圖選取已變更，請重新預覽分批計畫。','Ảnh đã đổi; xem trước kế hoạch chia gói lại.');};const img=node('img');img.src=imageURL(image.id);img.alt=image.name;img.loading='lazy';row.append(pick,node('span',image.name),img);article.append(row);}
   details.append(article);
  }body.append(details);
  const create=button(t('依計畫建立 ZIP','Tạo ZIP theo kế hoạch'),generate);create.dataset.exportGenerate='true';body.append(button(t('重新預覽','Xem trước lại'),preview),create);
 }
 async function generate(){
  if(busy||!plan||!alive())return;busy=true;close.disabled=false;body.querySelectorAll('button,input').forEach(node=>node.disabled=true);
  try{for(let index=completed.length;index<plan.batches.length;index++){
    const batch=plan.batches[index];pending||={...batch,operationId:crypto.randomUUID()};status.textContent=t('正在生成第 ','Đang tạo gói ')+(index+1)+' / '+plan.batches.length+t('包；先前已生成 ','; đã tạo ')+completed.length+t('包。',' gói.');
    const value=await request('generate',{operationId:pending.operationId,ids:pending.ids,versions:pending.versions,imageIds:pending.imageIds});if(!alive())return;if(value.status!=='generated'||typeof value.id!=='string'||value.count!==batch.count)throw Error('INVALID_EXPORT_ACK');completed.push(value);pending=null;link(value);
   }status.textContent=t('已生成 ','Đã tạo ')+completed.length+' / '+plan.batches.length+t('包；請逐包下載核對，尚未宣稱下載完成。',' gói; tải và kiểm tra từng gói, chưa xác nhận tải xong.');}
  catch(error){if(alive()){reportError(error);status.append(node('p',t('已生成 ','Đã tạo ')+completed.length+' / '+plan.batches.length+t('包；其餘尚未確認。',' gói; phần còn lại chưa xác nhận.')));}}
  finally{if(alive()){busy=false;close.disabled=false;const retry=button(t('重試尚未確認的同一批次','Thử lại lô chưa xác nhận'),generate);if(completed.length<plan.batches.length)results.append(retry);}}
 }
 async function loadHistory(){busy=true;close.disabled=false;status.textContent=t('重新核驗匯出紀錄…','Đang xác minh lịch sử xuất…');try{const value=await request('history');if(!alive())return;const rows=value.exports||value.handoffs||[];for(const row of rows)link({...row,count:row.count??row.issues?.length});status.textContent=t('顯示目前有權下載的匯出紀錄；每次下載仍會重新核驗。','Hiện lịch sử xuất được phép tải; mỗi lần tải vẫn kiểm tra quyền.');if(value.limited)status.append(node('p',t('此處只列最近 100 筆，不代表全部紀錄。','Chỉ liệt kê 100 mục gần nhất, không phải toàn bộ lịch sử.')));}catch(error){if(alive())reportError(error);}finally{if(alive()){busy=false;close.disabled=false;}}}
 dialog.addEventListener('cancel',event=>{event.preventDefault();dispose();});document.body.append(dialog);dialog.showModal();if(history)void loadHistory();else void preview();
 return{canLeave:()=>!dialog.isConnected,dispose(){disposed=true;dialog.remove();}};
}
