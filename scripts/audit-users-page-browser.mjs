// Saved account settings -> normal login -> real IQC page and direct API checks.
// Synthetic workflow, accounts, photo and nonpersistent Worker bindings only.
import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';import {createRequire} from 'node:module';import {chromium} from 'playwright';
import {createRootEntryFixture} from '../tests/root-entry-native-fixture.mjs';import {accessKeys} from '../public/process/access-policy.mjs';
const evidence=process.env.USER_PERMISSIONS_EVIDENCE;assert(evidence&&path.isAbsolute(evidence));fs.mkdirSync(evidence,{recursive:true});
const f=await createRootEntryFixture({syntheticBindings:{PROCESS_IMPORT_ENABLED:'0',PROCESS_SESSION_SECRET:randomUUID()}}),base=f.url.origin;
const report={status:'RUNNING',buildEntrySha256:f.buildEntrySha256,programCommit:f.programCommit,scope:'compiled application, real Chromium and normal login; synthetic IQC data only; one representative workflow, not all module buttons',cases:[],findings:[],errors:[]};
const require=createRequire(import.meta.url),password='Synthetic-page-audit-2026';let browser,page,stage='initialize';
try{
 const photo=Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7','base64'),id=createHash('sha256').update(photo).digest('hex');
 const seeded=require('./v3-quality-growth-fixture.cjs')('iqc',[{id,bytes:photo.length}],1,1);
 const values={...seeded.values,platformUsers:JSON.stringify([{id:'frank',name:'Synthetic Frank',role:'admin',enabled:true,password},{id:'audit-staff',name:'Synthetic staff',role:'staff',enabled:true,password,accessOverrides:Object.fromEntries(accessKeys.map(k=>[k,false]))}]),processCustomRoles:'[]',processRoleTemplateOverrides:'{}'};
 await f.db.prepare('INSERT INTO shared_state(id,revision,"values",updated_at) VALUES(1,1,?,?)').bind(JSON.stringify(values),'synthetic-browser-audit').run();await(await f.mf.getR2Bucket('STATE_ARCHIVE')).put('iqc/photos/'+id,photo,{httpMetadata:{contentType:'image/gif'}});
 browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const admin=await browser.newContext(),staff=await browser.newContext({viewport:{width:1440,height:1000}});
 async function login(context,user){const r=await context.request.post(base+'/api/platform-login',{headers:{Origin:base},data:{id:user,password}});assert.equal(r.status(),200);}
 await login(admin,'frank');
 async function configure(edit){const m=await(await admin.request.get(base+'/api/user-access')).json();const r=await admin.request.post(base+'/api/user-access',{headers:{Origin:base},data:{action:'update-user',id:'audit-staff',baseRevision:m.revision,changes:{'iqc.view':true,'iqc.edit':edit}}});assert.equal(r.status(),200);}
 async function open(){await login(staff,'audit-staff');await page.goto(base+'/process/index.html?system=quality&view=data&dataTab=quality-iqc');await page.waitForFunction(()=>document.documentElement.dataset.processNavigationStatus==='ready');await page.locator('#iqc-page').waitFor();}
 page=await staff.newPage();page.on('pageerror',e=>report.errors.push(e.message));await page.addInitScript(()=>localStorage.setItem('processUILanguage','zh'));
 stage='view-only';await configure(false);await open();assert.equal(await page.evaluate(()=>window.hasPermission('iqc.edit')),false);assert.equal(await page.locator('#iqc-add-part').count(),0);
 const tabs=await page.evaluate(()=>({iqc:document.querySelector('[data-quality-tab="quality-iqc"]')?.disabled,bom:document.querySelector('[data-tab="bom"]')?.disabled}));assert.deepEqual(tabs,{iqc:false,bom:true});
 const before=await f.db.prepare('SELECT revision,"values" FROM shared_state').first();const denied=await staff.request.post(base+'/api/iqc/workflow',{headers:{Origin:base},data:{action:'begin'}});assert.equal(denied.status(),403);assert.deepEqual(await f.db.prepare('SELECT revision,"values" FROM shared_state').first(),before);report.cases.push('saved IQC view-only: IQC enabled, BOM disabled, add hidden, direct begin denied without write');
 stage='direct URL';const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/process-bootstrap');await page.goto(base+'/process/index.html?system=process&view=data&dataTab=bom');assert.equal((await response).status(),403);report.cases.push('direct BOM URL rejected by bootstrap after IQC-only setting');
 stage='grant edit';await configure(true);await open();assert.equal(await page.evaluate(()=>window.hasPermission('iqc.edit')),true);assert.equal(await page.evaluate(()=>window.hasPermission('iqc.create')),false);
 const createVisible=await page.locator('#iqc-add-part').isVisible();
 await page.locator('[data-edit-part]').first().click();await page.locator('#iqc-part-form [name="nameVi"]').fill('Synthetic saved permission audit');await page.locator('#iqc-part-form [type="submit"]').click();await page.locator('#iqc-part-form').waitFor({state:'detached'});
 const working=await(await staff.request.get(base+'/api/iqc/workflow')).json();assert.equal(working.control.workflow.working.parts[0].nameVi,'Synthetic saved permission audit');report.cases.push('actual account grant + new login enables existing-part edit; UI apply persisted and independently reread');
 const flow=working.control.workflow;
 const beforeCreate=await f.db.prepare('SELECT revision,"values" FROM shared_state').first();
 const create=await staff.request.post(base+'/api/iqc/workflow',{headers:{Origin:base},data:{command:{action:'apply',operationId:randomUUID(),clientId:'audit-create',sequence:1,generation:flow.generation,expectedRevision:flow.revision,moduleAction:'createPart',input:{}}}});
 assert.equal(create.status(),403);assert.deepEqual(await f.db.prepare('SELECT revision,"values" FROM shared_state').first(),beforeCreate);report.findings.push({id:'IQC_CREATE_BUTTON_WITHOUT_CREATE_CELL',configuredCreate:false,createButtonVisible:createVisible,directCreateStatus:create.status(),denialPreservedData:true});
 await page.screenshot({path:path.join(evidence,'iqc-edit-without-create.png'),fullPage:false});
 stage='revoke edit';await configure(false);const stale=await staff.request.get(base+'/api/iqc/workflow?permissions=1');assert.equal(stale.status(),403);await open();assert.equal(await page.evaluate(()=>window.hasPermission('iqc.edit')),false);assert.equal(await page.locator('#iqc-add-part').count(),0);report.cases.push('saved revocation rejects old session; new normal login restores view-only UI');
 await page.screenshot({path:path.join(evidence,'iqc-view-only.png'),fullPage:false});assert.deepEqual(report.errors,[]);report.status=report.findings.some(x=>x.createButtonVisible)?'COMPLETED_WITH_FINDINGS':'PASS';
}catch(error){report.status='HARNESS_FAILED';report.error={stage,message:error.message};if(page)report.screen=await page.evaluate(()=>({url:location.pathname+location.search,status:document.documentElement.dataset.processNavigationStatus,alerts:[...document.querySelectorAll('[role=alert]')].map(e=>e.textContent.slice(0,300))})).catch(()=>null);process.exitCode=1;}finally{await browser?.close();await f.close();fs.writeFileSync(path.join(evidence,'page-permissions-browser.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
