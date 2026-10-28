'use client';
import {useEffect,useRef,useState} from 'react';
import {completeStartupAssets,startupFiles} from '@/lib/startup-assets-client.mjs';
type Receipt={state:string;files?:{name:string;state:string}[];error?:string};
export default function StartupAssets(){
 const [receipt,setReceipt]=useState<Receipt|null>(null),[error,setError]=useState(''),[selected,setSelected]=useState<File[]>([]),[busy,setBusy]=useState(false),[stage,setStage]=useState(''),[confirmed,setConfirmed]=useState(0);const abort=useRef<AbortController|null>(null);
 useEffect(()=>{const c=new AbortController();void(async()=>{try{const r=await fetch('/api/setup/startup-assets',{credentials:'same-origin',cache:'no-store',redirect:'error',signal:c.signal});const value:Receipt=await r.json();if(!r.ok)throw Error(value.error||'STARTUP_STATUS_UNAVAILABLE');setReceipt(value);}catch{if(!c.signal.aborted)setError('請正常登入 Frank 管理員後重開本頁。 / Đăng nhập Frank rồi mở lại trang này.');}})();return()=>{c.abort();abort.current?.abort();};},[]);
 async function start(){if(busy||receipt?.state!=='ready')return;setBusy(true);setError('');abort.current=new AbortController();try{const result=await completeStartupAssets({files:selected,origin:location.origin,signal:abort.current.signal,progress:(p:{stage:string;name?:string;bytes?:number})=>{setStage(p.stage+(p.name?' · '+p.name:''));if(p.stage==='confirmed')setConfirmed(v=>v+(p.bytes||0));}});if(result.state==='complete')setReceipt(result);else{setError(result.code+' · 已停止；不自動重送 / Đã dừng; không tự gửi lại');setReceipt(result.receipt||{state:'hold'});}}catch{setError('STARTUP_SOURCE_MISMATCH');}finally{setBusy(false);abort.current=null;}}
 return <main style={{maxWidth:760,margin:'auto',padding:24,fontFamily:'system-ui',lineHeight:1.65}}><h1>補齊 R1 啟動檔 / Bổ sung tệp khởi động R1</h1><p>僅補齊三份已核對來源的啟動檔並更新私有索引；不重新匯入或修改帳密。 / Chỉ bổ sung ba tệp đã xác minh và chỉ mục riêng.</p>
 {error&&<p role="alert">{error}</p>}{receipt&&<p><output>{receipt.state==='complete'?'補件完成 / Hoàn tất':receipt.state==='ready'?'可補件 / Sẵn sàng':'狀態待核對；不要重送 / Cần kiểm tra, không gửi lại'}</output></p>}
 <ul>{startupFiles.map(f=><li key={f.name}>{f.name} · {f.bytes.toLocaleString()} bytes</li>)}</ul>
 {receipt?.state==='ready'&&<><label>固定來源三檔 / Ba tệp nguồn <input type="file" multiple accept=".js" disabled={busy} onChange={e=>setSelected(Array.from(e.target.files||[]))}/></label><p>已選 {selected.length}/3</p><button disabled={busy||selected.length!==3} onClick={()=>void start()} style={{minHeight:48,padding:12}}>開始補件 / Bắt đầu</button></>}
 {busy&&<button style={{minHeight:48,marginLeft:12}} onClick={()=>abort.current?.abort()}>停止送出 / Dừng gửi</button>}
 <p><output aria-live="polite">{stage} · 已確認 {confirmed.toLocaleString()} / 1,386,533 bytes</output></p>
 {receipt?.state==='complete'&&<a href="/process/" target="_top">開啟網站 / Mở trang web</a>}<p><a href="/login" target="_top">登入 / Đăng nhập</a></p>
 </main>;
}
