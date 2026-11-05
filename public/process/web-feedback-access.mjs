// Availability surface only. Never discovers browser storage or changes receipts.
export async function mountAccessQueue({host,t,current,request}) {
  const document=host.ownerDocument;
  const message=document.createElement('p'),scope=document.createElement('p');
  message.setAttribute('role','status');scope.className='wf-muted';
  const controls=document.createElement('div');controls.className='wf-access-controls';
  for(const label of [t('選取事件','Chọn sự kiện'),t('備註','Ghi chú'),t('匯出（待確認格式）','Xuất (chờ chọn định dạng)'),t('標記已處理','Đánh dấu đã xử lý'),t('處理歷史','Lịch sử xử lý')]) {
    const button=document.createElement('button');button.type='button';button.disabled=true;button.textContent=label;controls.append(button);
  }
  const explanation=document.createElement('p');explanation.textContent=t('這是系統操作的確認事件，與使用者主動回報分開。處理清單不會確認操作結果或解除重送防護。','Đây là xác minh thao tác hệ thống, tách khỏi báo lỗi người dùng. Xử lý danh sách không xác nhận kết quả hay cho phép gửi lại.');
  const retry=document.createElement('button');retry.type='button';retry.textContent=t('重新核驗來源','Kiểm tra lại nguồn');
  async function read() {
    if(!current())return;retry.disabled=true;message.textContent=t('讀取來源狀態…','Đang đọc trạng thái nguồn…');
    try {
      const value=await request();if(!current())return;
      // Only the reviewed unavailable contract is supported. An unexpected
      // successful payload cannot silently enable an unreviewed event reader.
      if(value.available!==false||value.coverage!=='not-connected'||value.lastUpdatedAt!==null)throw Error('UNSUPPORTED_SOURCE');
      message.textContent=t('集中事件來源尚未接通，不能確認所有使用者的待確認事件。','Nguồn tập trung chưa kết nối; chưa thể xác nhận sự kiện của mọi người dùng.');
      scope.textContent=t('來源範圍：未接通 · 最後同步：尚無證據。此處空白不代表沒有待確認操作。','Phạm vi: chưa kết nối · Đồng bộ cuối: chưa có bằng chứng. Danh sách trống không có nghĩa là không có thao tác chờ xác minh.');
    } catch {
      if(!current())return;
      message.textContent=t('離線或來源讀取失敗；目前事件數量與同步完整性未知。','Ngoại tuyến hoặc không đọc được nguồn; chưa biết số lượng và mức đồng bộ.');
      scope.textContent=t('最後同步：尚無證據；請保留原模組的待確認操作。','Đồng bộ cuối: chưa có bằng chứng; giữ nguyên thao tác chờ xác minh ở mô-đun gốc.');
    } finally {if(current())retry.disabled=false;}
  }
  retry.onclick=()=>{void read();};
  host.replaceChildren(message,scope,explanation,controls,retry);await read();
}
