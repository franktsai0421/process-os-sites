// Test-only exact account cache inverse; no historical application code executes.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto'),{execFileSync}=require('node:child_process');
const contract=Object.freeze(require('./account-cache-source-contract.json'));
for(const variant of contract.variants){for(const rule of variant.rules)Object.freeze(rule);Object.freeze(variant.rules);Object.freeze(variant);}Object.freeze(contract.variants);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function raw(bytes){assert(Buffer.isBuffer(bytes),'Account cache proof requires raw Buffer');}
function projectIndex(bytes,expectedHash){
 raw(bytes);if(expectedHash!==undefined)assert.equal(hash(bytes),expectedHash,'Account cache proof differs from pinned successor');const variant=contract.variants.find(v=>hash(bytes)===v.afterHash);
 assert(variant,'Account cache proof differs from pinned successor');assert.equal(bytes.length,variant.afterLength);
 let prior=Buffer.from(bytes);
 for(const {offset,before,after} of [...variant.rules].reverse()){
  const span=Buffer.from(after);assert.deepEqual(prior.subarray(offset,offset+span.length),span,'Account cache inverse span differs');
  prior=Buffer.concat([prior.subarray(0,offset),Buffer.from(before),prior.subarray(offset+span.length)]);
 }
 assert.equal(prior.length,contract.beforeLength);assert.equal(hash(prior),contract.beforeHash,'Account cache inverse differs from main');
 return prior;
}
function projectKnown(bytes,file){raw(bytes);return file===contract.index&&contract.variants.some(v=>hash(bytes)===v.afterHash)?projectIndex(bytes):bytes;}
function verifyRepository(directory=process.cwd()){
 const git=(...args)=>execFileSync('git',args,{cwd:directory});
 assert.equal(git('rev-parse',contract.base+'^{tree}').toString().trim(),contract.baseTree);git('merge-base','--is-ancestor',contract.base,'HEAD');
 const predecessor=git('show',contract.base+':'+contract.index),committed=git('show','HEAD:'+contract.index),working=fs.readFileSync(path.join(directory,contract.index));
 assert.equal(hash(predecessor),contract.beforeHash);
 assert.deepEqual(Buffer.from(working.toString().replace(/\r\n/g,'\n')),Buffer.from(committed.toString().replace(/\r\n/g,'\n')),'Account cache checkout differs beyond EOL');
 assert.deepEqual(projectIndex(committed),predecessor,'Account cache must reconstruct genuine main bytes');
 for(const variant of contract.variants){
  const object=git('cat-file','blob',variant.afterBlob);assert.equal(hash(object),variant.afterHash);
  assert.deepEqual(projectIndex(object),predecessor,'Historical account source must reconstruct the same main bytes');
 }
 return Object.freeze({status:'PASS_ACCOUNT_CACHE_EXACT_INVERSE',base:contract.base,indexHash:hash(committed),variants:contract.variants.length});
}
module.exports=Object.freeze({contract,hash,projectIndex,projectKnown,verifyRepository});
if(require.main===module)console.log(JSON.stringify(verifyRepository()));
