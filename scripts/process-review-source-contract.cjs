// Test-only exact successor -> actual main. No fuzzy matches or runtime use.
const assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const contract=require('./process-review-source-contract.json'),hash=b=>createHash('sha256').update(b).digest('hex');
const normalized=b=>Buffer.from(b.toString('utf8').replaceAll('\r\n','\n'));
// Only these exact reviewed successors may enter the historical inverse as
// their immutable predecessor. Unrecognized source still reaches the drift fence.
const canvasPins={
 'public/process/process-authoring-v3.js':['3ab62a2c040c40d535f461a3a4046db1791f7cb4664a066d9aa940e01a5eca42','82f8ac63dbee9cb510501e8edf90bf45875ec4c71bb480d5106df07a882e8a17'],
};
function reviewPreimage(bytes,file){
 const pin=Object.hasOwn(canvasPins,file)&&canvasPins[file];
 if(!pin||hash(normalized(bytes))!==pin[0])return bytes;
 const prior=require('node:child_process').execFileSync('git',['show','98c87f7721786dc823850f35265bef574efbf162:'+file],{cwd:__dirname});
 assert.equal(hash(prior),pin[1],'Canvas review predecessor');return prior;
}
function restore(bytes,file){
 assert(Buffer.isBuffer(bytes),'Review proof requires raw Buffer');bytes=require('./lines-flow-joint-source-contract.cjs').projectKnown(reviewPreimage(bytes,file),file,'main116');const c=Object.hasOwn(contract.files,file)?contract.files[file]:null;assert(c,'Review proof wrong path');const raw=normalized(bytes);assert.equal(hash(raw),c.afterHash,'Review successor drift');let out=Buffer.from(raw);
 for(const rule of [...c.rules].reverse()){const span=Buffer.from(rule.after);assert.deepEqual(out.subarray(rule.offset,rule.offset+span.length),span,'Review positioned bytes');out=Buffer.concat([out.subarray(0,rule.offset),Buffer.from(rule.before),out.subarray(rule.offset+span.length)]);}
 assert.equal(hash(out),c.beforeNormalizedHash,'Review normalized predecessor');const lines=out.toString().split('\n');for(const index of c.beforeCRLF)lines[index]+='\r';out=Buffer.from(lines.join('\n'));assert.equal(hash(out),c.beforeHash,'Review actual main bytes');return out;
}
function projectKnown(bytes,file){assert(Buffer.isBuffer(bytes),'Review proof requires raw Buffer');bytes=require('./lines-flow-joint-source-contract.cjs').projectKnown(reviewPreimage(bytes,file),file,'main116');const c=Object.hasOwn(contract.files,file)?contract.files[file]:null;return c&&hash(normalized(bytes))===c.afterHash?restore(bytes,file):bytes;}
module.exports=Object.freeze({contract,hash,restore,projectKnown});
