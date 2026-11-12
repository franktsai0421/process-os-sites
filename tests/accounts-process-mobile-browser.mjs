// Additional joint-head viewport coverage. Original lifecycle runners stay byte-identical.
// CI only: compiled application, owned ephemeral Worker/D1/R2 and synthetic signed sessions.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHmac,randomBytes} from 'node:crypto';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {buildProcessDraftLifecycleSeed} from './process-draft-lifecycle-route-fixture.mjs';
import {extendProcessNavigationSeed,processShellReady} from './process-draft-lifecycle-browser.mjs';
export const jointViewportCases=Object.freeze([1365,390].flatMap(width=>['zh','vi'].map(language=>Object.freeze({width,height:844,language}))));
export async function runJointViewportBrowser(){
 assert.equal(process.env.CI,'true','Joint viewport acceptance requires authorized CI; never bypass a local refusal');
 const {chromium}=await import('playwright'),{createRootEntryFixture}=await import('./root-entry-native-fixture.mjs');
 const secret=randomBytes(32).toString('hex'),report={status:'RUNNING',cases:[],pageErrors:[],realData:false,realCredentials:false,remoteBindings:false,physicalPhone:false,ime:false};
 let fixture,browser,context,stage='setup';
 try{
  fixture=await createRootEntryFixture({recordOracle:true,syntheticBindings:{PROCESS_IMPORT_ENABLED:'0',PROCESS_OWNER_BOOTSTRAP_ENABLED:'0',PROCESS_SESSION_SECRET:secret,PROCESS_SESSION_REVOCATION_ENABLED:'1',DEMO_LOGIN_ENABLED:'false'}});
  const bucket=await fixture.mf.getR2Bucket('STATE_ARCHIVE'),load=createRequire(import.meta.url)('../scripts/ipqc-ab-import-harness.cjs')({STATE_ARCHIVE:bucket}),records=load('lib/state-records.ts'),origin=fixture.url.origin;
  browser=await chromium.launch({headless:true,args:['--disable-background-networking']});
  const read=async()=>JSON.parse((await fixture.readRecordValues()).processAuthoringControl),button=action=>'#authoring-v3-panel [data-av3="'+action+'"]';
  fs.mkdirSync('.sites-runtime/accounts-process-joint',{recursive:true});
  for(const scenario of jointViewportCases){
   assert(!context);const seed=extendProcessNavigationSeed(buildProcessDraftLifecycleSeed(load('lib/shared-draft.ts').createSharedDraft));
   const raw=await records.encodeRecordValues(bucket,seed.values);await fixture.db.prepare('INSERT OR REPLACE INTO shared_state(id,revision,"values",updated_at) VALUES(1,1,?,?)').bind(raw,'synthetic joint viewport').run();
   context=await browser.newContext({serviceWorkers:'block',viewport:{width:scenario.width,height:scenario.height}});
   await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
   await context.addInitScript(language=>localStorage.setItem('processUILanguage',language),scenario.language);
   const actor=seed.actors.editor,payload=Buffer.from(JSON.stringify({version:2,id:actor.id,sessionType:'platform',authEpoch:1,expires:Date.now()+600000,nonce:'joint-'+scenario.width+'-'+scenario.language})).toString('base64');
   await context.addCookies([{name:'process_demo',value:payload+'.'+createHmac('sha256',secret).update(payload).digest('hex'),url:origin,httpOnly:true,sameSite:'Lax'}]);
   const page=await context.newPage(),posts=[];page.setDefaultTimeout(30000);page.on('pageerror',error=>report.pageErrors.push({stage,name:error.name}));
   page.on('dialog',dialog=>{report.pageErrors.push({stage,name:'UnexpectedNativeDialog',type:dialog.type()});void dialog.dismiss();});
   page.on('request',request=>{if(request.method()==='POST'&&new URL(request.url()).pathname==='/api/process-authoring/workflow')posts.push(request.postDataJSON());});
   stage='entry-'+scenario.width+'-'+scenario.language;await page.goto(origin+'/process/index.html?view=editor',{waitUntil:'domcontentloaded'});await page.waitForFunction(processShellReady,{view:'editor',actor:actor.id});await page.waitForFunction(()=>!!window.ProcessAuthoringV3?.flow());
   await page.locator(button('begin')).click();await page.locator(button('save')).waitFor();const baseline=await read();assert.equal(posts.length,1);
   stage='local-input-'+scenario.width+'-'+scenario.language;await page.locator('.pe-editor [data-pe="fit"]').click();await page.locator('.pe-card[data-node="'+seed.ids.operation+'"] [data-pe="edit"]').click();
   const name='Joint '+scenario.width+' '+scenario.language+' 測試 Kiểm tra';await page.locator('#process-operation-dialog[open] [data-field="name"]').fill(name);await page.locator('#apply-operation').click();await page.locator('#process-operation-dialog').waitFor({state:'detached'});await page.waitForFunction(()=>window.ProcessCanvasLocal?.dirty()===true);assert.deepEqual(await read(),baseline);assert.equal(posts.length,1);
   stage='save-'+scenario.width+'-'+scenario.language;await page.locator(button('save')).click();await page.waitForFunction(name=>window.ProcessAuthoringV3?.flow()?.saved?.content?.workspaces.some(workspace=>Object.values(workspace.stages).flat().some(operation=>operation.name===name)),name);
   const saved=await read();assert.equal(posts.length,2);assert.equal(saved.workflow.revision,baseline.workflow.revision+1);assert.deepEqual(saved.workflow.saved.content,saved.workflow.working);
   stage='silent-departure-'+scenario.width+'-'+scenario.language;await page.locator('.pe-card[data-node="'+seed.ids.operation+'"] [data-pe="edit"]').click();await page.locator('#process-operation-dialog[open] [data-field="name"]').fill('Unsent joint mobile');await page.locator('#apply-operation').click();await page.waitForFunction(()=>window.ProcessCanvasLocal?.dirty()===true);
   await page.locator('[data-pe-stage="A-LIFE-NAV"]').click();await page.waitForFunction(()=>document.querySelector('.pe-editor')?.dataset.stageKey==='A-LIFE-NAV');await page.locator('[data-pe-stage="'+seed.ids.stage+'"]').click();await page.waitForFunction(({id,name})=>document.querySelector('.pe-card[data-node="'+id+'"] h3')?.textContent===name&&window.ProcessCanvasLocal?.dirty()===false,{id:seed.ids.operation,name});
   assert.equal(posts.length,2);assert.deepEqual(await read(),saved);assert.equal(await page.locator('#process-navigation-departure[open],.vd-confirm[open],#process-operation-dialog[open]').count(),0);assert.equal(await page.locator('.pe-editor [data-pe="sync"]').count(),0);assert.deepEqual(report.pageErrors,[]);
   await page.screenshot({path:'.sites-runtime/accounts-process-joint/'+scenario.language+'-'+scenario.width+'.png',fullPage:true});report.cases.push({...scenario,beginPosts:1,savePosts:1,localOrDeparturePosts:0,status:'PASS'});await context.close();context=null;
  }
  report.status='PASS_COMPILED_JOINT_VIEWPORTS';
 }catch(error){report.status='FAIL_COMPILED_JOINT_VIEWPORTS';report.failure={stage,name:error.name,message:error.message};process.exitCode=1;}
 finally{await context?.close();await browser?.close();await fixture?.close();report.disposed=true;console.log(JSON.stringify(report));}
 return report;
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url)await runJointViewportBrowser();
