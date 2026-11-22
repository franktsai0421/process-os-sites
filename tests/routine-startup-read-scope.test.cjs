const {test}=require('node:test');
const assert=require('node:assert/strict');
const fixture=require('../scripts/fqc-apply-fixture.cjs');

const origin='https://synthetic.invalid', day='2026-11-22';
async function setup(t){
  t.mock.timers.enable({apis:['Date'],now:new Date(day+'T01:00:00+07:00')});
  const f=await fixture();t.after(()=>f.close());
  await f.mutate(values=>{
    const [user]=JSON.parse(values.platformUsers);
    Object.assign(user.accessOverrides,{'routine.view':true,'routine.edit':true,'routine.settings':true,'iqc.view':true});
    values.platformUsers=JSON.stringify([user,{...user,id:'frank',role:'admin'}]);values.routineFqcEnabled='1';
    const quality=JSON.parse(values.qualityMasterControl),library=quality.libraries.fqc;
    const active=library.versions[0],seed=active.snapshot.items[0];
    active.createdAt=active.updatedAt=day+'T00:00:00+07:00';
    active.snapshot.items=Array.from({length:64},(_,i)=>({...seed,id:'f-'+i,productCodes:['synthetic-P'],rule:i<62?{cadence:'time',timeFrequency:'weekly'}:{cadence:'batch'}}));
    library.versions.push({...active,id:'unapproved',status:'draft',snapshot:{items:[],fixturePadding:'D'.repeat(1024*1024)}});
    values.qualityMasterControl=JSON.stringify(quality);
    values.syntheticUnrelated=JSON.stringify({working:{fixturePadding:'U'.repeat(1024*1024)}});
    values.iqcMasterControl=JSON.stringify({versions:[{id:'active',status:'approved',createdAt:active.createdAt,number:1,snapshot:{categories:[],errors:[],parts:[],items:[]}}],activeVersionId:'active'});
  });
  const login=new Request(origin+'/process/');
  const cookie=f.core.sessionCookie(login,await f.core.demoSession(login,'frank',false,1)).split(';')[0];
  const row=()=>f.db.prepare('SELECT revision,"values" FROM shared_state WHERE id=1').get();
  async function call(lane,query='',body){
    const method=body?'POST':'GET',route=f.load('app/api/routine-'+lane+'/route.ts');
    return route[method](new Request(origin+'/api/routine-'+lane+query,{method,headers:{origin,cookie,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}));
  }
  const refs=JSON.parse(row().values).__processRecords.values;
  const read=key=>JSON.parse(f.objects.get(key).toString());
  const blocked={draft:read(refs.qualityMasterControl.key).libraries.fqc.versions.at(-1).snapshot.__immutableBody.key,
    other:read(refs.syntheticUnrelated.key).working.__immutableBody.key,iqc:refs.iqcMasterControl.key,
    required:read(refs.qualityMasterControl.key).libraries.fqc.versions[0].snapshot.__immutableBody.key};
  const cmd={action:'configure',start:day,scope:'routine-iqc-only',reason:'Synthetic',confirm:'START IQC',startAck:true,
    expectedRevision:(await (await call('iqc')).json()).revision,expectedStateRevision:row().revision,operationId:'synthetic-start-001'};
  f.events.length=0;
  return {f,call,row,blocked,cmd};
}
void test('calendar preview reads approved FQC timeline and ignores an unavailable draft body',async t=>{
  const {f,call,row,blocked}=await setup(t),before=row();
  f.hooks.get=key=>{if(key===blocked.draft)throw Error('synthetic draft unavailable');};
  const path='?preview=1&start='+day+'&calendar=2',response=await call('fqc',path);
  assert.equal(response.status,200);
  const {jobs}=await response.json();assert.deepEqual(new Set(jobs.map(j=>j.itemId)),new Set(Array.from({length:62},(_,i)=>'f-'+i)));assert.equal(jobs.length,62);
  assert.ok(jobs.every(j=>j.start==='2026-11-16'&&j.end===day));
  const reads=f.events.filter(e=>e.sql?.includes('process_revoked_sessions')).length;
  assert.equal(reads,2);assert.deepEqual(row(),before);
  f.hooks.get=key=>{if(key===blocked.required)throw Error('required snapshot unavailable');};
  assert.equal((await call('fqc',path)).status,503);assert.deepEqual(row(),before);
});
void test('IQC start preserves unrelated manifest entries and recovery reads just the matching receipt',async t=>{
  const {f,call,row,blocked,cmd}=await setup(t),before=row();
  f.hooks.get=key=>{if(key===blocked.other)throw Error('unrelated module unavailable');};
  const response=await call('iqc','',cmd);
  assert.equal(response.status,200);
  const reads=f.events.filter(e=>e.sql?.includes('process_revoked_sessions')).length;
  assert.equal(reads,2);
  const beforeManifest=JSON.parse(before.values),after=row(),afterManifest=JSON.parse(after.values);
  assert.equal(after.revision,before.revision+1);
  delete afterManifest.__processRecords.values.routineIqcControl;
  delete beforeManifest.__processRecords.values.routineIqcControl;
  assert.deepEqual(afterManifest,beforeManifest);
  f.hooks.get=key=>{if(key===blocked.iqc)throw Error('source unavailable after commit');};
  const receipt=await call('iqc','?operationId='+cmd.operationId);
  assert.equal(receipt.status,200);assert.deepEqual((await receipt.json()).result,(await response.json()).result);
  assert.equal((await call('iqc','?operationId=synthetic-unknown')).status,404);
  assert.deepEqual(row(),after);
});
void test('required IQC source failure before commit has no state or receipt mutation',async t=>{
  const {f,call,row,blocked,cmd}=await setup(t),before=row();
  f.hooks.get=key=>{if(key===blocked.iqc)throw Error('required source unavailable');};
  assert.equal((await call('iqc','',cmd)).status,503);
  assert.equal((await call('iqc','?operationId='+cmd.operationId)).status,404);
  assert.deepEqual(row(),before);
});
void test('session revocation at the final read fences the preview and the configure CAS',async t=>{
  const {f,call,row,cmd}=await setup(t),before=row();
  for(const lane of ['fqc','iqc']){
    let checked=0;
    f.hooks.sql=(sql,args)=>{
      if(sql.includes('process_revoked_sessions')&&++checked===2)
        f.db.prepare('INSERT OR REPLACE INTO process_revoked_sessions VALUES(?,?,?)').run(args[0],Date.now()+3600000,Date.now());
    };
    const response=lane==='fqc'?await call(lane,'?preview=1&calendar=2&start='+day):await call(lane,'',cmd);
    assert.equal(response.status,401);assert.deepEqual(row(),before);
    f.db.prepare('DELETE FROM process_revoked_sessions').run();
  }
});
void test('IQC CAS preserves a concurrent writer and leaves the stale operation without a receipt',async t=>{
  const {f,call,row,cmd}=await setup(t),before=row();
  let raced=false;
  f.hooks.run=sql=>{
    if(!raced&&sql.startsWith('UPDATE shared_state')){
      raced=true;f.db.prepare('UPDATE shared_state SET revision=revision+1,updated_at=? WHERE id=1').run('competing writer');
    }
  };
  const response=await call('iqc','',cmd);
  assert.equal(response.status,409);assert.equal((await response.json()).error,'REVISION_CONFLICT');
  assert.equal(raced,true);assert.equal(row().revision,before.revision+1);assert.equal(row().values,before.values);
  assert.equal((await call('iqc','?operationId='+cmd.operationId)).status,404);
});
void test('IQC R2 put timeout before shared-state CAS cannot publish a calendar or receipt',async t=>{
  const {f,call,row,cmd}=await setup(t),before=row();let attempts=0;
  f.hooks.put=()=>{attempts++;throw Error('synthetic R2 timeout');};
  assert.equal((await call('iqc','',cmd)).status,503);assert.equal(attempts,1);
  assert.deepEqual(row(),before);assert.equal((await call('iqc','?operationId='+cmd.operationId)).status,404);
});
void test('IQC D1 committed but acknowledgement lost: matching receipt survives a new request',async t=>{
  const {f,call,row,cmd}=await setup(t),before=row();let writes=0;
  f.hooks.run=(sql,args)=>{
    if(sql.startsWith('UPDATE shared_state')){
      writes++;assert.equal(f.db.prepare(sql).run(...args).changes,1);throw Error('synthetic acknowledgement timeout');
    }
  };
  assert.equal((await call('iqc','',cmd)).status,503);
  const after=row();assert.equal(after.revision,before.revision+1);
  const query='?operationId='+cmd.operationId;
  assert.equal((await call('iqc',query)).status,200);
  assert.equal((await (await call('iqc')).json()).startDate,day);
  // Only on this disposable fixture, prove same-ID idempotency too.
  const retry=await call('iqc','',cmd);assert.equal(retry.status,200);assert.equal((await retry.json()).replayed,true);
  assert.equal(writes,1);assert.deepEqual(row(),after);
});
for(const fault of ['revoked','revision'])void test('IQC configure replay fences '+fault+' before releasing the receipt',async t=>{
  const {f,call,row,cmd}=await setup(t);
  assert.equal((await call('iqc','',cmd)).status,200);
  const after=row();let checks=0,fired=false;
  f.hooks.sql=(sql,args)=>{
    if(fault==='revoked'&&sql.includes('process_revoked_sessions')&&++checks===2){
      f.db.prepare('INSERT OR REPLACE INTO process_revoked_sessions VALUES(?,?,?)').run(args[0],Date.now()+3600000,Date.now());fired=true;
    }
    if(fault==='revision'&&sql.startsWith('SELECT revision FROM shared_state WHERE')){
      f.db.prepare('UPDATE shared_state SET revision=revision+1 WHERE id=1').run();fired=true;
    }
  };
  f.events.length=0;
  const replay=await call('iqc','',cmd);
  assert.equal(replay.status,fault==='revoked'?401:409);
  assert.equal((await replay.json()).error,fault==='revoked'?'LOGIN_REQUIRED':'REVISION_CONFLICT');
  assert.ok(fired);assert.equal(row().values,after.values);
  assert.equal(f.events.filter(e=>e.kind==='put'||e.kind==='sql').length,0);
});
void test('FQC preview preserves previously approved periods and active-version frequency at handoff',async t=>{
  const {f,call,row}=await setup(t);
  await f.mutate(values=>{
    const quality=JSON.parse(values.qualityMasterControl),library=quality.libraries.fqc,active=library.versions[0];
    const make=(frequency)=>({...active.snapshot.items[0],rule:{cadence:'time',timeFrequency:frequency}});
    const past={...active,id:'old-approval',number:1,status:'superseded',reviewedAt:'2026-10-01T00:00:00+07:00',snapshot:{...active.snapshot,items:[make('weekly')]}};
    active.number=2;active.reviewedAt='2026-11-18T08:00:00+07:00';active.snapshot.items=[make('monthly')];
    library.versions.unshift(past);values.qualityMasterControl=JSON.stringify(quality);
  });
  const before=row();
  const response=await call('fqc','?preview=1&calendar=2&start=2026-11-01');
  assert.equal(response.status,200);
  const {jobs}=await response.json();
  assert.ok(jobs.some(j=>j.source.versionId==='old-approval'&&j.start==='2026-11-09'&&j.end==='2026-11-15'));
  assert.ok(jobs.some(j=>j.source.version==='2'&&j.start==='2026-11-01'&&j.end==='2026-11-30'));
  assert.ok(jobs.every(j=>j.itemId==='f-0'&&j.source.versionId!=='unapproved'));
  assert.deepEqual(row(),before);
  const start={...fqcStart(),startDate:'2026-11-01'};
  const configure=await call('fqc','',start);assert.equal(configure.status,200);
  const gen={action:'generate',operationId:'historical-generate',expectedRevision:(await configure.json()).revision};
  const configured=row(),ref=JSON.parse(configured.values).__processRecords.values.qualityMasterControl;
  const retired=JSON.parse(f.objects.get(ref.key)).libraries.fqc.versions[0].snapshot.__immutableBody.key;
  let hits=0;f.hooks.get=k=>{if(k===retired){hits++;throw Error('missing historical approval');}};
  assert.equal((await call('fqc','',gen)).status,500);assert(hits>0);
  assert.deepEqual(row(),configured);assert.equal((await call('fqc','?operationId='+gen.operationId)).status,404);
  delete f.hooks.get;
  assert.equal((await call('fqc','',gen)).status,200);
  const persisted=JSON.parse((await f.core.readState({keys:['routineFqcControl']})).values.routineFqcControl);
  const periods=list=>list.map(j=>[j.itemId,j.source.versionId,j.start,j.end]).sort();
  assert.deepEqual(periods(persisted.jobs.filter(j=>!j.calendar?.stopped)),periods(jobs));
  const stopped=persisted.jobs.filter(j=>j.calendar?.stopped);
  assert.deepEqual(periods(stopped),[['f-0','old-approval','2026-11-16','2026-11-22']]);
  assert.equal(stopped[0].calendar.stopped.reason,'frequency-changed');
});
for(const shape of ['divergent users','divergent maintenance','unknown envelope','legacy manifest'])void test('IQC configure retains full-read fallback for '+shape,async t=>{
  const {f,call,row,cmd,blocked}=await setup(t),root=JSON.parse(row().values);
  if(shape==='divergent users')root.platformUsers='[]';
  if(shape==='divergent maintenance')root.maintenanceMode=root.maintenanceMode==='0'?'1':'0';
  if(shape==='unknown envelope')root.extension={version:1};
  if(shape==='legacy manifest')delete root.__processRecords.legacySources;
  f.db.prepare('UPDATE shared_state SET "values"=? WHERE id=1').run(JSON.stringify(root));
  const before=row();let hit=false;
  f.hooks.get=key=>{if(key===blocked.other){hit=true;throw Error('full reader fault');}};
  assert.equal((await call('iqc','',cmd)).status,503);assert.ok(hit);assert.deepEqual(row(),before);
});
void test('historical startup projection matches each exact tree path and leaves unknown bytes untouched',()=>{
  const {execFileSync}=require('node:child_process');
  const {projectKnown,base,sourceTree,blobs}=require('./routine-startup-read-successor.cjs');
  const paths=[...Object.keys(blobs),'tests/accounts-process-integration-source.test.mjs',
    'tests/ipqc-operation-speed-integration-source.test.cjs','tests/source-normalization-cache.test.cjs'];
  const read=(tree,path)=>execFileSync('git',['show',tree+':'+path]);
  for(const path of paths){
    const after=read(sourceTree,path),before=read(base,path),lf=after.toString().replaceAll('\r\n','\n');
    for(const input of [after,Buffer.from(lf),Buffer.from(lf.replaceAll('\n','\r\n'))]){
      assert.deepEqual(projectKnown(input,path),before);
      projectKnown(input,path).fill(0);
      assert.deepEqual(projectKnown(input,path),before);
    }
    const changed=Buffer.from(after);
    changed[Math.floor(changed.length/2)]^=1;
    for(const unknown of [changed,after.subarray(1),Buffer.concat([after,after]),before])
      assert.strictEqual(projectKnown(unknown,path),unknown);
    assert.strictEqual(projectKnown(after,'./'+path),after);
    assert.throws(()=>projectKnown(after.toString(),path),/raw Buffer/);
  }
});

void test('account and routine raw Git proofs reject substituted EOL before checkout projection',()=>{
  const git=(...args)=>require('node:child_process').execFileSync('git',args);
  const proof=require('../scripts/routine-integration-source-contract.cjs');
  const reads=require('./routine-startup-read-successor.cjs');
  for(const file of ['app/api/routine-fqc/route.ts','app/api/routine-iqc/route.ts','lib/routine-iqc-access.ts']){
    const raw=git('show','HEAD:'+file);
    const prior=git('cat-file','blob',reads.blobs[file][0]);
    proof.assertRoutineHeadBlob(raw,file);
    proof.assertRoutineHeadBlob(prior,file);
    const text=raw.toString().replaceAll('\r\n','\n');
    for(const altered of [Buffer.from(text.replaceAll('\n','\r\n')),Buffer.from(text.replace('\n','\r\n'))]){
      assert(!altered.equals(raw));
      assert.throws(()=>proof.assertRoutineHeadBlob(altered,file),{code:'ERR_ASSERTION'});
      assert.throws(()=>proof.assertRawRoutineEncoding(altered,file,'raw EOL substitution'),/raw EOL substitution/);
    }
    const changed=Buffer.from(raw);
    changed[0]^=1;
    assert.throws(()=>proof.assertRoutineHeadBlob(changed,file),{code:'ERR_ASSERTION'});
  }
});

const fqcStart=()=>({action:'configure',startDate:day,calendarVersion:2,operationId:'synthetic-fqc-start',expectedRevision:0});
void test('FQC configure avoids unrelated and draft I/O, persists one receipt, then generates exact eligible rows',async t=>{
 const {f,call,row,blocked}=await setup(t),cmd=fqcStart(),before=row();
 const bindings=JSON.parse(before.values).__processRecords;
 let waits=0;
 f.hooks.get=async key=>{
   if([bindings.values.syntheticUnrelated.key,blocked.other,blocked.draft].includes(key))throw Error('unavailable unrelated archive');
   waits++;await new Promise(resolve=>setTimeout(resolve,2));
 };
 const response=await call('fqc','',cmd);
 assert.equal(response.status,200);assert(waits>0);
 assert.equal(f.events.filter(e=>e.sql?.includes('process_revoked_sessions')).length,2);
 const result=await response.json(),after=row();assert.equal(after.revision,before.revision+1);
 const persisted=async()=>JSON.parse((await f.core.readState({keys:['routineFqcControl']})).values.routineFqcControl);
 const configured=await persisted();assert.equal(configured.startDate,day);assert.equal(configured.jobs.length,0);
 const initialItems=await (await call('fqc')).json();assert.equal(initialItems.control.jobs.length,0);
 assert.deepEqual(row(),after);
 const compared=JSON.parse(after.values).__processRecords,old={...bindings.values};
 delete old.routineFqcControl;delete compared.values.routineFqcControl;
 assert.deepEqual(compared,{...bindings,values:old});
 const lookup=await call('fqc','?operationId='+cmd.operationId);
 assert.equal(lookup.status,200);assert.deepEqual((await lookup.json()).result,result.result);
 assert.equal((await call('fqc','',cmd)).status,200);assert.deepEqual(row(),after);
 const generate=await call('fqc','',{action:'generate',expectedRevision:result.revision,operationId:'synthetic-fqc-gen'});
 assert.equal(generate.status,200);
 const state=await (await call('fqc')).json();
 assert.equal(state.control.jobs.length,62);assert.deepEqual(new Set(state.control.jobs.map(j=>j.itemId)),new Set(Array.from({length:62},(_,i)=>'f-'+i)));
 assert.ok(state.control.jobs.every(j=>j.start==='2026-11-16'&&j.end===day));
 const recorded=await persisted();assert.deepEqual(recorded.jobs.map(j=>j.id),state.control.jobs.map(j=>j.id));
 const saved=row();assert.deepEqual((await (await call('fqc')).json()).control.jobs,state.control.jobs);
 const generateReceipt=await call('fqc','?operationId=synthetic-fqc-gen');
 assert.equal(generateReceipt.status,200);
 assert.deepEqual((await generateReceipt.json()).result,(await generate.json()).result);
 assert.deepEqual(recorded.receipts[cmd.operationId].result,result.result);
 // Reconciliation adds the 62 rows before the final generation pass; its
 // return count describes only additional rows from that last pass.
 assert.equal(recorded.receipts['synthetic-fqc-gen'].result.generated,0);
 assert.deepEqual(row(),saved);
});
async function scheduleCommand(call,action){
 if(action==='configure')return fqcStart();
 const configured=await call('fqc','',fqcStart());assert.equal(configured.status,200);
 const generation={action:'generate',expectedRevision:(await configured.json()).revision,operationId:'synthetic-gen-fault'};
 if(action==='generate')return generation;
 assert.equal(action,'create-plan');
 assert.equal((await call('fqc','',generation)).status,200);
 const {control}=await (await call('fqc')).json();assert.equal(control.jobs.length,62);
 return {action,expectedRevision:control.revision,jobIds:[control.jobs[0].id],startDate:day,endDate:day,operationId:'synthetic-plan-fault'};
}
for(const action of ['configure','generate','create-plan'])void test('FQC '+action+' loses acknowledgement after commit; later lookup recovers with one durable write',async t=>{
 const {f,call,row}=await setup(t),cmd=await scheduleCommand(call,action),before=row();let writes=0;
 f.hooks.run=(sql,args)=>{if(sql.startsWith('UPDATE shared_state')){
   writes++;assert.equal(f.db.prepare(sql).run(...args).changes,1);throw Error('synthetic late acknowledgement');
 }};
 assert.equal((await call('fqc','',cmd)).status,500);
 assert.equal(row().revision,before.revision+1);
 assert.equal((await call('fqc','?operationId='+cmd.operationId)).status,200);assert.equal(writes,1);
 if(action==='generate'){
  const saved=row();assert.equal((await call('fqc','?operationId='+fqcStart().operationId)).status,200);
  const replay=await call('fqc','',cmd);assert.equal(replay.status,200);assert.equal((await replay.json()).replayed,true);
  assert.equal((await (await call('fqc')).json()).control.jobs.length,62);assert.deepEqual(row(),saved);assert.equal(writes,1);
 }
});
for(const action of ['configure','generate','create-plan'])void test('FQC '+action+' fences revocation after R2 preparation and rejects a raced shared-state CAS',async t=>{
 for(const mode of ['revoked','raced'])await t.test(mode,async t=>{
  const {f,call,row}=await setup(t),cmd=await scheduleCommand(call,action),before=row();let revokedKey;let attempts=0;
  f.hooks.sql=(sql,args)=>{if(sql.includes('process_revoked_sessions'))revokedKey=args[0];};
  f.hooks.put=()=>{if(mode==='revoked')f.db.prepare('INSERT OR REPLACE INTO process_revoked_sessions VALUES(?,?,?)').run(revokedKey,Date.now()+3600000,Date.now());};
  f.hooks.run=(sql)=>{if(mode==='raced'&&sql.startsWith('UPDATE shared_state')){
    attempts++;f.db.prepare('UPDATE shared_state SET revision=revision+1').run();
  }};
  const res=await call('fqc','',cmd);assert.equal(res.status,mode==='revoked'?401:409);
  assert.equal(row().values,before.values);
  if(mode==='raced'){assert(attempts>0);assert.equal((await call('fqc','?operationId='+cmd.operationId)).status,404);}
 });
});

for(const action of ['configure','generate','create-plan'])void test('FQC '+action+' response abandoned before CAS: missing receipt first, one confirmed result after release',async t=>{
 const {f,call,row}=await setup(t),cmd=await scheduleCommand(call,action),before=row();
 let release,entered;
 const paused=new Promise(resolve=>{release=resolve;}),arrived=new Promise(resolve=>{entered=resolve;});
 let writes=0;
 f.hooks.run=async sql=>{if(sql.startsWith('UPDATE shared_state')){writes++;entered();await paused;}};
 const inFlight=call('fqc','',cmd);
 await arrived;
 try{
  const missing=await call('fqc','?operationId='+cmd.operationId);
  assert.equal(missing.status,404);assert.deepEqual(row(),before);
 }finally{release();}
 assert.equal((await inFlight).status,200);
 assert.equal((await call('fqc','?operationId='+cmd.operationId)).status,200);
 assert.equal(row().revision,before.revision+1);assert.equal(writes,1);
 if(action==='generate'){
  const saved=row();assert.equal((await call('fqc','?operationId='+fqcStart().operationId)).status,200);
  const replay=await call('fqc','',cmd);assert.equal(replay.status,200);assert.equal((await replay.json()).replayed,true);
  assert.equal((await (await call('fqc')).json()).control.jobs.length,62);assert.deepEqual(row(),saved);assert.equal(writes,1);
 }
});
void test('IQC receipt lookup reads its aggregate without opening unrelated document evidence',async t=>{
 const {f,call,cmd,row}=await setup(t);
 assert.equal((await call('iqc','',cmd)).status,200);
 await f.mutate(values=>{
  const c=JSON.parse(values.routineIqcControl);
  c.documents.push({id:'synthetic-evidence',flow:{working:{text:'synthetic proof'}}});
  values.routineIqcControl=JSON.stringify(c);
 });
 const before=row(),ref=JSON.parse(before.values).__processRecords.values.routineIqcControl;
 const blocked=JSON.parse(f.objects.get(ref.key)).documents.at(-1).flow.working.__immutableBody.key;
 f.hooks.get=key=>{if(key===blocked)throw Error('synthetic attachment archive unavailable');};
 assert.equal((await call('iqc','?operationId='+cmd.operationId)).status,200);
 assert.equal((await call('iqc','?operationId=synthetic-missing')).status,404);
 assert.deepEqual(row(),before);
});

void test('IQC configure skips archived draft-only source content and retains the live catalog byte for byte',async t=>{
 const {f,call,cmd,row}=await setup(t);
 await f.mutate(values=>{
  const c=JSON.parse(values.iqcMasterControl);
  c.versions.push({id:'synthetic-unapproved',status:'draft',snapshot:{draftPadding:'unused'.repeat(90000)}});
  values.iqcMasterControl=JSON.stringify(c);
 });
 const before=row(),master=JSON.parse(before.values).__processRecords.values.iqcMasterControl;
 const draft=JSON.parse(f.objects.get(master.key)).versions.at(-1).snapshot.__immutableBody.key;
 f.hooks.get=key=>{if(key===draft)throw Error('draft-only archive unavailable');};
 const res=await call('iqc','',{...cmd,expectedStateRevision:before.revision});
 assert.equal(res.status,200);
 assert.deepEqual(JSON.parse(row().values).__processRecords.values.iqcMasterControl,master);
 assert.equal((await call('iqc','?operationId='+cmd.operationId)).status,200);
});

void test('FQC preview and configure retain the legacy AB catalog without unrelated master drafts',async t=>{
 const {f,call,row}=await setup(t);
 await f.mutate(values=>{
  const master=JSON.parse(values.masterDataControl);
  master.working={unrelated:'synthetic-only'.repeat(80000)};
  values.masterDataControl=JSON.stringify(master);
 });
 const before=row(),master=JSON.parse(before.values).__processRecords.values.masterDataControl;
 const blocked=JSON.parse(f.objects.get(master.key)).working.__immutableBody.key;
 f.hooks.get=key=>{if(key===blocked)throw Error('unrelated master draft unavailable');};
 const preview=await call('fqc','?preview=1&calendar=2&start='+day);
 assert.equal(preview.status,200);assert.equal((await preview.json()).jobs.length,62);
 assert.deepEqual(row(),before);
 assert.equal((await call('fqc','',fqcStart())).status,200);
 assert.deepEqual(JSON.parse(row().values).__processRecords.values.masterDataControl,master);
 const page=JSON.stringify({pageDraftLayout:'page-v1',active:{},versions:[{id:'duplicate'},{id:'duplicate'}]});
 assert.equal(f.load('lib/state-records.ts').routineFqcStartMaster(page),page);
});

void test('legacy AB projection preserves product names and leaves split or unrecognized input untouched',async t=>{
 const {f}=await setup(t),project=f.load('lib/state-records.ts').routineFqcStartMaster;
 const sources=f.load('lib/routine-fqc.ts').routineSources;
 const base=await f.core.readState();
 const legacy={active:{AB:{products:[{code:'synthetic-P',name:'Synthetic product label'}]},C:{products:[]}},working:{unused:true}};
 const full=JSON.stringify(legacy),reduced=project(full);
 assert.notEqual(reduced,full);
 const rows=raw=>sources({...base,values:{...base.values,masterDataControl:raw}});
 assert.deepEqual(rows(reduced),rows(full));
 assert.equal(rows(reduced)[0].products[0].name,'Synthetic product label');
 for(const value of [null,{},[],{active:{'AB.catalog':legacy.active.AB}}, {...legacy,active:{...legacy.active,'AB.catalog':{}}},{...legacy,pageDraftLayout:'future-layout'},{active:{AB:{products:'invalid'}}}]){
  const raw=JSON.stringify(value);assert.equal(project(raw),raw);
 }
 assert.throws(()=>project('{'));
});

void test('raw startup proof rejects the merged rollback, altered bytes, truncation and newline substitution for each updated path',()=>{
 const proof=require('./routine-startup-read-successor.cjs');
 const git=(...args)=>require('node:child_process').execFileSync('git',args);
 proof.verify();
 for(const file of Object.keys(proof.originalBlobs)){
  const prior=git('show','1e8469ee1a15c929bc8683ea353f7e93aca558df:'+file),head=git('show','HEAD:'+file);
  if(prior.equals(head))continue;
  const changed=Buffer.from(head);changed[changed.length>>1]^=1;
  const crlf=Buffer.from(head.toString().replace(/\r?\n/g,'\r\n'));
  assert(!head.equals(crlf));
  for(const other of [prior,changed,head.subarray(1),Buffer.concat([head,head]),crlf]){
   assert.throws(()=>proof.predecessor(other,file),{code:'ERR_ASSERTION'});
  }
  assert.deepEqual(proof.predecessor(head,file),git('show',proof.base+':'+file));
 }
});

void test('FQC existing calendar policy reads the separate authoritative timeline before accepting configuration',async t=>{
 const {f,call,row}=await setup(t);
 await f.mutate(values=>{
  const c=f.load('lib/routine-fqc.ts').emptyRoutine();
  c.calendarPolicy={version:2,adoptedAt:'2026-10-01T00:00:00.000Z',scopes:{}};
  values.routineFqcControl=JSON.stringify(c);
  const q=JSON.parse(values.qualityMasterControl),lib=q.libraries.fqc,active=lib.versions[0];
  const past={...active,id:'old-formal',status:'superseded',reviewedAt:'2026-10-02T00:00:00.000Z',
    snapshot:{...active.snapshot,items:active.snapshot.items.slice(0,1)}};
  lib.versions.unshift(past);values.qualityMasterControl=JSON.stringify(q);
 });
 const before=row(),ref=JSON.parse(before.values).__processRecords.values.qualityMasterControl;
 const past=JSON.parse(f.objects.get(ref.key)).libraries.fqc.versions[0].snapshot.__immutableBody.key;
 let reads=0;f.hooks.get=k=>{if(k===past){reads++;throw Error('synthetic prior approval unavailable');}};
 assert.equal((await call('fqc','',fqcStart())).status,500);assert(reads>0);assert.deepEqual(row(),before);
 assert.equal((await call('fqc','?operationId='+fqcStart().operationId)).status,404);
 delete f.hooks.get;
 assert.equal((await call('fqc','',fqcStart())).status,200);
 assert.equal((await call('fqc','?operationId='+fqcStart().operationId)).status,200);
});

for(const mode of ['unknown envelope','no calendar policy'])void test('FQC generate retains full-read fallback for '+mode,async t=>{
 const {f,call,row,blocked}=await setup(t),gen=await scheduleCommand(call,'generate');
 if(mode==='unknown envelope'){
  const root=JSON.parse(row().values);root.extension={version:2};
  f.db.prepare('UPDATE shared_state SET "values"=? WHERE id=1').run(JSON.stringify(root));
 }else await f.mutate(values=>{
  const c=JSON.parse(values.routineFqcControl);delete c.calendarPolicy;values.routineFqcControl=JSON.stringify(c);
 });
 const before=row();let hits=0;
 f.hooks.get=key=>{if(key===blocked.other){hits++;throw Error('full reader fault');}};
 assert.equal((await call('fqc','',gen)).status,500);assert(hits>0);assert.deepEqual(before,row());
});

void test('IQC plan creation depends on the current IQC job and its approved source, not an unrelated archived module',async t=>{
 const {f,call,row,cmd,blocked}=await setup(t);
 await f.mutate(values=>{
   const source=JSON.parse(values.iqcMasterControl),snapshot=source.versions[0].snapshot;
   snapshot.parts=[{id:'part',code:'P',nameVi:'Synthetic part',supplierIds:[],isEnabled:true}];
   snapshot.errors=[{id:'defect',partCode:'P',code:'ERR'}];
   snapshot.items=[{id:'item',partCode:'P',errorId:'defect',checkNo:'SYN-W',nameVi:'Synthetic weekly check',isEnabled:true,rules:[{id:'weekly',cadence:'time',kind:'week',value:''}]}];
   values.iqcMasterControl=JSON.stringify(source);
 });
 assert.equal((await call('iqc','',{...cmd,expectedStateRevision:row().revision})).status,200);
 const state=await (await call('iqc')).json();
 assert.equal(state.jobs.length,1);assert.equal(state.jobs[0].end,day);
 const plan={action:'create-plan',start:day,end:day,expectedRevision:state.revision,jobIds:[state.jobs[0].id],operationId:'synthetic-plan-only'};
 const before=row(),manifest=JSON.parse(before.values);
 const required=manifest.__processRecords.values.iqcMasterControl.key;
 f.hooks.get=key=>{if(key===required)throw Error('required IQC input unavailable');};
 assert.equal((await call('iqc','',plan)).status,503);assert.deepEqual(row(),before);
 assert.equal((await call('iqc','?operationId='+plan.operationId)).status,404);
 let unrelatedReads=0;
 f.hooks.get=key=>{if(key===blocked.other){unrelatedReads++;throw Error('unrelated archived body unavailable');}};
 const created=await call('iqc','',plan);
 assert.equal(created.status,200,'valid job; unrelated R2 reads='+unrelatedReads);assert.equal(unrelatedReads,0);
 const foreign=await call('iqc','',{...plan,operationId:'synthetic-foreign',expectedRevision:state.revision+1,jobIds:['not-a-member']});
 assert.equal(foreign.status,409);assert.equal((await foreign.json()).error,'IQC_WORK_NOT_AVAILABLE');
 const documentId=(await created.json()).result.documentId;
 const after=row(),preserved=JSON.parse(after.values);
 delete preserved.__processRecords.values.routineIqcControl;delete manifest.__processRecords.values.routineIqcControl;
 assert.deepEqual(preserved,manifest);assert.equal(after.revision,before.revision+1);
 const current=await (await call('iqc')).json();
 assert.deepEqual(current.documents.map(d=>d.id),[documentId]);assert.equal(current.jobs[0].planId,documentId);
 assert.equal((await (await call('iqc','?operationId='+plan.operationId)).json()).result.documentId,documentId);
 assert.equal((await (await call('iqc','',plan)).json()).replayed,true);assert.deepEqual(row(),after);
});
