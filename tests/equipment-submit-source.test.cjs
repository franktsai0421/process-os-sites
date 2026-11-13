const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{execFileSync}=require('node:child_process');
const proof=require('../scripts/equipment-submit-source-contract.cjs'),git=(...args)=>execFileSync('git',args),canonical=b=>b.toString().replaceAll('\r\n','\n');
for(const [file,c]of Object.entries(proof.contract.files))for(const [target,parent]of Object.entries(c.parents))void test('integrated exact '+target+' source and effective drift rejection: '+file,()=>{
 const raw=git('show','HEAD:'+file),before=git('show',proof.contract.parents[target].commit+':'+file),untouched=Buffer.from(raw);
 assert.equal(canonical(fs.readFileSync(file)),canonical(raw),'checkout equals exact committed source');
 assert.equal(git('rev-parse',proof.contract.parents[target].commit+'^{tree}').toString().trim(),proof.contract.parents[target].tree);
 git('merge-base','--is-ancestor',proof.contract.parents[target].commit,'HEAD');
 assert.equal(git('rev-parse',proof.contract.parents[target].commit+':'+file).toString().trim(),parent.blob);
 assert.deepEqual(proof.restore(raw,file,target),before);assert.deepEqual(proof.projectKnown(raw,file,target),before);assert.deepEqual(raw,untouched);
 for(const source of [Buffer.from(canonical(raw)),Buffer.from(canonical(raw).replaceAll('\n','\r\n'))])assert.deepEqual(proof.restore(source,file,target),before,'checkout EOL alone is admitted');
 for(const source of [raw.subarray(1),Buffer.concat([raw,Buffer.from(' ')]),Buffer.from(raw.toString().replace('process','altered')),before])assert.throws(()=>proof.restore(source,file,target),/pinned/);
 for(const rule of parent.rules){const span=Buffer.from(rule.after),prefix=raw.subarray(0,rule.offset),suffix=raw.subarray(rule.offset+span.length);for(const drift of [Buffer.concat([prefix,suffix]),Buffer.concat([prefix,span,span,suffix]),Buffer.concat([prefix,suffix,span])])if(!drift.equals(raw))assert.throws(()=>proof.restore(drift,file,target),/pinned/);}
 for(const at of new Set([0,raw.length-1,...parent.rules.map(r=>Math.min(raw.length-1,r.offset))])){const drift=Buffer.from(raw);drift[at]^=1;assert.throws(()=>proof.restore(drift,file,target),/pinned/);assert.deepEqual(proof.projectKnown(drift,file,target),drift);}
 assert.throws(()=>proof.restore(raw.toString(),file,target),/raw Buffer/);assert.throws(()=>proof.restore(raw,'wrong',target),/wrong file/);assert.throws(()=>proof.restore(raw,file,'wrong'),/wrong file/);
 for(const unknown of ['constructor','__proto__','toString']){assert.throws(()=>proof.restore(raw,unknown,target),/wrong file/);assert.deepEqual(proof.projectKnown(raw,unknown,target),raw);assert.throws(()=>proof.restore(raw,file,unknown),/wrong file/);assert.deepEqual(proof.projectKnown(raw,file,unknown),raw);}
});
void test('both real feature changes coexist in installed transport and cache',()=>{
 const client=fs.readFileSync('public/process/shared-draft-client.js','utf8'),index=fs.readFileSync('public/process/index.html','utf8');
 assert(client.includes("['/api/tooling/workflow','/api/routine-equipment/workflow','/api/fqc/workflow'"));assert(client.includes('NO_SUBSTANTIVE_CHANGE:['));
 assert.equal(index.split('shared-draft-client.js?v=20261113-abc-master1').length,2);
 for(const route of ['equipment-integration-source-contract.cjs','process-submit-outcome-source-contract.cjs'])assert.equal(fs.readFileSync('scripts/quality-main-source-contract.cjs','utf8').split("require('./"+route+"').projectKnown(bytes,file)").length,3);
});
