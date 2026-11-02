import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createRequire} from 'node:module';import {execFileSync} from 'node:child_process';
const require=createRequire(import.meta.url),{withoutNavigationTiming}=require('../scripts/navigation-timing-source-contract.cjs'),proof=require('../scripts/navigation-timing-source-spans.json');
// Only the working-checkout fence accepts CR immediately before LF. It compares
// bytes, never decoded text, whitespace trimming or other normalization. The
// exact inverse below still receives committed bytes and rejects EOL tampering.
function checkoutLF(bytes){
 const result=Buffer.alloc(bytes.length);let length=0;
 for(let i=0;i<bytes.length;i++)if(bytes[i]!==13||bytes[i+1]!==10)result[length++]=bytes[i];
 return result.subarray(0,length);
}
function assertCheckoutEquivalent(working,committed){assert.deepEqual(checkoutLF(working),checkoutLF(committed),'working source differs beyond LF/CRLF checkout conversion');}
for(const [file,contract] of Object.entries(proof.files)){
 const raw=execFileSync('git',['show','HEAD:'+file]),working=fs.readFileSync(file);
 await test('exact diagnostic inverse and tamper rejection: '+file,()=>{
  const baseline=execFileSync('git',['show',proof.base+':'+file]);assert.deepEqual(withoutNavigationTiming(file,raw),baseline);
  for(const span of contract.spans){const added=Buffer.from(span.candidate),at=raw.indexOf(added);assert(at>=0);const changed=Buffer.from(raw);changed[at]^=1;
   for(const mutation of [changed,Buffer.concat([raw,added]),Buffer.concat([raw.subarray(0,at),raw.subarray(at+added.length)])])assert.throws(()=>withoutNavigationTiming(file,mutation),{code:'ERR_ASSERTION'});
  }
  const changedOutside=Buffer.from(raw);changedOutside[raw.length-1]^=1;assert.throws(()=>withoutNavigationTiming(file,changedOutside),{code:'ERR_ASSERTION'});
  assert.throws(()=>withoutNavigationTiming(file,Buffer.concat([raw,Buffer.from(' ')])),{code:'ERR_ASSERTION'});
  const otherEol=Buffer.from(raw.includes(13)?raw.toString().replace(/\r\n/g,'\n'):raw.toString().replace(/\n/g,'\r\n'));assert.notDeepEqual(otherEol,raw);assert.throws(()=>withoutNavigationTiming(file,otherEol),{code:'ERR_ASSERTION'});
 });
 await test('working checkout permits LF/CRLF only and rejects content tampering: '+file,()=>{
  assertCheckoutEquivalent(working,raw);
  const lf=checkoutLF(raw),crlf=Buffer.concat([...lf].map(byte=>byte===10?Buffer.from([13,10]):Buffer.from([byte])));
  assertCheckoutEquivalent(lf,raw);assertCheckoutEquivalent(crlf,raw);
  const changed=Buffer.from(working);changed[0]^=1;const invalidUtf8=Buffer.from(working);invalidUtf8[0]=255;
  for(const mutation of [changed,invalidUtf8,Buffer.concat([working,Buffer.from(' ')]),Buffer.concat([working,Buffer.from('\r')]),working.subarray(0,working.length-1)])assert.throws(()=>assertCheckoutEquivalent(mutation,raw),{code:'ERR_ASSERTION'});
 });
}
