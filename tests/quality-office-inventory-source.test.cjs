const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{execFileSync}=require('node:child_process'),p=require('../scripts/quality-office-inventory-source-contract.cjs');
for(const [target,parent]of Object.entries(p.contract.parents))for(const [file,c]of Object.entries(parent.files))void test('office inventory preserves exact '+target+' parent and rejects unknown drift: '+file,()=>{
 const bytes=fs.readFileSync(file),head=execFileSync('git',['show','HEAD:'+file]),before=execFileSync('git',['show',parent.sha+':'+file]);assert.equal(p.hash(require('../scripts/navigation-read-source-contract.cjs').projectKnown(head,file)),c.afterHash,'committed candidate bytes');assert.equal(p.hash(Buffer.from(bytes.toString().replaceAll('\r\n','\n'))),p.hash(Buffer.from(head.toString().replaceAll('\r\n','\n'))),'checkout attests HEAD');assert.deepEqual(p.restore(bytes,file,target),before);assert.deepEqual(p.restore(Buffer.from(bytes.toString().replaceAll('\r\n','\n').replaceAll('\n','\r\n')),file,target),before);
 assert.throws(()=>p.restore(bytes,'__proto__',target),/wrong path/);assert.throws(()=>p.restore(bytes,file,'__proto__'),/wrong parent/);assert.throws(()=>p.restore(bytes.toString(),file,target),/raw Buffer/);for(const offset of [0,bytes.length-1,...c.rules.map(r=>Math.min(r.offset,bytes.length-1))]){const bad=Buffer.from(bytes);bad[offset]^=1;assert.throws(()=>p.restore(bad,file,target),/successor/);assert.deepEqual(p.projectKnown(bad,file,target),bad);}assert.deepEqual(p.projectKnown(before,file,target),before);
});

void test('integration keeps actual quality UI and verifies both navigation handlers against the original runtime',()=>{
 const git=(...a)=>execFileSync('git',a);
 const projection=require('../scripts/routine-integration-source-contract.cjs');
 for(const file of ['public/process/ipqc-ab.js','public/process/ipqc-c.js','public/process/version-draft-ui.js','public/process/fqc-master.js']){
  const raw=fs.readFileSync(file),old=git('show',p.contract.parents.office.sha+':'+file);
  assert.deepEqual(projection.projectKnown(raw,file),old,file);
  const changed=Buffer.concat([raw,Buffer.from(' ')]);
  assert.notDeepEqual(projection.projectKnown(changed,file),old,'unknown UI bytes '+file);
 }
 // The navigation proof composes the Routine inverse for all incumbent app/lib files.
 for(const file of git('ls-tree','-r','--name-only',p.contract.parents.main.sha,'--','app','lib').toString().trim().split('\n'))assert.deepEqual(require('../scripts/navigation-read-source-contract.cjs').projectKnown(fs.readFileSync(file),file),git('show',p.contract.parents.main.sha+':'+file),file);
 assert.equal(fs.existsSync('public/process/quality-read-wire.js'),false,'unmerged #126 excluded');
});
