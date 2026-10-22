/* oxlint-disable typescript/no-require-imports -- actual Local readonly UI/API inspection; never begin or handle a case. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{chromium}=require('playwright'),{source}=require('./local-v3-adoption.cjs');
const base='http://127.0.0.1:3000',out=path.resolve('.wrangler/local-only/v3-evidence/post-adoption-coediting-20261003'),report={startedAt:new Date().toISOString(),status:'RUNNING',actualLocalBusinessWrites:0,beginExecuted:false,scopes:[]};let browser,before;
void(async()=>{try{
 before=await source();report.sourceRevision=before.row.revision;report.sourceToken=before.token;
 if(process.env.V3_SCOPE_RESUME==='1'){const prior=JSON.parse(fs.readFileSync(path.join(out,'scope-entrances.json')));assert.equal(prior.sourceToken,before.token);report.scopes=prior.scopes;report.reusedReadonlyScopes=prior.scopes.map(s=>s.scope);}
 const login=await fetch(base+'/api/platform-login',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({demoRole:'admin'})});assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0];
 browser=await chromium.launch({...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{channel:'chrome'}),headless:true});
 const definitions=[
  {scope:'master:AB',system:'process',tab:'products',endpoint:'/api/master/workflow?scope=AB',ready:'#master-new-draft',button:'#master-new-draft',entry:'製程控制 → 主資料 → AB產線與類別 → 建立新版本草稿',limit:'僅AB範圍；線別與工段管理共用此範圍；涉及PROCESS模板變動仍受連動鎖限制'},
  {scope:'master:C',system:'process',tab:'products',masterScope:'C',endpoint:'/api/master/workflow?scope=C',ready:'#master-new-draft',button:'#master-new-draft',entry:'製程控制 → 主資料 → C產線與類別 → 建立新版本草稿',limit:'僅C範圍；線別與工段管理共用此範圍；涉及PROCESS模板變動仍受連動鎖限制'},
  {scope:'master:PROCESS',system:'process',tab:'process-master',endpoint:'/api/master/workflow?scope=PROCESS',ready:'#process-master-new-draft',button:'#process-master-new-draft',entry:'製程控制 → 主資料 → 流程資料 → 建立新版本草稿',limit:'流程模板範圍，與製程編輯process:platform不同；有效連動案件可阻擋啟用'},
  {scope:'fqc',system:'quality',tab:'quality-fqc',endpoint:'/api/fqc/workflow',ready:'#fqc-version',select:'#fqc-version',key:'qualityMasterControl',button:'#fqc-begin',entry:'品質主資料 → FQC → 選V9已核准版 → 開始修改／刪除資料',limit:'全FQC；ADMIN限定；既有V10草稿保留，手動操作才採用V3'},
  {scope:'iqc',system:'quality',tab:'quality-iqc',endpoint:'/api/iqc/workflow',ready:'#iqc-version',select:'#iqc-version',key:'iqcMasterControl',button:'#iqc-begin',entry:'品質主資料 → IQC → 選V7已核准版 → 開始修改',limit:'全IQC；需編輯權限；既有V8草稿保留，手動操作才採用V3'},
  {scope:'ipqc-c',system:'quality',tab:'quality-ipqc-c',endpoint:'/api/ipqc-c/workflow',ready:'#ipqcc-save',button:'#ipqcc-begin',entry:'品質主資料 → IPQC-C → 現有V2草稿',limit:'全IPQC-C；已有草稿時不顯示開始修改，首次明確套用／儲存經begin採用V3；本批未操作'},
  {scope:'ipqc-ab:A:BORUAXE1021',system:'quality',tab:'quality-ipqc-ab',endpoint:'/api/ipqc-ab/workflow?scope=A%3ABORUAXE1021',ready:'#ipqcab-group',button:'#ipqcab-begin',entry:'品質主資料 → IPQC-AB → 產線／群組 → 現有草稿',limit:'每個產線／群組獨立；24個既有草稿未採用；已有草稿不顯示開始修改，首次明確套用／儲存經begin採用該群組'},
  {scope:'routine-equipment',system:'quality',tab:'quality-routine-equipment',endpoint:'/api/routine-equipment/workflow',ready:'#routine-withdraw',button:'#routine-begin',entry:'品質主資料 → 檢具主資料；品質資料庫核准 → 原V5待審案',limit:'V5仍待審，LEGACY_PENDING_REQUIRES_REVIEW阻擋begin；需由有權人員另行處理案件，本批不處理'}
 ];
 for(const d of definitions){
  if(report.scopes.some(s=>s.scope===d.scope))continue;
  const response=await fetch(base+d.endpoint+(d.endpoint.includes('?')?'&':'?')+'caseMetadata=1',{headers:{Cookie:cookie,Origin:base}});assert.equal(response.status,200,d.scope);const api=await response.json();assert.equal(!!(api.control?.workflow||api.workflow),false,d.scope+' unexpectedly adopted');
  const control=api.control||(d.scope==='ipqc-c'?JSON.parse(before.values.ipqcCMasterControl):null);assert.ok(control,d.scope+' control required');
  const context=await browser.newContext({viewport:{width:1366,height:900}});await context.addCookies([{name:'process_demo',value:cookie.slice('process_demo='.length),url:base}]);await context.addInitScript(()=>localStorage.setItem('processUILanguage','zh'));const blocked=[],errors=[];
  await context.route('**/*',route=>{const r=route.request();if(!['GET','HEAD','OPTIONS'].includes(r.method())){blocked.push({path:new URL(r.url()).pathname,method:r.method()});return route.fulfill({status:423,json:{error:'READ_ONLY_INSPECTION'}});}return route.continue();});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'/process/?system='+d.system+'&view=data&dataTab='+d.tab);await page.waitForFunction(()=>performance.getEntriesByName('process-ready').length>0&&!!window.ProcessSync?.identity?.id);
  if(d.masterScope)await page.locator('[data-master-scope="'+d.masterScope+'"]').click();
  await page.locator(d.ready).waitFor({state:'visible'});
  const beforeSelect=await page.locator(d.button).count();
  if(d.select){let c=JSON.parse(before.values[d.key]);if(d.scope==='fqc')c=c.libraries.fqc;await page.locator(d.select).selectOption(c.activeVersionId);await page.locator(d.button).waitFor({state:'visible'});}
  const count=await page.locator(d.button).count(),visible=count?await page.locator(d.button).isVisible():false,enabled=count?await page.locator(d.button).isEnabled():false;
  report.scopes.push({scope:d.scope,entry:d.entry,limit:d.limit,apiPermissions:api.permissions,workflowAdopted:false,buttonPresentBeforeVersionSelection:beforeSelect>0,beginVisible:visible,beginEnabled:enabled,beginText:count?await page.locator(d.button).innerText():null,actualBeginTested:false,currentOpenStatuses:control.versions.filter(v=>['draft','pending','pending-test'].includes(v.status)).map(v=>({number:v.number,status:v.status}))});
  assert.deepEqual(blocked,[],'Readonly navigation attempted a business write');assert.deepEqual(errors,[]);await page.screenshot({path:path.join(out,'entrance-'+d.scope.replace(/[^a-zA-Z0-9-]/g,'_')+'.png'),fullPage:false});await context.close();console.log('PASS_READONLY',d.scope,'begin visible:',visible);
 }
 const after=await source();assert.equal(after.token,before.token);report.sourceUnchanged=true;report.status='PASS_ACTUAL_LOCAL_READONLY_ENTRANCES';report.finishedAt=new Date().toISOString();
}catch(error){report.status='FAIL';report.error={message:error.message,stack:error.stack};console.error(error);process.exitCode=1;}finally{if(browser)await browser.close();fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'scope-entrances.json'),JSON.stringify(report,null,2));}})();
