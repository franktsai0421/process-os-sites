'use client';
import {useEffect,useRef,useState,type FormEvent} from 'react';
import {loginDestination,loginIntent} from '@/lib/login-destination.mjs';
import './login.css';

export default function Login(){
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const [system,setSystem]=useState('process'),[line,setLine]=useState('A');
  useEffect(()=>{const query=loginIntent(window.location.search);setSystem(query.get('system')||'process');setLine(query.get('line')||'A');},[]);
  const account=useRef<HTMLInputElement>(null),attempt=useRef(0);
  useEffect(()=>()=>{attempt.current++;},[]);
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(busy)return;
    const form=new FormData(event.currentTarget);
    const player=(event.nativeEvent as SubmitEvent).submitter?.getAttribute('value')==='player';
    const request=++attempt.current;
    setBusy(true);setError('');
    try {
      const response=await fetch('/api/platform-login',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({id:form.get('id'),password:form.get('password')})});
      if(request!==attempt.current)return;
      if(response.ok){
        try{sessionStorage.removeItem('process-platform-signed-out');}
        catch{setError('登入已確認，但瀏覽器無法更新登入標記。請先排除瀏覽器儲存問題；不要重送登入。 / Đã đăng nhập nhưng không cập nhật được dấu phiên; hãy khắc phục lưu trữ, không gửi lại đăng nhập.');return;}
        const query=new URLSearchParams(window.location.search);
        if(player){query.delete('next');query.set('system','process');query.set('view','player');query.set('line',line);query.delete('stage');}
        else if(!query.has('system')){query.set('system',system);}
        window.location.assign(loginDestination(query.toString()));return;
      }
      setError(response.status===429?'登入次數過多，請稍後重試 / Vui lòng thử lại sau.':'帳號或密碼錯誤，或暫時無法登入 / Không thể đăng nhập.');
    }catch{if(request===attempt.current)setError('連線失敗，請稍後重試 / Không thể kết nối.');}
    finally{if(request===attempt.current)setBusy(false);}
  }
  function chooseSystem(value:string){setSystem(value);const query=new URLSearchParams({system:value});window.history.replaceState(null,'','/login?'+query);}
  return <main className="site-entry">
    <section className="site-entry-brand"><div className="site-entry-mark">製</div><p>PROCESS &amp; QUALITY OS</p><h1>製程中控入口</h1><p>依帳號權限進入管理、確認、編輯或產線播放功能。</p></section>
    <form className="site-entry-panel" onSubmit={submit} aria-busy={busy}>
      <nav className="site-entry-systems" aria-label="系統入口">
        <button type="button" aria-pressed={system==='process'} disabled={busy} onClick={()=>chooseSystem('process')}>製程中控</button>
        <button type="button" aria-pressed={system==='quality'} disabled={busy} onClick={()=>chooseSystem('quality')}>品質管理</button>
      </nav>
      <h2>帳號登入 / Đăng nhập</h2>
      <div className="site-entry-roles">{['ADMIN','RD 主管','製程人員（STAFF）'].map(label=><button type="button" key={label} onClick={()=>account.current?.focus()}>{label}</button>)}</div>
      <p className="site-entry-hint">請使用既有帳號登入；可用功能依帳號權限，不由入口按鈕授予。</p>
      <label htmlFor="id">帳號 / Tài khoản</label>
      <input ref={account} id="id" name="id" autoComplete="username" required maxLength={80} />
      <label htmlFor="password">密碼 / Mật khẩu</label>
      <input id="password" name="password" type="password" autoComplete="current-password" required maxLength={200} />
      {error&&<p role="alert" style={{color:'#b91c1c'}}>{error}</p>}
      <button className="site-entry-submit" type="submit" name="destination" value="platform" disabled={busy}>{busy?'登入中 / Đang đăng nhập…':'登入平台 / Đăng nhập'}</button>
      <section className="site-entry-player"><h3>產線工段資訊 / Thông tin công đoạn</h3>
        <label htmlFor="entry-line">線別 / Chuyền</label><select id="entry-line" value={line} onChange={event=>setLine(event.target.value)}>{['A','B','C'].map(value=><option key={value} value={value}>{value} 線</option>)}</select>
        <p className="site-entry-hint">以具播放權限的帳號登入，再選擇工段。重新整理會保留播放位置。</p>
        <button type="submit" name="destination" value="player" disabled={busy}>登入並進入工段播放</button>
      </section>
    </form>
  </main>;
}
