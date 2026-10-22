// Explicit logical-media mapping. No filesystem, archive reader or platform API.
import {createHash} from 'node:crypto';
import {validateAssetIndex} from './site-security.mjs';
const imageTypes=new Set(['image/jpeg','image/png','image/webp','image/gif']);
export function logicalMemberPath(value){return typeof value==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_./-]{0,400}$/.test(value)&&!value.includes('..')&&!value.includes('//');}
export async function preparePrivateMedia(assets,readRange){
  if(!Array.isArray(assets)||assets.length>2000)throw Error('R1_STATIC_MEDIA_LIMIT');
  const index={format:'PROCESS_OS_COMPANY_ASSETS_V1',assets:[]},paths=new Set(),objects=new Map();
  for(const source of assets){
    if(!source||!Array.isArray(source.permissions))throw Error('INVALID_ASSET_PERMISSION');
    if(!logicalMemberPath(source.member)||!source.member.startsWith('static-assets/'))throw Error('R1_STATIC_MEMBER_PATH');
    if(!imageTypes.has(source.contentType))throw Error('R1_STATIC_FORMAT_UNSUPPORTED');
    const asset={path:source.path,key:'company-assets/objects/'+source.sha256,bytes:source.bytes,sha256:source.sha256,contentType:source.contentType,permissions:source.permissions.slice()};
    validateAssetIndex({format:index.format,assets:[asset]});
    if(paths.has(asset.path.toLowerCase()))throw Error('R1_STATIC_DUPLICATE_PATH');paths.add(asset.path.toLowerCase());
    if(source.bytes<1||source.bytes>64*1024*1024)throw Error('R1_STATIC_MEDIA_LIMIT');
    const hash=createHash('sha256');
    for(let offset=0;offset<source.bytes;offset+=65536){const length=Math.min(65536,source.bytes-offset),bytes=await readRange(source.member,offset,length);if(!(bytes instanceof Uint8Array)||bytes.length!==length)throw Error('R1_MEMBER_SHORT_READ');hash.update(bytes);}
    if(hash.digest('hex')!==source.sha256)throw Error('R1_STATIC_CHECKSUM');
    const previous=objects.get(asset.key);
    if(previous&&(previous.size!==source.bytes||previous.httpMetadata.contentType!==source.contentType))throw Error('R1_STATIC_CONTENT_CONFLICT');
    objects.set(asset.key,{key:asset.key,member:source.member,size:source.bytes,sha256:source.sha256,httpMetadata:{contentType:source.contentType},customMetadata:{sha256:source.sha256}});index.assets.push(asset);
  }
  index.assets.sort((a,b)=>a.path.localeCompare(b.path,'en'));validateAssetIndex(index);
  const bytes=new TextEncoder().encode(JSON.stringify(index));if(bytes.length>1_048_576)throw Error('R1_STATIC_INDEX_LIMIT');
  return {index,indexBytes:bytes,objects:[...objects.values()]};
}
