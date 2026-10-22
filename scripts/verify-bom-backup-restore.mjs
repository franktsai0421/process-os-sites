// Rehearse recovery into a NEW external directory; never replace a live checkout.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {assertPhysicalRecoveryCompatible} from '../lib/local-revocation-recovery.mjs';
const [backupArg,targetArg]=process.argv.slice(2);
if(!backupArg||!targetArg)throw Error('backup and new rehearsal directory required');
const backup=fs.realpathSync(backupArg),target=path.resolve(targetArg),workspace=fs.realpathSync(process.cwd());
if(fs.existsSync(target)||target===workspace||target.startsWith(workspace+path.sep)||target===backup||target.startsWith(backup+path.sep))throw Error('Rehearsal requires a new external directory');
const manifest=JSON.parse(fs.readFileSync(path.join(backup,'manifest.json'))),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
if(manifest.format!=='bom-rebuild-local-before-v1'||manifest.before.sha256!==manifest.after.sha256)throw Error('Unverified source manifest');
const within=(base,relative)=>{if(typeof relative!=='string'||relative.includes('\\')||relative.includes(':')||relative.split('/').some(p=>!p||p==='.'||p==='..'))throw Error('Invalid path');const p=path.resolve(base,relative);if(!p.startsWith(base+path.sep))throw Error('Path escape');return p;};
fs.mkdirSync(target,{recursive:true});let count=0;
for(const entry of manifest.entries){const source=within(backup,entry.path),dest=within(target,entry.path);if(fs.lstatSync(source).isSymbolicLink())throw Error('Linked source');const original=fs.readFileSync(source);if(original.length!==entry.bytes||hash(original)!==entry.sha256)throw Error('Invalid backup entry');fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(source,dest);if(hash(fs.readFileSync(dest))!==entry.sha256)throw Error('Restored hash mismatch');if(dest.endsWith('.sqlite')){const db=new DatabaseSync(dest,{readOnly:true});try{if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw Error('Restored SQLite invalid');}finally{db.close();}}if(++count%300===0)console.log(JSON.stringify({restored:count}));}
assertPhysicalRecoveryCompatible(workspace,target);
const receipt={status:'PASS',type:'separate-copy-physical-restoration',backup,target,revision:manifest.before.revision,files:count,bytes:manifest.entries.reduce((n,e)=>n+e.bytes,0),manifestSha256:hash(fs.readFileSync(path.join(backup,'manifest.json')))};
fs.writeFileSync(path.join(target,'RESTORE-RECEIPT.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));
