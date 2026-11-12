// Exact test-only inverse for the reviewed account permission projection.
// Raw hashes, blobs and positioned spans retain genuine main source as the preimage.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto'),{execFileSync}=require('node:child_process');
const contract=require('./account-permission-source-contract.json');
for(const c of Object.values(contract.files)){for(const v of [c,...(c.historical||[])]){for(const rule of v.rules)Object.freeze(rule);Object.freeze(v.rules);Object.freeze(v);}if(c.historical)Object.freeze(c.historical);}Object.freeze(contract.files);Object.freeze(contract);
const hash=b=>createHash('sha256').update(b).digest('hex');
function projectFile(bytes,file){
 bytes=require('./account-process-followup-source-contract.cjs').projectKnown(bytes,file);assert(Buffer.isBuffer(bytes),'Account permission source requires raw Buffer');
 const current=Object.hasOwn(contract.files,file)?contract.files[file]:null;assert(current,'Unknown account permission path');const c=[current,...(current.historical||[])].find(v=>v.afterHash===hash(bytes));assert(c,'Account permission successor differs');assert.equal(bytes.length,c.afterLength);
 let before=Buffer.from(bytes);
 for(const r of [...c.rules].reverse()){const after=Buffer.from(r.after);assert.deepEqual(before.subarray(r.offset,r.offset+after.length),after,'Account permission span differs');before=Buffer.concat([before.subarray(0,r.offset),Buffer.from(r.before),before.subarray(r.offset+after.length)]);}
 assert.equal(before.length,c.beforeLength);assert.equal(hash(before),c.beforeHash,'Account permission predecessor differs');return before;
}
function projectKnown(bytes,file){bytes=require('./account-process-followup-source-contract.cjs').projectKnown(bytes,file);assert(Buffer.isBuffer(bytes),'Account permission source requires raw Buffer');bytes=require('./account-page-source-contract.cjs').projectKnown(bytes,file);const c=Object.hasOwn(contract.files,file)?contract.files[file]:null;return c&&[c,...(c.historical||[])].some(v=>hash(bytes)===v.afterHash)?projectFile(bytes,file):bytes;}
function verifyRepository(root=process.cwd()){
 const git=(...args)=>execFileSync('git',args,{cwd:root});assert.equal(git('rev-parse',contract.base+'^{tree}').toString().trim(),contract.baseTree);git('merge-base','--is-ancestor',contract.base,'HEAD');
 for(const [file,c]of Object.entries(contract.files)){const original=git('show',contract.base+':'+file),raw=git('show','HEAD:'+file),committed=require('./account-process-followup-source-contract.cjs').projectKnown(raw,file),working=fs.readFileSync(path.join(root,file));assert.equal(hash(original),c.beforeHash);assert.deepEqual(git('cat-file','blob',c.beforeBlob),original);assert.deepEqual(projectFile(committed,file),original);assert.deepEqual(git('cat-file','blob',c.afterBlob),committed);for(const v of c.historical||[])assert.deepEqual(projectFile(git('cat-file','blob',v.afterBlob),file),original);assert.deepEqual(Buffer.from(working.toString().replace(/\r\n/g,'\n')),Buffer.from(raw.toString().replace(/\r\n/g,'\n')),'Non-EOL checkout drift');}
 return {status:'PASS_ACCOUNT_PERMISSION_EXACT_SOURCE',files:Object.keys(contract.files),base:contract.base};
}
module.exports=Object.freeze({contract,hash,projectFile,projectKnown,verifyRepository});
if(require.main===module)console.log(JSON.stringify(verifyRepository()));
