const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{execFileSync}=require('node:child_process'),proof=require('../scripts/abc-master-source-contract.cjs');
for(const c of proof.contracts)void test(c.file+' exact main inverse and effective drift rejection',()=>{
 const bytes=fs.readFileSync(c.file),before=execFileSync('git',['show',require('../scripts/abc-master-source-contract.json').base+':'+c.file]);assert.deepEqual(proof.restore(bytes,c.file),before);const crlf=Buffer.from(bytes.toString().replace(/\r?\n/g,'\r\n'));assert.deepEqual(proof.restore(crlf,c.file),before);
 const bads=[Buffer.concat([bytes,Buffer.from(' ')]),bytes.subarray(1)];for(const r of c.rules){const b=Buffer.from(bytes);b[r.offset]^=1;bads.push(b);}for(const bad of bads){assert.throws(()=>proof.restore(bad,c.file),/ABC successor differs/);assert.deepEqual(proof.projectKnown(bad,c.file),bad);}assert.deepEqual(proof.projectKnown(bytes,'wrong/path'),bytes);
});
