import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomBytes,randomUUID} from 'node:crypto';
import fs from 'node:fs';
const out=process.env.EQUIPMENT_TEST_REPORT;
import {chromium} from 'playwright';
import {createABCFixture} from './ab-c-native-fixture.mjs';
const require=createRequire(import.meta.url);
const {createTransferFixture}=require('../scripts/equipment-transfer-fixture.cjs');
const seed=await createTransferFixture({paired:true,secondABGroup:true});
let values,objects;
try{values=(await seed.core.readState()).values;objects=new Map(seed.objects);}finally{seed.close();}
const pass=randomBytes(24).toString('hex');
const keys=['masterDataControl','processMasterData','routineEquipmentControl','qualityMasterControl','iqcMasterControl','ipqcCMasterControl','ipqcABMasterControl'];
const dbkey={fqc:'qualityMasterControl',iqc:'iqcMasterControl','ipqc-ab':'ipqcABMasterControl','ipqc-c':'ipqcCMasterControl'};
const results=[];
const f=await createABCFixture({products:1,async decorate(v,load,bucket){
 const users=JSON.parse(v.platformUsers),owner=users.find(u=>u.primary);
 owner.passwordHash=await load('lib/passwords.ts').passwordHash(pass);
 users.push({...owner,id:'synthetic-peer',name:'Synthetic peer',primary:false});
 v.platformUsers=JSON.stringify(users);
 for(const k of keys)v[k]=values[k];
 // Exercise both supported closed states. Desktop preserves the native workflow
 // following approval. Mobile starts with approved versions predating shared drafts.
 if(process.env.EQUIPMENT_TEST_LANGUAGE!=='zh'){
  for(const [module,key] of Object.entries(dbkey)){
   const control=JSON.parse(v[key]);
   if(module==='ipqc-ab'){delete control.moduleDraft;delete control.scopes['A:G-A'].workflow;}
   else delete (module==='fqc'?control.libraries.fqc:control).workflow;
   v[key]=JSON.stringify(control);
  }
 }
 for(const [k,b] of objects)await bucket.put(k,b);
}});
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,headless:true});
try{
 const origin=f.url.origin;
 async function signIn(id){
  const language=process.env.EQUIPMENT_TEST_LANGUAGE==='zh'?'zh':'vi';
  const ctx=await browser.newContext({baseURL:origin,serviceWorkers:'block',viewport:language==='zh'?{width:1280,height:900}:{width:390,height:844}});
  await ctx.addInitScript(lang=>localStorage.setItem('processUILanguage',lang),language);await ctx.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
  const p=await ctx.newPage();p.setDefaultTimeout(25000);p.on('dialog',d=>d.accept());
  await p.goto('/login');await p.getByLabel('帳號 / Tài khoản',{exact:true}).fill(id);await p.getByLabel('密碼 / Mật khẩu',{exact:true}).fill(pass);
  const logged=p.waitForResponse(r=>new URL(r.url()).pathname==='/api/platform-login'&&r.request().method()==='POST');
  await p.getByRole('button',{name:'登入平台 / Đăng nhập'}).click();assert.equal((await logged).status(),200);
  await p.waitForURL(url=>url.pathname.startsWith('/process/'));return {ctx,p,id};
 }
 const operator=await signIn('frank'),peer=await signIn('synthetic-peer');
 let seq=0;
 async function storage(m,key='A:G-A'){
  const r=await f.db.prepare('SELECT revision,"values" FROM shared_state WHERE id=1').first();
  const payload=await f.load('lib/state-records.ts').decodeRecordValues(await f.mf.getR2Bucket('STATE_ARCHIVE'),JSON.parse(r.values));
  const ctl=JSON.parse(payload.values[dbkey[m]]);
  const mod=m==='fqc'?ctl.libraries.fqc:m==='ipqc-ab'?ctl.moduleDraft:ctl;
  const group=m==='ipqc-ab'?ctl.scopes[key]:mod;
  return {rev:r.revision,module:mod?.workflow,group:group.workflow,formal:group.versions.find(v=>v.id===group.activeVersionId)};
 }
 async function api(user,m,scope,body){
  const query='?caseMetadata=1'+(m==='ipqc-ab'?(scope?'&scope='+encodeURIComponent(typeof scope==='string'?scope:'A:G-A'):'&module=1'):'');
  const res=await user.ctx.request.post('/api/'+m+'/workflow'+query,{headers:{Origin:origin,'X-Process-Expected-Actor':user.id},data:body});
  const data=await res.json();assert.equal(res.status(),200,m+' '+(body.action||body.command?.action)+' '+JSON.stringify(data.error));return data;
 }
 async function cmd(user,m,scope,action,detail={}){
  const st=await storage(m,typeof scope==='string'?scope:'A:G-A'),flow=scope?st.group:st.module;
  return api(user,m,scope,{command:{action,operationId:randomUUID(),generation:flow.generation,clientId:'scope-proof-'+user.id,sequence:++seq,expectedRevision:flow.revision,input:{stateRevision:st.rev},...detail}});
 }
 const contentRows=x=>(x.scopes?.['A:G-A']||x).items;
 async function field(m,id,key,value,scope=true){
  const st=await storage(m,typeof scope==='string'?scope:'A:G-A'),current=st.group.working.items.find(r=>r.id===id)[key],path=['items',{id},key];
  await cmd(peer,m,scope,'apply',{patches:[{op:'set',path,value}],guards:[{path,value:current}]});
 }
 async function modal(m,source='source',target='target',pickId=null){
  const p=operator.p;
  await p.goto('/process/?system=quality&view=data&dataTab=quality-routine-equipment');
  await p.locator('[data-node-select="category"]').first().click();await p.locator('[data-node-select="subcategory"]').first().click();
  if(await p.locator('[data-node-select="group"]').count())await p.locator('[data-node-select="group"]').first().click();
  await p.locator('[data-equipment-transfer="'+source+'"]').click();
  const code={'ipqc-ab':'ipqcAB','ipqc-c':'ipqcC'}[m]||m;
  const checks=p.locator('[data-transfer-check="'+code+'"]');await checks.first().waitFor({state:'attached'});
  if(!(await checks.first().isVisible()))await p.locator('[data-transfer-extra="'+code+'"] > summary').click();
  const ids=await checks.evaluateAll(boxes=>boxes.map(b=>b.value));
  const chosen=pickId?ids.findIndex(x=>x.includes(pickId)):0;assert(chosen>=0);
  for(let i=0;i<ids.length;i++) {
    const box=checks.nth(i);
    if(!(await box.isVisible()))continue;
    if(i===chosen)await box.check();else await box.uncheck();
  }
  await p.locator('#routine-target-eq-select').selectOption(target);
  return {choice:ids[chosen],click:async()=>{
   const ack=p.waitForResponse(r=>new URL(r.url()).pathname==='/api/'+m+'/workflow'&&r.request().method()==='POST'&&r.request().postDataJSON()?.command?.action==='save');
   await p.locator('#routine-confirm-transfer-'+m).click();assert.equal((await ack).status(),200);await p.locator('.routine-transfer-mod-msg').filter({hasText:/已移轉並存取草稿|Đã chuyển và lưu bản nháp/}).first().waitFor();
  }};
 }

 const p=operator.p;
 for(const m of ['fqc','iqc','ipqc-ab','ipqc-c']){
  const events=[];const watch=r=>{if(r.method()==='POST'&&new URL(r.url()).pathname==='/api/'+m+'/workflow')events.push(r.postDataJSON());};p.on('request',watch);
  const msg=regex=>p.locator('.routine-transfer-mod-msg').filter({hasText:regex}).first().waitFor({timeout:9000});
  const click=()=>p.locator('#routine-confirm-transfer-'+m).click();
  const block=async(reason)=>{await click();try{await msg(reason);}catch(e){console.error('DISPLAY',m,await p.locator('.routine-transfer-mod-msg').allTextContents());throw e;}};
  const none=await storage(m);
  if(process.env.EQUIPMENT_TEST_LANGUAGE!=='zh')assert.equal(none.module,undefined);
  await modal(m);console.log('OPENING',m);
  // Deliver exactly one real Save to the Worker, then drop its HTTP response.
  await p.evaluate(moduleId=>{
    const nativeFetch=window.fetch;let unavailable=false;
    window.fetch=async function(input,options){
      const url=new URL(input instanceof Request?input.url:input,location.href);
      if(unavailable&&url.pathname==='/api/'+moduleId+'/workflow'&&url.searchParams.has('operationId'))throw new TypeError('SYNTHETIC_RECEIPT_OFFLINE_UNTIL_RELOAD');
      const response=await nativeFetch.call(this,input,options);
      if(new URL(response.url).pathname==='/api/'+moduleId+'/workflow'&&options?.method==='POST'&&JSON.parse(options.body).command?.action==='save'){
        await response.arrayBuffer();unavailable=true;
        throw new TypeError('SYNTHETIC_LOST_SAVE_RESPONSE');
      }
      return response;
    };
  },m);
  const firstResponse=p.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname==='/api/'+m+'/workflow'&&r.request().postDataJSON()?.command?.action==='save');
  await click();const delivered=await firstResponse;assert.equal(delivered.status(),200);console.log('COMMITTED',m);
  const committed=await delivered.json();assert(committed.receipt?.savedId);
  try{await msg(/SYNTHETIC|尚未確認|待確認|chưa xác nhận|Chưa xác nhận|UNKNOWN/i);}
  catch(e){console.error('AFTER LOST',m,await p.locator('.routine-transfer-mod-msg').allTextContents());throw e;}
  const lookups=[];const observe=r=>{if(new URL(r.url()).searchParams.get('operationId')===committed.receipt.operationId)lookups.push(r);};
  p.on('response',observe);
  try{
    await modal(m);console.log('REOPENED',m);await click();await msg(new RegExp(committed.receipt.savedId));
  }catch(e){console.error('RECOVERY',m,new URL(p.url()).pathname,await p.locator('.routine-transfer-mod-msg').allTextContents(),
    await p.locator('body').innerText().then(t=>t.slice(0,550)),lookups.map(r=>r.status()));throw e;}
  p.off('response',observe);assert(lookups.length);const looked=lookups[0];assert.equal(looked.status(),200);
  const proof=await looked.json();assert.equal(proof.receipt.savedId,committed.receipt.savedId);
  assert.equal(proof.receipt.generation,committed.receipt.generation);
  await msg(new RegExp(committed.receipt.savedId));
  const first=await storage(m);assert.equal(first.rev,none.rev+1);assert.deepEqual(first.formal,none.formal);
  assert.deepEqual(first.module.cases,none.module?.cases??[]);
  assert.equal(contentRows(first.module.saved.content)[0].equipmentId,'target');
  assert.equal(first.module.saved.id,committed.receipt.savedId);assert.equal(first.module.generation,committed.receipt.generation);
  assert.equal(events.length,1);assert.equal(events[0].command.equipmentTransferOpen,true);
  const url='/api/'+m+'/workflow?caseMetadata=1'+(m==='ipqc-ab'?'&module=1':'');
  const peerRead=await peer.ctx.request.get(url,{headers:{'X-Process-Expected-Actor':peer.id}});
  assert.equal(peerRead.status(),200);const independent=await peerRead.json();
  assert.equal((independent.control?.workflow??independent.workflow).saved.id,first.module.saved.id);
  const recovery={module:m,firstWorkflowAdoption:!none.module,openingPosts:events.length,receiptReads:lookups.length,
    committed:{operationId:committed.receipt.operationId,savedId:committed.receipt.savedId,generation:committed.receipt.generation},
    afterReload:{operationId:proof.receipt.operationId,savedId:proof.receipt.savedId,generation:proof.receipt.generation},
    independentSavedId:(independent.control?.workflow??independent.workflow).saved.id,committedRevisions:first.rev-none.rev};
  assert.deepEqual(recovery.committed,recovery.afterReload);
  if(process.env.EQUIPMENT_FIRST_RECEIPT_ONLY==='1'){
   results.push(recovery);if(out)fs.writeFileSync(out,JSON.stringify(results,null,2));p.off('request',watch);continue;
  }
  await (await modal(m,'target','source')).click();
  if(m==='ipqc-ab'){await api(peer,m,'A:G-OTHER',{action:'begin'});}
  const st=await storage(m),[one,two]=st.group.working.items;
  const key={fqc:'description',iqc:'nameVi','ipqc-ab':'standard','ipqc-c':'description'}[m];
  await field(m,two.id,key,'saved-peer-note');await cmd(peer,m,false,'save');
  const clean=await storage(m);const original=clean.module.saved;const official=clean.formal;
  const afterSaved=await modal(m);assert(afterSaved.choice.includes(one.id));
  const targetScope=m==='ipqc-ab'?'A:G-OTHER':true;
  const peerGroup=await storage(m,typeof targetScope==='string'?targetScope:'A:G-A'),peerId=peerGroup.group.working.items[1].id;
  await field(m,peerId,key,'working-peer-note',targetScope);
  const dirty=await storage(m),n=events.length;
  await block(/草稿或資料修訂|đã thay đổi/);
  assert.equal(events.length,n);assert.deepEqual(await storage(m),dirty);
  assert.deepEqual(dirty.module.saved,original);
  // A refreshed preview deliberately saves the peer's applied edits in the same native Save.
  const cleanStart=events.length;await (await modal(m)).click();const replaced=await storage(m);
  assert.deepEqual(events.slice(cleanStart).map(e=>e.command?.action),['save']);
  assert.deepEqual(replaced.formal,official);assert.deepEqual(replaced.module.cases,clean.module.cases);
  assert.equal(contentRows(replaced.module.saved.content)[0].equipmentId,'target');assert.equal(contentRows(replaced.module.saved.content)[1].equipmentId,'source');
  if(m==='ipqc-ab')assert.equal(replaced.module.saved.content.scopes['A:G-OTHER'].items[1][key],'working-peer-note');else assert.equal(contentRows(replaced.module.saved.content)[1][key],'working-peer-note');
  const count=events.length;await modal(m);await click();await msg(/無需重存|không cần lưu lại/);assert.equal(events.length,count);assert.deepEqual(await storage(m),replaced);
  await (await modal(m,'target','source')).click();assert.equal(contentRows((await storage(m)).module.saved.content)[0].equipmentId,'source');
  await (await modal(m)).click();await modal(m,'target','source');
  // Two legitimate peer requests change B away, then restore B. Values match; revision differs.
  const originalTool=(await storage(m)).group.working.items[0].tool;
  const setEq=async id=>{const cur=(await storage(m)).group.working.items[0];const mode=id?'equipment':'visual';
    const values={equipmentId:id,...(m==='fqc'?{tool:id?originalTool:''}:['iqc','ipqc-ab'].includes(m)?{inspectionMode:mode}:{})};
    const patches=Object.entries(values).map(([k,value])=>({op:'set',path:['items',{id:cur.id},k],value}));
    await cmd(peer,m,true,'apply',{patches,guards:patches.map(p=>({path:p.path,value:cur[p.path[2]]}))});};
  await setEq('');await setEq('target');const aba=await storage(m);const abac=events.length;await block(/草稿或資料修訂|尚未存取|đã thay đổi|chưa lưu/);assert.equal(events.length,abac);assert.deepEqual(await storage(m),aba);
  const staleCount=events.length;await modal(m,'target','source');await block(/無法證明|Không thể xác nhận/);
  assert.equal(events.length,staleCount);assert.deepEqual(await storage(m),aba);
  // An ordinary no-op Save may retain working contributor stamps. The peer
  // explicitly finishes a substantive edit through the native Save.
  await field(m,peerId,key,'peer-explicitly-resolved',targetScope);await cmd(peer,m,false,'save');
  await modal(m,'target','source');const reopen=(await storage(m)).rev;await block(/無法證明|Không thể xác nhận/);assert.equal((await storage(m)).rev,reopen);
  // Hold the real operator's Save after front-end preflight; another actor commits before dispatch.
  await modal(m,'source','target',two.id);let raced=false,racedState;
  const hook=async route=>{const r=route.request();if(r.method()==='POST'&&r.postDataJSON()?.command?.action==='save'){
    raced=true;await field(m,peerId,key,'midflight-working',targetScope);racedState=await storage(m);
  }await route.continue();};
  const glob='**/api/'+m+'/workflow**';await p.route(glob,hook);
  const ack=p.waitForResponse(r=>new URL(r.url()).pathname==='/api/'+m+'/workflow'&&r.request().method()==='POST');await click();assert.equal((await ack).status(),409);assert(raced);assert.deepEqual(await storage(m),racedState);
  await p.unroute(glob,hook);console.log('RACE',m,await p.locator('.routine-transfer-mod-msg').allTextContents());
  await cmd(peer,m,false,'save');await (await modal(m,'source','target',two.id)).click();await modal(m,'target','source',two.id);const pre=await storage(m);await cmd(peer,m,false,'submit',{savedId:pre.module.saved.id,reason:'Scoped synthetic approval lock'});const locked=await storage(m),beforeLock=events.length;await block(/待審|chờ duyệt|不可|已變更/);assert.equal(events.length,beforeLock);assert.deepEqual(await storage(m),locked);
  await cmd(operator,m,false,'approve',{caseId:locked.module.pendingId});
  const approved=await storage(m);assert.notEqual(approved.formal.id,official.id);
  assert.equal(approved.formal.snapshot.items.find(r=>r.id===two.id).equipmentId,'target');
  results.push({module:m,recovery,independentApproval:true,firstOpeningLostResponseRecovered:true,firstWorkflowAdoption:!none.module,oneGenerationOneSavedId:true,peerReadback:true,cleanSaveSinglePost:true,cleanSaved:true,unrelatedAppliedEditsCoSaved:true,stalePreviewZeroPosts:true,midflightConflict409:true,draftAndFormalPreservedOnRejection:true,noOpZeroPosts:true,normalReverse:true,staleReverseBlocked:true,reopenedUndoAfterABABlocked:true,pendingZeroPosts:true,...(m==='ipqc-ab'?{separateWorkingGroup:'A:G-OTHER'}:{})});
  if(out)fs.writeFileSync(out,JSON.stringify(results,null,2));p.off('request',watch);console.log('PASS',m);
 }
}finally{await browser.close();await f.close();}
