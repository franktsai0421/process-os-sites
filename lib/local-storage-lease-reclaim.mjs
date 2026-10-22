import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {assertNoIncompleteUpdate,LocalUpdateBlockedError} from './local-update-guard.mjs';
import {acquireLocalStorageLease} from './local-storage-lease.mjs';

// Explicit evidence-based orphan retention. No process query, SDK, env switch,
// storage read, PID guessing, deletion of an orphan, or automatic retry here.
const need=(v,r)=>{if(!v)throw new LocalUpdateBlockedError(r);};
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const hash=v=>typeof v==='string'&&/^[0-9a-f]{64}$/.test(v);
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v);
const obj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const keys=(v,ks)=>obj(v)&&Object.keys(v).sort().join('|')===ks.slice().sort().join('|');
const samePath=(a,b)=>typeof a==='string'&&typeof b==='string'&&(process.platform==='win32'?path.resolve(a).toLowerCase()===path.resolve(b).toLowerCase():path.resolve(a)===path.resolve(b));
const fields=['dev','ino','size','nlink','mtimeNs','ctimeNs'];
const same=(a,b)=>a&&b&&fields.every(k=>a[k]===b[k]);
function st(p){try{return fs.lstatSync(p,{bigint:true});}catch(e){if(e.code==='ENOENT')return null;throw e;}}
function dir(p){const s=st(p);need(s?.isDirectory()&&!s.isSymbolicLink()&&samePath(fs.realpathSync.native(p),p),'UPDATE_RECLAIM_PATH');}
function rootPath(root){need(typeof root==='string'&&st(root)?.isDirectory()&&!st(root).isSymbolicLink(),'UPDATE_RECLAIM_ROOT');for(let p=path.resolve(root);;p=path.dirname(p)){need(path.basename(p).toLowerCase()!=='.u1s','UPDATE_RECOVERY_NAMESPACE');if(path.dirname(p)===p)break;}const r=fs.realpathSync.native(root);for(let p=r;;p=path.dirname(p)){need(!['.process-update','.u1s'].includes(path.basename(p).toLowerCase()),'UPDATE_RECOVERY_NAMESPACE');dir(p);if(path.dirname(p)===p)break;}return r;}
function read(p,limit=16384){const before=st(p);need(before?.isFile()&&!before.isSymbolicLink()&&before.nlink===1n&&before.size>0n&&before.size<=BigInt(limit),'UPDATE_RECLAIM_METADATA');
  for(let parent=path.dirname(p);;parent=path.dirname(parent)){dir(parent);if(path.dirname(parent)===parent)break;}
  need(samePath(fs.realpathSync.native(p),p),'UPDATE_RECLAIM_PATH');const fd=fs.openSync(p,'r');
  try{const opened=fs.fstatSync(fd,{bigint:true});need(same(before,opened),'UPDATE_RECLAIM_CHANGED');const b=Buffer.alloc(limit+1);let n=0;while(n<b.length){const c=fs.readSync(fd,b,n,b.length-n,n);if(!c)break;n+=c;}
    need(BigInt(n)===before.size&&same(opened,fs.fstatSync(fd,{bigint:true}))&&same(before,st(p)),'UPDATE_RECLAIM_CHANGED');const bytes=b.subarray(0,n);return{path:p,bytes,value:JSON.parse(bytes.toString('utf8')),sha256:sha(bytes),identity:before};
  }finally{fs.closeSync(fd);}}
function pinned(pin,limit){need(keys(pin,['path','sha256','bytes'])&&typeof pin.path==='string'&&path.isAbsolute(pin.path)&&hash(pin.sha256)&&Number.isSafeInteger(pin.bytes)&&pin.bytes>0,'UPDATE_RECLAIM_PIN');const r=read(pin.path,limit);need(r.sha256===pin.sha256&&r.bytes.length===pin.bytes,'UPDATE_RECLAIM_PIN');return r;}
const millis=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))?Date.parse(v):NaN;
const canonical=v=>fs.realpathSync.native(v);
function validate(root,options,admission=null){
  need(keys(options,['proofPath','proofSHA256'])&&path.isAbsolute(options.proofPath)&&hash(options.proofSHA256),'UPDATE_RECLAIM_OPTIONS');
  const project=rootPath(root),pr=read(options.proofPath,131072);need(pr.sha256===options.proofSHA256,'UPDATE_RECLAIM_PROOF_PIN');const p=pr.value;
  need(keys(p,['format','targetRoot','transactionId','leaseId','ownerPid','ownerCreatedFileTime','lease','pointer','firstEvent','supervisor','freshIdle','approval'])&&p.format==='PROCESS_OS_LOCAL_STORAGE_LEASE_RECLAIM_PROOF_V1'&&samePath(p.targetRoot,project)&&uuid(p.transactionId)&&uuid(p.leaseId)&&Number.isSafeInteger(p.ownerPid)&&p.ownerPid>0&&/^\d{16,20}$/.test(p.ownerCreatedFileTime),'UPDATE_RECLAIM_PROOF');
  const control=path.join(project,'.process-update'),transaction=path.join(control,'transactions',p.transactionId);dir(control);dir(path.join(control,'transactions'));dir(transaction);
  const enabled=read(path.join(control,'enable'),1024).value;need(keys(enabled,['format','targetRoot'])&&enabled.format==='PROCESS_OS_OFFLINE_UPDATE_ENABLED_V1'&&samePath(enabled.targetRoot,project),'UPDATE_RECLAIM_ENABLE');
  need(samePath(p.lease.path,path.join(control,'access-lease.json'))&&samePath(p.pointer.path,path.join(control,'transaction.json'))&&samePath(p.firstEvent.path,path.join(transaction,'events','000001.json')),'UPDATE_RECLAIM_BOUNDARY');
  const lease=pinned(p.lease,2048),pointer=pinned(p.pointer,16384),first=pinned(p.firstEvent,16384),sup=pinned(p.supervisor,1048576),idle=pinned(p.freshIdle,131072);const l=lease.value,t=pointer.value,e=first.value;
  need(keys(l,['format','targetRoot','leaseId','purpose','ownerPid','createdAt'])&&l.format==='PROCESS_OS_LOCAL_STORAGE_LEASE_V1'&&samePath(l.targetRoot,project)&&l.leaseId===p.leaseId&&l.purpose==='update'&&l.ownerPid===p.ownerPid,'UPDATE_RECLAIM_LEASE_BINDING');
  need(keys(t,['format','targetRoot','transactionId','transactionDirectory'])&&t.format==='PROCESS_OS_OFFLINE_UPDATE_POINTER_V1'&&samePath(t.targetRoot,project)&&t.transactionId===p.transactionId&&samePath(t.transactionDirectory,transaction),'UPDATE_RECLAIM_TRANSACTION');
  need(keys(e,['format','transactionId','targetRoot','sequence','previousHash','phase','data'])&&e.format==='PROCESS_OS_OFFLINE_UPDATE_EVENT_V1'&&e.transactionId===p.transactionId&&samePath(e.targetRoot,project)&&e.sequence===1&&e.previousHash===null&&e.phase==='PREPARED'&&obj(e.data)&&keys(e.data.storageLease,['leaseId','sha256','ownerPid'])&&e.data.storageLease.leaseId===p.leaseId&&e.data.storageLease.sha256===p.lease.sha256&&e.data.storageLease.ownerPid===p.ownerPid,'UPDATE_RECLAIM_TRANSACTION_LEASE');
  // Complete terminal orphan: prove the existing completion and active baseline,
  // then reclaim only the access mutex. Never roll back or rewrite completion.
  const names=fs.readdirSync(path.join(transaction,'events')).sort();need(names.length>0&&names.length<=64&&names.every((n,i)=>n===String(i+1).padStart(6,'0')+'.json'),'UPDATE_RECLAIM_EVENTS');
  const next={PREPARED:['BACKED_UP','ROLLING_BACK','HOLD'],BACKED_UP:['STAGED','ROLLING_BACK','HOLD'],STAGED:['OLD_MOVED','ROLLING_BACK','HOLD'],OLD_MOVED:['NEW_ACTIVE','ROLLING_BACK','HOLD'],NEW_ACTIVE:['VERIFIED','ROLLING_BACK','HOLD'],VERIFIED:['COMMITTED','ROLLING_BACK','HOLD'],ROLLING_BACK:['RECOVERED','HOLD'],HOLD:['ROLLING_BACK'],COMMITTED:[],RECOVERED:[]};let phase=null,previous=null;
  for(let n=0;n<names.length;n++){const ev=read(path.join(transaction,'events',names[n])),v=ev.value;need(keys(v,['format','transactionId','targetRoot','sequence','previousHash','phase','data'])&&v.format==='PROCESS_OS_OFFLINE_UPDATE_EVENT_V1'&&v.transactionId===p.transactionId&&samePath(v.targetRoot,project)&&v.sequence===n+1&&v.previousHash===previous&&obj(v.data)&&(n===0?v.phase==='PREPARED':next[phase]?.includes(v.phase)),'UPDATE_RECLAIM_EVENTS');phase=v.phase;previous=ev.sha256;}
  const terminalPhase=['COMMITTED','RECOVERED'].includes(phase)?phase:null;
  let terminalPins=null;
  if(terminalPhase){
    terminalPins={completion:read(path.join(transaction,'completion.json')).sha256,installed:read(path.join(project,'.wrangler/local-only/installed-package.json'),2097152).sha256};
    if(admission){need(admission.terminalPhase===terminalPhase&&admission.terminalPins?.completion===terminalPins.completion&&admission.terminalPins?.installed===terminalPins.installed&&!st(path.join(control,'lock'))&&same(st(admission.claim.file),admission.claim.identity)&&same(fs.fstatSync(admission.claim.fd,{bigint:true}),admission.claim.identity)&&read(admission.claim.file,2048).sha256===sha(admission.claim.bytes),'UPDATE_RECLAIM_TERMINAL_CHANGED');}
    else{const terminal=assertNoIncompleteUpdate(project);need(terminal?.transactionId===p.transactionId&&terminal.phase===terminalPhase,'UPDATE_RECLAIM_TERMINAL');}
  }
  else{need(!st(path.join(transaction,'completion.json')),'UPDATE_RECLAIM_TERMINAL');const lock=read(path.join(control,'lock')).value;need(keys(lock,['format','transactionId','targetRoot'])&&lock.format==='PROCESS_OS_OFFLINE_UPDATE_LOCK_V1'&&lock.transactionId===p.transactionId&&samePath(lock.targetRoot,project),'UPDATE_RECLAIM_LOCK');}
  const s=sup.value,r=s?.supervisor;need(s.format==='I1_OWNED_SUPERVISOR_ACTUAL_V1'&&s.mode==='update'&&samePath(canonical(s.root),project)&&obj(r),'UPDATE_RECLAIM_SUPERVISOR');
  for(const k of ['JobConfigured','AssignedBeforeResume','MembershipVerified','ResumeSucceeded','RootExitObserved','ActiveZeroObserved','JobPidListEmpty','CompleteBuildNodeLedger','CompleteOwnedLedger','AllMemberExitsObserved','JobClosed','AllProcessHandlesClosed','CompletionPortClosed','StdHandlesClosed','NoBreakawayFlags','KillOnJobClose','OfficialImageLeasesVerifiedBeforeResume','OfficialImageLeasesHeldThroughJobClose','OfficialImageLeasesClosed'])need(r[k]===true,'UPDATE_RECLAIM_JOB_INCOMPLETE');
  need(r.ActiveProcesses===0&&r.UnrelatedProcessesStopped===0&&r.RejectedOwnedPid===0&&Array.isArray(r.Members)&&r.Members.length>0&&r.Members.length<=64&&r.TotalProcesses===r.Members.length&&new Set(r.Members.map(m=>m.Pid)).size===r.Members.length,'UPDATE_RECLAIM_LEDGER');
  need(r.Members.every(m=>Number.isSafeInteger(m.Pid)&&m.Pid>0&&/^\d{16,20}$/.test(m.CreatedFileTime)&&m.ExitObserved===true&&m.JobMembershipVerified===true&&m.ImageHashVerified===true&&Number.isSafeInteger(m.ExitCode)&&typeof m.Image==='string'&&path.isAbsolute(m.Image)&&['node','consoleHost','commandShell','workerd','esbuild'].includes(m.Kind)),'UPDATE_RECLAIM_LEDGER');
  const member=r.Members.find(m=>m.Pid===p.ownerPid);need(member===r.Members[0]&&member?.Kind==='node'&&member.CreatedFileTime===p.ownerCreatedFileTime&&Array.isArray(r.Events)&&r.Events.some(v=>v.Event==='created-suspended'&&v.Pid===p.ownerPid),'UPDATE_RECLAIM_OWNER');
  const start=millis(s.startedAt),finish=millis(s.finishedAt),created=millis(l.createdAt),ownerStart=Number((BigInt(p.ownerCreatedFileTime)-116444736000000000n)/10000n);need(Number.isFinite(start)&&Number.isFinite(finish)&&finish>=start&&created>=start&&created<=finish&&ownerStart<=created&&ownerStart>=start-5000,'UPDATE_RECLAIM_OWNER_TIME');
  const i=idle.value,a=p.approval,now=Date.now();need(keys(i,['format','targetRoot','transactionId','leaseId','supervisorSHA256','observedAt','expiresAt','querySucceeded','processes','nativeImages','ports'])&&i.format==='PROCESS_OS_UPDATE_SCOPED_IDLE_V1'&&samePath(i.targetRoot,project)&&i.transactionId===p.transactionId&&i.leaseId===p.leaseId&&i.supervisorSHA256===p.supervisor.sha256&&i.querySucceeded===true,'UPDATE_RECLAIM_IDLE');
  const observed=millis(i.observedAt),expires=millis(i.expiresAt);need(observed>=finish&&observed<=now&&expires>now&&expires>observed&&expires-observed<=1800000,'UPDATE_RECLAIM_IDLE_EXPIRED');
  need(Array.isArray(i.processes)&&i.processes.length===r.Members.length&&new Set(i.processes.map(v=>v.pid)).size===i.processes.length&&i.processes.every(v=>keys(v,['pid','createdFileTime','querySucceeded','absent'])&&v.querySucceeded===true&&v.absent===true&&r.Members.some(m=>m.Pid===v.pid&&m.CreatedFileTime===v.createdFileTime)),'UPDATE_RECLAIM_IDLE_MEMBERS');
  const natives=[...new Set(r.Members.filter(m=>['workerd','esbuild'].includes(m.Kind)).map(m=>path.resolve(m.Image).toLowerCase()))];need(Array.isArray(i.nativeImages)&&i.nativeImages.length===natives.length&&new Set(i.nativeImages.map(v=>path.resolve(v.path).toLowerCase())).size===i.nativeImages.length&&i.nativeImages.every(v=>keys(v,['path','querySucceeded','matchingPids'])&&natives.includes(path.resolve(v.path).toLowerCase())&&v.querySucceeded===true&&Array.isArray(v.matchingPids)&&v.matchingPids.length===0),'UPDATE_RECLAIM_IDLE_NATIVE');
  need(keys(a,['format','targetRoot','transactionId','leaseSHA256','leaseId','ownerPid','ownerCreatedFileTime','supervisorSHA256','freshIdleSHA256','expectedPorts','approvedAt','expiresAt'])&&a.format==='PROCESS_OS_ROOT_SCOPED_LEASE_RECLAIM_APPROVAL_V1'&&samePath(a.targetRoot,project)&&a.transactionId===p.transactionId&&a.leaseSHA256===p.lease.sha256&&a.leaseId===p.leaseId&&a.ownerPid===p.ownerPid&&a.ownerCreatedFileTime===p.ownerCreatedFileTime&&a.supervisorSHA256===p.supervisor.sha256&&a.freshIdleSHA256===p.freshIdle.sha256&&millis(a.approvedAt)>=observed&&millis(a.approvedAt)<=now&&millis(a.expiresAt)>now&&millis(a.expiresAt)<=expires,'UPDATE_RECLAIM_APPROVAL');
  need(Array.isArray(a.expectedPorts)&&a.expectedPorts.length>0&&a.expectedPorts.length<=64&&a.expectedPorts.every(v=>Number.isInteger(v)&&v>0&&v<=65535)&&new Set(a.expectedPorts).size===a.expectedPorts.length&&Array.isArray(i.ports)&&i.ports.length===a.expectedPorts.length&&new Set(i.ports.map(v=>v.port)).size===i.ports.length&&i.ports.every(v=>keys(v,['port','querySucceeded','listeners'])&&a.expectedPorts.includes(v.port)&&v.querySucceeded===true&&Array.isArray(v.listeners)&&v.listeners.length===0),'UPDATE_RECLAIM_IDLE_PORTS');
  return{project,control,transaction,proof:pr,lease,pointer,first,supervisor:sup,idle,p,terminalPhase,terminalPins};
}

// Pure read-only parser is independently callable; a PASS here does not reclaim.
export function validateLocalStorageLeaseRecoveryProof(root,options){try{const v=validate(root,options);return Object.freeze({targetRoot:v.project,transactionId:v.p.transactionId,leaseId:v.p.leaseId,ownerPid:v.p.ownerPid,proofSHA256:v.proof.sha256,terminalPhase:v.terminalPhase});}catch(e){if(e instanceof LocalUpdateBlockedError)throw e;throw new LocalUpdateBlockedError('UPDATE_RECLAIM_UNREADABLE');}}

export function reclaimLocalStorageLease(root,options){
  let claim=null;
  try{
    let v=validate(root,options);const file=path.join(v.control,'lease-reclaim.lock'),nonce=crypto.randomUUID();const bytes=Buffer.from(JSON.stringify({format:'PROCESS_OS_LEASE_RECLAIM_MUTEX_V1',targetRoot:v.project,nonce,ownerPid:process.pid})+'\n');
    let fd;try{fd=fs.openSync(file,'wx+',0o600);}catch(e){if(e.code==='EEXIST')throw new LocalUpdateBlockedError('UPDATE_RECLAIM_BUSY');throw e;}
    claim={file,fd,bytes};fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);claim.identity=st(file);
    // Revalidate exact original proof/lease after exclusive reclaimer admission.
    // Terminal guard was checked before our own admission lock. After admission,
    // only this private context may compare its unchanged completion+active pins;
    // ordinary guard always refuses lease-reclaim.lock and has no bypass API.
    v=validate(root,options,v.terminalPhase?{claim,terminalPhase:v.terminalPhase,terminalPins:v.terminalPins}:null);const retainedDir=path.join(v.transaction,'retained-leases');if(!st(retainedDir))fs.mkdirSync(retainedDir);dir(retainedDir);
    const retained=path.join(retainedDir,v.p.leaseId+'.json');need(!st(retained),'UPDATE_RECLAIM_ALREADY_RETAINED');need(same(v.lease.identity,st(v.lease.path))&&read(v.lease.path,2048).sha256===v.lease.sha256,'UPDATE_RECLAIM_CHANGED');
    fs.renameSync(v.lease.path,retained);need(read(retained,2048).sha256===v.lease.sha256&&!st(v.lease.path),'UPDATE_RECLAIM_RETAIN_FAILED');
    // Drop only this still-owned admission mutex. Ordinary access reacquires
    // atomically; if a competing updater wins, this call safely returns BUSY.
    const before=st(file);need(same(before,claim.identity)&&read(file,2048).sha256===sha(bytes)&&same(fs.fstatSync(fd,{bigint:true}),claim.identity),'UPDATE_RECLAIM_MUTEX_CHANGED');fs.unlinkSync(file);fs.closeSync(fd);claim=null;
    const lease=acquireLocalStorageLease(v.project,{purpose:'update'});
    return Object.freeze({lease,transactionId:v.p.transactionId,retainedLease:Object.freeze({path:retained,sha256:v.lease.sha256,bytes:v.lease.bytes.length}),proofSHA256:v.proof.sha256,terminalPhase:v.terminalPhase});
  }catch(e){if(e instanceof LocalUpdateBlockedError)throw e;throw new LocalUpdateBlockedError('UPDATE_RECLAIM_UNREADABLE');}
  finally{if(claim){try{if(claim.identity&&same(st(claim.file),claim.identity)&&read(claim.file,2048).sha256===sha(claim.bytes))fs.unlinkSync(claim.file);}finally{fs.closeSync(claim.fd);}}}
}
