import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {assertNoIncompleteUpdate, LocalUpdateBlockedError} from './local-update-guard.mjs';

// No filesystem operation at module import. A normal lease is mandatory for
// update-enabled targets and must outlive the SDK/SQLite/server it protects.
// This mutex never authorizes recovery and never reclaims a stale owner.
const owned = new Map();
const fields = ['dev','ino','size','nlink','mtimeNs','ctimeNs'];
const same = (a,b) => fields.every(k => a[k] === b[k]);
const fail = reason => { throw new LocalUpdateBlockedError(reason); };
const need = (value,reason) => { if (!value) fail(reason); };
const digest = b => crypto.createHash('sha256').update(b).digest('hex');
function stat(file) { try { return fs.lstatSync(file,{bigint:true}); } catch(e) { if(e.code==='ENOENT')return null; throw e; } }
function samePath(a,b) { return typeof a==='string' && (process.platform==='win32' ? path.resolve(a).toLowerCase()===path.resolve(b).toLowerCase() : path.resolve(a)===path.resolve(b)); }
function directory(file) { const s=stat(file);need(s?.isDirectory()&&!s.isSymbolicLink()&&samePath(fs.realpathSync.native(file),file),'UPDATE_LEASE_PATH'); }
function rootPath(root) {
  const s=stat(root);need(typeof root==='string'&&s?.isDirectory()&&!s.isSymbolicLink(),'UPDATE_LEASE_ROOT');
  for(let p=path.resolve(root);;p=path.dirname(p)){need(path.basename(p).toLowerCase()!=='.u1s','UPDATE_RECOVERY_NAMESPACE');if(path.dirname(p)===p)break;}
  const physical=fs.realpathSync.native(root);
  for(let p=physical;;p=path.dirname(p)){need(!['.process-update','.u1s'].includes(path.basename(p).toLowerCase()),'UPDATE_RECOVERY_NAMESPACE');directory(p);if(path.dirname(p)===p)break;}
  return physical;
}
function enable(root) {
  const control=path.join(root,'.process-update'),file=path.join(control,'enable');
  if(!stat(control))return false;
  directory(control);const s=stat(file);if(!s)return false;
  need(s.isFile()&&!s.isSymbolicLink()&&s.nlink===1n&&s.size>0n&&s.size<=1024n&&samePath(fs.realpathSync.native(file),file),'UPDATE_ENABLE_INVALID');
  const fd=fs.openSync(file,'r');let raw;
  try{const opened=fs.fstatSync(fd,{bigint:true});need(same(s,opened),'UPDATE_ENABLE_CHANGED');const b=Buffer.alloc(1025);let n=0;
    while(n<b.length){const count=fs.readSync(fd,b,n,b.length-n,n);if(!count)break;n+=count;}
    need(BigInt(n)===s.size&&same(opened,fs.fstatSync(fd,{bigint:true}))&&same(s,stat(file)),'UPDATE_ENABLE_CHANGED');raw=b.subarray(0,n);
  }finally{fs.closeSync(fd);}const v=JSON.parse(raw);
  need(v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join('|')==='format|targetRoot'&&v.format==='PROCESS_OS_OFFLINE_UPDATE_ENABLED_V1'&&samePath(v.targetRoot,root),'UPDATE_ENABLE_INVALID');
  return true;
}
function assertOwned(e) {
  const p=stat(e.file),f=fs.fstatSync(e.fd,{bigint:true});
  need(p?.isFile()&&!p.isSymbolicLink()&&p.nlink===1n&&same(p,e.pathIdentity)&&same(f,e.fdIdentity),'UPDATE_LEASE_OWNER_CHANGED');
  const bytes=Buffer.alloc(e.bytes.length+1),n=fs.readSync(e.fd,bytes,0,bytes.length,0);
  need(n===e.bytes.length&&digest(bytes.subarray(0,n))===e.sha&&same(f,fs.fstatSync(e.fd,{bigint:true}))&&same(p,stat(e.file)),'UPDATE_LEASE_OWNER_CHANGED');
}
function ticket(e,key) {
  let released=false;
  return Object.freeze({enabled:true,purpose:e.purpose,leaseId:e.id,ownerPid:process.pid,leaseFile:e.file,root:e.root,
    release(){if(released)return false;need(owned.get(key)===e,'UPDATE_LEASE_OWNER_CHANGED');assertOwned(e);e.refs--;
      if(e.refs===0){try{fs.unlinkSync(e.file);}finally{fs.closeSync(e.fd);owned.delete(key);}}
      released=true;return true;
    }});
}
export function acquireLocalStorageLease(root, options={purpose:'normal'}) {
  let created=null,key;
  try {
    need(options&&typeof options==='object'&&!Array.isArray(options)&&Object.keys(options).join() === 'purpose'&&['normal','update'].includes(options.purpose),'UPDATE_LEASE_OPTIONS');
    const project=rootPath(root);key=process.platform==='win32'?project.toLowerCase():project;
    if(!enable(project)) {
      need(options.purpose==='normal','UPDATE_LEASE_ENABLE_REQUIRED');assertNoIncompleteUpdate(project);
      let released=false;return Object.freeze({enabled:false,purpose:'normal',root:project,release(){if(released)return false;released=true;return true;}});
    }
    need(!stat(path.join(project,'.process-update','lease-reclaim.lock')),'UPDATE_RECLAIM_PRESENT');
    const prior=owned.get(key);
    if(prior){need(prior.purpose==='normal'&&options.purpose==='normal','UPDATE_ACCESS_BUSY');assertOwned(prior);assertNoIncompleteUpdate(project);prior.refs++;return ticket(prior,key);}
    const file=path.join(project,'.process-update','access-lease.json'),id=crypto.randomUUID();
    const bytes=Buffer.from(JSON.stringify({format:'PROCESS_OS_LOCAL_STORAGE_LEASE_V1',targetRoot:project,leaseId:id,purpose:options.purpose,ownerPid:process.pid,createdAt:new Date().toISOString()})+'\n');
    let fd;try{fd=fs.openSync(file,'wx+',0o600);}catch(e){if(e.code==='EEXIST')fail('UPDATE_ACCESS_BUSY');throw e;}
    created={file,fd,id,bytes,sha:digest(bytes),purpose:options.purpose,root:project,refs:1};
    try{fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);created.fdIdentity=fs.fstatSync(fd,{bigint:true});created.pathIdentity=stat(file);assertOwned(created);owned.set(key,created);
      need(!stat(path.join(project,'.process-update','lease-reclaim.lock')),'UPDATE_RECLAIM_PRESENT');
      if(options.purpose==='normal')assertNoIncompleteUpdate(project);
      return ticket(created,key);
    }catch(e){
      // Remove only this still-owned ephemeral mutex, never a transaction lock,
      // old failure, backup or somebody else's changed lease.
      try{if(created.fdIdentity&&created.pathIdentity){assertOwned(created);fs.unlinkSync(file);}}finally{fs.closeSync(fd);owned.delete(key);}
      created=null;throw e;
    }
  }catch(e){if(e instanceof LocalUpdateBlockedError)throw e;fail('UPDATE_LEASE_UNREADABLE');}
}
