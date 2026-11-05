// Central metadata only. Never discovers business storage or changes receipts.
export async function mountAccessQueue({host,t,current,request}) {
  const document=host.ownerDocument;
  let disposed=false,rows=[],permissions={},privateDetails=false,filter='open',cursor='',next=null,selectedId='',busy=false,pending=null,note='',selection=new Set(),exportController=null,exportOpening=false;
  const alive=()=>!disposed&&current(),canLeave=()=>!exportOpening&&exportController?.canLeave?.()!==false&&!busy&&!pending&&!note.trim();
  const element=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
  const button=(label,run)=>{const node=element('button',label);node.type='button';node.onclick=()=>{if(alive())void run();};return node;};
  const message=document.createElement('p'),scope=document.createElement('p');
  message.setAttribute('role','status');scope.className='wf-muted';
  const controls=document.createElement('div');controls.className='wf-access-controls';
  for(const label of [t('選取事件','Chọn sự kiện'),t('備註','Ghi chú'),t('匯出 ZIP','Xuất ZIP'),t('標記管理已解決','Đánh dấu hồ sơ đã xử lý'),t('已解決紀錄','Lịch sử đã xử lý')]) {
    const button=document.createElement('button');button.type='button';button.disabled=true;button.textContent=label;controls.append(button);
  }
  const explanation=document.createElement('p');explanation.textContent=t('這是系統操作的確認事件，與使用者主動回報分開。「管理已解決」不會確認原操作或解除重送防護。未處理與已解決紀錄及備註都保留，不自動刪除，可恢復待處理。','Đây là xác minh thao tác hệ thống, tách khỏi báo lỗi người dùng. Xử lý hồ sơ không xác nhận thao tác gốc hay cho phép gửi lại. Giữ sự kiện và ghi chú, không tự xóa; có thể khôi phục cần xử lý.');
  explanation.textContent+=' '+t('首次離線且尚未核驗集中啟用時，新事件只留記憶體，重載可能漏報；原操作防護仍保留。恢復連線不代表已補齊重載前的事件。','Nếu ngoại tuyến trước khi xác minh bật thu thập, sự kiện mới chỉ ở bộ nhớ và có thể mất khi tải lại; giữ nguyên bảo vệ thao tác gốc. Kết nối lại không có nghĩa đã bù đủ sự kiện trước đó.');explanation.dataset.accessColdStart='true';
  const retry=document.createElement('button');retry.type='button';retry.textContent=t('重新核驗來源','Kiểm tra lại nguồn');
  const content=element('div');content.className='wf-access-content';
  const reporting=element('p');reporting.className='wf-muted';reporting.dataset.accessReporting='true';
  const platform=typeof window==='undefined'?null:window;
  const reportingStatus=()=>{if(!alive())return;const messages={
    'volatile-pending':t('集中啟用尚未核驗：新回報僅暫存記憶體，重載可能失去中央副本；原操作收據與防重送仍保留。','Chưa xác minh bật thu thập: báo cáo mới chỉ ở bộ nhớ, tải lại có thể mất bản sao tập trung; giữ biên nhận và bảo vệ gửi lại gốc.'),
    offline:t('目前裝置離線，事件尚未確認送達。','Thiết bị đang ngoại tuyến; chưa xác nhận sự kiện đã đến.'),
    'sync-failed':t('目前裝置上報失敗，已收到的事件可能不完整。','Thiết bị báo sự kiện thất bại; sự kiện đã nhận có thể chưa đầy đủ.'),
    'permission-denied':t('目前裝置缺少部分來源的上報授權，不能宣告已收齊。','Thiết bị thiếu quyền báo một số nguồn; không thể xác nhận đầy đủ.'),
    capacity:t('目前裝置的事件佇列已滿；原操作防護保留。','Hàng đợi sự kiện trên thiết bị đã đầy; giữ nguyên bảo vệ thao tác gốc.'),
    'storage-or-source-failed':t('本機事件保存或來源失敗，無法保證上報完整。','Lưu sự kiện cục bộ hoặc nguồn thất bại; không bảo đảm báo đầy đủ.'),
    'policy-required':t('保存政策未確認，本機尚未啟用持久上報。','Chưa xác nhận chính sách lưu; chưa bật báo bền vững trên thiết bị.'),
    'not-enabled':t('目前裝置的集中上報尚未啟用。','Chưa bật báo tập trung trên thiết bị.'),
    'received-unknown':t('目前裝置已取得上報回覆；原操作仍待核驗。','Thiết bị đã nhận phản hồi báo sự kiện; thao tác gốc vẫn cần xác minh.'),
    received:t('本次可核驗佇列已處理；不代表重載前或其他裝置的事件已收齊。','Đã xử lý hàng đợi có thể xác minh lần này; không có nghĩa đã đủ sự kiện trước khi tải lại hoặc từ thiết bị khác.')
  };reporting.textContent=messages[platform?.ProcessAccessEvents?.status?.()]||t('目前裝置尚無可核驗的上報狀態。','Chưa có trạng thái báo sự kiện có thể xác minh cho thiết bị.');};
  const tell=text=>{if(alive())message.textContent=text;};
  const actionLabel=action=>({'begin-v1':t('開始編輯','Bắt đầu sửa'),apply:t('套用修改','Áp dụng thay đổi'),save:t('存取草稿','Lưu bản nháp'),submit:t('送出審核','Gửi duyệt'),withdraw:t('撤回','Rút lại'),approve:t('核准','Duyệt'),return:t('發回','Trả lại'),restore:t('還原歷史','Khôi phục lịch sử')})[action]||t('操作','Thao tác');
  function paint(){
    content.replaceChildren();const nav=element('nav');
    for(const [value,label]of [['open',t('待處理','Cần xử lý')],['handled',t('已解決紀錄','Lịch sử đã xử lý')]]){const control=button(label,()=>{if(!canLeave())return tell(t('請先保存備註或確認原保存結果。','Lưu ghi chú hoặc kiểm tra kết quả lưu trước.'));filter=value;cursor='';return read();});control.dataset.accessStatus=value;control.setAttribute('aria-selected',String(filter===value));nav.append(control);}
    if(permissions.exchange){nav.append(button(t('匯出 ZIP','Xuất ZIP'),()=>openExport()),button(t('匯出紀錄','Lịch sử xuất'),()=>openExport(true)),button(t('勾選本頁','Chọn trang này'),()=>{if(!canLeave())return;for(const row of rows)selection.add(row.id);paint();}));}
    content.append(nav);const columns=element('div');columns.className='wf-columns';const list=element('div'),detail=element('div');list.className='wf-list';detail.className='wf-detail';content.append(columns);columns.append(list,detail);
    for(const row of rows){const card=element('div');card.className='wf-row';if(permissions.exchange){const pick=element('input');pick.type='checkbox';pick.dataset.accessPick=row.id;pick.checked=selection.has(row.id);pick.setAttribute('aria-label',t('選取事件','Chọn sự kiện'));pick.onchange=()=>{if(!alive()||!canLeave())return;if(pick.checked)selection.add(row.id);else selection.delete(row.id);};card.append(pick);}const open=button(row.module.toUpperCase()+' · '+actionLabel(row.action)+' · '+row.reporter,()=>{if(!canLeave())return tell(t('請先保存此事件的備註。','Lưu ghi chú của sự kiện này trước.'));selectedId=row.id;paint();});open.dataset.accessEvent=row.id;open.append(element('p',row.outcome==='receipt-confirmed'?t('已查得成功收據','Đã tìm thấy biên nhận thành công'):t('原操作尚未確認','Thao tác gốc chưa được xác minh')));card.append(open);list.append(card);}
    if(!rows.length)list.append(element('p',t('目前授權與篩選範圍內沒有已收到的事件；不代表所有裝置都沒有事件。','Không có sự kiện đã nhận trong phạm vi và bộ lọc hiện tại; không có nghĩa là mọi thiết bị đều không có sự kiện.')));
    if(next)list.append(button(t('下一頁','Trang sau'),()=>{if(!canLeave())return;cursor=next;return read();}));if(cursor)list.append(button(t('回到第一頁','Về trang đầu'),()=>{if(!canLeave())return;cursor='';return read();}));
    const row=rows.find(row=>row.id===selectedId)||rows[0];if(!row)return;selectedId=row.id;
    detail.append(element('h3',row.id),element('p',row.status==='handled'?t('管理狀態：已解決；紀錄及備註保留，可恢復。','Hồ sơ đã xử lý; giữ sự kiện và ghi chú, có thể khôi phục.'):t('管理狀態：待處理。','Hồ sơ cần xử lý.')),element('p',row.reporter+' · '+row.module.toUpperCase()+' · '+actionLabel(row.action)),element('p',t('裝置回報時間：','Thời gian thiết bị báo: ')+new Date(row.occurredAt).toLocaleString()),element('p',t('伺服器收到時間：','Máy chủ nhận: ')+row.receivedAt),element('p',row.outcome==='receipt-confirmed'?t('伺服器已用原操作者權限查得成功收據；原頁仍按既有流程核驗恢復。','Máy chủ đã đọc biên nhận thành công với quyền người thao tác gốc; trang gốc vẫn dùng quy trình xác minh hiện có.'):t('尚未取得可核驗的成功收據；不能據此重送。','Chưa có biên nhận thành công có thể xác minh; không được gửi lại vì lý do này.')));
    if(privateDetails){for(const entry of row.notes||[])detail.append(element('p',entry.authorId+' · '+entry.at+'\n'+entry.text));for(const entry of row.history||[])detail.append(element('small',entry.authorId+' · '+entry.at+' · '+entry.status));}
    if(permissions.edit){const label=element('label',t('事件專屬私人備註','Ghi chú riêng cho sự kiện')),input=element('textarea');input.dataset.accessNote=row.id;input.maxLength=4000;input.value=note;input.readOnly=busy||!!pending;input.oninput=()=>{if(alive()&&!busy&&!pending)note=input.value;};label.append(input);detail.append(label);
      detail.append(button(pending?t('核對原保存結果／重試','Kiểm tra kết quả lưu / thử lại'):t('保存備註','Lưu ghi chú'),()=>update(row,row.status)),button(row.status==='open'?t('標記管理已解決','Đánh dấu hồ sơ đã xử lý'):t('恢復待處理','Khôi phục cần xử lý'),()=>update(row,row.status==='open'?'handled':'open')));
    }
  }
  async function openExport(history=false){
    if(!alive()||!canLeave()||!permissions.exchange)return tell(t('請先保存備註或關閉目前匯出。','Lưu ghi chú hoặc đóng xuất hiện tại trước.'));
    if(!history&&(!selection.size||selection.size>200))return tell(t('請勾選 1–200 筆；每包最多 20 筆，先預覽分批。','Chọn 1–200 mục; tối đa 20 mỗi gói, xem trước chia gói.'));
    exportOpening=true;try{const {openProblemExport}=await import('./problem-export.mjs?v=20261105-export1');if(!alive())return;exportController=openProblemExport({source:'access',ids:[...selection],history,t,current:alive,request:(kind,body)=>request({preview:'export-preview',generate:'export',history:'exports'}[kind],body),downloadURL:id=>'/api/access-events?action=download&id='+encodeURIComponent(id)});}
    catch{if(alive())tell(t('無法載入匯出預覽，尚未生成檔案。','Không tải được xem trước; chưa tạo tệp.'));}finally{if(alive())exportOpening=false;}
  }
  async function update(row,status){
    if(!alive()||busy||!permissions.edit)return;busy=true;
    pending||={id:row.id,version:row.version,note,status,operationId:crypto.randomUUID()};paint();
    try{const value=await request('update',{...pending});if(!alive())return;if(value.id!==pending.id||!Number.isSafeInteger(value.version)||value.version<=pending.version||!Array.isArray(value.notes)||!['open','handled'].includes(value.status))throw Error('INVALID_EVENT_UPDATE_ACK');Object.assign(row,value);note='';pending=null;busy=false;selectedId='';await read();}
    catch(error){if(!alive())return;tell(t('尚未確認保存，備註與原保存批次保留。','Chưa xác nhận lưu; giữ ghi chú và lô lưu gốc.')+' '+(error?.message==='EVENT_CHANGED_RELOAD'?t('事件已更新，請讀取最新狀態後再確認。','Sự kiện đã đổi; đọc trạng thái mới rồi xác nhận.'):''));
      if(error?.message==='EVENT_CHANGED_RELOAD'){const recovery=button(t('讀取最新狀態，保留備註','Đọc trạng thái mới, giữ ghi chú'),async()=>{if(busy)return;busy=true;try{const latest=await request('detail&id='+encodeURIComponent(row.id));if(!alive())return;Object.assign(row,latest.event);permissions=latest.permissions;privateDetails=latest.privateDetails;pending=null;selectedId=row.id;tell(t('備註尚未保存，請確認後再保存。','Ghi chú chưa lưu; kiểm tra rồi lưu.'));}catch{tell(t('讀取失敗，原備註與保存批次仍保留。','Đọc thất bại; giữ ghi chú và lô lưu gốc.'));}finally{if(alive()){busy=false;paint();}}});message.append(recovery);}
    }finally{if(alive()){busy=false;paint();}}
  }
  async function read() {
    if(!alive())return;retry.disabled=true;message.textContent=t('讀取來源狀態…','Đang đọc trạng thái nguồn…');
    try {
      const value=await request('list&status='+filter+(cursor?'&after='+encodeURIComponent(cursor):''));if(!alive())return;
      if(value.available===true&&value.coverage==='received-events-only'&&value.complete===false&&Array.isArray(value.events)){
        rows=value.events;permissions=value.permissions||{};privateDetails=value.privateDetails===true;next=value.next||null;selection=new Set([...selection].filter(id=>rows.some(row=>row.id===id)));
        controls.remove();message.textContent=t('僅顯示已成功上報且目前有權查看的事件。','Chỉ hiện sự kiện đã báo thành công và được phép xem hiện tại.');scope.textContent=t('清單資料最後更新（含管理更新）：','Dữ liệu danh sách cập nhật gần nhất (gồm xử lý): ')+(value.lastUpdatedAt||t('尚無','Chưa có'))+' · '+t('離線、舊版或未接入的來源可能尚未上報，不能保證收齊。','Nguồn ngoại tuyến, phiên bản cũ hoặc chưa kết nối có thể chưa báo; không bảo đảm đầy đủ.');paint();return;
      }
      // Reject unsupported coverage instead of rendering arbitrary event payloads. An unexpected
      // successful payload cannot silently enable an unreviewed event reader.
      content.replaceChildren();rows=[];permissions={};if(!controls.isConnected)host.append(controls);
      if(value.available!==false||value.coverage!=='not-connected'||value.lastUpdatedAt!==null)throw Error('UNSUPPORTED_SOURCE');
      message.textContent=t('集中事件來源尚未接通，不能確認所有使用者的待確認事件。','Nguồn tập trung chưa kết nối; chưa thể xác nhận sự kiện của mọi người dùng.');
      scope.textContent=t('來源範圍：未接通 · 最後同步：尚無證據。此處空白不代表沒有待確認操作。','Phạm vi: chưa kết nối · Đồng bộ cuối: chưa có bằng chứng. Danh sách trống không có nghĩa là không có thao tác chờ xác minh.');
    } catch(error) {
      if(!alive())return;if(['FORBIDDEN','LOGIN_REQUIRED'].includes(error?.message)){rows=[];permissions={};privateDetails=false;content.replaceChildren();}
      message.textContent=t('離線或來源讀取失敗；目前事件數量與同步完整性未知。','Ngoại tuyến hoặc không đọc được nguồn; chưa biết số lượng và mức đồng bộ.');
      scope.textContent=t('最後同步：尚無證據；請保留原模組的待確認操作。','Đồng bộ cuối: chưa có bằng chứng; giữ nguyên thao tác chờ xác minh ở mô-đun gốc.');
    } finally {if(alive())retry.disabled=false;}
  }
  retry.onclick=()=>{if(alive()&&canLeave())void read();};
  host.replaceChildren(message,scope,explanation,reporting,controls,content,retry);platform?.addEventListener?.('process-access-event-report-status',reportingStatus);reportingStatus();await read();
  return {canLeave,dispose(){disposed=true;exportController?.dispose?.();platform?.removeEventListener?.('process-access-event-report-status',reportingStatus);}};
}
