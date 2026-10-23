import assert from 'node:assert/strict';import {PassThrough,Readable} from 'node:stream';
import {readNativeCredentials} from '../lib/snapshot-native-input.mjs';
const tests=[],sample={capabilityId:'ic_'+'1'.repeat(32),applicationToken:'s'.repeat(43),siteEntryToken:'SYNTHETIC_ENTRY_ONLY',transferId:'a'.repeat(64)};
async function test(name,run){await run();tests.push(name);}
const pipe=value=>Readable.from([Buffer.from(value)]);
await test('bounded pipe accepts only the four reviewed fields',async()=>assert.deepEqual(await readNativeCredentials(pipe(JSON.stringify(sample))),sample));
await test('interactive echo input is refused',async()=>{const p=new PassThrough();p.isTTY=true;await assert.rejects(readNativeCredentials(p),/PIPE_REQUIRED/);p.destroy();});
await test('oversized input refuses without reflecting content',async()=>assert.rejects(readNativeCredentials(pipe('x'.repeat(8193))),e=>e.message==='NATIVE_CREDENTIAL_INPUT_LIMIT'));
await test('invalid UTF8 and JSON return only stable codes',async()=>{for(const value of [Buffer.from([255]),Buffer.from('not-json')])await assert.rejects(readNativeCredentials(Readable.from([value])),e=>e.message==='NATIVE_CREDENTIAL_INPUT');});
await test('extra fields files cookies and malformed credentials are refused',async()=>{for(const v of [{...sample,cookie:'SYNTHETIC'},{...sample,applicationToken:'not-a-token'},{...sample,siteEntryToken:'bad header'},{...sample,transferId:'wrong'}])await assert.rejects(readNativeCredentials(pipe(JSON.stringify(v))),e=>e.message==='NATIVE_CREDENTIAL_INPUT');});
await test('waiting for an incomplete pipe has a finite deadline',async()=>{const p=new PassThrough();await assert.rejects(readNativeCredentials(p,{timeoutMs:10}),/INPUT_TIMEOUT/);assert.equal(p.listenerCount('data'),0);p.destroy();});
await test('cancellation interrupts stdin waiting without accepting credentials or leaking listeners',async()=>{const p=new PassThrough(),c=new AbortController(),pending=readNativeCredentials(p,{signal:c.signal});c.abort();await assert.rejects(pending,/NATIVE_CANCELLED/);assert.equal(p.listenerCount('data'),0);p.destroy();});
console.log(JSON.stringify({status:'PASS_SYNTHETIC_NATIVE_PIPE',cases:tests.length,tests,realCredentials:false,network:false}));
