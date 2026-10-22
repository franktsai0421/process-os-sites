/* oxlint-disable typescript/no-require-imports -- readonly Local source, memory-only test DB/R2 overlay. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite'),{randomUUID,createHash}=require('node:crypto'),harness=require('./ipqc-ab-import-harness.cjs');
const hash=value=>createHash('sha256').update(value).digest('hex');
module.exports=async function fixture(){
 const manifest=JSON.parse(fs.readFileSync('.wrangler/local-only/v3-preservation-20261001/manifest.json'));
 const sourcePath=relative=>path.resolve('.wrangler',relative);
 const d1Path=sourcePath(manifest.files.find(f=>f.path.includes('/d1/')&&f.path.endsWith('.sqlite')).path);
 const r2Path=sourcePath(manifest.files.find(f=>f.path.includes('/r2/miniflare-R2BucketObject/')&&f.path.endsWith('.sqlite')&&!f.path.endsWith('/metadata.sqlite')).path);
 const source=new DatabaseSync(d1Path,{readOnly:true}),r2=new DatabaseSync(r2Path,{readOnly:true}),db=new DatabaseSync(':memory:'),generated=new Map();
 const originalRow=source.prepare('SELECT * FROM shared_state WHERE id=1').get();assert.ok(originalRow);
 const sourceToken=hash(JSON.stringify(originalRow));
 const bucket={async get(key){let bytes,metadata;if(generated.has(key)){const row=generated.get(key);bytes=Buffer.from(row.value);metadata=row.options?.httpMetadata;}else{const row=r2.prepare('SELECT blob_id,size FROM _mf_objects WHERE key=?').get(key);if(!row)return null;assert.match(row.blob_id,/^[a-f0-9]+$/);bytes=fs.readFileSync(path.resolve('.wrangler/state/v3/r2/site-creator-r2/blobs',row.blob_id));assert.equal(bytes.length,row.size);metadata={contentType:key.includes('/photos/')?'image/webp':'application/json'};}return{body:new Blob([bytes]).stream(),text:async()=>bytes.toString(),arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),httpMetadata:metadata};},async head(key){return generated.has(key)||r2.prepare('SELECT 1 FROM _mf_objects WHERE key=?').get(key)?{}:null;},async put(key,value,options){generated.set(key,{value,options});}};
 db.exec('CREATE TABLE shared_state(id INTEGER PRIMARY KEY,revision INTEGER,"values" TEXT,updated_at TEXT);CREATE TABLE state_backups(id TEXT PRIMARY KEY,revision INTEGER,"values" TEXT,reason TEXT,actor TEXT,created_at TEXT)');
 db.prepare('INSERT INTO shared_state VALUES(1,?,?,?)').run(originalRow.revision,originalRow.values,originalRow.updated_at);
 const env={PROCESS_SESSION_SECRET:randomUUID(),STATE_ARCHIVE:bucket,DB:{prepare(sql){let args=[];return{bind(...values){args=values;return this;},async first(){return db.prepare(sql).get(...args)||null;},async all(){return{results:db.prepare(sql).all(...args)};},async run(){return{meta:{changes:Number(db.prepare(sql).run(...args).changes)}};}};}}};
 const load=harness(env),core=load('lib/process-state.ts'),original=(await core.readState()).values;
 const testValues={...original,platformUsers:JSON.stringify([...JSON.parse(original.platformUsers),...['preparation-a','preparation-b'].map(id=>({id,name:id,role:'admin',enabled:true,password:randomUUID()}))])};
 async function reset(values=testValues){db.prepare('UPDATE shared_state SET revision=?,"values"=?,updated_at=? WHERE id=1').run(originalRow.revision,originalRow.values,originalRow.updated_at);db.prepare('DELETE FROM state_backups').run();const encoded=await load('lib/state-records.ts').encodeRecordValues(bucket,values);db.prepare('UPDATE shared_state SET "values"=? WHERE id=1').run(encoded);}
 async function converted(){const conversion=load('lib/process-authoring-conversion.ts'),plan=await conversion.prepareProcessAuthoringConversion(testValues,originalRow.revision);assert.equal(plan.ready,true);return{plan,values:{...testValues,processAuthoringControl:JSON.stringify(conversion.authoringControlFromPlan(plan)),processAuthoringRecovery:JSON.stringify({sourceRevision:plan.sourceRevision,sourceDigest:plan.sourceDigest,sourceHashes:plan.sourceHashes,recoveryValues:plan.recoveryValues,preservedSavedDrafts:plan.preservedSavedDrafts})}};}
 function verifySource(){assert.equal(hash(JSON.stringify(source.prepare('SELECT * FROM shared_state WHERE id=1').get())),sourceToken,'existing Local pointer/revision changed');}
 function close(){try{verifySource();}finally{db.close();r2.close();source.close();}}
 await reset();return{db,load,core,original,testValues,revision:originalRow.revision,sourceToken,reset,converted,verifySource,close};
};
