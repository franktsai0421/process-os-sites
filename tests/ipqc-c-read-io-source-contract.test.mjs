import test from 'node:test';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import fs from 'node:fs';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{withoutWorkflowReadAhead,beforeHash,afterHash,before,after}=require('../scripts/ipqc-c-read-io-source-contract.cjs'),{createHash}=require('node:crypto');
const file='app/api/ipqc-c/workflow/route.ts',hash=b=>createHash('sha256').update(b).digest('hex');
const unified=require('../scripts/unified-draft-source-contract.cjs');
const read=file=>unified.project(unified.canonicalSource(fs.readFileSync(file),execFileSync('git',['show','HEAD:'+file])),file,'main');
void test('exact GET opt-in reverses to frozen source; missing/duplicate/unexpected drift fail closed',()=>{
 const current=read(file),prior=execFileSync('git',['show','429e178:'+file]);
 const lf=b=>b.toString().replaceAll('\r\n','\n');assert.equal(lf(fs.readFileSync(file)),lf(execFileSync('git',['show','HEAD:'+file])));
 assert.equal(hash(current),afterHash);assert.equal(hash(prior),beforeHash);assert.deepEqual(withoutWorkflowReadAhead(current),prior);
 const at=current.indexOf(after);assert(at>=0);assert.equal(current.indexOf(after,at+after.length),-1);
 const prefix=current.subarray(0,at),suffix=current.subarray(at+after.length);
 for(const changed of [Buffer.concat([prefix,suffix]),Buffer.concat([prefix,before,suffix]),Buffer.concat([prefix,after,after,suffix]),Buffer.concat([current,Buffer.from('\n// unexpected drift')]),Buffer.from(current.toString().replace("query.get('compact')==='1'","query.get('compact')!=='1'"))])assert.throws(()=>withoutWorkflowReadAhead(changed),/differs from pinned bytes/);
});
void test('direct Begin and Local Save chains reconstruct complete canonical history exactly once',()=>{
 const io=require('../scripts/ipqc-c-read-io-source-contract.cjs'),{withoutDurableBegin}=require('../scripts/workflow-begin-source-contract.cjs'),{withoutLocalAtomicSave}=require('../scripts/ipqc-c-local-save-source-contract.cjs');
 const current=read(file),canonical=execFileSync('git',['show','429e178:'+file]),preBegin=execFileSync('git',['show','cfb542926fa004392a3180b16aa887291fa74d4f:'+file]);
 const invert=io.withoutWorkflowReadAhead;let calls=0;io.withoutWorkflowReadAhead=bytes=>{calls++;return invert(bytes);};
 try{
  assert.deepEqual(withoutDurableBegin(current,file),preBegin);assert.equal(calls,1);
  calls=0;assert.deepEqual(withoutDurableBegin(canonical,file),preBegin);assert.equal(calls,0,'already canonical source is not inverted twice');
  const expected=withoutLocalAtomicSave(canonical,file);calls=0;assert.deepEqual(withoutLocalAtomicSave(current,file),expected);assert.equal(calls,1);assert.equal(hash(expected),'8e02233a3928309f28d478814610e4862fc8b331f20e273292f4f87f24c8eb07');
  const other='lib/versioned-shared-workflow.ts',otherCurrent=read(other),otherBefore=execFileSync('git',['show','cfb542926fa004392a3180b16aa887291fa74d4f:'+other]);
  calls=0;assert.deepEqual(withoutDurableBegin(otherCurrent,other),otherBefore);assert.equal(calls,0,'C inverse never applies to another route');
 }finally{io.withoutWorkflowReadAhead=invert;}
});
void test('Begin composition still rejects unknown hashes, partial opt-in removal, actor/CAS and wrong-route drift',()=>{
 const {withoutDurableBegin}=require('../scripts/workflow-begin-source-contract.cjs'),current=read(file),at=current.indexOf(after),prefix=current.subarray(0,at),suffix=current.subarray(at+after.length);
 for(const changed of [Buffer.concat([prefix,suffix]),Buffer.concat([prefix,after,after,suffix]),Buffer.concat([current,Buffer.from('\n// unknown source')]),...[["query.get('compact')==='1'","query.get('compact')!=='1'"],['receipt.actorId!==actor.id','false'],['if(changed.meta.changes!==1)continue;','if(false)continue;'],["    const workflowReadAhead=",'    const removedReadAhead=']].map(([from,to])=>{const altered=Buffer.from(current.toString().replace(from,to));assert.notDeepEqual(altered,current);return altered;})])assert.throws(()=>withoutDurableBegin(changed,file),/differs from pinned bytes/);
 assert.throws(()=>withoutDurableBegin(current,'lib/versioned-shared-workflow.ts'),/differs from pinned bytes/);
 for(const input of [current.toString(),new Uint8Array(current)])assert.throws(()=>withoutDurableBegin(input,file),/requires raw source bytes/);
});
