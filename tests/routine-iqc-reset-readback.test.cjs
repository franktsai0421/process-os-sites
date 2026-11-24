const {test}=require('node:test');
const assert=require('node:assert/strict');
const setup=require('../scripts/fqc-reset-request-fixture.cjs');
const {origin}=require('../scripts/routine-reset-authority-fixture.cjs');

test('two IQC Resets retain scoped proof for the same actor and fence a late generation',async t=>{
  const {f,cookie,call}=await setup(t,{format:'records'});
  const id='synthetic-unknown-generate';
  const row=()=>f.db.prepare('SELECT revision,"values" FROM shared_state WHERE id=1').get();
  await f.mutate(v=>{
    const c=JSON.parse(v.routineIqcControl);
    c.calendar.startDate='2026-11-22';c.calendar.jobs=[{id:'test-row'}];
    v.routineIqcControl=JSON.stringify(c);
    v.peer=JSON.stringify({working:{name:'synthetic'}});
  });
  const before=JSON.parse(row().values).__processRecords.values;
  f.hooks.get=k=>{if(k===before.peer.key)throw Error('synthetic peer unavailable');};
  const request=async(actor,operation,body)=>{
    const url=origin+'/api/routine-iqc'+(body?'':'?operationId='+operation);
    const method=body?'POST':'GET';
    return f.load('app/api/routine-iqc/route.ts')[method](new Request(url,{method,headers:{origin,cookie:await cookie(actor),'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}));
  };
  for(let i=1;i<=2;i++){
    const result=await call('iqc','frank',{id:'synthetic-iqc-reset-'+i,scope:'iqc',confirm:'RESET IQC',reason:'synthetic',irreversibleAck:true,
      pendingCount:0,revision:row().revision,pending:i===1?[{operationId:id,clientEvidence:'b'.repeat(64)}]:[]});
    assert.equal(result.status,200,JSON.stringify(result.body));
  }
  const after=row(),refs=JSON.parse(after.values).__processRecords.values;
  for(const [key,ref] of Object.entries(before))if(key!=='routineIqcControl')assert.deepEqual(refs[key],ref);
  const live=JSON.parse((await f.core.readState({keys:['routineIqcControl']})).values.routineIqcControl);
  assert.equal(live.resetGenerationRevision,2);assert.ok(!live.calendar.startDate);assert.deepEqual(live.calendar.jobs,[]);
  const own=await request('frank',id);
  assert.equal(own.status,200);
  assert.deepEqual((await own.json()).supersededByReset,{scope:'iqc',actorId:'frank',operationId:id,generationRevision:1});
  assert.equal((await request('admin-two',id)).status,404);
  assert.equal((await request('frank','unknown-operation')).status,404);
  const late=await request('frank',id,{action:'generate',expectedRevision:2,operationId:id});
  assert.equal(late.status,409);assert.equal((await late.json()).error,'OPERATION_SUPERSEDED_BY_RESET');
  assert.deepEqual(row(),after);
});

for(const fault of ['missing target','concurrent writer']){
 test('IQC Reset refuses '+fault+' before it can replace the live module',async t=>{
  const {f,call}=await setup(t,{format:'records'});
  const row=()=>f.db.prepare('SELECT revision,"values" FROM shared_state WHERE id=1').get();
  const before=row();
  if(fault==='missing target'){
    const key=JSON.parse(before.values).__processRecords.values.routineIqcControl.key;
    f.hooks.get=k=>{if(k===key)throw Error('unavailable target');};
  }else{
    f.hooks.run=sql=>{
      if(!sql.startsWith('UPDATE shared_state'))return;
      delete f.hooks.run;
      f.db.prepare('UPDATE shared_state SET revision=revision+1 WHERE id=1').run();
    };
  }
  const result=await call('iqc','frank',{id:'synthetic-reset-fault',scope:'iqc',confirm:'RESET IQC',reason:'synthetic',irreversibleAck:true,pendingCount:0,revision:before.revision});
  assert.equal(result.status,fault==='missing target'?503:409);
  assert.equal(row().values,before.values);
  assert.equal(row().revision,before.revision+(fault==='concurrent writer'?1:0));
 });
}

test('IQC preview rejects an ordinary account with module permissions',async t=>{
  const {f,cookie}=await setup(t,{format:'records'});
  const result=await f.load('app/api/routine-iqc/route.ts').GET(new Request(origin+'/api/routine-iqc?preview=1&start=2026-11-24',{headers:{cookie:await cookie('staff')}}));
  assert.equal(result.status,403);
});
