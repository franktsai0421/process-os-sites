// Default-off, one incident only. Admission is durable before the atomic
// supersession; ambiguous outcomes are read-only and never admit another POST.
import {v19,planV19Recovery,buildV19RecoveryBatch,checkV19Continuation} from '../scripts/verify-recovery-v19-20261024.mjs';
import {credentialMatches,incidentVerifyRecord,createIncidentVerifyAuthority} from './snapshot-native-capability.mjs';
import {sha256} from './snapshot-contract.mjs';
import {readImportBody} from './snapshot-hosted-transfer.mjs';
const fail=(v,c='IMPORT_V19_CONFIGURATION')=>{if(!v)throw Error(c);};
const exact=(v,k)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join()===k.slice().sort().join();
const digest=v=>sha256(new TextEncoder().encode(JSON.stringify(v)));
const assertion=c=>`SELECT json(CASE WHEN (${c}) THEN 'true' ELSE 'IMPORT_V19_ADMISSION_CAS' END)`;
const reply=(v,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'no-store'}});
export async function createV19RecoveryRuntime({db,config,programCommit,projectId,origin,bindingsPins,readOwnerEligibility,now=()=>Date.now()}){
 const c=typeof config==='string'?JSON.parse(config):config;
 fail(exact(c,['format','programCommit','nonce','maintenance','grant'])&&c.format==='PROCESS_OS_V19_RECOVERY_V1'&&c.programCommit===programCommit&&/^[a-f0-9]{40}$/.test(programCommit||'')&&!/^0+$/.test(programCommit));
 fail(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(c.nonce||''));
 const pins=Object.fromEntries(['projectId','origin','ownerId','targetFingerprint','manifestSha256','transferId'].map(k=>[k,v19[k]]));
 fail(projectId===v19.projectId&&origin===v19.origin&&exact(bindingsPins,Object.keys(pins))&&Object.keys(pins).every(k=>bindingsPins[k]===pins[k])&&typeof readOwnerEligibility==='function');
 const m=c.maintenance,g=c.grant;
 fail(exact(m,['id','credentialSha256','issuedAt','expiresAt','receiptExpiresAt'])&&/^[a-f0-9]{64}$/.test(m.credentialSha256||'')&&m.id==='im_'+m.credentialSha256.slice(0,32));
 fail([m.issuedAt,m.expiresAt,m.receiptExpiresAt].every(Number.isSafeInteger)&&m.issuedAt>=0&&m.expiresAt===m.issuedAt+600000&&m.receiptExpiresAt===m.issuedAt+18000000);
 fail(exact(g,['id','credentialSha256','ownerEpoch','issuedAt','writeExpiresAt','receiptExpiresAt','requestLimit','operationLimit'])&&g.issuedAt===m.issuedAt&&g.id==='ic_'+g.credentialSha256?.slice(0,32)&&g.id!==v19.capabilityId&&g.credentialSha256!==m.credentialSha256);
 incidentVerifyRecord({...g,pins});const configSha=await digest(c);
 async function owner(){const o=await readOwnerEligibility();fail(o?.id==='frank'&&o.enabled===true&&o.role==='admin'&&o.exportAllowed===true&&o.authEpoch===0&&Number.isSafeInteger(o.revision)&&typeof o.updatedAt==='string','IMPORT_NATIVE_OWNER_CHANGED');return o;}
 function time(write){const t=now();fail(Number.isSafeInteger(t)&&t>=m.issuedAt&&t<(write?m.expiresAt:m.receiptExpiresAt),'IMPORT_V19_EXPIRED');return t;}
 const row=()=>db.prepare('SELECT * FROM process_import_verify_v19_admission WHERE id=1').first();
 function same(r){fail(r&&r.config_sha===configSha&&r.nonce===c.nonce&&r.maintenance_digest===m.credentialSha256&&r.issued_at===m.issuedAt&&r.expires_at===m.expiresAt&&r.receipt_expires_at===m.receiptExpiresAt,'IMPORT_V19_FENCED');}
 async function plan(){return planV19Recovery(db,{newGrant:g,programCommit,maintenance:{credentialSha256:m.credentialSha256,issuedAt:m.issuedAt,expiresAt:m.expiresAt},nonce:c.nonce});}
 async function checkRecovery(grant,access){const r=await row();same(r);fail(r.state==='complete','IMPORT_V19_UNCONFIRMED');const p=JSON.parse(r.plan);fail(p.planSha256===r.plan_sha&&p.programCommit===programCommit&&p.newGrant.id===g.id&&p.newGrant.credential_sha256===g.credentialSha256,'IMPORT_V19_FENCED');return checkV19Continuation(db,p,grant,access);}
 const authority=createIncidentVerifyAuthority({db,pins,readOwnerEligibility,now,checkRecovery});
 return{authority,continuation:{version:20,cursor:272,uploadAllowed:false},
  authorizeAction(id,action,method){fail(id===g.id&&(method==='GET'?['configuration','status','budget-status','request-status'].includes(action):method==='POST'&&['verify','audit'].includes(action)),'IMPORT_NATIVE_SCOPE');},
  async assertContinuation(handle,action){const{grant}=await authority.inspect(handle);await checkRecovery(grant,'write');fail(['verify','audit'].includes(action),'IMPORT_NATIVE_SCOPE');},
  async handle(request){let claimed=false;
   try{
    const u=new URL(request.url),write=request.method==='POST',action=u.searchParams.get('action');
    fail(u.origin===v19.origin&&u.pathname==='/api/snapshots/import'&&!u.username&&!u.password&&!u.hash&&[...u.searchParams.keys()].join()==='action','IMPORT_V19_DESTINATION');
    fail(write?action==='v19-resume':request.method==='GET'&&['v19-plan','v19-status'].includes(action),'IMPORT_NATIVE_SCOPE');
    fail(!request.headers.has('Cookie'),'IMPORT_NATIVE_MIXED_IDENTITY');
    const match=/^Bearer (im_[a-f0-9]{32})\.([A-Za-z0-9_-]{43})$/.exec(request.headers.get('Authorization')||'');
    fail(match&&match[1]===m.id&&await credentialMatches(match[2],m.credentialSha256),'IMPORT_V19_CREDENTIAL');
    fail(!write||request.headers.get('Origin')===origin&&request.headers.get('Sec-Fetch-Site')!=='cross-site','IMPORT_NATIVE_CROSS_ORIGIN');
    time(write);await owner();time(write);
    const prior=await row();if(prior)same(prior);
    if(action==='v19-status'){
     const t=await db.prepare('SELECT version,verify_cursor FROM process_snapshot_transfers WHERE id=?').bind(v19.transferId).first(),b=await db.prepare('SELECT state,active_request FROM process_import_budget WHERE id=1').first();time(false);
     return reply({stage:prior?.state==='complete'?'resumed':prior?.state||'not-admitted',configSha,programCommit,inFlight:prior?.state==='pending',budgetState:b?.state,importInFlight:!!b?.active_request,version:t?.version,verifiedCursor:t?.verify_cursor,receipts:prior?[{action:'v19-resume',nonce:prior.nonce,requestSha256:prior.request_sha,state:prior.state}]:[],automaticRetryAllowed:false});
    }
    fail(!prior,'IMPORT_V19_ALREADY_ADMITTED');
    if(!write){const p=await plan();time(true);return reply({stage:'not-admitted',planSha256:p.planSha256,configSha,programCommit,nonce:c.nonce});}
    fail(request.headers.get('Content-Type')?.split(';')[0]==='application/json','IMPORT_V19_BODY');
    const body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await readImportBody(request,1024)));
    fail(exact(body,['nonce','planSha256'])&&body.nonce===c.nonce&&/^[a-f0-9]{64}$/.test(body.planSha256||''),'IMPORT_V19_BODY');
    const p=await plan();fail(body.planSha256===p.planSha256,'IMPORT_V19_PLAN_CONFLICT');
    const requestSha=await digest({action,nonce:c.nonce,planSha256:p.planSha256,configSha});
    const o=await owner(),admittedAt=time(true);
    const admission=await db.prepare("INSERT INTO process_import_verify_v19_admission(id,config_sha,nonce,plan_sha,plan,request_sha,maintenance_digest,issued_at,expires_at,receipt_expires_at,state,admitted_at) SELECT 1,?,?,?,?,?,?,?,?,?,'pending',? WHERE EXISTS(SELECT 1 FROM shared_state WHERE id=1 AND revision=? AND updated_at=?) ON CONFLICT(id) DO NOTHING").bind(configSha,c.nonce,p.planSha256,JSON.stringify(p),requestSha,m.credentialSha256,m.issuedAt,m.expiresAt,m.receiptExpiresAt,admittedAt,o.revision,o.updatedAt).run();
    fail(admission.success&&admission.meta.changes===1,'IMPORT_V19_ALREADY_ADMITTED');claimed=true;
    // Build only AFTER all config/plan/nonce/owner checks and durable admission.
    // The builder awaits owner and reads fresh server time. No batch is cached.
    const batch=await buildV19RecoveryBatch(db,p,{now,readOwnerEligibility:owner});
    const dispatchAt=time(true);
    const guard=db.prepare(assertion("EXISTS(SELECT 1 FROM process_import_verify_v19_admission WHERE id=1 AND config_sha=? AND nonce=? AND plan_sha=? AND request_sha=? AND state='pending' AND issued_at<=? AND expires_at>?)")).bind(configSha,c.nonce,p.planSha256,requestSha,dispatchAt,dispatchAt);
    const finish=db.prepare("UPDATE process_import_verify_v19_admission SET state='complete',finalized_at=? WHERE id=1 AND config_sha=? AND nonce=? AND state='pending'").bind(dispatchAt,configSha,c.nonce);
    // No await between fresh dispatch time and the single atomic transaction.
    const result=await db.batch([guard,...batch,finish,db.prepare(assertion('changes()=1'))]);
    fail(result.every(r=>r.success),'IMPORT_V19_UNCONFIRMED');claimed=false;
    return reply({stage:'resumed',planSha256:p.planSha256,receipt:{action,nonce:c.nonce,requestSha256:requestSha,state:'complete'}});
   }catch(e){
    if(claimed)try{await db.prepare("UPDATE process_import_verify_v19_admission SET state='unknown',finalized_at=? WHERE id=1 AND config_sha=? AND nonce=? AND state='pending'").bind(now(),configSha,c.nonce).run();}catch{/* retain pending; never reset */}
    const code=/^(IMPORT|SNAPSHOT)_[A-Z0-9_]+$/.test(e?.message||'')?e.message:'IMPORT_V19_UNCONFIRMED';return reply({error:code,automaticRetryAllowed:false},/CREDENTIAL|EXPIRED|OWNER_CHANGED/.test(code)?401:/SCOPE|CROSS_ORIGIN|MIXED_IDENTITY/.test(code)?403:409);
   }
  },
 };
}
