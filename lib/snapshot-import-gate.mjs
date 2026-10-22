// Import is opt-in. While enabled, only login/import and program assets can
// serve before the durable active marker. No trust in caller identity headers.
export async function importVisibility(request,{enabled,db}){
 if(!enabled)return;
 const pathname=new URL(request.url).pathname;
 if(['/signin-with-chatgpt','/signout-with-chatgpt','/callback','/login','/api/platform-login','/api/snapshots/import','/setup/owner','/api/setup/owner','/favicon.ico'].includes(pathname)||pathname.startsWith('/_next/')||pathname.startsWith('/assets/'))return;
 try{
  const row=await db.prepare("SELECT a.phase FROM process_snapshot_activations a JOIN process_snapshot_target t ON t.transfer_id=a.transfer_id WHERE t.id=1").first();
  if(row?.phase==='active')return;
 }catch{}
 return Response.json({error:'IMPORT_TARGET_NOT_ACTIVE'},{status:503,headers:{'Cache-Control':'no-store','Retry-After':'30'}});
}
