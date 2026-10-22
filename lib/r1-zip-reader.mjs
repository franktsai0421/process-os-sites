// Local read-only ZIP32 STORE/DEFLATE reader. No extraction or payload logging.
import fs from 'node:fs';
import {open} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createInflateRaw} from 'node:zlib';
import {logicalMemberPath} from './r1-private-media.mjs';
const table=Uint32Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
export function zipCRC(bytes,prior=0){let crc=(prior^0xffffffff)>>>0;for(const byte of bytes)crc=table[(crc^byte)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;}
const fail=code=>{throw Error(code);};
function zipName(bytes){let name;try{name=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{fail('R1_ZIP_NAME');}if(!logicalMemberPath(name)||name.split('/').some(part=>part==='.'||!part||/[ .]$/.test(part)))fail('R1_ZIP_PATH');return name;}
function extras(bytes){let at=0;while(at<bytes.length){if(at+4>bytes.length)fail('R1_ZIP_EXTRA');const id=bytes.readUInt16LE(at),size=bytes.readUInt16LE(at+2);if(at+4+size>bytes.length)fail('R1_ZIP_EXTRA');if(![0x5455,0x7875,0x000a].includes(id))fail('R1_ZIP_EXTRA_UNSUPPORTED');at+=4+size;}}
export async function openR1Zip({file,expectedBytes,expectedSha256,onProgress=()=>{}}){
 if(!Number.isSafeInteger(expectedBytes)||expectedBytes<22||!/^[a-f0-9]{64}$/.test(expectedSha256||''))fail('R1_ZIP_INPUT_PIN');
 const handle=await open(file,'r');let closed=false;const channels=new Map(),verified=new Set();
 const initial=await handle.stat({bigint:true});
 const stats={inputBytes:expectedBytes,entries:0,declaredBytes:0,verifiedCRC:0,inflations:0,readCalls:0,largestRange:0,largestInflatedBlock:0,inflatedBytes:0};let lastProgress=Date.now();
 function stable(stat){if(['size','ino','mtimeNs','ctimeNs'].some(key=>stat[key]!==initial[key]))fail('R1_ZIP_SOURCE_CHANGED');}
 async function read(at,size){if(!Number.isSafeInteger(at)||!Number.isSafeInteger(size)||at<0||size<0||at+size>expectedBytes)fail('R1_ZIP_RANGE');const buffer=Buffer.alloc(size);let offset=0;while(offset<size){const {bytesRead}=await handle.read(buffer,offset,size-offset,at+offset);if(!bytesRead)fail('R1_ZIP_TRUNCATED');offset+=bytesRead;}return buffer;}
 async function hashInput(){const hash=createHash('sha256');for(let at=0;at<expectedBytes;at+=1048576)hash.update(await read(at,Math.min(1048576,expectedBytes-at)));if(hash.digest('hex')!==expectedSha256)fail('R1_ZIP_INPUT_CHECKSUM');stable(await handle.stat({bigint:true}));}
 function drop(channel){channel.output.destroy();if(channel.output!==channel.raw)channel.raw.destroy();}
 async function close(){if(closed)return;closed=true;for(const channel of channels.values())drop(channel);channels.clear();await handle.close();}
 try{
  if(initial.size!==BigInt(expectedBytes))fail('R1_ZIP_INPUT_SIZE');await hashInput();onProgress({stage:'input-pinned',bytes:expectedBytes});
  const tailStart=Math.max(0,expectedBytes-65557),tail=await read(tailStart,expectedBytes-tailStart);let eocd=-1;
  for(let at=tail.length-22;at>=0;at--)if(tail.readUInt32LE(at)===0x06054b50&&at+22+tail.readUInt16LE(at+20)===tail.length){eocd=at;break;}
  if(eocd<0)fail('R1_ZIP_EOCD');const end=tail.subarray(eocd),count=end.readUInt16LE(10),centralBytes=end.readUInt32LE(12),centralAt=end.readUInt32LE(16);
  if(end.readUInt16LE(4)||end.readUInt16LE(6)||end.readUInt16LE(8)!==count||count===65535||centralAt===0xffffffff||centralBytes===0xffffffff)fail('R1_ZIP_ZIP64_OR_MULTIDISK');
  if(!count||count>14000||centralBytes>8*1024*1024||centralAt+centralBytes!==tailStart+eocd)fail('R1_ZIP_DIRECTORY');
  const central=await read(centralAt,centralBytes),entries=new Map(),folded=new Set();let at=0,total=0;
  for(let i=0;i<count;i++){
   if(at+46>central.length||central.readUInt32LE(at)!==0x02014b50)fail('R1_ZIP_DIRECTORY');const row=central.subarray(at),flags=row.readUInt16LE(8),method=row.readUInt16LE(10),crc=row.readUInt32LE(16),compressed=row.readUInt32LE(20),bytes=row.readUInt32LE(24),nameBytes=row.readUInt16LE(28),extraBytes=row.readUInt16LE(30),commentBytes=row.readUInt16LE(32),localAt=row.readUInt32LE(42),recordBytes=46+nameBytes+extraBytes+commentBytes;
   if(at+recordBytes>central.length)fail('R1_ZIP_DIRECTORY');if(flags&~0x080e||![0,8].includes(method)||row.readUInt16LE(6)>20||row.readUInt16LE(34)||[compressed,bytes,localAt].includes(0xffffffff))fail('R1_ZIP_FORMAT_UNSUPPORTED');
   if((row.readUInt32LE(38)>>>16&0xf000)===0xa000)fail('R1_ZIP_LINK');const name=zipName(row.subarray(46,46+nameBytes));if(folded.has(name.toLowerCase()))fail('R1_ZIP_DUPLICATE');folded.add(name.toLowerCase());extras(row.subarray(46+nameBytes,46+nameBytes+extraBytes));
   if(!bytes||!compressed||method===0&&bytes!==compressed)fail('R1_ZIP_SIZE');total+=bytes;if(!Number.isSafeInteger(total)||total>64*1024**3)fail('R1_ZIP_CAPACITY');
   entries.set(name,{name,flags,method,crc,compressed,bytes,localAt,nameRaw:row.subarray(46,46+nameBytes)});at+=recordBytes;
  }
  if(at!==central.length)fail('R1_ZIP_DIRECTORY');let nextAt=0;
  for(const entry of [...entries.values()].sort((a,b)=>a.localAt-b.localAt)){
   if(entry.localAt!==nextAt)fail('R1_ZIP_LOCAL_COVERAGE');const local=await read(entry.localAt,30);if(local.readUInt32LE(0)!==0x04034b50||local.readUInt16LE(4)>20||local.readUInt16LE(6)!==entry.flags||local.readUInt16LE(8)!==entry.method)fail('R1_ZIP_LOCAL_HEADER');
   const nameBytes=local.readUInt16LE(26),extraBytes=local.readUInt16LE(28),variable=await read(entry.localAt+30,nameBytes+extraBytes);if(!variable.subarray(0,nameBytes).equals(entry.nameRaw))fail('R1_ZIP_LOCAL_NAME');extras(variable.subarray(nameBytes));
   const localValues=[local.readUInt32LE(14),local.readUInt32LE(18),local.readUInt32LE(22)],expected=[entry.crc,entry.compressed,entry.bytes];if(localValues.some((value,i)=>(!(entry.flags&8)||value!==0)&&value!==expected[i]))fail('R1_ZIP_LOCAL_SIZE');
   entry.dataAt=entry.localAt+30+nameBytes+extraBytes;nextAt=entry.dataAt+entry.compressed;if(nextAt>centralAt)fail('R1_ZIP_OVERLAP');
   if(entry.flags&8){const lead=await read(nextAt,4),signed=lead.readUInt32LE(0)===0x08074b50,descriptor=await read(nextAt+(signed?4:0),12);if(expected.some((value,i)=>descriptor.readUInt32LE(i*4)!==value))fail('R1_ZIP_DESCRIPTOR');nextAt+=signed?16:12;}
  }
  if(nextAt!==centralAt)fail('R1_ZIP_LOCAL_COVERAGE');stats.entries=count;stats.declaredBytes=total;onProgress({stage:'directory-validated',entries:count,declaredBytes:total});
  function channelFor(entry){let channel=channels.get(entry.name);if(channel){channels.delete(entry.name);channels.set(entry.name,channel);return channel;}while(channels.size>=4){const [key,old]=channels.entries().next().value;drop(old);channels.delete(key);}
   const fd=fs.openSync(file,'r');try{stable(fs.fstatSync(fd,{bigint:true}));}catch(error){fs.closeSync(fd);throw error;}
   const raw=fs.createReadStream(file,{fd,autoClose:true,start:entry.dataAt,end:entry.dataAt+entry.compressed-1,highWaterMark:65536}),output=entry.method===8?raw.pipe(createInflateRaw({chunkSize:65536,highWaterMark:65536})):raw;
   raw.on('error',()=>{if(output!==raw)output.destroy(Error('R1_ZIP_IO'));});channel={raw,output,iterator:output[Symbol.asyncIterator](),cursor:0,produced:0,crc:0,buffer:Buffer.alloc(0),done:false};channels.set(entry.name,channel);stats.inflations++;return channel;
  }
  async function fill(channel,entry){if(channel.done)return;let result;try{result=await channel.iterator.next();}catch{fail('R1_ZIP_DEFLATE_OR_IO');}
   if(result.done){channel.done=true;if(channel.produced!==entry.bytes||channel.crc!==entry.crc||entry.method===8&&channel.output.bytesWritten!==entry.compressed)fail('R1_ZIP_CRC_OR_SIZE');verified.add(entry.name);stats.verifiedCRC=verified.size;return;}
   const bytes=result.value;if(bytes.length>1048576)fail('R1_ZIP_BUFFER_LIMIT');stats.largestInflatedBlock=Math.max(stats.largestInflatedBlock,bytes.length);stats.inflatedBytes+=bytes.length;if(Date.now()-lastProgress>=10000){lastProgress=Date.now();onProgress({stage:'bounded-decompression',verifiedCRC:verified.size,inflatedBytes:stats.inflatedBytes});}channel.produced+=bytes.length;if(channel.produced>entry.bytes)fail('R1_ZIP_DECLARED_SIZE_EXCEEDED');channel.crc=zipCRC(bytes,channel.crc);channel.buffer=bytes;
  }
  async function readRange(name,offset,length){if(closed)fail('R1_ZIP_CLOSED');const entry=entries.get(name);if(!entry)fail('R1_ZIP_MEMBER_MISSING');if(!Number.isSafeInteger(offset)||!Number.isSafeInteger(length)||offset<0||length<1||length>1048576||offset+length>entry.bytes)fail('R1_ZIP_RANGE');stats.readCalls++;stats.largestRange=Math.max(stats.largestRange,length);
   let channel=channels.get(name);if(channel&&offset<channel.cursor){drop(channel);channels.delete(name);}channel=channelFor(entry);const result=new Uint8Array(length);let copied=0;
   while(channel.cursor<offset+length){if(!channel.buffer.length)await fill(channel,entry);if(channel.done)fail('R1_ZIP_SHORT_MEMBER');const skip=Math.min(channel.buffer.length,Math.max(0,offset-channel.cursor));if(skip){channel.buffer=channel.buffer.subarray(skip);channel.cursor+=skip;continue;}const take=Math.min(channel.buffer.length,length-copied);result.set(channel.buffer.subarray(0,take),copied);channel.buffer=channel.buffer.subarray(take);channel.cursor+=take;copied+=take;}
   if(channel.cursor===entry.bytes){await fill(channel,entry);if(!channel.done)fail('R1_ZIP_DECLARED_SIZE_EXCEEDED');}return result;
  }
  let queue=Promise.resolve();
  return {stats,members:{async list(){stable(await handle.stat({bigint:true}));return [...entries.values()].map(entry=>({path:entry.name,bytes:entry.bytes}));},readRange(...args){const result=queue.then(()=>readRange(...args));queue=result.catch(()=>{});return result;}},async verifyInput(){await queue;stable(await handle.stat({bigint:true}));await hashInput();if(verified.size!==count)fail('R1_ZIP_MEMBER_NOT_VERIFIED');return {...stats};},close};
 }catch(error){await close();throw error;}
}
