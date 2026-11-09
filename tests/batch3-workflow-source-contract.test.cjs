/* Current union plus every fixed predecessor; no runtime source writes. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{execFileSync}=require('node:child_process'),{createHash}=require('node:crypto');
const originalBegin=require('../scripts/workflow-begin-source-contract.cjs');
const pageProof=require('../scripts/master-page-runtime-source-contract.cjs');
// Admit only the exact current page successor before the unchanged historical
// chain. projectKnown leaves every altered byte sequence unrecognized.
const withoutDurableBegin=(bytes,file)=>originalBegin.withoutDurableBegin(pageProof.projectKnown(bytes,file),file);
const file='lib/versioned-shared-workflow.ts',current=fs.readFileSync(file),hash=b=>createHash('sha256').update(b).digest('hex');
const source=ref=>execFileSync('git',['show',ref+':'+file]);
const refs=['0af6d57e912e5615250959c9e76210fecd55d96b','f0ab66fc27b7c9615c42a28fcc40a4864fb3a047','4b5cdfbc0838556ecc39125e92edb1611f010dcd','4f810663174fe9c0a2e275c5f17dec3d5080522b','40cb76a499b582d760d670718665fd87b658e2d0','933277781a9549e2191dfb0d1aa91d0300e8c96a'];
const previous=source('cfb542926fa004392a3180b16aa887291fa74d4f');
void test('batch3 current six-span union and fixed sources reconstruct every original historical byte',()=>{
 assert.equal(hash(require('../scripts/access-event-source-contract.cjs').withoutAccessEventMetadata(require('../scripts/master-page-runtime-source-contract.cjs').restorePredecessor(current,file),file)),'d1246a4b451206a4091afbc66e3c066c5f04fa4de0da319e5120b0a339a7f01e');
 assert.equal(hash(previous),'8a35f8bd71a194773363bfa6d702f645ebc35a9a826b7aab96c209500eda15aa');
 for(const bytes of [current,...refs.map(source)])assert.deepEqual(withoutDurableBegin(bytes,file),previous);
 assert.deepEqual(fs.readFileSync(file),current);
});
for(const [label,from,to]of [
 ['equipment scope',"adapter.key==='routineEquipmentControl'&&adapter.scope==='routine-equipment'","adapter.key==='routineEquipmentControl'"],
 ['PROCESS permission',"['master:AB','master:C','master:PROCESS','master:AB.catalog','master:C.catalog','master:LINES']","['master:AB','master:C','master:PROCESS','master:AB.catalog','master:C.catalog','master:LINES','other']"],
 ['AB create admission','adapter.requiresCreate?.(control,command)||',''],
 ['AB Save permission',"adapter.key==='ipqcABMasterControl'&&adapter.scope==='ipqc-ab:module'","adapter.key==='ipqcABMasterControl'"],
 ['Begin scope',"'routine-equipment','ipqc-ab:module'","'routine-equipment','ipqc-ab:module','unknown'"],
 ['BOM session check',"body.command.moduleAction==='save-local-v1'",'false'],
 ['equipment session check',"||adapter.key==='routineEquipmentControl'&&adapter.scope==='routine-equipment')&&!await identity"," )&&!await identity"],
 ['CAS','if(changed.meta.changes!==1)continue;','if(false)continue;'],
 ['Begin basis','assertBeginBasis(control,begin);','void 0;'],
])void test('batch3 rejects unsafe '+label+' bytes',()=>{
 const altered=Buffer.from(current.toString().replace(from,to));assert.notDeepEqual(altered,current,'mutation must execute');assert.throws(()=>withoutDurableBegin(altered,file),/differs from pinned bytes/);
});
void test('batch3 refuses normalized, appended, wrong-file and non-Buffer inputs',()=>{
 for(const bytes of [Buffer.concat([current,Buffer.from(' ')]),Buffer.from(current.toString().replace(/\r\n/g,'\n'))])assert.throws(()=>withoutDurableBegin(bytes,file),/differs from pinned bytes/);
 for(const bytes of [current.toString(),new Uint8Array(current)])assert.throws(()=>withoutDurableBegin(bytes,file),/requires raw source bytes/);
 assert.throws(()=>withoutDurableBegin(current,'app/api/ipqc-c/workflow/route.ts'),/differs from pinned bytes/);
 assert.throws(()=>withoutDurableBegin(current,'unknown'),/Unknown Begin-v1 source contract/);
});
