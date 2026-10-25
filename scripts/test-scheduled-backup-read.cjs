/* oxlint-disable typescript/no-require-imports -- Actual backup code with isolated SQLite/R2, no network. */
const assert=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite');
const db=new DatabaseSync(':memory:'),objects=new Map();let puts=0,fullReads=0;
db.exec('CREATE TABLE shared_state(id INTEGER PRIMARY KEY,revision INTEGER,"values" TEXT,updated_at TEXT);CREATE TABLE state_backups(id TEXT PRIMARY KEY,revision INTEGER,"values" TEXT,reason TEXT,actor TEXT,created_at TEXT)');
const bucket={async put(k,v){puts++;objects.set(k,v);},async get(k){return objects.has(k)?{text:async()=>objects.get(k)}:null;}};
const env={STATE_ARCHIVE:bucket,DB:{prepare(sql){let args=[];return{bind(...a){args=a;return this;},async first(){return db.prepare(sql).get(...args)||null;},async run(){return{meta:{changes:Number(db.prepare(sql).run(...args).changes)}};}};}}};
const load=require('./ipqc-ab-import-harness.cjs')(env),core=load('lib/process-state.ts'),records=load('lib/state-records.ts');
(async()=>{try{
 const values={backupSettings:JSON.stringify({enabled:true,frequency:'weekly',time:'12:00',dayOfWeek:6}),masterDataControl:JSON.stringify({active:{AB:{products:[{code:'fixture'}]}},versions:[]})};
 const raw=await records.encodeRecordValues(bucket,values);db.prepare('INSERT INTO shared_state VALUES(1,20,?,?)').run(raw,'fixture');
 const partial=await core.readState({keys:['backupSettings'],effectiveOnly:true});
 await assert.rejects(()=>core.scheduledBackup(partial),/Partial read/);
 await assert.rejects(()=>core.scheduledBackup(partial,async()=>({...await core.readState(),revision:21})),/snapshot changed/);
 assert.equal(db.prepare('SELECT count(*) n FROM state_backups').get().n,0);
 const complete=async()=>{fullReads++;return core.readState();};
 await core.scheduledBackup(partial,complete);assert.equal(fullReads,1);assert.equal(db.prepare('SELECT count(*) n FROM state_backups').get().n,1);
 const before=puts;await core.scheduledBackup(partial,complete);assert.equal(fullReads,1);assert.equal(puts,before,'same scheduled id must not reread full data or re-encode');
 const saved=db.prepare('SELECT revision,"values" v FROM state_backups').get();assert.equal(saved.revision,20);const decoded=await records.decodeRecordValues(bucket,JSON.parse(saved.v));assert.equal(decoded.values.masterDataControl,values.masterDataControl);
 console.log(JSON.stringify({status:'PASS_SCHEDULED_BACKUP_READ',sameSlotExtraObjectPuts:puts-before,fullReads,partialRejected:true,revisionRaceRejected:true,completeSnapshotPreserved:true}));
}finally{db.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
