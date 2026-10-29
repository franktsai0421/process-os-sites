// Import is opt-in. While enabled, only login/import and program assets can
// serve before the durable active marker. No trust in caller identity headers.
const inactiveRootHTML=`<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>網站準備中 / Trang web đang được chuẩn bị</title>
<style>
*{box-sizing:border-box}body{margin:0;min-height:100svh;padding:24px 16px;display:grid;place-items:center;background:#f1f5f9;color:#0f172a;font-family:system-ui,sans-serif;line-height:1.6}
main{width:100%;max-width:640px;padding:clamp(20px,5vw,36px);background:#fff;border:1px solid #cbd5e1;border-radius:16px;box-shadow:0 12px 32px #0f172a0d}
h1{margin:0 0 20px;font-size:clamp(24px,4vw,30px);line-height:1.35}h1 span{display:block;margin-top:8px;font-size:.78em;font-weight:600}p{margin:12px 0}.note{color:#475569;font-size:15px}
nav{display:flex;flex-wrap:wrap;gap:12px;margin-top:24px}a{display:flex;align-items:center;justify-content:center;flex:1 1 240px;min-height:48px;padding:12px 16px;border:1px solid #64748b;border-radius:8px;color:#0f172a;text-align:center;text-decoration:none;font-weight:600}a.primary{background:#1d4ed8;border-color:#1d4ed8;color:#fff}a:hover{text-decoration:underline}a:focus-visible{outline:3px solid #d97706;outline-offset:4px}
</style></head><body><main>
<h1>私人測試站準備中<span lang="vi">Trang thử nghiệm riêng tư đang được chuẩn bị</span></h1>
<p>網站入口已可開啟，公司資料尚未啟用。</p><p lang="vi">Bạn đã có thể mở trang web. Dữ liệu công ty chưa được kích hoạt.</p>
<p class="note">首次管理員設定僅在初始化窗口啟用後可使用；登入後，公司資料仍須等待匯入與啟用。</p>
<p class="note" lang="vi">Chỉ thiết lập quản trị viên khi cửa sổ khởi tạo đã được bật. Sau khi đăng nhập, dữ liệu công ty vẫn cần được nhập và kích hoạt.</p>
<nav aria-label="網站入口 / Lối vào trang web"><a class="primary" href="/login" target="_top">帳號登入 / Đăng nhập</a><a href="/setup/owner" target="_top">首次管理員設定 / Thiết lập quản trị viên</a></nav>
</main></body></html>`;
const closedResponse=()=>Response.json({error:'IMPORT_TARGET_NOT_ACTIVE'},{status:503,headers:{'Cache-Control':'no-store','Retry-After':'30'}});
// Shared authoritative predicate. Callers keep their own fail-closed response
// semantics on a failed read; a phase marker alone never proves public traffic.
export async function importTargetIsActive(db,...optional){
  // Keep the exported one-required-argument arity; absent and explicit undefined match.
  const transferId=optional[0];
 const row=await db.prepare("SELECT a.phase,t.transfer_id,b.state AS budget_state,b.active_request FROM process_snapshot_activations a JOIN process_snapshot_target t ON t.transfer_id=a.transfer_id LEFT JOIN process_import_budget b ON b.id=1 WHERE t.id=1").first();
 return !!(row?.phase==='active'&&(transferId===undefined||row.transfer_id===transferId)&&(!row.budget_state||(row.budget_state==='complete'&&!row.active_request)));
}
export async function importVisibility(request,{enabled,db}){
 if(!enabled)return;
 const pathname=new URL(request.url).pathname;
 if(['/signin-with-chatgpt','/signout-with-chatgpt','/callback','/login','/api/platform-login','/api/snapshots/import','/setup/owner','/api/setup/owner','/setup/import','/favicon.ico'].includes(pathname)||pathname.startsWith('/_next/')||pathname.startsWith('/assets/'))return;
 try{
  if(await importTargetIsActive(db))return;
 }catch{return closedResponse();}
 // Only a known inactive root navigation gets a human-facing shell. Data,
 // non-GET/HEAD root requests and database failures keep the original refusal.
 if(pathname==='/'&&(request.method==='GET'||request.method==='HEAD'))return new Response(request.method==='HEAD'?null:inactiveRootHTML,{status:200,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});
 return closedResponse();
}
