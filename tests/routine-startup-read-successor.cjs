// Technical byte identity for the startup read change. This is a test input,
// not a publication receipt or a maintainer approval.
const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const git=(...args)=>execFileSync('git',args);
const base='feaeba4f6d6dc723dde0dbcbd1fb4e2ae8d22ec7';
const baseTree='0c4c55d2355b89529ac27853aff8f7576dc2f14c';
const scope=['app','lib','public','package.json','package-lock.json'];
const blobs=Object.freeze({
 'app/api/routine-fqc/route.ts':['b71b1a1c1cca839a3744bdca72272916608090bb','260a0929c02cf344f2c30f81b899aaac710669a5'],
 'app/api/routine-iqc/route.ts':['bf72c0e30db355e317b26cce4a19948c54090880','623e69623702fef909644b33c4d7d22fd924ee16'],
 'lib/process-state.ts':['6669f640530b894b8d67bedc2e49852a23f14a84','91f970be9cd083626546a0669aacfe82d190bd97'],
 'lib/routine-iqc-access.ts':['3392d8160379ef1d7c7ae596961d864d3016a9b8','e99c76bc1565f965624c7ea8032f2cdfc1850765'],
 'lib/state-records.ts':['07225bec92e8e443302b0ed4634e644a48f7ac3e','18cf548192e0de45f2746e43d3e5239f3e9a6993'],
});
// This is the exact tree already present at the PR head, before any test
// adapter changes. Product and test-file identities have separate scopes.
const sourceTree='bfabde9775883260b5a769bb155930fdfccb0464';
const testBlobs=Object.freeze({
 'tests/accounts-process-integration-source.test.mjs':['ef3ce8c4bca500a84f2b43841694b43c205f5a9a','a313841a1724218964e925e6010f1f5be7cdcbcb'],
 'tests/ipqc-operation-speed-integration-source.test.cjs':['3cb292107cdbd914d1086be3141c9b053425b552','100a1ab574358c1ffb0f8b7411360e6b140e3649'],
 'tests/source-normalization-cache.test.cjs':['f0e3dff8e7dc164f9bd372e46977c4fa7f47c4c6','3b9264bfdc9b9e759f77e28efc359c78f1209e52'],
});
const has=file=>Object.hasOwn(blobs,file);
const originals=new Map();
function projectKnown(bytes,file){
 assert(Buffer.isBuffer(bytes),'Startup read proof requires raw Buffer');
 const pair=has(file)?blobs[file]:Object.hasOwn(testBlobs,file)?testBlobs[file]:null;
 if(!pair)return bytes;
 if(!originals.has(file)){
   for(const [tree,blob] of [[baseTree,pair[0]],[sourceTree,pair[1]]])
     assert.equal(git('ls-tree',tree,'--',file).toString().trimEnd(),'100644 blob '+blob+'\t'+file);
   const after=git('cat-file','blob',pair[1]),lf=after.toString().replaceAll('\r\n','\n');
   originals.set(file,{before:git('cat-file','blob',pair[0]),after,lf:Buffer.from(lf),crlf:Buffer.from(lf.replaceAll('\n','\r\n'))});
 }
 const {before,after,lf,crlf}=originals.get(file);
 return bytes.equals(after)||bytes.equals(lf)||bytes.equals(crlf)?Buffer.from(before):bytes;
}
function inventory(raw){
 const expected=Object.entries(blobs).map(([file,[old,next]])=>':100644 100644 '+old+' '+next+' M\t'+file+'\n').join('');
 assert.equal(raw,expected,'complete startup runtime change, path, mode, and both blob IDs');
}
function verify(){
 assert.equal(git('rev-parse',base+'^{tree}').toString().trim(),baseTree);
 git('merge-base','--is-ancestor',base,'HEAD');
 inventory(git('diff','--raw','--no-abbrev','--no-renames',base,'HEAD','--',...scope).toString());
}
function predecessor(bytes,file,{checkout=false}={}){
 if(!has(file))return bytes;
 assert(Buffer.isBuffer(bytes));
 const [old,next]=blobs[file],after=git('cat-file','blob',next);
 assert.equal(git('ls-tree','HEAD','--',file).toString().trimEnd(),'100644 blob '+next+'\t'+file);
 assert.equal(git('ls-tree',baseTree,'--',file).toString().trimEnd(),'100644 blob '+old+'\t'+file);
 if(checkout&&!bytes.equals(after)){
   // Accept the whole-file Git CRLF checkout only; compare raw HEAD independently.
   assert.deepEqual(bytes,Buffer.from(after.toString().replace(/\r?\n/g,'\r\n')),file);
 }else assert.deepEqual(bytes,after,file);
 return git('cat-file','blob',old);
}
module.exports={base,sourceTree,projectKnown,scope,blobs,verify,inventory,predecessor,has};
