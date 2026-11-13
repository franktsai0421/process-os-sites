const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{execFileSync}=require('node:child_process');
const proof=require('../scripts/lines-flow-source-contract.cjs');
for(const [file,c]of Object.entries(proof.contract.files))void test('lines/flow exact source '+file+' preserves genuine main, EOL and effective drift rejection',()=>{
 const raw=fs.readFileSync(file),bytes=proof.normalized(raw),before=execFileSync('git',['show',proof.contract.base+':'+file]);
 for(const source of [raw,Buffer.from(bytes.toString().replaceAll('\n','\r\n'))])assert(proof.restore(source,file).equals(before));
 assert.throws(()=>proof.restore(raw.toString(),file),/raw Buffer/);assert.throws(()=>proof.restore(raw,'__proto__'),/wrong file/);
 for(const offset of new Set([0,bytes.length-1,...c.rules.map(rule=>Math.min(rule.offset,bytes.length-1))])){const mutated=Buffer.from(bytes);mutated[offset]^=1;assert(!mutated.equals(bytes));assert.throws(()=>proof.restore(mutated,file),/pinned/);assert(proof.projectKnown(mutated,file).equals(mutated));}
 for(const rule of c.rules){const after=Buffer.from(rule.after),head=bytes.subarray(0,rule.offset),tail=bytes.subarray(rule.offset+after.length);for(const mutated of [Buffer.concat([head,Buffer.from(rule.before),tail]),Buffer.concat([head,after,after.length?after:Buffer.from(rule.before),tail])]){assert(!mutated.equals(bytes),'negative really changes source');assert.throws(()=>proof.restore(mutated,file),/pinned/);}}
 assert(Object.isFrozen(c.rules));assert(proof.projectKnown(before,file).equals(before));
});
void test('lines/flow actual committed checkout and pinned main source tree',()=>assert.equal(proof.verifyRepository().status,'PASS_EXACT_LINES_FLOW_MAIN_SOURCE'));
