'use client';
import {useEffect,useRef,useState} from 'react';
type Receipt={status:string;stage:string;size:number|null;sha256:string|null;elapsedMs:number};
const endpoint='/api/snapshots/import?action=c273-observation';
function receipt(v:unknown):v is Receipt{if(!v||typeof v!=='object')return false;const x=v as Record<string,unknown>;return Object.keys(x).sort().join()==='elapsedMs,sha256,size,stage,status'&&['ready','disabled','matched','mismatch','unknown','not-dispatched'].includes(String(x.status))&&['ready','disabled','claim','fetch','response','body-read','body-check','body-hash','complete','settlement','unavailable'].includes(String(x.stage))&&(x.size===null||typeof x.size==='number'&&Number.isSafeInteger(x.size)&&x.size>=0&&x.size<=1048576)&&(x.sha256===null||typeof x.sha256==='string'&&/^[a-f0-9]{64}$/.test(x.sha256))&&typeof x.elapsedMs==='number'&&Number.isSafeInteger(x.elapsedMs)&&x.elapsedMs>=0;}
const button={minHeight:48,padding:'10px 16px',marginRight:12,marginBottom:12};
export default function ObservationClient(){
 const [hasUsed,setHasUsed]=useState(false);
 const [value,setValue]=useState<Receipt|null>(null),[busy,setBusy]=useState(true),[error,setError]=useState(false),used=useRef(false),active=useRef<AbortController|null>(null);
 async function request(method:'GET'|'POST'){
  if(method==='POST'){if(used.current||value?.status!=='ready')return;used.current=true;setHasUsed(true);}active.current?.abort();const controller=new AbortController();active.current=controller;const timer=setTimeout(()=>controller.abort(),60000);setBusy(true);setError(false);
  try{const r=await fetch(endpoint,{method,credentials:'same-origin',redirect:'error',cache:'no-store',signal:controller.signal});const v:unknown=await r.json();if(!receipt(v))throw Error('OBS_RECEIPT');if(controller.signal.aborted)return;setValue(v);if(v.status!=='ready'&&v.status!=='disabled'){used.current=true;setHasUsed(true);}}catch{if(active.current===controller){setError(true);if(method==='POST')setValue({status:'unknown',stage:'unavailable',size:null,sha256:null,elapsedMs:0});}}
  finally{clearTimeout(timer);if(active.current===controller){active.current=null;setBusy(false);}}
 }
 useEffect(function readInitialReceipt(){
  active.current?.abort();const controller=new AbortController();active.current=controller;const timer=setTimeout(()=>controller.abort(),60000);
  void(async()=>{
   try{const r=await fetch(endpoint,{method:'GET',credentials:'same-origin',redirect:'error',cache:'no-store',signal:controller.signal});const v:unknown=await r.json();if(!receipt(v))throw Error('OBS_RECEIPT');if(controller.signal.aborted)return;setValue(v);if(v.status!=='ready'&&v.status!=='disabled'){used.current=true;setHasUsed(true);}}
   catch{if(active.current===controller)setError(true);}
   finally{clearTimeout(timer);if(active.current===controller){active.current=null;setBusy(false);}}
  })();
  return()=>active.current?.abort();
 },[]);
 return <main style={{maxWidth:680,margin:'auto',padding:24,fontFamily:'system-ui',overflowWrap:'anywhere'}}>
  <h1>單次 c273 觀察 / Kiểm tra c273 một lần</h1>
  <p>只讀固定分塊，不續傳、不解鎖、不啟用資料。/ Chỉ đọc khối đã cố định; không tải tiếp, mở khóa hoặc kích hoạt dữ liệu.</p>
  <p><output aria-live="polite">{busy?'等待收據；不會自動重試。/ Đang chờ biên nhận; không tự thử lại.':error?'無法確認；請只讀取收據，勿重送。/ Chưa xác nhận; chỉ xem biên nhận, không gửi lại.':value?.status==='matched'?'這次大小與 SHA 相符，不能證明舊原因或清除原鎖。/ Lần đọc này khớp; không xác định nguyên nhân cũ hoặc xóa khóa.':'需要 Frank 原有站內登入及有效觀察窗口。/ Cần đăng nhập Frank hiện có và cửa sổ kiểm tra hợp lệ.'}</output></p>
  <button style={button} disabled={busy||hasUsed||value?.status!=='ready'} onClick={()=>void request('POST')}>執行一次觀察 / Kiểm tra một lần</button>
  <button style={button} disabled={busy} onClick={()=>void request('GET')}>只讀取收據 / Chỉ xem biên nhận</button>
  {value&&<dl><dt>狀態 / Trạng thái</dt><dd>{value.status}</dd><dt>階段 / Giai đoạn</dt><dd>{value.stage}</dd><dt>Bytes</dt><dd>{value.size??'—'}</dd><dt>SHA-256</dt><dd>{value.sha256??'—'}</dd><dt>耗時 / Thời gian (ms)</dt><dd>{value.elapsedMs}</dd></dl>}
  <p><a href="/login?next=%2Fsetup%2Fimport">登入 / Đăng nhập</a> · <a href="/setup/import">返回匯入頁 / Về trang nhập</a></p>
 </main>;
}
