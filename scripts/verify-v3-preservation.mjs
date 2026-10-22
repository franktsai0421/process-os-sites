import {withFixtureCleanupSync} from './fixture-cleanup.mjs';
// Read-only verification of the explicit task backup. Restores SQLite into a
// disposable directory, then resolves its R2 reference against the backed-up blobs.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
const backupRoot=path.resolve(process.argv[2]||'.wrangler/local-only/v3-preservation-20261001');
const manifest=JSON.parse(fs.readFileSync(path.join(backupRoot,'manifest.json'),'utf8'));
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
let totalBytes=0;
for(const file of manifest.files){const target=path.resolve(backupRoot,file.path);if(!target.startsWith(backupRoot+path.sep))throw Error('Unsafe manifest path');
  const bytes=fs.readFileSync(target);if(bytes.length!==file.bytes||sha(bytes)!==file.sha256)throw Error('Backup hash mismatch');totalBytes+=bytes.length;}
const restored=fs.mkdtempSync(path.resolve('.wrangler/local-only/v3-restore-check-'));
withFixtureCleanupSync(() => {
  const sqlFiles=manifest.files.filter(file=>file.path.endsWith('.sqlite'));
  let state;
  for(const file of sqlFiles){const source=new DatabaseSync(path.join(backupRoot,file.path),{readOnly:true});const to=path.join(restored,path.basename(file.path));
    source.exec(`VACUUM INTO '${to.replaceAll("'","''")}'`);source.close();const db=new DatabaseSync(to,{readOnly:true});
    if(Object.values(db.prepare('PRAGMA integrity_check').get())[0]!=='ok')throw Error('Restored SQLite integrity failure');
    if(file.path.includes('/d1/'))state=db.prepare('SELECT revision,"values" FROM shared_state WHERE id=1').get();db.close();}
  if(!state||state.revision!==manifest.revision)throw Error('Restored state revision mismatch');
  const metadata=sqlFiles.find(file=>file.path.includes('/r2/miniflare-R2BucketObject/')&&!file.path.endsWith('/metadata.sqlite'));
  const r2=new DatabaseSync(path.join(restored,path.basename(metadata.path)),{readOnly:true});
  const objects=r2.prepare('SELECT key,blob_id,size FROM _mf_objects').all();
  const blobRoot=path.join(backupRoot,'state/v3/r2/site-creator-r2/blobs');
  for(const object of objects){if(!object.blob_id)continue;if(!/^[a-f0-9]+$/.test(object.blob_id))throw Error('Unexpected blob identifier');
    if(fs.statSync(path.join(blobRoot,object.blob_id)).size!==object.size)throw Error('Referenced blob size mismatch');}
  let values=JSON.parse(state.values);
  if(values.__processR2){const ref=values.__processR2,row=objects.find(o=>o.key===ref.key);if(!row)throw Error('Restored current snapshot missing');
    const bytes=fs.readFileSync(path.join(blobRoot,row.blob_id));if(sha(bytes)!==ref.sha256)throw Error('Restored snapshot integrity mismatch');values=JSON.parse(bytes.toString());}
  const hashes=JSON.parse(fs.readFileSync(path.join(backupRoot,'shared-key-hashes.json'),'utf8'));
  // Public source hashes omit account secrets; compare only non-account business keys.
  for(const [key,digest] of Object.entries(hashes))if(key!=='platformUsers'&&sha(values[key])!==digest)throw Error('Restored business key mismatch: '+key);
  const report={result:'PASS',revision:state.revision,files:manifest.files.length,bytes:totalBytes,sqliteIntegrityChecks:sqlFiles.length,
    r2Objects:objects.length,businessKeys:Object.keys(values).length,restoredCurrentSnapshot:true,backupRoot};
  r2.close();console.log(JSON.stringify(report));
}, () => {
  // Exact freshly-created disposable directory only; never backup or live state.
  if(path.dirname(restored)!==path.resolve('.wrangler/local-only')||!path.basename(restored).startsWith('v3-restore-check-'))throw Error('Unsafe cleanup target');
  fs.rmSync(restored,{recursive:true,force:true});
});
