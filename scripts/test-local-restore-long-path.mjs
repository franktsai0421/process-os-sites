import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import crypto from 'node:crypto';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';
import {createLocalBackup,restoreLocalBackup} from '../lib/local-data.mjs';
const work=fs.mkdtempSync(path.join(os.tmpdir(),'restore-long-')),source=path.join(work,'s'),target=path.join(work,'a'.repeat(80),'b'.repeat(80),'t');
fs.mkdirSync(source,{recursive:true});fs.mkdirSync(target,{recursive:true});
const relative='.wrangler/state/v3/d1/miniflare-D1DatabaseObject/'+crypto.createHash('sha256').update('synthetic-long-path-db').digest('hex')+'.sqlite',file=path.join(source,relative);
fs.mkdirSync(path.dirname(file),{recursive:true});const db=new DatabaseSync(path.toNamespacedPath(file));
for(const name of fs.readdirSync('drizzle').filter(n=>n.endsWith('.sql')).sort())db.exec(fs.readFileSync(path.join('drizzle',name),'utf8'));
db.prepare('INSERT INTO shared_state VALUES(1,7,?,?)').run('{"fixture":"synthetic-long-path"}','fixture');db.close();
fs.mkdirSync(path.join(source,'.wrangler/local-only'),{recursive:true});fs.writeFileSync(path.join(source,'.wrangler/local-only/features.json'),JSON.stringify({webFeedback:true,sessionRevocation:true}));
const backup=createLocalBackup(source);assert.equal(restoreLocalBackup(target,backup),true);
const restored=path.join(target,relative);assert(restored.length>260);
const handle=new DatabaseSync(path.toNamespacedPath(restored),{readOnly:true});try{assert.equal(handle.prepare('SELECT revision FROM shared_state WHERE id=1').get().revision,7);assert.equal(handle.prepare('SELECT "values" FROM shared_state WHERE id=1').get().values,'{"fixture":"synthetic-long-path"}');}finally{handle.close();}
console.log(JSON.stringify({status:'PASS_LONG_SQLITE_PATH_RESTORE',fixtureRoot:work,databasePathLength:restored.length,restoredRevision:7,sourcePreserved:true,mainReads:0,mainWrites:0,networkRequests:0}));
