// Local read-only adapter for the SAME handoff/manifest as the browser uploader.
// No fetch, cookie jar, password/token lookup, payload copy or credential file.
import fs from 'node:fs/promises';
import path from 'node:path';
import {assertPlainDirectory} from './snapshot-files.mjs';
import {openBrowserSnapshot} from './snapshot-browser-source.mjs';
import {createRecipeUploader} from './snapshot-recipe-uploader.mjs';
const metadataLimit=16*1024*1024;
async function readBounded(file,limit){
 const handle=await fs.open(file,'r');
 try{const info=await handle.stat();if(!info.isFile()||info.size>limit)throw Error('NATIVE_FILE_LIMIT');
  const out=new Uint8Array(info.size+1);let offset=0;
  while(offset<out.length){const r=await handle.read(out,offset,out.length-offset,offset);if(!r.bytesRead)break;offset+=r.bytesRead;}
  const after=await handle.stat();if(offset!==info.size||after.size!==info.size||after.mtimeMs!==info.mtimeMs)throw Error('NATIVE_FILE_CHANGED');
  return out.slice(0,offset);
 }finally{await handle.close();}
}
async function selectedFiles(root,names){
 const files=[];
 for(const name of new Set(names)){
  if(!/^(COMPLETE|manifest\.json|HANDOFF\.json|HANDOFF\.sha256|chunks\/c(?:0|[1-9][0-9]*))$/.test(name))throw Error('NATIVE_MEMBER_PATH');
  const file=path.join(root,...name.split('/'));assertPlainDirectory(file);
  const info=await fs.lstat(file);if(!info.isFile()||info.isSymbolicLink())throw Error('NATIVE_MEMBER_TYPE');
  files.push({size:info.size,webkitRelativePath:'selected/'+name,async arrayBuffer(){assertPlainDirectory(file);const raw=await readBounded(file,name.endsWith('.json')?metadataLimit:name.startsWith('chunks/')?1024*1024:1024);return raw.buffer;}});
 }
 return files;
}
export async function openNativeSnapshot({sourceDirectory,handoffDirectory,pins}){
 const source=assertPlainDirectory(sourceDirectory),handoff=assertPlainDirectory(handoffDirectory);
 for(const root of [source,handoff])for(const marker of ['INCOMPLETE','FAILED']){try{await fs.lstat(path.join(root,marker));throw Error('NATIVE_PACKAGE_INCOMPLETE');}catch(error){if(error.code!=='ENOENT')throw error;}}
 const file=path.join(handoff,'HANDOFF.json');assertPlainDirectory(file);
 let metadata;try{metadata=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await readBounded(file,metadataLimit)));}catch(error){if(error.message?.startsWith('NATIVE_'))throw error;throw Error('NATIVE_HANDOFF_FORMAT');}
 if(!Array.isArray(metadata.mapping)||metadata.mapping.length>100000)throw Error('NATIVE_MAPPING_LIMIT');
 const sourceNames=['COMPLETE','manifest.json'],handoffNames=['COMPLETE','HANDOFF.json','HANDOFF.sha256'];
 for(const item of metadata.mapping){if(!item||!/^c(?:0|[1-9][0-9]*)$/.test(item.id))throw Error('NATIVE_MEMBER_PATH');
  if(item.delta===true)handoffNames.push('chunks/'+item.id);
  else{if(!/^c(?:0|[1-9][0-9]*)$/.test(item.sourceId))throw Error('NATIVE_MEMBER_PATH');sourceNames.push('chunks/'+item.sourceId);}}
 const sourceFiles=await selectedFiles(source,sourceNames),handoffFiles=await selectedFiles(handoff,handoffNames);
 return openBrowserSnapshot({sourceFiles,handoffFiles,pins});
}
// A trusted caller must supply a separately reviewed authorized transport.
// There is deliberately no default global fetch or ambient browser identity.
export async function createNativeRecipeUploader({sourceDirectory,handoffDirectory,pins,request,signal,onProgress}){
 if(typeof request!=='function')throw Error('NATIVE_AUTHORIZED_TRANSPORT_REQUIRED');
 const source=await openNativeSnapshot({sourceDirectory,handoffDirectory,pins});
 return createRecipeUploader({source,pins,request,signal,onProgress,batch:true});
}
