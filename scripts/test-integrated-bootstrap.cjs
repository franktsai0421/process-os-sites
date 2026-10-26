/* oxlint-disable typescript/no-require-imports -- isolated real route/record codec and SQLite fixture; no network. */
const assert=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite'),{randomBytes}=require('node:crypto'),harness=require('./ipqc-ab-import-harness.cjs');
const db=new DatabaseSync(':memory:'),objects=new Map();let gets=[],puts=0,afterGet=null;
db.exec('CREATE TABLE shared_state(id INTEGER PRIMARY KEY,revision INTEGER,"values" TEXT,updated_at TEXT);CREATE TABLE state_backups(id TEXT PRIMARY KEY,revision INTEGER,"values" TEXT,reason TEXT,actor TEXT,created_at TEXT)');
const bucket={async put(key,value){puts++;objects.set(key,value);},async get(key){gets.push(key);afterGet?.(key);const raw=objects.get(key);return raw===undefined?null:{size:Buffer.byteLength(raw),text:async()=>raw};}};
const env={STATE_ARCHIVE:bucket,PROCESS_SESSION_SECRET:randomBytes(32).toString('hex'),DB:{prepare(sql){let args=[];return {bind(...values){args=values;return this;},async first(){return db.prepare(sql).get(...args)||null;},async run(){return {meta:{changes:Number(db.prepare(sql).run(...args).changes)}};}};}}};
const load=harness(env),core=load('lib/process-state.ts'),records=load('lib/state-records.ts'),route=load('app/api/process-bootstrap/route.ts'),{accessKeys}=require('../public/process/access-policy.mjs');
const cells=permission=>Object.fromEntries(accessKeys.map(key=>[key,key===permission]));
const users=[{id:'quality',name:'Quality fixture',role:'staff',enabled:true,authMode:'platform',authEpoch:1,accessOverrides:cells('iqc.view')},{id:'player',name:'Player fixture',role:'staff',enabled:true,authMode:'platform',authEpoch:1,accessOverrides:cells('player.view')}];
const catalog=line=>({products:[{code:line+'1',name:line,category:line,line,stages:[line+'-CUT']}],lines:[{code:line,name:line,stages:[{code:line+'-CUT',name:'Cut'}]}]});
const current={name:'current',photos:[]},history=Array.from({length:30},(_,i)=>({id:'old'+i,status:'superseded',snapshot:{name:'old'+i,padding:'history'.repeat(10000)}}));
const values={platformUsers:JSON.stringify(users),backupSettings:JSON.stringify({enabled:false}),masterDataControl:JSON.stringify({active:{AB:catalog('A'),C:catalog('C'),PROCESS:{}},versions:[]}),bomOverrides:JSON.stringify({replaceAll:true,data:{}}),iqcMasterControl:JSON.stringify({activeVersionId:'now',versions:[{id:'now',status:'approved',snapshot:current},...history],workflow:{working:{name:'private working'},cases:[],saves:[],receipts:{}}}),dispatchBoard:JSON.stringify({A:['A1'],B:[],C:[]}),canonicalQuality:JSON.stringify({iqc:{public:'yes'},fqc:{private:'no'}})};
async function request(id){const base=new Request('https://fixture.invalid/api/process-bootstrap'),token=await core.demoSession(base,id,false,1);return new Request(base.url,{headers:{cookie:core.sessionCookie(base,token).split(';')[0]}});}
(async()=>{try{
 const raw=await records.encodeRecordValues(bucket,values);db.prepare('INSERT INTO shared_state VALUES(1,498,?,?)').run(raw,'fixture');
 gets=[];const full=await core.readState(),fullReads=gets.length;
 gets=[];const effective=await core.readState({keys:['iqcMasterControl'],effectiveOnly:true});const effectiveReads=gets.length;
 const iqc=JSON.parse(effective.values.iqcMasterControl);assert.deepEqual(iqc.versions.map(v=>v.id),['now']);assert.deepEqual(iqc.workflow,{});
 assert(effectiveReads<fullReads);await assert.rejects(()=>core.encodeValues(effective.values,effective),/Read-only delivery cannot be saved/);
 assert.equal(JSON.parse(full.values.iqcMasterControl).versions.length,31,'ordinary history unchanged');
 const beforePuts=puts;
 const anonymous=await route.GET(new Request('https://fixture.invalid/api/process-bootstrap'));assert.equal(anonymous.status,401);
 gets=[];const quality=await route.GET(await request('quality'));assert.equal(quality.status,200);const q=await quality.json();
 assert.equal(q.identity.id,'quality');assert(q.deliveryProjection);assert.deepEqual(q.catalog.loadedScopes,[]);assert(!q.values.masterDataControl);assert(!JSON.stringify(q).includes('private working'));assert(!JSON.stringify(q).includes('padding'));
 assert.equal(q.destination.module,'iqc');assert.deepEqual(q.writableKeys,[]);
 const envelope=JSON.parse(raw);for(const key of ['masterDataControl','iqcMasterControl','canonicalQuality']){assert.equal(Object.hasOwn(q.values,key),false);assert(envelope.__processRecords.values[key]?.key);assert(!gets.includes(envelope.__processRecords.values[key].key),'dedicated module aggregate not read by bootstrap');}
 const player=await route.GET(await request('player'));assert.equal(player.status,200);const p=await player.json();
 assert.equal(p.catalog.imported.products.length,2);assert(!p.values.iqcMasterControl);assert.deepEqual(Object.keys(JSON.parse(p.values.masterDataControl).active),['PROCESS']);
 assert.deepEqual(p.writableKeys,['dispatchBoard']);assert.equal(puts,beforePuts,'bootstrap without deferred media/new backup must not write');
 const req=await request('player');let changed=false;afterGet=()=>{if(!changed){changed=true;db.prepare('UPDATE shared_state SET revision=revision+1').run();}};
 assert.equal((await route.GET(req)).status,409,'revision change during I/O fails closed');afterGet=null;
 assert.equal(JSON.parse(db.prepare('SELECT "values" FROM shared_state').get().values).__processRecords.version,1);
 console.log(JSON.stringify({result:'PASS_ISOLATED_BOOTSTRAP',fullReads,effectiveReads,historyRows:30,zeroBusinessWrites:true,checks:['normal sessions','anonymous rejection','module boundary','active-only immutable SHA reads','no seed writes','partial encode rejection','fresh revision fence','unchanged legacy history']}));
}finally{db.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
