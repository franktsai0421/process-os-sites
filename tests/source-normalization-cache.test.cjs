const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),{createRequire}=require('node:module'),{createHash}=require('node:crypto'),{execFileSync,spawn}=require('node:child_process');
const file=path.resolve('scripts/source-normalization-cache.cjs'),source=fs.readFileSync(file,'utf8'),digest=b=>createHash('sha256').update(b).digest('hex'),normalize=b=>Buffer.from(b.toString('utf8').replaceAll('\r\n','\n'));
function fixture(){let hashes=0;const cjs={exports:{}};vm.runInNewContext(source,{Buffer,SharedArrayBuffer,module:cjs,require:name=>name==='node:crypto'?{createHash(...args){hashes++;return createHash(...args);}}:require(name)},{filename:file});return {cache:cjs.exports(),hashes:()=>hashes};}
void test('normalization preserves genuine UTF8/EOL/hash behavior and shares only identical raw content',()=>{
 const f=fixture();for(const raw of [Buffer.alloc(0),Buffer.from('A\nB\r\nC\rD'),Buffer.from('中文 Tiếng Việt 😀\r\n'),Buffer.from([0xff,0x80,0xc3,0x28]),Buffer.from('\ufffd')]){assert.deepEqual(f.cache.bytes(raw),normalize(raw));assert.equal(f.cache.hash(raw),digest(normalize(raw)));const count=f.hashes();assert.equal(f.cache.hash(Buffer.from(raw)),digest(normalize(raw)));assert.equal(f.hashes(),count,'same content needs no repeated digest');}
 for(const value of [null,'text',new Uint8Array([1])]){assert.throws(()=>f.cache.hash(value),/raw Buffer/);assert.throws(()=>f.cache.bytes(value),/raw Buffer/);}
});
void test('input mutation, backing-store aliases and returned-byte mutation cannot reuse stale state',()=>{
 const f=fixture(),parent=Buffer.from('prefix DATA suffix'),raw=parent.subarray(7,11);f.cache.hash(raw);const old=f.hashes();parent[0]^=1;f.cache.hash(raw);assert.equal(f.hashes(),old,'outside slice changes no source byte');parent[7]^=1;assert.equal(f.cache.hash(raw),digest(normalize(raw)));assert.equal(f.hashes(),old+1);const output=f.cache.bytes(raw);output.fill(0);assert.deepEqual(f.cache.bytes(raw),normalize(raw));raw.fill(0x42);assert.equal(f.cache.hash(raw),digest(normalize(raw)));
});
void test('four-entry LRU is bounded and larger/shared inputs retain complete uncached normalization',()=>{
 const f=fixture(),raws=Array.from({length:5},(_,i)=>Buffer.from('source-'+i));for(const raw of raws.slice(0,4))f.cache.hash(raw);assert.equal(f.hashes(),4);f.cache.hash(raws[0]);f.cache.hash(raws[4]);assert.equal(f.hashes(),5);f.cache.hash(raws[0]);assert.equal(f.hashes(),5);f.cache.hash(raws[1]);assert.equal(f.hashes(),6,'least recently used content was evicted');
 const large=Buffer.alloc(1024*1024+1,0x80),before=f.hashes();assert.deepEqual(f.cache.bytes(large),normalize(large));assert.equal(f.cache.hash(large),digest(normalize(large)));assert.equal(f.hashes(),before+2,'size cap is cache admission only');
 const shared=Buffer.from(new SharedArrayBuffer(8));shared.fill(65);const start=f.hashes();f.cache.hash(shared);f.cache.hash(shared);assert.equal(f.hashes(),start+2);shared[0]=66;assert.equal(f.cache.hash(shared),digest(normalize(shared)));
});
void test('whole backing-store mutation cannot poison private snapshots or cached bytes',()=>{
 const script=`const assert=require('node:assert/strict'),crypto=require('node:crypto'),create=require('./scripts/source-normalization-cache.cjs');
 const hash=b=>crypto.createHash('sha256').update(Buffer.from(b.toString('utf8').replaceAll('\\r\\n','\\n'))).digest('hex');
 const c=create(),raw=Buffer.from('small pooled source proof');c.hash(raw);const out=c.bytes(raw);assert.notEqual(out.buffer,raw.buffer);Buffer.from(out.buffer).fill(0);assert.equal(c.hash(raw),hash(raw));assert.deepEqual(c.bytes(raw),Buffer.from('small pooled source proof'));
 const second=create(),input=Buffer.from('source backing store');second.hash(input);Buffer.from(input.buffer).fill(0);assert.equal(second.hash(input),hash(input));assert.deepEqual(second.bytes(input),Buffer.from(input.toString('utf8').replaceAll('\\r\\n','\\n')));`;
 // Isolate deliberate slab mutation from every other test and Node buffer user.
 const result=require('node:child_process').spawnSync(process.execPath,['-e',script],{cwd:process.cwd(),encoding:'utf8'});assert.equal(result.status,0,result.stderr);
});
function original(){const cjs={exports:{}};vm.runInNewContext(execFileSync('git',['show','ea137c7dd8d608d216d45ab29b033fc5f782ff5d:scripts/inventory-quality-source-contract.cjs']).toString(),{Buffer,module:cjs,require:createRequire(path.resolve('scripts/inventory-quality-source-contract.cjs'))});return cjs.exports;}
void test('cached composition matches genuine original outputs, errors, EOL and warmed mutable-buffer rejection',()=>{
 const before=original(),after=require('../scripts/inventory-quality-source-contract.cjs');
 for(const file of ['public/process/fqc-master.js','public/process/shared-draft-client.js','HANDOFF.md'])for(const target of Object.keys(before.contract.parents))for(const eol of ['\n','\r\n','mixed']){
  const text=execFileSync('git',['show','0f2c8ec5b3bc8f6a5625ef049782fab1f96988b1:'+file]).toString().replaceAll('\r\n','\n'),raw=Buffer.from(eol==='mixed'?text.replace('\n','\r\n'):text.replaceAll('\n',eol));assert.deepEqual(after.restore(raw,file,target),before.restore(raw,file,target));assert.deepEqual(after.projectKnown(raw,file,target),before.projectKnown(raw,file,target));
  const result=after.restore(raw,file,target);result.fill(0);assert.deepEqual(after.restore(raw,file,target),before.restore(raw,file,target),'returned result cannot poison later proof');
  for(const at of [0,Math.floor(raw.length/2),raw.length-1]){const value=raw[at];raw[at]^=1;assert.throws(()=>before.restore(raw,file,target));assert.throws(()=>after.restore(raw,file,target));assert.equal(after.projectKnown(raw,file,target),raw);raw[at]=value;assert.deepEqual(after.restore(raw,file,target),before.restore(raw,file,target));}
 }
 assert.throws(()=>after.restore(fs.readFileSync('HANDOFF.md'),'wrong','qualityMain'));assert.throws(()=>after.restore(fs.readFileSync('HANDOFF.md'),'HANDOFF.md','wrong'));
});
void test('original JSON manifests, approved product changes and reviewed Routine delta remain exact',async()=>{
 const git=(...args)=>execFileSync('git',args);
 const base='ea137c7dd8d608d216d45ab29b033fc5f782ff5d';
 const readGit=args=>new Promise((resolve,reject)=>{
  const child=spawn('git',args,{stdio:['ignore','pipe','pipe']}),chunks=[];
  child.stdout.on('data',chunk=>chunks.push(chunk));child.on('error',reject);
  child.on('close',code=>code===0?resolve(Buffer.concat(chunks)):reject(Error('Git source read failed: '+code)));
 });
 for(const file of git('ls-tree','-r','--name-only',base,'--','scripts').toString().trim().split('\n').filter(x=>x.endsWith('.json')))
  assert.deepEqual(fs.readFileSync(file),await readGit(['show',base+':'+file]),file);
 const scope=['app','lib','public','package.json','package-lock.json'];
 const sourceProof=require('../scripts/routine-integration-source-contract.cjs');
 const main='f173bd2474d6070c6411736f91a5707e1e49be4b';
 const readDiff=(...commits)=>git('diff','--name-status',...commits,'--',...scope).toString().trimEnd();
 const navigation=['app/api/process-bootstrap/route.ts','app/api/routine-fqc/route.ts','lib/process-state.ts'];
 const historical=[...navigation,'public/process/index.html','public/process/ipqc-ab.js','public/process/ipqc-c.js','public/process/version-draft-ui.js'];
 assert.deepEqual(readDiff(base,main).split('\n').map(row=>row.split('\t')[1]),historical,
  'only four #125 product files and the pinned navigation read sources may differ in the historical comparison');
 for(const file of historical){
  const expected=git('show',(navigation.includes(file)?'27ca5b879423b126122ce0c7f8200330eff4df1c':'161b24289f2da730f31e6cdbbe0deac5ed00017d')+':'+file);
  assert.deepEqual(git('show',main+':'+file),expected,'exact pinned historical product bytes '+file);
 }
 const uploaded=sourceProof.followup.uploaded;
 const approved=readDiff(main,uploaded);
 const startupBase='0149cf21fd2e46e83f8eab99a8426bc8c9df6b47';
 const startupTree='4d8f6e6fde010b560b75d580f2382ceeae520f89';
 assert.equal(readDiff(main,startupBase),approved,'Routine product paths and change status must match the uploaded PR');
 const startupDelta=[
  'M\tapp/api/routine-fqc/page/route.ts','M\tapp/api/routine-fqc/route.ts','M\tapp/api/routine-iqc/route.ts',
  'A\tapp/api/routine-reset/route.ts','M\tlib/routine-iqc-access.ts','A\tlib/routine-schedule-owner.ts',
  'M\tpublic/process/index.html','M\tpublic/process/routine-fqc-page.js','M\tpublic/process/routine-fqc.js',
  'M\tpublic/process/routine-iqc.js','A\tpublic/process/routine-reset.js',
 ].join('\n');
 assert.equal(readDiff(startupBase,startupTree),startupDelta,'exact startup paths and change kinds');
 const reads=require('./routine-startup-read-successor.cjs');
 assert.equal(readDiff(startupTree,reads.base),'','no unverified product content before the exact startup read change');
 reads.verify();
 assert.equal(readDiff('HEAD'),'','tracked product checkout must match its commit');
 for(const row of approved.split('\n')){
  const [,file]=row.split('\t');
  sourceProof.assertUploadedOrFollowup(reads.predecessor(fs.readFileSync(file),file,{checkout:true}),file);
 }
 assert.equal(git('diff',base,'0f2c8ec5b3bc8f6a5625ef049782fab1f96988b1','--',...scope).length,0,'merged #121 main itself preserves the approved cache-only runtime boundary');
 assert.equal(fs.existsSync('lib/iqc-body-read-ahead.mjs'),false);
});

void test('actual integrated adapter rejects warmed source mutations and result poisoning without a test-side projection',()=>{
 const before=original(),after=require('../scripts/inventory-quality-source-contract.cjs');
 for(const file of ['public/process/fqc-master.js','public/process/shared-draft-client.js','HANDOFF.md'])for(const target of Object.keys(before.contract.parents)){
  const current=fs.readFileSync(file),parent=execFileSync('git',['show','0f2c8ec5b3bc8f6a5625ef049782fab1f96988b1:'+file]),expected=before.restore(parent,file,target);assert.deepEqual(after.restore(current,file,target),expected);const result=after.restore(current,file,target);result.fill(0);assert.deepEqual(after.restore(current,file,target),expected);
  for(const at of [0,Math.floor(current.length/2),current.length-1]){const value=current[at];current[at]^=1;assert.throws(()=>after.restore(current,file,target));assert.equal(after.projectKnown(current,file,target),current);current[at]=value;assert.deepEqual(after.restore(current,file,target),expected);}
 }
});
