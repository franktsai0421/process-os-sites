// Actual FQC UI and TS routes; isolated SQLite/R2 and intercepted synthetic origin.
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {chromium} from 'playwright';
import {addAuthorityAudit} from './fqc-required-dependencies-fixture.mjs';
const fixture=createRequire(import.meta.url)('../scripts/fqc-apply-fixture.cjs');
export const read=name=>process.env.FQC_UI_REF?execFileSync('git',['show',process.env.FQC_UI_REF+':public/process/'+name],{encoding:'utf8'}):fs.readFileSync(new URL('../public/process/'+name,import.meta.url),'utf8');
const styles=['styles.css','master-data.css','master-data-extra.css','master-data-validation.css','fqc-master.css','version-draft-ui.css'].map(read).join('\n');
export const scripts=['local-draft-recovery.js','local-draft-recovery-session.js','shared-draft-client.js','version-draft-ui.js','fqc-master.js'];
export const posts=f=>f.requests.filter(r=>r.method==='POST'&&JSON.parse(r.body).command);
export async function setup(width=1280,lang='zh'){
 const f=await fixture(),browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});
 const context=await browser.newContext({viewport:{width,height:850}}),page=await context.newPage(),errors=[];
 let lose=false,receiptDown=false,readDown=false,noCommit=false,delayCommit=false,lateCommit=null;
 page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>{errors.push('Unexpected dialog');void dialog.dismiss();});
 await context.route('**/*',async route=>{const req=route.request(),url=new URL(req.url());
  if(url.origin!=='https://synthetic.invalid')return route.abort();
  if(url.pathname==='/process/')return route.fulfill({contentType:'text/html',body:`<!doctype html><html lang="${lang}"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${styles}</style><main id="data-content" data-active-tab="quality-fqc"></main></html>`});
  if(!url.pathname.startsWith('/api/'))return route.fulfill({status:404,body:'Synthetic resource unavailable'});
  if(receiptDown&&url.searchParams.has('operationId'))return route.fulfill({status:404,json:{error:'OPERATION_NOT_FOUND'}});
  if(readDown&&req.method()==='GET'&&url.pathname==='/api/fqc/workflow'&&!url.searchParams.has('operationId'))return route.fulfill({status:503,json:{error:'SYNTHETIC_READ_UNAVAILABLE'}});
  const lost=lose&&req.method()==='POST'&&JSON.parse(req.postData()||'{}').command?.action==='apply';
  if(lost&&noCommit){lose=false;return route.abort('failed');}
  const operation=f.call(url.pathname+url.search,{method:req.method(),...(req.postData()?{body:req.postData()}:{})});
  if(lost&&delayCommit){lose=false;lateCommit=operation;return route.abort('failed');}
  const response=await operation;
  if(lost){lose=false;return route.abort('failed');}
  return route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()});
 });
 await addAuthorityAudit(f);
 await page.goto('https://synthetic.invalid/process/');await boot();
 async function boot(target=page){await target.evaluate(lang=>{window.ProcessSync={identity:{id:'editor',name:'Synthetic editor',role:'staff'},identityGeneration:()=>1,captureDelivery:()=>1,isCurrentDelivery:e=>e===1,platformHeaders:()=>({}),requiresReload:false};window.state={view:'data',dataTab:'quality-fqc'};window.hasPermission=()=>true;window.bindDataInner=()=>{};window.toast=()=>{};localStorage.setItem('processUILanguage',lang);},lang);
 for(const file of scripts)await target.addScriptTag({content:read(file)});
 await target.evaluate(()=>window.FQCMasterUI.bind(document.querySelector('#data-content')));
 }
 await page.locator('#fqc-begin').click();await page.locator('#fqc-save').waitFor();
 const settled=()=>page.waitForFunction(()=>!window.sharedDraftAccountState().queued&&!document.querySelector('.fqc-modal-overlay[aria-busy]'));
 async function recover(){const button=page.locator('[data-fqc-check-result]');if(await button.count())await button.click();else await page.evaluate(()=>document.querySelector('#fqc-check-result').click());await page.waitForFunction(()=>!window.sharedDraftAccountState().unknown);await page.waitForFunction(()=>!document.querySelector('#fqc-check-result'));}
 return{f,page,errors,settled,recover,boot,lateCommit:()=>lateCommit,lose({commit=true,delayed=false}={}){lose=true;receiptDown=true;noCommit=!commit;delayCommit=delayed;},receiptsUp(){receiptDown=false;},setReadDown(value){readDown=value;},async close(){await context.close();await browser.close();f.close();}};
}
