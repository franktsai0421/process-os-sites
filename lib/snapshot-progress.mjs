// Display only receipt-backed counters. No timers, invented percentages or
// budget-debit-to-upload conversion. ETA is supplied only by stable ACK samples.
const labels={preflight:'本機唯讀預檢 / Kiểm tra cục bộ',preparing:'準備來源與驗證資料表 / Chuẩn bị nguồn và kiểm tra bảng',begin:'建立傳輸收據 / Tạo biên nhận truyền',scanning:'掃描缺件與既有收據 / Quét tệp thiếu và biên nhận',uploading:'上傳資料 / Đang tải dữ liệu','chunk-acknowledged':'上傳資料 / Đang tải dữ liệu','batch-acknowledged':'批次上傳資料 / Đang tải dữ liệu theo lô',verifying:'核對完整資料雜湊 / Kiểm tra toàn vẹn dữ liệu','integrity-verified':'傳輸完整性已核對 / Đã kiểm tra toàn vẹn','not-audited':'準備引用核對 / Chuẩn bị kiểm tra tham chiếu',audit:'核對引用與圖片 / Kiểm tra tham chiếu và ảnh',auditing:'核對引用與圖片 / Kiểm tra tham chiếu và ảnh',sealed:'引用核對完成 / Đã kiểm tra tham chiếu',materializing:'還原物件 / Khôi phục đối tượng',copying:'還原物件 / Khôi phục đối tượng',restore:'還原資料表 / Khôi phục bảng',restoring:'還原資料表 / Khôi phục bảng',activating:'啟用前最後核對 / Kiểm tra cuối trước kích hoạt','data-ready':'資料已還原，尚未啟用 / Đã khôi phục, chưa kích hoạt',stopped:'已停止瀏覽器傳輸；最後請求需核對 / Đã dừng trình duyệt; cần kiểm tra yêu cầu cuối',error:'未完成；請核對錯誤與收據 / Chưa hoàn tất; kiểm tra lỗi và biên nhận'};
const count=n=>Number.isSafeInteger(n)&&n>=0;
export function importProgressView(p){
 if(!p)return null;let label=labels[p.stage]||'等待伺服器確認 / Đang chờ máy chủ';
 if(p.stage==='active')label=p.businessTrafficEnabled===true?'完整核對及啟用完成 / Đã kiểm tra và kích hoạt':'尚未確認資料開放 / Chưa xác nhận mở dữ liệu';
 if(p.stage==='prepared')label='本機預檢完成，等待開始 / Đã kiểm tra cục bộ, chờ bắt đầu';
 let value,max,unit;
 if(['uploading','chunk-acknowledged','batch-acknowledged','stopped','error'].includes(p.stage)){value=p.confirmedBytes;max=p.totalBytes;unit='已確認資料 bytes（壓縮前） / Byte dữ liệu đã xác nhận (trước nén)';}
 else if(['verifying','integrity-verified'].includes(p.stage)){value=p.verifiedBytes;max=p.totalBytes;unit='已核對 bytes / Byte đã kiểm tra';}
 else if(p.stage==='scanning'){value=p.scannedChunks;max=p.totalChunks;unit='已掃描分塊 / Khối đã quét';}
 else if(['audit','auditing'].includes(p.stage)){value=p.auditedResources;max=p.totalResources;unit='已核對資源 / Tài nguyên đã kiểm tra';}
 else if(['materializing','copying'].includes(p.stage)){value=p.completedObjects;max=p.totalObjects;unit='已還原物件 / Đối tượng đã khôi phục';}
 const meter=count(value)&&count(max)&&max>0&&value<=max?{value,max,unit}:null,uploading=['uploading','chunk-acknowledged','batch-acknowledged'].includes(p.stage);
 return{label,meter,waiting:['prepared','data-ready','active','stopped','error'].includes(p.stage)||!Object.hasOwn(labels,p.stage),confirmedChunks:count(p.confirmedChunks)?p.confirmedChunks:null,totalChunks:count(p.totalChunks)?p.totalChunks:null,confirmedRequests:count(p.confirmedRequests)?p.confirmedRequests:null,speedBytesPerSecond:uploading&&Number.isFinite(p.speedBytesPerSecond)&&p.speedBytesPerSecond>0?p.speedBytesPerSecond:null,etaSeconds:uploading&&Number.isFinite(p.etaSeconds)&&p.etaSeconds>=0?Math.ceil(p.etaSeconds):null};
}
