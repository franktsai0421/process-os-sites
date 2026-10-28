'use client';
import {useRef,useState} from 'react';
import {openBrowserSnapshot} from '@/lib/snapshot-browser-source.mjs';
import {prepareRecipeUpload,inspectRecipeD1Rows,assertUploadCapacity,createRecipeUploader} from '@/lib/snapshot-recipe-uploader.mjs';
import {assertAttemptPlan} from '@/lib/snapshot-attempt-policy.mjs';
import {importPreflightMessage,importRestoreMessage} from '@/lib/snapshot-import-messages.mjs';
import {importProgressView} from '@/lib/snapshot-progress.mjs';
type Pins={projectId:string;origin:string;ownerId:string;targetFingerprint:string;manifestSha256:string};
type Capacity={projectId:string;targetFingerprint:string;reference:string;checkedAt:string;r2AvailableBytes:number;d1AvailableBytes:number};
type Attempt=Pins&{mode:'bounded-attempt';capacityKnown:false;approvalId:string;issuedAt:string;expiresAt:string;writeBytes:number;writeCalls:number;requests:number;dbBytes:number;dbStatements:number};
type Budget={state:string;inFlight:boolean;reason:string|null;used:{writeBytes:number;writeCalls:number;requests:number;dbBytes:number;dbStatements:number}|null};
type Progress={stage:string;[key:string]:unknown};
type Retirement={oldTransferId:string;nextTransferId:string;state:'required'|'fenced'|'retired';preservesStaging:boolean};
export type ImportConfiguration={pins:Pins;capacity:Capacity|null;attempt?:Attempt|null;budget?:Budget|null;retirement?:Retirement|null;bootstrapClosed:boolean};
function ProgressPanel({progress}:{progress:Progress|null}){
 const v=importProgressView(progress);if(!v)return null;
 return <section aria-label="匯入進度 / Tiến độ nhập" style={{padding:16,border:'1px solid #94a3b8',borderRadius:10,margin:'20px 0',background:'#f8fafc'}}>
  <h2 style={{fontSize:20,marginTop:0}}>匯入進度 / Tiến độ nhập</h2><p><output aria-live="polite">{v.label}</output></p>
  {v.meter?<><progress aria-label={v.meter.unit} value={v.meter.value} max={v.meter.max} style={{width:'100%',height:24}}/><p>{v.meter.unit}: {v.meter.value.toLocaleString()} / {v.meter.max.toLocaleString()}</p></>:!v.waiting?<progress aria-label="等待實際收據 / Đang chờ biên nhận" style={{width:'100%',height:24}}/>:null}
  {v.confirmedChunks!==null&&<p>已確認分塊 / Khối đã xác nhận: {v.confirmedChunks} / {v.totalChunks}; 已確認請求 / Yêu cầu đã xác nhận: {v.confirmedRequests}</p>}
  {v.speedBytesPerSecond!==null&&<p>最近已確認資料速度 / Tốc độ đã xác nhận: {(v.speedBytesPerSecond/1048576).toFixed(2)} MiB/s</p>}
  {v.etaSeconds!==null&&<p>僅本階段估計剩餘 / Ước tính còn lại cho giai đoạn này: {Math.ceil(v.etaSeconds/60)} 分鐘 / phút</p>}
  <p style={{fontSize:13}}>進度依伺服器收據更新；預算扣帳不等於上傳成功。完整核對前不開放公司資料。 / Tiến độ theo biên nhận; trừ ngân sách không đồng nghĩa thành công. Chưa mở dữ liệu trước khi kiểm tra đầy đủ.</p>
 </section>;
}
const controls={minHeight:48,border:'1px solid #64748b',borderRadius:7,padding:'10px 16px',margin:'6px 8px 6px 0',background:'#fff',color:'#0f172a'};
export default function ImportClient({pins,capacity,attempt,budget,retirement,bootstrapClosed}:ImportConfiguration){
 const [retirementState,setRetirementState]=useState(retirement);
 const [sourceFiles,setSourceFiles]=useState<File[]>([]),[handoffFiles,setHandoffFiles]=useState<File[]>([]),[message,setMessage]=useState(''),[summary,setSummary]=useState(''),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[resume,setResume]=useState(false),[activate,setActivate]=useState(false),[progress,setProgress]=useState<Progress|null>(null),[liveBudget,setLiveBudget]=useState(budget),[receiptUncertain,setReceiptUncertain]=useState(false);
 const [controllerAvailable,setControllerAvailable]=useState(false);
 const abort=useRef<AbortController|null>(null),folder=(n:HTMLInputElement|null)=>{n?.setAttribute('webkitdirectory','');};
 async function open(){return openBrowserSnapshot({sourceFiles,handoffFiles,pins});}
 async function refreshBudget(){
  try{const r=await fetch('/api/snapshots/import?action=budget-status',{credentials:'same-origin',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('READ_UNAVAILABLE');const next:unknown=await r.json();if(next===null){setLiveBudget(null);setReceiptUncertain(false);return;}if(!next||typeof next!=='object')throw Error('READ_UNAVAILABLE');const b=next as Budget;if(!['not-started','open','stopped','complete','retirement-required'].includes(b.state)||typeof b.inFlight!=='boolean')throw Error('READ_UNAVAILABLE');setLiveBudget(b);setReceiptUncertain(false);}catch{setReceiptUncertain(true);}
 }
 async function retireCancelled(){
  if(!retirementState||retirementState.state==='retired')return;setBusy(true);setReady(false);setMessage('');
  try{const r=await fetch('/api/snapshots/import?action=retire',{method:'POST',credentials:'same-origin',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify({confirmOldTransferId:retirementState.oldTransferId})});if(!r.ok)throw Error('IMPORT_RETIREMENT_UNCONFIRMED');const value:unknown=await r.json();if(!value||typeof value!=='object')throw Error('IMPORT_RETIREMENT_UNCONFIRMED');const receipt=value as Record<string,unknown>;if(receipt.oldTransferId!==retirementState.oldTransferId||receipt.nextTransferId!==retirementState.nextTransferId||receipt.state!=='retired'||receipt.preservesStaging!==true)throw Error('IMPORT_RETIREMENT_UNCONFIRMED');setRetirementState({...retirementState,state:'retired'});setMessage('已封存取消的傳輸；原暫存保留。請對新資料包重新預檢。 / Đã cách ly lần truyền đã hủy; giữ nguyên tệp cũ. Kiểm tra lại gói mới.');}
  catch{setReceiptUncertain(true);setMessage('IMPORT_RETIREMENT_UNCONFIRMED — 不自動重送；請先核對伺服器封存收據。 / Không tự gửi lại; kiểm tra biên nhận máy chủ.');}finally{await refreshBudget();setBusy(false);}
 }
 async function preflight(){
  setBusy(true);setReady(false);setMessage('');setProgress({stage:'preflight'});
  try{const source=await open(),plan=await prepareRecipeUpload(source,pins),rows=await inspectRecipeD1Rows(source,plan.manifest);setSummary(JSON.stringify({target:pins.projectId,...plan.summary,d1Rows:rows},null,2));if(attempt)assertAttemptPlan(plan,attempt);else assertUploadCapacity(plan,capacity);if(!bootstrapClosed)throw Error('UPLOAD_BOOTSTRAP_MUST_BE_CLOSED');await refreshBudget();setReady(true);setProgress({stage:'prepared'});setMessage(importPreflightMessage(!!attempt));}
  catch(e){setMessage(e instanceof Error&&/^[A-Z0-9_]+$/.test(e.message)?e.message:'UPLOAD_PREFLIGHT_UNAVAILABLE');setProgress({stage:'error'});}finally{setBusy(false);}
 }
 async function upload(){
  setBusy(true);setReady(false);setMessage('');setProgress({stage:'preparing'});abort.current=new AbortController();setControllerAvailable(true);
  try{const source=await open(),client=await createRecipeUploader({source,pins,batch:true,signal:abort.current.signal,onProgress:async(p:Progress)=>setProgress(p),request:async(url:string,options:RequestInit)=>{if(new URL(url).origin!==location.origin||location.origin!==pins.origin)throw Error('UPLOAD_TARGET');const h=new Headers(options.headers);h.delete('Origin');return fetch(url,{...options,headers:h,credentials:'same-origin',redirect:'error'});}});
   const options={allowDataWrite:true,capacity,attempt,resume};await client.upload(options);const result=await client.restore({...options,allowActivation:activate});setMessage(importRestoreMessage(result));
  }catch(e){if(abort.current?.signal.aborted)setProgress(p=>({...p,stage:'stopped'}));else setProgress(p=>({...p,stage:'error'}));setMessage((e instanceof Error&&/^[A-Z0-9_]+$/.test(e.message)?e.message:'UPLOAD_UNAVAILABLE')+' — 不會自動重試；最後請求請依收據核對。 / Không tự thử lại; kiểm tra biên nhận yêu cầu cuối.');await refreshBudget();}
  finally{setBusy(false);abort.current=null;setControllerAvailable(false);}
 }
 return <main style={{maxWidth:800,margin:'auto',padding:24,fontFamily:'system-ui',lineHeight:1.6,overflowWrap:'anywhere',color:'#0f172a'}}>
  <h1 style={{fontSize:26}}>私人測試站資料匯入 / Nhập dữ liệu cho trang thử nghiệm riêng tư</h1>
  <p>使用目前管理員登入狀態，不會要求或變更密碼。 / Dùng phiên quản trị viên hiện tại; không yêu cầu hoặc thay đổi mật khẩu.</p><p>目標 / Đích: {pins.origin}</p>
  {attempt&&<p><output>容量未知：僅依固定伺服器預算嘗試；遇額度、付款或權限問題即停並保留待處理資料，不保證成功。 / Dung lượng chưa rõ: thử trong ngân sách cố định; dừng khi gặp giới hạn, thanh toán hoặc quyền.</output></p>}
  {!capacity&&!attempt&&<p><output>尚無容量或有限預算設定，不能上傳。 / Chưa có cấu hình dung lượng hoặc ngân sách; chưa thể tải lên.</output></p>}
  {retirementState&&retirementState.state!=='retired'&&<section><p><output>取消的舊傳輸必須先封存隔離；不刪除暫存、不續傳舊包。 / Cần cách ly lần truyền đã hủy; không xóa tệp hay tiếp tục gói cũ.</output></p><button disabled={busy||!bootstrapClosed} onClick={retireCancelled} style={controls}>封存已取消傳輸 / Cách ly lần truyền đã hủy</button></section>}
  <ProgressPanel progress={progress}/>
  {liveBudget&&<details><summary>伺服器預算收據（不是上傳進度） / Biên nhận ngân sách, không phải tiến độ</summary><p>{liveBudget.state} {liveBudget.reason||''} {liveBudget.inFlight?'最後請求尚未收尾 / Yêu cầu cuối chưa hoàn tất':''}</p>{liveBudget.used&&<pre style={{whiteSpace:'pre-wrap'}}>{JSON.stringify(liveBudget.used,null,2)}</pre>}</details>}
  {receiptUncertain&&<p role="alert">無法核對最後請求收據，暫不允許再次上傳；請勿重設或刷新來重試。 / Chưa kiểm tra được biên nhận cuối; chưa cho phép tải lại.</p>}
  <label style={{display:'block',margin:'20px 0'}}>原已驗證快照資料夾 / Thư mục bản chụp đã kiểm tra<input ref={folder} type="file" multiple disabled={busy} onChange={e=>{setSourceFiles(Array.from(e.target.files||[]));setReady(false);setSummary('');setProgress(null);}} style={{display:'block',minHeight:48,maxWidth:'100%'}}/></label>
  <label style={{display:'block',margin:'20px 0'}}>已完成的精簡交接資料夾 / Thư mục chuyển giao tinh gọn<input ref={folder} type="file" multiple disabled={busy} onChange={e=>{setHandoffFiles(Array.from(e.target.files||[]));setReady(false);setSummary('');setProgress(null);}} style={{display:'block',minHeight:48,maxWidth:'100%'}}/></label>
  <p>已選檔案 / Tệp đã chọn: {sourceFiles.length} / {handoffFiles.length}</p>
  <button disabled={busy||!sourceFiles.length||!handoffFiles.length} onClick={preflight} style={controls}>唯讀預檢（不上傳檔案） / Kiểm tra, không gửi tệp</button>
  {summary&&<details><summary>預檢摘要 / Tóm tắt kiểm tra</summary><pre style={{whiteSpace:'pre-wrap',fontSize:13}}>{summary}</pre></details>}
  <label style={{display:'block',padding:12}}><input type="checkbox" disabled={busy} checked={resume} onChange={e=>setResume(e.target.checked)}/> 依同一傳輸的既有收據續傳 / Tiếp tục cùng lần truyền theo biên nhận</label>
  <label style={{display:'block',padding:12}}><input type="checkbox" disabled={busy} checked={activate} onChange={e=>setActivate(e.target.checked)}/> 完整核對後才啟用資料 / Chỉ kích hoạt sau khi kiểm tra đầy đủ</label>
  <button disabled={busy||!ready||(!capacity&&!attempt)||!bootstrapClosed||receiptUncertain||liveBudget?.state==='stopped'||liveBudget?.inFlight} onClick={upload} style={{...controls,background:'#1e40af',color:'#fff'}}>批次上傳、核對及還原 / Tải theo lô, kiểm tra và khôi phục</button>
  <button disabled={!busy||!controllerAvailable} onClick={()=>abort.current?.abort()} style={controls}>停止送出並核對最後收據 / Dừng gửi và kiểm tra biên nhận cuối</button>
  <p><output aria-live="polite">{message}</output></p><a href="/login?next=%2Fsetup%2Fimport" target="_top">登入後返回匯入頁 / Đăng nhập rồi quay lại trang nhập</a>
 </main>;
}
