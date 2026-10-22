// Read-only verification against the external before receipt and original ERP projection.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';
import {decodeLocalSnapshot} from '../lib/local-snapshot.mjs';import {semantic,compare} from '../public/process/bom-domain.mjs';
const [backup,out]=process.argv.slice(2);if(!backup||!out)throw Error('backup root and output receipt required');
const hash=v=>crypto.createHash('sha256').update(v).digest('hex'),root=process.cwd();
const locate=(base,kind)=>{const folder=path.join(base,'.wrangler/state/v3',kind,kind==='d1'?'miniflare-D1DatabaseObject':'miniflare-R2BucketObject');const files=fs.readdirSync(folder).filter(f=>f.endsWith('.sqlite')&&f!=='metadata.sqlite');assert.equal(files.length,1);return path.join(folder,files[0]);};
const db=new DatabaseSync(locate(root,'d1'),{readOnly:true}),oldDB=new DatabaseSync(locate(path.join(backup,'daily-before'),'d1'),{readOnly:true}),r2=new DatabaseSync(locate(root,'r2'),{readOnly:true});
try{
 const row=db.prepare('SELECT revision,"values" FROM shared_state WHERE id=1').get();
 const bucket={async get(key){const entry=r2.prepare('SELECT blob_id FROM _mf_objects WHERE key=?').get(key);if(!entry)return null;const bytes=fs.readFileSync(path.join(root,'.wrangler/state/v3/r2/site-creator-r2/blobs',entry.blob_id));return{text:async()=>bytes.toString()};}};
 const {values}=await decodeLocalSnapshot(bucket,JSON.parse(row.values));
 const before=JSON.parse(fs.readFileSync(path.join(backup,'pre-apply/before-receipt.json'))),source=JSON.parse(fs.readFileSync(path.join(backup,'analysis/source-projection.json')));
 const changed=Object.entries(before.protectedValueHashes).filter(([key,digest])=>hash(values[key]||'')!==digest).map(([key])=>key);assert.deepEqual(changed,[],'Protected pre-existing values changed');
 const control=JSON.parse(values.bomMasterControl),flow=control.workflow;assert(flow?.saved);assert.equal(control.activeVersionId,null,'Real approval must remain a human action');
 assert.equal(compare(source,flow.saved.content.bom,{replaceAll:true}).changes.length,0);assert.equal(compare(source,flow.working.bom,{replaceAll:true}).changes.length,0);
 const tableDigest=database=>hash(JSON.stringify(database.prepare('SELECT * FROM web_feedback_store ORDER BY id').all()));assert.equal(tableDigest(db),tableDigest(oldDB),'Feedback changed');
 assert.equal(db.prepare('SELECT revision FROM shared_state WHERE id=1').get().revision,row.revision,'Concurrent verification changed revision');
 const receipt={status:'PASS',at:new Date().toISOString(),revision:row.revision,activeVersionId:control.activeVersionId,pendingId:flow.pendingId||null,savedId:flow.saved.id,roots:Object.keys(flow.saved.content.bom).length,rows:Object.values(flow.saved.content.bom).flat().length,sourceDifferences:0,referenceIssues:flow.working.referenceIssues.length,protectedKeys:Object.keys(before.protectedValueHashes).length,protectedChanged:changed,feedbackUnchanged:true,oldActiveRoots:before.oldOverrideRoots,semanticSha256:hash(JSON.stringify(semantic(flow.saved.content.bom)))};
 fs.writeFileSync(out,JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));
}finally{db.close();oldDB.close();r2.close();}
