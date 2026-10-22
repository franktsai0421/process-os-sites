// Default-off, single-target owner setup. Never accepts a visitor identity header
// as bootstrap authority. Secret inputs/results stay server-side.
import {timingSafeEqual} from 'node:crypto';
import {Buffer} from 'node:buffer';
export const ownerBootstrapProject='appgprj_6ad9abaff47c8191846eb9821034696b';
const hex64=/^[a-f0-9]{64}$/;
const requireValue=(value,code)=>{if(!value)throw Error(code);};
/** @param {Record<string, unknown>} values @param {{project_id?:string}} hosting */
export function bootstrapConfiguration(values,hosting,now=Date.now()){
 const text=key=>typeof values[key]==='string'?values[key]:'';
 requireValue(text('PROCESS_OWNER_BOOTSTRAP_ENABLED')==='1','OWNER_SETUP_DISABLED');
 requireValue(hosting.project_id===ownerBootstrapProject,'OWNER_SETUP_TARGET');
 requireValue(text('PROCESS_IMPORT_ENABLED')==='1'&&text('DEMO_LOGIN_ENABLED')==='false'&&text('PROCESS_SESSION_REVOCATION_ENABLED')==='1'&&text('PROCESS_RELEASE_DISABLED')==='true','OWNER_SETUP_GATES');
 const ownerId=text('PROCESS_IMPORT_OWNER_ID'),origin=text('PROCESS_IMPORT_ORIGIN'),target=text('PROCESS_IMPORT_TARGET_FINGERPRINT'),manifest=text('PROCESS_IMPORT_MANIFEST_SHA256'),programCommit=text('PROCESS_PROGRAM_COMMIT');
 let url;try{url=new URL(origin);}catch{throw Error('OWNER_SETUP_ORIGIN');}
 requireValue(url.protocol==='https:'&&url.origin===origin&&!url.username&&!url.password,'OWNER_SETUP_ORIGIN');
 requireValue(ownerId==='frank'&&hex64.test(target)&&hex64.test(manifest)&&/^[a-f0-9]{40}$/.test(programCommit)&&![target,manifest,programCommit].some(v=>/^0+$/.test(v)),'OWNER_SETUP_TARGET');
 const secret=text('PROCESS_OWNER_BOOTSTRAP_SECRET'),signer=text('PROCESS_SESSION_SECRET'),expiresAt=Date.parse(text('PROCESS_OWNER_BOOTSTRAP_EXPIRES_AT'));
 requireValue(hex64.test(secret)&&hex64.test(signer)&&secret!==signer,'OWNER_SETUP_SECRETS');
 requireValue(Number.isSafeInteger(expiresAt)&&expiresAt>now,'OWNER_SETUP_EXPIRED');
 return {projectId:ownerBootstrapProject,ownerId,origin,target,manifest,programCommit,secret,expiresAt};
}
export function authorizeBootstrap(request,body,config,now=Date.now()){
 requireValue(now<config.expiresAt,'OWNER_SETUP_EXPIRED');
 const url=new URL(request.url);
 requireValue(request.method==='POST'&&url.origin===config.origin&&url.pathname==='/api/setup/owner'&&!url.search&&!url.hash&&request.headers.get('Origin')===config.origin&&request.headers.get('Sec-Fetch-Site')!=='cross-site','OWNER_SETUP_ORIGIN');
 requireValue(request.headers.get('Content-Type')?.split(';')[0]==='application/json','OWNER_SETUP_INPUT');
 requireValue(body&&typeof body==='object'&&!Array.isArray(body)&&Object.keys(body).sort().join() === 'bootstrapKey,confirmation,password','OWNER_SETUP_INPUT');
 requireValue(typeof body.bootstrapKey==='string'&&hex64.test(body.bootstrapKey)&&timingSafeEqual(Buffer.from(body.bootstrapKey),Buffer.from(config.secret)),'OWNER_SETUP_DENIED');
 requireValue(typeof body.password==='string'&&typeof body.confirmation==='string','OWNER_SETUP_INPUT');
}
export function createOwnerBootstrap({store,hashPassword,validatePassword,now=Date.now,attemptId=()=>crypto.randomUUID()}){
 return {async initialize(request,body,config){
  authorizeBootstrap(request,body,config,now());validatePassword(body.password,body.confirmation);
  await store.assertEmpty();
  const passwordHash=await hashPassword(body.password);requireValue(typeof passwordHash==='string'&&passwordHash.startsWith('scrypt$'),'OWNER_SETUP_HASH');
  await store.assertEmpty();
  // Hashing can take time. An expired request must not write after that window.
  requireValue(now()<config.expiresAt,'OWNER_SETUP_EXPIRED');
  const stamp=now(),attempt=attemptId(),values=JSON.stringify({maintenanceMode:'1',platformUsers:JSON.stringify([{id:config.ownerId,name:config.ownerId,role:'admin',enabled:true,authEpoch:0,passwordHash}])});
  await store.initialize({projectId:config.projectId,target:config.target,manifest:config.manifest,programCommit:config.programCommit,ownerId:config.ownerId,attempt,createdAt:stamp,expiresAt:config.expiresAt,values,updatedAt:new Date(stamp).toISOString()});
  return {initialized:true,loginRequired:true,businessTrafficEnabled:false};
 }};
}
