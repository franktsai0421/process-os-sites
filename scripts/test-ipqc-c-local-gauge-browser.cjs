/* Actual current C UI, local HTTP, real handlers, synthetic identities/SQLite/R2 only. */
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),{chromium}=require('playwright');
const {fixture}=require('./ipqc-c-operation-fixture.cjs');
const gauges=[{id:'old',assetCode:'SYN-OLD',pieceMark:'01',name:'Original gauge'},{id:'next',assetCode:'SYN-NEXT',pieceMark:'02',name:'Next gauge'},{id:'third',assetCode:'SYN-THIRD',pieceMark:'03',name:'Third gauge'},{id:'disabled',assetCode:'SYN-OFF',pieceMark:'04',name:'Disabled gauge',enabled:false}].map((g,i)=>({...g,enabled:g.enabled!==false,photoId:String(i+1).repeat(64)}));
const originalGauge={...gauges[0],name:'Historical original gauge'};delete originalGauge.enabled;
const item={id:'inspection',code:'C100-CUT-L1-01',errorId:'error',productCode:'C100',stageCode:'C-CUT',standard:'10',description:'Synthetic inspection',note:'',reason:'',tool:'',method:'',frequency:'',standardEnabled:false,cpkEnabled:true,notApplicable:false,notApplicableReason:'',deleted:false,equipmentId:'old',equipmentGroupId:'',equipmentSnapshot:originalGauge,mediaItems:[],rule:{cadence:'batch',batchKind:'fixed_count',fixedCount:'3'}};
const content={errors:[{id:'error',code:'C100-CUT-L1',productCode:'C100',stageCode:'C-CUT',name:'Synthetic error',note:'',reason:'',deleted:false}],items:[item]};
const initial={schemaVersion:1,activeVersionId:'formal',versions:[{id:'formal',number:41,status:'approved',snapshot:content,baseVersionId:null,revision:1,creatorId:'synthetic',creatorName:'Synthetic',createdAt:'fixture',updatedAt:'fixture',history:[]}],source:null,issues:[],reservedErrorCodes:[],reservedItemCodes:[]};
(async()=>{
 const h=await fixture({ipqcCMasterControl:JSON.stringify(initial),routineEquipmentControl:JSON.stringify({activeVersionId:'equipment-active',versions:[{id:'equipment-active',status:'approved',categories:[],subcategories:[],groups:[],equipment:gauges}]}),masterDataControl:JSON.stringify({active:{C:{products:[{code:'C100',name:'Synthetic product',stages:['C-CUT']}],lines:[{code:'C',stages:[{code:'C-CUT',name:'Synthetic stage'}]}]}}})});
 await h.begin('ipqc-c');const formalRaw=JSON.stringify(content),errors=[],mutations=[];
 const gif=Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7','base64');
 const scripts=['local-draft-recovery.js','local-draft-recovery-session.js','shared-draft-client.js','version-draft-ui.js','ipqc-c.js'];
 const server=http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,base||'http://fixture');if(url.pathname==='/favicon.ico'){res.writeHead(204);res.end();return;}
  if(url.pathname==='/fixture'){res.setHeader('Content-Type','text/html');res.end(`<!doctype html><html lang="zh"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/process/styles.css"><link rel="stylesheet" href="/process/ipqc-c.css"><link rel="stylesheet" href="/process/version-draft-ui.css"><main id="data-content" data-active-tab="quality-ipqc-c"></main><script>window.ProcessSync={identity:{id:'preview-editor',name:'Synthetic',role:'staff'},identityGeneration:()=>1,captureDelivery:()=>1,isCurrentDelivery:v=>v===1,platformHeaders:()=>({'Content-Type':'application/json'})};window.hasPermission=()=>true;window.toast=()=>{};window.state={};window.bindDataInner=()=>{};window.ProcessIPQC={mountReferences(){},referenceMarkup:()=>''};</script>${scripts.map(name=>'<script src="/process/'+name+'"></script>').join('')}<script>IPQCCUI.mount(document.querySelector('main'));</script></html>`);return;}
  if(url.pathname.startsWith('/process/')){const name=url.pathname.slice(9);if(!/^[\w.-]+$/.test(name))throw Error('INVALID_ASSET');let source=fs.readFileSync('public/process/'+name,'utf8');if(name==='ipqc-c.js')source=source.replace('  window.IPQCCUI={','  window.__gaugeTest={state:()=>({working,localChanges,busy,message})};\n  window.IPQCCUI={');res.setHeader('Content-Type',name.endsWith('.css')?'text/css':'text/javascript');res.end(source);return;}
  // Image bytes are synthetic; real C/equipment snapshot authority uses handlers below.
  if(url.pathname==='/api/routine-equipment/photo'){res.setHeader('Content-Type','image/gif');res.end(gif);return;}
  const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=Buffer.concat(chunks);if(req.method!=='GET')mutations.push({path:url.pathname,body:body.toString()});
  const route=h.load('app'+url.pathname+'/route.ts'),headers=new Headers(req.headers);headers.set('Cookie',h.sessions.editor.Cookie);headers.set('Origin',base);
  const response=await route[req.method](new Request(url,{method:req.method,headers,...(body.length?{body}: {})}));if(response.status>=400)console.error('Synthetic response',url.pathname,response.status,await response.clone().text());res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 }catch(e){errors.push(e.stack);res.writeHead(500);res.end(String(e));}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':chromium.executablePath())});
 try{for(const [width,lang]of [[1440,'zh'],[390,'vi']]){
  const page=await browser.newPage({viewport:{width,height:844}});page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.stack));await page.goto(base+'/fixture');await page.locator('#ipqcc-save').waitFor();
  if(lang==='vi')await page.evaluate(()=>{document.documentElement.lang='vi';dispatchEvent(new CustomEvent('process-language-change',{detail:{language:'vi'}}));});
  const edit=()=>page.locator('[data-ipqcc-edit-item="inspection"]').click();
  const choose=async id=>{await page.locator('#ipqcc-select-equipment').click();await page.locator('[data-ipqcc-equipment="'+id+'"]').click();};
  const finish=async()=>{await page.locator('#ipqcc-editor button[type="submit"]').click();await page.locator('#ipqcc-editor').waitFor({state:'detached'});};
  const card=page.locator('.ipqcc-item').filter({has:page.locator('[data-ipqcc-view-item="inspection"]')});
  const assertCaption=async(id,caption)=>{
   assert.match(await card.locator('.ipqcc-equipment-preview').innerText(),new RegExp(caption));assert((await card.locator('.ipqcc-equipment-preview').getAttribute('href')).includes('equipmentId='+id));
   await card.locator('summary > code').click();assert.match(await card.locator('.ipqcc-item-body .ipqcc-selected-equipment').innerText(),new RegExp(caption));
   for(const selector of ['.ipqcc-equipment-preview img','.ipqcc-item-body .ipqcc-selected-equipment img']){
    const image=card.locator(selector);assert.equal(await image.getAttribute('src'),'/api/routine-equipment/photo?id='+gauges.find(g=>g.id===id).photoId);
    assert.equal(await image.getAttribute('loading'),'lazy');assert.equal(await image.getAttribute('decoding'),'async');await image.scrollIntoViewIfNeeded();
    await image.evaluate(image=>image.decode());const actual=await image.evaluate(image=>{const box=image.getBoundingClientRect();return{natural:[image.naturalWidth,image.naturalHeight],visible:box.width>0&&box.height>0,withinViewport:box.left>=0&&box.right<=innerWidth+1};});
    assert.deepEqual(actual,{natural:[1,1],visible:true,withinViewport:true},'original synthetic image decodes inside the '+width+'px viewport');
   }
  };
  mutations.length=0;const before=h.snapshot();await edit();await choose('next');await finish();
  assert.equal(await page.evaluate(()=>__gaugeTest.state().working.items[0].equipmentId),'next');
  await assertCaption('next','SYN-NEXT'); // Before-fix repro: actual ID next, visible SYN-OLD/photo old.
  assert.equal(mutations.length,0);assert.deepEqual(h.snapshot(),before);
  assert.equal(await page.evaluate(()=>__gaugeTest.state().working.items[0].equipmentSnapshot.id),width===1440?'old':'third','display never rewrites retained snapshot');
  if(width===1440){await edit();await choose('old');await finish();await assertCaption('old','Historical original gauge');await edit();await choose('next');await finish();await assertCaption('next','SYN-NEXT');}
  await edit();await choose('third');await finish();await assertCaption('third','SYN-THIRD');
  await edit();await page.locator('[name="note"]').fill('Unrelated local note '+width);await finish();await assertCaption('third','SYN-THIRD');
  await edit();await choose('old');await page.locator('#ipqcc-cancel').click();await page.locator('#ipqcc-editor').waitFor({state:'detached'});await assertCaption('third','SYN-THIRD');
  await edit();await page.locator('#ipqcc-select-equipment').click();assert.equal(await page.locator('[data-ipqcc-equipment="disabled"]').isDisabled(),true);await page.locator('#ipqcc-equipment-dialog [data-ipqcc-picker-close]').first().click();await page.locator('#ipqcc-cancel').click();await page.locator('#ipqcc-editor').waitFor({state:'detached'});await assertCaption('third','SYN-THIRD');
  await edit();await page.locator('[name="inspectionMode"][value="visual"]').check();await finish();assert.equal(await card.locator('.ipqcc-equipment-preview').count(),0);assert(!await card.locator('.ipqcc-item-body .ipqcc-selected-equipment').innerText().then(s=>s.includes('SYN-')));
  await edit();await page.locator('[name="inspectionMode"][value="equipment"]').check();await page.locator('[data-ipqcc-equipment="third"]').click();await finish();await assertCaption('third','SYN-THIRD');
  const local=await page.evaluate(()=>__gaugeTest.state().localChanges);assert(local.length>1);assert(!local.some(change=>change.patches?.some(p=>p.path.at(-1)==='equipmentSnapshot')),'derived snapshots are never wire patches');assert.equal(mutations.length,0);assert.deepEqual(h.snapshot(),before);
  await page.locator('#ipqcc-save').click();await page.waitForFunction(()=>!__gaugeTest.state().busy&&!__gaugeTest.state().localChanges.length).catch(async e=>{console.error(await page.evaluate(()=>__gaugeTest.state()));throw e;});assert.equal(mutations.length,1);
  const persisted=JSON.parse((await h.core.readState()).values.ipqcCMasterControl);assert.deepEqual(persisted.workflow.saved.content.items[0].equipmentSnapshot,{id:'third',assetCode:'SYN-THIRD',pieceMark:'03',name:'Third gauge',spec:'',photoId:gauges[2].photoId});assert.equal(JSON.stringify(persisted.versions.find(v=>v.id==='formal').snapshot),formalRaw);
  await page.reload();await page.locator('#ipqcc-save').waitFor();await assertCaption('third','SYN-THIRD');
  const fixed=await h.command('ipqc-c','submit',{savedId:persisted.workflow.saved.id,reason:'Synthetic fixed-view proof'});await h.command('ipqc-c','withdraw',{caseId:fixed.receipt.caseId,reason:'Synthetic fixed-view proof'});
  await page.reload();await page.locator('#ipqcc-save').waitFor();const historyParents=page.locator('details').filter({has:page.locator('#ipqcc-case-history')});for(let index=0;index<await historyParents.count();index++)await historyParents.nth(index).locator(':scope > summary').click();await page.locator('#ipqcc-case-history').click();await page.locator('[data-ipqcc-case="'+fixed.receipt.caseId+'"]').click();
  const sections=page.locator('#ipqcc-case-dialog .ipqcc-case-diff > section');assert.match(await sections.nth(0).innerText(),/Historical original gauge/);assert.match(await sections.nth(1).innerText(),/Third gauge/);assert((await sections.nth(0).locator('img').count())===0,'equipment snapshots remain textual in the unchanged fixed-case viewer');
  await page.locator('#ipqcc-case-close').click();
  await page.locator('#ipqcc-version').selectOption('formal');assert.match(await card.locator('.ipqcc-equipment-preview').innerText(),/Historical original gauge/);assert((await card.locator('.ipqcc-equipment-preview img').getAttribute('src')).includes(gauges[0].photoId));
  await page.close();console.log('PASS actual C gauge UI '+width+' '+lang+': repeated local selection, decoded original photos/lazy hints/viewport layout, unrelated edit, cancel, disabled/clear, one Save, reload, immutable formal');
 }
 assert.deepEqual(errors,[]);
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));h.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
