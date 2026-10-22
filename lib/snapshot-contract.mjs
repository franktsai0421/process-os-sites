// Versioned transfer port. No Cloudflare credentials, network, database opener,
// or hosted import implementation lives here. Runtime adapters are separate.
export const snapshotFormat = 'PROCESS_OS_SNAPSHOT_V1';
export const maximumChunkBytes = 1_048_576;
const maximumTotalBytes = 64 * 1024 ** 3;
export async function sha256(bytes) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
}
function validResource(value) {
  return typeof value === 'string' && /^(db\/(shared_state|state_backups|web_feedback_store)|r2\/[a-zA-Z0-9][a-zA-Z0-9_./-]{0,500})$/.test(value) && !value.includes('..');
}
export function validateSnapshot(manifest) {
  if(manifest?.format!==snapshotFormat || manifest.schemaVersion!==1 || manifest.credentialPolicy!=='excluded'||!/^[a-f0-9]{64}$/.test(manifest.schemaFingerprint || ''))throw Error('SNAPSHOT_VERSION_OR_POLICY');
  if(!['site','r1-logical-members'].includes(manifest.source?.kind) || !/^[a-f0-9]{40}$/.test(manifest.source.programCommit) || !Number.isSafeInteger(manifest.source.revision) || manifest.source.revision<0)throw Error('SNAPSHOT_SOURCE');
  if(manifest.source.kind==='r1-logical-members'){
    const origin=manifest.source.origin;
    const keys=Object.keys(origin||{}).sort().join();if(origin?.profile!=='explicit-logical-layout-v1'||!['databaseSha256,layoutSha256,manifestSha256,profile','databaseSha256,delivery,layoutSha256,manifestSha256,profile'].includes(keys)||['manifestSha256','databaseSha256','layoutSha256'].some(key=>!/^[a-f0-9]{64}$/.test(origin[key]||'')))throw Error('SNAPSHOT_SOURCE_ORIGIN');
    if(Object.hasOwn(origin,'delivery')){
      const delivery=origin.delivery,hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
      if(!delivery||Object.keys(delivery).sort().join()!=='auxiliary,curation,curationProvenanceSha256,memberInventorySha256,profile,sourceSnapshotManifest,staticChecksumSha256,staticManifestSha256'||delivery.profile!=='r1-private-package-v1'||['memberInventorySha256','staticManifestSha256','staticChecksumSha256','curationProvenanceSha256'].some(key=>!hash(delivery[key]))||typeof delivery.sourceSnapshotManifest!=='string'||!delivery.sourceSnapshotManifest.length||delivery.sourceSnapshotManifest.length>4096||!Array.isArray(delivery.auxiliary)||delivery.auxiliary.length>10)throw Error('SNAPSHOT_SOURCE_ORIGIN');
      const curation=delivery.curation;if(!curation||Object.keys(curation).sort().join()!=='id,parentArchiveSha256,parentDatabaseSha256,parentManifestSha256,parentRevision,revision'||typeof curation.id!=='string'||!curation.id.length||curation.id.length>200||curation.parentRevision!==495||curation.revision!==manifest.source.revision||['parentArchiveSha256','parentDatabaseSha256','parentManifestSha256'].some(key=>!hash(curation[key])))throw Error('SNAPSHOT_SOURCE_ORIGIN');
      const allowed={'manifest.sha256':'checksum','curation-provenance.json':'provenance','DISTRIBUTION-README.md':'distribution-readme','static-assets/manifest.json':'static-index','static-assets/manifest.sha256':'checksum','static-assets/public/favicon.svg':'source-program-ui','static-assets/public/process/assets/canonical-placeholder.svg':'source-program-ui'},seen=new Map();for(const item of delivery.auxiliary){if(!item||Object.keys(item).sort().join()!=='bytes,kind,member,sha256'||typeof item.member!=='string'||seen.has(item.member)||allowed[item.member]!==item.kind||!Number.isSafeInteger(item.bytes)||item.bytes<1||item.bytes>8*1024*1024||!hash(item.sha256))throw Error('SNAPSHOT_SOURCE_ORIGIN');seen.set(item.member,item);}
      if(['manifest.sha256','curation-provenance.json','DISTRIBUTION-README.md','static-assets/manifest.json','static-assets/manifest.sha256'].some(name=>!seen.has(name))||seen.get('curation-provenance.json').sha256!==delivery.curationProvenanceSha256||seen.get('static-assets/manifest.json').sha256!==delivery.staticManifestSha256||seen.get('static-assets/manifest.sha256').sha256!==delivery.staticChecksumSha256)throw Error('SNAPSHOT_SOURCE_ORIGIN');
    }
  }else if(manifest.source.origin!==undefined)throw Error('SNAPSHOT_SOURCE_ORIGIN');
  if(!Array.isArray(manifest.chunks)||!manifest.chunks.length||manifest.chunks.length>100_000)throw Error('SNAPSHOT_CHUNKS');
  const ids=new Set(), resources=new Map();
  let total=0;
  for(const chunk of manifest.chunks){
    if(!/^c[0-9]+$/.test(chunk.id)||ids.has(chunk.id)||!validResource(chunk.resource))throw Error('SNAPSHOT_RESOURCE');
    if(!Number.isSafeInteger(chunk.bytes)||chunk.bytes<=0||chunk.bytes>maximumChunkBytes||!Number.isSafeInteger(chunk.offset)||chunk.offset<0||!Number.isSafeInteger(chunk.totalBytes)||chunk.totalBytes<chunk.bytes||chunk.totalBytes>maximumTotalBytes||!/^[a-f0-9]{64}$/.test(chunk.sha256))throw Error('SNAPSHOT_CHUNK');
    ids.add(chunk.id); total+=chunk.bytes;
    if(total>maximumTotalBytes)throw Error('SNAPSHOT_CAPACITY');
    const metadata=chunk.metadata || {};
    if(typeof metadata!=='object'||Array.isArray(metadata)||JSON.stringify(metadata).length>4096||Object.keys(metadata).some(key=>/^(password|passwordHash|secret|token|cookie|authorization|__proto__|constructor)$/i.test(key)))throw Error('SNAPSHOT_METADATA');
    const serializedMetadata=JSON.stringify(metadata);
    const progress=resources.get(chunk.resource)||{offset:0,totalBytes:chunk.totalBytes,metadata:serializedMetadata};
    if(progress.offset!==chunk.offset||progress.totalBytes!==chunk.totalBytes||progress.metadata!==serializedMetadata)throw Error('SNAPSHOT_ORDER');
    progress.offset+=chunk.bytes;
    if(progress.offset>progress.totalBytes)throw Error('SNAPSHOT_ORDER');
    resources.set(chunk.resource,progress);
  }
  if([...resources.values()].some(resource=>resource.offset!==resource.totalBytes))throw Error('SNAPSHOT_INCOMPLETE');
  if(!resources.has('db/shared_state')||!resources.has('db/state_backups')||!resources.has('db/web_feedback_store'))throw Error('SNAPSHOT_TABLE_COVERAGE');
  return {resources:resources.size,chunks:ids.size,totalBytes:total};
}
export async function exportSnapshot(source,sink) {
  if(!['site-export','r1-logical-export'].includes(source.scope) || source.credentialPolicy!=='excluded' || sink.scope!=='private-snapshot')throw Error('SNAPSHOT_ADAPTER_SCOPE');
  const checkpoint=await source.checkpoint();
  const manifest={format:snapshotFormat,schemaVersion:1,schemaFingerprint:source.schemaFingerprint,credentialPolicy:'excluded',source:{kind:'site',programCommit:source.programCommit,revision:checkpoint.revision},chunks:[]};
  if(source.scope==='r1-logical-export'){manifest.source.kind='r1-logical-members';manifest.source.origin=source.origin;}
  let total=0;
  try {
    for await(const chunk of source.chunks(checkpoint)) {
      if(!(chunk.data instanceof Uint8Array)||!chunk.data.length||chunk.data.length>maximumChunkBytes)throw Error('SNAPSHOT_CHUNK');
      const descriptor={id:`c${manifest.chunks.length}`,resource:chunk.resource,offset:chunk.offset,totalBytes:chunk.totalBytes,bytes:chunk.data.length,sha256:await sha256(chunk.data),metadata:chunk.metadata || {}};
      total+=descriptor.bytes;
      if(total>maximumTotalBytes)throw Error('SNAPSHOT_CAPACITY');
      if(!validResource(descriptor.resource))throw Error('SNAPSHOT_RESOURCE');
      manifest.chunks.push(descriptor);
      if(manifest.chunks.length>100_000)throw Error('SNAPSHOT_CAPACITY');
      await sink.writeChunk(descriptor.id,chunk.data);
    }
    if(JSON.stringify(await source.checkpoint())!==JSON.stringify(checkpoint))throw Error('SNAPSHOT_SOURCE_CHANGED');
    validateSnapshot(manifest);
    await sink.complete(manifest);
    return manifest;
  }catch(error){await sink.abort(error);throw error;}
}
export async function importSnapshot(source,target) {
  // A site-bound target is deliberately not supported. No automatic upload path.
  if(source.scope!=='private-snapshot'||target.scope!=='isolated-local')throw Error('SNAPSHOT_LOCAL_TARGET_REQUIRED');
  const manifest=await source.manifest();
  const summary=validateSnapshot(manifest);
  if(target.schemaFingerprint!==manifest.schemaFingerprint)throw Error('SNAPSHOT_SCHEMA_MISMATCH');
  if(!await target.isEmpty())throw Error('SNAPSHOT_TARGET_NOT_EMPTY');
  const transaction=await target.begin(manifest);
  try {
    for(const descriptor of manifest.chunks){
      const data=await source.readChunk(descriptor.id,maximumChunkBytes);
      if(!(data instanceof Uint8Array)||data.length!==descriptor.bytes||await sha256(data)!==descriptor.sha256)throw Error('SNAPSHOT_INTEGRITY');
      await transaction.writeChunk(descriptor,data);
    }
    await transaction.commit();
    return summary;
  }catch(error){await transaction.abort();throw error;}
}
export const snapshotCapabilities = Object.freeze({
  format:snapshotFormat,schemaVersion:1,maximumChunkBytes,
  direction:'site-to-isolated-local',credentialPolicy:'excluded',
  hostedImport:false,liveExportAdapterReady:true,
});
