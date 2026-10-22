// Local-only writer: alias chunks remain in the original immutable snapshot.
// Only bounded non-alias replay bytes are written to a NEW private handoff dir.
import fs from 'node:fs';import path from 'node:path';
import {assertPlainDirectory} from './snapshot-files.mjs';
import {sha256} from './snapshot-contract.mjs';
import {prepareRecipeUpload,inspectRecipeD1Rows} from './snapshot-recipe-uploader.mjs';
const fail=(v,c)=>{if(!v)throw Error(c);},encode=v=>new TextEncoder().encode(JSON.stringify(v));
export const maximumReplayBytes=16*1024*1024;
export async function writeBrowserHandoff({source,normalized,viewRoot,output,pins}){
 const root=assertPlainDirectory(output),key=p=>process.platform==='win32'?p.toLowerCase():p;for(const dir of [source.root,viewRoot].filter(Boolean)){const original=assertPlainDirectory(dir),a=key(root),b=key(original);fail(a!==b&&!a.startsWith(b+path.sep)&&!b.startsWith(a+path.sep),'HANDOFF_DIRECTORY_OVERLAP');}
 fail(!fs.existsSync(root),'HANDOFF_NEW_DIRECTORY_REQUIRED');
 const prepared=await prepareRecipeUpload(normalized.view,pins),sourceManifest=await source.manifest();
 fail(await sha256(encode(sourceManifest))===normalized.plan.sourceManifestCanonicalSha256,'HANDOFF_SOURCE_PIN');
 await inspectRecipeD1Rows(normalized.view,prepared.manifest);
 const recipes=new Map(normalized.plan.recipes.map(r=>[r.targetResource,r])),mapping=[],aliasKey=c=>[c.resource,c.offset,c.bytes,c.sha256].join('\0'),aliases=new Map(sourceManifest.chunks.map(c=>[aliasKey(c),c]));let deltaBytes=0;
 for(const c of prepared.manifest.chunks){const recipe=recipes.get(c.resource);fail(recipe,'HANDOFF_RECIPE');const alias=recipe.kind==='alias'&&aliases.get(aliasKey({...c,resource:recipe.sourceResource}));mapping.push(alias?{id:c.id,sourceId:alias.id}:{id:c.id,delta:true});if(!alias)deltaBytes+=c.bytes;}
 fail(deltaBytes<=maximumReplayBytes,'HANDOFF_DELTA_LIMIT');
 const handoff={format:'PROCESS_OS_BROWSER_UPLOAD_V1',projectId:pins.projectId,origin:pins.origin,ownerId:pins.ownerId,targetFingerprint:pins.targetFingerprint,manifestSha256:pins.manifestSha256,sourceManifestSha256:normalized.result.sourceManifestSha256,manifest:prepared.manifest,mapping,deltaBytes};
 const bytes=encode(handoff);fail(bytes.length<=16*1024*1024,'HANDOFF_METADATA_LIMIT');fs.mkdirSync(root);fs.mkdirSync(path.join(root,'chunks'));fs.writeFileSync(path.join(root,'INCOMPLETE'),'Incomplete local browser upload handoff. Retain for review.\n',{flag:'wx'});
 try{for(const item of mapping.filter(m=>m.delta)){const c=prepared.manifest.chunks[Number(item.id.slice(1))],raw=await normalized.view.readChunk(item.id);fail(raw.length===c.bytes&&await sha256(raw)===c.sha256,'HANDOFF_REPLAY_INTEGRITY');fs.writeFileSync(path.join(root,'chunks',item.id),raw,{flag:'wx'});}
  fs.writeFileSync(path.join(root,'HANDOFF.json'),bytes,{flag:'wx'});fs.writeFileSync(path.join(root,'HANDOFF.sha256'),await sha256(bytes),{flag:'wx'});fs.renameSync(path.join(root,'INCOMPLETE'),path.join(root,'COMPLETE'));
  return{status:'PASS_LOCAL_BROWSER_HANDOFF_ONLY',chunks:mapping.length,aliasChunks:mapping.filter(m=>!m.delta).length,deltaChunks:mapping.filter(m=>m.delta).length,deltaBytes,metadataBytes:bytes.length,manifestSha256:pins.manifestSha256,remoteRequests:0,credentialsRead:false};
 }catch{throw Error('HANDOFF_RETAIN_PARTIAL_OUTPUT');}
}
