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
