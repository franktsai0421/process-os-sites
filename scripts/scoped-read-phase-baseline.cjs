/* Public-source-only, exact inverse reconstruction. No unpublished Git object is
 * required. This directory is baseline bytes, not a Git checkout or ancestor. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const {withoutScopedReadPermissionPhase,phaseSourcePaths}=require('./scoped-read-permission-source-contract.cjs');
const {withoutFqcIntegration,integrationSourcePaths}=require('./scoped-fqc-integration-source-contract.cjs');
const snapshotSha256='a2ec8dae0990c9d84236f5cdca9b819af74a7db749b58f3b26e05828741623e5';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function definition(){const bytes=fs.readFileSync(path.join(__dirname,'scoped-read-phase-baseline.json'));assert.equal(hash(bytes),snapshotSha256,'Baseline manifest changed');return JSON.parse(bytes);}
function inventory(root,prefix=''){
 return fs.readdirSync(path.join(root,prefix),{withFileTypes:true}).flatMap(entry=>{
  const name=prefix?prefix+'/'+entry.name:entry.name;assert(!entry.isSymbolicLink(),'Snapshot symlinks are forbidden');
  return entry.isDirectory()?inventory(root,name):[name];
 }).sort();
}
function verifySnapshot(root){
 const manifest=definition();assert.deepEqual(inventory(root),Object.keys(manifest.files).sort(),'Snapshot file set changed');
 for(const [file,pin] of Object.entries(manifest.files)){const bytes=fs.readFileSync(path.join(root,file));assert.equal(bytes.length,pin.bytes,file+' bytes');assert.equal(hash(bytes),pin.sha256,file+' SHA256');}
 return {kind:'baseline-bytes',originalLocalCheckpoint:manifest.originalLocalCheckpoint,snapshotSha256,files:manifest.files};
}
function materialize(root,destination){
 const manifest=definition();assert(!fs.existsSync(destination),'Baseline destination must not exist');
 const pending=[];
 for(const [file,pin] of Object.entries(manifest.files)){
  const current=fs.readFileSync(path.join(root,file)),scoped=integrationSourcePaths.includes(file)?withoutFqcIntegration(file,current):current,bytes=phaseSourcePaths.includes(file)?withoutScopedReadPermissionPhase(file,scoped):scoped;
  assert.equal(bytes.length,pin.bytes,file+' bytes');assert.equal(hash(bytes),pin.sha256,file+' SHA256');pending.push([file,bytes]);
 }
 fs.mkdirSync(destination,{recursive:true});
 for(const [file,bytes] of pending){const target=path.join(destination,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes,{flag:'wx'});}
 return verifySnapshot(destination);
}
module.exports={materialize,verifySnapshot,snapshotSha256};
if(require.main===module){assert.equal(process.argv.length,3,'Usage: node scripts/scoped-read-phase-baseline.cjs <new destination>');console.log(JSON.stringify(materialize(path.resolve(__dirname,'..'),path.resolve(process.argv[2]))));}
