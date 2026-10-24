// Default-off authority primitives. This module issues no key and opens no route.
import {timingSafeEqual} from 'node:crypto';
import {sha256} from './snapshot-contract.mjs';
import {boundedAttemptSite} from './snapshot-attempt-policy.mjs';
const fail=(v,c)=>{if(!v)throw Error(c);},encode=v=>new TextEncoder().encode(JSON.stringify(v));
const digestPattern=/^[a-f0-9]{64}$/,idPattern=/^ic_[a-f0-9]{32}$/;
const principals=new WeakMap();
export function nativePrincipalMatches(principal,config,action){const v=principal&&principals.get(principal);return !!v&&['projectId','targetFingerprint','manifestSha256','ownerId'].every(k=>v.pins[k]===config[k])&&(!action||v.action===action);}
export function assertNativePrincipalAction(principal,action,admission){if(principal?.sessionType!=='native-import')return;fail(nativePrincipalMatches(principal,principals.get(principal)?.pins||{},action)&&admission,'IMPORT_NATIVE_SCOPE');}
export const nativeStageActions=Object.freeze(['configuration','budget-status','status','request-status','object-status','reconcile-existing','batch','verify','audit']);
export function nativePinsText(pins){
 fail(pins&&pins.projectId===boundedAttemptSite&&pins.ownerId==='frank'&&digestPattern.test(pins.targetFingerprint||'')&&digestPattern.test(pins.manifestSha256||'')&&digestPattern.test(pins.transferId||''),'IMPORT_NATIVE_PINS');
 const u=new URL(pins.origin);fail(u.protocol==='https:'&&u.origin===pins.origin,'IMPORT_NATIVE_PINS');
 return JSON.stringify(Object.fromEntries(['projectId','origin','ownerId','targetFingerprint','manifestSha256','transferId'].map(k=>[k,pins[k]])));
}
export function capabilityRecord({id,credentialSha256,pins,ownerEpoch,issuedAt,writeExpiresAt,receiptExpiresAt,requestLimit=10000,operationLimit=30000}){
 fail(idPattern.test(id||'')&&digestPattern.test(credentialSha256||'')&&Number.isSafeInteger(ownerEpoch)&&ownerEpoch>=0,'IMPORT_NATIVE_GRANT');
 fail([issuedAt,writeExpiresAt,receiptExpiresAt].every(Number.isSafeInteger)&&issuedAt>=0&&writeExpiresAt>issuedAt&&writeExpiresAt-issuedAt<=4*3600_000&&receiptExpiresAt>=writeExpiresAt&&receiptExpiresAt-issuedAt<=5*3600_000,'IMPORT_NATIVE_GRANT_LIFETIME');
 fail(Number.isSafeInteger(requestLimit)&&requestLimit>0&&requestLimit<=10000&&Number.isSafeInteger(operationLimit)&&operationLimit>0&&operationLimit<=30000,'IMPORT_NATIVE_GRANT_LIMIT');
 return Object.freeze({id,credential_sha256:credentialSha256,pins:nativePinsText(pins),scope:'staging',owner_epoch:ownerEpoch,generation:1,request_limit:requestLimit,operation_limit:operationLimit,reserved_operations:0,issued_at:issuedAt,write_expires_at:writeExpiresAt,receipt_expires_at:receiptExpiresAt,revoked_at:null});
}
export const incidentVerifyScope='incident-verify-audit-only-v1';
export function incidentVerifyRecord(options){
 const g=capabilityRecord(options);
 fail(g.owner_epoch===0&&g.request_limit===1000&&g.operation_limit===20000&&g.write_expires_at===g.issued_at+14400000&&g.receipt_expires_at===g.issued_at+18000000,'IMPORT_VERIFY_GRANT');
 return{...g,scope:incidentVerifyScope};
}
export async function credentialDigest(token){fail(typeof token==='string'&&/^[A-Za-z0-9_-]{43}$/.test(token),'IMPORT_NATIVE_CREDENTIAL');return sha256(new TextEncoder().encode(token));}
export async function credentialMatches(token,expectedDigest){return digestEqual(await credentialDigest(token),expectedDigest);}
function digestEqual(a,b){const valid=digestPattern.test(a||'')&&digestPattern.test(b||'');const bytes=s=>Uint8Array.from((digestPattern.test(s||'')?s:'0'.repeat(64)).match(/../g),x=>parseInt(x,16));return timingSafeEqual(bytes(a),bytes(b))&&valid;}
const policyHash=g=>sha256(encode([g.pins,g.scope,g.owner_epoch,g.issued_at,g.write_expires_at,g.receipt_expires_at,g.request_limit,g.operation_limit,g.baseline_receipts,g.baseline_chunks,g.baseline_version]));
export async function nativeRequestHash({method,url,body,pins}){
 const u=new URL(url);fail(u.origin===pins.origin&&!u.username&&!u.password&&!u.hash&&u.pathname==='/api/snapshots/import'&&['GET','POST'].includes(method),'IMPORT_NATIVE_REQUEST');
 for(const k of new Set(u.searchParams.keys()))fail(['id','action','version','cursor','nonce'].includes(k)&&u.searchParams.getAll(k).length===1,'IMPORT_NATIVE_REQUEST');
 const action=u.searchParams.get('action')||'status';fail(nativeStageActions.includes(action),'IMPORT_NATIVE_SCOPE');
 fail(method==='GET'?['configuration','budget-status','status','request-status','object-status'].includes(action):['reconcile-existing','batch','verify','audit'].includes(action),'IMPORT_NATIVE_SCOPE');
 const id=u.searchParams.get('id');fail(['configuration','budget-status'].includes(action)&&id===null||id===pins.transferId,'IMPORT_NATIVE_PINS');
 fail(body===undefined||body instanceof Uint8Array&&body.length<=8*1024*1024,'IMPORT_NATIVE_BODY');
 return sha256(encode({format:'PROCESS_OS_NATIVE_REQUEST_V1',method,path:u.pathname,query:[...u.searchParams].sort((a,b)=>a[0].localeCompare(b[0])),pins:JSON.parse(nativePinsText(pins)),bodySha256:await sha256(body||new Uint8Array())}));
}
export function createNativeAuthority(options){return createAuthority(options,false);}
export function createIncidentVerifyAuthority(options){fail(typeof options.checkRecovery==='function','IMPORT_VERIFY_CONFIGURATION');return createAuthority(options,true);}
function createAuthority({db,pins,readOwnerEligibility,now=()=>Date.now(),checkRecovery},restricted){
 const expectedPins=nativePinsText(pins),contexts=new WeakMap();
 const table=restricted?'process_import_verify_capabilities':'process_import_capabilities',record=restricted?incidentVerifyRecord:capabilityRecord;
 const selectedHash=g=>restricted?sha256(encode([g.pins,g.scope,g.owner_epoch,g.issued_at,g.write_expires_at,g.receipt_expires_at,g.request_limit,g.operation_limit,g.hold_plan_sha,g.resume_plan_sha,g.program_commit])):policyHash(g);
 fail(typeof readOwnerEligibility==='function','IMPORT_NATIVE_OWNER_READER');
 async function row(id){return db.prepare('SELECT * FROM '+table+' WHERE id=?').bind(id).first();}
 async function inspect(handle,access='write'){
  fail(['write','receipt'].includes(access),'IMPORT_NATIVE_SCOPE');
  const saved=contexts.get(handle);fail(saved,'IMPORT_NATIVE_CONTEXT');const grant=await row(saved.id);
  if(grant)record({id:grant.id,credentialSha256:grant.credential_sha256,pins:JSON.parse(grant.pins),ownerEpoch:grant.owner_epoch,issuedAt:grant.issued_at,writeExpiresAt:grant.write_expires_at,receiptExpiresAt:grant.receipt_expires_at,requestLimit:grant.request_limit,operationLimit:grant.operation_limit});
  fail(grant&&grant.pins===expectedPins&&grant.scope===(restricted?incidentVerifyScope:'staging')&&grant.generation===saved.generation&&grant.credential_sha256===saved.digest,'IMPORT_NATIVE_FENCED');
  fail(await selectedHash(grant)===saved.policyHash,'IMPORT_NATIVE_FENCED');
  fail(grant.revoked_at===null,'IMPORT_NATIVE_REVOKED');
  const time=now();fail(time>=grant.issued_at&&time<(access==='receipt'?grant.receipt_expires_at:grant.write_expires_at),access==='receipt'?'IMPORT_NATIVE_RECEIPT_EXPIRED':'IMPORT_NATIVE_EXPIRED');
  const owner=await readOwnerEligibility();
  fail(owner&&owner.id===pins.ownerId&&owner.enabled===true&&owner.role==='admin'&&owner.exportAllowed===true&&owner.authEpoch===grant.owner_epoch&&Number.isSafeInteger(owner.revision)&&typeof owner.updatedAt==='string','IMPORT_NATIVE_OWNER_CHANGED');
  if(restricted)await checkRecovery(grant,access);
  return{grant,owner};
 }
 return{
  restricted,
  capabilityTable(handle){fail(contexts.has(handle),'IMPORT_NATIVE_CONTEXT');return table;},
  async authenticate({capabilityId,token,access='write'}){
   fail(idPattern.test(capabilityId||'')&&['write','receipt'].includes(access),'IMPORT_NATIVE_CREDENTIAL');
   const supplied=await credentialDigest(token),grant=await row(capabilityId);fail(digestEqual(supplied,grant?.credential_sha256),'IMPORT_NATIVE_CREDENTIAL');
   const handle=Object.freeze({kind:'native-import-capability',id:capabilityId});contexts.set(handle,{id:capabilityId,generation:grant.generation,digest:supplied,policyHash:await selectedHash(grant)});await inspect(handle,access);return handle;
  },inspect,
  async principal(handle,action){fail((restricted?['verify','audit']:['reconcile-existing','batch','verify','audit']).includes(action),'IMPORT_NATIVE_SCOPE');await inspect(handle);const principal=Object.freeze({id:pins.ownerId,role:'admin',sessionType:'native-import',exportAllowed:true});principals.set(principal,{pins,action});return principal;},
  // Administrative control primitive only; deliberately no public issuance or
  // revocation endpoint. Full revocation denies write AND receipt access.
  async revoke({capabilityId,expectedGeneration}){fail(idPattern.test(capabilityId||'')&&Number.isSafeInteger(expectedGeneration)&&expectedGeneration>0,'IMPORT_NATIVE_GRANT');const result=await db.prepare('UPDATE '+table+' SET revoked_at=?,generation=generation+1 WHERE id=? AND generation=? AND revoked_at IS NULL').bind(now(),capabilityId,expectedGeneration).run();fail(result.success&&result.meta.changes===1,'IMPORT_NATIVE_REVOKE_CONFLICT');},
 };
}
