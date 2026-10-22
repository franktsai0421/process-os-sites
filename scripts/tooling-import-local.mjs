// Explicit Local-only importer. Original XLSX was validated by the read-only dry run.
// Never create approvals, modify other modules, or overwrite an existing tooling scope.
import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {isDeepStrictEqual} from 'node:util';
async function main(){
const root=process.cwd(),task=path.join(root,'.wrangler/local-only/tooling-20261006'),staging=path.join(task,'staging'),base='http://127.0.0.1:3030';
const isolation=JSON.parse(fs.readFileSync(path.join(root,'.wrangler/local-only/import-3030-20261006/isolation.json'),'utf8'));
if(isolation.status==='retired')throw Error('RETIRED_ISOLATION_CREATE_NEW_BASELINE');
if(isolation.port!==3030||!isolation.storageIsolated||path.resolve(isolation.sourceRoot)!==path.resolve(root))throw Error('ISOLATION_REQUIRED');
const sha=x=>createHash('sha256').update(x).digest('hex'),read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const report=read(path.join(staging,'dry-run.json')),snapshot=read(path.join(staging,'payload.json'));
if(snapshot.tools.length!==366||snapshot.transfers.length||report.sourceSha256!=='2233ceda38df530749749a2370be7c4513b155b42afd5de3627ecb8158f9b981')throw Error('DRY_RUN_REQUIRED');
const a=await fetch(base+'/api/platform-login',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({demoRole:'admin'})});if(!a.ok)throw Error('LOGIN_FAILED');const cookie=a.headers.get('set-cookie').split(';')[0];
const headers={Cookie:cookie,Origin:base,'Content-Type':'application/json'};
async function api(endpoint,body){const r=await fetch(base+endpoint,{headers,method:body?'POST':'GET',...(body?{body:JSON.stringify(body)}:{})});const value=await r.json();if(!r.ok)throw Error(JSON.stringify({status:r.status,...value}));return value;}
const endpoint='/api/tooling/workflow?caseMetadata=1';let before=await api(endpoint);
if(before.control.workflow?.working.tools.length){const existing=before.control.workflow.working;if(before.control.importSource===report.sourceSha256&&isDeepStrictEqual(existing,snapshot)&&isDeepStrictEqual(before.control.workflow.saved?.content,snapshot)&&!before.control.activeVersionId&&!before.control.workflow.pendingId){console.log(JSON.stringify({status:'ALREADY_IMPORTED_IDENTICAL_NO_WRITE',tools:existing.tools.length,revision:before.revision}));return;}throw Error('EXISTING_TOOLING_CONFLICT_REQUIRES_REVIEW');}
if(!process.argv.includes('--apply')){console.log(JSON.stringify({status:'DRY_RUN_ONLY',port:3030,tools:snapshot.tools.length,source:report.sourceSha256,existing:before.control.versions.length}));return;}
const findDb=directory=>{const files=fs.readdirSync(directory,{recursive:true}).filter(f=>String(f).endsWith('.sqlite')).map(f=>path.join(directory,String(f)));return files.find(file=>{const db=new DatabaseSync(file,{readOnly:true});try{return !!db.prepare("SELECT name FROM sqlite_master WHERE name='shared_state'").get();}finally{db.close();}});};
const originalDb=findDb(path.join(root,'.wrangler/state')),runtimeDb=findDb(path.join(isolation.runtimeRoot,'.wrangler/state')),baselineDb=findDb(path.join(isolation.baselineRoot,'.wrangler/state'));
if(!originalDb||!runtimeDb||!baselineDb||fs.realpathSync(originalDb)===fs.realpathSync(runtimeDb))throw Error('SEPARATE_DATABASE_REQUIRED');
const state=file=>{const db=new DatabaseSync(file,{readOnly:true});try{return db.prepare('SELECT revision,"values",updated_at FROM shared_state WHERE id=1').get();}finally{db.close();}};
const sourceBefore=state(originalDb),runtimeBefore=state(runtimeDb),baseline=state(baselineDb);
if(runtimeBefore.values!==baseline.values)throw Error('RUNTIME_CHANGED_SINCE_FULL_BASELINE_BACKUP');
const backup=path.join(task,'before-import');fs.mkdirSync(backup,{recursive:true});const backupDb=path.join(backup,'shared-state.sqlite');const existingBackup=fs.existsSync(backupDb);
{if(!existingBackup){const db=new DatabaseSync(runtimeDb,{readOnly:true});db.prepare('VACUUM INTO ?').run(backupDb);db.close();}const restored=new DatabaseSync(backupDb,{readOnly:true});if(restored.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw Error('BACKUP_INTEGRITY_FAILED');const row=restored.prepare('SELECT "values" FROM shared_state WHERE id=1').get();if(row.values!==runtimeBefore.values)throw Error('BACKUP_RESTORE_READBACK_FAILED');restored.close();}
if(!existingBackup){
fs.writeFileSync(path.join(backup,'manifest.json'),JSON.stringify({at:new Date().toISOString(),runtimeDb,backupDb,fullR2Baseline:isolation.baselineRoot,sourceRevision:sourceBefore.revision,sourceDigest:sha(sourceBefore.values),runtimeRevision:runtimeBefore.revision,runtimeDigest:sha(runtimeBefore.values),integrity:'ok',restoreReadback:'PASS',toolingAbsent:!JSON.parse(runtimeBefore.values).toolingMasterControl},null,2));
fs.writeFileSync(path.join(backup,'tooling-before.json'),JSON.stringify(before));
}
const media=read(path.join(staging,'media.json')),required=new Set(snapshot.tools.flatMap(t=>t.photos.map(p=>p.id)));let uploaded=0;
for(const id of required){const entry=media.find(m=>m.id===id),bytes=fs.readFileSync(path.join(staging,'media',entry.file));if(sha(bytes)!==id)throw Error('PHOTO_DIGEST_MISMATCH');const r=await fetch(base+'/api/tooling/photo',{method:'PUT',headers:{Cookie:cookie,Origin:base,'Content-Type':entry.mime},body:bytes});const result=await r.json();if(!r.ok||result.id!==id)throw Error('PHOTO_UPLOAD_FAILED '+id);uploaded++;if(uploaded%40===0)console.log('Original photos verified: '+uploaded+'/'+required.size);}
before=await api(endpoint,{action:'begin'});let sequence=0;const clientId='tooling-import-'+randomUUID();
async function command(action,details){const body={command:{action,generation:before.control.workflow.generation,operationId:randomUUID(),clientId,sequence:++sequence,...details}};const log=path.join(task,'import-command-'+sequence+'.json');fs.writeFileSync(log,JSON.stringify(body));const result=await api(endpoint,body);fs.writeFileSync(path.join(task,'import-result-'+sequence+'.json'),JSON.stringify({receipt:result.receipt,revision:result.revision}));before=await api(endpoint);return result;}
await command('apply',{moduleAction:'import-20261006',input:{snapshot}});await command('save',{reason:'Nhập Excel 20261006; chờ duyệt / 匯入新版 Excel，未核准',source:'Excel 20261006 '+report.sourceSha256});
const after=await api(endpoint),actual=after.control.workflow.working;
if(!isDeepStrictEqual(actual,snapshot)||after.control.activeVersionId||after.control.workflow.pendingId||!after.control.workflow.saved)throw Error('IMPORT_READBACK_FAILED');
const sourceAfter=state(originalDb);if(sourceAfter.values!==sourceBefore.values||sourceAfter.revision!==sourceBefore.revision)throw Error('SOURCE_CHECKOUT_DATA_CHANGED');
const current=state(runtimeDb),oldValues=JSON.parse(runtimeBefore.values),newValues=JSON.parse(current.values),changedKeys=[...new Set([...Object.keys(oldValues),...Object.keys(newValues)])].filter(k=>oldValues[k]!==newValues[k]);
// Storage may pack models into R2 references; compare decoded values via production reader in directed acceptance.
const receipt={at:new Date().toISOString(),status:'IMPORTED_UNAPPROVED_SHARED_DRAFT',port:3030,tools:actual.tools.length,photoObjects:required.size,photoReferences:actual.tools.reduce((n,t)=>n+t.photos.length,0),approvedVersionId:null,pendingId:null,savedId:after.control.workflow.saved.id,generation:after.control.workflow.generation,sourceSha256:report.sourceSha256,revision:after.revision,sourceUnchanged:true,backup,changedStorageKeys:changedKeys};fs.writeFileSync(path.join(task,'import-receipt.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));
}
await main();
