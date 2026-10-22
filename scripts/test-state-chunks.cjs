/* oxlint-disable typescript/no-require-imports -- isolated storage compatibility and fault tests. */
const assert=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite'),{randomUUID}=require('node:crypto');
const db=new DatabaseSync(':memory:'),objects=new Map();let putBytes=0,failPut=false;
db.exec('CREATE TABLE shared_state(id INTEGER PRIMARY KEY,revision INTEGER,"values" TEXT,updated_at TEXT); CREATE TABLE state_backups(id TEXT PRIMARY KEY,revision INTEGER,"values" TEXT,reason TEXT,actor TEXT,created_at TEXT)');
const bucket={async put(k,v){if(failPut)throw Error('isolated storage failure');putBytes+=Buffer.byteLength(v);objects.set(k,v);},async get(k){return objects.has(k)?{text:async()=>Buffer.from(objects.get(k)).toString(),arrayBuffer:async()=>Uint8Array.from(Buffer.from(objects.get(k))).buffer}:null;}};
const env={STATE_ARCHIVE:bucket,DB:{prepare(sql){let args=[];return{bind(...v){args=v;return this;},async first(){return db.prepare(sql).get(...args)||null;},async run(){return{meta:{changes:Number(db.prepare(sql).run(...args).changes)}};}};}}};
const load=require('./ipqc-ab-import-harness.cjs')(env),core=load('lib/process-state.ts'),chunks=load('lib/state-chunks.ts');
(async()=>{try{
 const picture='data:image/webp;base64,'+Buffer.alloc(200000,19).toString('base64'),content={id:'content',name:'Kiểm tra尺寸😀'.repeat(3000),photo:picture};
 const values={platformUsers:'[]',masterDataControl:JSON.stringify({working:content,cases:Array.from({length:12},()=>({id:randomUUID(),content}))}),formatting:' { "unicode": "😀\\ud800", "zero": -0, "exponent": 1e2 } '};
 const legacy=await core.encodeValues(values);assert.ok(JSON.parse(legacy).__processR2);assert.deepEqual({...await core.decodeValues(legacy)},values);
 const encoded=await chunks.encodeChunkedValues(bucket,values);db.prepare('INSERT INTO shared_state VALUES(1,1,?,?)').run(encoded,'fixture');
 let state=await core.readState();assert.deepEqual({...state.values},values);assert.equal(core.publicState(state).storage,undefined);
 const reads=new Map(objects),source=db.prepare('SELECT * FROM shared_state').get();
 assert.equal(await core.backupStoredState(state,'fixture','fixture'),true);assert.equal(db.prepare('SELECT "values" FROM state_backups').get().values,encoded);
 const next={...state.values,formatting:' '+values.formatting},beforeBytes=putBytes,stored=await core.encodeValues(next,state);assert.ok(JSON.parse(stored).__processChunks);assert.ok(putBytes-beforeBytes<Buffer.byteLength(values.masterDataControl)/10);
 const changed=db.prepare('UPDATE shared_state SET revision=2,"values"=? WHERE revision=1').run(stored);assert.equal(changed.changes,1);
 assert.equal(db.prepare('UPDATE shared_state SET revision=3,"values"=? WHERE revision=1').run(encoded).changes,0);
 state=await require('./ipqc-ab-import-harness.cjs')(env)('lib/process-state.ts').readState();assert.deepEqual({...state.values},next);assert.deepEqual({...await core.decodeValues(encoded)},values);assert.equal(await core.backupStoredState({revision:1,values},'stale','fixture'),false);
 const capture={...state,values:{...state.values,formatting:'capture'}};assert.equal((await core.decodeValues(await core.encodeValues(capture.values,capture))).formatting,'capture');
 const current=db.prepare('SELECT * FROM shared_state').get();failPut=true;await assert.rejects(()=>core.encodeValues({...state.values,formatting:'new'},state),/storage failure/);failPut=false;assert.deepEqual(db.prepare('SELECT * FROM shared_state').get(),current);
 const pack=[...objects.keys()].find(k=>k.includes('/packs/')),original=objects.get(pack);objects.set(pack,original+'corrupt');await assert.rejects(()=>core.decodeValues(encoded),/integrity/);objects.delete(pack);await assert.rejects(()=>core.decodeValues(encoded),/unavailable/);objects.set(pack,original);
 const corruptEnvelope=JSON.parse(encoded);corruptEnvelope.__processChunks.key='../../secret';await assert.rejects(()=>core.decodeValues(JSON.stringify(corruptEnvelope)),/Invalid/);
 assert.deepEqual({...await core.decodeValues(source.values)},values);assert.ok([...reads].every(([key,value])=>objects.get(key)===value),'immutable legacy/chunks retained');
 assert.deepEqual({...await core.decodeValues(await core.encodeValues(state.values))},next,'explicit legacy re-encoding preserves original values');
 let randomized=await core.readState(),text=values.formatting+'😀'.repeat(40000);for(let i=0;i<18;i++){
   const at=(i*15337)%(text.length-2),start=text.charCodeAt(at)>=0xdc00&&text.charCodeAt(at)<=0xdfff?at+1:at;
   text=i%3===0?text.slice(0,start)+'Ảnh尺寸'+i+text.slice(start):i%3===1?text.slice(0,start)+text.slice(start+2):text.slice(start)+text.slice(0,start);
   const changed={...randomized.values,formatting:JSON.stringify({text})},raw=await core.encodeValues(changed,randomized);db.prepare('UPDATE shared_state SET "values"=? WHERE id=1').run(raw);randomized=await core.readState();assert.equal(randomized.values.formatting,changed.formatting);
 }
 console.log(JSON.stringify({result:'PASS',cases:['legacy unchanged default','byte-exact conversion incl emoji escapes whitespace numeric syntax and media','small edit reuse','reopen','backup restoration','CAS loser','write failure does not touch DB','corrupt/missing/path-traversal rejected','reverse-format roundtrip','private storage metadata omitted'],localWrites:0}));
 }finally{db.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
