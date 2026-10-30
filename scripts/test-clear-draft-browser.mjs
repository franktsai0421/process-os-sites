// Full compiled pages, normal login, real isolated D1/R2. No live Site bindings.
import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';import {createRequire} from 'node:module';import {chromium} from 'playwright';
import {createRootEntryFixture} from '../tests/root-entry-native-fixture.mjs';import {accessKeys} from '../public/process/access-policy.mjs';
const require=createRequire(import.meta.url),evidence=process.env.USER_PERMISSIONS_EVIDENCE;assert(evidence&&path.isAbsolute(evidence));fs.mkdirSync(evidence,{recursive:true});
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
const report={status:'RUNNING',scope:'actual compiled Chromium pages and API; synthetic isolated accounts/photos/DB only',modules:[]};
const modules=[['iqc','iqc','iqc','quality-iqc'],['fqc','fqc','fqc','quality-fqc'],['routine-equipment','equipment','routine','quality-routine-equipment'],['ipqc-ab','ipqc-ab','ipqcab','quality-ipqc-ab'],['ipqc-c','ipqc-c','ipqcc','quality-ipqc-c']].filter(r=>!process.env.DRAFT_AUDIT_MODULE||r[0]===process.env.DRAFT_AUDIT_MODULE);
for(const [moduleId,cellModule,prefix,tab] of modules){
 const f=await createRootEntryFixture({syntheticBindings:{PROCESS_IMPORT_ENABLED:'0',PROCESS_SESSION_SECRET:randomUUID()}}),base=f.url.origin;
 const row={module:moduleId,programCommit:f.programCommit,build:f.buildEntrySha256,cases:[],pageErrors:[]};let page,stage='seed',sequence=0;
 const admin=await browser.newContext(),staff=await browser.newContext({viewport:{width:1440,height:1000}});
 try{
  const photo=Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7','base64'),photoId=createHash('sha256').update(photo).digest('hex');
  const seed=require('./v3-quality-growth-fixture.cjs')(moduleId,[{id:photoId,bytes:photo.length}],1,1),password='Synthetic-clear-rights-2026',user='limited-'+moduleId;
  const ab=require('./v3-master-permission-fixture.cjs')('master-AB'),c=require('./v3-master-permission-fixture.cjs')('master-C');
  const aControl=JSON.parse(ab.values.masterDataControl.replaceAll('XA','PAB')),cControl=JSON.parse(c.values.masterDataControl.replaceAll('XC','PC').replaceAll('C-CUT','C-TIEN'));
  const master={...aControl,active:{...aControl.active,C:cControl.active.C},versions:[...aControl.versions,...cControl.versions],workflowScopes:{...aControl.workflowScopes,...cControl.workflowScopes}};
  const values={...seed.values,masterDataControl:JSON.stringify(master),processMasterData:ab.values.processMasterData,platformUsers:JSON.stringify([{id:'frank',name:'Synthetic Frank',role:'admin',enabled:true,password},{id:user,name:'Synthetic limited',role:'staff',enabled:true,password,accessOverrides:Object.fromEntries(accessKeys.map(k=>[k,false]))}]),processCustomRoles:'[]',processRoleTemplateOverrides:'{}'};
  await f.db.prepare('INSERT INTO shared_state(id,revision,"values",updated_at) VALUES(1,1,?,?)').bind(JSON.stringify(values),'synthetic-clear-drafts').run();
  await(await f.mf.getR2Bucket('STATE_ARCHIVE')).put(seed.photoPrefix+photoId,photo,{httpMetadata:{contentType:'image/gif'}});
  const endpoint='/api/'+moduleId+'/workflow?caseMetadata=1'+(moduleId==='ipqc-ab'?'&module=1':'');
  async function login(context,id){const r=await context.request.post(base+'/api/platform-login',{headers:{Origin:base},data:{id,password}});assert.equal(r.status(),200);}
  async function read(context=staff){const url=moduleId==='ipqc-c'?'/api/ipqc-c?caseMetadata=1':endpoint;const r=await context.request.get(base+url);assert.equal(r.status(),200,await r.text());return r.json();}
  async function post(context,url,data){const r=await context.request.post(base+url,{headers:{Origin:base},data});return{status:r.status(),body:await r.json()};}
  await login(admin,'frank');
  // An owner prepares a changed draft through the existing restore operation.
  const scopeEndpoint='/api/'+moduleId+'/workflow?caseMetadata=1'+(moduleId==='ipqc-ab'?'&scope=A%3AG':'');
  const restored=await post(admin,scopeEndpoint,{command:{action:'restore',operationId:randomUUID(),clientId:'clear-owner-client',sequence:++sequence,generation:seed.flow.generation,expectedRevision:seed.flow.revision,restoreSaveId:'save0'}});
  assert.equal(restored.status,200,JSON.stringify(restored.body));
  if(moduleId==='ipqc-ab'){const begun=await post(admin,endpoint,{action:'begin'});assert.equal(begun.status,200,JSON.stringify(begun.body));}
  page=await staff.newPage();page.on('pageerror',e=>row.pageErrors.push(e.message));page.on('dialog',d=>d.accept());await page.addInitScript(()=>localStorage.setItem('processUILanguage','zh'));
  async function grant(op){const current=await(await admin.request.get(base+'/api/user-access')).json();const configured=await post(admin,'/api/user-access',{action:'update-user',id:user,baseRevision:current.revision,changes:Object.fromEntries(accessKeys.filter(k=>k.startsWith(cellModule+'.')||moduleId==='fqc'&&['ab.view','equipment.view'].includes(k)).map(k=>[k,k===cellModule+'.view'||k===cellModule+'.'+op||moduleId==='fqc'&&['ab.view','equipment.view'].includes(k)]))});assert.equal(configured.status,200,JSON.stringify(configured.body));await login(staff,user);}
  async function open(){await page.goto(base+'/process/index.html?system=quality&view=data&dataTab='+tab);await page.waitForFunction(()=>document.documentElement.dataset.processNavigationStatus==='ready');await page.locator('#'+prefix+'-save,#'+prefix+'-submit,#'+prefix+'-withdraw,.vd-shell').first().waitFor();}
  async function confirmed(action){
   const response=page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname==='/api/'+moduleId+'/workflow'&&r.request().postDataJSON()?.command?.action===action);
   const start=performance.now();await page.locator('#'+prefix+'-'+action).click();
   if(action!=='save'){await page.locator('.vd-confirm textarea').fill('Synthetic explicit '+action);await page.locator('.vd-confirm [type=submit]').click();}
   const r=await response;assert.equal(r.status(),200,await r.text());const result=await read();
   if(action==='save')assert(result.control.workflow.saved);
   if(action==='submit')assert(result.control.workflow.pendingId);
   if(action==='withdraw')assert.equal(result.control.workflow.pendingId,null);
   // Wait for application state/readback and next usable control, then two frames.
   await page.waitForFunction(({prefix,action})=>{const e=document.querySelector('#'+prefix+'-'+action);return action==='submit'||action==='withdraw'?!e:!!e&&!e.disabled;},{prefix,action});
   await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   row.cases.push({action,apiStatus:200,readback:true,browserMs:Math.round((performance.now()-start)*10)/10});return result;
  }
  stage='save-only';await grant('save');await open();assert(await page.locator('#'+prefix+'-save').isEnabled());const saved=await confirmed('save');
  await page.screenshot({path:path.join(evidence,moduleId+'-save-only.png')});
  stage='submit-only';await grant('submit');await open();assert(await page.locator('#'+prefix+'-submit').isEnabled());const pending=await confirmed('submit');assert.equal(pending.control.workflow.cases.find(c=>c.id===pending.control.workflow.pendingId).savedId,saved.control.workflow.saved.id);
  stage='withdraw-only';await grant('withdraw');await open();assert(await page.locator('#'+prefix+'-withdraw').isEnabled());await confirmed('withdraw');
  stage='read-only';await grant('view');await open();for(const op of ['save','submit','withdraw'])assert.equal(await page.locator('#'+prefix+'-'+op+':enabled').count(),0);
  const before=await read();const denied=await post(staff,endpoint,{command:{action:'save',operationId:randomUUID(),clientId:'clear-denied-client',sequence:1,generation:before.control.workflow.generation,expectedRevision:before.control.workflow.revision,input:{stateRevision:before.revision}}});assert.equal(denied.status,403);assert.equal((await read()).control.workflow.revision,before.control.workflow.revision);row.cases.push({action:'view-only write denial',apiStatus:403,dataUnchanged:true});
  if(moduleId==='iqc'){stage='edit-without-create';await grant('edit');await open();assert.equal(await page.locator('#iqc-add-part').count(),0);row.cases.push({action:'edit without create hides add part',status:'PASS'});}
  assert.deepEqual(row.pageErrors,[]);row.status='PASS';
 }catch(error){row.status='FAIL';row.error={stage,message:error.message};if(page){row.screen=await page.locator('body').innerText().then(s=>s.slice(-2500)).catch(()=>null);await page.screenshot({path:path.join(evidence,moduleId+'-failure.png')}).catch(()=>{});}process.exitCode=1;}
 finally{await admin.close();await staff.close();await f.close();report.modules.push(row);console.log(JSON.stringify(row));}
}
await browser.close();report.status=report.modules.every(r=>r.status==='PASS')?'PASS':'FAIL';fs.writeFileSync(path.join(evidence,'clear-draft-browser.json'),JSON.stringify(report,null,2));
