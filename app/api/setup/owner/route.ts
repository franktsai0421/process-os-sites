import {env} from 'cloudflare:workers';
import hosting from '../../../../.openai/hosting.json';
import {boundedJson,privateHeaders} from '@/lib/site-security.mjs';
import {passwordHash,validatePassword} from '@/lib/passwords';
import {allowLoginAttempt} from '@/lib/login-limit';
import {bootstrapConfiguration,createOwnerBootstrap,authorizeBootstrap} from '@/lib/sites-owner-bootstrap.mjs';
import {createOwnerBootstrapStore} from '@/lib/sites-owner-bootstrap-store.mjs';
export async function POST(request:Request){
 try{
  const config=bootstrapConfiguration(env as unknown as Record<string,unknown>,hosting);
  const body:unknown=await boundedJson(request);
  authorizeBootstrap(request,body,config);
  if(!await allowLoginAttempt(request,'owner-setup:'+config.target))return Response.json({error:'OWNER_SETUP_RATE_LIMITED'},{status:429,headers:privateHeaders});
  const owner=createOwnerBootstrap({store:createOwnerBootstrapStore(env.DB,env.STATE_ARCHIVE),hashPassword:passwordHash,validatePassword});
  return Response.json(await owner.initialize(request,body,config),{headers:privateHeaders});
 }catch(error){
  const code=error instanceof Error&&/^(OWNER_SETUP_[A-Z_]+|BODY_TOO_LARGE|INVALID_JSON|PASSWORD_LENGTH|PASSWORD_MISMATCH)$/.test(error.message)?error.message:'OWNER_SETUP_UNAVAILABLE';
  const status=code==='OWNER_SETUP_DISABLED'?404:code==='OWNER_SETUP_DENIED'||code==='OWNER_SETUP_ORIGIN'?403:code==='BODY_TOO_LARGE'?413:code==='OWNER_SETUP_UNAVAILABLE'||code==='OWNER_SETUP_WRITE_UNCERTAIN'?503:409;
  return Response.json({error:code},{status,headers:privateHeaders});
 }
}
