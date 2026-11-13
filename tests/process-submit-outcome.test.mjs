// Production UI/transport/ledger and signed routes; synthetic DOM, SQLite/R2 only.
import test from 'node:test';
import assert from 'node:assert/strict';
import {setup, wid} from './canvas-approved-history-fixture.mjs';
async function ready(f){
 for(const [id,timer] of f.timers)if(timer.ms===0){f.timers.delete(id);timer.fn();}
 const deadline=Date.now()+5000;
 do{await new Promise(r=>setTimeout(r,10));}while(/內容驗證中|Đang kiểm tra nội dung/.test(f.root.textContent)&&Date.now()<deadline);
 assert.doesNotMatch(f.root.textContent,/內容驗證中|Đang kiểm tra nội dung/,'owned content inspection settled');
}
const button=(f,action)=>f.doc.querySelector('[data-av3="'+action+'"]');
async function save(f,changed=false){
 if(changed)f.canvas.edit(wid,'A-CUT',[{id:'one',f:'name',value:'Synthetic substantive change'}]);
 assert.equal(await f.api.save(),true);await ready(f);
 assert.equal(button(f,'submit').disabled,false);
}
async function submit(f){f.box.state.editorByCategory['G:A']||=structuredClone(f.api.flow().working.workspaces[0].stages);f.box.alert=()=>{};f.box.VersionDraftUI.confirmSubmit=async()=> 'Synthetic review';await button(f,'submit').click();await ready(f);}
const posts=f=>f.calls.filter(c=>c.method==='POST');
for(const lang of ['zh','vi'])for(const inline of [false,true])void test(`confirmed no-change rejection remains actionable ${lang}/${inline}`,async t=>{
 const f=await setup({lang,inline});t.after(f.close);f.box.ProcessEditorV2.departure.inspect=()=>({state:'clean',hasDialog:false});await save(f);
 const before=f.f.row(),disk=[...f.f.objects],saved=f.api.flow().saved.id,count=posts(f).length;
 await submit(f);
 assert.equal(posts(f).length,count+1);assert.deepEqual(f.f.row(),before);assert.deepEqual([...f.f.objects],disk);
 assert.equal(f.api.flow().pendingId,null);assert.equal(f.api.flow().saved.id,saved);
 assert.equal(f.box.sharedDraftAccountState().unknown,false);assert.equal(f.box.sharedDraftAccountState().failed,false);
 assert.doesNotMatch(f.doc.querySelector('[data-vd-sync]').textContent,/結果未知|同步失敗|Kết quả chưa rõ|lỗi đồng bộ/);
 assert.match(f.root.textContent,lang==='vi'?/không có thay đổi thực chất/:/沒有實質變更/);
 assert.equal(button(f,'save').disabled,false);assert.equal(button(f,'submit').disabled,false);
 assert.equal(f.api.canMutate(),true);assert.equal(f.api.navigation.departure.inspect().state,'clean');
 await f.api.load();await ready(f);assert.equal(f.box.sharedDraftAccountState().unknown,false);
 await save(f,true);await submit(f);assert.ok(f.api.flow().pendingId);assert.equal(f.api.canMutate(),false);
 f.box.VersionDraftUI.confirmReview=async()=>({reason:'Synthetic withdraw'});await button(f,'withdraw').click();await ready(f);
 assert.equal(f.api.flow().pendingId,null);assert.equal(f.api.flow().saved.id,f.api.flow().cases.at(-1).savedId);
 assert.equal(f.api.canMutate(),true);await submit(f);assert.ok(f.api.flow().pendingId);
 assert.deepEqual(f.api.flow().cases.map(c=>c.status),['approved','withdrawn','pending']);
});

for(const failure of ['denied','read','unknown','ack-only','slow'])void test('submission outcome boundary: '+failure,async t=>{
 let armed=false,release,entered,lookup=true;
 const held=new Promise(r=>release=r),arrived=new Promise(r=>entered=r);
 const f=await setup({intercept:async(url,o,send)=>{
  if(!armed)return send();
  if(failure==='read'&&o.method!=='POST'&&!url.includes('operationId='))return Response.json({error:'WORKFLOW_LOAD_FAILED'},{status:503});
  const cmd=o.body&&JSON.parse(o.body).command;
  if(cmd?.action==='submit'){
   if(failure==='denied')return Response.json({error:'FORBIDDEN'},{status:403});
   const response=await send();assert.equal(response.status,200);
   if(failure==='slow'){entered();await held;}
   if(failure==='unknown')throw Error('Synthetic response lost after commit');
   if(failure==='ack-only'){const body=await response.json();delete body.control;delete body.liveContent;delete body.wireVersion;return Response.json(body);}
   return response;
  }
  if(failure==='unknown'&&url.includes('operationId=')&&lookup)return Response.json({error:'OPERATION_NOT_FOUND'},{status:404});
  return send();
 }});t.after(f.close);f.box.ProcessEditorV2.departure.inspect=()=>({state:'clean',hasDialog:false});await save(f,true);armed=true;
 const before=posts(f).length;
 if(failure==='read'){
  await f.api.load();assert.equal(f.box.sharedDraftAccountState().unknown,false);
  assert.doesNotMatch(f.doc.querySelector('[data-vd-sync]').textContent,/結果未知|同步失敗/);
  assert.match(f.doc.querySelector('[data-vd-sync]').textContent,/讀取未完成/);return;
 }
 if(failure==='slow'){
  const submitting=submit(f);await arrived;
  assert.match(f.doc.querySelector('[data-vd-sync]').textContent,/處理中/);
  await button(f,'submit').click();assert.equal(posts(f).length,before+1);
  release();await submitting;
 }else await submit(f);
 assert.equal(posts(f).length,before+1);
 if(failure==='denied'){
  assert.equal(f.api.flow().pendingId,null);assert.equal(f.box.sharedDraftAccountState().unknown,false);
  assert.match(f.doc.querySelector('[data-vd-sync]').textContent,/操作遭拒/);return;
 }
 if(failure==='unknown'){
  assert.equal(f.box.sharedDraftAccountState().unknown,true);
  assert.match(f.doc.querySelector('[data-vd-sync]').textContent,/結果未知/);
  const marker=[...f.session.data];await f.api.load();await button(f,'retry').click();
  assert.deepEqual([...f.session.data],marker);assert.equal(posts(f).length,before+1);
  // A genuine new JS realm shares only original session storage, signed identity
  // and the server fixture. Recovery must query that exact ID, never POST again.
  const {default:vm}=await import('node:vm'),{readFileSync}=await import('node:fs'),{webcrypto}=await import('node:crypto');
  const window={ProcessSync:f.box.ProcessSync};
  vm.runInNewContext(readFileSync('public/process/shared-draft-client.js','utf8'),{window,document:{documentElement:{lang:'zh'}},sessionStorage:f.session,fetch:f.box.fetch,crypto:webcrypto,AbortController,setTimeout,clearTimeout,URL,URLSearchParams,console});
  const c=window.createSharedDraftClient({endpoint:'/api/process-authoring/workflow?caseMetadata=1',actorId:f.f.user.id,headers:()=>f.f.headers,durableBegin:true});
  assert.equal(c.hasUnknown(),true);await assert.rejects(c.retryUnknown(),e=>e.status===404);
  assert.deepEqual([...f.session.data],marker);lookup=false;
  const result=await c.resolveUnknown(),persisted=JSON.parse((await f.f.decoded()).processAuthoringControl);
  assert.equal(result.receipt.caseId,persisted.workflow.pendingId);assert.equal(c.hasUnknown(),false);
  assert.equal(posts(f).length,before+1);assert.equal(persisted.workflow.cases.filter(c=>c.status==='pending').length,1);return;
 }
 assert.ok(f.api.flow().pendingId);assert.equal(f.api.canMutate(),false);assert.equal(f.box.sharedDraftAccountState().unknown,false);
 assert.doesNotMatch(f.doc.querySelector('[data-vd-sync]').textContent,/結果未知|同步失敗/);
});
