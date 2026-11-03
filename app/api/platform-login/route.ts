import {legacyJsonLoginText,type JsonValue} from '@/lib/legacy-login-json';
import {demoIdentity,isDemoUser} from '@/lib/demo-identities.mjs';
import {readState,readPlatformUsers,sameOrigin,demoSession,demoEnabled,sessionCookie,clearDemoSession,responseHeaders as headers} from '@/lib/process-state';
import { effectiveAccess } from '@/lib/user-access';
import {verifyPassword} from '@/lib/passwords';
import {boundedJson} from '@/lib/site-security.mjs';
import {allowLoginAttempt} from '@/lib/login-limit';

export async function POST(request:Request){
  if(!sameOrigin(request))return Response.json({error:'來源不允許'},{status:403,headers});
  let input:unknown;try{input=await boundedJson(request);}catch(error){return Response.json({error:'登入資料格式錯誤'},{status:error instanceof Error&&error.message==='BODY_TOO_LARGE'?413:400,headers});}
  if(!input || typeof input!=='object' || Array.isArray(input))return Response.json({error:'登入資料格式錯誤'},{status:400,headers});
  const body = input as Record<string, JsonValue>;
  if(body.action==='logout'){
    try { await clearDemoSession(request); }
    catch { return Response.json({error:'登出暫時無法完成，請稍後重試',code:'SESSION_REVOCATION_UNAVAILABLE'},{status:503,headers}); }
    return Response.json({ok:true},{headers:{...headers,'Set-Cookie':sessionCookie(request,'')}});
  }
  if(Object.prototype.hasOwnProperty.call(body || {}, 'demoRole')){
    if(!demoEnabled(request))return Response.json({error:'此網站未開啟公開示範登入'},{status:403,headers});
    if(!body || Array.isArray(body) || Object.keys(body).some(key=>key!=='demoRole'))return Response.json({error:'示範入口只能指定既有角色'},{status:400,headers});
    const definition=demoIdentity(body.demoRole);
    if(!definition)return Response.json({error:'示範角色無效'},{status:400,headers});
    const state=await readState({keys:['platformUsers','processCustomRoles','processRoleTemplateOverrides','maintenanceMode']}),user=readPlatformUsers(state.values.platformUsers).find((u)=>u.id===definition.id);
    if(!user||!isDemoUser(user))return Response.json({error:'沒有可用的示範帳號，請檢查 Local 初始化'},{status:403,headers});
    const token=await demoSession(request,user.id,true,user.authEpoch||0);
    if(!token)return Response.json({error:'示範登入暫時無法使用'},{status:503,headers});
    return Response.json({user:{id:user.id,name:user.name,authMode:'demo',sessionType:'demo',...effectiveAccess(user,state.values)}},{headers:{...headers,'Set-Cookie':sessionCookie(request,token)}});
  }
  const id=legacyJsonLoginText(body.id).trim().toLowerCase(),password=legacyJsonLoginText(body.password);
  if(!id||!password||id.length>80||password.length>200)return Response.json({error:'帳號或密碼錯誤'},{status:401,headers});
  try{if(!await allowLoginAttempt(request,id))return Response.json({error:'登入次數過多，請稍後重試',code:'LOGIN_RATE_LIMITED'},{status:429,headers:{...headers,'Retry-After':'300'}});}
  catch{return Response.json({error:'登入暫時無法使用',code:'LOGIN_LIMIT_UNAVAILABLE'},{status:503,headers});}
  const state=await readState({keys:['platformUsers','processCustomRoles','processRoleTemplateOverrides','maintenanceMode']}),users=readPlatformUsers(state.values.platformUsers),user=users.find((item)=>String(item.id||'').trim().toLowerCase()===id);
  if(!user || user.deletedAt)return Response.json({error:'帳號不存在',code:'ACCOUNT_NOT_FOUND'},{status:404,headers});
  if(user.enabled===false)return Response.json({error:'此帳號已停用',code:'ACCOUNT_DISABLED'},{status:403,headers});
  if(user.authMode==='demo'||!await verifyPassword(user,password))return Response.json({error:'密碼錯誤',code:'PASSWORD_INCORRECT'},{status:401,headers});
  if(!user.role)return Response.json({error:'此帳號尚未設定使用權限',code:'NO_PERMISSION'},{status:403,headers});
  const token=await demoSession(request,String(user.id).toLowerCase(),false,user.authEpoch||0);
  if(!token)return Response.json({error:'登入暫時無法使用'},{status:503,headers});
  return Response.json({user:{id:String(user.id).toLowerCase(),name:user.name,...effectiveAccess(user,state.values)}},{headers:{...headers,'Set-Cookie':sessionCookie(request,token)}});
}
