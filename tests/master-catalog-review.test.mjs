import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './abc-local-bridge-fixture.mjs';

const scopes=['AB','C'];
for(const scope of scopes) {
  test(scope+' retains unrelated historical records on submit and approval',async t=>{
    const x=await fixture({scope});t.after(x.f.close);x.box.alert=()=>{};
    await x.f.mutateValues(values=>{
      values.qualityMasterControl=JSON.stringify({libraries:{fqc:{
        activeVersionId:'live',versions:[{id:'live',status:'approved',snapshot:{items:[]}}],
        workflow:{saves:[{id:'old',content:{items:[{id:'historic',name:'Synthetic archived item'}]}}]}
      }}});
    });
    await x.bridge.load(scope);
    x.draft().snapshot.products[0].name='Synthetic change';
    await x.bridge.execute(scope,'apply');await x.bridge.execute(scope,'save');
    const manifest=()=>JSON.parse(x.f.row().values).__processRecords;
    const before=manifest(),archive=before.values.qualityMasterControl;
    const historic=JSON.parse(x.f.objects.get(archive.key)).libraries.fqc.workflow.saves[0].content.__immutableBody.key;
    x.f.hooks.set('r2get.before',e=>{assert.notEqual(e.key,historic,'unrelated quality history read');});
    const flow=x.bridge.flow(scope);
    await x.bridge.execute(scope,'submit',{savedId:flow.saved.id,expectedRevision:flow.revision,reason:'Synthetic submit'});
    const id=x.bridge.flow(scope).pendingId;
    assert.ok(id);
    await x.bridge.execute(scope,'approve',{caseId:id,selfReviewConfirmed:true});
    assert.equal(x.bridge.flow(scope).active.id,id);
    const after=manifest();
    for(const [key,ref] of Object.entries(before.values))if(key!=='masterDataControl')assert.deepEqual(after.values[key],ref);
    assert.deepEqual(after.legacySources,before.legacySources);assert.deepEqual(after.allocations,before.allocations);
  });
  test(scope+' checks new external references against a previously saved rename',async t=>{
    const x=await fixture({scope});t.after(x.f.close);x.box.alert=()=>{};
    // Simulate a saved rename followed by a new historical reference.
    await x.f.mutateValues(values=>{
      const master=JSON.parse(values.masterDataControl),flow=master.workflowScopes[scope];
      const original=flow.working.products[0].code;
      flow.working.products[0].code='Synthetic-renamed';
      flow.saved={...flow.saves[0],id:'saved-rename',content:structuredClone(flow.working)};
      flow.saves.push(flow.saved);
      master.versions.find(v=>v.status==='draft').snapshot=flow.working;
      values.masterDataControl=JSON.stringify(master);
      values.bomOverrides=JSON.stringify({replaceAll:true,data:{}});
      values.qualityMasterControl=JSON.stringify({libraries:{fqc:{workflow:{saves:[{
        id:'prior-version',content:{items:[{id:'referencing-item',productCodes:[original]}]}
      }]}}}});
    });
    const state=await x.f.request();
    const flow=state.body.control.workflow,original=x.f.row();
    const result=await x.f.request('POST',x.f.command('submit',{
      savedId:flow.saved.id,expectedRevision:flow.revision,reason:'Synthetic submit'
    }));
    assert.equal(result.status,409);
    assert.equal(result.body.error,'CATALOG_IN_USE');
    assert.deepEqual(x.f.row(),original);
  });
  for(const committed of [false,true])test(scope+' unknown submit after reopen, committed='+committed,async t=>{
    const x=await fixture({scope});t.after(x.f.close);x.box.alert=()=>{};
    x.draft().snapshot.products[0].name='Synthetic changed product';
    await x.bridge.execute(scope,'apply');await x.bridge.execute(scope,'save');
    const saved=x.bridge.flow(scope).saved,revision=x.bridge.flow(scope).revision,fetch=x.box.fetch;
    let posts=0;
    x.box.fetch=async(url,options)=>{
      if(options.method==='POST'){
        posts++;if(committed)await fetch(url,options);
        throw Error('Synthetic lost request or response');
      }
      if(url.includes('operationId='))throw Error('Synthetic offline');
      return fetch(url,options);
    };
    await assert.rejects(()=>x.bridge.execute(scope,'submit',{savedId:saved.id,expectedRevision:revision,reason:'Synthetic submit'}));
    assert.equal(posts,1);
    const marker=[...x.disk];
    assert.ok(marker.length>0);
    const reopened=await fixture({scope,disk:x.disk,api:x.f});
    if(committed){
      await reopened.bridge.recover(scope);
      assert.equal(reopened.disk.size,0);
      const flow=reopened.bridge.flow(scope);
      assert.equal(flow.cases.filter(c=>c.savedId===saved.id).length,1);
      assert.equal(flow.cases.at(-1).id,flow.pendingId);
    }else{
      await assert.rejects(()=>reopened.bridge.recover(scope),/OPERATION_NOT_FOUND/);
      assert.deepEqual([...reopened.disk],marker);
      assert.equal(reopened.bridge.flow(scope).saved.id,saved.id);
      assert.equal(reopened.bridge.flow(scope).pendingId,null);
      await assert.rejects(()=>reopened.bridge.execute(scope,'submit',{}),/UNKNOWN_OPERATION_CHECK_REQUIRED/);
    }
    assert.equal(reopened.posts().length,0);
  });
}
