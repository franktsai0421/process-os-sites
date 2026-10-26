/* oxlint-disable typescript/no-require-imports -- Actual handlers with synthetic SQLite/R2 only. */
const test=require('node:test'),assert=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite'),{randomBytes}=require('node:crypto'),harness=require('./ipqc-ab-import-harness.cjs');
function fixture(){
 const sqlite=new DatabaseSync(':memory:'),objects=new Map(),writes=[],puts=[];
 sqlite.exec('CREATE TABLE shared_state(id INTEGER PRIMARY KEY,revision INTEGER,"values" TEXT,updated_at TEXT);CREATE TABLE state_backups(id TEXT PRIMARY KEY,revision INTEGER,"values" TEXT,reason TEXT,actor TEXT,created_at TEXT)');
 const values={platformUsers:JSON.stringify([{id:'frank',name:'Synthetic primary',role:'admin',enabled:true,authMode:'platform',authEpoch:1}]),backupSettings:JSON.stringify({enabled:true,time:'12:00',dayOfWeek:6,frequency:'weekly'}),dispatchBoard:JSON.stringify({A:[],B:[],C:[]})};
 sqlite.prepare('INSERT INTO shared_state VALUES(1,7,?,?)').run(JSON.stringify(values),'fixture');
 for(let i=0;i<150;i++)sqlite.prepare('INSERT INTO state_backups VALUES(?,?,?,?,?,?)').run('old-'+i,i,JSON.stringify({original:i}),'fixture','fixture',new Date(Date.UTC(2026,0,1)+i*1000).toISOString());
 const f={sqlite,objects,writes,puts,values,reads:[],beforeRun:null,beforeFirst:null,unknown:false};
 const bucket={async put(key,value){puts.push(key);objects.set(key,typeof value==='string'?Buffer.from(value):Buffer.from(value));},async head(key){return objects.has(key)?{size:objects.get(key).length}:null;},async get(key){const data=objects.get(key);return data?{size:data.length,text:async()=>data.toString(),arrayBuffer:async()=>Uint8Array.from(data).buffer}:null;}};
 const env={STATE_ARCHIVE:bucket,PROCESS_SESSION_SECRET:randomBytes(32).toString('hex'),PROCESS_RELEASE_TOKEN:randomBytes(32).toString('hex'),DB:{prepare(sql){let args=[];return{bind(...a){args=a;return this;},async first(){f.reads.push(sql);f.beforeFirst?.(sql,args);return sqlite.prepare(sql).get(...args)||null;},async all(){return{results:sqlite.prepare(sql).all(...args)};},async run(){writes.push(sql);f.beforeRun?.(sql,args);const changes=Number(sqlite.prepare(sql).run(...args).changes);if(f.unknown==='throw')throw Error('synthetic unknown result');return f.unknown?{}:{meta:{changes}};}};}}};
 const load=harness(env);Object.assign(f,{env,load,core:load('lib/process-state.ts'),bootstrap:load('app/api/process-bootstrap/route.ts'),shared:load('app/api/shared-state/route.ts')});
 f.count=()=>sqlite.prepare('SELECT count(*) n FROM state_backups').get().n;
 f.update=()=>sqlite.prepare('UPDATE shared_state SET "values"=? WHERE id=1').run(JSON.stringify(values));
 f.request=async(path,extra={})=>{const base=new Request('https://fixture.invalid'+path),token=await f.core.demoSession(base,'frank',false,1);return new Request(base.url,{...extra,headers:{cookie:f.core.sessionCookie(base,token).split(';')[0],...extra.headers}});};
 f.noPrune=()=>assert(writes.every(sql=>!/^\s*DELETE\s+FROM\s+state_backups/i.test(sql)));
 f.close=()=>sqlite.close();return f;
}
async function run(fn){const f=fixture();try{await fn(f);}finally{f.close();}}
test('both authenticated GET handlers leave enabled/due backups and shared state unchanged',()=>run(async f=>{
 const before=f.sqlite.prepare('SELECT * FROM shared_state').get(),old=f.sqlite.prepare('SELECT * FROM state_backups').all();
 for(const [route,path]of [[f.bootstrap,'/api/process-bootstrap?view=data&dataTab=quality-iqc'],[f.shared,'/api/shared-state']]){
  assert.equal((await route.GET(new Request('https://fixture.invalid'+path))).status,401);
  const response=await route.GET(await f.request(path));assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'no-store');const body=await response.json();assert.equal(body.identity.id,'frank');assert.equal(body.revision,7);
 }
 assert.deepEqual(f.sqlite.prepare('SELECT * FROM shared_state').get(),before);assert.deepEqual(f.sqlite.prepare('SELECT * FROM state_backups').all(),old);assert.equal(f.writes.length,0);assert.equal(f.puts.length,0);
}));
test('deferred-media GETs still populate technical R2 cache, never backup/prune or mutate D1',()=>run(async f=>{
 // Transport-only synthetic bytes, not image-rendering or full-quality evidence.
 const media='data:image/png;base64,'+Buffer.alloc(5000,3).toString('base64');f.values.dispatchBoard=JSON.stringify({A:[],B:[],C:[],fixture:media});f.update();
 const before=f.sqlite.prepare('SELECT * FROM shared_state').get();
 for(const [route,path]of [[f.bootstrap,'/api/process-bootstrap?view=data&dataTab=quality-iqc'],[f.shared,'/api/shared-state']]){
  const response=await route.GET(await f.request(path,{headers:{'X-Process-Media':'deferred-v1'}}));assert.equal(response.status,200);await response.json();
 }
 assert(f.puts.some(key=>key.startsWith('delivery/v1/')));assert(f.puts.some(key=>key.startsWith('delivery/media/')));assert.equal(f.writes.length,0);assert.equal(f.count(),150);assert.deepEqual(f.sqlite.prepare('SELECT * FROM shared_state').get(),before);
 assert.equal(JSON.parse(f.sqlite.prepare('SELECT "values" FROM shared_state').get().values).dispatchBoard,f.values.dispatchBoard,'stored original transport bytes preserved');
}));
test('GET authorization still rejects a revoked actor epoch and cross-origin POST still refuses',()=>run(async f=>{
 const bootstrap=await f.request('/api/process-bootstrap?view=data&dataTab=quality-iqc'),shared=await f.request('/api/shared-state');
 const users=JSON.parse(f.values.platformUsers);users[0].authEpoch=2;f.values.platformUsers=JSON.stringify(users);f.update();
 assert.equal((await f.bootstrap.GET(bootstrap)).status,401);assert.equal((await f.shared.GET(shared)).status,401);
 const denied=await f.shared.POST(new Request('https://fixture.invalid/api/shared-state',{method:'POST',headers:{Origin:'https://other.invalid'},body:'{}'}));assert.equal(denied.status,403);assert.equal(f.writes.length,0);
}));

test('periodic compatibility entry is inert even with enabled, due, partial or malformed settings',()=>run(async f=>{
 const before=f.sqlite.prepare('SELECT * FROM state_backups ORDER BY id').all();let fullReads=0;
 for(const state of [await f.core.readState(),{revision:7,values:{backupSettings:'{"enabled":true}'},deliveryOnly:true},{revision:7,values:{backupSettings:'invalid'}}]){
  f.reads.length=0;const result=await f.core.scheduledBackup(state,async()=>{fullReads++;throw Error('must not read full state');});
  assert.equal(result.status,'disabled');assert.equal(f.reads.length,0);
 }
 assert.equal(fullReads,0);assert.equal(f.writes.length,0);assert.equal(f.puts.length,0);assert.deepEqual(f.sqlite.prepare('SELECT * FROM state_backups ORDER BY id').all(),before);
}));
test('revision admission is read-only, fails closed and does not decode a full snapshot',()=>run(async f=>{
 const current={revision:7};assert.equal(await f.core.stateRevisionIsCurrent(current),true);assert.equal(await f.core.stateRevisionIsCurrent({revision:6}),false);
 const count=f.reads.length;for(const revision of [-1,1.5,NaN,Number.MAX_SAFE_INTEGER+1])assert.equal(await f.core.stateRevisionIsCurrent({revision}),false);assert.equal(f.reads.length,count);
 assert(f.reads.every(sql=>sql==='SELECT revision FROM shared_state WHERE id=1 AND revision=?'));assert.equal(f.writes.length,0);assert.equal(f.puts.length,0);
 f.beforeFirst=()=>{throw Error('synthetic read unavailable');};await assert.rejects(()=>f.core.stateRevisionIsCurrent(current),/unavailable/);assert.equal(f.count(),150);
}));
const update={dispatchBoard:JSON.stringify({A:[],B:[],C:[],fixture:'changed'})};
async function save(f,updates=update,baseRevision=7){return f.shared.POST(await f.request('/api/shared-state',{method:'POST',headers:{Origin:'https://fixture.invalid','Content-Type':'application/json','X-Process-Receipt':'sha256'},body:JSON.stringify({baseRevision,updates})}));}
test('ordinary save retains data, revision and receipt but never creates/prunes a backup',()=>run(async f=>{
 const old=f.sqlite.prepare('SELECT * FROM state_backups ORDER BY id').all(),response=await save(f);assert.equal(response.status,200);const body=await response.json();assert.equal(body.revision,8);
 assert.equal(f.sqlite.prepare('SELECT revision FROM shared_state').get().revision,8);assert.equal(JSON.parse(f.sqlite.prepare('SELECT "values" FROM shared_state').get().values).dispatchBoard,update.dispatchBoard);
 assert.deepEqual(f.sqlite.prepare('SELECT * FROM state_backups ORDER BY id').all(),old);assert.equal(f.writes.length,1);assert.match(f.writes[0],/^UPDATE shared_state/);
 const replay=await save(f,update,8);assert.equal(replay.status,200);assert.equal(f.writes.length,1,'no-change replay performs no write');
}));
test('retained enabled schedule settings cannot reactivate automatic snapshots',()=>run(async f=>{
 const updates={backupSettings:JSON.stringify({enabled:true,frequency:'weekly',dayOfWeek:6,time:'13:00',timezone:'Asia/Ho_Chi_Minh'})};assert.equal((await save(f,updates)).status,200);
 assert.equal((await f.shared.GET(await f.request('/api/shared-state'))).status,200);assert.equal(f.count(),150);assert.equal(f.writes.length,1);
}));
test('stale request and revision race retain conflict handling without backup writes',()=>run(async f=>{
 assert.equal((await save(f,update,6)).status,409);assert.equal(f.writes.length,0);
 let changed=false;f.beforeRun=sql=>{if(!changed&&sql.startsWith('UPDATE shared_state')){changed=true;f.sqlite.prepare('UPDATE shared_state SET revision=8 WHERE id=1').run();}};
 assert.equal((await save(f)).status,409);assert.equal(JSON.parse(f.sqlite.prepare('SELECT "values" FROM shared_state').get().values).dispatchBoard,f.values.dispatchBoard);assert.equal(f.count(),150);assert.equal(f.writes.length,1);
}));
test('revision admission failure stops before encoding or the final mutation',()=>run(async f=>{
 f.beforeFirst=sql=>{if(sql==='SELECT revision FROM shared_state WHERE id=1 AND revision=?')throw Error('synthetic revision read unavailable');};
 await assert.rejects(()=>save(f),/unavailable/);assert.equal(f.writes.length,0);assert.equal(f.puts.length,0);assert.equal(f.count(),150);
}));
test('unknown committed save acknowledgment is not converted into success or blindly retried',()=>run(async f=>{
 f.unknown='throw';await assert.rejects(()=>save(f),/unknown result/);assert.equal(f.sqlite.prepare('SELECT revision FROM shared_state').get().revision,8);assert.equal(f.writes.length,1);assert.equal(f.count(),150);
}));
test('explicit maintenance capture and stored-envelope helper remain available without implicit pruning',()=>run(async f=>{
 const old=f.sqlite.prepare('SELECT * FROM state_backups ORDER BY id').all(),state=await f.core.readState();
 assert.equal(await f.core.backupStoredState(state,'explicit fixture maintenance','fixture'),true);assert.equal(f.count(),151);
 const release=f.load('app/api/release-state/route.ts'),body=JSON.stringify({action:'capture',values:update});
 const denied=await release.POST(new Request('https://fixture.invalid/api/release-state',{method:'POST',headers:{Origin:'https://fixture.invalid','Content-Type':'application/json'},body}));assert.equal(denied.status,403);
 const response=await release.POST(new Request('https://fixture.invalid/api/release-state',{method:'POST',headers:{Origin:'https://fixture.invalid','Content-Type':'application/json','X-Process-Release-Token':f.env.PROCESS_RELEASE_TOKEN},body}));assert.equal(response.status,200);const saved=await response.json();assert(saved.id);assert.equal(f.count(),152);
 for(const row of old)assert.deepEqual(f.sqlite.prepare('SELECT * FROM state_backups WHERE id=?').get(row.id),row);assert.equal(f.sqlite.prepare('SELECT revision FROM shared_state').get().revision,7);f.noPrune();
}));
test('backup screen reports disabled without flushing business input or calling a missing endpoint',async()=>{
 const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),source=fs.readFileSync('public/process/data-safety-ui.js','utf8'),tree=ts.createSourceFile('ui.js',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);let declaration;
 function visit(n){if(ts.isFunctionDeclaration(n)&&n.name?.text==='backupPage')declaration=source.slice(n.getStart(tree),n.end);ts.forEachChild(n,visit);}visit(tree);assert(declaration);
 for(const lang of ['zh-Hant','vi']){const content={innerHTML:''},context={document:{documentElement:{lang},querySelector:()=>content},canManage:()=>true,activeBackupMode:'cloud',backupModeSummary:()=>'',bindBackupModeSwitches(){},sync:{flush(){throw Error('must not flush');}},backupRequest(){throw Error('must not fetch');}};vm.createContext(context);vm.runInContext(declaration,context);await context.backupPage();assert.match(content.innerHTML,/data-backup-status="disabled"/);assert(!content.innerHTML.includes('data-cloud-restore'));}
});

test('legacy IQC begin/save uses synthetic existing standards and preserves historical backups',()=>run(async f=>{
 const sample=require('./v3-quality-growth-fixture.cjs')('iqc',[{id:'a'.repeat(64)}],1,2),control=JSON.parse(sample.values.iqcMasterControl);delete control.workflow;control.versions=control.versions.filter(v=>v.status==='approved');
 f.values.iqcMasterControl=JSON.stringify(control);f.values.masterDataControl=sample.values.masterDataControl;f.update();const api=f.load('app/api/iqc/route.ts');
 const post=async body=>api.POST(await f.request('/api/iqc',{method:'POST',headers:{Origin:'https://fixture.invalid','Content-Type':'application/json'},body:JSON.stringify(body)}));
 let response=await post({action:'begin',baseRevision:7});assert.equal(response.status,200,await response.clone().text());let body=await response.json(),draft=body.control.versions.find(v=>v.status==='draft');assert(draft);const snapshot=structuredClone(draft.snapshot);snapshot.parts[0].nameVi='Synthetic edited part';
 response=await post({action:'save',baseRevision:body.revision,versionId:draft.id,versionRevision:draft.revision,snapshot});assert.equal(response.status,200,await response.clone().text());body=await response.json();assert.equal(body.control.versions.find(v=>v.status==='draft').snapshot.parts[0].nameVi,'Synthetic edited part');assert.equal(body.control.versions.find(v=>v.status==='approved').snapshot.parts[0].nameVi,control.versions[0].snapshot.parts[0].nameVi);
 assert.equal(f.count(),150);assert.equal(f.writes.length,2);assert(f.writes.every(sql=>sql.startsWith('UPDATE shared_state')));
}));

test('legacy IPQC-C begin/save retains active history and does not create protection snapshots',()=>run(async f=>{
 const sample=require('./v3-quality-growth-fixture.cjs')('ipqc-c',[{id:'a'.repeat(64)}],1,2),control=JSON.parse(sample.values.ipqcCMasterControl);delete control.workflow;control.versions=control.versions.filter(v=>v.status==='approved');
 f.values.ipqcCMasterControl=JSON.stringify(control);f.values.masterDataControl=sample.values.masterDataControl;f.update();const api=f.load('app/api/ipqc-c/route.ts');
 const post=async body=>api.POST(await f.request('/api/ipqc-c',{method:'POST',headers:{Origin:'https://fixture.invalid','Content-Type':'application/json'},body:JSON.stringify(body)}));
 let response=await post({action:'begin',baseRevision:7});assert.equal(response.status,200,await response.clone().text());let body=await response.json(),draft=body.control.versions.find(v=>v.status==='draft');assert(draft);const snapshot=structuredClone(draft.snapshot);snapshot.items[0].standard='Synthetic changed standard';
 response=await post({action:'save',baseRevision:body.revision,versionId:draft.id,versionRevision:draft.revision,snapshot});assert.equal(response.status,200,await response.clone().text());body=await response.json();assert.equal(body.control.versions.find(v=>v.status==='draft').snapshot.items[0].standard,'Synthetic changed standard');assert.equal(body.control.versions.find(v=>v.status==='approved').snapshot.items[0].standard,control.versions[0].snapshot.items[0].standard);
 assert.equal(f.count(),150);assert.equal(f.writes.length,2);assert(f.writes.every(sql=>sql.startsWith('UPDATE shared_state')));
}));

test('legacy IPQC-AB begin/save retains active history and does not create protection snapshots',()=>run(async f=>{
 const sample=require('./v3-quality-growth-fixture.cjs')('ipqc-ab',[{id:'a'.repeat(64)}],1,2),control=JSON.parse(sample.values.ipqcABMasterControl),scope=control.scopes['A:G'];delete scope.workflow;scope.versions=scope.versions.filter(v=>v.status==='approved');
 f.values.ipqcABMasterControl=JSON.stringify(control);f.values.masterDataControl=sample.values.masterDataControl;f.update();const api=f.load('app/api/ipqc-ab/route.ts');
 const post=async body=>api.POST(await f.request('/api/ipqc-ab',{method:'POST',headers:{Origin:'https://fixture.invalid','Content-Type':'application/json'},body:JSON.stringify({line:'A',group:'G',...body})}));
 let response=await post({action:'begin',baseRevision:7});assert.equal(response.status,200,await response.clone().text());let body=await response.json(),draft=body.control.scopes['A:G'].versions.find(v=>v.status==='draft');assert(draft);const snapshot=structuredClone(draft.snapshot);snapshot.items[0].standard='Synthetic changed standard';
 response=await post({action:'save',baseRevision:body.revision,versionId:draft.id,versionRevision:draft.revision,snapshot});assert.equal(response.status,200,await response.clone().text());body=await response.json();assert.equal(body.control.scopes['A:G'].versions.find(v=>v.status==='draft').snapshot.items[0].standard,'Synthetic changed standard');assert.equal(body.control.scopes['A:G'].versions.find(v=>v.status==='approved').snapshot.items[0].standard,scope.versions[0].snapshot.items[0].standard);
 assert.equal(f.count(),150);assert.equal(f.writes.length,2);assert(f.writes.every(sql=>sql.startsWith('UPDATE shared_state')));
}));
