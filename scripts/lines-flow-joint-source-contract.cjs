// Test-only exact joint candidate -> both genuine pre-integration parents.
// Original password, IPQC and LINES manifests remain immutable; unknown bytes pass through unchanged.
const assert=require('node:assert/strict'),fs=require('node:fs'),{execFileSync}=require('node:child_process'),{createHash}=require('node:crypto');
const contract=require('./lines-flow-joint-source-contract.json');
function freeze(v){if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;}freeze(contract);
const hash=b=>createHash('sha256').update(b).digest('hex'),normalized=b=>Buffer.from(b.toString('utf8').replaceAll('\r\n','\n'));
function restore(bytes,file,target){
 assert(Buffer.isBuffer(bytes),'Joint lines/flow requires raw Buffer');
 const c=Object.hasOwn(contract.files,file)?contract.files[file]:null,p=c&&Object.hasOwn(c.parents,target)?c.parents[target]:null;
 assert(p,'Joint lines/flow wrong file or target');let out=normalized(bytes);
 assert.equal(out.length,c.afterLength,'Joint lines/flow pinned length');assert.equal(hash(out),c.afterHash,'Joint lines/flow pinned successor');
 for(const r of [...p.rules].reverse()){const span=Buffer.from(r.after);assert(out.subarray(r.offset,r.offset+span.length).equals(span),'Joint lines/flow pinned span');out=Buffer.concat([out.subarray(0,r.offset),Buffer.from(r.before),out.subarray(r.offset+span.length)]);}
 assert.equal(hash(out),p.normalizedHash,'Joint lines/flow predecessor');const lines=out.toString().split('\n');for(const [a,b]of p.crlf)for(let i=a;i<b;i++)lines[i]+='\r';out=Buffer.from(lines.join('\n'));assert.equal(out.length,p.length);assert.equal(hash(out),p.hash,'Joint lines/flow exact predecessor');return out;
}
function projectKnown(bytes,file,target){assert(Buffer.isBuffer(bytes),'Joint lines/flow requires raw Buffer');const c=Object.hasOwn(contract.files,file)?contract.files[file]:null;return c&&Object.hasOwn(c.parents,target)&&hash(normalized(bytes))===c.afterHash?restore(bytes,file,target):bytes;}
function verifyRepository(){const git=(...a)=>execFileSync('git',a);for(const [target,p]of Object.entries(contract.parents)){assert.equal(git('rev-parse',p.commit+'^{tree}').toString().trim(),p.tree);git('merge-base','--is-ancestor',p.commit,'HEAD');for(const [file,c]of Object.entries(contract.files)){if(!Object.hasOwn(c.parents,target))continue;const head=git('show','HEAD:'+file),before=git('show',p.commit+':'+file);assert(normalized(fs.readFileSync(file)).equals(normalized(head)),'Joint lines/flow checkout drift');assert.equal(git('rev-parse',p.commit+':'+file).toString().trim(),c.parents[target].blob);assert(restore(head,file,target).equals(before),'Joint lines/flow true parent');}}return{status:'PASS_EXACT_LINES_FLOW_BOTH_PARENTS',files:Object.keys(contract.files).length,parents:contract.parents};}
module.exports=Object.freeze({contract,hash,normalized,restore,projectKnown,verifyRepository});
