// Representative draft action audit: compiled app, normal login, isolated D1/R2.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {chromium} from 'playwright';
import {createRootEntryFixture} from '../tests/root-entry-native-fixture.mjs';
import {accessKeys} from '../public/process/access-policy.mjs';
const evidence=process.env.USER_PERMISSIONS_EVIDENCE;
assert(evidence&&path.isAbsolute(evidence));fs.mkdirSync(evidence,{recursive:true});
const f=await createRootEntryFixture({syntheticBindings:{PROCESS_IMPORT_ENABLED:'0',PROCESS_SESSION_SECRET:randomUUID()}});
const base=f.url.origin,require=createRequire(import.meta.url),password='Synthetic-draft-audit-2026';
const report={status:'RUNNING',programCommit:f.programCommit,buildEntrySha256:f.buildEntrySha256,scope:'IQC representative actual UI and API; synthetic only; not acceptance of every draft module',cases:[],errors:[]};
let browser,stage='seed',sequence=0;
try{
 const photo=Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7','base64'),id=createHash('sha256').update(photo).digest('hex');
 const seed=require('./v3-quality-growth-fixture.cjs')('iqc',[{id,bytes:photo.length}],1,1);
 const values={...seed.values,platformUsers:JSON.stringify([{id:'frank',name:'Synthetic Frank',role:'admin',enabled:true,password},{id:'audit-staff',name:'Synthetic staff',role:'staff',enabled:true,password,accessOverrides:Object.fromEntries(accessKeys.map(k=>[k,false]))}]),processCustomRoles:'[]',processRoleTemplateOverrides:'{}'};
 await f.db.prepare('INSERT INTO shared_state(id,revision,"values",updated_at) VALUES(1,1,?,?)').bind(JSON.stringify(values),'synthetic-draft-audit').run();
 await(await f.mf.getR2Bucket('STATE_ARCHIVE')).put('iqc/photos/'+id,photo,{httpMetadata:{contentType:'image/gif'}});
 browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const admin=await browser.newContext(),staff=await browser.newContext({viewport:{width:1440,height:1000}}),page=await staff.newPage();
 page.on('pageerror',e=>report.errors.push(e.message));await page.addInitScript(()=>localStorage.setItem('processUILanguage','zh'));
 const login=async(context,user)=>assert.equal((await context.request.post(base+'/api/platform-login',{headers:{Origin:base},data:{id:user,password}})).status(),200);
 await login(admin,'frank');
 async function configure(op){
  const model=await(await admin.request.get(base+'/api/user-access')).json();
  const changes=Object.fromEntries(accessKeys.filter(k=>k.startsWith('iqc.')).map(k=>[k,k==='iqc.view'||k==='iqc.'+op]));
  const r=await admin.request.post(base+'/api/user-access',{headers:{Origin:base},data:{action:'update-user',id:'audit-staff',baseRevision:model.revision,changes}});assert.equal(r.status(),200);
  await login(staff,'audit-staff');await page.goto(base+'/process/index.html?system=quality&view=data&dataTab=quality-iqc');
  await page.waitForFunction(()=>document.documentElement.dataset.processNavigationStatus==='ready');await page.locator('#iqc-page').waitFor();
 }
 async function read(){const r=await staff.request.get(base+'/api/iqc/workflow');assert.equal(r.status(),200);return(await r.json()).control.workflow;}
 async function command(action,extra={}){const flow=await read();const response=await staff.request.post(base+'/api/iqc/workflow',{headers:{Origin:base},data:{command:{action,operationId:randomUUID(),clientId:'draft-audit-client',sequence:++sequence,generation:flow.generation,expectedRevision:flow.revision,...extra}}});return{status:response.status(),body:await response.json()};}
 async function buttons(){return page.evaluate(()=>Object.fromEntries(['begin','save','submit','withdraw','add-part'].map(k=>{const e=document.querySelector('#iqc-'+k);return[k,e?{visible:!!e.getClientRects().length,disabled:e.disabled}:null];})));}
 for(const op of ['create','delete','edit','save','submit','withdraw']){
  stage=op;await configure(op);
  const permissions=await(await staff.request.get(base+'/api/iqc/workflow?permissions=1')).json();
  const row={granted:['iqc.view','iqc.'+op],permissions:permissions.permissions,buttons:await buttons()};
  const before=await read();let result;
  if(op==='create')result=await command('apply',seed.creation('limited'));
  if(op==='delete')result=await command('apply',{patches:[{op:'set',path:['items',{id:'row0'},'isDeleted'],value:true}]});
  if(op==='edit')result=await command('restore',{restoreSaveId:'save0'});
  if(op==='save')result=await command('save');
  if(op==='submit')result=await command('submit',{savedId:before.saved.id,reason:'Synthetic draft permission audit'});
  if(op==='withdraw')result=await command('withdraw',{caseId:before.pendingId,reason:'Synthetic draft permission audit'});
  row.apiStatus=result.status;row.apiError=result.body.error||null;
  const after=await read();row.persisted={revisionBefore:before.revision,revisionAfter:after.revision,saved:!!after.saved,pending:!!after.pendingId};
  if(['create','delete'].includes(op)){assert.equal(result.status,403);assert.deepEqual(after,before);}
  else {assert.equal(result.status,200,JSON.stringify(result.body));assert(after.revision>before.revision);}
  if(op==='edit')assert.equal(after.working.items[0].nameVi,'Lần thay đổi 0');
  if(op==='save')assert.equal(after.saved.content.items[0].nameVi,'Lần thay đổi 0');
  if(op==='submit')assert(after.pendingId);
  if(op==='withdraw')assert.equal(after.pendingId,null);
  report.cases.push(row);await page.screenshot({path:path.join(evidence,'draft-iqc-'+op+'-only.png')});
 }
 stage='restore-delete-boundary';await configure('edit');
 const beforeAdd=await read();
 const add=await admin.request.post(base+'/api/iqc/workflow',{headers:{Origin:base},data:{command:{action:'apply',operationId:randomUUID(),clientId:'draft-owner-client',sequence:1,generation:beforeAdd.generation,expectedRevision:beforeAdd.revision,...seed.creation('restore-boundary')}}});
 assert.equal(add.status(),200,JSON.stringify(await add.json()));
 const added=await read(),newError=added.working.errors.find(e=>!beforeAdd.working.errors.some(old=>old.id===e.id));assert(newError&&!newError.isDeleted);
 const restored=await command('restore',{restoreSaveId:'save0'});assert.equal(restored.status,200);
 const restoredFlow=await read(),target=restoredFlow.working.errors.find(e=>e.id===newError.id);
 assert(target?.isDeleted===true);
 const historicalPreview=await staff.request.get(base+'/api/iqc/workflow?restoreSaveId=save0');assert.equal(historicalPreview.status(),200);
 report.cases.push({granted:['iqc.view','iqc.edit'],operation:'restore saved history predating an error created through owner API',deleteGranted:false,apiStatus:restored.status,newErrorRetainedAsTombstone:target.isDeleted,historicalPreviewStatus:historicalPreview.status(),finding:'RESTORE_CAN_SOFT_DELETE_WITHOUT_DELETE_CELL'});
 assert.deepEqual(report.errors,[]);report.status='COMPLETED_WITH_FINDINGS';
}catch(error){report.status='HARNESS_FAILED';report.error={stage,message:error.message};process.exitCode=1;}
finally{await browser?.close();await f.close();fs.writeFileSync(path.join(evidence,'draft-permissions-browser.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
