import test from 'node:test';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import fs from 'node:fs';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{withoutWorkflowReadAhead,beforeHash,afterHash,before,after}=require('../scripts/ipqc-c-read-io-source-contract.cjs'),{createHash}=require('node:crypto');
const file='app/api/ipqc-c/workflow/route.ts',hash=b=>createHash('sha256').update(b).digest('hex');
void test('exact GET opt-in reverses to frozen source; missing/duplicate/unexpected drift fail closed',()=>{
 const current=execFileSync('git',['show','HEAD:'+file]),prior=execFileSync('git',['show','429e178:'+file]);
 const lf=b=>b.toString().replaceAll('\r\n','\n');assert.equal(lf(fs.readFileSync(file)),lf(current));
 assert.equal(hash(current),afterHash);assert.equal(hash(prior),beforeHash);assert.deepEqual(withoutWorkflowReadAhead(current),prior);
 const at=current.indexOf(after);assert(at>=0);assert.equal(current.indexOf(after,at+after.length),-1);
 const prefix=current.subarray(0,at),suffix=current.subarray(at+after.length);
 for(const changed of [Buffer.concat([prefix,suffix]),Buffer.concat([prefix,before,suffix]),Buffer.concat([prefix,after,after,suffix]),Buffer.concat([current,Buffer.from('\n// unexpected drift')]),Buffer.from(current.toString().replace("query.get('compact')==='1'","query.get('compact')!=='1'"))])assert.throws(()=>withoutWorkflowReadAhead(changed),/differs from pinned bytes/);
});
