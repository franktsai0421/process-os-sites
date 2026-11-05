/* Exact BOM source and integrated-union admission; no runtime source writes. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto'),{execFileSync}=require('node:child_process');
const {withoutBomWorkflowOptIn}=require('../scripts/bom-workflow-source-contract.cjs'),{withoutDurableBegin}=require('../scripts/workflow-begin-source-contract.cjs');
const root=path.resolve(__dirname,'..'),file='lib/versioned-shared-workflow.ts',current=fs.readFileSync(path.join(root,file)),hash=b=>createHash('sha256').update(b).digest('hex');
const historical=ref=>execFileSync('git',['show',ref+':'+file],{cwd:root});
const bom=historical('8c4a73bb76256d0c66797a27a5fa52a8952327ae');
void test('BOM and exact integrated union restore the original Begin pin and complete historical bytes',()=>{
 const originalBegin=historical('0af6d57e912e5615250959c9e76210fecd55d96b'),preBegin=historical('cfb542926fa004392a3180b16aa887291fa74d4f');
 assert.equal(hash(current),'30f7e9c9d5de3207bb89eba34fb3b82d23b965d4e77d3d191b5fa5115be309d9');
 assert.equal(hash(bom),'6a85a7a3617f1c8b912d83a5291e2ad4babfa747eba42d2c7da7809556e985e0');
 assert.equal(hash(originalBegin),'8734ac32aa54f02f2d19b94bd7b0ecbec849907867a9638a4f5afd34a4e244d1');
 assert.equal(hash(preBegin),'8a35f8bd71a194773363bfa6d702f645ebc35a9a826b7aab96c209500eda15aa');
 assert.deepEqual(withoutBomWorkflowOptIn(bom,file),originalBegin);
 assert.deepEqual(withoutDurableBegin(bom,file),preBegin);
 assert.deepEqual(withoutDurableBegin(current,file),preBegin);
 assert.deepEqual(withoutDurableBegin(originalBegin,file),preBegin,'original source stays admitted without successor projection');
 assert.deepEqual(fs.readFileSync(path.join(root,file)),current,'projection cannot rewrite product source');
});
const changed=(source,before,after)=>{assert(source.includes(Buffer.from(before)),before);const next=Buffer.from(source.toString().replace(before,after));assert.notDeepEqual(next,source);return next;};
for(const [name,mutate]of [
 ['unknown append',source=>Buffer.concat([source,Buffer.from('\n// unreviewed')])],
 ['leading byte',source=>Buffer.concat([Buffer.from(' '),source])],
 ['line ending normalization',source=>Buffer.from(source.toString().replace(/\r\n/g,'\n'))],
 ['BOM permission relaxation',source=>changed(source,"adapter.key==='bomMasterControl'&&adapter.scope==='bom'","adapter.key==='bomMasterControl'||adapter.scope==='bom'")],
 ['Begin admission broadening',source=>{const original=source===bom?"['fqc','iqc','bom','process:platform']":"['fqc','iqc','tooling','bom','process:platform','master:AB','master:C']";return changed(source,original,original.slice(0,-1)+",'master:PROCESS']");}],
 ['Begin-basis removal',source=>changed(source,'assertBeginBasis(control,begin);','void 0;')],
 ['session check removal',source=>changed(source,"body.command.moduleAction==='save-local-v1'","false")],
 ['unrelated CAS guard change',source=>changed(source,'if(changed.meta.changes!==1)continue;','if(false)continue;')],
])void test('BOM and integrated inverse reject '+name,()=>{
 const changedBom=mutate(bom),changedUnion=mutate(current);
 assert.throws(()=>withoutBomWorkflowOptIn(changedBom,file),/differs from pinned bytes/);
 assert.throws(()=>withoutDurableBegin(changedBom,file),/differs from pinned bytes/);
 assert.throws(()=>withoutDurableBegin(changedUnion,file),/differs from pinned bytes/);
});
void test('projections require raw Buffers, exact file/hash boundaries and original IPQC pins; Windows keeps the new gate',()=>{
 assert.throws(()=>withoutBomWorkflowOptIn(bom,'app/api/ipqc-c/workflow/route.ts'),/file is not reviewed/);
 assert.throws(()=>withoutBomWorkflowOptIn(bom.toString(),file),/requires raw source bytes/);
 for(const source of [current,bom,historical('0af6d57e912e5615250959c9e76210fecd55d96b')])for(const input of [source.toString(),new Uint8Array(source)])assert.throws(()=>withoutDurableBegin(input,file),/requires raw source bytes/);
 assert.throws(()=>withoutBomWorkflowOptIn(current,file),/differs from pinned bytes/,'BOM-only projection cannot swallow the integrated union');
 assert.throws(()=>withoutDurableBegin(current,'app/api/ipqc-c/workflow/route.ts'),/differs from pinned bytes/);
 assert.throws(()=>withoutDurableBegin(current,'lib/unreviewed-workflow.ts'),/Unknown Begin-v1 source contract/);
 const other='app/api/ipqc-c/workflow/route.ts',bytes=fs.readFileSync(path.join(root,other));
 assert.throws(()=>withoutBomWorkflowOptIn(bytes),/differs from pinned bytes/);
 assert.equal(hash(withoutDurableBegin(bytes,other)),'87c8e3246f8aad02378962e5a0be29562d484665ff3a0dccbf5cd7ee710d6ce3');
 assert.throws(()=>withoutDurableBegin(Buffer.concat([bytes,Buffer.from(' ')]),other),/differs from pinned bytes/);
 const yaml=fs.readFileSync(path.join(root,'.github/workflows/local-safety.yml'),'utf8').replace(/\r\n/g,'\n');
 assert.match(yaml,/runs-on: windows-latest/);
 const gate='          node --test tests/bom-workflow-source-contract.test.cjs\n          if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }\n          node scripts/test-workflow-begin-old-server.cjs\n          if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }';
 assert.equal(yaml.split(gate).length,2,'new contract suite and existing five-module runner execute once with intact exit propagation');
});
