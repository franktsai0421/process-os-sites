import assert from 'node:assert/strict';
export async function checkLinesSoak({page,lines,report}){
 await lines('AB');await page.bringToFront();const session=await page.context().newCDPSession(page);await session.send('Performance.enable');
 const readings=[];
 const sample=async label=>{await session.send('HeapProfiler.collectGarbage');const dom=await session.send('Memory.getDOMCounters'),perf=await session.send('Performance.getMetrics');readings.push({label,...dom,heapBytes:perf.metrics.find(m=>m.name==='JSHeapUsedSize').value});};
 const cycle=async()=>{await page.locator('[data-dual-view="dashboard"]').click();await page.waitForFunction(()=>state.view==='dashboard'&&document.documentElement.dataset.processNavigationStatus==='ready');await page.locator('[data-dual-view="data"]').click();await page.waitForFunction(()=>state.view==='data'&&document.documentElement.dataset.processNavigationStatus==='ready');if(!await page.locator('#master-lines-scope').count())await page.locator('.master-tabs [data-tab="line-admin"]').click();await page.locator('#master-lines-scope').waitFor();};
 for(let i=0;i<5;i++)await cycle();await sample('warmup-5');
 for(let i=1;i<=30;i++){await cycle();if(i%5===0)await sample('cycle-'+i);}
 const requests=[];const record=r=>{if(r.url().includes('/api/master/workflow'))requests.push({path:new URL(r.url()).pathname,method:r.method(),at:Date.now()});};page.on('request',record);
 await page.waitForTimeout(120000);page.off('request',record);await sample('after-120s-idle');await cycle();await sample('usable-after-idle');
 assert.equal(await page.locator('#process-boot').count(),0);assert.equal(await page.locator('#master-lines-scope').count(),1);
 report.soak={idleMs:120000,cycles:35,readings,idleWorkflowRequests:requests.length,note:'Bounded headless sample; not hours-long or physical-device proof'};await session.detach();
}
