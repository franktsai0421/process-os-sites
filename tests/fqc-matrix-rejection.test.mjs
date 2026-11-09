import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const fixture=require('../scripts/fqc-apply-fixture.cjs');
const {fixture:moduleFixture}=require('../scripts/test-fqc-feedback-races.cjs');
const matrix=(id='item')=>({patches:[{op:'set',path:['items',{id},'productCodes'],value:['SYN-P']}],guards:[{path:['items',{id},'productCodes'],value:[]}]});
const posts=f=>f.requests.filter(r=>r.method==='POST'&&r.body&&JSON.parse(r.body).command);
async function opened(f){const a=f.realm('editor');await a.client.read();const opened=await a.client.begin();return {a,generation:opened.control.workflow.generation};}
async function attempt(a,generation,details=matrix()){
  const command=a.client.prepareRecovery(generation,details),capability=a.client.rejectionCapability(command);
  let error;try{await a.client.sendPrepared(command,{assertDispatch:()=>true});}catch(caught){error=caught;}
  return {command,error,capability};
}

// Real route/kernel, bounded transport and synthetic SQLite/R2. No live data,
// hosted request, user credentials, browser layout or physical-device acceptance.
void test('peer-deleted matrix row is a confirmed original rejection, never a nonexistent receipt obligation',async()=>{
  const f=await fixture();try{
    const {a,generation}=await opened(f),b=f.realm('other');await b.client.read();
    await b.client.command(generation,'apply',{patches:[{op:'set',path:['items',{id:'item'},'isDeleted'],value:true}],guards:[{path:['items',{id:'item'},'isDeleted']}]});
    const before=JSON.stringify(await f.state()),writes=posts(f).length,first=await attempt(a,generation);
    assert.equal(first.error.message,'ENTITY_REMOVED_OR_AMBIGUOUS');assert.equal(first.error.status,409);
    assert.equal(a.client.hasUnknown(),false,'original pre-CAS rejection is not unknown');
    assert.equal(a.client.isConfirmedRejection(first.error,first.command),true);
    assert.equal(a.client.hasSyncFailures(),true,'failure remains until explicit correction/discard');
    assert.equal(JSON.stringify(await f.state()),before);assert.equal(posts(f).length,writes+1);
    const reads=f.requests.length;assert.equal(await a.client.resolveUnknown(),null);assert.equal(f.requests.length,reads);
    assert.equal(f.requests.some(r=>r.url.includes('operationId=')),false,'never query a rejected operation receipt');
    const rejections=[{command:first.command,error:first.error}];
    assert.equal(a.client.hasConfirmedMatrixConflict(first.command,first.error),true);
    assert.equal(a.client.canDiscardMatrixConflicts(rejections),true);
    assert.equal(a.client.discardMatrixConflicts(rejections),true);assert.equal(a.client.hasSyncFailures(),false);
    assert.equal(posts(f).length,writes+1,'explicit local cancellation does not replay');
  }finally{f.close();}
});

void test('ordinary guarded matrix Apply still commits once and confirms its readback',async()=>{
  const f=await fixture();try{
    const {a,generation}=await opened(f),writes=posts(f).length,result=await attempt(a,generation);
    assert.equal(result.error,undefined);assert.equal(a.client.hasUnknown(),false);assert.equal(a.client.hasSyncFailures(),false);
    assert.equal(posts(f).length,writes+1);assert.deepEqual((await f.state()).workflow.working.items[0].productCodes,['SYN-P']);
    assert.equal((await f.state()).workflow.saved,null);assert.equal(f.requests.at(-1).method,'GET');
  }finally{f.close();}
});

void test('removed-row discard refuses forged errors, changed commands, duplicates and a different client',async()=>{
  const f=await fixture();try{
    const {a,generation}=await opened(f),first=await attempt(a,generation,matrix('missing'));
    const entry={command:first.command,error:first.error};assert.equal(a.client.canDiscardMatrixConflicts([entry]),true);
    const forged=Object.assign(Error(first.error.message),{status:first.error.status,requestId:first.error.requestId,details:first.error.details});
    for(const entries of [[{...entry,error:forged}],[{...entry,command:{...entry.command,operationId:'other'}}],[entry,entry],[],[null]]){
      assert.equal(a.client.canDiscardMatrixConflicts(entries),false);
      assert.throws(()=>a.client.discardMatrixConflicts(entries),/CONFIRMED_MATRIX_CONFLICT_REQUIRED/);
    }
    const b=f.realm('other');await b.client.read();assert.equal(b.client.canDiscardMatrixConflicts([entry]),false);
    assert.equal(a.client.hasSyncFailures(),true);assert.equal(a.client.hasUnknown(),false);
  }finally{f.close();}
});

void test('same removed-row text without an original request UUID remains unknown, and receipt 404 never clears it',async()=>{
  const f=await fixture();try{
    const {a,generation}=await opened(f);let attempts=0;
    a.intercept(async(url,options,send)=>{const response=await send();if(options.method!=='POST')return response;attempts++;const body=await response.json();delete body.requestId;return Response.json(body,{status:response.status});});
    const first=await attempt(a,generation,matrix('missing'));
    assert.equal(first.error.message,'ENTITY_REMOVED_OR_AMBIGUOUS');assert.equal(a.client.hasUnknown(),true);
    assert.equal(a.client.isConfirmedRejection(first.error,first.command),false);
    assert.equal(a.client.hasConfirmedMatrixConflict(first.command,first.error),false);
    const stored=[...a.session];await assert.rejects(a.client.resolveUnknown(),/OPERATION_NOT_FOUND/);
    assert.equal(a.client.hasUnknown(),true);assert.deepEqual([...a.session],stored);assert.equal(attempts,1);
  }finally{f.close();}
});

void test('lost transport plus receipt 404 remains unknown without re-POST or cancellation',async()=>{
  const f=await fixture();try{
    const {a,generation}=await opened(f);let attempts=0;
    a.intercept((url,options,send)=>{if(options.method==='POST'){attempts++;throw Error('SYNTHETIC_LOSS_BEFORE_RESPONSE');}return send();});
    const first=await attempt(a,generation);assert.match(first.error.message,/RESULT_UNKNOWN/);assert.equal(a.client.hasUnknown(),true);
    const stored=[...a.session];await assert.rejects(a.client.resolveUnknown(),/OPERATION_NOT_FOUND/);
    assert.equal(a.client.discardRejected(first.command.patches.map(p=>p.path)),false);
    assert.equal(a.client.hasConfirmedMatrixConflict(first.command,first.error),false);
    assert.equal(a.client.hasUnknown(),true);assert.deepEqual([...a.session],stored);assert.equal(attempts,1);
    assert.deepEqual((await f.state()).workflow.working.items[0].productCodes,[]);
  }finally{f.close();}
});

void test('ordinary removed-row refusal is known but cannot use matrix-only discard',async()=>{
  const f=await fixture();try{
    const {a,generation}=await opened(f),result=await attempt(a,generation,{patches:[{op:'set',path:['items',{id:'missing'},'name'],value:'local input'}],guards:[{path:['items',{id:'missing'},'name'],value:'previous'}]});
    assert.equal(result.error.message,'ENTITY_REMOVED_OR_AMBIGUOUS');assert.equal(a.client.hasUnknown(),false);
    assert.equal(a.client.isConfirmedRejection(result.error,result.command),true);
    assert.equal(a.client.hasConfirmedMatrixConflict(result.command,result.error),false);
  }finally{f.close();}
});

void test('actual cell Save rejection keeps choices; explicit abandonment then Save retains peer deletion',async()=>{
  const f=await fixture();try{
    const initial=await f.call('/api/fqc/workflow?caseMetadata=1');
    const ui=await moduleFixture({initialControl:(await initial.json()).control,identityUser:{id:'editor',name:'Synthetic editor',role:'staff'},send:(url,options)=>f.call(url,options)});
    await ui.c.__fqcTest.sharedAction('begin');await ui.c.__fqcTest.recoverySession().ready;await new Promise(setImmediate);
    await ui.main.querySelector('[data-matrix-item="item"]').click();
    const peer=f.realm('other');await peer.client.read();
    let before,writes;const client=ui.c.__fqcTest.transport(),send=client.sendPrepared;
    client.sendPrepared=async(command,options)=>{
      // Retain a real POST rejection: the peer deletes after comparison/prepare.
      client.sendPrepared=send;
      await peer.client.command(ui.library.workflow.generation,'apply',{patches:[{op:'set',path:['items',{id:'item'},'isDeleted'],value:true}],guards:[{path:['items',{id:'item'},'isDeleted']}]});
      before=JSON.stringify(await f.state());writes=posts(f).length;
      return send(command,options);
    };
    await assert.rejects(ui.c.__fqcTest.sharedAction('save'),/DRAFT_REVISION_CHANGED_RECONFIRM/);
    assert.equal(ui.c.__fqcTest.transport().hasUnknown(),false);assert.equal(ui.c.__fqcTest.transport().hasSyncFailures(),true);
    assert.equal(ui.c.__fqcTest.matrixDirty(),true);assert.equal(ui.main.querySelector('[data-matrix-item="item"]').textContent,'✓');
    assert.equal(JSON.stringify(await f.state()),before);assert.equal(posts(f).length,writes+1);
    const lease=await ui.c.FQCMasterUI.navigation.departure.abandon();lease.release();
    for(let i=0;i<1000&&ui.c.__fqcTest.ui.saving;i++)await new Promise(resolve=>setTimeout(resolve,5));
    assert.equal(ui.c.__fqcTest.ui.saving,false);
    assert.equal(ui.c.__fqcTest.matrixDirty(),false);assert.equal(ui.c.__fqcTest.transport().hasSyncFailures(),false);
    assert.equal(posts(f).length,writes+1);assert.equal(JSON.stringify(await f.state()),before);
    await ui.c.__fqcTest.sharedAction('save');assert.equal(posts(f).length,writes+2);
    const flow=(await f.state()).workflow;assert.equal(flow.saved.content.items[0].isDeleted,true);assert.deepEqual(flow.saved.content.items[0].productCodes,[]);
    assert.equal(f.requests.some(r=>r.url.includes('operationId=')),false);
  }finally{f.close();}
});
