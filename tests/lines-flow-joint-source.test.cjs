const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{execFileSync}=require('node:child_process');
const proof=require('../scripts/lines-flow-joint-source-contract.cjs'),git=(...a)=>execFileSync('git',a);
for(const [file,c]of Object.entries(proof.contract.files))for(const [target,p]of Object.entries(c.parents))void test('joint exact '+target+' parent, EOL and effective drift rejection: '+file,()=>{
 const raw=fs.readFileSync(file),bytes=proof.normalized(raw),prior=git('show',proof.contract.parents[target].commit+':'+file);
 for(const source of [raw,Buffer.from(bytes.toString().replaceAll('\n','\r\n'))])assert(proof.restore(source,file,target).equals(prior));
 assert(proof.projectKnown(raw,file,target).equals(prior));assert(Object.isFrozen(p.rules));
 assert.throws(()=>proof.restore(raw.toString(),file,target),/raw Buffer/);
 for(const [wrongFile,wrongTarget]of [['__proto__',target],[file,'other'],['./'+file,target]]){assert.throws(()=>proof.restore(raw,wrongFile,wrongTarget),/wrong file or target/);assert(proof.projectKnown(raw,wrongFile,wrongTarget).equals(raw));}
 for(const offset of new Set([0,bytes.length-1,...p.rules.map(r=>Math.min(r.offset,bytes.length-1))])){const bad=Buffer.from(bytes);bad[offset]^=1;assert(!bad.equals(bytes));assert.throws(()=>proof.restore(bad,file,target),/pinned/);assert(proof.projectKnown(bad,file,target).equals(bad));}
 for(const r of p.rules){const span=Buffer.from(r.after),prefix=bytes.subarray(0,r.offset),suffix=bytes.subarray(r.offset+span.length);for(const bad of [Buffer.concat([prefix,Buffer.from(r.before),suffix]),Buffer.concat([prefix,span,span.length?span:Buffer.from(r.before),suffix])]){assert(!bad.equals(bytes),'negative changes current bytes');assert.throws(()=>proof.restore(bad,file,target),/pinned/);assert(proof.projectKnown(bad,file,target).equals(bad));}}
});
void test('joint checkout has all three true parent trees in committed ancestry',()=>assert.equal(proof.verifyRepository().status,'PASS_EXACT_LINES_FLOW_BOTH_PARENTS'));
void test('four original feature manifests retain every original hash, span and negative-control input',()=>{
 for(const [file,target]of [['lines-flow-source-contract.json','lines'],['password-outcome-source-contract.json','main'],['ipqc-save-recovery-source-contract.json','main'],['process-review-source-contract.json','main116']])assert(fs.readFileSync('scripts/'+file).equals(git('show',proof.contract.parents[target].commit+':scripts/'+file)),file);
});
