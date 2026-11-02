// Actual FQC UI/client/recovery and signed TypeScript route over synthetic SQLite/R2.
// DOM and timers are explicit test ports. No live Site, real account or business data.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const routeFixture=require('../scripts/fqc-apply-fixture.cjs');
const {fixture:moduleFixture}=require('../scripts/test-fqc-feedback-races.cjs');
const plain=value=>JSON.parse(JSON.stringify(value));
const posts=f=>f.requests.filter(r=>r.method==='POST'&&JSON.parse(r.body).command);
const command=row=>JSON.parse(row.body).command;
const receipts=ui=>ui.requests.filter(row=>row.url.includes('operationId='));
const tick=()=>new Promise(setImmediate);
async function idle(ui){for(let i=0;i<1000&&ui.c.__fqcTest.ui.saving;i++)await new Promise(resolve=>setTimeout(resolve,5));assert.equal(ui.c.__fqcTest.ui.saving,false);}
async function until(predicate){for(let i=0;i<1000;i++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,5));}assert.fail('Required synthetic event did not occur');}
async function mount(f,{actor='editor',intercept}={}){
  const initial=await f.call('/api/fqc/workflow?caseMetadata=1',{},actor);assert.equal(initial.status,200);
  return moduleFixture({initialControl:(await initial.json()).control,identityUser:{id:actor,name:'Synthetic '+actor,role:'staff'},send:(url,o)=>intercept?intercept(url,o,()=>f.call(url,o,actor)):f.call(url,o,actor)});
}
async function setup(options){
  const f=await routeFixture();
  await f.mutate(values=>{const q=JSON.parse(values.qualityMasterControl),content=q.libraries.fqc.versions[0].snapshot;content.items[0].rule={cadence:'batch',batchKind:'fixed_count',fixedCount:1};content.items.push({...plain(content.items[0]),id:'item2',checkNo:'SYN-FQC-L1-02',name:'Synthetic second item'});values.qualityMasterControl=JSON.stringify(q);});
  const ui=await mount(f,options);await ui.c.__fqcTest.sharedAction('begin');return {f,ui};
}
async function choose(ui,id='item'){
  await ui.c.__fqcTest.recoverySession().ready;await tick();
  const cell=ui.main.querySelector(`[data-matrix-item="${id}"]`);assert(cell&&!cell.disabled);await cell.click();
}
async function apply(ui){const button=ui.main.querySelector('#fqc-matrix-apply');assert(button&&!button.disabled);await button.click();await tick();await idle(ui);}
async function save(ui){await ui.main.querySelector('#fqc-save').click();await tick();await idle(ui);}


void test('Apply immediately shares without saving; fresh other actor sees it before upper Save',async()=>{
 const {f,ui}=await setup();try{const before=posts(f).length;await choose(ui);assert.equal(posts(f).length,before);await apply(ui);assert.equal(posts(f).length,before+1);assert.equal(receipts(ui).length,0);assert.equal((await f.state()).workflow.saved,null);assert.equal(ui.c.__fqcTest.matrixDirty(),false);assert.match(ui.main.querySelector('#fqc-matrix-message').textContent,/已更新共用草稿.*尚未儲存快照/);const peer=await mount(f,{actor:'other'});assert.deepEqual(plain(peer.library.workflow.working.items[0].productCodes),['SYN-P']);await save(ui);const flow=(await f.state()).workflow;assert.deepEqual(flow.saved.content,flow.working);assert.match(ui.main.querySelector('#fqc-matrix-message').textContent,/快照已儲存/);assert.deepEqual(posts(f).slice(before).map(r=>command(r).action),['apply','save']);}finally{f.close();}
});
void test('a second edit captures the latest full model and blocks Save until explicit Apply',async()=>{
 const {f,ui}=await setup();try{await choose(ui);await apply(ui);await choose(ui,'item2');const before=posts(f).length;await assert.rejects(ui.c.__fqcTest.sharedAction('save'),/套用|修改/);assert.equal(posts(f).length,before);await apply(ui);await save(ui);assert.deepEqual((await f.state()).workflow.saved.content.items.map(r=>r.productCodes),[['SYN-P'],['SYN-P']]);}finally{f.close();}
});
void test('rapid repeated Apply and Save each send once',async()=>{
 const {f,ui}=await setup();try{await choose(ui);const before=posts(f).length,button=ui.main.querySelector('#fqc-matrix-apply');button.click();button.click();button.click();await idle(ui);const saveButton=ui.main.querySelector('#fqc-save');saveButton.click();saveButton.click();saveButton.click();await idle(ui);assert.deepEqual(posts(f).slice(before).map(r=>command(r).action),['apply','save']);}finally{f.close();}
});
void test('discarding a later unsent choice leaves the previous successful shared matrix intact',async()=>{
 const {f,ui}=await setup();try{await choose(ui);await apply(ui);const before=plain((await f.state()).workflow),writes=posts(f).length;await choose(ui,'item2');await ui.main.querySelector('#fqc-matrix-discard').click();await idle(ui);assert.deepEqual(plain((await f.state()).workflow),before);assert.equal(posts(f).length,writes);assert.equal(ui.c.__fqcTest.matrixDirty(),false);}finally{f.close();}
});
void test('quota failure preserves choice and stops Apply before any operation or Save',async()=>{
 const {f,ui}=await setup();try{await choose(ui);const before=posts(f).length;ui.c.localStorage.setItem=()=>{throw Object.assign(Error('SYNTHETIC_QUOTA'),{name:'QuotaExceededError'});};await apply(ui);assert.equal(posts(f).length,before);assert.match(ui.main.querySelector('#fqc-matrix-message').textContent,/存檔失敗|RECOVERY_STORAGE_UNAVAILABLE/);assert.equal(ui.c.__fqcTest.matrixDirty(),true);await assert.rejects(ui.c.__fqcTest.sharedAction('save'));assert.equal(posts(f).length,before);}finally{f.close();}
});
void test('Save snapshots the latest peer whole matrix and does not reapply this actors old choices',async()=>{
 const {f,ui}=await setup();try{const peer=await mount(f,{actor:'other'});await choose(ui);await choose(peer,'item2');await apply(ui);await apply(peer);const before=posts(f).length;await save(ui);assert.deepEqual(posts(f).slice(before).map(r=>command(r).action),['save']);const flow=(await f.state()).workflow;assert.deepEqual(flow.working.items.map(r=>r.productCodes),[[],['SYN-P']]);assert.deepEqual(flow.saved.content,flow.working);}finally{f.close();}
});
for(const refusal of ['PENDING_LOCKED','STALE_GENERATION','FORBIDDEN'])void test(`server ${refusal} keeps unsent choices and cannot proceed to Save`,async()=>{
  const {f,ui}=await setup();try{
    await choose(ui);await f.mutate(values=>{
      if(refusal==='FORBIDDEN'){const users=JSON.parse(values.platformUsers);users[0].accessOverrides['fqc.edit']=false;values.platformUsers=JSON.stringify(users);}
      else {const q=JSON.parse(values.qualityMasterControl),flow=q.libraries.fqc.workflow;if(refusal==='PENDING_LOCKED')flow.pendingId='synthetic-pending';else flow.generation='synthetic-new-generation';values.qualityMasterControl=JSON.stringify(q);}
    });
    const before=posts(f).length,unchanged=plain((await f.state()).workflow);await apply(ui);
    assert.deepEqual(posts(f).slice(before).map(row=>command(row).action),['apply']);assert.equal(posts(f).at(-1).result.error,refusal);
    assert.deepEqual(plain((await f.state()).workflow),unchanged);assert.equal(ui.c.__fqcTest.matrixDirty(),true);assert.equal(receipts(ui).length,0);
  }finally{f.close();}
});

for(const receiptStatus of [404,503])void test(`lost Apply ACK and receipt ${receiptStatus} keep the exact operation; explicit query never replays or saves`,async()=>{
  let lost=false,unavailable=true;
  const {f,ui}=await setup({intercept:async(url,o,send)=>{
    if(o.method==='POST'&&JSON.parse(o.body).command?.action==='apply'){await send();lost=true;throw Error('SYNTHETIC_ACK_LOST');}
    if(lost&&unavailable&&String(url).includes('operationId='))return Response.json({error:receiptStatus===404?'OPERATION_NOT_FOUND':'SYNTHETIC_RECEIPT_UNAVAILABLE'},{status:receiptStatus});
    return send();
  }});try{
    await choose(ui);const before=posts(f).length;await apply(ui);
    assert.deepEqual(posts(f).slice(before).map(row=>command(row).action),['apply']);const operationId=command(posts(f).at(-1)).operationId;
    assert.equal(ui.c.__fqcTest.transport().hasUnknown(),true);assert.equal((await f.state()).workflow.saved,null);
    await apply(ui);await apply(ui);assert.equal(posts(f).length,before+1);assert.equal((await f.state()).workflow.saved,null);
    const queries=receipts(ui);assert(queries.length>=3);assert(queries.every(row=>new URL(row.url,'https://synthetic.invalid').searchParams.get('operationId')===operationId));
    unavailable=false;await apply(ui);assert.equal(posts(f).length,before+1);assert.equal(ui.c.__fqcTest.transport().hasUnknown(),false);assert.equal((await f.state()).workflow.saved,null,'receipt recovery does not implicitly Save');
    await save(ui);assert.deepEqual(posts(f).slice(before).map(row=>command(row).action),['apply','save']);assert.deepEqual((await f.state()).workflow.saved.content.items[0].productCodes,['SYN-P']);
  }finally{f.close();}
});

void test('Apply committed but Save is rejected before CAS leaves shared-unsaved state; explicit Save retry never reapplies matrix',async()=>{
  let denySave=true;
  const {f,ui}=await setup({intercept:async(url,o,send)=>{
    if(denySave&&o.method==='POST'&&JSON.parse(o.body).command?.action==='save')await fixture.mutate(values=>{const q=JSON.parse(values.qualityMasterControl);q.libraries.fqc.workflow.pendingId='synthetic-pending';values.qualityMasterControl=JSON.stringify(q);});
    return send();
  }});const fixture=f;try{
    await choose(ui);await apply(ui);const before=posts(f).length;await save(ui);
    assert.deepEqual(posts(f).slice(before).map(row=>command(row).action),['save']);assert.equal(posts(f).at(-1).status,409);
    let flow=(await f.state()).workflow;assert.deepEqual(flow.working.items[0].productCodes,['SYN-P']);assert.equal(flow.saved,null);assert.equal(ui.library.workflow.saved,null);
    assert.equal(ui.c.__fqcTest.matrixDirty(),false);assert.equal(ui.c.__fqcTest.transport().hasUnknown(),false);assert.match(ui.c.__fqcTest.ui.lastError,/PENDING_LOCKED/);
    denySave=false;await f.mutate(values=>{const q=JSON.parse(values.qualityMasterControl);q.libraries.fqc.workflow.pendingId=null;values.qualityMasterControl=JSON.stringify(q);});await ui.c.__fqcTest.transport().read();ui.c.__fqcTest.render();await save(ui);
    assert.deepEqual(posts(f).slice(before).map(row=>command(row).action),['save','save']);flow=(await f.state()).workflow;assert.deepEqual(flow.saved.content,flow.working);
  }finally{f.close();}
});

void test('lost Save ACK retains receipt-only unknown and never falsely reports saved or reapplies matrix',async()=>{
  let lost=false,unavailable=true;
  const {f,ui}=await setup({intercept:async(url,o,send)=>{
    if(o.method==='POST'&&JSON.parse(o.body).command?.action==='save'){await send();lost=true;throw Error('SYNTHETIC_SAVE_ACK_LOST');}
    if(lost&&unavailable&&String(url).includes('operationId='))return Response.json({error:'OPERATION_NOT_FOUND'},{status:404});return send();
  }});try{
    await choose(ui);await apply(ui);const before=posts(f).length;await save(ui);
    assert.deepEqual(posts(f).slice(before).map(row=>command(row).action),['save']);assert((await f.state()).workflow.saved);
    assert.equal(ui.library.workflow.saved,null,'unknown outcome cannot adopt a fabricated Save success');assert.equal(ui.c.__fqcTest.transport().hasUnknown(),true);assert.equal(ui.c.__fqcTest.matrixDirty(),false);
    await assert.rejects(ui.c.__fqcTest.sharedAction('save'),/UNKNOWN_OPERATION/);assert.equal(posts(f).length,before+1);
    const operationId=command(posts(f).at(-1)).operationId,button=ui.main.querySelector('#fqc-check-result');assert(button);
    await button.click();await tick();assert.equal(posts(f).length,before+1);assert.equal(ui.c.__fqcTest.transport().hasUnknown(),true);
    unavailable=false;await button.click();await until(()=>!!ui.library.workflow.saved);
    assert.equal(ui.c.__fqcTest.transport().hasUnknown(),false);assert.deepEqual(plain(ui.library.workflow.saved.content),(await f.state()).workflow.saved.content);
    assert.equal(posts(f).length,before+1);assert(receipts(ui).every(row=>new URL(row.url,'https://synthetic.invalid').searchParams.get('operationId')===operationId));
  }finally{f.close();}
});


void test('departure Save snapshots already shared matrix and returns the existing navigation lease',async()=>{
 const {f,ui}=await setup();try{const before=posts(f).length,departure=ui.c.FQCMasterUI.navigation.departure;await choose(ui);assert.equal(departure.inspect().canSave,false);await apply(ui);assert.equal(departure.inspect().state,'dirty');assert.equal(departure.inspect().canSave,true);const lease=await departure.save();assert.equal(departure.inspect().state,'clean');assert.equal(ui.main.inert,true);lease.release();assert(!ui.main.inert);assert.deepEqual(posts(f).slice(before).map(r=>command(r).action),['apply','save']);assert.deepEqual((await f.state()).workflow.saved.content.items[0].productCodes,['SYN-P']);}finally{f.close();}
});
void test('departure cannot discard an already shared whole matrix as if it were personal input',async()=>{
 const {f,ui}=await setup();try{await choose(ui);await apply(ui);const before=plain((await f.state()).workflow),writes=posts(f).length,departure=ui.c.FQCMasterUI.navigation.departure;assert.equal(departure.inspect().canDiscard,false);await assert.rejects(departure.discard(),/共享|撤回/);assert.deepEqual(plain((await f.state()).workflow),before);assert.equal(posts(f).length,writes);}finally{f.close();}
});

void test('unsent choices cannot Submit; Apply then Save then Submit locks the preserved selection',async()=>{
 const {f,ui}=await setup();try{await choose(ui);const before=posts(f).length;await ui.main.querySelector('#fqc-submit').click();await tick();assert.equal(posts(f).length,before);assert.match(ui.toasts.at(-1),/套用|修改/);await apply(ui);await save(ui);const flow=(await f.state()).workflow;ui.c.alert=()=>{};await ui.c.__fqcTest.sharedAction('submit',{savedId:flow.saved.id,expectedRevision:flow.revision,generation:flow.generation,reason:'Synthetic matrix submission'});assert((await f.state()).workflow.pendingId);assert.equal(ui.main.querySelector('[data-matrix-item="item"]').disabled,true);assert.deepEqual((await f.state()).workflow.saved.content.items[0].productCodes,['SYN-P']);}finally{f.close();}
});
