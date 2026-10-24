// Default-off exact-incident server entry. No arbitrary SQL, target, time,
// credential issuance, lock reset, role/password change or payload upload.
import {incident,planIncidentRecovery,buildIncidentRecoveryBatch} from '../scripts/verify-recovery-20261023.mjs';
import {planIncidentMaintenance,buildIncidentMaintenanceBatch,buildIncidentResumeBatch,assertIncidentResumePlan} from '../scripts/verify-resume-plan-20261023.mjs';
import {incidentVerifyRecord,incidentVerifyScope,credentialMatches,createIncidentVerifyAuthority} from './snapshot-native-capability.mjs';
import {sha256} from './snapshot-contract.mjs';
import {readImportBody} from './snapshot-hosted-transfer.mjs';
const fail=(v,c='IMPORT_VERIFY_CONFIGURATION')=>{if(!v)throw Error(c);};
const digest=v=>sha256(new TextEncoder().encode(JSON.stringify(v)));
const keys=(v,list)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join()===list.slice().sort().join();
const noncePattern=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const reply=(v,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'no-store'}});
const sqlAssert=c=>`SELECT json(CASE WHEN (${c}) THEN 'true' ELSE 'IMPORT_VERIFY_MAINTENANCE_CAS' END)`;
export const incidentActions=Object.freeze(['incident-register','incident-plan','incident-status','incident-hold','incident-maintenance','incident-resume']);
export async function createIncidentRecoveryRuntime({db,config,programCommit,projectId,origin,bindingsPins,readOwnerEligibility,now=()=>Date.now()}){
 const c=typeof config==='string'?JSON.parse(config):config;
 fail(keys(c,['format','programCommit','maintenance','grant'])&&c.format==='PROCESS_OS_INCIDENT_RECOVERY_V1'&&c.programCommit===programCommit&&/^[a-f0-9]{40}$/.test(programCommit||'')&&!/^0+$/.test(programCommit));
 fail(projectId===incident.projectId&&origin===incident.origin&&typeof readOwnerEligibility==='function');
 fail(keys(bindingsPins,['projectId','origin','ownerId','targetFingerprint','manifestSha256','transferId'])&&Object.keys(bindingsPins).every(k=>bindingsPins[k]===incident[k]));
 const m=c.maintenance,g=c.grant;
 fail(keys(m,['id','credentialSha256','issuedAt','expiresAt','receiptExpiresAt'])&&/^[a-f0-9]{64}$/.test(m.credentialSha256||'')&&m.id==='im_'+m.credentialSha256.slice(0,32));
 fail([m.issuedAt,m.expiresAt,m.receiptExpiresAt].every(Number.isSafeInteger)&&m.issuedAt>=0&&m.expiresAt===m.issuedAt+600000&&m.receiptExpiresAt===m.issuedAt+18000000);
 fail(keys(g,['id','credentialSha256','ownerEpoch','issuedAt','writeExpiresAt','receiptExpiresAt','requestLimit','operationLimit'])&&g.issuedAt===m.issuedAt&&g.id==='ic_'+g.credentialSha256?.slice(0,32)&&g.id!==incident.capabilityId&&g.credentialSha256!==m.credentialSha256);
 const pins=Object.fromEntries(['projectId','origin','ownerId','targetFingerprint','manifestSha256','transferId'].map(k=>[k,incident[k]]));
 incidentVerifyRecord({...g,pins});const configSha=await digest(c);
 async function owner(){const o=await readOwnerEligibility();fail(o?.id==='frank'&&o.enabled===true&&o.role==='admin'&&o.exportAllowed===true&&o.authEpoch===0&&Number.isSafeInteger(o.revision)&&typeof o.updatedAt==='string','IMPORT_NATIVE_OWNER_CHANGED');return o;}
 async function row(){return db.prepare('SELECT * FROM process_import_verify_maintenance WHERE id=1').first();}
 function sameRow(r){fail(r&&r.capability_id===m.id&&r.credential_sha256===m.credentialSha256&&r.config_sha===configSha&&r.issued_at===m.issuedAt&&r.expires_at===m.expiresAt&&r.receipt_expires_at===m.receiptExpiresAt,'IMPORT_VERIFY_MAINTENANCE_FENCED');}
 async function authorize(request,write){
  const u=new URL(request.url);fail(u.origin===incident.origin&&u.pathname==='/api/snapshots/import'&&!u.username&&!u.password&&!u.hash,'IMPORT_VERIFY_DESTINATION');
  fail(!request.headers.has('Cookie'),'IMPORT_NATIVE_MIXED_IDENTITY');
  const match=/^Bearer (im_[a-f0-9]{32})\.([A-Za-z0-9_-]{43})$/.exec(request.headers.get('Authorization')||'');
  fail(match&&match[1]===m.id&&await credentialMatches(match[2],m.credentialSha256),'IMPORT_VERIFY_CREDENTIAL');
  fail(!write||request.headers.get('Origin')===incident.origin&&request.headers.get('Sec-Fetch-Site')!=='cross-site','IMPORT_NATIVE_CROSS_ORIGIN');
  fail(now()>=m.issuedAt&&now()<(write?m.expiresAt:m.receiptExpiresAt),'IMPORT_VERIFY_EXPIRED');await owner();return u;
 }
 async function checkRecovery(grant,access='write'){
  fail(grant.id===g.id&&grant.scope===incidentVerifyScope&&grant.credential_sha256===g.credentialSha256&&grant.program_commit===programCommit&&grant.issued_at===g.issuedAt&&grant.write_expires_at===g.writeExpiresAt&&grant.receipt_expires_at===g.receiptExpiresAt,'IMPORT_VERIFY_SCOPE');
  const r=await row();sameRow(r);fail(r.stage==='resumed'&&r.active_nonce===null&&r.resume_plan,'IMPORT_VERIFY_NOT_RESUMED');
  const p=JSON.parse(r.resume_plan);await assertIncidentResumePlan(p);
  fail(p.reviewedProgramCommit===programCommit&&grant.hold_plan_sha===p.holdPlanSha256&&grant.resume_plan_sha===p.planSha256,'IMPORT_VERIFY_SCOPE');
  const [b,t,old,oldGrant]=await Promise.all([
   db.prepare('SELECT state,reason FROM process_import_budget WHERE id=1').first(),
   db.prepare('SELECT project_id,target,manifest_sha,owner_id,phase,version,verify_cursor,chunk_count FROM process_snapshot_transfers WHERE id=?').bind(incident.transferId).first(),
   db.prepare('SELECT state,reason FROM process_import_native_requests WHERE request_id=?').bind(incident.requestId).first(),
   db.prepare('SELECT generation,revoked_at FROM process_import_capabilities WHERE id=?').bind(incident.capabilityId).first(),
  ]);
  fail((access==='receipt'?['open','stopped'].includes(b?.state):b?.state==='open'&&b.reason==='IMPORT_VERIFY_RESUME_ONLY:'+p.planSha256)&&old?.state==='blocked'&&old.reason==='verify-recovery-resumed:'+p.holdPlanSha256+':'+p.planSha256,'IMPORT_VERIFY_SCOPE');
  fail(oldGrant?.generation===2&&oldGrant.revoked_at!==null,'IMPORT_VERIFY_SCOPE');
  fail(t?.project_id===incident.projectId&&t.target===incident.targetFingerprint&&t.manifest_sha===incident.manifestSha256&&t.owner_id==='frank'&&t.chunk_count===1401,'IMPORT_VERIFY_CONTINUATION');
  if(access!=='receipt')fail(t.verify_cursor>=272&&t.verify_cursor<=1401&&t.version===19+Math.ceil((t.verify_cursor-272)/16)&&t.phase===(t.verify_cursor===1401?'integrity-verified':'receiving'),'IMPORT_VERIFY_CONTINUATION');
  fail(grant.baseline_verified===0&&grant.baseline_checked===0&&grant.baseline_cursor===0&&grant.baseline_version===19,'IMPORT_VERIFY_CONTINUATION');
 }
 const authority=createIncidentVerifyAuthority({db,pins,readOwnerEligibility,now,checkRecovery});
 const api={authority,
  authorizeAction(id,action,method){fail(id===g.id&&(method==='GET'?['configuration','status','budget-status','request-status'].includes(action):method==='POST'&&['verify','audit'].includes(action)),'IMPORT_NATIVE_SCOPE');},
  async assertContinuation(handle,action){const {grant}=await authority.inspect(handle);await checkRecovery(grant);fail(['verify','audit'].includes(action),'IMPORT_NATIVE_SCOPE');},
  async handle(request){let admitted=null;
   try{
    const write=request.method==='POST',u=await authorize(request,write),action=u.searchParams.get('action');
    fail((request.method==='GET'||write)&&[...u.searchParams.keys()].every(k=>k==='action')&&u.searchParams.getAll('action').length===1&&incidentActions.includes(action),'IMPORT_VERIFY_ACTION');
    let r=await row();
    if(action==='incident-register'){
     fail(write,'IMPORT_VERIFY_ACTION');if(r){sameRow(r);return reply({stage:r.stage,alreadyRegistered:true});}
     if(request.body)fail((await readImportBody(request,1)).length===0,'IMPORT_VERIFY_BODY');
     const o=await owner();fail(now()<m.expiresAt,'IMPORT_VERIFY_EXPIRED');
     const result=await db.batch([
      db.prepare("INSERT INTO process_import_verify_maintenance(id,capability_id,credential_sha256,config_sha,issued_at,expires_at,receipt_expires_at,stage) SELECT 1,?,?,?,?,?,?,'registered' WHERE EXISTS(SELECT 1 FROM shared_state WHERE id=1 AND revision=? AND updated_at=?) ON CONFLICT(id) DO NOTHING").bind(m.id,m.credentialSha256,configSha,m.issuedAt,m.expiresAt,m.receiptExpiresAt,o.revision,o.updatedAt),
      db.prepare(sqlAssert('EXISTS(SELECT 1 FROM process_import_verify_maintenance WHERE id=1 AND capability_id=? AND config_sha=?)')).bind(m.id,configSha),
     ]);fail(result.every(v=>v.success),'IMPORT_VERIFY_REGISTER_UNCERTAIN');return reply({stage:'registered'});
    }
    sameRow(r);const receipts=JSON.parse(r.receipts);fail(Array.isArray(receipts)&&receipts.length<=3,'IMPORT_VERIFY_RECEIPT');
    if(!write){
     if(action==='incident-status'){const [b,t]=await Promise.all([db.prepare('SELECT state,active_request FROM process_import_budget WHERE id=1').first(),db.prepare('SELECT version,verify_cursor FROM process_snapshot_transfers WHERE id=?').bind(incident.transferId).first()]);return reply({stage:r.stage,inFlight:r.active_nonce!==null,receipts,budgetState:b?.state,importInFlight:!!b?.active_request,version:t?.version,verifiedCursor:t?.verify_cursor,programCommit,configSha});}
     fail(action==='incident-plan'&&r.active_nonce===null&&now()<m.expiresAt,'IMPORT_VERIFY_ACTION');
     const p=r.stage==='registered'?await planIncidentRecovery(db):r.stage==='held'?await planIncidentMaintenance(db,{holdPlan:JSON.parse(r.hold_plan),newGrant:g,reviewedProgramCommit:programCommit,at:r.held_at}):JSON.parse(r.resume_plan);
     return reply({stage:r.stage,planSha256:p.planSha256||p.snapshotSha256,configSha,programCommit});
    }
    fail(['incident-hold','incident-maintenance','incident-resume'].includes(action),'IMPORT_VERIFY_ACTION');
    const body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await readImportBody(request,1024)));
    fail(keys(body,['nonce','planSha256'])&&noncePattern.test(body.nonce||'')&&/^[a-f0-9]{64}$/.test(body.planSha256||''),'IMPORT_VERIFY_BODY');
    const hash=await digest({action,nonce:body.nonce,planSha256:body.planSha256,configSha});
    const prior=receipts.find(v=>v.nonce===body.nonce);if(prior){fail(prior.requestSha256===hash&&prior.action===action,'IMPORT_VERIFY_NONCE_CONFLICT');return reply({stage:r.stage,receipt:prior,replayed:true});}
    const expected=({'incident-hold':'registered','incident-maintenance':'held','incident-resume':'maintenance'})[action];
    fail(r.stage===expected&&r.active_nonce===null&&r.admitted<3,'IMPORT_VERIFY_REQUEST_FENCED');
    const at=now();fail(at<m.expiresAt,'IMPORT_VERIFY_EXPIRED');
    const p=action==='incident-hold'?await planIncidentRecovery(db):action==='incident-maintenance'?await planIncidentMaintenance(db,{holdPlan:JSON.parse(r.hold_plan),newGrant:g,reviewedProgramCommit:programCommit,at:r.held_at}):JSON.parse(r.resume_plan);
    fail(body.planSha256===(p.planSha256||p.snapshotSha256),'IMPORT_VERIFY_PLAN_CONFLICT');
    const entry={nonce:body.nonce,action,requestSha256:hash,state:'running'},next=[...receipts,entry],index=receipts.length;
    const claimed=await db.prepare("UPDATE process_import_verify_maintenance SET active_nonce=?,receipts=?,admitted=admitted+1 WHERE id=1 AND config_sha=? AND stage=? AND active_nonce IS NULL AND admitted=? AND expires_at>? AND issued_at<=?").bind(body.nonce,JSON.stringify(next),configSha,expected,r.admitted,now(),now()).run();
    fail(claimed.success&&claimed.meta.changes===1,'IMPORT_VERIFY_REQUEST_FENCED');admitted={nonce:body.nonce,index};
    const batch=action==='incident-hold'?await buildIncidentRecoveryBatch(db,p,{at}):action==='incident-maintenance'?await buildIncidentMaintenanceBatch(db,p):await buildIncidentResumeBatch(db,p,{at:now()});
    fail(now()<m.expiresAt,'IMPORT_VERIFY_EXPIRED');const currentOwner=await owner();
    const dispatchAt=now();fail(dispatchAt>=m.issuedAt&&dispatchAt<m.expiresAt,'IMPORT_VERIFY_EXPIRED');
    const stage=({'incident-hold':'held','incident-maintenance':'maintenance','incident-resume':'resumed'})[action];
    const guard=db.prepare(sqlAssert('EXISTS(SELECT 1 FROM process_import_verify_maintenance WHERE id=1 AND config_sha=? AND stage=? AND active_nonce=? AND issued_at<=? AND expires_at>?) AND EXISTS(SELECT 1 FROM shared_state WHERE id=1 AND revision=? AND updated_at=?)')).bind(configSha,expected,body.nonce,dispatchAt,dispatchAt,currentOwner.revision,currentOwner.updatedAt);
    const settled=next.map((v,i)=>i===index?{...v,state:'complete'}:v),savedHold=action==='incident-hold'?JSON.stringify(p):r.hold_plan,savedResume=action==='incident-maintenance'?JSON.stringify(p):r.resume_plan;
    fail((savedHold?.length||0)<=65536&&(savedResume?.length||0)<=65536,'IMPORT_VERIFY_RECEIPT');
    const finish=db.prepare('UPDATE process_import_verify_maintenance SET stage=?,active_nonce=NULL,receipts=?,hold_plan=?,resume_plan=?,held_at=? WHERE id=1 AND config_sha=? AND active_nonce=? AND stage=?').bind(stage,JSON.stringify(settled),savedHold,savedResume,action==='incident-hold'?at:r.held_at,configSha,body.nonce,expected);
    const result=await db.batch([guard,...batch,finish,db.prepare(sqlAssert('changes()=1'))]);fail(result.every(v=>v.success),'IMPORT_VERIFY_RESULT_UNCERTAIN');admitted=null;return reply({stage,receipt:settled[index],planSha256:body.planSha256});
   }catch(error){
    if(admitted)try{await db.prepare("UPDATE process_import_verify_maintenance SET receipts=json_set(receipts,?,'unknown') WHERE id=1 AND active_nonce=? AND config_sha=?").bind('$['+admitted.index+'].state',admitted.nonce,configSha).run();}catch{/* retain active nonce */}
    const code=/^(IMPORT|SNAPSHOT)_[A-Z0-9_]+$/.test(error?.message||'')?error.message:'IMPORT_VERIFY_UNCERTAIN';return reply({error:code,automaticRetryAllowed:false},/CREDENTIAL|EXPIRED|OWNER_CHANGED/.test(code)?401:/SCOPE|CROSS_ORIGIN|MIXED_IDENTITY/.test(code)?403:409);
   }
  },
 };
 return api;
}
