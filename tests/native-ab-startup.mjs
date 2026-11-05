// Test-only cold startup observation. Never prefetch, warm up or retry the page.
export async function openNativeABDraft(page,url,{timeoutMs=30000,now=Date.now,report=value=>console.error(JSON.stringify(value))}={}){
 const failures=[],pageErrors=[],pending=new Map();let phase='navigation',responseStatus=null,navigationMs=null;const started=now();
 const path=value=>{try{return new URL(value).pathname;}catch{return '[invalid-path]';}};
 const push=value=>{if(failures.length<20)failures.push(value);};
 const request=req=>pending.set(req,{method:req.method(),path:path(req.url())});
 const finished=req=>pending.delete(req);
 const failed=req=>{push({...pending.get(req),path:path(req.url()),kind:'request-failed'});pending.delete(req);};
 const response=res=>{if(res.status()>=400)push({kind:'http',status:res.status(),path:path(res.url())});};
 const pageerror=error=>{if(pageErrors.length<10)pageErrors.push({name:['Error','TypeError','ReferenceError','SyntaxError'].includes(error.name)?error.name:'Error'});};
 for(const [event,handler]of [['request',request],['requestfinished',finished],['requestfailed',failed],['response',response],['pageerror',pageerror]])page.on(event,handler);
 try{
  const response=await page.goto(url);responseStatus=response?.status()??null;navigationMs=now()-started;
  // Replace the old single 30s Begin click with readiness + click sharing 30s.
  const deadline=now()+timeoutMs;
  const remaining=()=>{const value=deadline-now();if(value<=0)throw Error('AB_STARTUP_ACTION_DEADLINE');return value;};
  phase='destination-ready';
  await page.waitForFunction(()=>window.ProcessSync?.destination?.view==='data'&&window.ProcessSync.destination.dataTab==='AB'&&document.documentElement.dataset.processNavigationStatus==='ready',null,{timeout:remaining()});
  phase='begin-click';await page.locator('#master-new-draft').click({timeout:remaining()});
 }catch(error){
  let diagnosticTimer;
  const snapshot=await Promise.race([page.evaluate(()=>({view:window.ProcessSync?.destination?.view??null,tab:window.ProcessSync?.destination?.dataTab??null,status:document.documentElement.dataset.processNavigationStatus??null,bootPresent:!!document.querySelector('#process-boot'),beginPresent:!!document.querySelector('#master-new-draft'),beginDisabled:document.querySelector('#master-new-draft')?.disabled??null})).catch(()=>({unavailable:true})),new Promise(resolve=>{diagnosticTimer=setTimeout(()=>resolve({unavailable:true,diagnosticTimeout:true}),1000);})]);
  clearTimeout(diagnosticTimer);
  report({event:'synthetic-ab-cold-start-failure',phase,elapsedMs:now()-started,navigationMs,pagePath:path(page.url()),responseStatus,snapshot,failures,pending:[...pending.values()].slice(0,20),pageErrors});throw error;
 }finally{
  for(const [event,handler]of [['request',request],['requestfinished',finished],['requestfailed',failed],['response',response],['pageerror',pageerror]])page.off(event,handler);
 }
}
