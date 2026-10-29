// Resume only an explicitly selected, task-owned incomplete snapshot. No overwrite.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {assertPlainDirectory} from './snapshot-files.mjs';
import {validateSnapshot} from './snapshot-contract.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function openR1CheckedResumeSink(directory){
 const root=assertPlainDirectory(directory),chunkRoot=path.join(root,'chunks');
 if(!fs.existsSync(path.join(root,'INCOMPLETE'))||fs.existsSync(path.join(root,'COMPLETE'))||fs.existsSync(path.join(root,'manifest.json'))||fs.existsSync(path.join(root,'manifest.sha256'))||!fs.existsSync(chunkRoot))throw Error('R1_RESUME_STAGE_NOT_INCOMPLETE');
 const allowed=new Set(['chunks','INCOMPLETE','FAILED']);if(fs.readdirSync(root).some(name=>!allowed.has(name)))throw Error('R1_RESUME_UNKNOWN_STAGE_MEMBER');
 const old=new Map(),seen=new Map(),names=fs.readdirSync(chunkRoot);for(const name of names){if(!/^c(0|[1-9][0-9]*)$/.test(name))throw Error('R1_RESUME_UNKNOWN_CHUNK');const file=path.join(chunkRoot,name),stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size<1||stat.size>1048576)throw Error('R1_RESUME_CHUNK_BOUND');old.set(name,{bytes:stat.size,sha256:hash(fs.readFileSync(file))});}
 for(let i=0;i<old.size;i++)if(!old.has('c'+i))throw Error('R1_RESUME_PREFIX_GAP');
 const storage={priorChunks:old.size,priorBytes:[...old.values()].reduce((sum,item)=>sum+item.bytes,0),reusedChunks:0,reusedBytes:0,newChunks:0,newBytes:0,prefixSha256:hash(JSON.stringify([...old].sort((a,b)=>Number(a[0].slice(1))-Number(b[0].slice(1)))))};
 return {scope:'private-snapshot',storage,
  async writeChunk(id,data){if(id!=='c'+seen.size||!(data instanceof Uint8Array)||data.length<1||data.length>1048576)throw Error('R1_RESUME_ORDER_OR_BOUND');const descriptor={bytes:data.length,sha256:hash(data)},previous=old.get(id);if(previous){if(previous.bytes!==descriptor.bytes||previous.sha256!==descriptor.sha256)throw Error('R1_RESUME_CHUNK_MISMATCH');storage.reusedChunks++;storage.reusedBytes+=data.length;}else{fs.writeFileSync(path.join(chunkRoot,id),data,{flag:'wx'});storage.newChunks++;storage.newBytes+=data.length;}seen.set(id,descriptor);},
  async complete(manifest){validateSnapshot(manifest);if(seen.size<old.size||manifest.chunks.length!==seen.size||manifest.chunks.some(item=>seen.get(item.id)?.sha256!==item.sha256||seen.get(item.id)?.bytes!==item.bytes))throw Error('R1_RESUME_INCOMPLETE_COVERAGE');const bytes=JSON.stringify(manifest);fs.writeFileSync(path.join(root,'manifest.json'),bytes,{flag:'wx'});fs.writeFileSync(path.join(root,'manifest.sha256'),hash(bytes),{flag:'wx'});if(fs.existsSync(path.join(root,'FAILED'))){if(fs.existsSync(path.join(root,'FAILED-BEFORE-RESUME')))throw Error('R1_RESUME_MARKER_EXISTS');fs.renameSync(path.join(root,'FAILED'),path.join(root,'FAILED-BEFORE-RESUME'));}fs.writeFileSync(path.join(root,'RESUMED-PREFIX.json'),JSON.stringify(storage,null,2)+'\n',{flag:'wx'});fs.renameSync(path.join(root,'INCOMPLETE'),path.join(root,'COMPLETE'));},
  /** @this {void} */
  async abort(){fs.writeFileSync(path.join(root,'FAILED'),'Resume/conversion incomplete; retain all chunks for review.\n',{flag:'a'});},
 };
}
