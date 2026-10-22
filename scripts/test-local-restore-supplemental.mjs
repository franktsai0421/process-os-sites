// Focused restore regression: supplemental entries are mandatory, never skipped.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {createLocalBackup,restoreLocalBackup} from '../lib/local-data.mjs';
const parent=path.resolve('.wrangler/local-only');
const fixture=fs.mkdtempSync(path.join(parent,'restore-supplemental-test-'));
const hash=v=>crypto.createHash('sha256').update(v).digest('hex');
try{
 const source=path.join(fixture,'source'),target=path.join(fixture,'target');fs.mkdirSync(path.join(source,'.wrangler/state'),{recursive:true});fs.mkdirSync(target);
 fs.writeFileSync(path.join(source,'.wrangler/state/payload'),'storage');
 const backup=createLocalBackup(source),manifestPath=path.join(backup,'manifest.json'),manifest=JSON.parse(fs.readFileSync(manifestPath));
 for(const file of ['public/process/photo.webp','data/canonical/example.json','.openai/hosting.json']){const bytes=Buffer.from('supplement '+file),dest=path.join(backup,file);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,bytes);manifest.entries.push({path:file,bytes:bytes.length,sha256:hash(bytes)});}
 manifest.sha256=hash(JSON.stringify(manifest.entries));fs.writeFileSync(manifestPath,JSON.stringify(manifest));assert.equal(restoreLocalBackup(target,backup),true);
 for(const entry of manifest.entries)assert.equal(hash(fs.readFileSync(path.join(target,entry.path))),entry.sha256);
 fs.writeFileSync(path.join(target,'.wrangler/state/payload'),'keep current');fs.writeFileSync(path.join(backup,'public/process/photo.webp'),'corrupt');assert.throws(()=>restoreLocalBackup(target,backup),/Backup integrity failed/);assert.equal(fs.readFileSync(path.join(target,'.wrangler/state/payload'),'utf8'),'keep current');
 console.log('PASS storage and every supplemental file restored/hash verified; corrupt supplemental backup rejected before any target replacement.');
}finally{const resolved=fs.realpathSync(fixture);assert.equal(path.dirname(resolved),parent);assert.ok(path.basename(resolved).startsWith('restore-supplemental-test-'));fs.rmSync(resolved,{recursive:true});}
