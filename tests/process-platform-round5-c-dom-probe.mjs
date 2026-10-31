// One diagnostic, readonly C-panel DOM snapshot. No performance claims, Begin,
// Apply or Save. Only the isolated synthetic fixture and session are created.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createProcessPlatformRound5Fixture} from './process-platform-round5-fixture.mjs';

const folder=path.resolve(process.env.PROFILE_FOLDER||'.sites-runtime/process-platform-round5/profile-500');
assert(folder.startsWith(path.resolve('.sites-runtime')+path.sep));fs.mkdirSync(folder,{recursive:true});
const report={status:'RUNNING',purpose:'Candidate-only readonly DOM profiling probe, not timing or baseline comparison',postRequests:[],businessWrites:[],data:{ipqcItemsPerSource:500,aCanvasNodes:15,cCanvasNodes:1,synthetic:true}};
let fixture,browser,context;
try{
 fixture=await createProcessPlatformRound5Fixture({ipqcItems:500,canvasNodes:15});report.buildEntrySha256=fixture.buildEntrySha256;report.fixtureHash=fixture.fixtureHash;report.counts=fixture.counts;
 browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-background-networking']});context=await browser.newContext({viewport:{width:1365,height:900},serviceWorkers:'block'});
 await context.route('**/*',route=>new URL(route.request().url()).origin===fixture.url.origin?route.continue():route.abort());const page=await context.newPage();page.setDefaultTimeout(30000);
 page.on('request',request=>{if(new URL(request.url()).pathname.startsWith('/api/')&&request.method()==='POST'){const entry={path:new URL(request.url()).pathname};report.postRequests.push(entry);if(entry.path!=='/api/platform-login')report.businessWrites.push(entry);}});
 await page.goto(fixture.url.origin+'/login?view=editor');await page.locator('#id').fill(fixture.actors.editor);await page.locator('#password').fill(fixture.password);await page.locator('.site-entry-submit').click();
 await page.waitForFunction(()=>window.ProcessSync?.destination?.view==='editor'&&document.documentElement.dataset.processNavigationStatus==='ready'&&!!window.ProcessAuthoringV3?.flow());
 await page.locator('#editor-line-select').selectOption('C');await page.locator('.pe-card[data-node="round5-c-operation"] [data-pe="edit"]').click();await page.locator('.pe-modal-tabs [data-tab="ipqc"]').click();
 await page.waitForFunction(()=>document.querySelectorAll('.pe-c-ipqc-query .process-ipqc-choice').length===500&&!!document.querySelector('.pe-c-ipqc-query [data-c-query-reload]'));
 report.snapshot=await page.evaluate(()=>{
  const panel=document.querySelector('.pe-c-ipqc-query'),articles=[...panel.querySelectorAll('.process-ipqc-choice')];
  const rect=element=>{const r=element.getBoundingClientRect();return{x:r.x,y:r.y,top:r.top,bottom:r.bottom,left:r.left,right:r.right,width:r.width,height:r.height};};
  const ancestors=[],clip={left:0,top:0,right:innerWidth,bottom:innerHeight};
  for(let element=panel; element; element=element.parentElement){const style=getComputedStyle(element),r=rect(element),clipsX=['auto','scroll','hidden','clip'].includes(style.overflowX),clipsY=['auto','scroll','hidden','clip'].includes(style.overflowY);
   if(clipsX){clip.left=Math.max(clip.left,r.left);clip.right=Math.min(clip.right,r.right);}if(clipsY){clip.top=Math.max(clip.top,r.top);clip.bottom=Math.min(clip.bottom,r.bottom);}
   if(clipsX||clipsY)ancestors.push({tag:element.tagName,id:element.id,className:element.className,overflowX:style.overflowX,overflowY:style.overflowY,scrollHeight:element.scrollHeight,clientHeight:element.clientHeight,scrollTop:element.scrollTop,rect:r});
  }
  const rectangles=articles.map(rect),heights=rectangles.map(r=>r.height).sort((a,b)=>a-b),visible=rectangles.filter(r=>r.bottom>clip.top&&r.top<clip.bottom&&r.right>clip.left&&r.left<clip.right);
  return{viewport:{width:innerWidth,height:innerHeight},articleCount:articles.length,documentElementCount:document.querySelectorAll('*').length,panelElementCount:panel.querySelectorAll('*').length,firstArticleElementCount:articles[0].querySelectorAll('*').length,firstArticleRect:rectangles[0],firstArticleStyle:{contentVisibility:getComputedStyle(articles[0]).contentVisibility,contain:getComputedStyle(articles[0]).contain,containIntrinsicSize:getComputedStyle(articles[0]).containIntrinsicSize},articleHeight:{min:heights[0],median:heights[Math.floor(heights.length/2)],max:heights.at(-1)},panelRect:rect(panel),clip,visibleArticleCount:visible.length,clippingAncestors:ancestors,images:{total:panel.querySelectorAll('img').length,complete:[...panel.querySelectorAll('img')].filter(image=>image.complete&&image.naturalWidth>0).length},semantics:{checkboxes:panel.querySelectorAll('[data-ipqc-choice]').length,alerts:panel.querySelectorAll('[role="alert"]').length},interpretation:'Visibility is rectangle intersection with viewport and overflow clipping ancestors. This is a single read after render, not paint visibility, browser find, accessibility, or content-visibility compatibility testing.'};
 });
 assert.equal(report.snapshot.articleCount,500);assert.equal(report.snapshot.semantics.checkboxes,0);assert.equal(report.snapshot.semantics.alerts,0);assert.deepEqual(report.businessWrites,[]);
 report.status='PASS';
}catch(error){report.status='FAIL';report.errorName=error.name;report.failureStage='Readonly C-panel DOM probe';process.exitCode=1;}
finally{await context?.close();await browser?.close();await fixture?.close();fs.writeFileSync(path.join(folder,'candidate-c-dom-snapshot.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,articleCount:report.snapshot?.articleCount,visibleArticleCount:report.snapshot?.visibleArticleCount}));}
