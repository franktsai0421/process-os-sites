// Test-only exact source/cache composition. It never restores or executes old code.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto'),{execFileSync}=require('node:child_process');
const contract=Object.freeze({base:'d4ac309fe05c89288af226b52c18161865ccdcb8',baseTree:'598194ab8561cfbab845e82ee7b0ccaf6629743b',source:'public/process/editor-line-selection.js',index:'public/process/index.html',beforeHash:'856d783b6f806dc8b09949b2ab2d44332661ce0ea09ea258e7a6d7abb53de6ba',afterHash:'37ae6bb223ad3f49585dcf025f0737a82ef3757e0c4225000bc2be9d22e780e4',indexBeforeHash:'40163af0731a5691db3a3dc2e1f6c229c2720cfd6cfe5ffd0d1a9ab5547f63c0',indexAfterHash:'9b57d9a8a2b4919a32c8ac88dfe49f08e797bbb4245e425c595d5a0e9848d265',oldTag:'editor-line-selection.js?v=20261030-pr54-integrated1',newTag:'editor-line-selection.js?v=20261109-projected-count1'});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const raw=bytes=>assert(Buffer.isBuffer(bytes),'Count proof requires raw Buffer');
function assertSource(bytes,file){raw(bytes);assert.equal(file,contract.source,'Count proof wrong source path');assert.equal(hash(bytes),contract.afterHash,'Count source differs from exact successor');}
function projectIndex(bytes,source){
 raw(bytes);assertSource(source,contract.source);assert.equal(hash(bytes),contract.indexAfterHash,'Count index differs from exact successor');
 const tag=Buffer.from(contract.newTag),offset=bytes.indexOf(tag);assert(offset>=0&&bytes.indexOf(tag,offset+1)===-1,'Count index must contain exactly one successor tag');
 const projected=Buffer.concat([bytes.subarray(0,offset),Buffer.from(contract.oldTag),bytes.subarray(offset+tag.length)]);
 assert.equal(hash(projected),contract.indexBeforeHash,'Count projection differs from exact main index');return projected;
}
function checkoutLF(bytes){raw(bytes);const out=Buffer.alloc(bytes.length);let size=0;for(let i=0;i<bytes.length;i++){if(bytes[i]===13&&bytes[i+1]===10)continue;out[size++]=bytes[i];}return out.subarray(0,size);}
function canonicalCheckout(working,committed){raw(working);raw(committed);assert.deepEqual(checkoutLF(working),checkoutLF(committed),'Count checkout differs beyond EOL');return Buffer.from(committed);}
function verifyRepository(directory=process.cwd()){
 const git=(...args)=>execFileSync('git',args,{cwd:directory});assert.equal(git('rev-parse',contract.base+'^{tree}').toString().trim(),contract.baseTree,'Count base tree mismatch');git('merge-base','--is-ancestor',contract.base,'HEAD');
 assert.equal(hash(git('show',contract.base+':'+contract.source)),contract.beforeHash,'Count predecessor source mismatch');assert.equal(hash(git('show',contract.base+':'+contract.index)),contract.indexBeforeHash,'Count predecessor index mismatch');
 const unified=require('./unified-draft-source-contract.cjs');unified.attest(file=>unified.canonicalSource(fs.readFileSync(path.join(directory,file)),git('show','HEAD:'+file)));
 const currentSource=canonicalCheckout(fs.readFileSync(path.join(directory,contract.source)),git('show','HEAD:'+contract.source)),currentIndex=canonicalCheckout(fs.readFileSync(path.join(directory,contract.index)),git('show','HEAD:'+contract.index)),source=unified.project(currentSource,contract.source,'count101'),index=unified.project(currentIndex,contract.index,'count101');projectIndex(index,source);
 return Object.freeze({status:'PASS_EDITOR_COUNT_SOURCE',base:contract.base,projectedTarget:'count101',sourceHash:hash(source),indexHash:hash(index),currentSourceHash:hash(currentSource),currentIndexHash:hash(currentIndex)});
}
module.exports=Object.freeze({contract,hash,assertSource,projectIndex,canonicalCheckout,verifyRepository});
if(require.main===module)console.log(JSON.stringify(verifyRepository()));
