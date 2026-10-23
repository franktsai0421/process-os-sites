// Browser File objects only. Never discovers paths, cookies, passwords or tokens.
import {sha256,validateSnapshot,maximumChunkBytes} from './snapshot-contract.mjs';
const fail=(v,c)=>{if(!v)throw Error(c);};
function selectedDirectory(files){const index=new Map();let root;for(const file of Array.from(files)){const parts=(file.webkitRelativePath||'').split('/');fail(parts.length>1&&parts.every(p=>p&&p!=='.'&&p!=='..'&&!p.includes('\\')),'BROWSER_DIRECTORY_SELECTION_REQUIRED');root??=parts[0];fail(root===parts[0],'BROWSER_DIRECTORY_SELECTION_REQUIRED');const relative=parts.slice(1).join('/');fail(!index.has(relative),'BROWSER_DUPLICATE_FILE');index.set(relative,file);}return index;}
async function bytes(index,name,limit){const f=index.get(name);fail(f&&Number.isSafeInteger(f.size)&&f.size<=limit,'BROWSER_FILE_MISSING_OR_LIMIT');const b=new Uint8Array(await f.arrayBuffer());fail(b.length===f.size,'BROWSER_FILE_CHANGED');return b;}
const json=b=>{try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(b));}catch{throw Error('BROWSER_INVALID_METADATA');}};
export async function openBrowserSnapshot({sourceFiles,handoffFiles,pins}){
 const input=selectedDirectory(sourceFiles),delta=selectedDirectory(handoffFiles);
 fail(input.has('COMPLETE')&&!input.has('INCOMPLETE')&&!input.has('FAILED')&&delta.has('COMPLETE')&&!delta.has('INCOMPLETE'),'BROWSER_PACKAGE_INCOMPLETE');
 const handoffBytes=await bytes(delta,'HANDOFF.json',16*1024*1024),digest=new TextDecoder().decode(await bytes(delta,'HANDOFF.sha256',64));fail(await sha256(handoffBytes)===digest,'BROWSER_HANDOFF_INTEGRITY');const handoff=json(handoffBytes);
 fail(handoff.format==='PROCESS_OS_BROWSER_UPLOAD_V1'&&['projectId','origin','ownerId','targetFingerprint','manifestSha256'].every(k=>handoff[k]===pins[k]),'BROWSER_TARGET_MISMATCH');
 validateSnapshot(handoff.manifest);fail(await sha256(new TextEncoder().encode(JSON.stringify(handoff.manifest)))===pins.manifestSha256,'BROWSER_MANIFEST_PIN');
 const sourceBytes=await bytes(input,'manifest.json',16*1024*1024);fail(await sha256(sourceBytes)===handoff.sourceManifestSha256&&handoff.manifest.normalization?.sourceManifestSha256===handoff.sourceManifestSha256,'BROWSER_SOURCE_PIN');const original=json(sourceBytes);validateSnapshot(original);
 const descriptors=new Map(handoff.manifest.chunks.map(c=>[c.id,c])),sourceDescriptors=new Map(original.chunks.map(c=>[c.id,c]));
 fail(Array.isArray(handoff.mapping)&&handoff.mapping.length===descriptors.size,'BROWSER_MAPPING_COVERAGE');const mapping=new Map();
 for(const item of handoff.mapping){const c=descriptors.get(item.id);fail(c&&!mapping.has(item.id)&&/^c(?:0|[1-9][0-9]*)$/.test(item.id),'BROWSER_MAPPING_COVERAGE');if(item.delta===true){fail(!item.sourceId&&delta.get('chunks/'+item.id)?.size===c.bytes,'BROWSER_DELTA_MISSING');}else{const s=sourceDescriptors.get(item.sourceId);fail(s&&s.bytes===c.bytes&&s.sha256===c.sha256&&input.get('chunks/'+item.sourceId)?.size===c.bytes,'BROWSER_ALIAS_PIN');}mapping.set(item.id,item);}
 return{scope:'private-snapshot',async manifest(){return handoff.manifest;},async readChunk(id){const c=descriptors.get(id),item=mapping.get(id);fail(c&&item,'BROWSER_CHUNK_ID');const raw=await bytes(item.delta?delta:input,'chunks/'+(item.delta?id:item.sourceId),maximumChunkBytes);fail(raw.length===c.bytes&&await sha256(raw)===c.sha256,'BROWSER_CHUNK_INTEGRITY');return raw;}};
}
