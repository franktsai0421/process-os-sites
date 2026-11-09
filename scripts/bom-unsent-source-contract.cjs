/* Test-only caller successor. Independent of older proof modules: no cycle,
 * no learned pins, no runtime transform and no predecessor rollback admission. */
const assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const hash=value=>createHash('sha256').update(value).digest('hex');
const raw=value=>assert(Buffer.isBuffer(value),'Unsent proof requires raw source bytes');
function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
const manifest=freeze(require('./bom-unsent-source-contract.json')),contract=manifest.contract;
function attestCurrent(bytes,file){raw(bytes);assert.equal(file,contract.file,'Unknown unsent source path');assert.equal(hash(bytes),contract.afterHash,'Current BOM authority dependency differs: unsent caller');assert.equal(bytes.length,contract.afterBytes,'Current unsent caller length differs');return true;}
// Exposed only for negative-control corruption tests; dispatch uses frozen data.
function invertContract(bytes,c){
 raw(bytes);assert.equal(hash(bytes),c.afterHash,'Unsent successor differs from pinned bytes');assert.equal(bytes.length,c.afterBytes,'Unsent byte length differs');assert(Array.isArray(c.rules)&&c.rules.length,'Unsent inverse requires spans');
 let afterEnd=0,beforeEnd=0,delta=0;const spans=c.rules.map(rule=>{
  assert.equal(typeof rule.before,'string');assert.equal(typeof rule.after,'string');const before=Buffer.from(rule.before),after=Buffer.from(rule.after),{beforeOffset,afterOffset}=rule;
  assert(Number.isSafeInteger(afterOffset)&&afterOffset>=afterEnd&&afterOffset+after.length<=bytes.length,'Unsent after offsets invalid');
  assert(Number.isSafeInteger(beforeOffset)&&beforeOffset>=beforeEnd&&beforeOffset+before.length<=c.beforeBytes&&beforeOffset===afterOffset-delta,'Unsent before offsets invalid');
  assert.deepEqual(bytes.subarray(afterOffset,afterOffset+after.length),after,'Exact unsent span differs');afterEnd=afterOffset+after.length;beforeEnd=beforeOffset+before.length;delta+=after.length-before.length;return{before,after,afterOffset};
 });
 assert.equal(bytes.length-delta,c.beforeBytes,'Unsent predecessor length differs');let result=Buffer.from(bytes);for(const {before,after,afterOffset}of spans.reverse())result=Buffer.concat([result.subarray(0,afterOffset),before,result.subarray(afterOffset+after.length)]);assert.equal(hash(result),c.beforeHash,'Unsent complete predecessor differs');return result;
}
function withoutUnsent(bytes,file){attestCurrent(bytes,file);return invertContract(bytes,contract);}
function projectUnsent(bytes,file){raw(bytes);return file===contract.file&&hash(bytes)===contract.afterHash?withoutUnsent(bytes,file):bytes;}
module.exports={manifest,contract,attestCurrent,withoutUnsent,projectUnsent,invertContract};
