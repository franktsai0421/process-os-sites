const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const setup=require('../scripts/fqc-reset-request-fixture.cjs');

for(const scenario of ['baseline','many bodies','nested','large peer','many keys','large target',
  'missing peer','missing target','missing target body','corrupt target body','malformed nested marker',
  'absent target','missing authority','unsupported envelope','concurrent change','inline','chunks','snapshot','mixed envelope']){
  test('FQC Reset storage: '+scenario,async t=>{
    const {f,call}=await setup(t,{format:scenario==='inline'?'inline':'records'});
    const key='routineFqcControl';
    await f.mutate(values=>{
      const control=JSON.parse(values[key]);
      control.startDate='2026-11-22';
      control.jobs=[{id:'synthetic-job'}];
      control.synthetic={snapshot:{text:scenario==='large target'?'F'.repeat(1024*1024):'target'}};
      values[key]=JSON.stringify(control);
      let peer={sample:'peer'};
      if(scenario==='nested')for(let i=0;i<80;i++)peer={nested:peer};
      if(scenario==='large peer')peer={text:'P'.repeat(9*1024*1024)};
      values.peer=JSON.stringify(scenario==='many bodies'?Array.from({length:180},(_,index)=>({snapshot:{index}})):{snapshot:peer});
      if(scenario==='many keys')for(let i=0;i<180;i++)values['peer'+i]=JSON.stringify({index:i});
    });
    const read=()=>f.db.prepare('SELECT revision,"values" FROM shared_state WHERE id=1').get();
    const initial=read(),envelope=JSON.parse(initial.values),refs=envelope.__processRecords?.values;
    const payload=ref=>JSON.parse(f.objects.get(ref.key));
    const bodyRef=ref=>payload(ref).snapshot.__immutableBody;
    if(scenario==='missing peer')f.objects.delete(bodyRef(refs.peer).key);
    if(scenario==='missing target')f.objects.delete(refs[key].key);
    if(scenario==='missing authority')f.objects.delete(refs.platformUsers.key);
    if(scenario==='missing target body'||scenario==='corrupt target body'){
      const body=payload(refs[key]).synthetic.snapshot.__immutableBody.key;
      if(scenario==='missing target body')f.objects.delete(body);
      else f.objects.set(body,Buffer.from('{}'));
    }
    if(scenario==='malformed nested marker'){
      const broken=payload(refs[key]);
      broken.synthetic.snapshot={__immutableBody:{key:'invalid'}};
      const raw=Buffer.from(JSON.stringify(broken)),sha256=createHash('sha256').update(raw).digest('hex');
      refs[key]={sha256,key:'state-records/v1/'+sha256+'.json'};
      f.objects.set(refs[key].key,raw);
    }
    if(scenario==='absent target')delete refs[key];
    if(scenario==='unsupported envelope')envelope.future={synthetic:true};
    if(['chunks','snapshot','mixed envelope'].includes(scenario)){
      const values=(await f.core.readState()).values;
      let wrapped;
      if(scenario==='chunks')wrapped=JSON.parse(await f.load('lib/state-chunks.ts').encodeChunkedValues(f.env.STATE_ARCHIVE,values));
      else{
        const raw=Buffer.from(JSON.stringify(values)),sha256=createHash('sha256').update(raw).digest('hex');
        const ref={key:'snapshots/'+sha256+'.json',sha256};
        f.objects.set(ref.key,raw);
        wrapped={__processR2:ref,platformUsers:values.platformUsers,maintenanceMode:values.maintenanceMode};
        if(scenario==='mixed envelope')wrapped.unrecognized='preserve';
      }
      f.db.prepare('UPDATE shared_state SET "values"=? WHERE id=1').run(JSON.stringify(wrapped));
      const previous=read();
      const result=await call('fqc','frank',{scope:'fqc',id:'synthetic-reset-legacy',confirm:'RESET FQC',irreversibleAck:true,reason:'synthetic',pendingCount:0,revision:previous.revision});
      if(scenario==='mixed envelope'){assert.equal(result.status,503);assert.deepEqual(read(),previous);return;}
      assert.equal(result.status,200);
      const after=await f.core.readState();
      assert.equal(after.revision,previous.revision+1);
      assert.equal(JSON.parse(after.values[key]).resetReceipt.id,'synthetic-reset-legacy');
      assert.deepEqual({...after.values,[key]:values[key]},{...values});
      return;
    }

    f.db.prepare('UPDATE shared_state SET "values"=? WHERE id=1').run(JSON.stringify(envelope));
    const before=read();
    if(scenario==='concurrent change')f.hooks.run=sql=>{
      if(!sql.startsWith('UPDATE shared_state'))return;
      delete f.hooks.run;
      const concurrent=structuredClone(envelope);
      concurrent.__processRecords.values.peer=refs.masterDataControl;
      f.db.prepare('UPDATE shared_state SET revision=revision+1,"values"=? WHERE id=1').run(JSON.stringify(concurrent));
    };
    const body={scope:'fqc',id:'synthetic-reset-001',confirm:'RESET FQC',irreversibleAck:true,reason:'synthetic',pendingCount:0,revision:before.revision};
    const gets=[],original=f.env.STATE_ARCHIVE.get;
    let bytes=0;
    f.env.STATE_ARCHIVE.get=async id=>{
      gets.push(id);
      const obj=await original(id);
      if(!obj)return null;
      return {...obj,async text(){const raw=await obj.text();bytes+=Buffer.byteLength(raw);return raw;}};
    };
    const result=await call('fqc','frank',body),after=read();
    const rejected=['missing target','missing target body','corrupt target body','absent target','missing authority','unsupported envelope','malformed nested marker'];
    if(rejected.includes(scenario)){
      assert.equal(result.status,scenario==='absent target'?409:503);
      assert.deepEqual(after,before);
      return;
    }
    if(scenario==='concurrent change'){
      assert.equal(result.status,409);
      const expected=structuredClone(envelope);
      expected.__processRecords.values.peer=refs.masterDataControl;
      assert.deepEqual(JSON.parse(after.values),expected);
      assert.equal(after.revision,before.revision+1);
      return;
    }
    assert.equal(result.status,200);
    assert.equal(after.revision,before.revision+1);
    const saved=JSON.parse(after.values);
    if(refs){
      assert.equal(gets.includes(refs.peer.key),false);
      assert.equal(gets.length,8);
      assert(bytes<(scenario==='large target'?1100000:20000));
      const nextRef=saved.__processRecords.values[key],control=payload(nextRef);
      assert.equal(control.resetReceipt.id,body.id);
      assert.deepEqual(control.jobs,[]);
      assert.equal(control.startDate,null);
      saved.__processRecords.values[key]=refs[key];
      assert.deepEqual(saved,envelope);
      t.diagnostic(JSON.stringify({scenario,gets:gets.length,bytes,manifestBytes:Buffer.byteLength(after.values)}));
    }else{
      assert.equal(JSON.parse(saved[key]).startDate,null);
      saved[key]=envelope[key];
      assert.deepEqual(saved,envelope);
    }
    const repeat=await call('fqc','frank',body);
    assert.equal(repeat.body.replayed,true);
    assert.deepEqual(read(),after);
  });
}
