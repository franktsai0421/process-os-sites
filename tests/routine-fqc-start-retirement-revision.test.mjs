import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fixture} from './fixtures/routine-fqc-durable.mjs';

for (const scenario of ['first confirm','concurrent change','unconfirmed conflict']) {
  void test('FQC startup after retirement: '+scenario, async () => {
    const f=fixture({actor:'frank'});
    for(const snapshot of [f.api.getData(),f.remote]){
      snapshot.control.revision=0;
      snapshot.control.startDate=null;
      snapshot.control.documents=[];
      snapshot.permissions.settings=true;
    }
    f.setMode('lost');
    await assert.rejects(f.api.postOwned({action:'configure',expectedRevision:0,startDate:f.remote.today}));
    await f.api.act('retry');
    const original=f.api.record().meta.operationId;
    let retired=false,confirmations=0;
    const posted=[],fetch=f.box.fetch.bind(f.box);
    f.box.fetch=async (url,options)=>{
      if(url.startsWith('/api/routine-start-retirement')){
        if(options.method==='POST'){assert.equal(retired,false);retired=true;f.remote.control.revision++;f.remote.revision++;}
        return Response.json({status:retired?'retired':'eligible',scope:'fqc',actorId:'frank',id:original,expectedRevision:0,fencedRevision:1});
      }
      if(url.includes('?preview='))return Response.json({jobs:[],unresolved:[]});
      if(options.method==='POST'){
        const cmd=JSON.parse(options.body);posted.push(cmd);
        if(cmd.expectedRevision!==f.remote.control.revision)return Response.json({error:'REVISION_CONFLICT',...(scenario==='unconfirmed conflict'?{}:{requestId:randomUUID()})},{status:409});
        f.remote.control.startDate=cmd.startDate;
      }
      return fetch(url,options);
    };
    f.api.setDialog(async()=>({}));
    await f.api.act('retire-first-start');
    assert.equal(f.api.getData().control.revision,1,'mounted state must adopt the fenced revision');
    assert.equal(f.api.record(),null);
    f.setMode('ok');
    f.api.setDialog(async (_title,_body,_submit,ready)=>{
      const date={value:f.remote.today},button={},preview={},output={};
      ready({open:true,querySelector:s=>({'[type=submit]':button,'[name=start]':date,'[data-preview]':preview,'.rf-preview':output})[s]});
      assert.equal(button.disabled,true);await preview.onclick();assert.equal(button.disabled,false);
      if(!confirmations++&&scenario!=='first confirm'){f.remote.control.revision++;f.remote.revision++;}
      return new Map([['start',date.value]]);
    });
    await f.api.act('settings');
    assert.deepEqual(posted.map(c=>c.expectedRevision),[1]);
    if(scenario==='unconfirmed conflict'){assert.equal(f.api.record().meta.operationId,posted[0].operationId);return;}
    assert.equal(f.api.record(),null);
    if(scenario==='concurrent change'){
      assert.equal(f.api.getData().control.revision,2);
      assert.equal(f.api.getData().control.startDate,null);
      await f.api.act('settings');
      assert.deepEqual(posted.map(c=>c.expectedRevision),[1,2]);
    }
    assert.equal(f.api.getData().control.startDate,f.remote.today);
    assert.equal(new Set([original,...posted.map(c=>c.operationId)]).size,posted.length+1);
  });
}
