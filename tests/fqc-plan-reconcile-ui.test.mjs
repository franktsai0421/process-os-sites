import assert from 'node:assert/strict';
import test from 'node:test';
import {fixture} from './fixtures/routine-fqc-durable.mjs';

for(const mode of ['ok','cancel','changed-actor','restore'])void test('FQC original-page reconciliation '+mode,async()=>{
  const f=fixture(),id='synthetic-legacy-plan',actor=f.sync.identity.id;
  f.setMode('lost');
  await assert.rejects(f.api.postOwned({action:'create-plan',operationId:id,expectedRevision:10,jobIds:['synthetic-job']}));
  const original=f.box.fetch.bind(f.box), other='unrelated-device-key';
  f.store.setItem(other,'preserve');
  let committed=false,posts=0;
  f.box.fetch=async(url,options)=>{
    if(url!=='/api/routine-plan-maintenance')return original(url,options);
    assert.equal(options.headers['X-Original-Operation'],id);
    if(committed&&mode==='restore')return Response.json({error:'RESTORE_OR_GRANT_CHANGED'},{status:409});
    if(options.method==='POST'){
      assert.equal(options.headers['X-FQC-Assessment'],'1'.repeat(64));
      posts++;committed=true;if(mode==='changed-actor')f.remote.identity={id:'another'};f.remote.control.jobs=[{id:'synthetic-job',planId:'doc'}];
      return Response.json({status:'independent-readback-required'});
    }
    return Response.json({actorId:actor,id,scope:'fqc',assessment:'1'.repeat(64),jobId:'synthetic-job',planId:'doc',revision:51,status:committed?'verified-current':'assessment'});
  };
  f.win.confirm=()=>mode!=='cancel';
  await f.api.act('retry');
  assert.equal(f.api.record().meta.operationId,id);
  await f.api.act('reconcile-fqc-plan');
  assert.equal(posts,mode==='cancel'?0:1);assert.equal(f.api.record()===null,mode==='ok');assert.equal(f.store.getItem(other),'preserve');
});
