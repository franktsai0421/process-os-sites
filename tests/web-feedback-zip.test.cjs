/* oxlint-disable typescript/no-require-imports -- Isolated ZIP byte compatibility test. */
const assert=require('node:assert/strict');
const {zipFiles}=require('../scripts/ipqc-ab-import-harness.cjs')()('lib/web-feedback-zip.ts');
// Independent slow oracle; this is deliberately not the optimized table algorithm.
function referenceCRC(bytes){let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let bit=0;bit<8;bit++)crc=crc&1?0xedb88320^(crc>>>1):crc>>>1;}return(crc^0xffffffff)>>>0;}
assert.equal(referenceCRC(Buffer.from('123456789')),0xcbf43926);
const files=[{path:'空白.txt',bytes:Buffer.alloc(0)},{path:'Tiếng Việt/中文.txt',bytes:Buffer.from('123456789')},{path:'boundary.bin',bytes:Buffer.from(Array.from({length:65537},(_,i)=>i%256))},{path:'large.bin',bytes:Buffer.alloc(1024*1024,0xa7)}];
const zip=Buffer.from(zipFiles(files));let at=0;
const offsets=[];
for(const file of files){
 offsets.push(at);assert.equal(zip.readUInt32LE(at),0x04034b50);assert.equal(zip.readUInt16LE(at+6),0x800);assert.equal(zip.readUInt16LE(at+8),0);
 assert.equal(zip.readUInt32LE(at+14),referenceCRC(file.bytes));assert.equal(zip.readUInt32LE(at+18),file.bytes.length);
 const size=zip.readUInt16LE(at+26);assert.equal(zip.subarray(at+30,at+30+size).toString(),file.path);
 assert.deepEqual(zip.subarray(at+30+size,at+30+size+file.bytes.length),file.bytes);at+=30+size+file.bytes.length;
}
for(const [i,file] of files.entries()){
 assert.equal(zip.readUInt32LE(at),0x02014b50);assert.equal(zip.readUInt32LE(at+16),referenceCRC(file.bytes));assert.equal(zip.readUInt32LE(at+42),offsets[i]);at+=46+Buffer.byteLength(file.path);
}
assert.equal(zip.readUInt32LE(at),0x06054b50);assert.equal(zip.readUInt16LE(at+10),files.length);assert.equal(at+22,zip.length);
console.log('PASS ZIP CRC known vector, empty/boundary/large payloads, UTF-8 filenames, exact contents and central directory');
