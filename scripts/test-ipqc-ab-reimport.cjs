/* oxlint-disable typescript/no-require-imports -- Isolated CommonJS D1/R2 fixture. */
// In-memory D1/R2 handler tests; optional restore-test of the real pre-write snapshot.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {randomUUID,createHash}=require('node:crypto');
const loadHarness=require('./ipqc-ab-import-harness.cjs');
const plain=value=>JSON.parse(JSON.stringify(value));
const merge=loadHarness()('lib/ipqc-ab-import.ts');
const coreAb=loadHarness()('lib/ipqc-ab.ts');
const catalog={groups:[{line:'A',name:'G'}],products:[{line:'A',code:'001',name:'P',category:'G',stages:['A-CUT']},
  {line:'A',code:'002',name:'Q',category:'G',stages:['A-CUT']}],stages:[{line:'A',code:'A-CUT',name:'Cut'}]};
const variant=(key,standard,products=['001'])=>({key:key.repeat(64),line:'A',group:'G',stageCode:'A-CUT',errorCode:'A-G-CUT-L1',
  errorName:'Error',standard,methodText:'',sourceEnabled:'YES',sourceTool:'工具原文',sourceMethod:'原文',sourceFrequency:'AQL: 0.25',
  sourceVersion:'V1',sourceChangedAt:'',sourceReason:'',sourceCreator:'',sourceNote:'',sourceRows:[2],
  sourceItemCodes:['A-G-CUT-L1-01'],productCodes:products,blocked:false});
const actor={id:'demo-admin',name:'Demo Admin'};
const payload={source:{fileName:'IPQC_CHUAN_29092026_V.xlsx',sha256:merge.AB_LATEST_SHA,rows:1461},
  catalog,variants:[variant('a','S1'),variant('b','S2',['002'])]};
const first=merge.mergeAbImport(coreAb.emptyAbControl(),catalog,payload,actor,'one');
assert.equal(first.summary.added,2);assert.equal(first.control.scopes['A:G'].versions[0].status,'draft');
assert.equal(first.control.scopes['A:G'].activeVersionId,null);
assert.equal(new Set(first.entries.map(e=>e.code)).size,2);
assert.equal(merge.mergeAbImport(first.control,catalog,{...payload,variants:[...payload.variants].reverse()},actor,'two').changed,false);
// A manually renamed imported parent stays attached to the same source and children.
const renamed=plain(first.control), renamedVersion=renamed.scopes['A:G'].versions[0];
const changed=plain(renamedVersion.snapshot);
changed.errors[0].code='Manual / Ω';
const importedItem=changed.items[0];
const importedId=importedItem.id;
importedItem.code='Manual.42 / QA';
renamedVersion.snapshot=coreAb.checkedAbSnapshot(renamedVersion,changed,catalog,'A','G',true);
const replay=merge.mergeAbImport(renamed,catalog,payload,actor,'rename-replay');
assert.equal(replay.control.scopes['A:G'].versions[0].snapshot.items.find(row=>row.id===importedId).code,'Manual.42 / QA');
assert.equal(replay.summary.added,0);
assert.equal(replay.summary.deleted,0);
assert.deepEqual(plain(replay.control.scopes['A:G'].versions[0].snapshot),plain(renamedVersion.snapshot));
// A case/space-equivalent suggestion cannot replace another owner in either line.
for(const peer of [false,true]){
  const collision=plain(first.control), group=collision.scopes['A:G'], version=group.versions[0];
  const owner={...plain(version.snapshot.items[0]),id:'disabled-owner',code:' a-g-cut-l1-03 ',isEnabled:false};
  delete owner.sourceImport;owner.sourceRows=[];
  if(peer){
    collision.scopes['B:H']={line:'B',group:'H',activeVersionId:'peer-approved',versions:[{
      ...plain(version),id:'peer-approved',status:'approved',snapshot:{errors:[],items:[owner]}
    }]};
  }else version.snapshot.items.push(owner);
  const before=plain(collision);
  const incoming={...variant('c','S3'),sourceRows:[4],sourceItemCodes:['A-G-CUT-L1-03']};
  assert.throws(()=>merge.mergeAbImport(collision,catalog,{...payload,variants:[...payload.variants,incoming]},actor,'occupied'),
    error=>error.message==='ITEM_CODE_DUPLICATE' && error.details.occupiedBy===owner.id &&
      error.details.code==='A-G-CUT-L1-03' && error.details.scope===(peer?'B:H':undefined));
  assert.deepEqual(collision,before);
}

// Reimport opens a fresh draft after approval. Only its own verified lineage can
// establish the identity of a legacy row that predates per-item sourceImport.
{
  const approved=plain(first.control), scope=approved.scopes['A:G'], origin=scope.versions[0];
  const error=origin.snapshot.errors[0], row=origin.snapshot.items[0];
  delete error.sourceImport;delete row.sourceImport;row.id='ipqc-ab-item:'+row.code;
  origin.snapshot={errors:[error],items:[row]};origin.status='superseded';
  origin.history=[{action:'initial-import',comment:merge.AB_LEGACY_SHA,actorId:actor.id,actorName:actor.name,at:'initial'}];
  const legacy={sha256:merge.AB_LEGACY_SHA,errors:[plain(error)],items:[plain(row)]};
  const latest=plain(origin);latest.id='approved-manual';latest.baseVersionId=origin.id;latest.number=2;
  latest.history=[];latest.status='approved';
  const renamedSnapshot=plain(origin.snapshot);renamedSnapshot.items[0].code='MANUAL-FULL-731';
  latest.snapshot=coreAb.checkedAbSnapshot(latest,renamedSnapshot,catalog,'A','G',true);
  scope.versions.push(latest);scope.activeVersionId=latest.id;
  const request={...payload,variants:[payload.variants[0]],legacy},before=plain(scope.versions);
  const mapped=merge.mergeAbImport(approved,catalog,request,actor,'from-approved');
  const draft=mapped.control.scopes['A:G'].versions.at(-1);
  assert.equal(mapped.summary.added,0);assert.equal(mapped.summary.deferred,0);
  assert.equal(draft.status,'draft');assert.equal(draft.baseVersionId,latest.id);
  assert.equal(draft.snapshot.items.length,1);
  const saved=draft.snapshot.items[0];
  assert.equal(saved.id,row.id);assert.equal(saved.code,'MANUAL-FULL-731');assert.equal(saved.sourceCode,row.code);
  assert.deepEqual(plain(saved.rules),plain(row.rules));assert.deepEqual(plain(saved.sourceImport.sourceItemCodes),legacy.items.map(i=>i.code));
  assert.deepEqual(plain(mapped.control.scopes['A:G'].versions.slice(0,-1)),before);
  assert.equal(merge.mergeAbImport(mapped.control,catalog,request,actor,'again').changed,false);
  for(const invalid of [
    c=>{c.versions.at(-1).baseVersionId='unknown';},
    c=>{c.versions.at(-1).baseVersionId=c.versions.at(-1).id;},
    c=>{c.versions.unshift(plain(c.versions[0]));},
    c=>{c.versions[0].snapshot.items[0].sourceRows=[99];},
  ]){
    const ambiguous=plain(approved);invalid(ambiguous.scopes['A:G']);
    const result=merge.mergeAbImport(ambiguous,catalog,request,actor,'unverified');
    assert.equal(result.summary.added,0);assert.equal(result.summary.deferred,1);
  }
}
// An absent source only soft-deletes unmodified imported children. A code-only
// manual edit retains the child even when its sibling from that source is removed.
{
  const manual=plain(first.control), version=manual.scopes['A:G'].versions[0];
  const proposal=plain(version.snapshot), stableId=proposal.items[0].id, original=proposal.items[0].code;
  proposal.items[0].code='MANUAL-KEEP';
  version.snapshot=coreAb.checkedAbSnapshot(version,proposal,catalog,'A','G',true);
  const absent=merge.mergeAbImport(manual,catalog,{...payload,variants:[]},actor,'code-only-absent');
  const children=absent.control.scopes['A:G'].versions[0].snapshot.items;
  assert.deepEqual(plain(children.find(row=>row.id===stableId)),plain(version.snapshot.items[0]));
  assert.equal(children.find(row=>row.id===stableId).sourceCode,original);
  assert.equal(children[1].deleted,true);assert.equal(absent.summary.deleted,1);
  assert(absent.entries.find(row=>row.code==='MANUAL-KEEP').reasons.includes('manual_content_preserved'));
  const returned=merge.mergeAbImport(absent.control,catalog,payload,actor,'code-only-return');
  assert.equal(returned.summary.added,0);
  assert.equal(returned.control.scopes['A:G'].versions[0].snapshot.items.find(row=>row.id===stableId).code,'MANUAL-KEEP');
}
const edited=JSON.parse(JSON.stringify(first.control));
const snapshot=edited.scopes['A:G'].versions[0].snapshot,item=snapshot.items[0];
item.standardPhotos=[{id:'f'.repeat(64),name:'original',note:'standard'}];
item.methodPhotos=[{id:'e'.repeat(64),name:'method',note:'method'}];
item.inspectionMode='equipment';item.equipmentId='equipment';item.equipmentSnapshot={id:'equipment',name:'Machine',assetCode:'E',pieceMark:''};
item.methodText='manual';item.rules=[{id:'manual',cadence:'time',kind:'month'}];item.standard='Manual S1';item.reason='Manual';
const updated=merge.mergeAbImport(edited,catalog,payload,actor,'three');
assert.equal(updated.changed,false);assert.equal(updated.summary.manualDifferences,1);
assert.deepEqual(plain(updated.control.scopes['A:G'].versions[0].snapshot.items[0]),item);
const absent=merge.mergeAbImport(edited,catalog,{...payload,variants:[]},actor,'four');
assert.equal(absent.summary.deleted,1);assert.equal(absent.control.scopes['A:G'].versions[0].snapshot.items[0].deleted,false);
assert.equal(absent.control.scopes['A:G'].versions[0].snapshot.items[1].deleted,true);
const reintroduced=merge.mergeAbImport(absent.control,catalog,payload,actor,'five');
assert.equal(reintroduced.summary.added,0);assert.equal(reintroduced.control.scopes['A:G'].versions[0].snapshot.items[1].deleted,true);
const ambiguous=JSON.parse(JSON.stringify(edited));
ambiguous.scopes['A:G'].versions[0].snapshot.items.push({...item,id:'duplicate',code:'A-G-CUT-L1-09'});
assert.equal(merge.mergeAbImport(ambiguous,catalog,payload,actor,'six').summary.deferred,1);
assert.throws(()=>merge.mergeAbImport(first.control,catalog,{...payload,variants:[variant('c','S1',['MISSING'])]},actor,'bad'));
assert.throws(()=>merge.mergeAbImport(first.control,catalog,{...payload,variants:[variant('a','S1'),{...variant('b','S1'),sourceTool:'DIFFERENT'}]},actor,'bad'));
const pending=JSON.parse(JSON.stringify(first.control));pending.scopes['A:G'].versions[0].status='pending-test';
assert.equal(merge.mergeAbImport(pending,catalog,payload,actor,'pending').changed,false);
assert.equal(merge.mergeAbImport(pending,catalog,payload,actor,'pending').summary.deferred,2);

if (process.argv.includes('--merge-only')) {
  console.log('PASS isolated AB merger, manual rename, child identity and repeat import');
} else (async()=>{
  const db=new DatabaseSync(':memory:');
  for(const name of fs.readdirSync('drizzle').filter(n=>n.endsWith('.sql')).sort()) db.exec(fs.readFileSync(path.join('drizzle',name),'utf8'));
  const objects=new Map(),env={PROCESS_SESSION_SECRET:randomUUID(),PROCESS_RELEASE_TOKEN:randomUUID(),DEMO_LOGIN_ENABLED:'true',
    DB:{prepare(sql){let args=[];return {bind(...v){args=v;return this;},async first(){return db.prepare(sql).get(...args)||null;},
      async all(){return {results:db.prepare(sql).all(...args)};},async run(){return {meta:{changes:Number(db.prepare(sql).run(...args).changes)}};}};}},
    STATE_ARCHIVE:{async put(k,v){objects.set(k,v);},async head(k){return objects.has(k)?{}:null;},
      async get(k){return objects.has(k)?{text:async()=>Buffer.from(objects.get(k)).toString()}:null;}}};
  const load=loadHarness(env),core=load('lib/process-state.ts'),api=load('app/api/ipqc-ab/route.ts');
  const master={active:{AB:{categoryGroups:catalog.groups,products:catalog.products,lines:[{code:'A',stages:catalog.stages}]}}};
  const users=['admin','staff'].map(role=>({id:'demo-'+role,name:'Demo '+role,role,authMode:'demo',enabled:true,inheritRole:true}));
  const values={platformUsers:JSON.stringify(users),masterDataControl:JSON.stringify(master),qualityMasterControl:'FQC untouched',iqcMasterControl:'IQC untouched'};
  db.prepare('INSERT INTO shared_state(id,revision,"values",updated_at) VALUES(1,1,?,?)').run(JSON.stringify(values),'fixture');
  const base='http://127.0.0.1:3000';
  const cookies=Object.fromEntries(await Promise.all(users.map(async u=>[u.role,'process_demo='+await core.demoSession(new Request(base),u.id,true)])));
  async function call(role,p,revision,origin=base){return api.POST(new Request(base+'/api/ipqc-ab',{method:'POST',headers:{Origin:origin,
    Cookie:cookies[role], 'X-Process-Expected-Actor':'demo-'+role,'X-Process-Release-Token':env.PROCESS_RELEASE_TOKEN, 'Content-Type':'application/json'},body:JSON.stringify({action:'reimport',baseRevision:revision,import:p})}));}
  assert.equal((await call('staff',payload,1)).status,403);
  assert.equal((await call('admin',payload,1,'https://evil.invalid')).status,403);
  assert.equal((await call('admin',payload,0)).status,409);
  let response=await call('admin',payload,1);assert.equal(response.status,200,await response.clone().text());
  let result=await response.json();assert.equal(result.importReport.summary.added,2);
  assert.equal((await call('admin',payload,1)).status,409);
  result=await (await call('admin',payload,result.revision)).json();assert.equal(result.unchanged,true);
  const state=await core.readState();assert.equal(state.values.qualityMasterControl,values.qualityMasterControl);
  assert.equal(state.values.iqcMasterControl,values.iqcMasterControl);
  const draft=result.control.scopes['A:G'].versions[0];
  response=await api.POST(new Request(base+'/api/ipqc-ab',{method:'POST',headers:{Origin:base,Cookie:cookies.admin,'X-Process-Expected-Actor':'demo-admin','Content-Type':'application/json'},
    body:JSON.stringify({action:'submit',baseRevision:state.revision,line:'A',group:'G',versionId:draft.id,versionRevision:draft.revision,snapshot:draft.snapshot,reason:'test'})}));
  assert.equal(response.status,409);assert.equal((await response.json()).error,'WORKFLOW_V3_REQUIRED');
  response=await api.POST(new Request(base+'/api/ipqc-ab',{method:'POST',headers:{Origin:base,Cookie:cookies.admin,'X-Process-Expected-Actor':'demo-admin','Content-Type':'application/json'},
    body:JSON.stringify({action:'submit-test',baseRevision:(await core.readState()).revision,line:'A',group:'G',versionId:draft.id,versionRevision:draft.revision,snapshot:draft.snapshot,reason:'test'})}));
  assert.equal(response.status,410,'Trial submissions have been retired');
  assert.equal(JSON.parse((await core.readState()).values.ipqcABMasterControl).scopes['A:G'].activeVersionId,null);
  result=await (await call('admin',payload,result.revision)).json();assert.equal(result.unchanged,true);
  db.close();
  if(process.argv[2]) {
    const directory=path.resolve(process.argv[2]);const manifest=JSON.parse(fs.readFileSync(path.join(directory,'manifest.json'),'utf8'));
    for(const file of manifest.files) assert.equal(createHash('sha256').update(fs.readFileSync(path.join(directory,file.path))).digest('hex'),file.sha256);
    for(const file of manifest.files.filter(f=>f.path.endsWith('.sqlite'))) {
      const restored=new DatabaseSync(path.join(directory,file.path),{readOnly:true});
      assert.equal(Object.values(restored.prepare('PRAGMA integrity_check').get())[0],'ok');restored.close();
    }
    const live=JSON.parse(fs.readFileSync(path.join(directory,'ipqc-ab-state.json'),'utf8'));
    const request=JSON.parse(fs.readFileSync(path.join(directory,'reimport-payload.json'),'utf8'));
    const trial=merge.mergeAbImport(live.control,live.catalog,request,actor,'isolated-one');
    const again=merge.mergeAbImport(trial.control,live.catalog,{...request,variants:[...request.variants].reverse()},actor,'isolated-two');
    assert.equal(again.changed,false);
    for(const [key,scope] of Object.entries(live.control.scopes)) {
      assert.equal(trial.control.scopes[key].activeVersionId,scope.activeVersionId);
      for(const old of scope.versions[0].snapshot.items) {
        const current=trial.control.scopes[key].versions[0].snapshot.items.find(i=>i.id===old.id);assert.ok(current);
        assert.deepEqual(plain(current.standardPhotos),old.standardPhotos);assert.deepEqual(plain(current.methodPhotos),old.methodPhotos);
        assert.equal(current.equipmentId,old.equipmentId);assert.deepEqual(plain(current.rules),old.rules);
      }
    }
    // Restore the physical D1 snapshot into a disposable directory, with backed-up R2 reads.
    const fixture=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'ipqc-ab-isolated-'));
    let restoredDb;
    try {
      const d1=manifest.files.find(f=>f.path.startsWith('state/v3/d1/')&&f.path.endsWith('.sqlite'));
      const restoredPath=path.join(fixture,'local.sqlite');fs.copyFileSync(path.join(directory,d1.path),restoredPath);
      restoredDb=new DatabaseSync(restoredPath);
      const r2File=manifest.files.find(f=>f.path.startsWith('state/v3/r2/miniflare-R2BucketObject/')&&f.path.endsWith('.sqlite'));
      const metadata=new DatabaseSync(path.join(directory,r2File.path),{readOnly:true});
      const stored=new Map(metadata.prepare('SELECT key,blob_id FROM _mf_objects').all().map(row=>[row.key,{file:path.join(directory,'state/v3/r2/site-creator-r2/blobs',row.blob_id)}]));
      metadata.close();
      const restoredEnv={PROCESS_SESSION_SECRET:randomUUID(),DEMO_LOGIN_ENABLED:'true',
        DB:{prepare(sql){let args=[];return {bind(...v){args=v;return this;},async first(){return restoredDb.prepare(sql).get(...args)||null;},
          async all(){return {results:restoredDb.prepare(sql).all(...args)};},async run(){return {meta:{changes:Number(restoredDb.prepare(sql).run(...args).changes)}};}};}},
        STATE_ARCHIVE:{async head(k){return stored.has(k)?{}:null;},async put(k,v){stored.set(k,{value:v});},async get(k){
          const found=stored.get(k);if(!found) return null;
          return {text:async()=>found.file?fs.readFileSync(found.file,'utf8'):Buffer.from(found.value).toString()};}}};
      const restoredLoad=loadHarness(restoredEnv),restoredCore=restoredLoad('lib/process-state.ts'),restoredApi=restoredLoad('app/api/ipqc-ab/route.ts');
      const restoredBefore=await restoredCore.readState();assert.equal(restoredBefore.revision,manifest.revision);
      const cookie='process_demo='+await restoredCore.demoSession(new Request(base),'demo-admin',true);
      const restoredCall=async (revision,body)=>restoredApi.POST(new Request(base+'/api/ipqc-ab',{method:'POST',
        headers:{Origin:base,Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({action:'reimport',baseRevision:revision,import:body})}));
      let applied=await restoredCall(restoredBefore.revision,request);assert.equal(applied.status,200,await applied.clone().text());
      applied=await applied.json();assert.equal(applied.importReport.summary.added,trial.summary.added);
      const second=await restoredCall(applied.revision,{...request,variants:[...request.variants].reverse()});
      assert.equal(second.status,200);assert.equal((await second.json()).unchanged,true);
      const restoredAfter=await restoredCore.readState();
      for(const [key,value] of Object.entries(restoredBefore.values).filter(([key])=>key!=='ipqcABMasterControl')) assert.equal(restoredAfter.values[key],value,key+' must remain unchanged');
      for(const scope of Object.values(live.control.scopes)) for(const version of scope.versions) for(const old of version.snapshot.items)
        for(const photo of [...old.standardPhotos,...old.methodPhotos]) {
          const storedPhoto=stored.get('ipqc-ab/photos/'+photo.id);assert.ok(storedPhoto?.file,'Backed-up photo blob exists');
          assert.equal(createHash('sha256').update(fs.readFileSync(storedPhoto.file)).digest('hex'),photo.id);
        }
      console.log('PASS actual restored D1/R2 handler import twice / CAS / all unrelated keys unchanged / original photo content SHA256');
    } finally {
      restoredDb?.close();
      // Only the freshly created test directory is removed; never the backup or Local state.
      fs.rmSync(fixture,{recursive:true,force:true});
    }
    console.log('PASS backup hashes / restored SQLite integrity / actual Local snapshot repeat and reverse-order import / asset preservation');
  }
  console.log('PASS IPQC-AB incremental merger, numbering, manual fields/photos/equipment, ambiguity, soft-delete, repeat, revision/auth, pending locks, required submit and test isolation');
})().catch(e=>{console.error(e);process.exitCode=1;});
