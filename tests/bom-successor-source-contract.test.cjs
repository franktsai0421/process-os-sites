/* Standalone BOM byte proof, not full historical-release or browser acceptance. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{execFileSync}=require('node:child_process'),{createHash}=require('node:crypto');
const proof=require('../scripts/bom-successor-source-contract.cjs');
const {withoutAccessEventMetadata}=require('../scripts/access-event-source-contract.cjs');
const {withoutDurableBegin}=require('../scripts/workflow-begin-source-contract.cjs');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const integration=require('../scripts/bom-main-integration-source-contract.cjs');
// Test exact BOM parent projection; current integration has an independent gate.
const readSource=file=>integration.project(proof.canonicalSource(fs.readFileSync(file),execFileSync('git',['show','HEAD:'+file])),file,'bom');
const sources=new Map(proof.attestedPaths.map(file=>[file,readSource(file)]));
const changed=(bytes,from,to)=>{assert(bytes.includes(Buffer.from(from)),'Mutation token must exist: '+from);const result=Buffer.from(bytes.toString().replace(from,to));assert.notDeepEqual(result,bytes);return result;};
const reader=(file,bytes)=>path=>path===file?bytes:sources.get(path);
const historicalPins={
 'lib/versioned-shared-workflow.ts':'d1246a4b451206a4091afbc66e3c066c5f04fa4de0da319e5120b0a339a7f01e',
 'public/process/shared-draft-client.js':'194d0627c909f54a1bbf1c7c328cf9f98d5411234556e08c33538f9e55bf6589',
 'lib/bom-workflow.ts':'03072124ab0b511bd9d5ea7760ba2d4b8144db64a12f590346ca59765390e114',
 'app/api/master/workflow/route.ts':'e59302315b30f2e2bce1d47ea6d6ea4f9d7228babaa0ddfc23267fee90ec2de8'
};
void test('static standalone source scope and independent attestation are exact',()=>{
 assert.equal(proof.manifest.provenance.bomSourceCommit,'6354299922c702c80e7a8a16e4fad03efb48d4d4');
 assert.equal(proof.manifest.provenance.verifiedMainCommit,'dc34874913c417ac5e3194a7e3c3956d971eb0d0');
 assert.deepEqual(proof.successorPaths,Object.keys(historicalPins));
 assert.equal(proof.attestedPaths.length,new Set(proof.attestedPaths).size);
 assert.equal(proof.attestBomSources(file=>sources.get(file)),true);
 assert(Object.isFrozen(proof.manifest)&&Object.isFrozen(proof.contracts)&&Object.isFrozen(proof.contracts[0].rules[0]));
 assert.throws(()=>proof.attestBomSources(null),/source reader/);
});
for(const contract of proof.contracts){
 const {file}=contract,bytes=sources.get(file),prior=proof.withoutBomSuccessor(bytes,file);
 void test('exact BOM/master composition retains complete original historical pin: '+file,()=>{
  assert.equal(hash(bytes),contract.afterHash);assert.equal(hash(prior),contract.beforeHash);
  assert.equal(hash(withoutAccessEventMetadata(prior,file)),historicalPins[file]);
  assert.deepEqual(proof.projectBomSuccessor(bytes,file),prior);
  assert.deepEqual(proof.projectBomSuccessor(prior,file),prior,'predecessor bytes cannot dispatch twice');
  assert.throws(()=>proof.withoutBomSuccessor(prior,file),/differs from pinned bytes/);
  assert.throws(()=>proof.attestBomSources(reader(file,prior)),/Current BOM successor differs/,'old-source rollback must fail separately');
  assert.deepEqual(readSource(file),bytes,'source proof cannot write runtime bytes');
 });
 void test('raw types, path/hash/length and checkout boundaries refuse changes: '+file,()=>{
  for(const value of [bytes.toString(),new Uint8Array(bytes),null]){
   assert.throws(()=>proof.withoutBomSuccessor(value,file),/raw source bytes/);
   assert.throws(()=>proof.projectBomSuccessor(value,file),/raw source bytes/);
   assert.throws(()=>proof.attestBomSources(reader(file,value)),/raw source bytes/);
  }
  assert.throws(()=>proof.withoutBomSuccessor(bytes,'unknown'),/Unknown BOM successor/);
  assert.throws(()=>proof.withoutBomSuccessor(bytes,'app/api/ipqc-c/workflow/route.ts'),/Unknown BOM successor/);
  const wrong=proof.contracts.find(c=>c.file!==file);assert.throws(()=>proof.withoutBomSuccessor(bytes,wrong.file),/differs from pinned bytes/);
  for(const altered of [Buffer.concat([bytes,Buffer.from(' ')]),Buffer.concat([Buffer.from(' '),bytes]),Buffer.from(bytes.toString().replace(/\r\n/g,'\n').replace(/\n/g,'\r\n'))]){
   assert.notDeepEqual(altered,bytes);assert.throws(()=>proof.withoutBomSuccessor(altered,file),/differs from pinned bytes/);
   assert.deepEqual(proof.projectBomSuccessor(altered,file),altered,'unknown mutations stay unprojected for old negative tests');
   assert.throws(()=>proof.attestBomSources(reader(file,altered)),/differs/);
  }
  const lf=bytes.toString().replace(/\r\n/g,'\n');
  assert.deepEqual(proof.canonicalSource(Buffer.from(lf),bytes),bytes);
  assert.deepEqual(proof.canonicalSource(Buffer.from(lf.replace(/\n/g,'\r\n')),bytes),bytes);
  assert.throws(()=>proof.canonicalSource(Buffer.concat([bytes,Buffer.from(' ')]),bytes),/differs from HEAD/);
  assert.throws(()=>proof.canonicalSource(bytes.toString(),bytes),/raw source bytes/);
  assert.throws(()=>proof.canonicalSource(bytes,bytes.toString()),/raw source bytes/);
 });
 for(const [index,rule]of contract.rules.entries())void test('each reviewed span rejects partial/repeated bytes and corrupt offsets: '+file+' #'+(index+1),()=>{
  const at=rule.afterOffset,span=Buffer.from(rule.after),prefix=bytes.subarray(0,at),suffix=bytes.subarray(at+span.length);
  for(const altered of [Buffer.concat([prefix,Buffer.from(rule.before),suffix]),Buffer.concat([prefix,span,span,suffix]),Buffer.concat([prefix,Buffer.from('!'),span.subarray(1),suffix])]){
   assert.notDeepEqual(altered,bytes);assert.throws(()=>proof.withoutBomSuccessor(altered,file),/differs from pinned bytes/);
   assert.throws(()=>proof.attestBomSources(reader(file,altered)),/Current BOM successor differs/);
   const projectedHash=hash(withoutAccessEventMetadata(proof.projectBomSuccessor(altered,file),file));
   if(altered.equals(prior))assert.equal(projectedHash,historicalPins[file],'complete rollback can match history but must fail current attestation');
   else assert.notEqual(projectedHash,historicalPins[file]);
  }
  for(const [key,value]of [['afterOffset',-1],['afterOffset',at+1],['afterOffset',Number.NaN],['beforeOffset',rule.beforeOffset+1],['after',rule.after+'!'],['before',rule.before+'!']]){
   const corrupt=structuredClone(contract);corrupt.rules[index][key]=value;
   assert.throws(()=>proof.invertContract(bytes,corrupt),/offset|span|length|predecessor/);
  }
 });
 void test('complete hash/length and span collection corruption is refused: '+file,()=>{
  for(const [key,value]of [['afterHash','0'.repeat(64)],['beforeHash','0'.repeat(64)],['afterBytes',bytes.length+1],['beforeBytes',contract.beforeBytes+1],['rules',[]]]){
   const corrupt=structuredClone(contract);corrupt[key]=value;assert.throws(()=>proof.invertContract(bytes,corrupt),/pinned|predecessor|length|spans/);
  }
  if(contract.rules.length>1){const corrupt=structuredClone(contract);corrupt.rules.reverse();assert.throws(()=>proof.invertContract(bytes,corrupt),/offset/);}
 });
}
void test('BOM backend composes all original Begin inverses without importing missing history or broadening dispatch',()=>{
 const file='lib/versioned-shared-workflow.ts',bytes=sources.get(file),prior=proof.withoutBomSuccessor(bytes,file);
 assert.equal(hash(withoutDurableBegin(bytes,file)),'8a35f8bd71a194773363bfa6d702f645ebc35a9a826b7aab96c209500eda15aa');
 assert.deepEqual(withoutDurableBegin(bytes,file),withoutDurableBegin(prior,file));
 const cFile='app/api/ipqc-c/workflow/route.ts',cBytes=readSource(cFile);
 assert.deepEqual(proof.projectBomSuccessor(cBytes,cFile),cBytes);
 assert.equal(hash(withoutDurableBegin(cBytes,cFile)),'87c8e3246f8aad02378962e5a0be29562d484665ff3a0dccbf5cd7ee710d6ce3');
 for(const altered of [Buffer.concat([bytes,Buffer.from(' ')]),changed(bytes,'assertBeginBasis(control,begin);','void 0;'),changed(bytes,'if(changed.meta.changes!==1)continue;','if(false)continue;')])assert.throws(()=>withoutDurableBegin(altered,file),/differs from pinned bytes/);
});
void test('old-server later atomic inverse reuses canonical bytes for Git-filtered and fully CRLF checkouts',()=>{
 const file='app/api/ipqc-c/workflow/route.ts',committed=execFileSync('git',['show','HEAD:'+file]);
 const checkout=execFileSync('git',['-c','core.autocrlf=true','cat-file','--filters','HEAD:'+file]);
 const crlf=Buffer.from(committed.toString().replace(/\r\n/g,'\n').replace(/\n/g,'\r\n'));
 assert.notDeepEqual(crlf,committed,'fully CRLF probe must differ from the mixed-EOL Git blob');
 const atomicInverse=require('../scripts/ipqc-c-local-save-source-contract.cjs').withoutLocalAtomicSave;
 for(const working of [checkout,crlf]){
  const currentSources=new Map([[file,proof.canonicalSource(working,committed)]]);
  assert.equal(hash(atomicInverse(currentSources.get(file))),'8e02233a3928309f28d478814610e4862fc8b331f20e273292f4f87f24c8eb07');
 }
 assert.throws(()=>atomicInverse(crlf),/differs from pinned bytes/,'raw EOL-changed bytes do not satisfy the original historical pin');
 assert.throws(()=>proof.canonicalSource(Buffer.concat([checkout,Buffer.from(' ')]),committed),/differs from HEAD/);
 const runner=fs.readFileSync('scripts/test-workflow-begin-old-server.cjs','utf8').replace(/\r\n/g,'\n');
 assert.match(runner,/const bytes=require\('\.\/bom-successor-source-contract\.cjs'\)\.canonicalSource\([^\n]+\);\n  currentSources\.set\(file,bytes\);/);
 assert.match(runner,/const historical=atomicInverse\(currentSources\.get\(files\[0\]\)\);/);
 assert.doesNotMatch(runner,/atomicInverse\(fs\.readFileSync/,'later proof must not reread unverified checkout bytes');
});
const mutations=[
 ['lib/versioned-shared-workflow.ts',"adapter.key==='bomMasterControl'&&adapter.scope==='bom'&&new URL(request.url).pathname==='/api/bom/workflow'","adapter.key==='bomMasterControl'"],
 ['lib/versioned-shared-workflow.ts',"selectors.getAll(key).length!==1",'false'],
 ['lib/versioned-shared-workflow.ts','if(!permissions.history)return','if(false)return'],
 ['lib/versioned-shared-workflow.ts','!freshPermissions.view||!freshPermissions.history','false'],
 ['lib/versioned-shared-workflow.ts','freshActor.id!==actor.id','false'],
 ['lib/versioned-shared-workflow.ts','freshActor.sessionType!==actor.sessionType','false'],
 ['lib/versioned-shared-workflow.ts','fresh.revision!==state.revision||!await stateRevisionIsCurrent(fresh)','false'],
 ['lib/versioned-shared-workflow.ts','!finalActor||finalActor.id!==actor.id||finalActor.sessionType!==actor.sessionType','false'],
 ['lib/versioned-shared-workflow.ts','approvedVersions(control,true)','approvedVersions(control,false)'],
 ['lib/versioned-shared-workflow.ts','approvedVersion(control,query.get(\'versionId\')!,true)','approvedVersion(control,query.get(\'versionId\')!,false)'],
 ['lib/versioned-shared-workflow.ts','return await approvedReadCurrent()||new Response(json','return new Response(json'],
 ['public/process/shared-draft-client.js',"beginPath==='/api/bom/workflow'",'true'],
 ['public/process/shared-draft-client.js','requireAcceptedAccess:true','requireAcceptedAccess:false'],
 ['lib/bom-workflow.ts',"if(!context.allowed('import' as never))",'if(false)'],
 ['lib/bom-workflow.ts','command.expectedRevision!==flow.revision','false'],
 ['lib/bom-workflow.ts','Bom.candidateDigest(next)!==proof.candidateDigest','Bom.candidateDigest(next)===proof.candidateDigest'],
 ['app/api/master/workflow/route.ts','const boundary=documentBoundary(request);if(boundary)return boundary;',''],
 ['app/api/master/workflow/route.ts','documentBoundary(request)||',''],
 ['lib/approved-history.ts',"if(strict&&(",'if(false&&('],
 ['lib/approved-history.ts',"c.status!=='approved'",'false'],
 ['lib/approved-history.ts','snapshot:c.content','snapshot:v.snapshot'],
 ['lib/process-state.ts','export async function identity','export async function identityUnsafe'],
 ['lib/user-access.ts','export function','function'],
 ['lib/shared-draft.ts','export function','function'],
 ['lib/workflow-begin.ts','export function','function'],
 ['lib/draft-restore-access.ts','export function','function'],
 ['lib/state-records-response.ts','export function','function'],
 ['public/process/bom-domain.mjs','async function candidateDigest','async function candidateDigestUnsafe'],
 ['public/process/version-draft-ui.js',"model.module==='BOM'",'true'],
 ['public/process/bom-workspace.js','reconciliation','reconciliationUnsafe'],
 ['lib/master-document-boundary.ts','export function assertMasterDocumentRouteAvailable','export function assertMasterDocumentRouteAvailableUnsafe']
];
for(const [index,[file,from,to]]of mutations.entries())void test('current-source attestation rejects authority mutation '+(index+1)+': '+file,()=>{
 const altered=changed(sources.get(file),from,to);assert.throws(()=>proof.attestBomSources(reader(file,altered)),/Current BOM (successor|authority dependency) differs/);
 const contract=proof.contracts.find(c=>c.file===file);
 if(contract){assert.throws(()=>proof.withoutBomSuccessor(altered,file),/differs from pinned bytes/);assert.notEqual(hash(withoutAccessEventMetadata(proof.projectBomSuccessor(altered,file),file)),historicalPins[file]);}
});
for(const {file}of proof.currentDependencies)void test('helper-only edits cannot pass through historical projection: '+file,()=>{
 const bytes=sources.get(file),altered=Buffer.concat([bytes,Buffer.from('\n// unreviewed helper edit')]);
 assert.deepEqual(proof.projectBomSuccessor(altered,file),altered);assert.throws(()=>proof.withoutBomSuccessor(altered,file),/Unknown BOM successor/);
 assert.throws(()=>proof.attestBomSources(reader(file,altered)),/Current BOM authority dependency differs/);
});
// These are actual command assertions, not merely path-filter assertions.
const originalReportingPaths=[...fs.readFileSync('tests/access-event-main-integration.test.cjs','utf8').matchAll(/^  "([^"]+)": "[a-f0-9]{64}"/gm)].map(match=>match[1]);
const requiredPaths=[...new Set([...proof.attestedPaths,...originalReportingPaths])];
const proofFiles=['scripts/bom-successor-source-contract.cjs','scripts/bom-successor-source-contracts.json','scripts/workflow-begin-source-contract.cjs','scripts/access-event-source-contract.cjs','scripts/batch3-workflow-source-contract.cjs','scripts/ipqc-c-read-io-source-contract.cjs','tests/bom-successor-source-contract.test.cjs','tests/access-event-main-integration.test.cjs','tests/batch3-workflow-source-contract.test.cjs','scripts/test-workflow-begin-old-server.cjs'];
function assertCI(feedback,local){
 feedback=feedback.replace(/\r\n/g,'\n');local=local.replace(/\r\n/g,'\n');
 const paths=feedback.split('    paths:\n')[1]?.split('permissions:')[0];assert(paths);
 for(const file of [...requiredPaths,...proofFiles])assert(paths.includes("      - '"+file+"'\n"),'Missing Feedback source-proof trigger: '+file);
 assert.match(feedback,/      - run: node --test tests\/bom-successor-source-contract\.test\.cjs tests\/access-event-main-integration\.test\.cjs\n/,'Feedback must execute focused and original reporting proof');
 assert.match(local,/runs-on: windows-latest/);
 const command='          node --test tests/bom-successor-source-contract.test.cjs tests/access-event-main-integration.test.cjs\n          if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }';
 assert.equal(local.split(command).length,2,'Windows must execute both proof suites exactly once with exit propagation');
}
void test('Feedback and Windows execute standalone BOM and original reporting proof with all new dependencies',()=>{
 const feedback=fs.readFileSync('.github/workflows/feedback-queues.yml','utf8').replace(/\r\n/g,'\n'),local=fs.readFileSync('.github/workflows/local-safety.yml','utf8').replace(/\r\n/g,'\n');
 assertCI(feedback,local);assertCI(feedback.replace(/\r?\n/g,'\r\n'),local.replace(/\r?\n/g,'\r\n'));
 assert.throws(()=>assertCI(feedback.replace('      - run: node --test tests/bom-successor-source-contract.test.cjs tests/access-event-main-integration.test.cjs','      - run: echo proof-disabled'),local),/must execute/);
 assert.throws(()=>assertCI(feedback,local.replace('node --test tests/bom-successor-source-contract.test.cjs tests/access-event-main-integration.test.cjs','echo proof-disabled')),/must execute/);
 for(const file of [...requiredPaths,...proofFiles])assert.throws(()=>assertCI(feedback.replace("      - '"+file+"'\n",''),local),/Missing Feedback source-proof trigger/);
});
