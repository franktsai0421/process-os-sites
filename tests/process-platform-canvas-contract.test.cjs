/* oxlint-disable typescript/no-require-imports -- immutable Git source evidence. */
const test=require('node:test'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process'),proof=require('../scripts/process-platform-canvas-contract.cjs');
const git=(...args)=>execFileSync('git',args);
for(const contract of proof.contracts)void test('Canvas exact successor and unchanged predecessor: '+contract.file,()=>{
 const bytes=git('show','HEAD:'+contract.file),before=git('show',proof.evidence.predecessorTree+':'+contract.file),copy=Buffer.from(bytes);
 assert.deepEqual(proof.restorePredecessor(bytes,contract.file),before);assert.deepEqual(bytes,copy);
 for(const input of [before,bytes.subarray(1),Buffer.concat([bytes,Buffer.from(' ')]),bytes.toString(),new Uint8Array(bytes)])assert.throws(()=>proof.restorePredecessor(input,contract.file));
 for(const offset of [0,Math.floor(bytes.length/2),bytes.length-1]){const changed=Buffer.from(bytes);changed[offset]^=1;assert.throws(()=>proof.restorePredecessor(changed,contract.file));assert.deepEqual(proof.projectKnown(changed,contract.file),changed);}
 assert.throws(()=>proof.restorePredecessor(bytes,'wrong-path'));
});
void test('Canvas source pair attests checkout and real main ancestry without executing projected code',()=>{assert.equal(proof.verifyRepository().status,'PASS_PROCESS_CANVAS_SOURCE');});

for(const entry of proof.evidence.additions||[])void test('new Canvas history source has exact raw bytes: '+entry.file,()=>{const bytes=git('show','HEAD:'+entry.file);assert.equal(proof.hash(require('../scripts/account-process-joint-source-contract.cjs').projectProcessKnown(bytes,entry.file)),entry.afterHash);assert.equal(git('ls-tree',proof.evidence.predecessorTree,'--',entry.file).length,0);});
