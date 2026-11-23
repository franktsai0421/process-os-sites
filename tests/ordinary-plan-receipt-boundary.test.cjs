const {test}=require('node:test');
const assert=require('node:assert/strict');
const fixture=require('../scripts/fqc-apply-fixture.cjs');

const origin='https://synthetic.invalid', day='2026-11-22';
async function setup(t){
  t.mock.timers.enable({apis:['Date'],now:new Date(day+'T01:00:00+07:00')});
  const f=await fixture();t.after(()=>f.close());
  await f.mutate(values=>{
    const [user]=JSON.parse(values.platformUsers);
    Object.assign(user.accessOverrides,{'routine.view':true,'routine.create':true,'routine.edit':true,'routine.settings':true,'iqc.view':true});
    values.platformUsers=JSON.stringify([user,...['frank','other-admin'].map(id=>({...user,id,role:'admin'}))]);values.routineFqcEnabled='1';
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
  async function call(lane,query='',body,actor='frank'){
    const session=actor==='frank'?cookie:f.core.sessionCookie(login,await f.core.demoSession(login,actor,false,1)).split(';')[0];
    const method=body?'POST':'GET',route=f.load('app/api/routine-'+lane+'/route.ts');
    return route[method](new Request(origin+'/api/routine-'+lane+query,{method,headers:{origin,cookie:session,'X-Process-Expected-Actor':actor,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}));
  }
  return {f,call,row};
}
for(const lane of ['fqc','iqc'])for(const race of ['no change','unrelated revision','routine revision'])void test(lane+' pending plan after '+race,async t=>{
 const {f,call,row,read,plan}=await scheduled(t,lane);
 const before=await read(),rev=row().revision;
 let unblock,entered;
 const pause=new Promise(resolve=>{unblock=resolve;}), reached=new Promise(resolve=>{entered=resolve;});
 f.hooks.run=async sql=>{if(sql.startsWith('UPDATE shared_state')){entered();await pause;}};
 const original=call(lane,'',plan), query='?operationId='+plan.operationId;
 try{
   await Promise.race([reached,original.then(()=>{throw Error('expected original at CAS');})]);
   assert.equal((await call(lane,query)).status,404);
   assert.equal((await read()).documents.length,0);
   const assessment=await call('start-retirement','?scope='+lane+'&assessment=1&operationId='+plan.operationId);
   assert.equal(assessment.status,409);
   assert.equal((await assessment.json()).error,'FIRST_START_STATE_CHANGED');
   assert.equal(row().revision,rev);
   // Let other requests proceed while the original request is still paused at CAS.
   delete f.hooks.run;
   if(race==='routine revision'){
     const changed=await call(lane,'',{action:'generate',expectedRevision:before.revision,operationId:'synthetic-other-command'});
     assert.equal(changed.status,200);assert.equal((await read()).revision,before.revision+1);
   }else if(race==='unrelated revision'){
     await f.mutate(values=>{values.syntheticUnrelated=JSON.stringify({working:{note:'Synthetic update'}});});
     assert.equal((await read()).revision,before.revision);
   }
 }finally{unblock();}
 const ack=await original;
 if(race==='routine revision'){
   assert.equal(ack.status,409);assert.equal((await ack.json()).error,'REVISION_CONFLICT');
   assert.equal((await call(lane,query)).status,404);assert.equal((await read()).documents.length,0);
   assert.equal(row().revision,rev+1);return;
 }
 assert.equal(ack.status,200);
 const result=(await ack.json()).result;
 assert.equal((await call(lane,query,undefined,'other-admin')).status,404);
 const receipt=await call(lane,query);assert.equal(receipt.status,200);assert.deepEqual((await receipt.json()).result,result);
 const reload=await read();assert.equal(reload.documents.length,1);assert.equal(reload.jobs[0].planId,result.documentId);
 assert.equal(row().revision,rev+(race==='unrelated revision'?2:1));
});

async function scheduled(t,lane){
 const {f,call,row}=await setup(t);
 await f.mutate(values=>{
   const master=JSON.parse(values.iqcMasterControl),snapshot=master.versions[0].snapshot;
   snapshot.parts=[{id:'part',code:'P',nameVi:'Synthetic part',supplierIds:[],isEnabled:true}];
   snapshot.errors=[{id:'issue',partCode:'P',code:'SYN'}];
   snapshot.items=[{id:'inspection',partCode:'P',errorId:'issue',checkNo:'SYN',nameVi:'Measurement',isEnabled:true,rules:[{id:'weekly',cadence:'time',kind:'week',value:''}]}];
   values.iqcMasterControl=JSON.stringify(master);
 });
 const read=async()=>{const r=await call(lane);assert.equal(r.status,200);const json=await r.json();return json.control||json;};
 const initial=await read(), iqc=lane==='iqc';
 const config=iqc?{start:day,scope:'routine-iqc-only',reason:'Synthetic setup',confirm:'START IQC',startAck:true,expectedStateRevision:row().revision}:{calendarVersion:2,startDate:day};
 assert.equal((await call(lane,'',{...config,action:'configure',operationId:'synthetic-configure',expectedRevision:initial.revision})).status,200);
 if(!iqc)assert.equal((await call(lane,'',{action:'generate',operationId:'synthetic-generate',expectedRevision:(await read()).revision})).status,200);
 const before=await read();
 const plan={action:'create-plan',operationId:'synthetic-original',expectedRevision:before.revision,jobIds:[before.jobs[0].id],...(iqc?{start:day,end:day}:{startDate:day,endDate:day})};
 return {f,call,row,read,plan};
}

for(const lane of ['fqc','iqc'])for(const winner of ['plan','retire','later'])void test(lane+' registered create-plan: '+winner+' wins with independent readback',async t=>{
 const {f,call,row,read,plan}=await scheduled(t,lane);
 plan.operationId='plan-'+lane+'-'+require('node:crypto').randomUUID();
 const path='?scope='+lane+'&id='+plan.operationId;
 const intent=(body,actor='frank')=>call('plan-intent',path,body,actor);
 const register={action:'register',command:plan};
 const retire={action:'retire',confirm:'RETIRE '+lane.toUpperCase()+' PLAN',expectedRevision:plan.expectedRevision};
 const baseline=row();
 assert.equal((await intent(retire)).status,404);
 assert.equal((await call(lane,'',plan)).status,404);
 assert.deepEqual(row(),baseline);
 assert.equal((await intent(register)).status,200);
 const prepared=row();
 assert.equal((await intent(register)).status,200);
 assert.equal((await intent(retire,'other-admin')).status,404);
 assert.equal((await intent({...retire,expectedRevision:retire.expectedRevision+1})).status,422);
 assert.equal((await intent({...retire,confirm:'cancel'})).status,422);
 assert.equal((await call(lane,'',{...plan,jobIds:['different']})).status,409);
 assert.equal((await call(lane,'',plan,'other-admin')).status,404);
 assert.equal((await intent()).status,200);
 assert.deepEqual(row(),prepared);
 let entered,release;
 const arrived=new Promise(r=>{entered=r;}),pause=new Promise(r=>{release=r;});
 f.hooks.run=async sql=>{if(sql.startsWith('UPDATE shared_state')){entered();await pause;}};
 const first=winner==='retire'?call(lane,'',plan):intent(retire);
 await Promise.race([arrived,first.then(()=>{throw Error('missing CAS boundary');})]);
 delete f.hooks.run;
 try{
   if(winner==='plan')assert.equal((await call(lane,'',plan)).status,200);
   if(winner==='retire')assert.equal((await intent(retire)).status,200);
   if(winner==='later')assert.equal((await call(lane,'',{action:'generate',operationId:'unrelated-generation',expectedRevision:plan.expectedRevision})).status,200);
 }finally{release();}
 assert.equal((await first).status,409);
 if(winner==='later'){
   assert.equal((await call(lane,'',plan)).status,409);
   assert.equal((await intent(retire)).status,200);
 }
 const committed=winner==='plan',after=row();
 assert.equal((await (await intent()).json()).status,committed?'committed':'retired');
 assert.equal((await (await intent(retire)).json()).status,committed?'committed':'retired');
 assert.equal((await intent(undefined,'other-admin')).status,404);
 assert.equal((await call(lane,'?operationId='+plan.operationId)).status,committed?200:404);
 assert.equal((await call(lane,'',plan)).status,committed?200:409);
 assert.equal((await read()).documents.length,committed?1:0);
 assert.deepEqual(row(),after);
});

for(const lane of ['fqc','iqc'])void test(lane+' a revoked session during retirement cannot publish a terminal result',async t=>{
 const {f,call,row,plan}=await scheduled(t,lane);
 plan.operationId='plan-'+lane+'-'+require('node:crypto').randomUUID();
 const path='?scope='+lane+'&id='+plan.operationId;
 assert.equal((await call('plan-intent',path,{action:'register',command:plan})).status,200);
 const before=row();let token;
 f.hooks.sql=(sql,args)=>{if(sql.includes('process_revoked_sessions'))token=args[0];};
 f.hooks.put=()=>{assert(token);f.db.prepare('INSERT OR REPLACE INTO process_revoked_sessions VALUES(?,?,?)').run(token,Date.now()+3600000,Date.now());};
 const stop={action:'retire',expectedRevision:plan.expectedRevision,confirm:'RETIRE '+lane.toUpperCase()+' PLAN'};
 assert.equal((await call('plan-intent',path,stop)).status,403);
 assert.deepEqual(row(),before);
});

for(const winner of ['maintenance','original'])void test('FQC exact plan maintenance, '+winner+' commits first',async t=>{
  const {f,call,read:fqc,plan,row}=await scheduled(t,'fqc');
  const fj=(await fqc()).jobs[0];
  function target(job,oldId){return {oldId,jobId:job.id,sourceId:job.itemId,product:job.calendar.productCode,start:job.start,end:job.end,planStart:day,planEnd:day};}
  const project='synthetic-project',build='1'.repeat(40),dbTarget='2'.repeat(64),transfer='3'.repeat(64);
  const grant={origin,project,release:build,dbTarget,transfer,actor:(await (await call('fqc')).json()).identity.id,from:Date.now(),until:Date.now()+3600000,newId:'plan-fqc-'+require('node:crypto').randomUUID(),
    fqc:target(fj,plan.operationId)};
  const handler=f.load('lib/routine-plan-maintenance.ts').reconcileRoutinePlans;
  let quote='';
  async function invoke(method,actor=grant.actor){
    const req=new Request(origin+'/process/'),cookie=f.core.sessionCookie(req,await f.core.demoSession(req,actor,false,1)).split(';')[0];
    return handler(new Request(origin+'/maintenance',{method,headers:{cookie,origin,'X-Process-Expected-Actor':actor,'X-Plan-Scope':'fqc','X-Original-Operation':grant.fqc.oldId,'X-Confirm-Plan-Reconciliation':'RECONCILE FQC PLAN','X-FQC-Assessment':quote}}),project,build);
  }
  assert.equal((await invoke('POST')).status,404);

  f.env.DB.batch=async statements=>{
    f.db.exec('BEGIN');
    try{const results=[];for(const statement of statements)results.push({success:true,...await statement.run()});
      f.db.exec('COMMIT');return results;
    }catch(error){f.db.exec('ROLLBACK');throw error;}
  };
  const snapshot=f.db.prepare('SELECT "values" FROM shared_state WHERE id=1').get().values;
  f.db.function('unixepoch',()=>Math.floor(Date.now()/1000));
  f.env.FQC_PLAN_ONE_TIME=JSON.stringify(grant);
  assert.equal((await invoke('GET')).status,403);
  f.env.PROCESS_PROGRAM_COMMIT=build;
  assert.equal((await invoke('GET')).status,403);
  f.db.prepare('INSERT INTO process_snapshot_target VALUES(1,?,?)').run(dbTarget,transfer);
  f.db.prepare('INSERT INTO process_snapshot_transfers VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(transfer,project,dbTarget,'hash','key',grant.actor,'integrity-verified',1,1,1,1,1,2);
  f.db.prepare("UPDATE process_snapshot_transfers SET phase='receiving' WHERE id=?").run(transfer);
  assert.equal((await invoke('POST')).status,403);
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM fqc_plan_reconciliation_journal').get().n,0);
  f.db.prepare("UPDATE process_snapshot_transfers SET phase='integrity-verified' WHERE id=?").run(transfer);
  assert.equal((await invoke('POST','other-admin')).status,403);
  const layoutKey=f.load('lib/routine-fqc.ts').RF_KEY;
  let previous;
  await f.mutate(values=>{previous=values[layoutKey];values[layoutKey]=JSON.stringify({pageDraftLayout:'page-v1'});});
  assert.equal((await (await invoke('GET')).json()).error,'UNSUPPORTED_LAYOUT');
  await f.mutate(values=>{values[layoutKey]=previous;});
  const baseline=row();
  for(const changed of [{sourceId:'another-source'},{end:'2099-01-01'}]){
    f.env.FQC_PLAN_ONE_TIME=JSON.stringify({...grant,fqc:{...grant.fqc,...changed}});
    assert.equal((await invoke('GET')).status,409);
    assert.deepEqual(row(),baseline);
  }
  f.env.FQC_PLAN_ONE_TIME=JSON.stringify(grant);
  const candidate=await invoke('GET');assert.equal(candidate.status,200);
  quote=(await candidate.json()).assessment;
  let enter,release;const reached=new Promise(r=>{enter=r;}),pause=new Promise(r=>{release=r;});
  f.hooks.run=async sql=>{if(sql.startsWith('UPDATE shared_state')){enter();await pause;}};
  const old=call('fqc','',plan);
  await Promise.race([reached,old.then(()=>{throw Error('expected old request paused at CAS')})]);
  delete f.hooks.run;
  try{
    if(winner==='original'){
      release();assert.equal((await old).status,200);
      const saved=row();
      f.env.FQC_PLAN_ONE_TIME=JSON.stringify({...grant,fqc:{...grant.fqc,planStart:'2099-01-01'}});
      assert.equal((await (await invoke('GET')).json()).error,'ORIGINAL_MISMATCH');
      assert.deepEqual(row(),saved);
      f.env.FQC_PLAN_ONE_TIME=JSON.stringify(grant);
      assert.equal((await (await invoke('POST')).json()).error,'ASSESSMENT_CHANGED');
      quote=(await (await invoke('GET')).json()).assessment;
    }
    f.db.function('unixepoch',()=>Math.ceil(grant.until/1000)+1);
    assert.equal((await invoke('POST')).status,409);
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM fqc_plan_reconciliation_journal').get().n,0);
    f.db.function('unixepoch',()=>Math.floor(Date.now()/1000));
    const post=await invoke('POST');assert.equal(post.status,200,JSON.stringify(await post.clone().json()));
    assert.equal((await post.json()).status,'independent-readback-required');
  }finally{release();}
  if(winner==='maintenance'){const late=await old;assert.equal(late.status,409);assert.equal((await fqc()).documents.length,1);}
  const verified=await invoke('GET');assert.equal(verified.status,200);
  const result=await verified.json();assert.equal(result.status,'verified-current');
  assert.equal((await fqc()).jobs.find(j=>j.id===fj.id).planId,result.planId);
  assert.equal(result.id,grant.fqc.oldId);
  assert.equal((await call('fqc','?operationId='+grant.fqc.oldId)).status,winner==='original'?200:404);
  assert.equal((await invoke('POST')).status,200);assert.equal((await fqc()).documents.length,1);
  f.db.prepare('UPDATE shared_state SET "values"=?,revision=revision+1 WHERE id=1').run(snapshot);
  for(const method of ['GET','POST']){
    const restored=await invoke(method);assert.equal(restored.status,409);assert.equal((await restored.json()).error,'RESTORE_OR_GRANT_CHANGED');
  }
  assert.equal((await fqc()).documents.length,0);
});
