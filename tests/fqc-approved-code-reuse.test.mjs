import assert from 'node:assert/strict';
import test from 'node:test';
import {createFqcDraftLifecycleFixture} from './fqc-draft-lifecycle-route-fixture.mjs';

test('FQC releases parent and item codes only after approved deletion, preserving identity, history and retries', async t => {
  const f = await createFqcDraftLifecycleFixture();
  t.after(f.close);
  const old = f.seed.initialContent, [parent] = old.errors, [child] = old.items;
  const newParent = {...parent, id:'replacement-parent', code:parent.code.toLowerCase()};
  const newChild = {...child, id:'replacement-child', errorId:newParent.id, checkNo:child.checkNo.toLowerCase()};
  let flow;
  async function start() {
    const r = await f.request({method:'POST',body:{action:'begin'}});
    assert.equal(r.status,200,JSON.stringify(r.body)); flow = r.body.control.workflow;
  }
  async function send(cmd,actor='editor') {
    const r = await f.send(cmd,actor);
    assert.equal(r.status,200,JSON.stringify(r.body)); flow = (await f.inspect()).control.workflow;
    return r.body.receipt;
  }
  async function denied(cmd,status,why) {
    const row = f.row(), objects = [...f.objects];
    const r = await f.send(cmd);
    assert.equal(r.status,status,JSON.stringify(r.body)); assert.equal(r.body.error,why);
    assert.deepEqual(f.row(),row); assert.deepEqual([...f.objects],objects);
  }
  const pending = () => send(f.command('submit',flow,{savedId:flow.saved.id,reason:'Synthetic review'}));
  const review = (action,actor) => send(f.command(action,flow,{caseId:flow.pendingId,reason:'Synthetic decision'},actor),actor);

  await start();
  await denied(f.setFields(flow,'errors',parent.id,{isDeleted:true}),422,'ERROR_PARENT_INVALID');
  const spare = {...parent,id:'alternate-parent',code:'Alternate'};
  await send(f.insert(flow,'errors',spare));
  await send(f.setFields(flow,'items',child.id,{isDeleted:true}));
  await send(f.setFields(flow,'errors',parent.id,{isDeleted:true}));
  await send(f.command('save',flow));
  const blocked = async () => {
    await denied(f.insert(flow,'errors',newParent),422,'ERROR_CODE_DUPLICATE');
    await denied(f.insert(flow,'items',{...newChild,errorId:spare.id}),422,'ITEM_CODE_DUPLICATE');
    assert.deepEqual(flow.active.content,old);
  };
  await blocked();
  for (const [action,actor] of [['withdraw','editor'],['return','reviewer']]) {
    await pending();
    await denied(f.insert(flow,'errors',newParent),409,'PENDING_LOCKED');
    assert.deepEqual(flow.active.content,old);
    await review(action,actor);
    await blocked();
  }
  await pending(); await review('approve','reviewer');
  const deletion = structuredClone(flow.active);
  await start();
  await denied(f.insert(flow,'errors',parent),409,'ENTITY_ID_RESERVED');
  await send(f.insert(flow,'errors',newParent));
  await denied(f.insert(flow,'items',{...newChild,id:child.id}),409,'ENTITY_ID_RESERVED');
  const contenders = [newChild,{...newChild,id:'competing-child',checkNo:'  '+child.checkNo.toUpperCase()+'  '}]
    .map(row=>f.insert(flow,'items',row));
  const race = await Promise.all(contenders.map(cmd=>f.send(cmd)));
  const winners = race.map(r=>r.status===200);
  assert.equal(winners.filter(Boolean).length,1,JSON.stringify(race.map(r=>r.body)));
  flow = (await f.inspect()).control.workflow;
  const winner = winners.indexOf(true), loser = 1-winner;
  const unchanged = f.row(), replay = await f.send(contenders[winner]);
  assert.deepEqual(replay.body.receipt,race[winner].body.receipt); assert.deepEqual(f.row(),unchanged);
  await denied(f.insert(flow,'items',contenders[loser].patches[0].value),422,'ITEM_CODE_DUPLICATE');
  await send(f.command('save',flow)); await pending(); await review('approve','reviewer');
  const approved = flow.active.content, replacementId = contenders[winner].patches[0].value.id;
  for (const [key,original,id] of [['errors',parent,newParent.id],['items',child,replacementId]]) {
    assert.deepEqual(approved[key].find(row=>row.id===original.id),{...original,isDeleted:true});
    assert.ok(approved[key].some(row=>row.id===id && !row.isDeleted));
  }
  assert.equal(approved.items.find(row=>row.id===replacementId).errorId,newParent.id);
  const {control} = await f.inspect();
  assert.deepEqual(control.versions.find(v=>v.id===f.seed.ids.active).snapshot,old);
  assert.deepEqual(control.versions.find(v=>v.id===deletion.id).snapshot,deletion.content);
});

test('FQC planner keeps the captured row when a code is reassigned or legacy IDs are ambiguous', async t => {
  const f = await createFqcDraftLifecycleFixture(); t.after(f.close);
  const {fqcPlannerJobs,renumberedPlanSource,fqcSourcesById} = f.load('lib/routine-fqc.ts');
  const old = {id:'deleted-item',code:'Reuse',products:[]};
  const fresh = {id:'new-item',code:'Reuse',products:[]};
  const job = {id:'old-period',itemId:old.id,source:old};
  const project = (row,items) => fqcPlannerJobs({jobs:[row],documents:[]},items)[0];
  assert.equal(project(job,[fresh]),job);
  assert.equal(renumberedPlanSource(job,fresh),old);
  const renamed = {...fresh,code:'Fresh'};
  const inconsistent = {...job,itemId:fresh.id};
  assert.equal(project(inconsistent,[renamed]),inconsistent);
  assert.equal(renumberedPlanSource(inconsistent,renamed),old);
  const unknown = {...job,itemId:undefined,source:{...old,id:undefined}};
  assert.equal(project(unknown,[{...renamed,id:undefined}]),unknown);
  const newJob = {...job,itemId:fresh.id,source:fresh};
  assert.equal(project(newJob,[renamed,fresh]),newJob);
  assert.equal(fqcSourcesById([fresh,renamed,fresh]).size,0);
  assert.equal(project(newJob,[renamed]).source.code,'Fresh');
  for (const pin of [{planId:'plan'},{completion:{reportId:'report'}},{calendar:{retestCaseId:'case'}}]) {
    const linked = {...newJob,...pin};
    assert.equal(project(linked,[renamed]),linked);
    assert.equal(renumberedPlanSource(linked,renamed),fresh);
  }
});
