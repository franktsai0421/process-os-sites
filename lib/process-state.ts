import {legacyJsonValueText,type JsonValue} from './legacy-login-json';
import { env } from 'cloudflare:workers';
import { effectiveAccess, type PlatformUser } from './user-access';
import {isPrimary,moduleForURL,operationForLegacy,accessKeys,catalog} from '../public/process/access-policy.mjs';
import {verifyPassword} from './passwords';
import { demoLoginAllowed, demoIdentity, isDemoUser } from './demo-identities.mjs';
import { encodeChunkedValues, decodeChunkedValues, type ChunkStorage } from './state-chunks';
import {encodeRecordValues,decodeRecordValues,pinIdentityReadToken,type RecordStorage,type RecordRead} from './state-records';
import { sessionRevocationEnabled, sessionRevoked, revokeSession } from './session-revocation';
import {projectCompanyState} from './site-security.mjs';
import {effectiveDeliveryValues} from './effective-delivery.mjs';
export type State = { revision: number; values: Record<string, string>; storage?:ChunkStorage;recordStorage?:RecordStorage;deliveryOnly?:boolean };
let localSessionSecret = '';
const loopback = (request: Request) => ['localhost','127.0.0.1'].includes(new URL(request.url).hostname);
// This delivery defaults to account login; demos need an explicit flag.
export const demoEnabled = (_request: Request) => demoLoginAllowed(env.DEMO_LOGIN_ENABLED);
const sessionSecret = (request: Request) => env.PROCESS_SESSION_SECRET || (loopback(request) ? (localSessionSecret ||= crypto.randomUUID() + crypto.randomUUID()) : '');
type SessionIdentity = { id: string; sessionType: 'demo' | 'platform'; authEpoch:number };
export const sessionCookieName = (request:Request) => loopback(request)&&new URL(request.url).port==='3040'?'process_demo_3040':'process_demo';
const requestSessionToken = (request: Request) => request.headers.get('cookie')?.split(';').map(c=>c.trim()).find(c=>c.startsWith(sessionCookieName(request)+'='))?.slice(sessionCookieName(request).length+1) || '';
type AuthDiagnostic = (code:string)=>void;
const authDiagnostic=(report:AuthDiagnostic|undefined,code:string)=>{try{report?.(code);}catch{/* no behavior change from diagnostics */}};
async function signedSession(request: Request, report?:AuthDiagnostic): Promise<(SessionIdentity & { expires: number }) | null> {
  try {
    const secret = sessionSecret(request);
    if (!secret) {authDiagnostic(report,'SESSION_SIGNER_UNAVAILABLE');return null;}
    const token = requestSessionToken(request);
    if (!token) {authDiagnostic(report,'SESSION_MISSING');return null;}
    if (token.length > 4096) {authDiagnostic(report,'SESSION_FORMAT');return null;}
    const [payload, signature, extra] = token.split('.');
    if (extra || !payload || !/^[a-f0-9]{64}$/.test(signature || '')) {authDiagnostic(report,'SESSION_FORMAT');return null;}
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), {name:'HMAC',hash:'SHA-256'}, false, ['sign','verify']);
    if (!await crypto.subtle.verify('HMAC', key, Uint8Array.from(signature.match(/../g)!, x=>parseInt(x,16)), new TextEncoder().encode(payload))) {authDiagnostic(report,'SESSION_SIGNATURE');return null;}
    const value = JSON.parse(atob(payload));
    if (typeof value.id !== 'string' || !Number.isFinite(value.expires)) {authDiagnostic(report,'SESSION_FORMAT');return null;}
    if (value.expires <= Date.now()) {authDiagnostic(report,'SESSION_EXPIRED');return null;}
    const sessionType = value.version === 2 ? value.sessionType : value.version === undefined && value.demo === false ? 'platform' : null;
    if (sessionType === 'demo') {
      if (!demoEnabled(request) || !['admin','rd','staff'].some(role=>demoIdentity(role)?.id===value.id)) return null;
    } else if (sessionType !== 'platform') return null;
    return { id: value.id, sessionType, expires: value.expires,authEpoch:Number.isSafeInteger(value.authEpoch)?value.authEpoch:0 };
  } catch {authDiagnostic(report,'SESSION_VALIDATION_FAILED');return null; }
}
async function verifiedSession(request: Request, report?:AuthDiagnostic): Promise<SessionIdentity | null> {
  try {
    const session = await signedSession(request,report);
    if (!session) return null;
    if(sessionRevocationEnabled() && await sessionRevoked(requestSessionToken(request))){authDiagnostic(report,'SESSION_REVOKED');return null;}
    return { id: session.id, sessionType: session.sessionType,authEpoch:session.authEpoch };
  } catch {authDiagnostic(report,'SESSION_REVOCATION_READ_FAILED');return null; } // Revocation storage failures deny this session.
}
export async function demoSession(request: Request, id?: string, demo = true,authEpoch=0) {
  if (!id) return (await verifiedSession(request))?.id || null;
  if (demo && (!demoEnabled(request) || !['admin','rd','staff'].some(role=>demoIdentity(role)?.id===id))) return null;
  const secret = sessionSecret(request);
  if (!secret) return null;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), {name:'HMAC',hash:'SHA-256'}, false, ['sign','verify']);
  const payload = btoa(JSON.stringify({version:2,id,sessionType:demo?'demo':'platform',authEpoch,expires:Date.now()+8*60*60*1000,nonce:crypto.randomUUID()}));
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  const token = payload + '.' + Array.from(new Uint8Array(signature), x=>x.toString(16).padStart(2,'0')).join('');
  try { if (sessionRevocationEnabled() && await sessionRevoked(token)) return null; } catch { return null; }
  return token;
}
export async function clearDemoSession(request:Request) {
  if (!sessionRevocationEnabled()) return;
  const session = await signedSession(request);
  if (session) await revokeSession(requestSessionToken(request), session.expires);
}
export const sessionCookie = (request: Request, token: string) => `${sessionCookieName(request)}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${token?'28800':'0'}${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`;
export const responseHeaders = {
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json; charset=utf-8',
  'X-Content-Type-Options': 'nosniff',
};
// Non-BOM source maintenance is not a browser account privilege. Reuse the
// separately managed release credential; never grant it to admin/demo Sessions.
export async function maintenanceCredential(request:Request){
 const settings=env as {PROCESS_RELEASE_TOKEN?:string;PROCESS_RELEASE_DISABLED?:string},expected=settings.PROCESS_RELEASE_TOKEN,received=request.headers.get('X-Process-Release-Token');
 if(settings.PROCESS_RELEASE_DISABLED==='true'||!expected||!received)return false;
 const digest=async(value:string)=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)));
 const [a,b]=await Promise.all([digest(expected),digest(received)]);return a.reduce((difference,value,index)=>difference|(value^b[index]),0)===0;
}
export const publicUntil = Date.parse('2026-09-13T12:00:00+07:00');
export const backupCoverage = [
  { view: '總覽', data: '全站統計與即時狀態所需來源' },
  { view: '產線播放台', data: '已核准製程、工段內容、BOM、設備與照片' },
  { view: '發送介面', data: 'A／B／C 線發送設定與產品安排' },
  { view: '產品製程狀態', data: '產品、路線、BOM 與已核准版本' },
  { view: '版本確認平台', data: '主資料與製程版本、送審狀態及確認紀錄' },
  {
    view: '製程編輯台',
    data: '所有類別工作區、流程方塊、連線、BOM 分配與草稿',
  },
  {
    view: '資料後台',
    data: 'AB／C 類別、產品、BOM、線別、工段、流程資料、使用者與角色權限',
  },
];
export const parse = (s: string | undefined, fallback: unknown) => {
  try {
    return s ? JSON.parse(s) : fallback;
  } catch {
    return fallback;
  }
};
export async function encodeValues(values:Record<string,string>,previous?:State,updatedModels?:Map<string,unknown>) {
  if(previous?.deliveryOnly)throw Error('Read-only delivery cannot be saved');
  if(previous?.recordStorage)return encodeRecordValues(env.STATE_ARCHIVE,values,previous.recordStorage,updatedModels);
  if(updatedModels?.size)throw Error('Prepared writes require record storage');
  if(previous?.storage)return encodeChunkedValues(env.STATE_ARCHIVE,values,previous.storage);
  const raw=JSON.stringify(values);
  if(raw.length<512*1024 && new TextEncoder().encode(raw).length<512*1024)return raw;
  const bucket=env.STATE_ARCHIVE;
  if(!bucket)throw Error('Large snapshot requires STATE_ARCHIVE storage');
  const bytes=new TextEncoder().encode(raw);
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
  const key=`snapshots/${digest}.json`;
  await bucket.put(key,bytes,{httpMetadata:{contentType:'application/json'}});
  return JSON.stringify({__processR2:{key,sha256:digest},platformUsers:values.platformUsers,...(values.maintenanceMode!==undefined?{maintenanceMode:values.maintenanceMode}:{})});
}
export async function decodeValues(raw:string):Promise<Record<string,string>> {
  const stored=JSON.parse(raw);
  if(stored.__processRecords)return (await decodeRecordValues(env.STATE_ARCHIVE,stored)).values;
  if(stored.__processChunks)return (await decodeChunkedValues(env.STATE_ARCHIVE,stored)).values;
  if(!stored.__processR2)return stored;
  const ref=stored.__processR2;
  if(!/^snapshots\/[a-f0-9]{64}\.json$/.test(ref.key))throw Error('Invalid snapshot reference');
  const object=await env.STATE_ARCHIVE?.get(ref.key);
  if(!object)throw Error('Snapshot unavailable; database was not modified');
  const bytes=await object.arrayBuffer();
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
  if(digest!==ref.sha256)throw Error('Snapshot integrity check failed');
  const values=JSON.parse(new TextDecoder().decode(bytes));
  if(stored.maintenanceMode!==undefined)values.maintenanceMode=stored.maintenanceMode;
  return values;
}
const normalizeUserId = (value: unknown) => legacyJsonValueText((value || '') as JsonValue).trim().toLowerCase();
export async function readState(options:RecordRead={}): Promise<State> {
  const deliver=(state:State):State=>options.effectiveOnly?{...state,values:effectiveDeliveryValues(state.values),deliveryOnly:true}:state;
  // Schema is owned by the checked-in Drizzle migrations, never by public reads.
  const row = await env.DB.prepare(
    'SELECT revision,"values" FROM shared_state WHERE id=1',
  ).first<{ revision: number; values: string }>();
  if (!row) throw Error('Current state is missing; explicit initialization is required');
  const stored=JSON.parse(row.values);
  if(stored.__processRecords){pinIdentityReadToken(options.identityReadToken,row.revision,row.values,env.STATE_ARCHIVE);return deliver({revision:row.revision,...await decodeRecordValues(env.STATE_ARCHIVE,stored,options)});}
  if(stored.__processChunks)return deliver({revision:row.revision,...await decodeChunkedValues(env.STATE_ARCHIVE,stored)});
  // Inline legacy state is already decoded. Avoid parsing large captured JSON
  // twice; R2 envelopes still pass through integrity-checked decodeValues.
  if(!stored.__processR2)return deliver({revision:row.revision,values:stored});
  const values = await decodeValues(row.values);
  return deliver({ revision: row.revision, values });
}
export const readPlatformUsers = (raw: string | undefined): PlatformUser[] => parse(raw, []);

export async function identity(request: Request, state: State,report?:AuthDiagnostic) {
  const session = await verifiedSession(request,report);
  if (session) {
    const user = readPlatformUsers(state.values.platformUsers).find((u)=>normalizeUserId(u.id)===session.id && u.enabled!==false && !u.deletedAt);
    if (!user || (session.authEpoch!==(user.authEpoch||0)) || (session.sessionType==='demo' ? !isDemoUser(user) : user.authMode==='demo')) {authDiagnostic(report,!user?'SESSION_ACCOUNT_UNAVAILABLE':session.authEpoch!==(user.authEpoch||0)?'SESSION_EPOCH':'SESSION_ACCOUNT_TYPE');return null;}
    return {id:session.id,name:user.name,role:user.role,primary:isPrimary(user),authMode:user.authMode,sessionType:session.sessionType};
  }
  // Public hosted access requires the verified application session above.
  // Missing or visitor-supplied Sites headers never establish business identity.
  if (!loopback(request)) return null;
  const requestUrl = new URL(request.url),
    hostname = requestUrl.hostname;
  const email = request.headers
    .get('oai-authenticated-user-email')
    ?.toLowerCase();
  const verified = !!request.headers.get('oai-authenticated-user-id');
  const platformId = normalizeUserId(request.headers.get('x-process-admin-id')),
    platformPassword = request.headers.get('x-process-admin-password') || '';
  const platformUser =
    platformId && platformPassword
      ? readPlatformUsers(state.values.platformUsers).find(
          (user) =>
            normalizeUserId(user.id) === platformId &&
            user.enabled !== false &&
            !user.deletedAt &&
            user.authMode !== 'demo',
        )
      : null;
  if (platformUser && await verifyPassword(platformUser,platformPassword))
    return {
      id: normalizeUserId(platformUser.id),
      name: platformUser.name,
      role: platformUser.role,
      primary:isPrimary(platformUser),
    };
  // A copied local management-preview URL does not carry the Sites preview
  // identity headers. Allow the explicit manage=1 URL only on loopback hosts;
  // the same query parameter never grants access on the deployed site.
  const localPreview =
    ['localhost', '127.0.0.1'].includes(hostname) &&
    requestUrl.searchParams.get('manage') === '1';
  if (verified && (email === 'franktsai0421@gmail.com' || localPreview))
    return {
      id: 'admin',
      name: localPreview ? '本機檢查管理員' : '系統管理員',
      role: 'admin',
      email,
    };
  if (localPreview)
    return {
      id: 'admin',
      name: '本機檢查管理員',
      role: 'admin',
      email: 'local-preview',
    };
  const user =
    verified &&
    readPlatformUsers(state.values.platformUsers).find(
      (u) => u.enabled !== false && !u.deletedAt && u.email?.toLowerCase() === email,
    );
  return user ? { id: user.id, name: user.name, role: user.role, email } : null;
}
export async function companyReader(request:Request,state:State) {
  const actor=await identity(request,state);
  if(!actor)return null;
  const user=readPlatformUsers(state.values.platformUsers).find(item=>item.id===actor.id);
  if(!user)return null;
  const access=effectiveAccess(user,state.values);
  if(!access.enabled)return null;
  return {actor,canRead:(permission:string)=>access.cells[permission]===true};
}
export async function companyState(request:Request,state:State) {
  const reader=await companyReader(request,state);
  if(!reader)throw Error('LOGIN_REQUIRED');
  return projectCompanyState(publicState(state,reader.actor.id),reader.actor,reader.canRead);
}
export async function can(request: Request, state: State, key: string) {
  const user = await identity(request, state);
  if (!user) return false;
  const stored = readPlatformUsers(state.values.platformUsers).find((item) => normalizeUserId(item.id) === user.id);
  const role = stored ? effectiveAccess(stored, state.values) : null;
  if(stored&&isPrimary(stored))return true;
  // Preview actors retain existing business preview access, never account access.
  if(!stored&&user.id==='admin')return !key.startsWith('users.')&&!key.startsWith('user-');
  const workflowModule=moduleForURL(request.url),op=operationForLegacy(key);
  if(role&&workflowModule&&op&&accessKeys.includes(workflowModule+'.'+op))return role.cells[workflowModule+'.'+op]===true;
  if(role&&accessKeys.includes(key))return role.cells[key]===true;
  if(role&&workflowModule&&key==='view:data'&&catalog.find(row=>row.id===workflowModule)?.view==='data')return role.cells[workflowModule+'.view']===true;
  return (
    !!role &&
    (key.startsWith('view:')
      ? role.views?.includes(key.slice(5))
      : role.permissions?.includes(key))
  );
}
export function publicState(state: State,actorId?:string) {
  const values = { ...state.values };
  delete values.routineFqcControl;
  if(values.processAuthoringControl){const authoring=parse(values.processAuthoringControl,null);if(!authoring?.workflow)throw Error('Invalid process authoring control');
    values.processAuthoringControl=JSON.stringify({activeVersionId:authoring.activeVersionId,versions:authoring.versions.filter((v:{id:string})=>v.id===authoring.activeVersionId)});
    // The legacy archive is not the public current editor or approval source.
    delete values.approvalVersions;for(const key of Object.keys(values))if(key.startsWith('processEditor:'))delete values[key];
  }
  delete values.processAuthoringRecovery;
  // The public site payload is not a workflow/history API. V3 private work and
  // receipt payloads are obtained only from the permission-checked module route.
  for (const key of ['ipqcCMasterControl','iqcMasterControl','routineEquipmentControl','toolingMasterControl','bomMasterControl']) {
  const control = parse(values[key], null);
  if (control?.workflow) {
    const { workflow: _workflow, ...projection } = control;
    projection.versions = (projection.versions || []).filter((v: {id:string}) => v.id === projection.activeVersionId);
    values[key] = JSON.stringify(projection);
  }
  }
  const ab=parse(values.ipqcABMasterControl,null);
  if(ab?.scopes){let changed=false;for(const scope of Object.values(ab.scopes) as {workflow?:unknown;activeVersionId:string|null;versions:{id:string}[]}[]){
    if(scope.workflow){delete scope.workflow;scope.versions=scope.versions.filter(v=>v.id===scope.activeVersionId);changed=true;}
  }
  // Public response only: omit the module's private drafts/receipts from a new
  // projection. The state values and stored AB control are never written here.
  const {moduleDraft:_privateModuleDraft,...publicAb}=ab;
  if(changed||_privateModuleDraft)values.ipqcABMasterControl=JSON.stringify(publicAb);}
  const quality=parse(values.qualityMasterControl,null);
  if(quality?.libraries?.fqc?.workflow){const library=quality.libraries.fqc;delete library.workflow;library.versions=library.versions.filter((v:{id:string})=>v.id===library.activeVersionId);values.qualityMasterControl=JSON.stringify(quality);}
  const master=parse(values.masterDataControl,null);
  if(master?.workflowScopes){const adopted=new Set(Object.keys(master.workflowScopes));delete master.workflowScopes;
    master.versions=master.versions.filter((v:{scope:string;status:string;snapshot:unknown})=>!adopted.has(v.scope)||v.status==='approved'&&JSON.stringify(v.snapshot)===JSON.stringify(master.active[v.scope]));
    values.masterDataControl=JSON.stringify(master);}
  values.platformUsers = JSON.stringify(
    readPlatformUsers(values.platformUsers).filter((u)=>actorId&&u.id===actorId).map(({ password: _password,passwordHash: _passwordHash, ...u }) => ({
      ...u,...effectiveAccess(u,state.values),
    })),
  );
  delete values.processAccessControl;
  // Role matrices belong to the dedicated account API, never the site payload.
  delete values.processCustomRoles;delete values.processRoleTemplateOverrides;
  return { revision:state.revision, values };
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get('Origin');
  return request.headers.get('Sec-Fetch-Site') !== 'cross-site' && (!origin || origin === new URL(request.url).origin);
}
export const defaultBackupSettings = {
  enabled: false,
  frequency: 'weekly',
  dayOfWeek: 6,
  time: '12:00',
  timezone: 'Asia/Ho_Chi_Minh',
};
export function backupSettings(state: State) {
  const raw = parse(state.values.backupSettings, {}),
    legacy = raw.dayOfWeek === 1 && raw.time === '00:00',
    frequency = 'weekly',
    dayOfWeek = 6,
    time = legacy
      ? '12:00'
      : /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(raw.time || '')
        ? raw.time
        : '12:00';
  return {
    enabled: raw.enabled === true,
    frequency,
    dayOfWeek,
    time,
    timezone: 'Asia/Ho_Chi_Minh',
  };
}
export function allowedKey(k: string) {
  return (
    [
      'platformUsers',
      'processCustomRoles',
      'processRoleTemplateOverrides',
      'approvalVersions',
      'dispatchBoard',
      'publishedProcess',
      'processMasterData',
      'masterDataControl',
      'bomOverrides',
      'versionSampleSeed4',
      'backupSettings',
      'canonicalQuality',
      'qualityMasterControl',
    ].includes(k) || k.startsWith('processEditor:')
  );
}
// Explicit maintenance/draft capture only; ordinary mutation routes do not call this.
export async function backup(
  state: State,
  reason: string,
  actor: string,
  force = false,
) {
  const slot = new Date().toISOString().slice(0, 13),
    id = force ? crypto.randomUUID() : `hour-${slot}`;
  await env.DB.prepare(
    'INSERT OR IGNORE INTO state_backups(id,revision,"values",reason,actor,created_at) VALUES(?,?,?,?,?,?)',
  )
    .bind(
      id,
      state.revision,
      await encodeValues(state.values,state),
      reason,
      actor,
      new Date().toISOString(),
    )
    .run();
  return id;
}
// Explicit maintenance tooling only; ordinary mutations use stateRevisionIsCurrent.
// Snapshot the exact stored envelope, preserving its verified immutable R2 refs.
// The revision predicate prevents backing up a different revision during a race.
export async function backupStoredState(state: State, reason: string, actor: string) {
  const result = await env.DB.prepare(
    'INSERT INTO state_backups(id,revision,"values",reason,actor,created_at) SELECT ?,revision,"values",?,?,? FROM shared_state WHERE id=1 AND revision=?',
  ).bind(crypto.randomUUID(), reason, actor, new Date().toISOString(), state.revision).run();
  if (result.meta.changes !== 1) return false;
  return true;
}
// Automatic periodic backups are disabled, irrespective of retained settings.
// Kept as an inert compatibility export: no full read, encode, backup or prune.
export async function scheduledBackup(_state: State,_readComplete?:()=>Promise<State>) {
  return {status:'disabled' as const};
}

// Preserve the early stale-revision check without creating a protection snapshot.
// Every caller retains its final revision-conditioned UPDATE as the actual fence.
export async function stateRevisionIsCurrent(state: Pick<State,'revision'>) {
  if(!Number.isSafeInteger(state.revision)||state.revision<0)return false;
  const current=await env.DB.prepare('SELECT revision FROM shared_state WHERE id=1 AND revision=?').bind(state.revision).first<{revision:number}>();
  return current?.revision===state.revision;
}
