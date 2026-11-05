// Central metadata only. Never discovers business storage or changes receipts.
export async function mountAccessQueue({host,t,current,request}) {
  const document=host.ownerDocument;
  let disposed=false,rows=[],permissions={},privateDetails=false,filter='open',cursor='',next=null,selectedId='',busy=false,pending=null,note='',selection=new Set();
  const alive=()=>!disposed&&current(),canLeave=()=>!busy&&!pending&&!note.trim();
  const element=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
  const button=(label,run)=>{const node=element('button',label);node.type='button';node.onclick=()=>{if(alive())void run();};return node;};
  const message=document.createElement('p'),scope=document.createElement('p');
  message.setAttribute('role','status');scope.className='wf-muted';
  const controls=document.createElement('div');controls.className='wf-access-controls';
  for(const label of [t('選取事件','Chọn sự kiện'),t('備註','Ghi chú'),t('匯出（待確認格式）','Xuất (chờ chọn định dạng)'),t('標記已處理','Đánh dấu đã xử lý'),t('處理歷史','Lịch sử xử lý')]) {
    const button=document.createElement('button');button.type='button';button.disabled=true;button.textContent=label;controls.append(button);
  }
  const explanation=document.createElement('p');explanation.textContent=t('這是系統操作的確認事件，與使用者主動回報分開。標記已處理不會確認原操作或解除重送防護。','Đây là xác minh thao tác hệ thống, tách khỏi báo lỗi người dùng. Đánh dấu đã xử lý không xác nhận thao tác gốc hay cho phép gửi lại.');
  const retry=document.createElement('button');retry.type='button';retry.textContent=t('重新核驗來源','Kiểm tra lại nguồn');
  const content=element('div');content.className='wf-access-content';
  const reporting=element('p');reporting.className='wf-muted';reporting.dataset.accessReporting='true';
  const platform=typeof window==='undefined'?null:window;
  const reportingStatus=()=>{if(!alive())return;const messages={
    offline:t('目前裝置離線，事件尚未確認送達。','Thiết bị đang ngoại tuyến; chưa xác nhận sự kiện đã đến.'),
    'sync-failed':t('目前裝置上報失敗，已收到的事件可能不完整。','Thiết bị báo sự kiện thất bại; sự kiện đã nhận có thể chưa đầy đủ.'),
    'permission-denied':t('目前裝置缺少部分來源的上報授權，不能宣告已收齊。','Thiết bị thiếu quyền báo một số nguồn; không thể xác nhận đầy đủ.'),
    capacity:t('目前裝置的事件佇列已滿；原操作防護保留。','Hàng đợi sự kiện trên thiết bị đã đầy; giữ nguyên bảo vệ thao tác gốc.'),
    'storage-or-source-failed':t('本機事件保存或來源失敗，無法保證上報完整。','Lưu sự kiện cục bộ hoặc nguồn thất bại; không bảo đảm báo đầy đủ.'),
    'policy-required':t('保存政策未確認，本機尚未啟用持久上報。','Chưa xác nhận chính sách lưu; chưa bật báo bền vững trên thiết bị.'),
    'not-enabled':t('目前裝置的集中上報尚未啟用。','Chưa bật báo tập trung trên thiết bị.'),
    'received-unknown':t('目前裝置已取得上報回覆；原操作仍待核驗。','Thiết bị đã nhận phản hồi báo sự kiện; thao tác gốc vẫn cần xác minh.'),
    received:t('目前裝置的可上報佇列已確認；不代表其他裝置已同步。','Đã xác nhận hàng đợi có thể báo của thiết bị; không có nghĩa thiết bị khác đã đồng bộ.')
  };reporting.textContent=messages[platform?.ProcessAccessEvents?.status?.()]||t('目前裝置尚無可核驗的上報狀態。','Chưa có trạng thái báo sự kiện có thể xác minh cho thiết bị.');};
  const tell=text=>{if(alive())message.textContent=text;};
  const actionLabel=action=>({'begin-v1':t('開始編輯','Bắt đầu sửa'),apply:t('套用修改','Áp dụng thay đổi'),save:t('存取草稿','Lưu bản nháp'),submit:t('送出審核','Gửi duyệt'),withdraw:t('撤回','Rút lại'),approve:t('核准','Duyệt'),return:t('發回','Trả lại'),restore:t('還原歷史','Khôi phục lịch sử')})[action]||t('操作','Thao tác');
  function paint(){
    content.replaceChildren();const nav=element('nav');
    for(const [value,label]of [['open',t('待處理','Cần xử lý')],['handled',t('處理歷史','Lịch sử xử lý')]]){const control=button(label,()=>{if(!canLeave())return tell(t('請先保存備註或確認原保存結果。','Lưu ghi chú hoặc kiểm tra kết quả lưu trước.'));filter=value;cursor='';return read();});control.dataset.accessStatus=value;control.setAttribute('aria-selected',String(filter===value));nav.append(control);}
    if(permissions.exchange)nav.append(button(t('匯出選項待確認','Chờ chọn cách xuất'),()=>tell(t('匯出格式與附件尚待確認；只建議最小事件欄位及專屬備註，不含原始收據。尚未生成或下載檔案。','Chưa chọn định dạng và ảnh; chỉ đề xuất thông tin sự kiện tối thiểu và ghi chú, không gồm biên nhận gốc. Chưa tạo hoặc tải tệp.'))));
    content.append(nav);const columns=element('div');columns.className='wf-columns';const list=element('div'),detail=element('div');list.className='wf-list';detail.className='wf-detail';content.append(columns);columns.append(list,detail);
    for(const row of rows){const card=element('div');card.className='wf-row';if(permissions.exchange){const pick=element('input');pick.type='checkbox';pick.dataset.accessPick=row.id;pick.checked=selection.has(row.id);pick.setAttribute('aria-label',t('選取事件','Chọn sự kiện'));pick.onchange=()=>{if(!alive()||pending)return;if(pick.checked)selection.add(row.id);else selection.delete(row.id);};card.append(pick);}const open=button(row.module.toUpperCase()+' · '+actionLabel(row.action)+' · '+row.reporter,()=>{if(!canLeave())return tell(t('請先保存此事件的備註。','Lưu ghi chú của sự kiện này trước.'));selectedId=row.id;paint();});open.dataset.accessEvent=row.id;open.append(element('p',row.outcome==='receipt-confirmed'?t('已查得成功收據','Đã tìm thấy biên nhận thành công'):t('原操作尚未確認','Thao tác gốc chưa được xác minh')));card.append(open);list.append(card);}
    if(!rows.length)list.append(element('p',t('目前授權與篩選範圍內沒有已收到的事件；不代表所有裝置都沒有事件。','Không có sự kiện đã nhận trong phạm vi và bộ lọc hiện tại; không có nghĩa là mọi thiết bị đều không có sự kiện.')));
    if(next)list.append(button(t('下一頁','Trang sau'),()=>{if(!canLeave())return;cursor=next;return read();}));if(cursor)list.append(button(t('回到第一頁','Về trang đầu'),()=>{if(!canLeave())return;cursor='';return read();}));
    const row=rows.find(row=>row.id===selectedId)||rows[0];if(!row)return;selectedId=row.id;
    detail.append(element('h3',row.id),element('p',row.reporter+' · '+row.module.toUpperCase()+' · '+actionLabel(row.action)),element('p',t('裝置回報時間：','Thời gian thiết bị báo: ')+new Date(row.occurredAt).toLocaleString()),element('p',t('伺服器收到時間：','Máy chủ nhận: ')+row.receivedAt),element('p',row.outcome==='receipt-confirmed'?t('伺服器已用原操作者權限查得成功收據；原頁仍按既有流程核驗恢復。','Máy chủ đã đọc biên nhận thành công với quyền người thao tác gốc; trang gốc vẫn dùng quy trình xác minh hiện có.'):t('尚未取得可核驗的成功收據；不能據此重送。','Chưa có biên nhận thành công có thể xác minh; không được gửi lại vì lý do này.')));
    if(privateDetails){for(const entry of row.notes||[])detail.append(element('p',entry.authorId+' · '+entry.at+'\n'+entry.text));for(const entry of row.history||[])detail.append(element('small',entry.authorId+' · '+entry.at+' · '+entry.status));}
    if(permissions.edit){const label=element('label',t('事件專屬私人備註','Ghi chú riêng cho sự kiện')),input=element('textarea');input.dataset.accessNote=row.id;input.maxLength=4000;input.value=note;input.readOnly=busy||!!pending;input.oninput=()=>{if(alive()&&!busy&&!pending)note=input.value;};label.append(input);detail.append(label);
      detail.append(button(pending?t('核對原保存結果／重試','Kiểm tra kết quả lưu / thử lại'):t('保存備註','Lưu ghi chú'),()=>update(row,row.status)),button(row.status==='open'?t('標記已處理','Đánh dấu đã xử lý'):t('恢復待處理','Khôi phục cần xử lý'),()=>update(row,row.status==='open'?'handled':'open')));
    }
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
        controls.remove();message.textContent=t('僅顯示已成功上報且目前有權查看的事件。','Chỉ hiện sự kiện đã báo thành công và được phép xem hiện tại.');scope.textContent=t('最後收到事件：','Lần nhận sự kiện gần nhất: ')+(value.lastUpdatedAt||t('尚無','Chưa có'))+' · '+t('離線、舊版或未接入的來源可能尚未上報，不能保證收齊。','Nguồn ngoại tuyến, phiên bản cũ hoặc chưa kết nối có thể chưa báo; không bảo đảm đầy đủ.');paint();return;
      }
      // Reject unsupported coverage instead of rendering arbitrary event payloads. An unexpected
      // successful payload cannot silently enable an unreviewed event reader.
      content.replaceChildren();rows=[];permissions={};if(!controls.isConnected)host.append(controls);
      if(value.available!==false||value.coverage!=='not-connected'||value.lastUpdatedAt!==null)throw Error('UNSUPPORTED_SOURCE');
      message.textContent=value.reason==='RETENTION_POLICY_REQUIRED'?t('事件保存政策尚待確認，集中收集尚未啟用。','Chưa xác nhận chính sách lưu sự kiện; chưa bật thu thập tập trung.'):t('集中事件來源尚未接通，不能確認所有使用者的待確認事件。','Nguồn tập trung chưa kết nối; chưa thể xác nhận sự kiện của mọi người dùng.');
      scope.textContent=t('來源範圍：未接通 · 最後同步：尚無證據。此處空白不代表沒有待確認操作。','Phạm vi: chưa kết nối · Đồng bộ cuối: chưa có bằng chứng. Danh sách trống không có nghĩa là không có thao tác chờ xác minh.');
    } catch(error) {
      if(!alive())return;if(['FORBIDDEN','LOGIN_REQUIRED'].includes(error?.message)){rows=[];permissions={};privateDetails=false;content.replaceChildren();}
      message.textContent=t('離線或來源讀取失敗；目前事件數量與同步完整性未知。','Ngoại tuyến hoặc không đọc được nguồn; chưa biết số lượng và mức đồng bộ.');
      scope.textContent=t('最後同步：尚無證據；請保留原模組的待確認操作。','Đồng bộ cuối: chưa có bằng chứng; giữ nguyên thao tác chờ xác minh ở mô-đun gốc.');
    } finally {if(alive())retry.disabled=false;}
  }
  retry.onclick=()=>{if(alive()&&canLeave())void read();};
  host.replaceChildren(message,scope,explanation,reporting,controls,content,retry);platform?.addEventListener?.('process-access-event-report-status',reportingStatus);reportingStatus();await read();
  return {canLeave,dispose(){disposed=true;platform?.removeEventListener?.('process-access-event-report-status',reportingStatus);}};
}
