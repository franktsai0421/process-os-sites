'use client';
/* oxlint-disable next/no-html-link-for-pages -- Full document navigation is the operation being diagnosed; no prefetch or client-router substitution. */
import {useEffect,useRef,useState} from 'react';

type Row={kind:string;route:string;doc:string;at:number;start?:number;end?:number;method?:string;status?:number;serverMs?:number;requestId?:string;transfer?:number;totals?:{name:string;count:number;ms:number}[];spans?:{name:string;start:number;ms:number;parent:number;bytes:number}[]};
type Report={version:number;until:number;rows:Row[]};
declare global {interface Window {ProcessNavigationTiming?:{snapshot:()=>Report;stop:()=>void;clear:()=>void;loginReady?:()=>void}}}
const key='process-navigation-timing-v1';
const buttonStyle={minHeight:44,padding:8,border:'1px solid #777',borderRadius:6};
export default function NavigationDiagnostics(){
 const [access,setAccess]=useState(false),[available,setAvailable]=useState(false),[until,setUntil]=useState(0),[report,setReport]=useState<Report|null>(null),[message,setMessage]=useState('正在確認權限 / Đang kiểm tra quyền');
 const [busy,setBusy]=useState(false),pending=useRef(false),action=useRef({sequence:0,controller:null as AbortController|null});
 useEffect(()=>{let active=true;const lifetime=action.current;void fetch('/api/navigation-diagnostics',{credentials:'same-origin',cache:'no-store'}).then(async r=>{const value=r.ok?await r.json() as {enabled?:boolean;until?:number}:null;if(!active)return;if(!value||!value.enabled||Number(value.until)<=Date.now()){window.ProcessNavigationTiming?.stop();setMessage('無權限、未啟用或已到期 / Không có quyền hoặc đã hết hạn');return;}setAccess(true);setAvailable(true);setUntil(Number(value.until));setMessage('可開始限時診斷 / Có thể bắt đầu');}).catch(()=>{if(active){window.ProcessNavigationTiming?.stop();setMessage('無法確認權限 / Không thể xác nhận quyền');}});return()=>{active=false;lifetime.sequence++;lifetime.controller?.abort();};},[]);
 // Every privileged UI action uses the existing fresh, no-store auth gate.
 // No cached page authorization permits a later refresh, start or export.
 async function authorized(run:(expiry:number)=>void){
  if(pending.current)return;pending.current=true;setBusy(true);
  const sequence=++action.current.sequence,requestController=new AbortController();action.current.controller=requestController;
  try{
   const response=await fetch('/api/navigation-diagnostics',{credentials:'same-origin',cache:'no-store',signal:requestController.signal});
   const value=response.ok?await response.json() as {enabled?:boolean;until?:number}:null;
   if(sequence!==action.current.sequence||requestController.signal.aborted)return;
   if(!value?.enabled||!Number.isFinite(value.until)||Number(value.until)<=Date.now())throw Error('UNAVAILABLE');
   setUntil(Number(value.until));run(Number(value.until));
  }catch{if(sequence!==action.current.sequence)return;window.ProcessNavigationTiming?.stop();try{sessionStorage.removeItem(key);}catch{}setReport(null);setAccess(false);setAvailable(false);setMessage('權限已失效、診斷已關閉或無法確認；已停止 / Quyền không còn hợp lệ hoặc đã tắt; đã dừng');}
  finally{if(sequence===action.current.sequence){pending.current=false;action.current.controller=null;setBusy(false);}}
 }
 function cancelAction(){action.current.sequence++;action.current.controller?.abort();action.current.controller=null;pending.current=false;setBusy(false);}
 function refresh(){void authorized(()=>setReport(window.ProcessNavigationTiming?.snapshot()||null));}
 function start(){void authorized(expiry=>{const end=Math.min(Date.now()+600000,expiry,until);sessionStorage.removeItem(key+'-rows');sessionStorage.setItem(key,JSON.stringify({until:end}));location.reload();});}
 function stop(){cancelAction();window.ProcessNavigationTiming?.stop();setMessage('已停止；匯出仍須重新確認權限 / Đã dừng; xuất cần kiểm tra lại quyền');}
 function clear(){cancelAction();window.ProcessNavigationTiming?.clear();try{sessionStorage.removeItem(key);sessionStorage.removeItem(key+'-rows');}catch{}setReport(null);setMessage('已停止並清除本分頁摘要 / Đã dừng và xóa báo cáo');}
 function download(){void authorized(()=>{const value=window.ProcessNavigationTiming?.snapshot()||report;if(!value)return;const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='navigation-timing.json';a.click();URL.revokeObjectURL(url);});}
 return <main style={{maxWidth:1000,margin:'24px auto',padding:16,fontFamily:'system-ui',lineHeight:1.6}}>
  <h1>入口效能診斷 / Chẩn đoán tốc độ</h1><output>{message}</output>
  {!access?<a href="/login">登入 / Đăng nhập</a>:<>
   <p>只記耗時、固定路由類型、次數及 bytes；不記帳號、產品、網址參數或內容。本分頁最多 10 分鐘、240 筆；過期 20 分鐘後再開本頁會清除摘要。每文件最多 60 個請求，每 Worker 每分鐘最多 30 個採樣；「—」表示未取得。只進頁查看，請勿套用、儲存或送審。</p>
   <p>Chỉ ghi thời gian, loại tuyến cố định, số lượng và byte; không ghi tài khoản hay nội dung. Tối đa 10 phút / 240 mục. Chỉ xem trang; không Áp dụng, Lưu hoặc Gửi duyệt.</p>
   <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
    <button onClick={start} disabled={busy||!available} style={buttonStyle}>{available?'開始 10 分鐘 / Bắt đầu':'目前不可啟用 / Chưa khả dụng'}</button>
    <button onClick={refresh} disabled={busy} style={buttonStyle}>更新摘要 / Cập nhật</button>
    <button onClick={stop} style={buttonStyle}>停止 / Dừng</button>
    <button onClick={download} disabled={busy} style={buttonStyle}>匯出 JSON / Xuất JSON</button>
    <button onClick={clear} style={buttonStyle}>停止並清除 / Dừng và xóa</button>
   </div>
   <nav style={{display:'flex',gap:16,flexWrap:'wrap',margin:'20px 0'}}><a href="/login">登入頁 / Đăng nhập</a><a href="/process/?view=dashboard">中控首頁 / Tổng quan</a><a href="/process/?view=editor">製程編輯台 / Biên tập</a><a href="/process/?view=data&dataTab=process-master">製程平台 / Quy trình</a><a href="/process/?view=data&dataTab=quality-fqc">FQC</a></nav>
   <p>request→response 是收到標頭；resource 是完整傳輸；ready／paint 是既有就緒與兩幀後。巢狀／並行段不可相加。串流後續與缺少的段落需由管理者用 request ID 對照既有 Worker 日誌；未提供就保留未知。登入會更新既有登入限速計數／cookie，GET 可能沿用既有媒體快取寫入。</p>
   <p>response: nhận tiêu đề; resource: tải xong; ready / paint: sẵn sàng / sau hai khung hình. Không cộng các khoảng lồng nhau hoặc song song. Phần truyền luồng cần đối chiếu nhật ký Worker bằng request ID. Đăng nhập cập nhật bộ đếm / cookie; GET có thể ghi bộ nhớ đệm hiện có.</p>
   <p>{report?`${report.rows.length} 筆 / mục`:'按「更新摘要」查看 / Bấm Cập nhật'}</p>
   <div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse'}}><thead><tr>{['事件 / Sự kiện','路由 / Tuyến','耗時 ms / Thời gian','server ms','request ID'].map(v=><th key={v} style={{textAlign:'left',padding:8}}>{v}</th>)}</tr></thead><tbody>{report?.rows.map((r,i)=><tr key={i}><td>{r.kind}</td><td>{r.route}</td><td>{r.end!==undefined&&r.start!==undefined?(r.end-r.start).toFixed(1):'—'}</td><td>{r.serverMs??'—'}</td><td style={{overflowWrap:'anywhere'}}>{r.requestId||'—'}{r.spans&&<details><summary>分段 / Chi tiết</summary>{r.totals?.map(t=><div key={t.name}>{t.name}: {t.count} 次 · 累計工作 {t.ms} ms（不可相加）</div>)}{r.spans.map((s,j)=><div key={j}>{s.name}: {s.ms} ms · start {s.start} · parent {s.parent} · bytes {s.bytes}</div>)}</details>}</td></tr>)}</tbody></table></div>
  </>}
 </main>;
}
