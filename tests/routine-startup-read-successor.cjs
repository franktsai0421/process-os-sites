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
const has=file=>Object.hasOwn(blobs,file);
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
module.exports={base,scope,blobs,verify,inventory,predecessor,has};
