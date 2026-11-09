/* Test-only exact raw-byte source projections. No application imports this file.
 * Named predecessors remain distinct; added files never gain invented history. */
const assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const blob=bytes=>createHash('sha1').update(Buffer.from('blob '+bytes.length+'\0')).update(bytes).digest('hex');
const raw=bytes=>assert(Buffer.isBuffer(bytes),'Unified source proof requires raw source bytes');
const path=file=>assert(typeof file==='string'&&file.length&&file.split('/').every(part=>part&&part!=='.'&&part!=='..')&&!/[\\:]/.test(file),'Unified source wrong file');
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const integer=value=>Number.isSafeInteger(value)&&value>=0;
function metadata(value){assert(value&&integer(value.bytes)&&/^[a-f0-9]{64}$/.test(value.sha256)&&/^[a-f0-9]{40}$/.test(value.blob),'Unified source invalid metadata');}
function attestBytes(bytes,meta){raw(bytes);metadata(meta);assert.equal(bytes.length,meta.bytes,'Unified source differs from pinned byte length');assert.equal(hash(bytes),meta.sha256,'Unified source differs from pinned bytes');assert.equal(blob(bytes),meta.blob,'Unified source differs from pinned Git blob');}
function span(value){assert.equal(typeof value,'string','Unified source span must be base64');const bytes=Buffer.from(value,'base64');assert.equal(bytes.toString('base64'),value,'Unified source span is not canonical base64');return bytes;}
function invert(bytes,contract){
 raw(bytes);path(contract.file);assert(contract.before,'Unified added source has no predecessor');attestBytes(bytes,contract.after);metadata(contract.before);
 assert(Array.isArray(contract.rules)&&contract.rules.length,'Unified source inverse requires exact spans');let end=0,priorEnd=0,delta=0;
 const rules=contract.rules.map(rule=>{const before=span(rule.before),after=span(rule.after);assert(before.length||after.length,'Unified source empty span');
  assert(integer(rule.afterOffset)&&rule.afterOffset>=end&&rule.afterOffset+after.length<=bytes.length,'Unified source after offset invalid');
  assert(integer(rule.beforeOffset)&&rule.beforeOffset>=priorEnd&&rule.beforeOffset+before.length<=contract.before.bytes&&rule.beforeOffset===rule.afterOffset-delta,'Unified source before offset invalid');
  assert.deepEqual(bytes.subarray(rule.afterOffset,rule.afterOffset+after.length),after,'Unified source exact span changed');
  end=rule.afterOffset+after.length;priorEnd=rule.beforeOffset+before.length;delta+=after.length-before.length;return{offset:rule.afterOffset,before,after};});
 assert.equal(bytes.length-delta,contract.before.bytes,'Unified source predecessor length differs');let result=Buffer.from(bytes);
 for(const rule of rules.reverse())result=Buffer.concat([result.subarray(0,rule.offset),rule.before,result.subarray(rule.offset+rule.after.length)]);
 attestBytes(result,contract.before);return result;
}
function canonicalSource(working,committed){
 raw(working);raw(committed);const lf=bytes=>{const result=Buffer.alloc(bytes.length);let length=0;for(let i=0;i<bytes.length;i++){if(bytes[i]===13&&bytes[i+1]===10)continue;result[length++]=bytes[i];}return result.subarray(0,length);};
 assert.deepEqual(lf(working),lf(committed),'Unified source checkout differs from HEAD beyond EOL');return committed;
}
// Indexed transport is decoded losslessly before the original V1 verifier.
// Keep the hash-keyed pool and every old span/hash/offset check unchanged.
function decodeIndexedManifest(manifest){
 if(manifest?.encoding!=='content-addressed-base64-indexed-spans-v2'){assert(manifest?.spanRefs===undefined,'Unified unexpected span index');return manifest;}
 assert(manifest.spans&&typeof manifest.spans==='object'&&!Array.isArray(manifest.spans),'Unified indexed span pool required');
 const refs=manifest.spanRefs,keys=Object.keys(manifest.spans).sort();
 assert(Array.isArray(refs)&&refs.length===keys.length&&keys.every((key,index)=>Object.hasOwn(refs,index)&&/^[a-f0-9]{64}$/.test(refs[index])&&refs[index]===key),'Unified span index must exactly list sorted unique pool keys');
 assert(Array.isArray(manifest.projections),'Unified indexed projections required');
 const decoded=structuredClone(manifest);
 for(const entry of decoded.projections){assert(Array.isArray(entry.rules),'Unified indexed rules required');for(const rule of entry.rules){
  assert(Reflect.ownKeys(rule).length===4&&['beforeOffset','afterOffset','beforeRef','afterRef'].every(key=>Object.hasOwn(rule,key)),'Unified indexed mixed or unknown span fields');
  for(const side of ['before','after']){const index=rule[side+'Ref'];assert(integer(index)&&!Object.is(index,-0)&&index<refs.length,'Unified span index out of bounds');rule[side+'Ref']=refs[index];}
 }}
 delete decoded.spanRefs;decoded.encoding='content-addressed-base64-spans-v1';return decoded;
}
function createSourceContract(manifest){
 manifest=decodeIndexedManifest(manifest);
 assert(manifest?.format==='PROCESS_OS_UNIFIED_SOURCE_V1','Unified source format required');
 assert(manifest.source&&/^[a-f0-9]{40}$/.test(manifest.source.commit)&&/^[a-f0-9]{40}$/.test(manifest.source.tree),'Unified source commit/tree required');
 assert(manifest.targets&&Object.keys(manifest.targets).length,'Unified source named targets required');
 for(const [name,value]of Object.entries(manifest.targets))assert(/^[a-z][a-z0-9_-]*$/.test(name)&&/^[a-f0-9]{40}$/.test(value.commit)&&/^[a-f0-9]{40}$/.test(value.tree),'Unified source target commit/tree required');
 assert(Array.isArray(manifest.current)&&manifest.current.length,'Unified current source ledger required');const files=new Set();
 for(const entry of manifest.current){path(entry.file);assert(!files.has(entry.file),'Unified duplicate current file');files.add(entry.file);metadata(entry);}
 assert(Array.isArray(manifest.projections),'Unified projections required');const keys=new Set();
 for(const entry of manifest.projections){path(entry.file);assert(Object.hasOwn(manifest.targets,entry.target),'Unified source unknown target');const key=entry.target+':'+entry.file;assert(!keys.has(key),'Unified duplicate target/file');keys.add(key);assert(files.has(entry.file),'Unified source projection absent from current ledger');metadata(entry.after);metadata(entry.before);const current=manifest.current.find(item=>item.file===entry.file);assert.equal(entry.after.sha256,current.sha256,'Unified projection/current mismatch');assert.equal(entry.after.blob,current.blob,'Unified projection/current mismatch');assert.equal(entry.after.bytes,current.bytes,'Unified projection/current mismatch');assert.notEqual(entry.before.sha256,entry.after.sha256,'Unified unchanged source needs no inverse');}
 assert(Array.isArray(manifest.added),'Unified added-source ledger required');const additions=new Set();
 for(const entry of manifest.added){path(entry.file);assert(Object.hasOwn(manifest.targets,entry.absentFrom)&&files.has(entry.file),'Unified added-source target/file invalid');const key=entry.absentFrom+':'+entry.file;assert(!additions.has(key)&&!keys.has(key),'Unified added-source conflicts with existing predecessor');additions.add(key);}
 if(manifest.spans!==undefined){
  assert(manifest.encoding==='content-addressed-base64-spans-v1'&&manifest.spans&&typeof manifest.spans==='object'&&!Array.isArray(manifest.spans),'Unified span pool encoding invalid');const pool=new Map();
  for(const [key,entry]of Object.entries(manifest.spans)){assert(/^[a-f0-9]{64}$/.test(key)&&entry.sha256===key&&integer(entry.bytes),'Unified span pool metadata invalid');const bytes=span(entry.base64);assert.equal(bytes.length,entry.bytes,'Unified span pool length mismatch');assert.equal(hash(bytes),key,'Unified span pool hash mismatch');pool.set(key,entry.base64);}
  for(const entry of manifest.projections)for(const rule of entry.rules){assert(rule.before===undefined&&rule.after===undefined&&pool.has(rule.beforeRef)&&pool.has(rule.afterRef),'Unified span pool reference invalid');rule.before=pool.get(rule.beforeRef);rule.after=pool.get(rule.afterRef);}
 }else assert(manifest.encoding===undefined,'Unified span pool missing');
 freeze(manifest);
 const target=name=>assert(Object.hasOwn(manifest.targets,name),'Unified source unknown target');
 function restore(bytes,file,name){raw(bytes);path(file);target(name);const contract=manifest.projections.find(item=>item.file===file&&item.target===name);assert(contract,'Unified source wrong file or no predecessor');return invert(bytes,contract);}
 // Only exact final bytes dispatch. Unknown mutations stay unchanged so the
 // existing predecessor rejection probes cannot be hidden by normalization.
 function project(bytes,file,name){raw(bytes);path(file);target(name);const entry=manifest.projections.find(item=>item.file===file&&item.target===name);return entry&&hash(bytes)===entry.after.sha256?restore(bytes,file,name):bytes;}
 function attest(read){assert.equal(typeof read,'function','Unified source reader required');for(const entry of manifest.current)attestBytes(read(entry.file),entry);return true;}
 return Object.freeze({manifest,restore,project,attest,canonicalSource,invert});
}
module.exports=Object.freeze({createSourceContract,canonicalSource,invert,decodeIndexedManifest});
