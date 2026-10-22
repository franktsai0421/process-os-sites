import fs from 'node:fs';
import path from 'node:path';
import {sha256,validateSnapshot,maximumChunkBytes} from './snapshot-contract.mjs';
export function assertPlainDirectory(directory) {
  const absolute=path.resolve(directory);
  if(absolute.startsWith('\\\\')||absolute.startsWith('//'))throw Error('SNAPSHOT_NETWORK_PATH');
  const parsed=path.parse(absolute);let current=parsed.root;
  for(const segment of absolute.slice(parsed.root.length).split(path.sep).filter(Boolean)){current=path.join(current,segment);if(fs.existsSync(current)&&fs.lstatSync(current).isSymbolicLink())throw Error('SNAPSHOT_LINK_PATH');}
  return absolute;
}
export function createSnapshotDirectorySink(directory) {
  const root=assertPlainDirectory(directory);
  fs.mkdirSync(root,{mode:0o700});fs.mkdirSync(path.join(root,'chunks'),{mode:0o700});
  fs.writeFileSync(path.join(root,'INCOMPLETE'),'Snapshot transfer has not completed.\n',{flag:'wx',mode:0o600});
  const hashes=new Map();
  return {
    scope:'private-snapshot',
    async writeChunk(id,data){if(!/^c[0-9]+$/.test(id)||hashes.has(id)||data.length>maximumChunkBytes)throw Error('SNAPSHOT_CHUNK');fs.writeFileSync(path.join(root,'chunks',id),data,{flag:'wx',mode:0o600});hashes.set(id,{bytes:data.length,sha256:await sha256(data)});},
    async complete(manifest){validateSnapshot(manifest);if(manifest.chunks.length!==hashes.size||manifest.chunks.some(chunk=>hashes.get(chunk.id)?.sha256!==chunk.sha256||hashes.get(chunk.id)?.bytes!==chunk.bytes))throw Error('SNAPSHOT_INTEGRITY');const text=JSON.stringify(manifest);fs.writeFileSync(path.join(root,'manifest.json'),text,{flag:'wx',mode:0o600});fs.writeFileSync(path.join(root,'manifest.sha256'),await sha256(new TextEncoder().encode(text)),{flag:'wx',mode:0o600});fs.renameSync(path.join(root,'INCOMPLETE'),path.join(root,'COMPLETE'));},
    async abort(){fs.writeFileSync(path.join(root,'FAILED'),'Transfer failed; retain partial files for review.\n',{flag:'a',mode:0o600});},
  };
}
export async function openSnapshotDirectory(directory,expectedManifestSha256) {
  const root=assertPlainDirectory(directory);
  if(!/^[a-f0-9]{64}$/.test(expectedManifestSha256||'')||!fs.existsSync(path.join(root,'COMPLETE'))||fs.existsSync(path.join(root,'INCOMPLETE'))||fs.existsSync(path.join(root,'FAILED')))throw Error('SNAPSHOT_PACKAGE_NOT_COMPLETE');
  const file=path.join(root,'manifest.json');
  if(fs.lstatSync(file).isSymbolicLink()||fs.statSync(file).size>16*1024*1024)throw Error('SNAPSHOT_MANIFEST_LIMIT');
  const bytes=fs.readFileSync(file);if(await sha256(bytes)!==expectedManifestSha256)throw Error('SNAPSHOT_MANIFEST_CHECKSUM');
  const manifest=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));validateSnapshot(manifest);
  return {scope:'private-snapshot',root,async manifest(){return manifest;},async readChunk(id){if(!/^c[0-9]+$/.test(id))throw Error('SNAPSHOT_CHUNK_ID');const file=path.join(root,'chunks',id);if(fs.lstatSync(file).isSymbolicLink()||fs.statSync(file).size>maximumChunkBytes)throw Error('SNAPSHOT_CHUNK');return new Uint8Array(fs.readFileSync(file));}};
}
