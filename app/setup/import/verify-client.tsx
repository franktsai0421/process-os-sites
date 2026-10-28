'use client';
import {useEffect,useRef,useState} from 'react';
import {createOwnerVerifier} from '@/lib/snapshot-owner-verifier.mjs';
import type {ImportConfiguration} from './upload-client';
// Stage is authored by this UI or the fixed owner runner's emit(), not copied from an HTTP response.
type Report={stage:string;[key:string]:unknown};
export default function VerifyClient({pins}:ImportConfiguration){
 const controller=useRef<AbortController|null>(null),busy=useRef(false);
 const [running,setRunning]=useState(false),[report,setReport]=useState<Report>({stage:'idle'}),[elapsed,setElapsed]=useState(0);
 useEffect(()=>()=>controller.current?.abort(),[]);
 async function start(){if(busy.current)return;busy.current=true;setRunning(true);const abort=new AbortController();controller.current=abort;const startAt=Date.now();const timer=setInterval(()=>setElapsed(Date.now()-startAt),1000);
  try{const runner=await createOwnerVerifier({pins,request:(url:string,options:RequestInit)=>fetch(url,options),signal:abort.signal,onProgress:async p=>{setReport(p);}});const result=await runner.run();setReport(old=>({...old,...result}));}
  catch{setReport({stage:'stopped',code:'OWNER_VERIFY_START_FAILED'});}
  finally{clearInterval(timer);busy.current=false;controller.current=null;setRunning(false);}}
 const labels:Record<string,string>={idle:'尚未開始 / Chưa bắt đầu',checking:'確認管理員與已存進度 / Kiểm tra quyền và tiến độ đã lưu',verifying:'逐一核對資料雜湊 / Kiểm tra hàm băm dữ liệu',auditing:'核對資料與圖片引用 / Kiểm toán dữ liệu và liên kết ảnh',sealed:'核對封存完成；尚未啟用 / Kiểm toán hoàn tất; chưa kích hoạt',stopped:'已停止，請查看狀態 / Đã dừng; kiểm tra trạng thái',stopping:'停止送出，讀取最後進度 / Dừng gửi và đọc tiến độ cuối'};
 const stage=String(report.stage||'idle'),chunks=Number(report.verifiedChunks||0),total=Number(report.totalChunks||0),audited=Number(report.auditedResources||0),auditTotal=Number(report.totalResources||0);
 return <main style={{maxWidth:800,margin:'auto',padding:24,fontFamily:'system-ui',overflowWrap:'anywhere'}}>
  <h1>接續資料核對 / Tiếp tục kiểm tra dữ liệu</h1>
  <p>使用目前管理員登入，自動連續核對已上傳資料。不需選檔；完成後停於稽核封存，不啟用業務資料。</p>
  <p>Dùng phiên quản trị hiện tại để kiểm tra liên tục dữ liệu đã tải lên. Không chọn tệp; dừng sau kiểm toán, chưa kích hoạt dữ liệu.</p>
  <p>關閉頁面即停止送出後續請求；重開先查持久進度。結果不明時停止，不自動重送。</p>
  <p>Đóng trang sẽ dừng yêu cầu tiếp theo. Mở lại đọc tiến độ đã lưu. Kết quả không rõ sẽ dừng, không tự gửi lại.</p>
  <div style={{display:'flex',gap:12,flexWrap:'wrap'}}><button disabled={running} onClick={()=>void start()} style={{minHeight:44}}>開始／重新讀取進度並接續 / Bắt đầu, đọc tiến độ và tiếp tục</button><button disabled={!running} onClick={()=>{controller.current?.abort();setReport(old=>({...old,stage:'stopping'}));}} style={{minHeight:44}}>停止 / Dừng</button></div>
  <p>本次耗時 / Thời gian: {Math.floor(elapsed/1000)} s</p>
  <section aria-live="polite" style={{background:'#f5f2ea',padding:16}}><h2>{labels[stage]||stage}</h2>
   {total>0&&<><progress aria-label="已核對分塊 / Khối đã kiểm tra" value={chunks} max={total} style={{width:'100%'}}/><p>{chunks} / {total} 已核對分塊 / khối đã kiểm tra</p></>}
   {auditTotal>0&&<><progress aria-label="已稽核物件 / Đối tượng đã kiểm toán" value={audited} max={auditTotal} style={{width:'100%'}}/><p>{audited} / {auditTotal} 已稽核物件 / đối tượng đã kiểm toán</p></>}
   {running&&<p>等待本次伺服器回應；不以計時器增加進度 / Đợi phản hồi máy chủ; tiến độ chỉ theo biên nhận.</p>}
   {typeof report.requestMs==='number'&&<p>最近請求耗時 / Yêu cầu gần nhất: {(report.requestMs/1000).toFixed(1)} s</p>}
   {typeof report.code==='string'&&<p>{report.code}</p>}
   {report.uncertain===true&&<p>結果尚待確認，已停止；不會自動重送。 / Kết quả chưa được xác nhận; đã dừng, không tự gửi lại.</p>}
  </section>
  {stage==='sealed'&&<form action="/setup/import" method="get"><input type="hidden" name="continue" value="apply"/><button type="submit" style={{minHeight:44,padding:'8px 12px'}}>套用已核對資料並啟用 / Áp dụng dữ liệu đã kiểm toán</button></form>}
  <div style={{display:'flex',gap:12,flexWrap:'wrap'}}><form action="/login" method="get"><input type="hidden" name="next" value="/setup/import?continue=verify"/><button type="submit" style={{minHeight:44,padding:'8px 12px'}}>登入並返回 / Đăng nhập và quay lại</button></form><form action="/setup/import" method="get"><button type="submit" style={{minHeight:44,padding:'8px 12px'}}>資料匯入頁 / Trang nhập dữ liệu</button></form></div>
 </main>;
}
