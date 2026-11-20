import test from 'node:test';import assert from 'node:assert/strict';import {fixture} from './fixtures/routine-fqc-durable.mjs';
import {manualUI,dirty,inputs,posted,deferred} from './fixtures/routine-fqc-manual-ui.mjs';
// Actual whole routine transport; original five protections now include durable
// receipt metadata and the existing terminal full GET, not a fake bare result.
void test('lost result resolves receipt and sends one POST only',async()=>{const f=fixture();f.setMode('commit-lost');const c=f.draft(),r=await f.api.postOwned(c);assert.equal(r.operationId,c.operationId);assert.equal(f.posts(),1);assert(f.api.s.retry,'terminal receipt alone does not clear unknown');f.setMode('ok');await f.api.read();assert.equal(f.api.s.retry,null);});
void test('unknown 404, malformed receipt and explicit retries preserve original with zero resend',async()=>{const f=fixture();f.setMode('commit-lost');f.alterReceipt(()=>({}));await assert.rejects(f.api.postOwned(f.draft()));const original=f.api.s.retry;f.setMode('receipt404');for(let i=0;i<2;i++)await assert.rejects(f.api.postOwned(original),/OPERATION_NOT_FOUND/);await assert.rejects(f.api.postOwned({action:'generate'}),/PREVIOUS_OPERATION_UNKNOWN/);assert.equal(f.posts(),1);assert.equal(f.api.s.retry,original);f.setMode('ok');await assert.rejects(f.api.postOwned(original),/INVALID_OPERATION_RECEIPT/);f.alterReceipt(r=>r);await f.api.postOwned(original);assert(f.api.s.retry);await f.api.read();assert.equal(f.api.s.retry,null);assert.equal(f.posts(),1);});
void test('receipt from old account cannot clear original pending state',async()=>{const f=fixture();f.setMode('commit-lost');f.alterReceipt(()=>({}));await assert.rejects(f.api.postOwned(f.draft()));const original=f.api.s.retry,fetch=f.box.fetch.bind(f.box);f.alterReceipt(r=>r);f.setMode('ok');f.box.fetch=async(...args)=>{const r=await fetch(...args);f.sync.identity={id:'other'};return r;};await assert.rejects(f.api.postOwned(original),/ACCOUNT_CHANGED/);assert.equal(f.api.s.retry,original);assert.equal(f.posts(),1);});
void test('retained command captures input and rejects same ID with changed payload',async()=>{const f=fixture();f.setMode('lost');const c=f.draft();await assert.rejects(f.api.postOwned(c));c.command.patches[0].value='Changed';assert.equal(f.api.s.retry.command.patches[0].value,'Mine');await assert.rejects(f.api.postOwned(c),/OPERATION_ID_PAYLOAD_MISMATCH/);assert.equal(f.posts(),1);assert.equal(f.api.s.retry.command.patches[0].value,'Mine');});
void test('unknown operation never borrows later account for original receipt lookup',async()=>{const f=fixture();f.setMode('lost');await assert.rejects(f.api.postOwned(f.draft()));const original=f.api.s.retry,calls=f.calls.length;f.sync.identity={id:'other'};await assert.rejects(f.api.postOwned(original),/ACCOUNT_CHANGED/);assert.equal(f.calls.length,calls);assert.equal(f.api.s.retry,original);assert.equal(f.posts(),1);});

void test('an uncorrelated FORBIDDEN response preserves the operation, and missing receipt never resends it', async () => {
  const f = fixture();
  f.reject(403, { error: 'FORBIDDEN' });
  await assert.rejects(f.api.postOwned(f.draft()), /FORBIDDEN/);
  const original = f.api.s.retry;
  assert(original);
  await assert.rejects(f.api.postOwned(original), /OPERATION_NOT_FOUND/);
  assert.deepEqual(f.methods(), ['POST', 'GET']);
  assert.equal(f.api.s.retry, original);
  assert.equal(f.store.map.size, 1);
});

for(const mismatch of ['case','save','actor','proof'])void test('newer submit readback with wrong '+mismatch+' cannot retire the original receipt',async()=>{
  const f=fixture(), live=f.api.getData().control.documents[0].flow;
  const content=await f.api.postOwned(f.draft('submit',{savedId:live.saved.id}));
  const flow=f.remote.control.documents[0].flow;
  flow.cases=[{
    id:mismatch==='case'?'different-case':content.caseId,
    savedId:mismatch==='save'?'different-save':content.savedId,
    actor:{id:mismatch==='actor'?'other':'owner'}, status:'approved',
    result:mismatch==='proof'?null:{actor:{id:'reviewer'},at:'2026-11-19T10:00:00Z'},
  }];
  flow.generation='later-generation';flow.revision++;flow.pendingId=null;
  f.remote.revision++;f.remote.control.revision++;
  const original=f.api.s.retry;
  await f.api.postOwned(original);
  await assert.rejects(f.api.read(),/ROUTINE_RECEIPT_READBACK_REQUIRED/);
  assert.equal(f.store.map.size,1);
  assert.equal(f.api.s.retry,original);
  assert.equal(f.posts(),1);
});

for(const lang of ['zh','vi'])void test('missing receipt displays its own support reference without resending ('+lang+')',async()=>{
  const f=manualUI();
  f.document.documentElement.lang=lang;
  const savedInput=dirty(f), original=f.draft();
  f.setMode('lost');
  await assert.rejects(f.api.postOwned(original));
  await f.api.act('retry');
  assert.match(f.root.textContent,lang==='zh'?/查無原操作收據.*寫入結果仍待確認/:/Chưa tìm thấy biên nhận gốc.*kết quả ghi chưa rõ/);
  assert.equal(f.root.querySelector('.rf-receipt-reference code').textContent,original.operationId);
  assert.equal(f.store.map.size,1);
  assert.equal(inputs(f),savedInput);
  assert.equal(posted(f).length,1);
  const previous=f.root.textContent;
  f.sync.identity={id:'different-owner'};
  f.paint();
  assert(previous.includes(original.operationId));
  assert(!f.root.textContent.includes(original.operationId));
  assert.equal(f.store.map.size,1);
});

for(const lang of ['zh','vi'])void test('404 banner can collapse and reopen without changing the draft or receipt ('+lang+')',async()=>{
  const f=manualUI();
  f.document.documentElement.lang=lang;
  f.api.getData().control.calendarPolicy={version:2,scopes:{}};
  f.remote.control.calendarPolicy={version:2,scopes:{}};
  const savedInput=dirty(f), original=f.draft();
  f.setMode('lost');
  await assert.rejects(f.api.postOwned(original));
  const panel=()=>f.root.querySelector('[data-rf-receipt-panel]');
  f.paint();
  assert.equal(!!panel().querySelector('[data-action="receipt-minimize"]'),false,'fresh unqueried error is expanded');
  await f.api.act('retry');
  const gate=deferred(), fetch=f.box.fetch.bind(f.box);
  f.box.fetch=async(...args)=>{await gate.promise;return fetch(...args);};
  const checking=f.api.act('retry');
  assert.match(panel().textContent,lang==='zh'?/正在查詢原操作收據/:/Đang tra biên nhận/);
  assert.doesNotMatch(f.root.textContent,/寫入結果仍待確認|正在保存|kết quả ghi chưa rõ|Đang lưu/);
  assert.equal(f.button('retry').disabled,true);
  gate.resolve();await checking;f.box.fetch=fetch;
  assert.equal(f.button('retry').disabled,false);
  assert.match(panel().textContent,lang==='zh'?/查無原操作收據/:/Chưa tìm thấy biên nhận/);
  const map=[...f.store.map];
  const requests=f.calls.length;
  await f.button('receipt-minimize').click();
  assert(panel().classList.contains('rf-receipt-compact'));
  assert(!panel().classList.contains('error'));
  assert.equal(panel().querySelector('code').textContent,original.operationId);
  assert.equal(f.document.activeElement,f.button('receipt-show'));
  assert.equal(f.calls.length,requests);
  const [recordKey,recordValue]=map[0];
  const collapseKey='routine-fqc-receipt-collapsed-v1:'+recordKey;
  assert.equal(f.store.map.get(recordKey),recordValue);
  assert.equal(f.store.map.get(collapseKey),'missing');
  assert.equal(inputs(f),savedInput);
  assert.equal(f.api.s.retry.operationId,original.operationId);

  f.root.querySelector('[data-tab="plans"]').click();
  assert(panel().classList.contains('rf-receipt-compact'),'read-only navigation retains the display choice');
  await f.api.act('refresh');
  assert(panel().classList.contains('rf-receipt-compact'),'ordinary read does not reopen the same issue');
  await f.button('receipt-show').click();
  assert.match(panel().textContent,lang==='zh'?/查無原操作收據/:/Chưa tìm thấy biên nhận/);
  assert.equal(f.document.activeElement,f.button('retry'));
  assert.equal(posted(f).length,1);
  await assert.rejects(f.api.postOwned({action:'generate'}),/PREVIOUS_OPERATION_UNKNOWN/);
  assert.equal(posted(f).length,1);
  assert.deepEqual([...f.store.map],map);
  assert.equal(inputs(f),savedInput);

  await f.button('receipt-minimize').click();
  const reopened=manualUI({store:f.store});
  reopened.document.documentElement.lang=lang;
  reopened.api.s.reviewPlatform=true;
  reopened.api.s.reviewModule='FQC';
  await reopened.api.refresh();
  assert(reopened.root.querySelector('.rf-receipt-compact'),'new review page restores the exact collapsed receipt');
  assert.equal(reopened.api.s.retry.operationId,original.operationId);
  assert.equal(reopened.posts(),0);
  await reopened.button('receipt-show').click();
  assert.match(reopened.root.querySelector('[data-rf-receipt-panel]').textContent,
   lang==='zh'?/上次查無原操作收據/:/Lần trước chưa tìm thấy biên nhận/);
  assert.equal(f.store.map.has(collapseKey),false);

  await f.button('receipt-show').click();
  await f.button('receipt-minimize').click();
  f.box.fetch=async()=>Response.json({error:'TEST_ONLY_FRESH_READ_ERROR'},{status:503});
  await f.api.act('refresh');
  assert(!panel().classList.contains('rf-receipt-compact'));
  assert.match(panel().textContent,/TEST_ONLY_FRESH_READ_ERROR/);
  assert.deepEqual([...f.store.map],map);
  assert.equal(inputs(f),savedInput);
});


void test('receipt query failure stays visible and recovery needs authenticated receipt plus readback',async()=>{
  const f=manualUI();
  f.setMode('commit-lost');
  f.alterReceipt(()=>({}));
  const original=f.draft();
  await assert.rejects(f.api.postOwned(original));
  const originalFetch=f.box.fetch.bind(f.box);
  f.box.fetch=async()=>{throw Error('TEST ONLY lookup network failure');};
  await f.api.act('retry');
  assert.match(f.root.querySelector('[data-rf-receipt-panel]').textContent,/收據查詢失敗/);
  assert.equal(f.button('receipt-minimize'),null);
  assert.equal(f.store.map.size,1);
  assert.equal(f.posts(),1);
  f.box.fetch=originalFetch;f.alterReceipt(r=>r);f.setMode('ok');
  await f.api.act('retry');
  const status=f.root.querySelector('[data-rf-receipt-panel]');
  assert.match(status.textContent,/原操作已確認，已讀取最新資料/);
  assert.equal(status.getAttribute('role'),'status');
  assert.equal(f.api.s.retry,null);
  assert.equal(f.store.map.size,0);
  assert.equal(f.posts(),1);
  await f.api.act('refresh');
  assert.match(f.root.querySelector('[data-rf-receipt-panel]').textContent,/原操作已確認/);

  f.setMode('lost');
  const next=f.draft();
  await assert.rejects(f.api.postOwned(next));
  f.paint();
  assert.match(f.root.querySelector('[data-rf-receipt-panel]').textContent,/有寫入結果待確認/);
  assert.equal(f.root.querySelector('.rf-receipt-reference code').textContent,next.operationId);
  assert.equal(f.button('receipt-minimize'),null);
  assert.equal(f.posts(),2);
});

void test('FQC routine approval can collapse a missing receipt without unlocking review',async()=>{
 const f=manualUI(), live=f.api.getData(), doc=live.control.documents[0];
 doc.owner={id:live.identity.id,name:'TEST ONLY'};
 doc.createdAt='2026-11-19T00:00:00Z';
 dirty(f);
 const command=f.draft();
 f.setMode('lost');
 await assert.rejects(f.api.postOwned(command));
 const retainedInput=inputs(f);
 live.identity.role='admin';
 const pending={id:'synthetic-pending',actor:{id:live.identity.id,name:'TEST ONLY'},status:'pending',
  content:doc.flow.saved.content,at:'2026-11-19T00:00:00Z'};
 doc.flow.cases.push(pending);
 doc.flow.pendingId=pending.id;
 f.api.s.reviewPlatform=true;
 f.api.s.reviewModule='FQC';
 f.api.s.selected=doc.id;
 f.api.s.reviewCase=pending.id;
 f.paint();

 assert.match(f.root.textContent,/請先查原操作收據，再確認這筆 FQC 案件/);
 assert.equal(f.button('approve').disabled,true);
 await f.button('retry').click();
 assert.match(f.root.querySelector('[data-rf-receipt-panel]').textContent,/目前查無原操作收據/);
 await f.button('receipt-minimize').click();
 assert.match(f.root.querySelector('.rf-receipt-compact').textContent,/有 1 筆操作待查證/);
 assert.equal(f.button('approve').disabled,true);
 assert.deepEqual(f.methods(),['POST','GET','GET']);
 assert.equal(f.api.s.retry.operationId,command.operationId);
 assert.equal(f.store.map.size,2);
 assert.equal([...f.store.map.values()].filter(value=>value==='missing').length,1);
 assert.equal(inputs(f),retainedInput);
});

void test('durable collapse belongs to a single operation and verified readback removes its preference',async()=>{
 const f=manualUI();
 f.setMode('commit-lost');
 f.alterReceipt(()=>({}));
 const original=f.draft();
 await assert.rejects(f.api.postOwned(original));
 f.setMode('receipt404');
 await f.api.act('retry');
 await f.button('receipt-minimize').click();
 const key=[...f.store.map.keys()].find(name=>name.startsWith('routine-fqc-receipt-collapsed-v1:'));
 assert(key);
 const other=manualUI();
 other.store.map.set(key,'missing');
 other.setMode('lost');
 const next=other.draft();
 assert.notEqual(next.operationId,original.operationId);
 await assert.rejects(other.api.postOwned(next));
 other.paint();
 assert.equal(other.root.querySelector('.rf-receipt-compact'),null);
 assert.match(other.root.querySelector('[data-rf-receipt-panel]').textContent,/有寫入結果待確認/);

 f.setMode('ok');f.alterReceipt(value=>value);
 await f.api.postOwned(f.api.s.retry);
 assert.equal(f.store.map.get(key),'missing','terminal lookup alone preserves the original fence');
 await f.api.read();
 assert.equal(f.store.map.has(key),false);
 assert.equal(f.api.s.retry,null);
 assert.equal(f.posts(),1);
});
