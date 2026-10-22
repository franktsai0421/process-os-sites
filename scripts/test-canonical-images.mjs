import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {initializeLocal} from './local-init.mjs';
import {readPackage,writePackage,sha256,validateDomains,mergeThreeWay} from '../lib/canonical-data.mjs';
import {importWebImages,imageKey,readWebImage,validateImageRecords,imageFileLimit,imagePackageLimit} from '../lib/canonical-images.mjs';
import {openLocalData,readLocalState,writeLocalState} from '../lib/local-data.mjs';
import {inspectLocal,exportData,syncData} from '../lib/data-collaboration.mjs';

const source=process.cwd(),require=createRequire(import.meta.url),sharp=require('sharp');
const fixture=fs.mkdtempSync(path.join(os.tmpdir(),'process-canonical-images-'));
const first=path.join(fixture,'first'),second=path.join(fixture,'second');
let context;
function copyFixture(root,canonicalSource){
  fs.mkdirSync(root,{recursive:true});
  for(const dir of ['db','drizzle','public/process/data'])fs.cpSync(path.join(source,dir),path.join(root,dir),{recursive:true});
  fs.cpSync(path.join(canonicalSource,'data/canonical'),path.join(root,'data/canonical'),{recursive:true});
  for(const file of ['package.json','lib/user-access.ts','public/process/access-policy.mjs']){fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true});fs.copyFileSync(path.join(source,file),path.join(root,file));}
  fs.symlinkSync(fs.realpathSync(path.join(source,'node_modules')),path.join(root,'node_modules'),'junction');
}
async function mutateImage(root,bytes){
  context=await openLocalData(root);
  try{
    const state=await readLocalState(context),values={...state.values},control=JSON.parse(values.masterDataControl);
    const stage=Object.keys(control.active.PROCESS)[0];
    if(bytes)control.active.PROCESS[stage][0].media=`data:image/png;base64,${bytes.toString('base64')}`;else delete control.active.PROCESS[stage][0].media;
    values.masterDataControl=JSON.stringify(control);
    await writeLocalState(context,state,values);
  }finally{await context.proxy.dispose();context=undefined;}
}
try{
  const baseline=readPackage(source);
  assert.ok(Object.values(baseline.domains).reduce((n,a)=>n+a.length,0)>0);
  const packagedImages=baseline.domains.assets.filter(r=>r.web),firstImage=packagedImages.find(r=>!r.deletedAt);
  const imageCount=packagedImages.filter(r=>!r.deletedAt).length,initialTombstones=packagedImages.filter(r=>r.deletedAt).length;
  assert.ok(imageCount>0);
  assert.ok(packagedImages.reduce((n,r)=>n+r.web.bytes,0)<25*1024*1024);
  for(const r of packagedImages){const metadata=await sharp(readWebImage(source,r)).metadata();assert.equal(metadata.format,'webp');assert.equal(metadata.exif,undefined);assert.equal(metadata.icc,undefined);assert.equal(metadata.xmp,undefined);}
  const bad=structuredClone(baseline.domains);bad.assets.find(r=>r.id===firstImage.id).sha256='0'.repeat(64);
  assert.throws(()=>validateDomains(bad),/ASSET_ID_HASH_CONFLICT/);
  const changedHash=structuredClone(baseline.domains),changedImage=changedHash.assets.find(r=>r.id===firstImage.id);changedImage.web.sha256='1'.repeat(64);changedImage.web.version='1'.repeat(64);changedImage.web.path=`assets/web/${'1'.repeat(64)}.webp`;
  assert.throws(()=>mergeThreeWay(baseline.domains,baseline.domains,changedHash),/ASSET_ID_HASH_CONFLICT/);
  assert.throws(()=>validateImageRecords([{...firstImage,web:{...firstImage.web,bytes:imageFileLimit+1}}]),/INVALID_WEB_IMAGE_MANIFEST/);
  const oversized=Array.from({length:Math.floor(imagePackageLimit/imageFileLimit)+1},(_,i)=>{const hash=sha256(String(i));return {...firstImage,id:'asset:'+hash,sha256:hash,web:{...firstImage.web,bytes:imageFileLimit}};});
  assert.throws(()=>validateImageRecords(oversized),/WEB_IMAGE_PACKAGE_TOO_LARGE/);
  copyFixture(first,source);await initializeLocal(first);
  assert.equal((await inspectLocal(first)).hasUnexportedChanges,false);
  context=await openLocalData(first);
  const initial=await readLocalState(context),users=initial.values.platformUsers;
  assert.ok(Object.values(initial.values).some(v=>v.includes('/api/canonical-assets?')));
  assert.ok(!Object.values(initial.values).some(v=>v.includes('canonical-placeholder.svg#asset-')));
  const initialObjects=(await context.bucket.list({prefix:'canonical-images/'})).objects;
  assert.equal(initialObjects.length,imageCount);
  const initialKeys=initialObjects.map(r=>r.key);
  await context.proxy.dispose();context=undefined;
  await initializeLocal(first);
  context=await openLocalData(first);
  assert.equal((await readLocalState(context)).row.revision,initial.row.revision);
  assert.deepEqual((await context.bucket.list({prefix:'canonical-images/'})).objects.map(r=>r.key),initialKeys);
  await context.proxy.dispose();context=undefined;
  const noChange=await exportData(first);assert.equal(noChange.updated,0);assert.equal(noChange.images.count,imageCount);assert.equal(readPackage(first).manifest.dataVersion,baseline.manifest.dataVersion);
  const red=await sharp({create:{width:8,height:8,channels:3,background:'#ff0000'}}).withExif({IFD0:{Artist:'fixture metadata'}}).png().toBuffer();
  assert.ok((await sharp(red).metadata()).exif);
  await mutateImage(first,red);
  await assert.rejects(()=>syncData(first),/UNEXPORTED_LOCAL_CHANGES/);
  const added=await exportData(first),redId=`asset:${sha256(red)}`;
  assert.equal(added.images.count,imageCount+1);assert.notEqual(added.images.version,noChange.images.version);
  const redRecord=readPackage(first).domains.assets.find(r=>r.id===redId);
  assert.equal((await sharp(readWebImage(first,redRecord)).metadata()).exif,undefined);
  copyFixture(second,first);await initializeLocal(second);
  context=await openLocalData(second);assert.equal((await context.bucket.list({prefix:'canonical-images/'})).objects.length,imageCount+1);assert.equal((await readLocalState(context)).values.platformUsers,users);
  await context.proxy.dispose();context=undefined;
  const synced=await syncData(first);assert.equal(synced.images.imported,1);
  const repeated=await syncData(first);assert.equal(repeated.images.imported,0);assert.equal(repeated.changed,false);
  const green=await sharp({create:{width:8,height:8,channels:3,background:'#00ff00'}}).png().toBuffer();
  await mutateImage(first,green);await assert.rejects(()=>syncData(first),/UNEXPORTED_LOCAL_CHANGES/);
  const updated=await exportData(first);assert.equal(updated.images.count,imageCount+1);assert.equal(updated.images.tombstones,initialTombstones+1);
  const updatedPackage=readPackage(first);assert.ok(updatedPackage.domains.assets.find(r=>r.id===redId).deletedAt);
  const greenRecord=updatedPackage.domains.assets.find(r=>r.id===`asset:${sha256(green)}`);assert.ok(greenRecord.web);
  assert.equal((await exportData(first)).images.version,updated.images.version);
  fs.cpSync(path.join(first,'data/canonical'),path.join(second,'data/canonical'),{recursive:true});
  const pulled=await syncData(second);assert.equal(pulled.images.imported,1);assert.equal(pulled.images.tombstones,initialTombstones+1);assert.equal((await syncData(second)).changed,false);
  context=await openLocalData(second);assert.equal((await readLocalState(context)).values.platformUsers,users);await context.proxy.dispose();context=undefined;
  await mutateImage(first,null);await assert.rejects(()=>syncData(first),/UNEXPORTED_LOCAL_CHANGES/);
  const removed=await exportData(first);assert.equal(removed.images.count,imageCount);assert.equal(removed.images.tombstones,initialTombstones+2);
  const final=readPackage(first);assert.ok(final.domains.assets.find(r=>r.id===greenRecord.id).deletedAt);
  assert.equal((await exportData(first)).images.version,removed.images.version);
  await syncData(first);context=await openLocalData(first);
  const current=await readLocalState(context);assert.equal(current.values.platformUsers,users);
  const firstRecord=final.domains.assets.find(r=>!r.deletedAt&&r.id!==greenRecord.id),key=imageKey(firstRecord),raw=readWebImage(first,firstRecord);
  await context.bucket.put(key,'fixture corruption',{customMetadata:{sourceSha256:firstRecord.sha256,webSha256:firstRecord.web.sha256}});
  await assert.rejects(()=>importWebImages(first,final.domains.assets,context.bucket),/LOCAL_IMAGE_HASH_CONFLICT/);
  assert.equal(await (await context.bucket.get(key)).text(),'fixture corruption');
  await context.bucket.put(key,raw,{httpMetadata:{contentType:'image/webp'},customMetadata:{sourceSha256:firstRecord.sha256,webSha256:firstRecord.web.sha256}});
  const imageFile=path.join(first,'data/canonical',firstRecord.web.path);fs.writeFileSync(imageFile,'fixture package corruption');
  assert.throws(()=>readPackage(first),/WEB_IMAGE_SIZE_MISMATCH/);fs.writeFileSync(imageFile,raw);

  // Exercise the real route against the Local binding, including hosted refusal.
  const ts=require('typescript'),fixtureModule={exports:{}};
  const code=ts.transpileModule(fs.readFileSync(path.join(source,'app/api/canonical-assets/route.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
  const localEnv={STATE_ARCHIVE:context.bucket,PROCESS_LOCAL_IMAGES:'true'};
  vm.runInNewContext(code,{module:fixtureModule,exports:fixtureModule.exports,require:id=>id==='cloudflare:workers'?{env:localEnv}:{records:final.domains.assets},URL,Response});
  const GET=fixtureModule.exports.GET;
  assert.equal((await GET(new Request(`https://example.test/api/canonical-assets?id=${firstRecord.sha256}&version=${firstRecord.web.sha256}`))).status,404);
  assert.equal((await GET(new Request('http://127.0.0.1/api/canonical-assets?id=../secret&version=bad'))).status,400);
  const served=await GET(new Request(`http://127.0.0.1/api/canonical-assets?id=${firstRecord.sha256}&version=${firstRecord.web.sha256}`));
  assert.equal(served.status,200);assert.equal(served.headers.get('content-type'),'image/webp');assert.equal(sha256(Buffer.from(await served.arrayBuffer())),firstRecord.web.sha256);
  assert.equal((await GET(new Request(`http://127.0.0.1/api/canonical-assets?id=${redRecord.sha256}&version=${redRecord.web.sha256}`))).status,404);
  localEnv.PROCESS_LOCAL_IMAGES='false';assert.equal((await GET(new Request(`http://127.0.0.1/api/canonical-assets?id=${firstRecord.sha256}&version=${firstRecord.web.sha256}`))).status,404);
  const conflicting=structuredClone(final.domains);conflicting.assets.find(r=>r.id===firstRecord.id).web=structuredClone(greenRecord.web);
  writePackage(first,conflicting);await context.proxy.dispose();context=undefined;
  await assert.rejects(()=>initializeLocal(first),/ASSET_ID_HASH_CONFLICT/);
  writePackage(first,final.domains,{previousManifest:final.manifest});
  await mutateImage(first,red);const revived=await exportData(first);
  assert.equal(revived.images.count,imageCount+1);assert.equal(revived.images.tombstones,initialTombstones+1);
  assert.equal(readPackage(first).domains.assets.find(r=>r.id===redId).deletedAt,undefined);
  assert.equal((await syncData(first)).images.imported,0);
  console.log('PASS: complete records; real stripped WebP images; fresh Local R2; restart/no-op idempotence; image add/update/delete/revival/tombstones; export and sync; unexported refusal; content conflicts; corruption refusal; loopback-only streaming route; unchanged demo accounts');
}finally{
  await context?.proxy.dispose();
  if(path.dirname(fs.realpathSync(fixture))!==fs.realpathSync(os.tmpdir())||!path.basename(fixture).startsWith('process-canonical-images-')){console.error('Unsafe fixture cleanup; files retained');process.exitCode=1;}
  else fs.rmSync(fixture,{recursive:true,force:true});
}
