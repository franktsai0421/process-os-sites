import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{fixture:transferFixture}=require('../scripts/test-routine-equipment-transfer-intent.cjs'),{fixture:equipmentFixture}=require('../scripts/equipment-atomic-fixture.cjs'),fqcFixture=require('../scripts/fqc-apply-fixture.cjs'),{fixture:fqcUI}=require('../scripts/test-fqc-feedback-races.cjs');
const tick=()=>new Promise(setImmediate),deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
for(const moduleId of ['fqc','iqc','ipqc-ab','ipqc-c'])for(const mode of ['slow','failed','departure'])void test(`${moduleId} confirmed transfer paints before ${mode} reference refresh; duplicate action stays inert`,async()=>{
 const f=await transferFixture({moduleId}),raw=f.c.fetch,gate=deferred(),started=deferred();let refreshing=false;
 f.c.fetch=async(url,options={})=>{
  if(refreshing&&String(url).startsWith('/api/quality-equipment-replacement')){started.resolve();await gate.promise;if(mode==='failed')throw Error('SYNTHETIC_REFRESH_FAILED');}
  const response=await raw(url,options);if(options.method==='POST'&&JSON.parse(options.body).command)refreshing=true;return response;
 };
 await f.execute();await started.promise;
 const key=moduleId==='ipqc-ab'?'ipqcAB':moduleId==='ipqc-c'?'ipqcC':moduleId,dialog=f.test.dialog;
 assert.equal(dialog.moduleStatus[key],'success');assert.equal(dialog.refreshing,true);assert.match(f.host.innerHTML,/已套用 1/);assert.match(f.host.innerHTML,/關聯資料更新中/);
 const posts=f.writes().length;await f.execute();assert.equal(f.writes().length,posts);
 if(mode==='departure')f.test.replaceDialog();gate.resolve();for(let i=0;i<10;i++)await tick();
 assert.equal(dialog.moduleStatus[key],'success');assert.equal(f.writes().length,posts);
 if(mode==='failed'){assert.match(dialog.previewError,/SYNTHETIC_REFRESH_FAILED/);assert.match(f.host.innerHTML,/已套用 1/);}
});
for(const language of ['zh','vi'])void test(`FQC none -> batch reveals default AQL and reports required value, saves valid rule once (${language})`,async()=>{
 const f=await fqcFixture();try{
  const peer=f.realm();await peer.client.begin();const boot=await(await f.call('/api/fqc/workflow?caseMetadata=1')).json(),ui=await fqcUI({initialControl:boot.control,identityUser:{id:'editor',name:'Synthetic editor',role:'staff'},send:(url,options)=>f.call(url,options)});
  ui.doc.documentElement.lang=language;ui.c.__fqcTest.openItemModal('item');const form=ui.doc.querySelector('.fqc-item-form'),cadence=form.querySelector('#fqc-rule-cadence'),kind=form.querySelector('#fqc-batch-kind'),aql=form.querySelector('#fqc-batch-aql-wrap');
  // The synthetic DOM does not implement native select defaults.
  kind.value='aql';form.querySelector('#fqc-time-frequency').value='monthly';form.querySelector('[name="toolType"]').value='visual';
  assert.match(aql.getAttribute('style'),/display:none/);cadence.value='batch';cadence.onchange();assert.equal(aql.style.display,'');
  await form.onsubmit({preventDefault(){},target:form});assert(form.isConnected);assert.match(form.querySelector('[data-field-error="aqlValue"]').textContent,/AQL/);assert.equal(ui.requests.filter(r=>r.method==='POST').length,0);
  form.querySelector('#fqc-batch-aql').value='0.4';await form.onsubmit({preventDefault(){},target:form});assert.equal(form.isConnected,false);await ui.c.__fqcTest.sharedAction('save');
  const saved=(await f.state()).workflow.saved.content.items[0];assert.equal(saved.rule.cadence,'batch');assert.equal(saved.rule.batchKind,'aql');assert.equal(saved.rule.aqlValue,'0.4');assert.equal(ui.requests.filter(r=>r.method==='POST').length,1);
 }finally{f.close();}
});
void test('equipment shared status distinguishes persisted, local, saving and applied-unsaved; provisional categories retain stable ID after allocation',async()=>{
 const h=await equipmentFixture();try{
  const f=await h.connect();assert(await f.test.writeShared('save'));assert.match(f.host.querySelector('#routine-shared-status').textContent,/已持久化/);
  f.test.working.categories.push({id:'synthetic-new-category',code:'C02',name:'Local provisional'});f.test.render();assert.match(f.host.innerHTML,/暫編；存取時由伺服器分配/);assert.match(f.host.querySelector('#routine-shared-status').textContent,/本地/);
  // Reserve C02 in isolated historical metadata; never renumber old data.
  await h.mutate(values=>{const c=JSON.parse(values.routineEquipmentControl);c.reservedCategoryCodes=['C01','C02'];values.routineEquipmentControl=JSON.stringify(c);});
  const original=f.c.fetch,gate=deferred(),started=deferred();f.c.fetch=async(url,options={})=>{if(options.method==='POST'&&JSON.parse(options.body).command?.action==='save'){started.resolve();await gate.promise;}return original(url,options);};
  const saving=f.test.writeShared('save');await started.promise;assert.match(f.host.querySelector('#routine-shared-status').textContent,/儲存／處理中/);await f.test.writeShared('save');gate.resolve();assert(await saving);
  const row=(await h.state()).workflow.working.categories.find(r=>r.id==='synthetic-new-category');assert.equal(row.code,'C03');assert.match(f.host.querySelector('#routine-shared-status').textContent,/已持久化/);assert(!f.host.innerHTML.includes('暫編；存取時由伺服器分配'));
  await h.command('routine-equipment','apply',{patches:[{op:'set',path:['categories',{id:row.id},'name'],value:'Peer applied'}],guards:[{path:['categories',{id:row.id},'name'],value:row.name}]});await f.test.read();f.test.render();assert.match(f.host.querySelector('#routine-shared-status').textContent,/尚未儲存/);
 }finally{h.close();}
});
