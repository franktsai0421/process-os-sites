// Exact successor -> the real merged main a85caf5 (including #110/#111/#112). Test evidence only.
// Runtime tests load current sources; these predecessor bytes never execute.
const assert=require('node:assert/strict'),fs=require('node:fs'),{execFileSync}=require('node:child_process'),{createHash}=require('node:crypto');
const contract=require('./lines-flow-source-contract.json');
const joint=require('./lines-flow-joint-source-contract.cjs');
function freeze(value){if(value&&typeof value==='object'){for(const item of Object.values(value))freeze(item);Object.freeze(value);}return value;}freeze(contract);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),normalized=bytes=>Buffer.from(bytes.toString('utf8').replaceAll('\r\n','\n'));
function restore(bytes,file){
 assert(Buffer.isBuffer(bytes),'Lines/flow proof requires raw Buffer');bytes=joint.projectKnown(bytes,file,'lines');const c=Object.hasOwn(contract.files,file)?contract.files[file]:null;assert(c,'Lines/flow wrong file');
 let result=normalized(bytes);assert.equal(result.length,c.afterLength,'Lines/flow pinned successor length');assert.equal(hash(result),c.afterHash,'Lines/flow pinned successor');
 for(const rule of [...c.rules].reverse()){const span=Buffer.from(rule.after);assert(result.subarray(rule.offset,rule.offset+span.length).equals(span),'Lines/flow pinned span');result=Buffer.concat([result.subarray(0,rule.offset),Buffer.from(rule.before),result.subarray(rule.offset+span.length)]);}
 assert.equal(hash(result),c.beforeNormalizedHash,'Lines/flow normalized predecessor');const lines=result.toString().split('\n');for(const [start,end]of c.beforeCRLF)for(let index=start;index<=end;index++)lines[index]+='\r';result=Buffer.from(lines.join('\n'));assert.equal(hash(result),c.beforeHash,'Lines/flow exact predecessor');return result;
}
function projectKnown(bytes,file){assert(Buffer.isBuffer(bytes),'Lines/flow proof requires raw Buffer');bytes=joint.projectKnown(bytes,file,'lines');const c=Object.hasOwn(contract.files,file)?contract.files[file]:null;return c&&hash(normalized(bytes))===c.afterHash?restore(bytes,file):bytes;}
function verifyRepository(){const git=(...args)=>execFileSync('git',args);assert.equal(git('rev-parse',contract.base+'^{tree}').toString().trim(),contract.baseTree);git('merge-base','--is-ancestor',contract.base,'HEAD');for(const [file,c]of Object.entries(contract.files)){const head=git('show','HEAD:'+file),before=git('show',contract.base+':'+file);assert(normalized(fs.readFileSync(file)).equals(normalized(head)),'Lines/flow checkout drift');assert.equal(hash(before),c.beforeHash);assert.equal(git('rev-parse',contract.base+':'+file).toString().trim(),c.beforeBlob);assert(restore(head,file).equals(before),'Lines/flow complete real-main predecessor');}return{status:'PASS_EXACT_LINES_FLOW_MAIN_SOURCE',base:contract.base,files:Object.keys(contract.files).length};}
module.exports=Object.freeze({contract,hash,normalized,restore,projectKnown,verifyRepository});
