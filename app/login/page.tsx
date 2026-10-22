'use client';
import {useState,type FormEvent} from 'react';

export default function Login(){
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(busy)return;
    const form=new FormData(event.currentTarget);
    setBusy(true);setError('');
    try {
      const response=await fetch('/api/platform-login',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({id:form.get('id'),password:form.get('password')})});
      if(response.ok){window.location.assign('/process/index.html');return;}
      setError(response.status===429?'登入次數過多，請稍後重試 / Vui lòng thử lại sau.':'帳號或密碼錯誤，或暫時無法登入 / Không thể đăng nhập.');
    }catch{setError('連線失敗，請稍後重試 / Không thể kết nối.');}
    finally{setBusy(false);}
  }
  return <main style={{minHeight:'100svh',display:'grid',placeItems:'center',padding:20,background:'#f1f5f9',color:'#0f172a'}}>
    <form onSubmit={submit} style={{width:'100%',maxWidth:380,padding:28,borderRadius:16,background:'#fff',boxShadow:'0 10px 35px #0f172a12',display:'grid',gap:16}} aria-busy={busy}>
      <h1 style={{fontSize:26,fontWeight:700}}>帳號登入 / Đăng nhập</h1>
      <label htmlFor="id">帳號 / Tài khoản</label>
      <input id="id" name="id" autoComplete="username" required maxLength={80} style={{minHeight:46,padding:10,border:'1px solid #94a3b8',borderRadius:6,fontSize:16}} />
      <label htmlFor="password">密碼 / Mật khẩu</label>
      <input id="password" name="password" type="password" autoComplete="current-password" required maxLength={200} style={{minHeight:46,padding:10,border:'1px solid #94a3b8',borderRadius:6,fontSize:16}} />
      {error&&<p role="alert" style={{color:'#b91c1c'}}>{error}</p>}
      <button type="submit" disabled={busy} style={{minHeight:48,borderRadius:6,background:'#1e40af',color:'#fff',fontSize:16,cursor:'pointer'}}>{busy?'登入中 / Đang đăng nhập…':'登入 / Đăng nhập'}</button>
    </form>
  </main>;
}
