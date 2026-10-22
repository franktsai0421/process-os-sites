/* oxlint-disable typescript/no-require-imports -- isolated maintenance-format compatibility. */
const assert=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite'),harness=require('./ipqc-ab-import-harness.cjs');
(async()=>{
 const {readLocalState,writeLocalState}=await import('../lib/local-data.mjs'),{decodeLocalSnapshot}=await import('../lib/local-snapshot.mjs');
 const db=new DatabaseSync(':memory:'),objects=new Map(),bucket={async put(k,v){objects.set(k,v);},async get(k){return objects.has(k)?{text:async()=>objects.get(k)}:null;}};
 db.exec('CREATE TABLE shared_state(id INTEGER PRIMARY KEY,revision INTEGER,"values" TEXT,updated_at TEXT)');
 const context={bucket,db:{prepare(sql){let args=[];return{bind(...a){args=a;return this;},async first(){return db.prepare(sql).get(...args);},async run(){return{meta:{changes:Number(db.prepare(sql).run(...args).changes)}};}};}}};
 const load=harness({}),values={platformUsers:'[]',fixture:JSON.stringify({workflow:{working:{text:'Tiếng Việt 中文'},cases:[{id:'old',status:'approved',content:{text:'immutable photo',mediaItems:[{src:'data:image/png;base64,AA=='}]}}]}})};
 try{for(const [name,fn,storage]of [['state-records','encodeRecordValues','LOCAL_RECORDS'],['state-chunks','encodeChunkedValues','LOCAL_CHUNKS']]){
  const encoded=await load('lib/'+name+'.ts')[fn](bucket,values);db.prepare('INSERT OR REPLACE INTO shared_state VALUES(1,1,?,?)').run(encoded,'fixture');
  const before=await readLocalState(context);assert.equal(before.storage,storage);assert.deepEqual(JSON.parse(before.values.fixture),JSON.parse(values.fixture));
  const modified={...before.values,extra:'{"changed":true}'};await writeLocalState(context,before,modified);
  const after=await readLocalState(context);assert.equal(after.storage,storage);assert.equal(after.values.extra,modified.extra);assert.equal(after.values.fixture,before.values.fixture);
  await assert.rejects(()=>writeLocalState(context,before,{...modified,extra:'false'}),/revision conflict/);
  const restored=await decodeLocalSnapshot(bucket,JSON.parse(encoded));assert.equal(restored.values.fixture,before.values.fixture);assert.equal(restored.values.extra,undefined);
 }
 console.log(JSON.stringify({result:'PASS_ISOLATED',checks:['maintenance read old and new formats','write preserves adopted format','stale CAS rejected','exact backup pointer decodes complete immutable history/media'],realLocalWrites:0}));
 }finally{db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
