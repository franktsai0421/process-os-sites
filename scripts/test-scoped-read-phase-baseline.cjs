// Exact-source tests only: no routes, credentials, employee data or network.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{execFileSync}=require('node:child_process');
const phase=require('./scoped-read-permission-source-contract.cjs'),scope=require('./scoped-workflow-read-source-contract.cjs');
const integration=require('./scoped-fqc-integration-source-contract.cjs');
const {materialize,verifySnapshot,snapshotSha256}=require('./scoped-read-phase-baseline.cjs');
const root=path.resolve(__dirname,'..'),temporary=fs.mkdtempSync(path.join(os.tmpdir(),'scoped-source-baseline-'));
let negatives=0;const rejected=fn=>{assert.throws(fn);negatives++;};
try{
 for(const file of integration.integrationSourcePaths){const bytes=fs.readFileSync(path.join(root,file));negatives+=integration.assertIntegratedSourceContract(file,bytes);assert.deepEqual(integration.withoutSlowWebIntegration(file,bytes),execFileSync('git',['show','848be13da54c7ae747bcdd96df19e01129fe980a:'+file],{cwd:root}),'Current public main exact projection');}
 for(const file of phase.phaseSourcePaths){const current=fs.readFileSync(path.join(root,file)),bytes=integration.integrationSourcePaths.includes(file)?integration.withoutFqcIntegration(file,current):current;negatives+=phase.assertScopedReadPermissionPhaseContract(file,bytes);}
 const file='app/api/ipqc-c/workflow/route.ts',current=fs.readFileSync(path.join(root,file)),closed=phase.withoutScopedReadPermissionPhase(file,current);
 negatives+=scope.assertScopedWorkflowReadScopeContract(closed);
 assert.deepEqual(scope.withoutScopedWorkflowReadScope(closed),execFileSync('git',['show','268a8e49ec751bb6849033e20a27d30194aad67c:'+file],{cwd:root}),'Public main exact baseline');
 const destination=path.join(temporary,'baseline'),proof=materialize(root,destination);assert.equal(proof.kind,'baseline-bytes');assert.equal(proof.snapshotSha256,snapshotSha256);assert.equal(Object.keys(proof.files).length,45);assert(!fs.existsSync(path.join(destination,'.git')));
 rejected(()=>materialize(root,destination));
 const first=Object.keys(proof.files)[0],target=path.join(destination,first),original=fs.readFileSync(target);
 fs.unlinkSync(target);rejected(()=>verifySnapshot(destination));fs.writeFileSync(target,original);
 const changed=Buffer.from(original);changed[0]^=1;fs.writeFileSync(target,changed);rejected(()=>verifySnapshot(destination));fs.writeFileSync(target,original);
 fs.appendFileSync(target,' ');rejected(()=>verifySnapshot(destination));fs.writeFileSync(target,original);
 const extra=path.join(destination,'unexpected.ts');fs.writeFileSync(extra,'export {};');rejected(()=>verifySnapshot(destination));fs.unlinkSync(extra);
 const link=path.join(destination,'linked');fs.symlinkSync(path.join(destination,'lib'),link,'junction');rejected(()=>verifySnapshot(destination));fs.unlinkSync(link);
 assert.deepEqual(verifySnapshot(destination),proof);
 console.log(JSON.stringify({status:'PASS_EXACT_SCOPED_BASELINE_BYTES',snapshotSha256,sourceFiles:45,exactSpanNegatives:134,snapshotNegatives:negatives-134,publicBaselineCommit:'268a8e49ec751bb6849033e20a27d30194aad67c',localCheckpointIsNotPublicAncestry:true}));
}finally{fs.rmSync(temporary,{recursive:true,force:true});}
