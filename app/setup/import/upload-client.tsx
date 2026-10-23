'use client';
import {useRef,useState} from 'react';
import {openBrowserSnapshot} from '@/lib/snapshot-browser-source.mjs';
import {prepareRecipeUpload,inspectRecipeD1Rows,assertUploadCapacity,createRecipeUploader} from '@/lib/snapshot-recipe-uploader.mjs';
import {assertAttemptPlan} from '@/lib/snapshot-attempt-policy.mjs';
import {importPreflightMessage,importRestoreMessage} from '@/lib/snapshot-import-messages.mjs';

type Pins={projectId:string;origin:string;ownerId:string;targetFingerprint:string;manifestSha256:string};
type Capacity={projectId:string;targetFingerprint:string;reference:string;checkedAt:string;r2AvailableBytes:number;d1AvailableBytes:number};
type Attempt=Pins&{mode:'bounded-attempt';capacityKnown:false;approvalId:string;issuedAt:string;expiresAt:string;writeBytes:number;writeCalls:number;requests:number;dbBytes:number;dbStatements:number};
type Budget={state:string;inFlight:boolean;reason:string|null;used:{writeBytes:number;writeCalls:number;requests:number;dbBytes:number;dbStatements:number}|null};
export type ImportConfiguration={pins:Pins;capacity:Capacity|null;attempt?:Attempt|null;budget?:Budget|null;bootstrapClosed:boolean};
export default function ImportClient({pins,capacity,attempt,budget,bootstrapClosed}:ImportConfiguration){
 const [sourceFiles,setSourceFiles]=useState<File[]>([]),[handoffFiles,setHandoffFiles]=useState<File[]>([]),[message,setMessage]=useState(''),[summary,setSummary]=useState(''),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[resume,setResume]=useState(false),[activate,setActivate]=useState(false);
 const abort=useRef<AbortController|null>(null);
 const folder=(node:HTMLInputElement|null)=>{node?.setAttribute('webkitdirectory','');};
 async function open(){return openBrowserSnapshot({sourceFiles,handoffFiles,pins});}
 async function preflight(){setBusy(true);setReady(false);setMessage('');try{const source=await open(),plan=await prepareRecipeUpload(source,pins),rows=await inspectRecipeD1Rows(source,plan.manifest);setSummary(JSON.stringify({target:pins.projectId,...plan.summary,d1Rows:rows},null,2));if(attempt)assertAttemptPlan(plan,attempt);else assertUploadCapacity(plan,capacity);if(!bootstrapClosed)throw Error('UPLOAD_BOOTSTRAP_MUST_BE_CLOSED');setReady(true);setMessage(importPreflightMessage(!!attempt));}catch(e){setMessage(e instanceof Error?e.message:'UPLOAD_PREFLIGHT_UNAVAILABLE');}finally{setBusy(false);}}
 async function upload(){setBusy(true);setReady(false);abort.current=new AbortController();try{const source=await open(),client=await createRecipeUploader({source,pins,signal:abort.current.signal,onProgress:async(p:{stage:string;sequence?:number;totalChunks?:number})=>setMessage(p.stage+(p.sequence===undefined?'':` ${p.sequence+1}/${p.totalChunks}`)),request:async(url:string,options:RequestInit)=>{if(new URL(url).origin!==location.origin||location.origin!==pins.origin)throw Error('UPLOAD_TARGET');const selected=new Headers(options.headers);selected.delete('Origin');return fetch(url,{...options,headers:selected,credentials:'same-origin',redirect:'error'});}});
  const options={allowDataWrite:true,capacity,attempt,resume};await client.upload(options);const result=await client.restore({...options,allowActivation:activate});setMessage(importRestoreMessage(result));
 }catch(e){setMessage((e instanceof Error?e.message:'UPLOAD_UNAVAILABLE')+' — 已保留伺服器收據，請先核對再續傳。 / Đã giữ biên nhận; kiểm tra trước khi tiếp tục.');}finally{setBusy(false);abort.current=null;}}
 return <main style={{maxWidth:760,margin:'auto',padding:24,fontFamily:'system-ui',overflowWrap:'anywhere'}}>
  <h1>私人測試站資料匯入 / Nhập dữ liệu cho trang thử nghiệm riêng tư</h1>
  {budget&&<p role="status">{budget.state} {budget.reason||''} {budget.inFlight?'伺服器請求尚未收尾 / Yêu cầu máy chủ chưa kết thúc':''}</p>}
  {budget?.used&&<pre style={{whiteSpace:'pre-wrap'}}>伺服器已記帳 / Máy chủ đã ghi nhận: {JSON.stringify(budget.used,null,2)}</pre>}
  <p>使用目前管理員登入狀態，不會要求或變更密碼。 / Dùng phiên quản trị viên hiện tại; không yêu cầu hoặc thay đổi mật khẩu.</p>
  <p>目標 / Đích: {pins.origin}</p>
  {attempt&&<p role="status">容量未知：僅依固定伺服器預算嘗試，遇額度、付款或權限問題停止，暫存保留；不保證匯入成功。 / Dung lượng chưa rõ: chỉ thử trong ngân sách cố định; dừng khi gặp giới hạn, thanh toán hoặc quyền, giữ phần tạm.</p>}
  {!capacity&&!attempt&&<p role="status">平台剩餘容量／費用尚未核實，禁止開始上傳。可先核對本機檔案。 / Chưa xác minh dung lượng và chi phí: chưa thể tải lên.</p>}
  <label style={{display:'block',margin:'20px 0'}}>原已驗證快照資料夾 / Thư mục bản chụp đã kiểm tra<input ref={folder} type="file" multiple disabled={busy} onChange={e=>{setSourceFiles(Array.from(e.target.files||[]));setReady(false);}} style={{display:'block',minHeight:48,maxWidth:'100%'}}/></label>
  <label style={{display:'block',margin:'20px 0'}}>已完成的少量重播交接資料夾 / Thư mục chuyển giao đã hoàn tất<input ref={folder} type="file" multiple disabled={busy} onChange={e=>{setHandoffFiles(Array.from(e.target.files||[]));setReady(false);}} style={{display:'block',minHeight:48,maxWidth:'100%'}}/></label>
  <button disabled={busy||!sourceFiles.length||!handoffFiles.length} onClick={preflight} style={{minHeight:48}}>唯讀預檢 / Kiểm tra, không gửi dữ liệu</button>
  {summary&&<details><summary>核對摘要 / Tóm tắt kiểm tra</summary><pre style={{whiteSpace:'pre-wrap',fontSize:13}}>{summary}</pre></details>}
  <label style={{display:'block',padding:12}}><input type="checkbox" disabled={busy} checked={resume} onChange={e=>setResume(e.target.checked)}/> 依既有收據續傳 / Tiếp tục theo biên nhận hiện có</label>
  <label style={{display:'block',padding:12}}><input type="checkbox" disabled={busy} checked={activate} onChange={e=>setActivate(e.target.checked)}/> 完成完整核對後啟用資料 / Kích hoạt sau khi kiểm tra đầy đủ</label>
  <button disabled={busy||!ready||(!capacity&&!attempt)||!bootstrapClosed||budget?.state==='stopped'||budget?.inFlight} onClick={upload} style={{minHeight:48}}>上傳、核對及還原 / Tải lên, kiểm tra và khôi phục</button>
  <button disabled={!busy||!abort.current} onClick={()=>abort.current?.abort()} style={{minHeight:48,margin:12}}>停止並保留進度 / Dừng và giữ tiến độ</button>
  <p role="status" aria-live="polite">{message}</p><a href="/login" target="_top">返回登入頁 / Trang đăng nhập</a>
 </main>;
}
