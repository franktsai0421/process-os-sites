// Test-only exact count cache composition onto main #100. No historical code executes.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto'),{execFileSync}=require('node:child_process');
const contract=Object.freeze(require('./process-platform-count-contract.json'));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function raw(bytes){assert(Buffer.isBuffer(bytes),'Process count proof requires raw Buffer');}
function projectIndex(bytes){
 raw(bytes);assert.equal(hash(bytes),contract.indexAfterHash,'Process count cache differs from exact successor');
 const tag=Buffer.from(contract.newTag),offset=bytes.indexOf(tag);
 assert(offset>=0&&bytes.indexOf(tag,offset+1)===-1,'Process count cache requires exactly one tag');
 const prior=Buffer.concat([bytes.subarray(0,offset),Buffer.from(contract.oldTag),bytes.subarray(offset+tag.length)]);
 assert.equal(hash(prior),contract.indexBeforeHash,'Process count cache inverse differs from main');return prior;
}
function projectKnown(bytes,file){raw(bytes);return file===contract.index&&hash(bytes)===contract.indexAfterHash?projectIndex(bytes):bytes;}
function verifyRepository(directory=process.cwd()){
 const git=(...args)=>execFileSync('git',args,{cwd:directory});
 assert.equal(git('rev-parse',contract.base+'^{tree}').toString().trim(),contract.baseTree);git('merge-base','--is-ancestor',contract.base,'HEAD');
 const current=file=>{const bytes=fs.readFileSync(path.join(directory,file)),committed=git('show','HEAD:'+file);assert.deepEqual(Buffer.from(bytes.toString().replace(/\r\n/g,'\n')),Buffer.from(committed.toString().replace(/\r\n/g,'\n')),'Working source differs beyond EOL');return committed;};
 const source=current(contract.source),index=current(contract.index);
 assert.equal(hash(git('show',contract.base+':'+contract.source)),contract.sourceBeforeHash);
 assert.equal(hash(source),contract.sourceAfterHash,'Process count source differs from reused #101');
 assert.deepEqual(projectIndex(index),git('show',contract.base+':'+contract.index));
 return Object.freeze({status:'PASS_PROCESS_PLATFORM_COUNT',base:contract.base,sourceCommit:contract.sourceCommit,sourceHash:hash(source),indexHash:hash(index)});
}
module.exports=Object.freeze({contract,hash,projectIndex,projectKnown,verifyRepository});
if(require.main===module)console.log(JSON.stringify(verifyRepository()));
