/* oxlint-disable typescript/no-require-imports -- Isolated SQLite/R2 verification. */
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const db=new DatabaseSync(':memory:');
db.exec('CREATE TABLE shared_state(id INTEGER PRIMARY KEY, revision INTEGER, "values" TEXT); CREATE TABLE state_backups(id TEXT PRIMARY KEY,revision INTEGER,"values" TEXT,reason TEXT,actor TEXT,created_at TEXT)');
let puts=0;const objects=new Map();
const env={DB:{prepare(sql){let args=[];return{bind(...values){args=values;return this;},async run(){return{meta:{changes:Number(db.prepare(sql).run(...args).changes)}};}};}},STATE_ARCHIVE:{async put(key,bytes){assert.ok(ArrayBuffer.isView(bytes));puts++;objects.set(key,Buffer.from(bytes));},async get(key){const bytes=objects.get(key);return bytes?{arrayBuffer:async()=>Uint8Array.from(bytes).buffer}:null;}}};
const {backupStoredState,encodeValues,decodeValues}=require('./ipqc-ab-import-harness.cjs')(env)('lib/process-state.ts');
(async()=>{
  const values={workspace:JSON.stringify({text:'x'.repeat(4_600_000)})};const raw=await encodeValues(values);assert.equal(puts,1);
  assert.equal(JSON.stringify(await decodeValues(raw)),JSON.stringify(values),'byte snapshot round trip');
  db.prepare('INSERT INTO shared_state VALUES(1,7,?)').run(raw);
  assert.equal(await backupStoredState({revision:7,values},'fixture','fixture'),true);
  assert.equal(puts,1,'backup must not re-encode/upload the entire old snapshot');
  assert.equal(db.prepare('SELECT "values" FROM state_backups').get().values,raw);
  assert.equal(await backupStoredState({revision:6,values},'stale','fixture'),false);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM state_backups').get().n,1);
  console.log(JSON.stringify({result:'PASS',snapshotBytes:Buffer.byteLength(values.workspace),r2Puts:puts,backupR2Puts:0,staleRevisionRejected:true}));db.close();
})().catch(error=>{console.error(error);process.exitCode=1;});
