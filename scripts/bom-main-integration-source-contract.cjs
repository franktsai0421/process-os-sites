/* Test-only integration of verified BOM ab306 and main b063 source.
 * No runtime uses these projections. Frozen whole-file pins and exact byte
 * spans preserve each branch's original independent proof and refusal tests.
 */
const assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const raw=bytes=>assert(Buffer.isBuffer(bytes),'Integration proof requires raw source bytes');
function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
const manifest=freeze(require('./bom-main-integration-source-contract.json'));
function invert(bytes,contract){
 raw(bytes);assert.equal(hash(bytes),contract.afterHash,'Integration source differs from pinned bytes');assert.equal(bytes.length,contract.afterBytes,'Integration source length differs');
 assert(contract.rules.length>0,'Integration spans required');let end=0,beforeEnd=0,delta=0;
 for(const rule of contract.rules){const after=Buffer.from(rule.after),before=Buffer.from(rule.before);
  assert(Number.isSafeInteger(rule.afterOffset)&&rule.afterOffset>=end&&rule.afterOffset+after.length<=bytes.length,'Integration span offset invalid');
  assert(Number.isSafeInteger(rule.beforeOffset)&&rule.beforeOffset>=beforeEnd&&rule.beforeOffset===rule.afterOffset-delta,'Integration predecessor offset invalid');
  assert.deepEqual(bytes.subarray(rule.afterOffset,rule.afterOffset+after.length),after,'Integration exact span differs');
  end=rule.afterOffset+after.length;beforeEnd=rule.beforeOffset+before.length;delta+=after.length-before.length;
 }
 assert.equal(bytes.length-delta,contract.beforeBytes,'Integration predecessor length differs');let result=Buffer.from(bytes);
 for(const rule of [...contract.rules].reverse()){const after=Buffer.from(rule.after),before=Buffer.from(rule.before);result=Buffer.concat([result.subarray(0,rule.afterOffset),before,result.subarray(rule.afterOffset+after.length)]);}
 assert.equal(hash(result),contract.beforeHash,'Integration predecessor bytes differ');return result;
}
function restore(bytes,file,target){raw(bytes);const contract=manifest.projections.find(item=>item.file===file&&item.target===target);assert(contract,'Unknown integration path or target');return invert(bytes,contract);}
function project(bytes,file,target){raw(bytes);assert(['bom','main'].includes(target),'Unknown integration target');return manifest.projections.some(item=>item.file===file&&item.target===target&&item.afterHash===hash(bytes))?restore(bytes,file,target):bytes;}
function attest(readSource){assert.equal(typeof readSource,'function','Integration source reader required');for(const entry of manifest.current){const bytes=readSource(entry.file);raw(bytes);assert.equal(hash(bytes),entry.sha256,'Current integration source differs: '+entry.file);assert.equal(bytes.length,entry.bytes,'Current integration length differs: '+entry.file);}return true;}
function canonicalSource(working,committed){raw(working);raw(committed);const lf=bytes=>{const result=Buffer.alloc(bytes.length);let length=0;for(let i=0;i<bytes.length;i++){if(bytes[i]===13&&bytes[i+1]===10)continue;result[length++]=bytes[i];}return result.subarray(0,length);};assert.deepEqual(lf(working),lf(committed),'Integration worktree differs from HEAD beyond EOL');return committed;}
module.exports={manifest,invert,restore,project,attest,canonicalSource};
