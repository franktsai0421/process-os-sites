// Read the copied Local snapshot through the production decoder. No writes to Local storage.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import {DatabaseSync} from 'node:sqlite';
import {decodeLocalSnapshot} from '../lib/local-snapshot.mjs';
import * as Bom from '../public/process/bom-domain.mjs';
const [root,excel,out]=process.argv.slice(2);if(!root||!excel||!out)throw Error('snapshot, Excel, output required');
const hash=v=>crypto.createHash('sha256').update(v).digest('hex');
function sqlite(dir){return path.join(dir,fs.readdirSync(dir).find(f=>f.endsWith('.sqlite')&&f!=='metadata.sqlite'));}
const db=new DatabaseSync(sqlite(path.join(root,'.wrangler/state/v3/d1/miniflare-D1DatabaseObject')),{readOnly:true}),r2=new DatabaseSync(sqlite(path.join(root,'.wrangler/state/v3/r2/miniflare-R2BucketObject')),{readOnly:true});
try{
 const stored=db.prepare('SELECT revision,"values" FROM shared_state WHERE id=1').get();
 const bucket={async get(key){const row=r2.prepare('SELECT blob_id FROM _mf_objects WHERE key=?').get(key);if(!row?.blob_id)return null;const bytes=fs.readFileSync(path.join(root,'.wrangler/state/v3/r2/site-creator-r2/blobs',row.blob_id));return {text:async()=>bytes.toString('utf8')};}};
 const decoded=await decodeLocalSnapshot(bucket,JSON.parse(stored.values)),values=decoded.values;
 const ctx={Buffer};vm.runInNewContext(fs.readFileSync('public/process/vendor/xlsx.full.min.js','utf8'),ctx);const book=ctx.XLSX.read(fs.readFileSync(excel),{type:'buffer'}),bom=Bom.parseWorkbook(ctx.XLSX,book,{file:path.basename(excel)}),references=Bom.auditReferences(values,bom);
 const old=JSON.parse(values.bomOverrides||'{}'),oldBom=old.replaceAll?old.data:old;
 fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'reference-audit.json'),JSON.stringify(references,null,2));
 const receipt={revision:stored.revision,sourceSha256:hash(fs.readFileSync(excel)),roots:Object.keys(bom),rows:Object.values(bom).flat().length,oldOverrideRoots:Object.keys(oldBom).length,referenceCount:references.length,referenceStatuses:references.reduce((a,r)=>(a[r.status]=(a[r.status]||0)+1,a),{}),protectedValueHashes:Object.fromEntries(Object.entries(values).map(([key,value])=>[key,hash(value)]))};
 fs.writeFileSync(path.join(out,'before-receipt.json'),JSON.stringify(receipt,null,2));fs.writeFileSync(path.join(out,'source-projection.json'),JSON.stringify(bom));
 console.log(JSON.stringify({...receipt,protectedValueHashes:Object.keys(receipt.protectedValueHashes).length}));
}finally{db.close();r2.close();}
