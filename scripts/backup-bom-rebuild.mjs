// Read-only source snapshot, with consistent SQLite copies and byte-verified blobs.
// Never restores or modifies the source workspace.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
const root=process.cwd(),destination=path.resolve(process.argv[2]||'');
if(!process.argv[2]||destination.startsWith(root+path.sep)||fs.existsSync(destination))throw Error('A new external backup directory is required');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{const p=path.join(dir,e.name);if(e.isSymbolicLink())throw Error('Linked storage refused');return e.isDirectory()?walk(p):[p];});}
const source=path.join(root,'.wrangler/state'),files=walk(source).filter(f=>!/-wal$|-shm$/.test(f));
const dbFile=files.find(f=>f.includes('miniflare-D1DatabaseObject')&&f.endsWith('.sqlite')&&!path.basename(f).includes('metadata'));
if(!dbFile)throw Error('Daily database missing');
function signature(){const db=new DatabaseSync(dbFile,{readOnly:true});try{const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all(),digest=crypto.createHash('sha256');for(const {name} of tables){digest.update(name);for(const row of db.prepare('SELECT * FROM "'+name.replaceAll('"','""')+'"').all())digest.update(JSON.stringify(row));}return {sha256:digest.digest('hex'),revision:db.prepare('SELECT revision FROM shared_state WHERE id=1').get().revision};}finally{db.close();}}
const before=signature(),entries=[];fs.mkdirSync(destination,{recursive:true});
for(const file of [...files,...['session.json','features.json','wrangler.json','canonical-base.json'].map(n=>path.join(root,'.wrangler/local-only',n)).filter(f=>fs.existsSync(f))]){
 const relative=path.relative(root,file),target=path.join(destination,relative);fs.mkdirSync(path.dirname(target),{recursive:true});
 if(file.endsWith('.sqlite')){const db=new DatabaseSync(file,{readOnly:true});try{db.exec("VACUUM INTO '"+target.replaceAll("'","''")+"'");}finally{db.close();}const check=new DatabaseSync(target,{readOnly:true});try{if(check.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw Error('Backup SQLite integrity failed');}finally{check.close();}}
 else fs.copyFileSync(file,target);
 const bytes=fs.readFileSync(target),sha256=hash(bytes);if(!file.endsWith('.sqlite')&&hash(fs.readFileSync(file))!==sha256)throw Error('Backup source changed');
 entries.push({path:relative.replaceAll('\\','/'),bytes:bytes.length,sha256});if(entries.length%250===0)console.log(JSON.stringify({copied:entries.length}));
}
const after=signature();if(before.sha256!==after.sha256)throw Error('Daily data changed during snapshot; backup is not approved for mutation');
fs.writeFileSync(path.join(destination,'manifest.json'),JSON.stringify({format:'bom-rebuild-local-before-v1',root,createdAt:new Date().toISOString(),before,after,entries},null,2),{flag:'wx'});
console.log(JSON.stringify({status:'PASS',destination,revision:before.revision,files:entries.length,bytes:entries.reduce((n,r)=>n+r.bytes,0)}));
