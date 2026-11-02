import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const routeFixture=require('../scripts/fqc-apply-fixture.cjs');
const {fixture:moduleFixture}=require('../scripts/test-fqc-feedback-races.cjs');
const tick=()=>new Promise(setImmediate);
async function idle(ui){for(let i=0;i<1000&&ui.c.__fqcTest.ui.saving;i++)await new Promise(resolve=>setTimeout(resolve,5));assert.equal(ui.c.__fqcTest.ui.saving,false);}
async function until(predicate){for(let i=0;i<1000;i++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,5));}assert.fail('Required synthetic event did not occur');}
const plain=value=>JSON.parse(JSON.stringify(value));
const posts=f=>f.requests.filter(r=>r.method==='POST'&&JSON.parse(r.body).command);
const assignment=(id,next,previous)=>({patches:[{op:'set',path:['items',{id},'productCodes'],value:next}],guards:[{path:['items',{id},'productCodes'],value:previous}]});
async function mount(f,intercept){
  const initial=await f.call('/api/fqc/workflow?caseMetadata=1');
  return moduleFixture({initialControl:(await initial.json()).control,identityUser:{id:'editor',name:'Synthetic editor',role:'staff'},send:(url,o)=>intercept?intercept(url,o,()=>f.call(url,o)):f.call(url,o)});
}
async function conflicted(f,intercept,beforeApply){
  const ui=await mount(f,intercept);await ui.c.__fqcTest.sharedAction('begin');
  const client=ui.c.__fqcTest.transport(),rejections=[],send=client.sendPrepared;
  client.sendPrepared=(command,options)=>{const flight=send(command,options);void flight.catch(error=>rejections.push({command,error}));return flight;};
  await ui.c.__fqcTest.recoverySession().ready;await tick();
  await ui.main.querySelector('[data-matrix-item="item"]').click();
  const peer=f.realm('other');await peer.client.read();
  await peer.client.command(ui.library.workflow.generation,'apply',assignment('item',['SYN-P'],[]));
  await f.mutate(values=>{const m=JSON.parse(values.masterDataControl);m.active.AB.products.push({...m.active.AB.products[0],code:'SYN-NEW'});m.versions[0].snapshot=plain(m.active.AB);values.masterDataControl=JSON.stringify(m);});
  beforeApply?.(ui);
  await ui.c.__fqcTest.applyMatrixChoices();
  assert.equal(posts(f).at(-1).status,409);assert.equal(posts(f).at(-1).result.error,'FQC_MATRIX_SCOPE_CHANGED');
  assert.equal(ui.c.sharedDraftAccountState().failed,true);assert.equal(ui.c.__fqcTest.matrixDirty(),true);
  return {ui,peer,client,rejections};
}
async function discard(ui){
  await ui.main.querySelector('#fqc-matrix-discard').click();
  await idle(ui);
}

// Actual module/recovery/shared client and signed route over isolated SQLite/R2.
// DOM, timing and mount are synthetic; this is not native/browser acceptance.
void test('confirmed matrix-scope 409 → actual Discard → actual Save preserves fresh peer data without replay',async()=>{
  const f=await routeFixture();try{
    const {ui,peer}=await conflicted(f),before=posts(f).length;
    await peer.client.command(ui.library.workflow.generation,'apply',{patches:[{op:'set',path:['errors',{id:'error'},'name'],value:'Peer latest'}],guards:[{path:['errors',{id:'error'},'name'],value:'Synthetic error'}]});
    const latest=plain((await f.state()).workflow);
    await discard(ui);
    assert.equal(posts(f).length,before+1,'Discard is read/local-only; never replays the conflict');
    assert.equal(ui.c.__fqcTest.matrixDirty(),false);
    assert.deepEqual(plain(ui.c.sharedDraftAccountState()),{queued:0,unknown:false,failed:false});
    assert.deepEqual(plain(ui.library.workflow.working),latest.working,'Discard adopts the fresh peer projection');
    assert.deepEqual(plain((await f.state()).workflow),latest,'Discard never writes shared data');
    const save=ui.main.querySelector('#fqc-save');assert(save&&!save.disabled);await save.click();await idle(ui);
    assert.equal(ui.c.__fqcTest.ui.lastError,null);assert.equal(posts(f).length,before+2);
    assert.equal(JSON.parse(posts(f).at(-1).body).command.action,'save');
    assert.deepEqual((await f.state()).workflow.saved.content,latest.working);
  }finally{f.close();}
});

for(const mode of ['null-working','missing-items','invalid-row','mismatched-draft','missing-draft-snapshot','duplicate-draft','invalid-version','invalid-saved'])void test(`malformed fresh 200 ${mode} cannot clear input, recovery storage or original failure`,async()=>{
  const f=await routeFixture();let armed=false;try{
    const {ui,client}=await conflicted(f,async(url,o,send)=>{
      if(!armed||o.method==='POST')return send();
      const response=await f.call('/api/fqc/workflow?caseMetadata=1'),data=await response.json(),flow=data.control.workflow,draft=data.control.versions.find(v=>v.status==='draft');
      if(mode==='null-working')flow.working=null;
      if(mode==='missing-items')delete flow.working.items;
      if(mode==='invalid-row')flow.working.items[0]=null;
      if(mode==='mismatched-draft')draft.snapshot.items[0].productCodes=[];
      if(mode==='missing-draft-snapshot')delete draft.snapshot;
      if(mode==='duplicate-draft')data.control.versions.push(plain(draft));
      if(mode==='invalid-version')data.control.versions.push(null);
      if(mode==='invalid-saved')flow.saved={id:'synthetic-saved',content:null};
      return Response.json(data);
    });
    const before=posts(f).length,local=plain(ui.library.workflow),shared=plain((await f.state()).workflow),session=ui.c.__fqcTest.recoverySession(),stored=session.preview(session.key,'storage');assert.equal(stored.ok,true);
    armed=true;await discard(ui);
    assert.equal(client.hasSyncFailures(),true);assert.equal(ui.c.__fqcTest.matrixDirty(),true);assert.deepEqual(plain(ui.library.workflow),local);
    assert.equal(session.preview(session.key,'storage').ok,true);assert.equal(posts(f).length,before);assert.deepEqual(plain((await f.state()).workflow),shared);
  }finally{f.close();}
});

for(const where of ['helper','transport'])void test(`${where}-only rejected marker cleanup still allows explicit Discard then Save without replay`,async()=>{
  const f=await routeFixture();let restore;try{
    const {ui,client}=await conflicted(f,null,ui=>{
      const storage=where==='helper'?ui.c.localStorage:ui.c.sessionStorage,remove=storage.removeItem;
      storage.removeItem=key=>{if(key.startsWith(where==='helper'?'process-local-draft-v2:':'shared-draft-receipt-only-v1:'))throw Error('SYNTHETIC_REMOVE_DENIED');return remove(key);};restore=()=>{storage.removeItem=remove;};
    });
    assert.equal(client.hasUnknown(),where==='transport');restore();const before=posts(f).length;
    ui.main.querySelector('#fqc-matrix-recovery').click();const cleanup=()=>[...ui.doc.querySelectorAll('button')].find(button=>button.textContent==='完成已拒絕操作清理');await until(()=>!!cleanup());await cleanup().click();
    assert.equal(client.hasUnknown(),false);assert.equal(client.hasSyncFailures(),where==='helper');assert.equal(posts(f).length,before);
    await discard(ui);assert.equal(client.hasSyncFailures(),false);assert.equal(ui.c.__fqcTest.matrixDirty(),false);assert.equal(posts(f).length,before);
    await ui.c.__fqcTest.sharedAction('save');assert.equal(posts(f).length,before+1);assert.deepEqual((await f.state()).workflow.saved.content.items[0].productCodes,['SYN-P']);
  }finally{f.close();}
});

void test('a later successful Apply receipt retains the earlier independent conflict until explicit Discard',async()=>{
  const f=await routeFixture();let armed=false,lost=false;try{
    const {ui,client,peer}=await conflicted(f,async(url,o,send)=>{
      if(armed&&o.method==='POST'){const response=await send();assert.equal(response.status,200);lost=true;throw Error('SYNTHETIC_LOST_ACK');}
      if(armed&&lost&&String(url).includes('operationId='))return Response.json({error:'OPERATION_NOT_FOUND'},{status:404});
      return send();
    });
    await peer.client.command(ui.library.workflow.generation,'apply',assignment('item',[],['SYN-P']));await f.mutate(values=>{const m=JSON.parse(values.masterDataControl);m.active.AB.products=m.active.AB.products.filter(p=>p.code!=='SYN-NEW');m.versions[0].snapshot=plain(m.active.AB);values.masterDataControl=JSON.stringify(m);});armed=true;
    await ui.c.__fqcTest.applyMatrixChoices();assert.equal(client.hasUnknown(),true);const before=posts(f).length,operationId=JSON.parse(posts(f).at(-1).body).command.operationId;
    armed=false;await ui.c.__fqcTest.applyMatrixChoices();assert.equal(client.hasUnknown(),false);assert.equal(client.hasSyncFailures(),true);
    assert.equal(ui.c.__fqcTest.matrixDirty(),true);assert.equal(ui.main.querySelector('#fqc-matrix-discard').disabled,false);
    await discard(ui);assert.equal(client.hasSyncFailures(),false);assert.equal(ui.c.__fqcTest.matrixDirty(),false);assert.equal(posts(f).length,before);
    await ui.c.__fqcTest.sharedAction('save');assert.equal(posts(f).length,before+1);assert.equal(posts(f).filter(row=>JSON.parse(row.body).command.operationId===operationId).length,1);
    assert.deepEqual((await f.state()).workflow.saved.content.items[0].productCodes,['SYN-P']);
  }finally{f.close();}
});

void test('repeated original conflicts and a toggled-back empty batch remain explicitly discardable; GET alone never clears',async()=>{
  const f=await routeFixture();try{
    const {ui,client,rejections}=await conflicted(f);
    await ui.c.__fqcTest.applyMatrixChoices();assert.equal(rejections.length,2);
    await client.read();assert.equal(client.hasSyncFailures(),true);
    await ui.main.querySelector('[data-matrix-item="item"]').click();
    assert.equal(ui.c.__fqcTest.matrixDirty(),true,'zero choices does not silently drop rejected-operation obligations');
    assert.equal(ui.main.querySelector('#fqc-matrix-discard').disabled,false);
    const before=posts(f).length;await discard(ui);
    assert.equal(posts(f).length,before);assert.equal(client.hasSyncFailures(),false);
    await ui.c.__fqcTest.sharedAction('save');assert.equal(posts(f).length,before+1);
    assert.deepEqual((await f.state()).workflow.saved.content.items[0].productCodes,['SYN-P']);
  }finally{f.close();}
});

void test('exact proof rejects forged errors, changed commands, duplicates, another client and unrelated same-path operation',async()=>{
  const f=await routeFixture();try{
    const {ui,client,rejections}=await conflicted(f),first=rejections[0];
    assert.equal(client.canDiscardMatrixConflicts(rejections),true);
    const forged={...first,error:Object.assign(Error(first.error.message),{status:409,requestId:first.error.requestId,details:first.error.details})};
    for(const entries of [[forged],[{...first,command:{...first.command,operationId:'different'}}],[first,first],[],[null]]){
      assert.equal(client.canDiscardMatrixConflicts(entries),false);
      assert.throws(()=>client.discardMatrixConflicts(entries),/CONFIRMED_MATRIX_CONFLICT_REQUIRED/);
      assert.equal(client.hasSyncFailures(),true);
    }
    const other=f.realm('editor');await other.client.read();assert.equal(other.client.canDiscardMatrixConflicts([first]),false);
    await assert.rejects(client.command(ui.library.workflow.generation,'apply',assignment('item',['SYN-P'],[])),/DEPENDENCY_CHANGED_RECONFIRM/);
    assert.equal(rejections.length,2);const before=posts(f).length;
    await discard(ui);assert.equal(ui.c.__fqcTest.matrixDirty(),false);
    assert.equal(client.hasSyncFailures(),true,'discard removes only the matrix-owned operation, not a second same-path failure');
    await assert.rejects(ui.c.__fqcTest.sharedAction('save'),/DEPENDENCY_CHANGED_RECONFIRM/);assert.equal(posts(f).length,before);
    assert.equal(client.canDiscardMatrixConflicts([first]),false,'a consumed operation cannot clear twice');
    assert.equal(client.canDiscardMatrixConflicts([rejections[1]]),true);
  }finally{f.close();}
});

for(const mode of ['read-failure','read-revoked','edit-revoked','new-generation','pending-lock','local-storage-failure'])void test(`Discard preserves choices and failure on ${mode}; no POST`,async()=>{
  const f=await routeFixture();let failRead=false;try{
    const {ui,client}=await conflicted(f,async(url,o,send)=>failRead&&o.method!=='POST'?Response.json({error:'SYNTHETIC_READ_UNAVAILABLE'},{status:503}):send());
    if(mode==='read-failure')failRead=true;
    if(mode==='read-revoked')f.revoke('editor');
    if(mode==='edit-revoked')await f.mutate(values=>{const users=JSON.parse(values.platformUsers);users[0].accessOverrides['fqc.edit']=false;values.platformUsers=JSON.stringify(users);});
    if(mode==='new-generation'||mode==='pending-lock')await f.mutate(values=>{const q=JSON.parse(values.qualityMasterControl),flow=q.libraries.fqc.workflow;if(mode==='new-generation')flow.generation='synthetic-new-generation';else flow.pendingId='synthetic-pending';values.qualityMasterControl=JSON.stringify(q);});
    if(mode==='local-storage-failure')ui.c.localStorage.removeItem=()=>{throw Error('SYNTHETIC_REMOVE_DENIED');};
    const before=posts(f).length,latest=plain((await f.state()).workflow);await discard(ui);
    assert.equal(client.hasSyncFailures(),true);assert.equal(ui.c.__fqcTest.matrixDirty(),true);
    assert.equal(posts(f).length,before);assert.deepEqual(plain((await f.state()).workflow),latest);
  }finally{f.close();}
});

void test('a different audited refusal cannot be relabeled into an original guard409 proof',async()=>{
  const f=await routeFixture();try{
    const realm=f.realm(),{client}=realm,begun=await client.begin(),command=client.prepare(begun.control.workflow.generation,'apply',assignment('item',['SYN-P'],[]));
    realm.intercept((url,o,send)=>o.method==='POST'?Response.json({error:'EQUIPMENT_UNAVAILABLE',requestId:'12345678-1234-4234-8234-123456789abc',details:{path:['items',{id:'item'},'productCodes']}},{status:422}):send());
    let error;await assert.rejects(client.sendPrepared(command),e=>{error=e;return e.message==='EQUIPMENT_UNAVAILABLE';});
    assert.equal(client.isConfirmedRejection(error,command),true);assert.equal(client.hasUnknown(),false);
    error.message='DEPENDENCY_CHANGED_RECONFIRM';error.status=409;
    assert.equal(client.canDiscardMatrixConflicts([{command,error}]),false);assert.equal(client.hasSyncFailures(),true);
  }finally{f.close();}
});

void test('fresh Discard is single-flight; failed GET can be explicitly retried without replaying Apply',async()=>{
  const f=await routeFixture();let armed=false,release,entered;const started=new Promise(resolve=>{entered=resolve;});try{
    const {ui,client}=await conflicted(f,async(url,o,send)=>{if(armed&&o.method!=='POST'){entered();await new Promise(resolve=>{release=resolve;});return Response.json({error:'SYNTHETIC_READ_UNAVAILABLE'},{status:503});}return send();});
    const before=posts(f).length;armed=true;ui.main.querySelector('#fqc-matrix-discard').click();await started;
    const requests=ui.requests.length;ui.main.querySelector('#fqc-matrix-discard').click();assert.equal(ui.requests.length,requests);
    release();await idle(ui);assert.equal(client.hasSyncFailures(),true);assert.equal(ui.c.__fqcTest.matrixDirty(),true);
    armed=false;await discard(ui);assert.equal(client.hasSyncFailures(),false);assert.equal(ui.c.__fqcTest.matrixDirty(),false);assert.equal(posts(f).length,before);
  }finally{f.close();}
});

void test('discarding a known conflict does not grant a freshly revoked Save permission',async()=>{
  const f=await routeFixture();try{
    const {ui,client}=await conflicted(f);await f.mutate(values=>{const users=JSON.parse(values.platformUsers);users[0].accessOverrides['fqc.save']=false;values.platformUsers=JSON.stringify(users);});
    await discard(ui);assert.equal(client.hasSyncFailures(),false);assert.equal(client.permission('save'),false);
    const save=ui.main.querySelector('#fqc-save');assert(!save||save.disabled);const before=plain((await f.state()).workflow);
    await assert.rejects(ui.c.__fqcTest.sharedAction('save'),/FORBIDDEN/);assert.deepEqual(plain((await f.state()).workflow),before);
  }finally{f.close();}
});

void test('actor replacement during fresh Discard GET cannot adopt, clear failure or drop local selection',async()=>{
  const f=await routeFixture();let armed=false,release,entered;const started=new Promise(resolve=>{entered=resolve;});try{
    const {ui,client,rejections}=await conflicted(f,async(url,o,send)=>{if(armed&&o.method!=='POST'){entered();await new Promise(resolve=>{release=resolve;});}return send();});
    const before=posts(f).length,local=plain(ui.library.workflow);armed=true;
    ui.main.querySelector('#fqc-matrix-discard').click();await started;
    ui.c.ProcessSync.identity={...ui.c.ProcessSync.identity};
    assert.equal(client.canDiscardMatrixConflicts(rejections),false);
    release();await idle(ui);assert.equal(client.hasSyncFailures(),true);
    assert.deepEqual(plain(ui.library.workflow),local);assert.equal(ui.c.__fqcTest.matrixDirty(),true);assert.equal(posts(f).length,before);
  }finally{f.close();}
});

void test('queued/in-flight operation and an uncorrelated 409 remain receipt-blocked, never cleared or replayed by Discard',async()=>{
  const f=await routeFixture();let armed=false,release,entered;const started=new Promise(resolve=>{entered=resolve;});try{
    const {ui,client,rejections}=await conflicted(f,async(url,o,send)=>{if(armed&&o.method==='POST'){entered();await new Promise(resolve=>{release=resolve;});return Response.json({error:'DEPENDENCY_CHANGED_RECONFIRM',details:{path:['items',{id:'item'},'productCodes']}},{status:409});}return send();});
    armed=true;const pending=assert.rejects(client.command(ui.library.workflow.generation,'apply',assignment('item',[],['SYN-P'])),/DEPENDENCY_CHANGED_RECONFIRM/);
    await started;assert.equal(ui.c.sharedDraftAccountState().queued,1);assert.equal(client.canDiscardMatrixConflicts([rejections[0]]),false);
    const before=ui.requests.length;await discard(ui);assert.equal(ui.requests.length,before);assert.equal(ui.c.__fqcTest.matrixDirty(),true);
    release();await pending;assert.equal(client.hasUnknown(),true);assert.equal(client.canDiscardMatrixConflicts([rejections[0]]),false);
    await discard(ui);assert.equal(ui.requests.length,before);assert.equal(client.hasUnknown(),true);assert.equal(client.hasSyncFailures(),true);
    await assert.rejects(client.retryUnknown(),/OPERATION_NOT_FOUND/);
    assert.equal(client.hasUnknown(),true);await discard(ui);assert.equal(client.hasSyncFailures(),true);
  }finally{f.close();}
});
