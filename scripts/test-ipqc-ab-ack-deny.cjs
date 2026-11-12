/* Actual AB local Save, shared transport, browser and handlers; synthetic SQLite/R2 only. */
process.chdir(require('node:path').resolve(__dirname,'..'));
const assert=require('node:assert/strict');
void(async()=>{
 const {fixture,writes}=await import('../tests/ab-local-save-fixture.mjs');
 async function isolated(run,options={}){const cleanups=[];try{const s=await fixture({after:fn=>cleanups.push(fn)},options);await run(s);}finally{for(const close of cleanups.reverse())await close();}}
 for(const lang of ['zh','vi'])await isolated(async s=>{
  await s.edit('standard','Confirmed local Save / Việt');let deny=true;
  s.intercept(r=>deny&&writes(s).some(post=>post.status===200&&post.body?.command?.action==='save')&&r.method==='GET'&&new URL(r.url,'https://fixture').pathname==='/api/ipqc-ab'?{status:403,json:{error:'FORBIDDEN'}}:null);
  await s.apiSave();const current=await s.state(),posts=writes(s);assert.equal(posts.length,1);assert.equal(posts[0].status,200);
  assert.equal((await s.group()).control.workflow.working.items[0].standard,'Confirmed local Save / Việt');
  assert.equal(current.accessBlocked.status,403);assert(current.privateQuarantine);assert.equal(current.localScopes.length,0);
  assert.match(await s.page.locator('body').innerText(),lang==='vi'?/Đã lưu/:/已儲存/,'confirmed Save must not be reported as a failed write');
  assert.equal(current.lastCommandAcknowledgement.result.receipt.operationId,posts[0].body.command.operationId);
  assert.equal(current.lastCommandAcknowledgement.action,'save');assert.equal(current.lastCommandAcknowledgement.actor.id,'preview-editor');
  assert.equal(await s.page.locator('#ab-standard').count(),0,'denied old UI is not exposed');
  const stored=s.f.snapshot(),quarantine=current.privateQuarantine,count=s.requests.length;
  await s.apiSave();assert.equal(s.requests.length,count,'blocked Save cannot retry either reads or writes');assert.deepEqual(s.f.snapshot(),stored);
  deny=false;const held=s.hold(r=>r.method==='GET'&&new URL(r.url,'https://fixture').searchParams.has('permissions'));
  await s.page.locator('[data-ab-access-retry]').click();await held.started;assert.equal((await s.state()).accessBlocked.status,403,'partial fresh load cannot unlock editing');held.release();
  await s.page.waitForFunction(()=>!__ABTest.view().accessBlocked);assert.deepEqual((await s.state()).privateQuarantine,quarantine);assert.equal(writes(s).length,1);assert.deepEqual(s.f.snapshot(),stored);
  await s.page.evaluate(()=>__ABTest.reset());assert.equal((await s.state()).privateQuarantine,null);s.cleanErrors();
 },{lang});
 for(const missing of ['epoch-port','epoch-null','epoch-string','epoch-negative','epoch-fraction','delivery-port','delivery-null','delivery-undefined','delivery-current'])await isolated(async s=>{
  await s.edit('standard','Private input');const stored=s.f.snapshot(),count=s.requests.length;
  await s.page.evaluate(m=>{const sync=ProcessSync;if(m==='epoch-port')delete sync.identityGeneration;if(m==='epoch-null')sync.identityGeneration=()=>null;if(m==='epoch-string')sync.identityGeneration=()=> '1';if(m==='epoch-negative')sync.identityGeneration=()=> -1;if(m==='epoch-fraction')sync.identityGeneration=()=> 1.5;if(m==='delivery-port')delete sync.captureDelivery;if(m==='delivery-null')sync.captureDelivery=()=>null;if(m==='delivery-undefined')sync.captureDelivery=()=>undefined;if(m==='delivery-current')sync.isCurrentDelivery=()=>false;},missing);
  let result;try{result=await s.apiSave();}catch(error){assert.match(error.message,/APPROVED_HISTORY_READ_ONLY/);result=null;}assert.equal(result,null,missing);assert.equal(s.requests.length,count,missing+' must not dispatch GET or POST');assert.equal(writes(s).length,0);assert.deepEqual(s.f.snapshot(),stored);assert.equal((await s.entry()).snapshot.items[0].standard,'Private input');s.cleanErrors();
 });
 console.log(JSON.stringify({status:'PASS_LOCAL_QUARANTINE',ackRetained:true,noRetryMutation:true,savedDraftRetained:true,blockedUntilCompleteFreshLoad:true,ackLanguages:2,missingOwnerCases:9,limits:'Actual Chromium/module Save/shared client/handlers with synthetic SQLite/R2; no live data or physical-device claim.'}));
})().catch(error=>{console.error(error);process.exitCode=1;});
