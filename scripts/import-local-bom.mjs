// Local-only BOM transaction coordinator. Input is a reviewed, immutable plan.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {assertDevStopped,openLocalData,readLocalState,createLocalBackup,restoreLocalBackup} from '../lib/local-data.mjs';
import {encodeLocalValues} from '../lib/local-snapshot.mjs';
import {readPackage,writePackage,stable,sha256,serialize,materialize} from '../lib/canonical-data.mjs';
import {project,recordBase} from '../lib/data-collaboration.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const hash=value=>sha256(JSON.stringify(stable(value)));
const allowed=['data/canonical/bom.json','data/canonical/parts.json','data/canonical/manifest.json'];
function restoreFiles(folder){
 const meta=JSON.parse(fs.readFileSync(path.join(folder,'bom-rollback.json')));
 for(const r of meta.files){const file=path.resolve(root,r.path);assert.ok(file.startsWith(root+path.sep));const saved=path.join(folder,'project-files',r.path);assert.equal(sha256(fs.readFileSync(saved)),r.sha256);fs.copyFileSync(saved,file);}
 restoreLocalBackup(root,folder);
}
if(process.argv[2]==='rollback'){
 assertDevStopped(root);restoreFiles(path.resolve(process.argv[3]));console.log('PASS: original Local and Canonical restored');
}else{
 assert.equal(process.argv[2],'apply','Usage: node scripts/import-local-bom.mjs apply <reviewed-plan.json>');
 assertDevStopped(root);
 const branch=execFileSync('git',['branch','--show-current'],{cwd:root,encoding:'utf8'}).trim();
 assert.ok(branch.startsWith('codex/')&&branch!=='main','BOM update requires a codex work branch');
 const lock=path.join(root,'.wrangler/local-only/data-operation.lock');fs.mkdirSync(lock);
 let context,backup,written=false;
 try{
  const plan=JSON.parse(fs.readFileSync(path.resolve(process.argv[3]))),pkg=readPackage(root);
  assert.equal(plan.bom['106BX03'][4].itemCode,'3050921','Retain Excel row 2691 at its original preorder position');
  assert.equal(plan.bom['106BX03'][4].quantity,'1');
  assert.equal(plan.bom['106BX03'].filter(r=>r.itemCode==='3050921').length,1,'Exclude row 2697 without adding quantity');
  context=await openLocalData(root);const original=await readLocalState(context);
  assert.equal(original.row.revision,plan.expectedRevision);assert.equal(sha256(original.values.bomOverrides),plan.oldBomSha256);
  const values={...original.values,bomOverrides:JSON.stringify(plan.bom)};
  const projected=project(root,values,pkg.domains),domains={...pkg.domains,parts:projected.parts,bom:projected.bom};
  // The existing order-based Canonical IDs need explicit deletion records.
  for(const name of ['parts','bom']){
   const live=new Set(domains[name].map(r=>r.id));
   for(const r of pkg.domains[name])if(!live.has(r.id))domains[name].push({...r,deletedAt:r.deletedAt||new Date().toISOString()});
   domains[name].sort((a,b)=>a.id.localeCompare(b.id,'en'));
  }
  assert.equal(hash(project(root,values,domains)),hash(domains),'Unrelated Local Canonical changes must be reconciled first');
  await context.proxy.dispose();context=undefined;
  backup=createLocalBackup(root);
  const files=[];
  for(const relative of [...allowed,'scripts/import-local-bom.mjs','AI_CONTEXT/AI_CONTEXT.md','AI_CONTEXT/CHANGELOG.md']){
   const source=path.join(root,relative),target=path.join(backup,'project-files',relative);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(source,target);files.push({path:relative,sha256:sha256(fs.readFileSync(source))});
  }
  fs.writeFileSync(path.join(backup,'bom-rollback.json'),serialize({files,sourceSha256:plan.sourceSha256,before:plan.summary}));
  const stage=path.join(backup,'staged-package');fs.cpSync(path.join(root,'data/canonical'),path.join(stage,'data/canonical'),{recursive:true});
  writePackage(stage,domains,{previousManifest:pkg.manifest});const staged=readPackage(stage);
  for(const [name,fileHash]of Object.entries(staged.manifest.files))if(!['bom.json','parts.json'].includes(name))assert.equal(fileHash,pkg.manifest.files[name]);
  async function write(){
   context=await openLocalData(root);const state=await readLocalState(context);
   assert.equal(sha256(state.values.bomOverrides),plan.oldBomSha256);assert.equal(state.row.revision,plan.expectedRevision);
   const encoded=await encodeLocalValues(context.bucket,values,{forceR2:state.storage==='LOCAL_R2'});
   const statement=()=>context.db.prepare('UPDATE shared_state SET revision=?,"values"=?,updated_at=? WHERE id=1 AND revision=? AND "values"=?').bind(state.row.revision+1,encoded,new Date().toISOString(),state.row.revision,state.row.values);
   // Prove D1 batch rollback using a failure after the tentative update.
   await assert.rejects(context.db.batch([statement(),context.db.prepare('UPDATE __bom_intentionally_missing_table SET id=1')]));
   const failed=await readLocalState(context);assert.equal(failed.row.values,state.row.values);assert.equal(failed.row.revision,state.row.revision);
   written=true;const result=await context.db.batch([statement()]);assert.equal(result[0].meta.changes,1,'Revision conflict');
   for(const relative of allowed){const target=path.join(root,relative),temp=target+'.bom-transaction.tmp';fs.copyFileSync(path.join(stage,relative),temp);fs.renameSync(temp,target);}
   recordBase(root,staged);
   const current=await readLocalState(context);assert.equal(hash(JSON.parse(current.values.bomOverrides)),hash(plan.bom));
   for(const [key,raw]of Object.entries(original.values))if(key!=='bomOverrides')assert.equal(current.values[key],raw,'Unrelated state changed');
   assert.equal(hash(project(root,current.values,readPackage(root).domains)),hash(readPackage(root).domains));
   assert.equal(hash(JSON.parse(materialize({},readPackage(root).domains).bomOverrides)),hash(plan.bom));
   await context.proxy.dispose();context=undefined;
  }
  await write();
  // Exercise the executable physical rollback, then reapply the same transaction.
  restoreFiles(backup);context=await openLocalData(root);const restored=await readLocalState(context);
  assert.equal(restored.row.values,original.row.values);assert.equal(restored.row.revision,original.row.revision);assert.equal(readPackage(root).manifest.dataVersion,pkg.manifest.dataVersion);
  await context.proxy.dispose();context=undefined;await write();
  fs.writeFileSync(path.join(root,'outputs/local-bom-20260918/import-result.json'),serialize({status:'imported-awaiting-tests',backup,summary:plan.summary,transactionRollback:'PASS',physicalRollbackAndReapply:'PASS',localCanonical:'PASS',files:allowed}));
  console.log(JSON.stringify({status:'imported-awaiting-tests',backup,summary:plan.summary}));
 }catch(error){
  await context?.proxy.dispose();context=undefined;
  if(written&&backup){restoreFiles(backup);console.error('ROLLED BACK: original Local and Canonical restored');}
  throw error;
 }finally{await context?.proxy.dispose();fs.rmdirSync(lock);}
}
