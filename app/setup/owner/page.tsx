'use client';
import {useState,type SyntheticEvent} from 'react';
export default function OwnerSetup(){
 const [message,setMessage]=useState(''),[pending,setPending]=useState(false),[done,setDone]=useState(false);
 async function submit(event:SyntheticEvent<HTMLFormElement>){
  event.preventDefault();const form=event.currentTarget,data=new FormData(form);setPending(true);setMessage('');
  try{
   const response=await fetch('/api/setup/owner',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({bootstrapKey:data.get('bootstrapKey'),password:data.get('password'),confirmation:data.get('confirmation')})});
   form.reset();if(response.ok){setDone(true);setMessage('初始化完成，請使用一般帳密登入。Đã khởi tạo. Vui lòng đăng nhập bằng tài khoản.');}
   else setMessage('初始化未完成。請核對設定、期限與目標；請勿重設已有帳號。Chưa hoàn tất. Kiểm tra cấu hình và thời hạn.');
  }catch{form.reset();setMessage('結果尚未確認。請先核對初始化紀錄，勿重建帳號。Kết quả chưa xác nhận. Hãy kiểm tra trước khi thử lại.');}
  finally{setPending(false);}
 }
 return <main style={{maxWidth:520,margin:'3rem auto',padding:'1rem',fontFamily:'system-ui'}}>
  <h1 style={{fontSize:24,fontWeight:650,lineHeight:1.4,marginBottom:12}}>首次管理員設定 / Khởi tạo quản trị viên</h1>
  <p style={{marginBottom:20}}>僅供私人測試站首次設定 frank。這不會變更舊網站密碼。Chỉ dành cho lần khởi tạo đầu tiên của trang thử nghiệm riêng tư.</p>
  {!done&&<form onSubmit={submit} autoComplete="off" style={{display:'grid',gap:16}}>
   <label>一次性設定金鑰 / Khóa thiết lập<input name="bootstrapKey" type="password" autoComplete="off" required maxLength={64} minLength={64} style={{display:'block',width:'100%',padding:10,border:'1px solid #64748b',borderRadius:6}} /></label>
   <label>新站密碼 / Mật khẩu mới<input name="password" type="password" autoComplete="new-password" required minLength={8} maxLength={200} style={{display:'block',width:'100%',padding:10,border:'1px solid #64748b',borderRadius:6}} /></label>
   <label>確認密碼 / Xác nhận mật khẩu<input name="confirmation" type="password" autoComplete="new-password" required minLength={8} maxLength={200} style={{display:'block',width:'100%',padding:10,border:'1px solid #64748b',borderRadius:6}} /></label>
   <button disabled={pending} type="submit" style={{padding:12,background:'#1d4ed8',color:'#fff',borderRadius:6,opacity:pending?0.6:1}}>{pending?'處理中 / Đang xử lý':'建立管理員 / Tạo quản trị viên'}</button>
   <button disabled={pending} type="reset" style={{padding:10,border:'1px solid #64748b',borderRadius:6}}>清除 / Xóa</button>
  </form>}
  <p role="status" aria-live="polite" style={{marginTop:16}}>{message}</p><a href="/login" style={{display:'inline-block',padding:'12px 0',color:'#1d4ed8',textDecoration:'underline'}}>返回登入 / Quay lại đăng nhập</a>
 </main>;
}
