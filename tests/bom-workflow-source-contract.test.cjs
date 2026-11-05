/* Strict fixture admission and byte-exact composition; no runtime source writes. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto'),{execFileSync}=require('node:child_process');
const {withoutBomWorkflowOptIn}=require('../scripts/bom-workflow-source-contract.cjs'),{withoutDurableBegin}=require('../scripts/workflow-begin-source-contract.cjs');
const root=path.resolve(__dirname,'..'),file='lib/versioned-shared-workflow.ts',current=fs.readFileSync(path.join(root,file)),hash=b=>createHash('sha256').update(b).digest('hex');
const historical=ref=>execFileSync('git',['show',ref+':'+file],{cwd:root});
void test('BOM exact source restores the original Begin pin and exact historical handler bytes',()=>{
 const originalBegin=historical('0af6d57e912e5615250959c9e76210fecd55d96b'),preBegin=historical('cfb542926fa004392a3180b16aa887291fa74d4f');
 assert.equal(hash(current),'6a85a7a3617f1c8b912d83a5291e2ad4babfa747eba42d2c7da7809556e985e0');
 assert.equal(hash(originalBegin),'8734ac32aa54f02f2d19b94bd7b0ecbec849907867a9638a4f5afd34a4e244d1');
 assert.equal(hash(preBegin),'8a35f8bd71a194773363bfa6d702f645ebc35a9a826b7aab96c209500eda15aa');
 assert.deepEqual(withoutBomWorkflowOptIn(current,file),originalBegin);
 assert.deepEqual(withoutDurableBegin(current,file),preBegin);
 assert.deepEqual(withoutDurableBegin(originalBegin,file),preBegin,'original admitted source remains admitted without BOM projection');
 assert.deepEqual(fs.readFileSync(path.join(root,file)),current,'projection cannot rewrite product source');
});
const changed=(before,after)=>{assert(current.includes(Buffer.from(before)),before);const next=Buffer.from(current.toString().replace(before,after));assert.notDeepEqual(next,current);return next;};
for(const [name,mutate]of [
 ['unknown append',()=>Buffer.concat([current,Buffer.from('\n// unreviewed')])],
 ['leading byte',()=>Buffer.concat([Buffer.from(' '),current])],
 ['line ending normalization',()=>Buffer.from(current.toString().replace(/\r\n/g,'\n'))],
 ['BOM permission relaxation',()=>changed("adapter.key==='bomMasterControl'&&adapter.scope==='bom'","adapter.key==='bomMasterControl'||adapter.scope==='bom'")],
 ['Begin admission broadening',()=>changed("['fqc','iqc','bom','process:platform']","['fqc','iqc','bom','tooling','process:platform']")],
 ['Begin-basis removal',()=>changed('assertBeginBasis(control,begin);','void 0;')],
 ['session check removal',()=>changed("body.command.moduleAction==='save-local-v1'","false")],
 ['unrelated CAS guard change',()=>changed('if(changed.meta.changes!==1)continue;','if(false)continue;')],
])void test('BOM and composed inverse reject '+name,()=>{const bytes=mutate();assert.throws(()=>withoutBomWorkflowOptIn(bytes,file),/differs from pinned bytes/);assert.throws(()=>withoutDurableBegin(bytes,file),/differs from pinned bytes/);});
void test('BOM projection is scoped to its one file and original Begin/IPQC pins remain strict',()=>{
 assert.throws(()=>withoutBomWorkflowOptIn(current,'app/api/ipqc-c/workflow/route.ts'),/file is not reviewed/);
 assert.throws(()=>withoutBomWorkflowOptIn(current.toString(),file),/requires raw source bytes/);
 const other='app/api/ipqc-c/workflow/route.ts',bytes=fs.readFileSync(path.join(root,other));
 assert.throws(()=>withoutBomWorkflowOptIn(bytes),/differs from pinned bytes/);
 assert.equal(hash(withoutDurableBegin(bytes,other)),'87c8e3246f8aad02378962e5a0be29562d484665ff3a0dccbf5cd7ee710d6ce3');
 assert.throws(()=>withoutDurableBegin(Buffer.concat([bytes,Buffer.from(' ')]),other),/differs from pinned bytes/);
});
