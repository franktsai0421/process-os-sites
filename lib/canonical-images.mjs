import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {CanonicalError,sha256,serialize,stable} from './canonical-data.mjs';

export const imagePackageLimit=25*1024*1024;
export const imageFileLimit=2*1024*1024;
const digest=/^[a-f0-9]{64}$/;
export const imageKey=r=>`canonical-images/${r.sha256}/${r.web.sha256}.webp`;
export const imageUrl=r=>`/api/canonical-assets?id=${r.sha256}&version=${r.web.sha256}#asset-${r.sha256}`;

export function validateImageTransition(previous,records){
  const old=new Map(previous.map(r=>[r.id,r]));
  for(const next of records){const prior=old.get(next.id);if(prior&&(prior.sha256!==next.sha256||(prior.web&&next.web&&prior.web.sha256!==next.web.sha256)))throw new CanonicalError('ASSET_ID_HASH_CONFLICT');}
}

export function validateImageRecords(records){
  let bytes=0;
  for(const r of records){
    if(!digest.test(r.sha256)||r.id!==`asset:${r.sha256}`)throw new CanonicalError('ASSET_ID_HASH_CONFLICT');
    if(!r.web)continue; // Backward-compatible indexes for existing Local copies.
    const w=r.web;
    if(!digest.test(w.sha256)||w.version!==w.sha256||w.path!==`assets/web/${w.sha256}.webp`
      ||w.mime!=='image/webp'||!Number.isInteger(w.bytes)||w.bytes<=0||w.bytes>imageFileLimit
      ||!Number.isInteger(w.width)||!Number.isInteger(w.height)||w.width<1||w.height<1||w.width>1600||w.height>1600)
      throw new CanonicalError('INVALID_WEB_IMAGE_MANIFEST');
    bytes+=w.bytes;
  }
  if(bytes>imagePackageLimit)throw new CanonicalError('WEB_IMAGE_PACKAGE_TOO_LARGE');
}

export function webManifest(records){
  const images=records.filter(r=>r.web).map(r=>({assetId:r.id,sourceSha256:r.sha256,...r.web,...(r.deletedAt?{deletedAt:r.deletedAt}:{})})).sort((a,b)=>a.assetId.localeCompare(b.assetId,'en'));
  return {version:1,packageVersion:sha256(stable(images)),bytes:images.reduce((n,r)=>n+r.bytes,0),images};
}

export function readWebImage(root,r){
  validateImageRecords([r]);
  const parent=path.resolve(root,'data/canonical');
  const file=path.resolve(parent,r.web.path);
  if(!file.startsWith(parent+path.sep)||fs.lstatSync(file).isSymbolicLink())throw new CanonicalError('WEB_IMAGE_PATH_REFUSED');
  for(const name of ['data','data/canonical','data/canonical/assets','data/canonical/assets/web'])
    if(fs.lstatSync(path.join(root,name)).isSymbolicLink())throw new CanonicalError('WEB_IMAGE_PATH_REFUSED');
  const stat=fs.statSync(file);
  if(stat.size!==r.web.bytes||stat.size>imageFileLimit)throw new CanonicalError('WEB_IMAGE_SIZE_MISMATCH');
  const raw=fs.readFileSync(file);
  if(sha256(raw)!==r.web.sha256)throw new CanonicalError('WEB_IMAGE_HASH_MISMATCH');
  return raw;
}

export async function prepareWebImages(root,domains,contents){
  const sharp=createRequire(path.join(root,'package.json'))('sharp');
  const prepared=[];
  for(const r of domains.assets){
    if(r.deletedAt||r.web)continue;
    if(r.mime.startsWith('video/'))continue; // Videos remain private and never enter Git.
    const original=contents.get(r.id);
    if(!original)throw new CanonicalError('CANONICAL_IMAGE_SOURCE_MISSING');
    if(sha256(original)!==r.sha256||r.id!==`asset:${r.sha256}`)throw new CanonicalError('ASSET_ID_HASH_CONFLICT');
    const input=sharp(original,{limitInputPixels:40000000});
    const metadata=await input.metadata();
    if(!['png','jpeg','webp','avif','tiff','gif'].includes(metadata.format)||metadata.pages>1)
      throw new CanonicalError('UNSUPPORTED_CANONICAL_IMAGE');
    // Sharp removes EXIF/GPS/XMP/IPTC by default. Rotate before stripping orientation.
    const {data,info}=await input.rotate().resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true})
      .webp({quality:80,effort:4}).toBuffer({resolveWithObject:true});
    const hash=sha256(data);
    r.web={sha256:hash,version:hash,path:`assets/web/${hash}.webp`,mime:'image/webp',bytes:data.length,width:info.width,height:info.height};
    prepared.push({record:r,data});
  }
  validateImageRecords(domains.assets); // Check total before writing any package files.
  for(const {record,data} of prepared){
    const file=path.join(root,'data/canonical',record.web.path);
    fs.mkdirSync(path.dirname(file),{recursive:true});
    if(fs.lstatSync(path.dirname(file)).isSymbolicLink())throw new CanonicalError('WEB_IMAGE_PATH_REFUSED');
    if(fs.existsSync(file)){if(fs.lstatSync(file).isSymbolicLink()||sha256(fs.readFileSync(file))!==record.web.sha256)throw new CanonicalError('WEB_IMAGE_HASH_CONFLICT');}
    else fs.writeFileSync(file,data,{flag:'wx'});
  }
  return webManifest(domains.assets);
}

export async function importWebImages(root,records,bucket){
  validateImageRecords(records);
  const result={imported:0,present:0,tombstones:0};
  for(const r of records){
    if(r.deletedAt){result.tombstones++;continue;}
    if(!r.web)continue;
    const raw=readWebImage(root,r),key=imageKey(r),old=await bucket.get(key);
    if(old){
      if(old.size!==raw.length||sha256(Buffer.from(await old.arrayBuffer()))!==r.web.sha256
        ||old.customMetadata?.sourceSha256!==r.sha256||old.customMetadata?.webSha256!==r.web.sha256)
        throw new CanonicalError('LOCAL_IMAGE_HASH_CONFLICT');
      result.present++;
    }else{
      await bucket.put(key,raw,{httpMetadata:{contentType:'image/webp'},customMetadata:{sourceSha256:r.sha256,webSha256:r.web.sha256}});
      result.imported++;
    }
  }
  return result;
}

// Replace only canonical references/placeholders. Private uploads and drafts remain intact.
export function hydrateWebImages(values,records){
  const active=new Map(records.filter(r=>!r.deletedAt&&r.web).map(r=>[r.id,r]));
  function resolve(value){
    if(Array.isArray(value))return value.map(resolve);
    if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,resolve(v)]));
    if(typeof value!=='string')return value;
    const match=value.match(/^asset:([a-f0-9]{64})$/)||value.match(/^\/process\/assets\/canonical-placeholder\.svg#asset-([a-f0-9]{64})$/);
    if(match&&active.has('asset:'+match[1]))return imageUrl(active.get('asset:'+match[1]));
    if(/^[{[]/.test(value.trim())){try{const parsed=JSON.parse(value),next=resolve(parsed);if(serialize(parsed)!==serialize(next))return JSON.stringify(next);}catch{}}
    return value;
  }
  return Object.fromEntries(Object.entries(values).map(([k,v])=>[k,resolve(v)]));
}
