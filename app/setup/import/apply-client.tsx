'use client';
import {useEffect,useRef,useState} from 'react';
import {createOwnerApplier} from '@/lib/snapshot-owner-applier.mjs';
import {recoverOwnerCopy} from '@/lib/snapshot-owner-copy-recovery.mjs';
import type {ImportConfiguration} from './upload-client';
// Stage is authored by this UI or the fixed owner runner's emit(), not copied from an HTTP response.
type Report={stage:string;[key:string]:unknown};
export default function ApplyClient({pins,repairCopy=false}:ImportConfiguration&{repairCopy?:boolean}){
 const controller=useRef<AbortController|null>(null),busy=useRef(false),recoveryAttempted=useRef(false);
 const [recoveryUsed,setRecoveryUsed]=useState(false);
 const [running,setRunning]=useState(false),[report,setReport]=useState<Report>({stage:'idle'}),[elapsed,setElapsed]=useState(0);
 useEffect(()=>()=>controller.current?.abort(),[]);
 async function start(){if(busy.current||repairCopy&&recoveryAttempted.current)return;if(repairCopy){recoveryAttempted.current=true;setRecoveryUsed(true);}busy.current=true;setRunning(true);const abort=new AbortController();controller.current=abort;const began=Date.now();const timer=setInterval(()=>setElapsed(Date.now()-began),1000);
  try{if(repairCopy){setReport({stage:'checking'});const recovery=await recoverOwnerCopy({origin:pins.origin,request:(url:string,options:RequestInit)=>fetch(url,options),signal:abort.signal});if(recovery.status!=='recovered'){setReport({stage:'stopped',...recovery});return;}}const runner=await createOwnerApplier({pins,request:(url:string,options:RequestInit)=>fetch(url,options),signal:abort.signal,onProgress:async p=>setReport(p)});const result=await runner.run({allowApply:true,allowActivation:true});setReport(old=>({...old,...result}));}
  catch{setReport({stage:'stopped',code:'OWNER_APPLY_START_FAILED'});}
  finally{clearInterval(timer);busy.current=false;controller.current=null;setRunning(false);}}
 const stage=String(report.stage||'idle'),objects=Number(report.completedObjects||0),total=Number(report.totalObjects||0);
 const labels:Record<string,string>={idle:'尚未開始 / Chưa bắt đầu',checking:'核對登入與已封存進度 / Kiểm tra phiên và dữ liệu đã kiểm toán',copying:'建立圖片與附件 / Khôi phục ảnh và tệp',restoring:'還原資料列 / Khôi phục dữ liệu', 'data-ready':'資料已還原，尚待啟用 / Dữ liệu sẵn sàng, chưa kích hoạt',activating:'保留管理員密碼並啟用 / Giữ mật khẩu quản trị và kích hoạt',active:'資料已啟用 / Dữ liệu đã kích hoạt',stopped:'已停止，請核對結果 / Đã dừng, kiểm tra kết quả',stopping:'停止送出並讀回結果 / Dừng gửi và đọc trạng thái'};
 return <main style={{maxWidth:800,margin:'auto',padding:24,fontFamily:'system-ui',overflowWrap:'anywhere'}}>
  <h1>套用已核對資料 / Áp dụng dữ liệu đã kiểm toán</h1>
  {repairCopy&&<p>只核對這次第162個物件並恢復161進度；完成後自動接續套用。結果不明不重送。 / Chỉ kiểm tra đối tượng 162 và tiếp tục từ 161; không gửi lại khi chưa rõ kết quả.</p>}
  <p>只套用目前已封存的資料，不選檔、不重傳、不重跑核對。這會更新私人測試站的業務資料與帳號引用，保留 Frank 現有密碼；啟用後需重新登入。員工密碼不會搬移。</p>
  <p>Chỉ dùng dữ liệu đã tải lên và kiểm toán. Cập nhật dữ liệu nghiệp vụ, giữ mật khẩu Frank; đăng nhập lại sau kích hoạt. Không chuyển mật khẩu nhân viên.</p>
  <p>共享容量餘額未知；沿用固定預算。衝突、額度、付款要求或結果不明即停止；不自動重送。不刪除原始資料或暫存。關閉頁面會停止後續送出。</p>
  <p>Dung lượng dùng chung chưa xác định; dùng giới hạn đã duyệt. Dừng khi xung đột, thiếu dung lượng, yêu cầu thanh toán hoặc kết quả không rõ. Không tự gửi lại, không xóa dữ liệu gốc. Đóng trang sẽ dừng yêu cầu tiếp theo.</p>
  <p>目標 / Đích: {pins.projectId} · {pins.manifestSha256}</p>
  <div style={{display:'flex',gap:12,flexWrap:'wrap'}}><button disabled={running||stage==='active'||repairCopy&&recoveryUsed} onClick={()=>void start()} style={{minHeight:44}}>套用資料並啟用 / Áp dụng và kích hoạt</button><button disabled={!running} onClick={()=>{controller.current?.abort();setReport(old=>({...old,stage:'stopping'}));}} style={{minHeight:44}}>停止 / Dừng</button></div>
  {report.receiptState==='recovered'&&<p><a href="?continue=apply">恢復收據已確認；重新開啟一般套用入口 / Đã xác nhận khôi phục; mở lại trang áp dụng</a></p>}
  <p>本次耗時 / Thời gian: {Math.floor(elapsed/1000)} s</p>
  <section aria-live="polite" style={{background:'#f5f2ea',padding:16}}><h2>{labels[stage]||stage}</h2>
   {total>0&&<><progress aria-label="已建立物件 / Đối tượng đã khôi phục" value={objects} max={total} style={{width:'100%'}}/><p>{objects} / {total} 個圖片、附件與資料物件 / đối tượng</p></>}
   {typeof report.restoredRows==='number'&&<p>已還原 / Đã khôi phục: {report.restoredRows} 列 / dòng</p>}
   {running&&<p>等待伺服器回應；進度只依確認收據。 / Đợi máy chủ; tiến độ chỉ theo biên nhận.</p>}
   {typeof report.requestMs==='number'&&<p>最近請求 / Yêu cầu gần nhất: {(report.requestMs/1000).toFixed(1)} s</p>}
   {typeof report.code==='string'&&<p>{report.code}</p>}
   {report.uncertain===true&&<p>結果不明，請勿重複送出；保留資料並核對狀態。 / Kết quả chưa rõ, không gửi lại; giữ dữ liệu và kiểm tra trạng thái.</p>}
   {stage==='active'&&<p>保留的管理員密碼可繼續使用。請重新登入；資料與主要功能驗收仍須完成。 / Mật khẩu quản trị được giữ nguyên. Đăng nhập lại; vẫn cần nghiệm thu dữ liệu và chức năng.</p>}
  </section>
  <p><a href="/login?next=%2Fsetup%2Fimport">登入 / Đăng nhập</a> · <a href="/setup/import?continue=verify">核對頁 / Trang kiểm toán</a></p>
 </main>;
}
