// Compiled Worker + native Chromium, isolated synthetic records only. No build or live endpoint.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHmac,createHash,randomBytes} from 'node:crypto';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {createRootEntryFixture} from './root-entry-native-fixture.mjs';
import {buildProcessDraftLifecycleSeed} from './process-draft-lifecycle-route-fixture.mjs';
import {accessKeys} from '../public/process/access-policy.mjs';
const require=createRequire(import.meta.url),clone=value=>JSON.parse(JSON.stringify(value));
const specs=[
 {module:'fqc',key:'qualityMasterControl',tab:'quality-fqc',begin:'#fqc-begin',query:'#fqc-check-result'},
 {module:'iqc',key:'iqcMasterControl',tab:'quality-iqc',begin:'#iqc-begin',query:'#iqc-operation-check'},
 {module:'ipqc-c',key:'ipqcCMasterControl',tab:'quality-ipqc-c',begin:'#ipqcc-begin',query:'#ipqcc-check-operation'},
 {module:'process-authoring',key:'processAuthoringControl',view:'editor',begin:'[data-av3="begin"]',query:'[data-av3="retry"]'},
];
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const control=(values,spec)=>{const parsed=JSON.parse(values[spec.key]);return spec.module==='fqc'?parsed.libraries.fqc:parsed;};
export function beginBrowserSeed(load){
 const seed=buildProcessDraftLifecycleSeed(load('lib/shared-draft.ts').createSharedDraft),values=seed.values;
 // Fixture-only reachability; no product permissions or existing employee records change.
 const actor={...seed.actors.editor,views:['editor','data','dashboard','approval'],lines:['A','B','C'],accessOverrides:Object.fromEntries(accessKeys.map(key=>[key,true]))};
 values.platformUsers=JSON.stringify([actor]);values.backupSettings='{"enabled":false}';
 for(const spec of specs.filter(row=>row.module!=='process-authoring')){
  const quality=require('../scripts/v3-quality-growth-fixture.cjs')(spec.module,[{id:'a'.repeat(64),bytes:1}],1,1);
  values[spec.key]=quality.values[spec.key];
  if(spec.module==='ipqc-c'){
   const master=JSON.parse(values.masterDataControl),other=JSON.parse(quality.values.masterDataControl);
   master.active.C=other.active.C;master.versions.push({...master.versions[0],id:'begin-master-C',scope:'C',snapshot:clone(other.active.C)});values.masterDataControl=JSON.stringify(master);
  }
 }
 // Closed draft with retained saved/history records makes Begin visible while
 // proving recovery does not discard those records. Pending is null in this UI case.
 for(const spec of specs){const c=control(values,spec);c.versions=c.versions.filter(row=>row.status!=='draft');
  if(!c.workflow.saves.length){const saved={id:'retained-save',revision:0,content:clone(c.workflow.working),contributors:{},actor:{id:actor.id,name:actor.name},at:'2026-11-01T00:00:00.000Z'};c.workflow.saves=[saved];}
  c.workflow.saved=clone(c.workflow.saves.at(-1));
  const stripPhotos=value=>{if(!value||typeof value!=='object')return;for(const[key,row]of Object.entries(value)){if(['photos','mediaItems'].includes(key))value[key]=[];else stripPhotos(row);}};stripPhotos(c);
  values[spec.key]=JSON.stringify(spec.module==='fqc'?{schemaVersion:1,libraries:{fqc:c}}:c);
 }
 return{values,actor};
}
// Public CI failure output is an allowlist, never raw DOM/storage or session data.
// Observe constructor returns without changing options, instances or method calls.
// Client getters are consulted only after the original browser assertion failed.
export function installBeginRecoveryProbe(){
 const records=[];let wrapped;
 Object.defineProperty(window,'createSharedDraftClient',{configurable:true,get:()=>wrapped,set(factory){wrapped=function(...args){const client=Reflect.apply(factory,this,args);if(!records.some(row=>row.client===client)&&records.length<256)records.push({client,options:args[0]});return client;};}});
 Object.defineProperty(window,'__beginRecoveryProbe',{value:()=>records.slice(0,64).map(({client,options})=>{
  const read=name=>{try{const result=client?.[name]?.();return typeof result==='boolean'?result:null;}catch{return null;}};
  const moduleName=typeof options?.endpoint==='string'?options.endpoint.match(/^\/api\/(fqc|iqc|ipqc-c|process-authoring)\/workflow(?:\?|$)/)?.[1]:null;
  return {module:moduleName||'other',durableBegin:options?.durableBegin===true,bounded:!!options?.externalDurableBounded,unknown:read('hasUnknown'),beginUnknown:read('hasUnknownBegin'),runtimeCurrent:read('isRuntimeCurrent'),beginRuntimeCurrent:read('isBeginRuntimeCurrent')};
 })});
}
export function beginRecoveryFailureSummary(report){
 const dom=report?.dom||{},account=dom.account,integer=value=>Number.isSafeInteger(value)&&value>=0?value:null;
 const boolean=value=>typeof value==='boolean'?value:null;
 const views=['data','editor','dashboard','quality-dashboard'],tabs=['quality-fqc','quality-iqc','quality-ipqc-c'];
 const codes=['BEGIN_OWNER_CHANGED','BEGIN_RECOVERY_CONTEXT_CHANGED','BEGIN_AUTHORITY_READ_REQUIRED','INVALID_BEGIN_RECEIPT','INVALID_BEGIN_BASIS','BEGIN_READBACK_BEHIND','BEGIN_GENERATION_CHANGED','ACCESS_READ_SUPERSEDED','DELIVERY_SUPERSEDED','BOUNDED_READBACK_REQUIRED','BOUNDED_READ_SUPERSEDED','RECOVERY_RECORD_INVALID','OPERATION_IN_PROGRESS','STALE_GENERATION','FORBIDDEN'];
 return {status:'FAIL_BEGIN_RECOVERY_BROWSER',stage:/^(fqc|iqc|ipqc-c|process-authoring)(:(spa|native))?:(seed|begin|leave|reopen)$/.test(report?.stage||'')?report.stage:'unknown',
  account:account?{queued:integer(account.queued),unknown:boolean(account.unknown),failed:boolean(account.failed)}:null,
  beginMarkerCount:Array.isArray(dom.markers)?dom.markers.length:null,
  navigationStatus:['ready','loading','error'].includes(dom.navigationStatus)?dom.navigationStatus:null,
  readyGeneration:/^\d{1,12}$/.test(dom.readyGeneration||'')?dom.readyGeneration:null,
  destination:{view:views.includes(dom.view?.view)?dom.view.view:null,dataTab:tabs.includes(dom.view?.dataTab)?dom.view.dataTab:null},
  clients:Array.isArray(dom.clients)?dom.clients.slice(0,64).map(row=>({module:['fqc','iqc','ipqc-c','process-authoring','other'].includes(row?.module)?row.module:'other',durableBegin:boolean(row?.durableBegin),bounded:boolean(row?.bounded),unknown:boolean(row?.unknown),beginUnknown:boolean(row?.beginUnknown),runtimeCurrent:boolean(row?.runtimeCurrent),beginRuntimeCurrent:boolean(row?.beginRuntimeCurrent)})):[],
  visibleRecoveryCodes:codes.filter(code=>typeof dom.status==='string'&&dom.status.includes(code))};
}
export async function runBeginRecoveryBrowser({isolatedDesktop=false}={}){
 if(!isolatedDesktop)assert.equal(process.env.CI,'true','Use authorized CI or explicit isolated-desktop mode');
 const {chromium}=await import('playwright'),secret=randomBytes(32).toString('hex');
 const report={status:'RUNNING',layer:isolatedDesktop?'ISOLATED_DESKTOP_BROWSER':'CI_SYNTHETIC_BROWSER',programCommit:process.env.PROCESS_PROGRAM_COMMIT,checks:[],requestedModules:process.env.BEGIN_BROWSER_MODULES?.split(',')||specs.map(row=>row.module),realData:false,realCredentials:false,limitations:['Synthetic compiled loopback, not hosted latency.','Pending-lock and in-place unsent-input preservation are separate module/API tests; this case has pendingId=null and deliberately leaves the source page.']};
 let fixture,browser,context,activePage,stage='fixture';
 try{
  fixture=await createRootEntryFixture({recordOracle:true,syntheticBindings:{PROCESS_IMPORT_ENABLED:'0',PROCESS_SESSION_SECRET:secret}});
  const bucket=await fixture.mf.getR2Bucket('STATE_ARCHIVE'),load=require('../scripts/ipqc-ab-import-harness.cjs')({STATE_ARCHIVE:bucket}),records=load('lib/state-records.ts');
  browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
  report.buildEntrySha256=fixture.buildEntrySha256;report.recordOracleSha256=fixture.recordOracleSha256;report.browserVersion=browser.version();
  for(const reopen of ['spa','native'])for(const spec of specs.filter(row=>!process.env.BEGIN_BROWSER_MODULES||process.env.BEGIN_BROWSER_MODULES.split(',').includes(row.module))){
   stage=spec.module+':'+reopen+':seed';const seed=beginBrowserSeed(load),raw=await records.encodeRecordValues(bucket,seed.values);
   await fixture.db.prepare('INSERT OR REPLACE INTO shared_state(id,revision,"values",updated_at) VALUES(1,1,?,?)').bind(raw,'synthetic Begin').run();
   context=await browser.newContext({serviceWorkers:'block',viewport:{width:1365,height:900}});
   await context.addInitScript(installBeginRecoveryProbe);
   const origin=fixture.url.origin,endpoint='/api/'+spec.module+'/workflow';let operationId=null,blocked=true,posts=0,committed=false;const queries=[],errors=[],dialogs=[];
   await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());if(url.origin!==origin)return route.abort();
    if(request.method()==='POST'){
     assert.equal(url.pathname,endpoint,'Only the current synthetic module may write');posts++;
     const body=request.postDataJSON();assert.equal(body.action,'begin-v1');assert.equal(operationId,null,'Begin may never be resent');operationId=body.begin.operationId;
     const response=await route.fetch();assert.equal(response.status(),200);const accepted=await response.json();assert.equal(accepted.operationKind,'begin-v1');assert.equal(accepted.receipt.operationId,operationId);committed=true;return route.abort('connectionreset');
    }
    if(url.pathname===endpoint&&url.searchParams.has('operationId')){queries.push(url.searchParams.get('operationId'));assert.equal(queries.at(-1),operationId);if(blocked)return route.fulfill({status:503,json:{error:'SYNTHETIC_RECEIPT_UNAVAILABLE'}});}
    return route.continue();
   });
   const payload=Buffer.from(JSON.stringify({version:2,id:seed.actor.id,sessionType:'platform',authEpoch:1,expires:Date.now()+600000,nonce:'begin-browser'})).toString('base64');
   await context.addCookies([{name:'process_demo',value:payload+'.'+createHmac('sha256',secret).update(payload).digest('hex'),url:origin,httpOnly:true,sameSite:'Lax'}]);
   const page=await context.newPage();activePage=page;page.setDefaultTimeout(30000);page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>{dialogs.push(dialog.type());void dialog.dismiss();});
   const target=origin+'/process/?system=process&view='+(spec.view||'data')+(spec.tab?'&dataTab='+spec.tab:'');
   stage=spec.module+':begin';await page.goto(target);await page.locator(spec.begin).click();
   await page.waitForFunction(()=>window.sharedDraftAccountState?.().unknown===true&&window.sharedDraftAccountState?.().queued===0);
   assert(committed);assert.equal(posts,1);const afterCommit=await fixture.readRecordValues(),beforeControl=control(seed.values,spec),afterControl=control(afterCommit,spec);
   assert.deepEqual(afterControl.workflow.saved,beforeControl.workflow.saved);assert.deepEqual(afterControl.workflow.saves,beforeControl.workflow.saves);assert.deepEqual(afterControl.workflow.cases,beforeControl.workflow.cases);assert.equal(afterControl.workflow.pendingId,beforeControl.workflow.pendingId);
   const markers=await page.evaluate(()=>Object.fromEntries(Object.entries(sessionStorage).filter(([key])=>key.startsWith('shared-draft-begin-v1:'))));assert(Object.keys(markers).length,'Original Begin identity must survive in session storage');
   stage=spec.module+':leave';const destination=spec.module==='process-authoring'?'dashboard':'quality-dashboard';await page.locator('.nav-item[data-view="'+destination+'"]').click();await page.waitForFunction(view=>window.ProcessSync?.destination?.view===view&&document.documentElement.dataset.processNavigationStatus==='ready',destination);
   assert.equal(posts,1);assert.deepEqual(await fixture.readRecordValues(),afterCommit);
   stage=spec.module+':'+reopen+':reopen';if(reopen==='native')await page.goto(target);else{await page.locator('.nav-item[data-view="'+(spec.view||'data')+'"]').click();
   if(spec.tab){await page.locator('[data-quality-tab="'+spec.tab+'"]').click();}}
   await page.locator(spec.query).waitFor();
   assert.deepEqual(await page.evaluate(()=>Object.fromEntries(Object.entries(sessionStorage).filter(([key])=>key.startsWith('shared-draft-begin-v1:')))),markers);assert.equal(posts,1);
   blocked=false;const queried=page.waitForResponse(response=>{const url=new URL(response.url());return url.pathname===endpoint&&url.searchParams.get('operationId')===operationId&&response.status()===200;});
   await Promise.all([page.locator(spec.query).click(),queried]);await page.waitForFunction(()=>window.sharedDraftAccountState?.().unknown===false&&window.sharedDraftAccountState?.().queued===0);
   const afterRecovery=await fixture.readRecordValues();assert.deepEqual(afterRecovery,afterCommit);assert.equal(posts,1);assert(queries.length>0);assert.deepEqual(errors,[]);assert.deepEqual(dialogs,[]);
   report.checks.push({module:spec.module,reopen,status:'PASS',beginPosts:posts,receiptReads:queries.length,originalOperationId:operationId,beforeRecoverySha256:hash(afterCommit),afterRecoverySha256:hash(afterRecovery),retainedSaved:true,retainedHistory:true,pendingId:afterControl.workflow.pendingId,dialogs:0});
   await context.close();context=null;fs.mkdirSync('.sites-runtime',{recursive:true});fs.writeFileSync('.sites-runtime/begin-recovery-browser-result.json',JSON.stringify(report,null,2));
  }
  report.status='PASS_BEGIN_RECOVERY_BROWSER';return report;
 }catch(error){report.status='FAIL_BEGIN_RECOVERY_BROWSER';report.stage=stage;report.error=error.message;report.dom=await activePage?.evaluate(()=>({account:window.sharedDraftAccountState?.(),clients:window.__beginRecoveryProbe?.(),navigationStatus:document.documentElement.dataset.processNavigationStatus,readyGeneration:document.documentElement.dataset.processDestinationReadyGeneration,markers:Object.keys(sessionStorage).filter(key=>key.startsWith('shared-draft-begin-v1:')),status:document.querySelector('#view-root')?.innerText.slice(-2200),view:window.ProcessSync?.destination,buttons:[...document.querySelectorAll('button')].filter(n=>n.getClientRects().length).map(n=>({text:n.textContent,id:n.id,view:n.dataset.view})).slice(0,45)})).catch(()=>null);console.error(JSON.stringify(beginRecoveryFailureSummary(report)));throw error;}
 finally{await context?.close();await browser?.close();await fixture?.close();fs.mkdirSync('.sites-runtime',{recursive:true});fs.writeFileSync('.sites-runtime/begin-recovery-browser-result.json',JSON.stringify(report,null,2));}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await runBeginRecoveryBrowser({isolatedDesktop:process.argv.includes('--isolated-desktop')});
