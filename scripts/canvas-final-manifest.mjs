import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import childProcess from 'node:child_process';

// Keep the public CJS entry synchronous. Read mutable dependencies on every invocation.
export function run(localEvidencePaths){
const {spawnSync}=childProcess;const root=localEvidencePaths.configuredPath('PROCESS_CANVAS_EVIDENCE_ROOT',"/");const existing=JSON.parse(fs.readFileSync(root+'task-files.json','utf8')).map(x=>x.file),extra=['AI_CONTEXT/DATA_MODEL.md','docs/ipqc-reference/20261008-canvas-local.md',...fs.readdirSync('scripts').filter(f=>f.startsWith('test-canvas-')||f.startsWith('canvas-')||['prepare-canvas-fixture.cjs','check-canvas-content.cjs'].includes(f)).map(f=>'scripts/'+f)],files=[...new Set([...existing,...extra])];let diff='';const manifest=files.map(file=>{const bytes=fs.readFileSync(file),before=path.join(root,'before',file);if(fs.existsSync(before)){const result=spawnSync('git',['diff','--no-index','--',before,file],{encoding:'utf8'});if(result.error||result.signal||![0,1].includes(result.status)||typeof result.stdout!=='string'||(result.status===1&&result.stdout.length===0))throw Error('Canvas diff failed; original evidence retained');diff+=result.stdout;}else diff+='\nNEW FILE '+file+'\n'+bytes;return{file,sha256:crypto.createHash('sha256').update(bytes).digest('hex')};});writeReports([[root+'task-files.json',JSON.stringify(manifest,null,2)],[root+'task.diff',diff]]);console.log('Task manifest: '+manifest.length+' files');

// Single-writer report publication with caught-error recovery; not a power-loss transaction.
function writeReports(reports){
  const stamp=crypto.randomUUID(),lock=root+'.canvas-reports.lock';
  const entries=reports.map(([file,data])=>({file,data,temp:file+'.'+stamp+'.tmp',backup:file+'.'+stamp+'.bak',hadOriginal:false,backedUp:false,published:false,staged:false,mode:0o600}));
  let locked=false;
  try{
    const handle=fs.openSync(lock,'wx',0o600);locked=true;fs.closeSync(handle);
    for(const item of entries){
      let stat;try{stat=fs.lstatSync(item.file);}catch(error){if(error.code!=='ENOENT')throw error;}
      item.hadOriginal=!!stat;
      if(stat){if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1)throw Error('Report output must be an unlinked regular file');item.mode=stat.mode&0o777;}
      if(fs.existsSync(item.backup))throw Error('Report recovery path already exists');
    }
    for(const item of entries){const handle=fs.openSync(item.temp,'wx',item.mode);item.staged=true;try{fs.writeFileSync(handle,item.data);}finally{fs.closeSync(handle);}}
    for(const item of entries){
      if(item.hadOriginal){fs.renameSync(item.file,item.backup);item.backedUp=true;}
      fs.renameSync(item.temp,item.file);item.staged=false;item.published=true;
    }
  }catch{
    let recovered=true;
    for(const item of [...entries].reverse()){
      if(item.published)try{fs.unlinkSync(item.file);}catch{recovered=false;}
      if(item.backedUp)try{fs.renameSync(item.backup,item.file);item.backedUp=false;}catch{recovered=false;}
    }
    for(const item of entries)if(item.staged)try{fs.unlinkSync(item.temp);item.staged=false;}catch{recovered=false;}
    if(locked&&recovered)try{fs.unlinkSync(lock);locked=false;}catch{recovered=false;}
    throw Error(recovered?'Canvas report publication failed; previous evidence preserved':'Canvas report publication failed; recovery incomplete, inspect evidence directory');
  }
  let cleanupWarning=false;
  for(const item of entries)if(item.backedUp)try{fs.unlinkSync(item.backup);}catch{cleanupWarning=true;}
  if(locked)try{fs.unlinkSync(lock);}catch{cleanupWarning=true;}
  if(cleanupWarning)console.warn('Canvas reports published; recovery cleanup incomplete');
}

}
