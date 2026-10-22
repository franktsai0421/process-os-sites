/* oxlint-disable typescript/no-require-imports -- This browser acceptance harness follows the repository's CommonJS runtime. */
// Real Local image acceptance. Requires the merged canonical-image baseline.
// Uses only loopback demo sessions; never accesses remote R2 or Production.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {createHash}=require('node:crypto');
const {execFileSync}=require('node:child_process');
const runtime=require('./browser-test-runtime.cjs');
process.chdir(runtime.repositoryRoot);
const {chromium}=require(runtime.playwrightModule),origin=runtime.localUrl();
const file='data/canonical/assets/manifest.json';
const records=JSON.parse(fs.readFileSync(file,'utf8')).records;
assert.ok(records.some(record=>record.web),'MERGED_CANONICAL_IMAGE_BASELINE_REQUIRED');
const tracked=new Set(execFileSync('git',['ls-files','data/canonical/assets/web'],{encoding:'utf8'}).trim().split(/\r?\n/));
const digest=buffer=>createHash('sha256').update(buffer).digest('hex');

(async()=>{const browser=await chromium.launch({headless:true,executablePath:runtime.browserExecutable});
 const evidence=[],badImages=[],consoleErrors=[],pageErrors=[],failedRequests=[];
 try{
  async function session(){
   const context=await browser.newContext({viewport:{width:1366,height:900}}),page=await context.newPage();
   page.on('response',response=>{if(response.request().resourceType()==='image'&&response.status()>=400)badImages.push({url:response.url(),status:response.status()});});
   page.on('console',message=>{if(message.type()==='error')consoleErrors.push({message:message.text(),url:message.location().url});});
   page.on('pageerror',error=>pageErrors.push(error.message));
   page.on('requestfailed',request=>{if(request.resourceType()==='image')failedRequests.push({url:request.url(),reason:request.failure()?.errorText});});
   await page.goto(origin+'/process/index.html');await page.locator('[data-quick-login=admin]').click();await page.locator('.nav-item[data-view=editor]').waitFor();
   return {context,page};
  }
  async function select(page,line,category){
   if(await page.locator('#menu-toggle').isVisible()&&!await page.locator('.sidebar.open').count())await page.locator('#menu-toggle').click();
   await page.locator('.nav-item[data-view=editor]').click();await page.locator('#editor-line-select').selectOption(line);await page.locator('#category-select').selectOption(category);
  }
  async function images(page,context,label){
   await page.locator('.operation-block img').evaluateAll(images=>images.forEach(image=>image.loading='eager'));
   await page.waitForFunction(()=>{const images=[...document.querySelectorAll('.operation-block img')];return images.length>0&&images.every(image=>image.complete&&image.naturalWidth>0);},{},{timeout:30000});
   const rows=await page.locator('.operation-block img').evaluateAll(images=>images.map(image=>({flowId:image.closest('.operation-block').dataset.operation,src:image.getAttribute('src'),url:image.src,naturalWidth:image.naturalWidth,naturalHeight:image.naturalHeight})));
   for(const row of rows){
    assert.doesNotMatch(row.src,/placeholder|mock|^data:/i,'must display a real packaged image');
    const url=new URL(row.url);assert.equal(url.origin,origin);assert.equal(url.pathname,'/api/canonical-assets');
    const record=records.find(record=>record.sha256===url.searchParams.get('id')&&!record.deletedAt&&record.web?.sha256===url.searchParams.get('version'));
    assert.ok(record,'image is indexed in the reviewed manifest');
    const relative='data/canonical/'+record.web.path;assert.ok(tracked.has(relative),'image bytes are tracked in Git');
    assert.equal(digest(fs.readFileSync(path.join(runtime.repositoryRoot,relative))),record.web.sha256);
    url.hash='';const response=await context.request.get(url.href);assert.equal(response.status(),200);assert.match(response.headers()['content-type'],/^image\/webp/);
    assert.equal(digest(await response.body()),record.web.sha256,'HTTP bytes match the actual reviewed WebP');
    row.status=response.status();row.contentType=response.headers()['content-type'];row.webSha256=record.web.sha256;
   }
   evidence.push({label,images:rows});console.log(`PASS: ${label}, ${rows.length} actual reviewed images`);return rows;
  }
  const routes=[['A','BORUAXE1021'],['B','PHAODIEN'],['C','TIEN']];
  const first=await session();
  if(process.argv.includes('--smoke')){
   await select(first.page,'A','BORUAXE1021');await images(first.page,first.context,'A/BORUAXE1021: fresh-clone smoke');
   assert.deepEqual(badImages,[]);assert.deepEqual(pageErrors,[]);
   fs.mkdirSync('work/editor-real-images',{recursive:true});
   fs.writeFileSync('work/editor-real-images/smoke-results.json',JSON.stringify({origin,evidence,badImages,pageErrors,actualReviewedWebP:true},null,2));
   await first.context.close();return;
  }
  for(const [line,category] of routes){
   await select(first.page,line,category);const initial=await images(first.page,first.context,`${line}/${category}: initial`);if(line==='A')assert.ok(initial.length>=3);
   if(await first.page.locator('#create-revision').isVisible())await first.page.locator('#create-revision').click();
   const before=await first.page.evaluate(()=>JSON.stringify(ensureCategoryEditor()));
   await first.page.locator('#save-process').click();await first.page.waitForFunction(()=>window.ProcessSync.status==='saved');assert.equal(await first.page.evaluate(()=>window.ProcessSync.flush()),true);
   await images(first.page,first.context,`${line}/${category}: saved draft`);
   await first.page.reload();await select(first.page,line,category);assert.deepEqual(JSON.parse(await first.page.evaluate(()=>JSON.stringify(ensureCategoryEditor()))),JSON.parse(before),'all saved nodes, positions, links and images survive refresh');
   await images(first.page,first.context,`${line}/${category}: refresh`);
   await first.page.locator('#account-button').click();await first.page.locator('#logout-button').click();await first.page.locator('[data-quick-login=admin]').click();await first.page.locator('.nav-item[data-view=editor]').waitFor();await select(first.page,line,category);
   assert.deepEqual(JSON.parse(await first.page.evaluate(()=>JSON.stringify(ensureCategoryEditor()))),JSON.parse(before),'saved image graph survives logout/login');
   await images(first.page,first.context,`${line}/${category}: logout/login`);
   fs.mkdirSync('work/editor-real-images',{recursive:true});await first.page.screenshot({path:`work/editor-real-images/${line}.png`,timeout:15000});
  }
  assert.deepEqual(await first.page.evaluate(()=>Object.keys(localStorage).filter(key=>key.startsWith('processEditor:')||key==='approvalVersions')),[],'native Local Storage is not the image source');
  await first.context.close();
  const fresh=await session();for(const [line,category] of routes){await select(fresh.page,line,category);await images(fresh.page,fresh.context,`${line}/${category}: new incognito context`);}
  await fresh.page.setViewportSize({width:390,height:844});await select(fresh.page,'A','BORUAXE1021');await images(fresh.page,fresh.context,'A/BORUAXE1021: iPhone');
  assert.ok(await fresh.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));await fresh.page.screenshot({path:'work/editor-real-images/A-mobile.png',timeout:15000});
  await fresh.context.close();assert.deepEqual(badImages,[],'no image 404/401/403');assert.deepEqual(pageErrors,[]);
  assert.deepEqual(failedRequests.filter(request=>request.reason!=='net::ERR_ABORTED'),[],'no failed image transport or CORS');
  const result={origin,baseline:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),evidence,badImages,failedRequests,consoleErrors,pageErrors,actualReviewedWebP:true,browserCacheRequired:false};
  fs.writeFileSync('work/editor-real-images/results.json',JSON.stringify(result,null,2));
  console.log(JSON.stringify({result:'PASS',origin,checks:evidence.map(item=>({label:item.label,images:item.images.length})),badImages,pageErrors,consoleErrors},null,2));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
