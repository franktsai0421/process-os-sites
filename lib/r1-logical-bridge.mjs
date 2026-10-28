// Confirmed R1 metadata -> normalized logical members -> Snapshot V1.
// The caller supplies decompressed members; this is not an outer ZIP opener.
import {createHash} from 'node:crypto';
import {createLogicalSnapshotSource} from './snapshot-d1-r2.mjs';
import {objectEncoding,maximumJsonBytes} from './snapshot-redaction.mjs';
import {preparePrivateMedia,logicalMemberPath} from './r1-private-media.mjs';
import {requireProgramCommit} from './sites-publication-readiness.mjs';
import {parseR1Json,validateR1Database,exactFields} from './r1-contract.mjs';
import {decodeStrictR1Layout} from './r1-strict-layout.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),encode=value=>new TextEncoder().encode(JSON.stringify(value));
const digest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const parseMetadata=parseR1Json;
const validateTables=validateR1Database;
export function decodeR1ManifestLayout(options){if(!options)throw Error('R1_STRICT_INPUT_REQUIRED');return decodeStrictR1Layout(options);}
export async function createR1StrictSource(options){const decoded=await decodeR1ManifestLayout(options);const source=await createR1LogicalSource({...decoded,programCommit:options.programCommit});source.origin.delivery=decoded.delivery;return source;}
export async function createR1LogicalSource({members,layout,manifestSha256,programCommit}){
  requireProgramCommit({PROCESS_PROGRAM_COMMIT:programCommit});
  if(layout?.format!=='PROCESS_OS_R1_EXPLICIT_LOGICAL_LAYOUT_V1'||layout.manifestSha256!==manifestSha256||!digest(manifestSha256)||!Array.isArray(layout.objects)||!Array.isArray(layout.assets))throw Error('R1_DESCRIPTOR_SCHEMA_EVIDENCE_REQUIRED');
  exactFields(layout,['format','manifestSha256','objects','assets'],['auxiliary'],'R1_LAYOUT_FIELDS');
  const auxiliary=layout.auxiliary||[];if(!Array.isArray(auxiliary)||auxiliary.length>10)throw Error('R1_AUXILIARY_FIELDS');
  if(typeof members?.list!=='function'||typeof members?.readRange!=='function')throw Error('R1_LOGICAL_MEMBER_READER_REQUIRED');
  const layoutSha256=sha(encode(layout)),pins=new Map(),caseNames=new Set();
  const inventory=await members.list();if(!Array.isArray(inventory)||inventory.length>14000)throw Error('R1_MEMBER_INVENTORY');
  for(const member of inventory){
    if(!logicalMemberPath(member.path)||caseNames.has(member.path.toLowerCase())||!Number.isSafeInteger(member.bytes)||member.bytes<0)throw Error('R1_MEMBER_INVENTORY');
    caseNames.add(member.path.toLowerCase());pins.set(member.path,{...member});if(pins.size>14000)throw Error('R1_MEMBER_LIMIT');
  }
  async function readRange(member,offset,length){const pin=pins.get(member);if(!pin)throw Error('R1_MEMBER_MISSING');if(offset<0||length<0||length>1_048_576||offset+length>pin.bytes)throw Error('R1_MEMBER_RANGE');const bytes=await members.readRange(member,offset,length);if(!(bytes instanceof Uint8Array)||bytes.length!==length)throw Error('R1_MEMBER_SHORT_READ');return bytes;}
  async function readSmall(member,expected){const pin=pins.get(member);if(!pin)throw Error('R1_MEMBER_MISSING');if(pin.bytes>maximumJsonBytes)throw Error('R1_METADATA_LIMIT');const bytes=new Uint8Array(pin.bytes);for(let offset=0;offset<bytes.length;offset+=65536)bytes.set(await readRange(member,offset,Math.min(65536,bytes.length-offset)),offset);if(sha(bytes)!==expected)throw Error('R1_MEMBER_CHECKSUM');return bytes;}
  const manifest=parseMetadata(await readSmall('manifest.json',manifestSha256));
  if(manifest.format!=='PROCESS_OS_PRIVATE_DEV_PACKAGE_V1_PROTOTYPE'||!digest(manifest.databaseSha256)||!Array.isArray(manifest.objects)||manifest.objects.length>10000)throw Error('R1_MANIFEST_FORMAT_UNSUPPORTED');
  const databaseSha256=manifest.databaseSha256,tables=validateTables(parseMetadata(await readSmall('database.json',databaseSha256)));
  if(!Number.isSafeInteger(manifest.sourceRevision)||manifest.sourceRevision!==tables.shared_state[0].revision)throw Error('R1_SOURCE_REVISION_MISMATCH');
  const expectedMembers=new Set(['manifest.json','database.json']),descriptors=new Map(),expectedHashes=new Map();
  for(const object of manifest.objects){if(!digest(object?.sha256))throw Error('R1_MANIFEST_OBJECT_HASH');expectedHashes.set(object.sha256,(expectedHashes.get(object.sha256)||0)+1);}
  for(const object of layout.objects){
    if(!object||typeof object.key!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9_./-]{0,500}$/.test(object.key)||object.key.includes('..')||descriptors.has(object.key)||!digest(object.sha256)||object.member!=='objects/'+object.sha256||!Number.isSafeInteger(object.bytes)||object.bytes<1)throw Error('R1_LOGICAL_OBJECT_DESCRIPTOR');
    const count=expectedHashes.get(object.sha256)||0;if(!count)throw Error('R1_LOGICAL_MAPPING_COVERAGE');expectedHashes.set(object.sha256,count-1);
    const pin=pins.get(object.member);if(!pin)throw Error('R1_MEMBER_MISSING');if(pin.bytes!==object.bytes)throw Error('R1_MEMBER_SIZE');
    let encoding=objectEncoding(object);if(encoding==='json'&&object.bytes>maximumJsonBytes){if(!/^(snapshots|state-records\/v1|delivery\/v1)\//.test(object.key))throw Error('R1_JSON_FORMAT_LIMIT');encoding='json-stream';}
    descriptors.set(object.key,{...object,size:object.bytes,encoding,etag:object.sha256,httpMetadata:object.httpMetadata||{},customMetadata:object.customMetadata||{}});expectedMembers.add(object.member);
  }
  if([...expectedHashes.values()].some(count=>count!==0))throw Error('R1_LOGICAL_MAPPING_COVERAGE');
  for(const asset of layout.assets){const pin=pins.get(asset.member);if(!pin)throw Error('R1_MEMBER_MISSING');if(pin.bytes!==asset.bytes)throw Error('R1_MEMBER_SIZE');expectedMembers.add(asset.member);}
  for(const item of auxiliary){exactFields(item,['member','bytes','sha256','kind'],[],'R1_AUXILIARY_FIELDS');if(!logicalMemberPath(item.member)||expectedMembers.has(item.member)||!Number.isSafeInteger(item.bytes)||item.bytes<1||item.bytes>8*1024*1024||!digest(item.sha256)||!['checksum','provenance','distribution-readme','static-index','source-program-ui'].includes(item.kind))throw Error('R1_AUXILIARY_FIELDS');const pin=pins.get(item.member);if(!pin)throw Error('R1_MEMBER_MISSING');if(pin.bytes!==item.bytes)throw Error('R1_MEMBER_SIZE');expectedMembers.add(item.member);}
  if(pins.size!==expectedMembers.size||[...pins.keys()].some(name=>!expectedMembers.has(name)))throw Error('R1_UNMAPPED_MEMBER');
  const media=await preparePrivateMedia(layout.assets,readRange),generated=new Map();
  for(const object of media.objects){if(descriptors.has(object.key))throw Error('R1_PRIVATE_ASSET_COLLISION');descriptors.set(object.key,{...object,encoding:'binary',etag:object.sha256});}
  if(media.objects.length){const key='company-assets/index.json',bytes=media.indexBytes;if(descriptors.has(key))throw Error('R1_PRIVATE_ASSET_COLLISION');generated.set(key,bytes);descriptors.set(key,{key,size:bytes.length,sha256:sha(bytes),etag:sha(bytes),encoding:'json',httpMetadata:{contentType:'application/json'},customMetadata:{}});}
  if(descriptors.size>10000)throw Error('R1_LOGICAL_OBJECT_LIMIT');
  const objects=[...descriptors.values()].map(({member:_member,bytes:_bytes,sha256:_sha256,...object})=>object).sort((a,b)=>a.key.localeCompare(b.key,'en'));
  async function objectRange(key,offset,length){const item=descriptors.get(key);if(!item)throw Error('R1_OBJECT_MISSING');const generatedBytes=generated.get(key);return generatedBytes?generatedBytes.slice(offset,offset+length):readRange(item.member,offset,length);}
  function readObject(key){const item=descriptors.get(key);if(!item)throw Error('R1_OBJECT_MISSING');let offset=0;const hash=createHash('sha256');return {size:item.size,etag:item.etag,body:new ReadableStream({async pull(controller){if(offset===item.size){if(hash.digest('hex')!==item.sha256)throw Error('R1_MEMBER_CHECKSUM');controller.close();return;}const length=Math.min(65536,item.size-offset),bytes=await objectRange(key,offset,length);offset+=bytes.length;hash.update(bytes);controller.enqueue(bytes);}})};}
  async function verifyAllMembers(){
    const latest=await members.list();if(latest.length!==pins.size||latest.some(item=>!pins.has(item.path)||pins.get(item.path).bytes!==item.bytes)||new Set(latest.map(item=>item.path)).size!==pins.size)throw Error('R1_MEMBER_SOURCE_CHANGED');
    if(sha(encode(layout))!==layoutSha256)throw Error('R1_LAYOUT_SOURCE_CHANGED');
    await readSmall('manifest.json',manifestSha256);await readSmall('database.json',databaseSha256);
    const verified=new Set();for(const descriptor of [...layout.objects,...layout.assets,...auxiliary]){if(verified.has(descriptor.member))continue;const hash=createHash('sha256');for(let offset=0;offset<descriptor.bytes;offset+=65536)hash.update(await readRange(descriptor.member,offset,Math.min(65536,descriptor.bytes-offset)));if(hash.digest('hex')!==descriptor.sha256)throw Error('R1_MEMBER_CHECKSUM');verified.add(descriptor.member);}
  }
  await verifyAllMembers();
  const source=await createLogicalSnapshotSource({tables,objects,programCommit,readObject,readRange:objectRange,checkpointCapture:async()=>{await verifyAllMembers();return {tables,objects};},origin:{profile:'explicit-logical-layout-v1',manifestSha256,databaseSha256,layoutSha256}});
  const chunks=source.chunks;
  source.chunks=async function*(){const hashes=new Map();for await(const chunk of chunks()){
    const item=chunk.resource.startsWith('r2/')?descriptors.get(chunk.resource.slice(3)):null;
    if(item?.encoding==='binary'){const hash=hashes.get(item.key)||createHash('sha256');hash.update(chunk.data);hashes.set(item.key,hash);if(chunk.offset+chunk.data.length===chunk.totalBytes){if(hash.digest('hex')!==item.sha256)throw Error('R1_MEMBER_CHECKSUM');hashes.delete(item.key);}}
    yield chunk;
  }if(hashes.size)throw Error('R1_MEMBER_INCOMPLETE');};
  return source;
}
