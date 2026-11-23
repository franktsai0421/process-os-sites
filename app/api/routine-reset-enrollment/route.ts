import {env} from 'cloudflare:workers';
import {can,encodeValues,identity,readState,responseHeaders,stateRevisionIsCurrent} from '@/lib/process-state';
import {isRoutineScheduleOwner} from '@/lib/routine-schedule-owner';
import {boundedJson} from '@/lib/site-security.mjs';
import {resetContext,resetDbProofSQL,digest,ENROLLMENTS,enrollmentLedger,type Enrollment} from '@/lib/routine-reset-authority';
const reply=(v:unknown,status=200)=>Response.json(v,{status,headers:responseHeaders});
async function owner(request:Request,state:Awaited<ReturnType<typeof readState>>,id:string){
 const actor=await identity(request,state);
 if(!actor||actor.id!==id||!isRoutineScheduleOwner(actor)||state.values.maintenanceMode==='1'||state.values.routineFqcEnabled!=='1')return null;
 for(const permission of ['routine.view','routine.edit','routine.settings','routine.delete'])if(!await can(request,state,permission))return null;
 return actor;
}
const status=(row:Enrollment|undefined,id:string)=>({enrollmentId:id,status:row?.status==='pending'&&row.expiresAt<=Date.now()?'expired':row?.status||'ready',enrollmentDoesNotEnableReset:true});
function page(signed:boolean){
 const action=signed?'<button id="begin">準備登錄 / Chuẩn bị đăng ký</button><button id="confirm" hidden>確認目前 Sites 身分 / Xác nhận danh tính Sites</button><button id="status">查詢結果 / Kiểm tra kết quả</button>':'<a target="_top" href="/signin-with-chatgpt?return_to=%2Fapi%2Froutine-reset-enrollment">使用 Sites 正常登入 / Đăng nhập Sites</a>';
 return new Response('<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Owner 身分登錄</title><link rel="stylesheet" href="/process/routine-reset-enrollment.css?v=2"><body><main><h1>Owner 身分登錄 / Đăng ký chủ sở hữu</h1><p>請確認 Sites 登入的是站主本人的帳號。這一步只登錄身分，不啟用 Reset，也不清除 FQC 或 IQC 資料。</p><p>Xác nhận tài khoản Sites là của chủ sở hữu. Chỉ đăng ký danh tính; không bật RESET hoặc xóa dữ liệu.</p>'+action+'<p id="result" role="status" aria-live="polite"></p><a href="/process/">返回系統 / Quay lại</a></main><script src="/process/routine-reset-enrollment.js?v=2" defer></script></body></html>',{headers:{...responseHeaders,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"}});
}
export async function GET(request:Request){
 try{
  const q=new URL(request.url).searchParams;if(q.size>1||q.size===1&&q.get('status')!=='1')return reply({error:'INVALID_SELECTOR'},422);
  const a=await resetContext(request,'enrollment');if(!a)return reply({error:'ENROLLMENT_UNAVAILABLE'},403);
  const state=await readState({keys:['platformUsers','processCustomRoles','processRoleTemplateOverrides','processAccessControl','maintenanceMode','routineFqcEnabled',ENROLLMENTS]}),actor=await owner(request,state,a.ownerId);if(!actor)return reply({error:'FORBIDDEN'},403);
  const row=enrollmentLedger(state.values[ENROLLMENTS]).entries.find(e=>e.id===a.config.enrollmentId);
  if(row&&a.siteHash&&(row.ownerId!==actor.id||row.contextHash!==a.contextHash||row.siteHash!==a.siteHash))return reply({error:'IDENTITY_MISMATCH'},403);
  if(!await stateRevisionIsCurrent(state)||(await resetContext(request,'enrollment'))?.raw!==a.raw||!await owner(request,state,a.ownerId))return reply({error:'RECHECK_REQUIRED'},409);
  if(q.size)return a.siteHash?reply(status(row,a.config.enrollmentId)):reply({error:'SITES_SIGN_IN_REQUIRED'},403);
  return page(!!a.siteHash);
 }catch{return reply({error:'ENROLLMENT_UNAVAILABLE'},503);}
}
export async function POST(request:Request){
 try{
  if(new URL(request.url).search)return reply({error:'INVALID_SELECTOR'},422);
  const a=await resetContext(request,'enrollment');if(!a||!a.siteHash)return reply({error:'ENROLLMENT_UNAVAILABLE'},403);
  const b=await boundedJson(request,1024);
  if(!b||!['begin','confirm'].includes(b.action)||Object.keys(b).sort().join()!==(b.action==='begin'?'action,confirm':'action,confirm,token')||b.confirm!==(b.action==='begin'?'BEGIN OWNER ENROLLMENT':'ENROLL CURRENT SIGNED-IN OWNER')||b.action==='confirm'&&(typeof b.token!=='string'||!/^[a-f0-9]{64}$/.test(b.token)))return reply({error:'INVALID_CONFIRMATION'},422);
  const state=await readState(),actor=await owner(request,state,a.ownerId);if(!actor)return reply({error:'FORBIDDEN'},403);
  const ledger=enrollmentLedger(state.values[ENROLLMENTS]),id=a.config.enrollmentId,row=ledger.entries.find(e=>e.id===id),grantHash=await digest(a.raw),sessionHash=await digest(request.headers.get('Cookie')||'');
  let token:string|undefined;
  if(b.action==='begin'){
   if(row)return reply({error:'ALREADY_STARTED',...status(row,id)},409);if(ledger.entries.length>=32)return reply({error:'CAPACITY'},409);
   const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(a.config.secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
   token=Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(JSON.stringify([crypto.randomUUID(),id,a.siteHash,sessionHash])))),v=>v.toString(16).padStart(2,'0')).join('');
   ledger.entries.push({id,ownerId:actor.id,contextHash:a.contextHash,siteHash:a.siteHash,grantHash,sessionHash,tokenHash:await digest(token),createdAt:Date.now(),expiresAt:Math.min(Date.now()+300000,Date.parse(a.config.expiresAt)),status:'pending'});
  }else{
   if(!row||row.status!=='pending'||row.expiresAt<=Date.now()||row.ownerId!==actor.id||row.contextHash!==a.contextHash||row.siteHash!==a.siteHash||row.grantHash!==grantHash||row.sessionHash!==sessionHash||row.tokenHash!==await digest(b.token))return reply({error:'INVALID_PROOF'},409);
   row.status='confirmed';row.confirmedAt=Date.now();
  }
  const encoded=await encodeValues({...state.values,[ENROLLMENTS]:JSON.stringify(ledger)},state),fresh=await resetContext(request,'enrollment');
  if(!fresh||fresh.raw!==a.raw||fresh.siteHash!==a.siteHash||!await owner(request,state,a.ownerId)||b.action==='confirm'&&row!.expiresAt<=Date.now())return reply({error:'INVALID_PROOF'},409);
  const result=await env.DB.prepare('UPDATE shared_state SET revision=?,"values"=?,updated_at=? WHERE id=1 AND revision=? AND EXISTS ('+resetDbProofSQL+')').bind(state.revision+1,encoded,new Date().toISOString(),state.revision,...a.guardArgs).run();
  return result.meta.changes===1?reply({...status(ledger.entries.find(e=>e.id===id),id),...(token?{token}:{})}):reply({error:'REVISION_CONFLICT'},409);
 }catch{return reply({error:'ENROLLMENT_RESULT_UNCONFIRMED'},503);}
}
