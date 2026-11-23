(()=>{
 const begin=document.getElementById('begin'),confirm=document.getElementById('confirm'),status=document.getElementById('status'),result=document.getElementById('result');if(!begin||!confirm||!status||!result)return;
 let token=null,busy=false;
 async function run(action){if(busy)return;busy=true;begin.disabled=confirm.disabled=status.disabled=true;
  try{if(action==='confirm'&&!token)return;const read=action==='status',body=read?null:action==='begin'?{action,confirm:'BEGIN OWNER ENROLLMENT'}:{action,confirm:'ENROLL CURRENT SIGNED-IN OWNER',token};
   const r=await fetch('/api/routine-reset-enrollment'+(read?'?status=1':''),{cache:'no-store',...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})}),v=await r.json();if(!r.ok)throw Error('unconfirmed');
   if(action==='begin'){token=v.token;confirm.hidden=false;result.textContent='請確認目前帳號；五分鐘內有效。 / Xác nhận tài khoản hiện tại trong 5 phút.';}
   else if(v.status==='confirmed'){token=null;confirm.hidden=true;result.textContent='已登錄；Reset 仍需另行啟用。 / Đã đăng ký; RESET cần bật riêng. '+v.enrollmentId;}
   else result.textContent='狀態 / Trạng thái: '+v.status;
  }catch{token=null;confirm.hidden=true;result.textContent='結果待查證，請查詢結果；不會自動重送。 / Kiểm tra trạng thái; không tự gửi lại.';}
  finally{busy=false;begin.disabled=confirm.disabled=status.disabled=false;}
 }
 begin.onclick=()=>run('begin');confirm.onclick=()=>run('confirm');status.onclick=()=>run('status');addEventListener('pagehide',()=>{token=null;});
})();
