import {env} from 'cloudflare:workers';
import hosting from '../.openai/hosting.json';
import {readState} from './process-state';
export const RESET_PROJECT='appgprj_6ad9abaff47c8191846eb9821034696b';
export const RESET_ORIGIN='https://process-os-test.franktsai0421.chatgpt.site';
export const ENROLLMENTS='routineResetEnrollments';
export const digest=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
export const resetDbProofSQL=`SELECT 1 AS ok FROM process_snapshot_target t
 JOIN process_snapshot_transfers x ON x.id=t.transfer_id AND x.target=t.target
 JOIN process_owner_bootstrap b ON b.id=1 AND b.project_id=x.project_id AND b.target=t.target AND b.owner_id=x.owner_id
 WHERE t.id=1 AND t.target=? AND x.id=? AND x.project_id=? AND x.owner_id=? AND b.attempt_id=?
 AND x.phase='integrity-verified' AND x.chunk_count>0 AND x.verify_cursor=x.chunk_count`;
export type Enrollment={id:string;ownerId:string;contextHash:string;siteHash:string;grantHash:string;sessionHash:string;tokenHash:string;createdAt:number;expiresAt:number;status:'pending'|'confirmed';confirmedAt?:number};
const hash=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
export function enrollmentLedger(raw?:string):{version:1;entries:Enrollment[]}{
 const v=raw?JSON.parse(raw):{version:1,entries:[]};
 if(!v||v.version!==1||!Array.isArray(v.entries)||v.entries.length>32)throw Error('INVALID_ENROLLMENT');
 const ids=new Set();
 for(const e of v.entries){
  if(!e||typeof e.id!=='string'||!/^[-\w]{8,100}$/.test(e.id)||ids.has(e.id)||typeof e.ownerId!=='string'||!e.ownerId||e.ownerId.length>100||![e.contextHash,e.siteHash,e.grantHash,e.sessionHash,e.tokenHash].every(hash)||!Number.isSafeInteger(e.createdAt)||!Number.isSafeInteger(e.expiresAt)||e.expiresAt<=e.createdAt||e.expiresAt-e.createdAt>300000||!['pending','confirmed'].includes(e.status)||e.status==='confirmed'&&(!Number.isSafeInteger(e.confirmedAt)||e.confirmedAt<e.createdAt||e.confirmedAt>=e.expiresAt)||e.status==='pending'&&e.confirmedAt!==undefined)throw Error('INVALID_ENROLLMENT');ids.add(e.id);
 }
 return v;
}
// Identity headers are trusted ONLY behind native Sites dispatch. Never expose
// this authority through a direct Worker origin accepting caller-set headers.
export async function resetContext(request:Request,kind:'activation'|'enrollment'){
 try{
  const e=env as typeof env & {PROCESS_ROUTINE_RESET_ACTIVATION?:string;PROCESS_ROUTINE_RESET_ENROLLMENT?:string;PROCESS_PROGRAM_COMMIT?:string};
  const raw=kind==='activation'?e.PROCESS_ROUTINE_RESET_ACTIVATION:e.PROCESS_ROUTINE_RESET_ENROLLMENT;
  if(typeof raw!=='string'||raw.length>4096)return null;const c=JSON.parse(raw),u=new URL(request.url);
  const extra=kind==='enrollment'?['enrollmentId','secret']:['scopes',Object.hasOwn(c,'enrollmentId')?'enrollmentId':'siteOwnerIdSha256'];
  if(!c||Object.keys(c).sort().join()!==['version','testOnly','projectId','origin','ownerId','dbTarget','transferId','bootstrapAttemptId','programCommit','expiresAt',...extra].sort().join()||c.version!==1||c.testOnly!==true||hosting.project_id!==RESET_PROJECT||c.projectId!==RESET_PROJECT||c.origin!==RESET_ORIGIN||u.origin!==RESET_ORIGIN||u.pathname!==(kind==='activation'?'/api/routine-reset':'/api/routine-reset-enrollment')||typeof c.ownerId!=='string'||!c.ownerId||c.ownerId.length>100||!hash(c.dbTarget)||typeof c.transferId!=='string'||!c.transferId||c.transferId.length>200||typeof c.bootstrapAttemptId!=='string'||!c.bootstrapAttemptId||c.bootstrapAttemptId.length>200||typeof c.programCommit!=='string'||!/^[a-f0-9]{40}$/.test(c.programCommit)||/^0+$/.test(c.programCommit)||c.programCommit!==e.PROCESS_PROGRAM_COMMIT||typeof c.expiresAt!=='string'||!Number.isFinite(Date.parse(c.expiresAt))||Date.parse(c.expiresAt)<=Date.now())return null;
  const origin=request.headers.get('Origin');if(request.headers.get('Sec-Fetch-Site')==='cross-site'||origin!==null&&origin!==RESET_ORIGIN||request.method==='POST'&&(origin!==RESET_ORIGIN||request.headers.get('Content-Type')?.split(';')[0]!=='application/json'))return null;
  const native=request.headers.get('oai-authenticated-user-id');if(!native&&!(kind==='enrollment'&&request.method==='GET')||native&&(native.length>512||native.trim()!==native))return null;
  if(kind==='enrollment'&&(!hash(c.secret)||/^0+$/.test(c.secret)))return null;
  if(Object.hasOwn(c,'enrollmentId')&&(typeof c.enrollmentId!=='string'||!/^[-\w]{8,100}$/.test(c.enrollmentId)))return null;
  const guardArgs=[c.dbTarget,c.transferId,c.projectId,c.ownerId,c.bootstrapAttemptId];
  if((await env.DB.prepare(resetDbProofSQL).bind(...guardArgs).first<{ok:number}>())?.ok!==1)return null;
  const contextHash=await digest(JSON.stringify([c.projectId,c.origin,c.ownerId,c.dbTarget,c.transferId,c.bootstrapAttemptId,c.programCommit]));
  return {raw,config:c,ownerId:c.ownerId,guardArgs,contextHash,siteHash:native?await digest(native):null,database:env.DB};
 }catch{return null;}
}
export async function resetAuthority(request:Request,scope:'fqc'|'iqc'){
 try{
  const a=await resetContext(request,'activation');if(!a)return null;const c=a.config;
  if(!c.scopes||Object.keys(c.scopes).sort().join()!=='fqc,iqc'||typeof c.scopes.fqc!=='boolean'||typeof c.scopes.iqc!=='boolean'||!c.scopes[scope])return null;
  let expected=c.siteOwnerIdSha256;
  if(c.enrollmentId){const state=await readState({keys:[ENROLLMENTS]}),row=enrollmentLedger(state.values[ENROLLMENTS]).entries.find(e=>e.id===c.enrollmentId);if(!row||row.status!=='confirmed'||row.ownerId!==a.ownerId||row.contextHash!==a.contextHash)return null;expected=row.siteHash;}
  return hash(expected)&&expected===a.siteHash?a:null;
 }catch{return null;}
}
