import assert from 'node:assert/strict';import fs from 'node:fs';import {createRequire} from 'node:module';import {createHash} from 'node:crypto';
const require=createRequire(import.meta.url),ts=require('typescript'),source=fs.readFileSync(new URL('../lib/iqc-import-source.ts',import.meta.url),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {readIqcImportSource}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const data={ready:true,mappingSha256:'a'.repeat(64),snapshot:{categories:[],suppliers:[],parts:[],errors:[],items:[]}},bytes=new TextEncoder().encode(JSON.stringify(data)),hash=createHash('sha256').update(bytes).digest('hex'),config={key:'synthetic/iqc-source.json',sha256:hash};
function bucket(value=bytes,size=value.byteLength){return {async get(){return {size,body:new ReadableStream({start(controller){controller.enqueue(value);controller.close();}})}}};}
const tests=[];async function test(name,run){await run();tests.push({name,status:'PASS'});}
await test('missing/traversal/unpinned configuration refuses before bucket access',async()=>{const target={async get(){throw Error('MUST_NOT_READ')}};for(const value of [{},{key:'../x',sha256:hash},{key:config.key,sha256:'unknown'}])await assert.rejects(readIqcImportSource(target,value),/CONFIGURATION/);});
await test('known shape with independently pinned bytes loads from fake private storage',async()=>{assert.deepEqual(await readIqcImportSource(bucket(),config),data);});
await test('missing object and wrong hash refuse',async()=>{await assert.rejects(readIqcImportSource({async get(){return null}},config),/UNAVAILABLE/);await assert.rejects(readIqcImportSource(bucket(),{...config,sha256:'b'.repeat(64)}),/HASH/);});
await test('over-limit, short and excess content refuse',async()=>{for(const size of [8*1024*1024+1,bytes.length-1,bytes.length+1])await assert.rejects(readIqcImportSource(bucket(bytes,size),config),/UNAVAILABLE|SIZE/);});
await test('unrecognized readiness/structure and malformed UTF8 refuse',async()=>{for(const value of [new TextEncoder().encode('{"ready":false}'),new Uint8Array([255,254])]){const pin=createHash('sha256').update(value).digest('hex');await assert.rejects(readIqcImportSource(bucket(value),{...config,sha256:pin}));}});
const receipt={status:'PASS_IQC_PRIVATE_BASELINE_SYNTHETIC_ONLY',cases:tests.length,tests,network:false,SDK:false,realData:false,configuredRealSource:false};
if(process.env.IQC_SOURCE_TEST_REPORT)fs.writeFileSync(process.env.IQC_SOURCE_TEST_REPORT,JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(receipt));
