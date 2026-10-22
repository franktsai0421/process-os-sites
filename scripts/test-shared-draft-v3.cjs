/* oxlint-disable typescript/no-require-imports -- Uses the existing isolated TS loader. */
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const load = require('./ipqc-ab-import-harness.cjs')();
const { createSharedDraft, applyDraftCommand, stableDraftJSON } = load('lib/shared-draft.ts');
const original = { items: [{ id:'item-1', name:'Kiểm tra kích thước của sản phẩm theo bản vẽ kỹ thuật đã được phê duyệt', note:'', mode:'visual', equipmentId:'', photos:[{id:'photo-1',src:'/immutable/photo-1'}] }] };
const actors = { a:{id:'editor-a',name:'Người sửa A',admin:false}, b:{id:'editor-b',name:'Người sửa B',admin:false}, c:{id:'reviewer-c',name:'Người duyệt C',admin:false}, admin:{id:'admin',name:'Admin',admin:true} };
let checks = 0;
function fixture(activeId='active-1') {
  let state = createSharedDraft('ipqc-c', original, activeId, randomUUID());
  const sequences = {};
  const context = actor => ({ actor:actors[actor], at:new Date().toISOString(),id:randomUUID,allowed:()=>true,
    activeId:state.active.id, semantic:x=>x,
    structure(content) { for(const row of content.items) if(row.mode==='visual' && row.equipmentId) throw Error('INVALID_PAIR'); },
    validate(content) { return content.items.filter(row=>!row.name.trim()).map(()=>({kind:'missing',path:['items'],message:'Tên còn thiếu'})); } });
  function command(actor, action, details={}) {return {action,operationId:randomUUID(),clientId:'client-'+actor,generation:state.generation,sequence:(sequences[actor]=(sequences[actor]||0)+1),...details};}
  function run(actor, cmd, override={}) {const result=applyDraftCommand(state,cmd,{...context(actor),...override});state=result.state;return result.receipt;}
  return {get state(){return state;}, command, run, context};
}
const field=(name,value)=>({op:'set',path:['items',{id:'item-1'},name],value});
function test(name,fn){fn();checks++;console.log('PASS '+name);}
test('T02/T03: separate fields survive; server order and old client rejection',()=>{
  const f=fixture(); const old=f.command('a','apply',{patches:[field('name','old')]});
  f.run('a',f.command('a','apply',{patches:[field('name','A')]}));
  f.run('b',f.command('b','apply',{patches:[field('note','B')]}));
  assert.equal(f.state.working.items[0].name,'A');assert.equal(f.state.working.items[0].note,'B');
  assert.throws(()=>f.run('a',old),/STALE_CLIENT_OPERATION/);
  f.run('b',f.command('b','apply',{patches:[field('name','B-last')]}));assert.equal(f.state.working.items[0].name,'B-last');
});
test('T04/T06: atomic coupled edit and dependency guard; failure leaves source untouched',()=>{
  const f=fixture(); const before=stableDraftJSON(f.state);
  assert.throws(()=>f.run('a',f.command('a','apply',{patches:[field('equipmentId','tool-1')]})),/INVALID_PAIR/);
  assert.equal(stableDraftJSON(f.state),before);
  f.run('a',f.command('a','apply',{patches:[field('mode','equipment'),field('equipmentId','tool-1')]}));
  assert.throws(()=>f.run('b',f.command('b','apply',{guards:[{path:['items',{id:'item-1'},'mode'],value:'visual'}],patches:[field('note','stale')]})),/DEPENDENCY_CHANGED/);
});
test('T07: stable IDs, delete tombstones, no stale resurrection, order guard',()=>{
  const f=fixture();const insert={op:'insert',path:['items'],value:{id:'item-2',name:'new',mode:'visual',equipmentId:''}};
  f.run('a',f.command('a','apply',{patches:[insert]}));
  f.run('b',f.command('b','apply',{patches:[{op:'order',path:['items'],ids:['item-2','item-1']}]}));
  f.run('b',f.command('b','apply',{patches:[{op:'remove',path:['items',{id:'item-2'}]}]}));
  assert.throws(()=>f.run('a',f.command('a','apply',{patches:[insert]})),/ENTITY_ID_RESERVED/);
  assert.throws(()=>f.run('a',f.command('a','apply',{patches:[{op:'set',path:['items',{id:'item-2'},'name'],value:'resurrect'}]})),/ENTITY_REMOVED/);
  assert.throws(()=>f.run('a',f.command('a','apply',{patches:[{op:'order',path:['items'],ids:[]}]})),/COLLECTION_CHANGED/);
});
test('T07: concurrent distinct inserts and guarded multiple-selection removal retain unrelated entities',()=>{
  const f=fixture();for(const [actor,id]of [['a','item-2'],['b','item-3']])f.run(actor,f.command(actor,'apply',{patches:[{op:'insert',path:['items'],value:{id,name:id,mode:'visual',equipmentId:''}}]}));
  f.run('a',f.command('a','apply',{patches:[field('products',['P1','P2','P3'])]}));const selectionPath=['items',{id:'item-1'},'products'];
  f.run('b',f.command('b','apply',{guards:[{path:selectionPath,value:['P1','P2','P3']}],patches:[field('products',['P1','P3'])]}));const before=stableDraftJSON(f.state);
  assert.throws(()=>f.run('a',f.command('a','apply',{guards:[{path:selectionPath,value:['P1','P2','P3']}],patches:[field('products',['P1','P2'])]})),/DEPENDENCY_CHANGED/);assert.equal(stableDraftJSON(f.state),before);
  f.run('b',f.command('b','apply',{patches:[{op:'order',path:['items'],ids:['item-3','item-1','item-2']}]}));assert.equal(JSON.stringify(f.state.working.items.map(row=>row.id)),JSON.stringify(['item-3','item-1','item-2']));assert.equal(JSON.stringify(f.state.working.items[1].products),JSON.stringify(['P1','P3']));
});
test('T13: valid first formal build needs a real successful Save, not a fabricated change',()=>{
  const f=fixture('');assert.throws(()=>f.run('a',f.command('a','submit',{reason:'Khởi tạo'})),/SUCCESSFUL_SAVE_REQUIRED/);f.run('b',f.command('b','save'));const saved=f.state.saved;
  f.run('a',f.command('a','submit',{savedId:saved.id,reason:'Tạo phiên bản chính thức đầu tiên'}));assert.equal(f.state.cases[0].savedId,saved.id);assert.equal(stableDraftJSON(f.state.cases[0].content),stableDraftJSON(original));f.run('c',f.command('c','approve',{caseId:f.state.pendingId}));assert.ok(f.state.active.id);assert.equal(stableDraftJSON(f.state.active.content),stableDraftJSON(original));
});
test('T08/T10: save cutoff contains all synced contributors; no empty save audit',()=>{
  const f=fixture(); f.run('a',f.command('a','apply',{patches:[field('name','A')]}));
  const cmd=f.command('b','save'); const receipt=f.run('b',cmd); const saved=stableDraftJSON(f.state.saved);
  assert.equal(f.state.saved.actor.id,'editor-b');assert.equal(Object.values(f.state.saved.contributors)[0].actor.id,'editor-a');
  assert.deepEqual(f.run('b',cmd),receipt);
  f.run('a',f.command('a','save')); assert.equal(stableDraftJSON(f.state.saved),saved);assert.equal(f.state.saves.length,1);
  f.run('a',f.command('a','apply',{patches:[field('note','after cutoff')]}));
  assert.equal(f.state.saved.content.items[0].note,'');
});
test('T11/T13/T14: saved-only submission; incomplete and unchanged are recorded advisories',()=>{
  const f=fixture();assert.throws(()=>f.run('a',f.command('a','submit',{reason:'test'})),/SUCCESSFUL_SAVE_REQUIRED/);
  f.run('a',f.command('a','save'));f.run('a',f.command('a','submit',{reason:'test',savedId:f.state.saved.id}));
  assert.equal(f.state.cases[0].contentIssues.issues[0].code,'NO_SUBSTANTIVE_CHANGE');
  f.run('a',f.command('a','withdraw',{caseId:f.state.pendingId,reason:'continue'}));
  f.run('a',f.command('a','apply',{patches:[field('name','')]}));f.run('a',f.command('a','save'));
  f.run('b',f.command('b','apply',{patches:[field('name','fixed but unsaved')]}));
  f.run('a',f.command('a','submit',{reason:'test',savedId:f.state.saved.id}));
  assert.equal(f.state.cases[1].content.items[0].name,'');assert.equal(f.state.cases[1].contentIssues.issues[0].kind,'missing');
});
function pending(f,who='a') {f.run(who,f.command(who,'apply',{patches:[field('note','changed')]}));f.run(who,f.command(who,'save'));f.run(who,f.command(who,'submit',{savedId:f.state.saved.id,reason:'Lý do thay đổi'}));return f.state.pendingId;}
test('T15/T16: saved confirmation token and pending lock (including admin)',()=>{
  const f=fixture();f.run('a',f.command('a','save'));const id=f.state.saved.id;
  f.run('b',f.command('b','apply',{patches:[field('note','B')]}));f.run('b',f.command('b','save'));
  assert.throws(()=>f.run('a',f.command('a','submit',{savedId:id,reason:'test'})),/SAVED_VERSION_CHANGED/);
  pending(f);for(const action of ['apply','save','submit','restore'])assert.throws(()=>f.run('admin',f.command('admin',action)),/PENDING_LOCKED/);
});
test('T17/T18: permission denial, authorized self-review confirmation + audit',()=>{
  const f=fixture();const id=pending(f);
  assert.throws(()=>f.run('a',f.command('a','approve',{caseId:id})),/SELF_REVIEW_CONFIRM_REQUIRED/);
  assert.throws(()=>f.run('c',f.command('c','approve',{caseId:id}),{allowed:()=>false}),/FORBIDDEN/);
  f.run('a',f.command('a','approve',{caseId:id,selfReviewConfirmed:true}));assert.equal(f.state.active.id,id);assert.equal(f.state.cases[0].result.selfReview,true);
  const g=fixture();const adminId=pending(g,'admin');
  assert.throws(()=>g.run('admin',g.command('admin','approve',{caseId:adminId})),/SELF_REVIEW_CONFIRM_REQUIRED/);
  g.run('admin',g.command('admin','approve',{caseId:adminId,selfReviewConfirmed:true}));assert.equal(g.state.cases[0].result.selfReview,true);
});
test('T19/T20/T21/T41/T42: withdraw/review race, reason, generation fence and identical resubmit',()=>{
  for(const outcome of ['withdraw','return']) {
    const f=fixture();const id=pending(f);const stale=f.command('b','save');
    assert.throws(()=>f.run('c',f.command('c',outcome,{caseId:id})),/REASON_REQUIRED/);
    f.run('c',f.command('c',outcome,{caseId:id,reason:'Cần kiểm tra lại'}));
    const historical=stableDraftJSON(f.state.cases[0]);assert.equal(f.state.pendingId,null);
    assert.throws(()=>f.run('b',stale),/STALE_GENERATION/);
    assert.throws(()=>f.run('c',f.command('c','approve',{caseId:id})),/CASE_NOT_PENDING/);
    f.run('a',f.command('a','submit',{savedId:f.state.saved.id,reason:'Xác nhận gửi lại'}));
    assert.notEqual(f.state.pendingId,id);assert.equal(stableDraftJSON(f.state.cases[0]),historical);
  }
});
test('T23/T24/T43: restore is unsaved; immutable saved/case/media history and attribution',()=>{
  const f=fixture();f.run('a',f.command('a','apply',{patches:[field('note','first')]}));f.run('b',f.command('b','save'));
  const saved=f.state.saved.id;const first=stableDraftJSON(f.state.saves[0]);
  f.run('a',f.command('a','apply',{patches:[field('note','second')]}));f.run('b',f.command('b','save'));
  assert.throws(()=>f.run('a',f.command('a','restore',{restoreSaveId:saved,expectedRevision:0})),/RESTORE_RECONFIRM/);
  f.run('a',f.command('a','restore',{restoreSaveId:saved,expectedRevision:f.state.revision}));
  assert.equal(f.state.working.items[0].note,'first');assert.equal(f.state.saved.content.items[0].note,'second');assert.equal(stableDraftJSON(f.state.saves[0]),first);
  const id=pending(f);const body=stableDraftJSON(f.state.cases[0].content);f.run('c',f.command('c','return',{caseId:id,reason:'redo'}));
  f.run('a',f.command('a','apply',{patches:[field('name','later')]}));assert.equal(stableDraftJSON(f.state.cases[0].content),body);
});
test('T33: persisted operation receipt survives serialization/restart and permission revocation',()=>{
  const f=fixture();const cmd=f.command('a','save');const receipt=f.run('a',cmd);
  const recovered=JSON.parse(JSON.stringify(f.state));assert.deepEqual(applyDraftCommand(recovered,cmd,f.context('a')).receipt,receipt);
  assert.throws(()=>applyDraftCommand(recovered,cmd,{...f.context('a'),allowed:()=>false}),/FORBIDDEN/);
  assert.throws(()=>f.run('b',cmd),/OPERATION_ID_REUSED/);
  assert.throws(()=>f.run('a',{...cmd,action:'apply'}),/OPERATION_ID_REUSED/);
});
test('Malformed and prototype paths rejected without changing the aggregate',()=>{
  const f=fixture();for(const path of [[],['__proto__','polluted'],['items','0','name'],['items',{id:'item-1'},'id']]) {
    const before=stableDraftJSON(f.state);assert.throws(()=>f.run('a',f.command('a','apply',{patches:[{op:'set',path,value:'bad'}]})));assert.equal(stableDraftJSON(f.state),before);
  }
});
test('Process advisory allowlist never bypasses technical issues or other module rules',()=>{
 const f=fixture();f.state.scope='process:platform';f.run('a',f.command('a','apply',{patches:[field('name','')] }));f.run('a',f.command('a','save'));
 const context={advisoryCodes:['NAME_REQUIRED'],validate:()=>[{kind:'missing',path:['items'],message:'NAME_REQUIRED'}]};
 assert.throws(()=>f.run('a',f.command('a','submit',{savedId:f.state.saved.id,reason:'technical'}),{...context,validate:()=>[{kind:'error',path:[],message:'SNAPSHOT_INTEGRITY_FAILURE'}]}),/VALIDATION_FAILED/);
 const receipt=f.run('a',f.command('a','submit',{savedId:f.state.saved.id,reason:'advisory'}),context),issues=structuredClone(f.state.cases[0].contentIssues.issues);
 assert.throws(()=>f.run('c',f.command('c','approve',{caseId:receipt.caseId,acknowledgedContentIssues:[]}),context),/CONTENT_ISSUES_CONFIRM_REQUIRED/);
 f.run('c',f.command('c','approve',{caseId:receipt.caseId,acknowledgedContentIssues:issues}),context);assert.equal(f.state.cases[0].result.contentIssuesConfirmed,true);assert.equal(stableDraftJSON(f.state.cases[0].contentIssues.issues),stableDraftJSON(issues));
 const q=fixture();q.run('a',q.command('a','apply',{patches:[field('name','')]}));q.run('a',q.command('a','save'));q.run('a',q.command('a','submit',{savedId:q.state.saved.id,reason:'quality'}),context);assert.equal(q.state.cases[0].contentIssues.issues[0].kind,'missing');
 assert.throws(()=>q.run('a',q.command('a','save',{expectedRevision:q.state.revision-1})),/DRAFT_REVISION_CHANGED_RECONFIRM/);
});
console.log(JSON.stringify({suite:'V3 transition kernel only; not HTTP/browser acceptance',checks,result:'PASS'}));
