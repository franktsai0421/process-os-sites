/* Test-only source evidence for the independent Routine FQC successor.
 * No restored predecessor is returned or executed. Runtime acceptance belongs
 * to the full-module and actual-route tests, not these byte comparisons. */
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {createHash}=require('node:crypto'),{execFileSync}=require('node:child_process');
const contract=Object.freeze({
  base:'b06394ce0065849733399423afd2d906761d69c1',
  baseTree:'a382bdc478eca740ede13f298c960557888baefc',
  file:'public/process/routine-fqc.js',
  beforeHash:'67ad99d354de6d3f563f36c80df3e2954dd8f7ea02b84411b7273a0e5d069a69',
  beforeLength:151175,
  afterHash:'5738d095b99bdf3d43240dd425327e92083a730d83484ff6f2c73333fe314d15',
  afterLength:153724,
  index:'public/process/index.html',
  indexBeforeHash:'b32d9d7ff08a6f9fc5cac824a7500b7687b6bc10a52fa1a298323006fd695028',
  oldTag:'routine-fqc.js?v=20261103-simple-departure1',
  newTag:'routine-fqc.js?v=20261108-manual-generate2',
});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function raw(bytes){assert(Buffer.isBuffer(bytes),'Routine source proof requires raw Buffer bytes');}
function assertSource(bytes,file){
  raw(bytes);assert.equal(file,contract.file,'Routine source proof wrong file');
  assert.equal(bytes.length,contract.afterLength,'Routine source pinned byte length');
  assert.equal(hash(bytes),contract.afterHash,'Routine source differs from pinned successor');
}
function assertPredecessor(bytes,file){
  raw(bytes);assert.equal(file,contract.file,'Routine predecessor wrong file');
  assert.equal(bytes.length,contract.beforeLength,'Routine predecessor pinned byte length');
  assert.equal(hash(bytes),contract.beforeHash,'Routine predecessor differs from merged main');
}
function assertIndexSuccessor(bytes,before,file){
  raw(bytes);raw(before);assert.equal(file,contract.index,'Routine cache proof wrong file');
  bytes=require('./background-check-source-contract.cjs').projectKnown(bytes,file);
  assert.equal(hash(before),contract.indexBeforeHash,'Routine cache predecessor differs from merged main');
  const marker=Buffer.from(contract.oldTag),next=Buffer.from(contract.newTag),offset=before.indexOf(marker);
  assert(offset>=0&&before.indexOf(marker,offset+1)===-1,'Routine cache predecessor must contain one exact tag');
  const expected=Buffer.concat([before.subarray(0,offset),next,before.subarray(offset+marker.length)]);
  assert.deepEqual(bytes,expected,'Routine cache successor must change only its own exact tag');
}
// EOL equivalence is admitted only against separately attested committed bytes.
// It never normalizes the bytes before the pinned source/predecessor checks.
function checkoutLF(bytes){raw(bytes);const out=Buffer.alloc(bytes.length);let size=0;for(let i=0;i<bytes.length;i++){if(bytes[i]===13&&bytes[i+1]===10)continue;out[size++]=bytes[i];}return out.subarray(0,size);}
function canonicalCheckout(working,committed){
  raw(working);raw(committed);
  assert.deepEqual(checkoutLF(working),checkoutLF(committed),'Routine checkout differs from HEAD beyond checkout EOL');
  return Buffer.from(committed);
}
function verifyRepository(directory=process.cwd()){
  const git=(...args)=>execFileSync('git',args,{cwd:directory});
  assert.equal(git('rev-parse',contract.base+'^{tree}').toString().trim(),contract.baseTree,'Routine base tree mismatch');
  git('merge-base','--is-ancestor',contract.base,'HEAD');
  const before=git('show',contract.base+':'+contract.file),beforeIndex=git('show',contract.base+':'+contract.index);
  assertPredecessor(before,contract.file);
  const source=require('./quality-integration-source-contract.cjs').projectKnown(canonicalCheckout(fs.readFileSync(path.join(directory,contract.file)),git('show','HEAD:'+contract.file)),contract.file);
  const index=require('./quality-integration-source-contract.cjs').projectKnown(canonicalCheckout(fs.readFileSync(path.join(directory,contract.index)),git('show','HEAD:'+contract.index)),contract.index);
  assertSource(source,contract.file);assertIndexSuccessor(index,beforeIndex,contract.index);
  return Object.freeze({status:'PASS_ROUTINE_FQC_SOURCE',base:contract.base,sourceHash:hash(source),indexHash:hash(index)});
}
module.exports=Object.freeze({contract,hash,assertSource,assertPredecessor,assertIndexSuccessor,canonicalCheckout,verifyRepository});
if(require.main===module)console.log(JSON.stringify(verifyRepository()));
