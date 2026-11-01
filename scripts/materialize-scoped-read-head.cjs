// Normalize only reviewed runtime/oracle checkout EOLs to exact committed bytes.
// Every file is validated before the first write. No reset, data or arbitrary path.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto'),{execFileSync}=require('node:child_process');
const {withoutScopedReadPermissionPhase,phaseSourcePaths}=require('./scoped-read-permission-source-contract.cjs');
const {withoutFqcIntegration,integrationSourcePaths}=require('./scoped-fqc-integration-source-contract.cjs');
const {snapshotSha256}=require('./scoped-read-phase-baseline.cjs');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const oraclePins={
 'tests/scoped-workflow-read.test.mjs':'743ee6e625119e004cafbc837c06630a31b27df505c1dc7b7b9b6caf233571f6',
 'tests/scoped-workflow-read-benchmark.mjs':'af0bb4c474cd5f1669b5b93854fecf32d2097a523cead984aa050f37e743b403',
};
const checkoutBytes=bytes=>Buffer.from([...bytes].filter((value,index)=>value!==13||bytes[index+1]!==10));
function materializeHead(root){
 const definition=fs.readFileSync(path.join(__dirname,'scoped-read-phase-baseline.json'));assert.equal(hash(definition),snapshotSha256,'Manifest changed');
 const manifest=JSON.parse(definition),files=[...Object.keys(manifest.files),...Object.keys(oraclePins)],pending=[];
 for(const file of files){
  assert(!path.isAbsolute(file)&&file.split('/').every(part=>part&&part!=='.'&&part!=='..'),'Unsafe source path');
  let current=root;for(const part of file.split('/')){current=path.join(current,part);assert(!fs.lstatSync(current).isSymbolicLink(),'Source symlink forbidden');}
  const entry=execFileSync('git',['ls-tree','HEAD','--',file],{cwd:root,encoding:'utf8'}).trim(),[metadata,listed]=entry.split('\t');assert.match(metadata,/^100644 blob [0-9a-f]{40}$/,'Tracked regular source required');assert.equal(listed,file);
  const committed=execFileSync('git',['show','HEAD:'+file],{cwd:root,maxBuffer:2*1024*1024}),working=fs.readFileSync(current);
  assert.deepEqual(checkoutBytes(working),checkoutBytes(committed),'Non-EOL working source change: '+file);
  if(oraclePins[file])assert.equal(hash(committed),oraclePins[file],file+' oracle SHA');
  else{const scoped=integrationSourcePaths.includes(file)?withoutFqcIntegration(file,committed):committed,baseline=phaseSourcePaths.includes(file)?withoutScopedReadPermissionPhase(file,scoped):scoped,pin=manifest.files[file];assert.equal(baseline.length,pin.bytes);assert.equal(hash(baseline),pin.sha256,file+' baseline SHA');}
  pending.push([current,committed]);
 }
 for(const [file,bytes] of pending)fs.writeFileSync(file,bytes);
 for(const [file,bytes] of pending)assert.deepEqual(fs.readFileSync(file),bytes,'Exact materialized HEAD bytes');
 return {status:'PASS_EXACT_HEAD_EOL_MATERIALIZATION',files:pending.length,snapshotSha256};
}
module.exports={materializeHead};
if(require.main===module)console.log(JSON.stringify(materializeHead(path.resolve(__dirname,'..'))));
