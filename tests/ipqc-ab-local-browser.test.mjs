import test from 'node:test';
import assert from 'node:assert/strict';
import {pngFixture} from './photo-fixtures.mjs';
import {setup,writes,addError,addItem,save} from './ipqc-ab-local-browser-fixture.mjs';
for(const [width,lang]of [[1280,'zh'],[390,'vi']])void test(`AB local forms and matrix first/subsequent Save ${width} ${lang}`,async t=>{
 const s=await setup({width,lang});try{
  await addError(s);await addItem(s);const cell=s.page.locator('[data-ab-matrix-item]').first();await cell.check();assert.equal(writes(s).length,0);
  const start=performance.now();await save(s);const firstMs=performance.now()-start;assert.deepEqual(writes(s).map(r=>r.body.action||r.body.command.action),['begin-v1','save']);assert(writes(s).every(r=>r.status===200),JSON.stringify(writes(s)));
  const g=await s.f.read('ipqc-ab','editor','&scope=A%3AG');assert.equal(g.control.workflow.working.items.length,1);assert.deepEqual(g.control.workflow.working.items[0].productCodes,['A1']);
  await s.page.locator('[data-ab-matrix-item]').last().check();await s.page.locator('#ipqcab-line').selectOption('B');await s.page.locator('#ipqcab-line').selectOption('A');assert(await s.page.locator('[data-ab-matrix-item]').last().isChecked());
  const next=performance.now();await save(s);const nextMs=performance.now()-next;assert.equal(writes(s).length,3);assert.equal(writes(s)[2].body.command.action,'save');assert.equal(writes(s)[2].status,200);assert.deepEqual(s.errors,[]);
  assert(await s.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));t.diagnostic(JSON.stringify({width,lang,firstMs,nextMs,firstWrites:2,nextWrites:1,synthetic:true}));
 }finally{await s.close();}
});
for(const kind of ['begin-v1','save'])void test(`AB ${kind} lost ACK keeps marker across departure/reload; 404 never retries`,async()=>{
 const s=await setup();try{
  await addError(s);s.lose(kind);await save(s);const sent=writes(s).length;assert.equal(sent,kind==='begin-v1'?1:2);
  const pending=await s.page.evaluate(()=>({unknown:sharedDraftAccountState().unknown,keys:Object.keys(sessionStorage),status:IPQCABUI.navigation.departure.inspect()}));assert(pending.unknown);assert(pending.keys.length);assert.equal(pending.status.canAbandon,true,JSON.stringify(pending));
  await s.page.locator('[data-ab-local-query]').click();await s.page.waitForFunction(()=>!document.querySelector('[data-ab-local-query]')?.disabled);assert.equal(writes(s).length,sent);assert(await s.page.evaluate(()=>sharedDraftAccountState().unknown));
  await s.page.evaluate(async()=>{await IPQCABUI.navigation.departure.abandon();IPQCABUI.navigation.departure.closeClean();IPQCABUI.navigation.reset();});
  assert.deepEqual(await s.page.evaluate(()=>Object.keys(sessionStorage)),pending.keys);
  await s.boot();assert.equal(writes(s).length,sent);s.receipts();await s.page.locator('[data-ab-local-query]').click();await s.page.waitForFunction(()=>!sharedDraftAccountState().unknown);assert.equal(writes(s).length,sent);assert.deepEqual(s.errors,[]);
  const state=await s.f.read('ipqc-ab','editor','&module=1');assert.equal(state.control.workflow.saved!==null,kind==='save');
 }finally{await s.close();}
});
void test('AB cancel and silent departure discard only local input; edit-only may Save but not create/submit',async()=>{
 const s=await setup();let limited;try{
  await addError(s);await addItem(s);await save(s);const count=writes(s).length;
  await s.page.locator('[data-ab-edit-item]').first().click();await s.page.locator('#ab-standard').fill('cancel me');await s.page.locator('[data-ab-close]').first().click();assert.equal(writes(s).length,count);
  await s.page.locator('[data-ab-matrix-item]').first().check();await s.page.evaluate(async()=>{await IPQCABUI.navigation.departure.abandon();IPQCABUI.navigation.departure.closeClean();IPQCABUI.navigation.reset();});await s.boot();assert.equal(await s.page.locator('[data-ab-matrix-item]').first().isChecked(),false);assert.equal(writes(s).length,count);
  limited=await setup({who:'ab-only',sharedFixture:s.f});assert.equal(await limited.page.locator('#ipqcab-add-error').count(),0);assert.equal(await limited.page.locator('#ipqcab-submit:not([disabled])').count(),0);
  await limited.page.locator('[data-ab-matrix-item]').first().check();await save(limited);assert.equal(writes(limited).length,1);assert.equal(writes(limited)[0].status,200);assert.deepEqual(limited.errors,[]);
 }finally{await limited?.close();await s.close();}
});
void test('AB two browser editors merge different cells, compare same field and explicitly resolve',async()=>{
 const a=await setup();let b;try{
  await addError(a);await addItem(a);await save(a);b=await setup({who:'ab-only',sharedFixture:a.f});
  await a.page.locator('[data-ab-matrix-item]').first().check();await b.page.locator('[data-ab-matrix-item]').last().check();await save(a);await save(b);
  let group=await a.f.read('ipqc-ab','editor','&scope=A%3AG');assert.deepEqual(group.control.workflow.working.items[0].productCodes.sort(),['A1','A2']);
  await a.boot();await b.boot();for(const [s,name]of [[a,'Alice'],[b,'Bob']]){await s.page.locator('[data-ab-edit-item]').first().click();await s.page.locator('#ab-standard').fill(name);await s.page.locator('#ab-apply').click();}
  await save(a);const beforeConflict=a.f.snapshot(),beforePosts=writes(b).length;
  await save(b);const conflict=b.page.locator('[data-ab-conflict]');await conflict.waitFor();assert.equal(await conflict.locator('[data-ab-conflict-choice]').count(),3);assert.equal(writes(b).length,beforePosts,'preflight comparison does not dispatch a stale Save');assert.deepEqual(a.f.snapshot(),beforeConflict);
  await conflict.locator('[data-ab-conflict-choice="cancel"]').click();await conflict.waitFor({state:'detached'});assert.equal(writes(b).length,beforePosts);assert.deepEqual(a.f.snapshot(),beforeConflict);
  await b.page.locator('[data-ab-edit-item]').first().click();assert.equal(await b.page.locator('#ab-standard').inputValue(),'Bob','cancel retains the original private field');await b.page.locator('#ab-apply').click();assert.equal(writes(b).length,beforePosts);
  await save(b);await conflict.waitFor();await conflict.locator('[data-ab-conflict-choice="mine"]').click();await b.page.waitForFunction(()=>!sharedDraftAccountState().queued&&!document.querySelector('[data-ab-conflict]')&&!document.querySelector('#ipqcab-save')?.disabled);
  assert.equal(writes(b).length,beforePosts+1,'choosing Mine continues the same Save without another click');assert.equal(writes(b).at(-1).status,200);
  group=await a.f.read('ipqc-ab','editor','&scope=A%3AG');assert.equal(group.control.workflow.working.items[0].standard,'Bob');assert.deepEqual(group.control.workflow.working.items[0].productCodes.sort(),['A1','A2']);assert.deepEqual([...a.errors,...b.errors],[]);
 }finally{await b?.close();await a.close();}
});
void test('AB unsaved input cannot submit old snapshot; saved input submits through confirmation',async()=>{
 const s=await setup();try{
  await addError(s);await addItem(s);await save(s);const count=writes(s).length;await s.page.locator('[data-ab-matrix-item]').first().check();await s.page.locator('#ipqcab-submit').click();assert.equal(await s.page.locator('dialog[open]').count(),0);assert.equal(writes(s).length,count);
  await save(s);await s.page.locator('#ipqcab-submit').click();await s.page.locator('dialog[open] textarea').fill('Synthetic review');await s.page.locator('dialog[open] button[type=submit]').click();await s.page.waitForFunction(()=>!sharedDraftAccountState().queued&&!document.querySelector('#ipqcab-save')?.disabled);const submitted=writes(s).filter(r=>r.body.command?.action==='submit');assert.equal(submitted.length,1);assert.equal(submitted[0].status,200);assert((await s.f.read('ipqc-ab','editor','&module=1')).control.workflow.pendingId);assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});
void test('AB composition input survives language change and polling while editing; close cancels',async()=>{
 const s=await setup();try{
  await addError(s);await addItem(s);await save(s);const before=writes(s).length;
  await s.page.clock.install();await s.page.locator('[data-ab-edit-item]').first().click();const input=s.page.locator('#ab-standard');await input.dispatchEvent('compositionstart',{data:'中'});await input.fill('中文組字 Tiếng Việt');await input.dispatchEvent('compositionend',{data:'中文組字 Tiếng Việt'});
  await s.page.evaluate(()=>document.documentElement.lang='vi');assert.equal(await s.page.locator('#ab-standard').inputValue(),'中文組字 Tiếng Việt');await s.page.clock.runFor(16000);assert.equal(await s.page.locator('#ab-standard').inputValue(),'中文組字 Tiếng Việt');assert.equal(writes(s).length,before);
  await s.page.locator('[data-ab-close]').first().click();await s.page.locator('[data-ab-edit-item]').first().click();assert.equal(await s.page.locator('#ab-standard').inputValue(),'本機標準 / Tiêu chuẩn');assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});
void test('AB photo selection is local; Save uploads synthetic photo before atomic draft Save',async()=>{
 const s=await setup();try{
  await addError(s);await s.page.locator('#ipqcab-add-item').click();await s.page.locator('#ab-standard').fill('Photo check');
  await s.page.locator('[data-ab-upload=standard]').setInputFiles({name:'synthetic.png',mimeType:'image/png',buffer:Buffer.from(pngFixture({width:8,height:8}))});await s.page.locator('.ipqcab-photo-row').waitFor();await s.page.locator('#ab-apply').click();assert.equal(s.requests.filter(r=>['POST','PUT'].includes(r.method)).length,0);
  await save(s);assert.equal(s.requests.filter(r=>r.method==='PUT').length,1);assert.equal(s.requests.find(r=>r.method==='PUT').status,200);assert.equal(writes(s).length,2);const group=await s.f.read('ipqc-ab','editor','&scope=A%3AG'),photo=group.control.workflow.working.items[0].standardPhotos[0];assert.match(photo.id,/^[a-f0-9]{64}$/);assert.equal(photo.preview,undefined);assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});
void test('AB legacy group create unknown stays blocked after reload until original receipt query',async()=>{
 const s=await setup();try{
  await s.f.begin('ipqc-ab','editor',200,'&scope=A%3AG');await s.boot();s.lose('apply');
  await s.page.evaluate(async()=>{const client=createSharedDraftClient({endpoint:'/api/ipqc-ab/workflow?scope=A%3AG&caseMetadata=1',actorId:ProcessSync.identity.id,headers:()=>({'Content-Type':'application/json'}),abCreateRejections:true});const state=await client.read();const command=client.prepareCreate(state.control.workflow.generation,'create-error',{stageCode:'A-CUT',name:'Legacy uncertain'});try{await client.sendPrepared(command);}catch{/* Keep original marker, intentionally lost synthetic ACK. */}});
  assert.equal(writes(s).length,1);await s.boot();assert(await s.page.evaluate(()=>sharedDraftAccountState().unknown));assert.equal(await s.page.locator('#ipqcab-add-error').count(),0);s.receipts();await s.page.locator('[data-ab-local-query]').click();await s.page.waitForFunction(()=>!sharedDraftAccountState().unknown);assert.equal(writes(s).length,1);
  const g=await s.f.read('ipqc-ab','editor','&scope=A%3AG');assert.equal(g.control.workflow.working.errors.length,1);assert.equal(await s.page.locator('[data-ab-local-query]').count(),0);assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});
void test('AB empty local start/cancel does not initialize or Save shared state',async()=>{
 const s=await setup();try{await s.page.locator('#ipqcab-begin').click();await save(s);assert.equal(writes(s).length,0);await s.page.locator('#ipqcab-add-error').click();await s.page.locator('#ab-error-name').fill('Discard');await s.page.locator('[data-ab-close]').first().click();await save(s);assert.equal(writes(s).length,0);assert.deepEqual(s.errors,[]);}finally{await s.close();}
});
