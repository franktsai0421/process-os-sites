/* Local HTTP, actual API handlers, Chromium and synthetic DB/R2 only. */
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),{chromium}=require('playwright');
const {fixture}=require('./ipqc-c-operation-fixture.cjs');
const initial={schemaVersion:1,activeVersionId:null,source:null,issues:[],reservedErrorCodes:[],reservedItemCodes:[],versions:[{id:'initial',number:1,status:'draft',snapshot:{errors:[{id:'legacy-error',code:'C100-C-CUT-001',productCode:'C100',stageCode:'C-CUT',name:'Original',note:'retained legacy note',reason:'',deleted:false}],items:[]},baseVersionId:null,revision:1,creatorId:'fixture',creatorName:'fixture',createdAt:'fixture',updatedAt:'fixture',history:[]}]};
// Independent existing groups exercise both local operation orders without peers.
for(const [index,id]of ['delete-1440-create-first','delete-1440-delete-first','delete-390-create-first','delete-390-delete-first','delete-peer-conflict'].entries())initial.versions[0].snapshot.errors.push({...initial.versions[0].snapshot.errors[0],id,code:'C100-C-CUT-'+String(index+2).padStart(3,'0'),name:id});
(async()=>{
 const h=await fixture({routineEquipmentControl:JSON.stringify({activeVersionId:'eq-active',versions:[{id:'eq-active',status:'approved',categories:[],subcategories:[],groups:[],equipment:[{id:'eq-one',enabled:true,assetCode:'SYN-1',pieceMark:'1',name:'Synthetic one'},{id:'eq-two',enabled:true,assetCode:'SYN-2',pieceMark:'2',name:'Synthetic two'}]}]}),ipqcCMasterControl:JSON.stringify(initial),masterDataControl:JSON.stringify({active:{C:{products:[{code:'C100',name:'Fixture',stages:['C-CUT','C-OTHER']},{code:'C200',name:'Other product',stages:['C-OTHER']}],lines:[{code:'C',stages:[{code:'C-CUT',name:'Cut'},{code:'C-OTHER',name:'Other'}]}]}}})});

 const initialAuthority=await h.read('ipqc-c');assert.equal(initialAuthority.workflow,null);assert.deepEqual(initialAuthority.beginBasis,{generation:null,activeVersionId:null,openVersionId:'initial',openVersionStatus:'draft',openVersionRevision:1},'unadopted Begin authority preserves legacy draft basis');
 let dropSave=false,holdRecoveryRead=false,releaseRecoveryRead,notifyRecoveryRead,receiptReads=0,receiptMissing=false;const mutations=[],errors=[];
 const scripts=['local-draft-recovery.js','local-draft-recovery-session.js','shared-draft-client.js','version-draft-ui.js','ipqc-c.js'];
 const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,base);if(url.searchParams.has('operationId'))receiptReads++;
 if(receiptMissing&&url.searchParams.has('operationId')){res.writeHead(404,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'OPERATION_NOT_FOUND'}));return;}
 if(url.pathname==='/favicon.ico'){res.writeHead(204);res.end();return;}
 if(url.pathname==='/fixture'){res.setHeader('Content-Type','text/html');res.end(`<!doctype html><html lang="zh"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/process/styles.css"><link rel="stylesheet" href="/process/ipqc-c.css"><link rel="stylesheet" href="/process/version-draft-ui.css"><main id="data-content" data-active-tab="quality-ipqc-c"></main><script>window.__delivery=1;window.ProcessSync={captureDelivery:()=>window.__delivery,isCurrentDelivery:value=>value===window.__delivery,identity:{id:'preview-editor',name:'Synthetic editor',role:'staff'},identityGeneration:()=>1,platformHeaders:()=>({'Content-Type':'application/json'})};window.hasPermission=()=>true;window.toast=()=>{};window.state={};window.bindDataInner=()=>{};window.ProcessIPQC={mountReferences(){},referenceMarkup:()=>''};</script>${scripts.map(name=>'<script src="/process/'+name+'"></script>').join('')}<script>IPQCCUI.mount(document.querySelector('main'));</script></html>`);return;}
 if(url.pathname.startsWith('/process/')){const name=url.pathname.slice(9);if(!/^[\w.-]+$/.test(name))throw Error('BAD_ASSET');let source=fs.readFileSync('public/process/'+name,'utf8');if(name==='ipqc-c.js')source=source.replace('  window.IPQCCUI={',`  window.__localTest={read:()=>read(false),state:()=>({working,localChanges,message,busy,unknown:sharedClient?.hasUnknown()}),client:sharedTransport,edit:()=>startEditor('error',working.errors[0])};\n  window.IPQCCUI={`);res.setHeader('Content-Type',name.endsWith('.css')?'text/css':'text/javascript');res.end(source);return;}
 if(holdRecoveryRead&&req.method==='GET'&&url.pathname==='/api/ipqc-c/workflow'&&!url.searchParams.has('permissions')&&!url.searchParams.has('operationId')&&receiptReads>0){holdRecoveryRead=false;await new Promise(resolve=>{releaseRecoveryRead=resolve;notifyRecoveryRead();});}
 const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=Buffer.concat(chunks);if(req.method!=='GET')mutations.push({path:url.pathname,body:body.toString()});
 const endpoint=url.pathname.replace('/api/',''),route=h.load('app/api/'+endpoint+'/route.ts');const headers=new Headers(req.headers);headers.set('Cookie',h.sessions.editor.Cookie);headers.set('Origin',base);const response=await route[req.method](new Request(url,{method:req.method,headers,...(body.length?{body}: {})}));if(dropSave&&req.method==='POST'&&response.status===200){dropSave=false;res.writeHead(200,{'Content-Type':'application/json'});res.end('{}');return;}res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 }catch(e){errors.push(e.stack);res.writeHead(500);res.end(String(e));}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':chromium.executablePath()),headless:true});
 try{for(const width of [1440,390]){
 const page=await browser.newPage({viewport:{width,height:844}});page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.stack));await page.goto(base+'/fixture');await page.locator('#ipqcc-save').waitFor();mutations.length=0;
 await page.evaluate(()=>__localTest.edit());await page.locator('input[name="name"]').fill('Local '+width);await page.locator('#ipqcc-editor button[type="submit"]').click();await page.locator('#ipqcc-editor').waitFor({state:'detached'});
 assert.equal(mutations.length,0,'Finish never writes');assert.equal(await page.evaluate(()=>__localTest.state().localChanges.length),1);
 await page.locator('#ipqcc-search').fill('C100');await page.evaluate(()=>__localTest.read());assert.equal(await page.evaluate(()=>__localTest.state().working.errors[0].name),'Local '+width,'read/filter preserves input');
 await page.locator('#ipqcc-save').click();await page.waitForFunction(()=>__localTest.state().localChanges.length===0&&!__localTest.state().busy,{},{timeout:10000}).catch(async e=>{console.error(await page.evaluate(()=>__localTest.state()),mutations,errors);throw e;});
 assert.equal(mutations.filter(m=>m.path.endsWith('/workflow')&&JSON.parse(m.body).command?.action==='save').length,1);const begins=mutations.filter(m=>m.path.endsWith('/workflow')&&JSON.parse(m.body).action==='begin-v1');assert.equal(begins.length,width===1440?1:0,'legacy first Save adopts once with a durable Begin identity');for(const mutation of begins)assert.match(JSON.parse(mutation.body).begin.operationId,/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i);assert.equal(mutations.filter(m=>JSON.parse(m.body).action==='begin').length,0,'no legacy Begin fallback');const savedControl=(await h.call('ipqc-c','GET',undefined,'editor',200,'?caseMetadata=1')).control,flow=savedControl.workflow,currentAuthority=await h.read('ipqc-c'),opened=savedControl.versions.find(v=>v.status==='draft');assert.deepEqual(currentAuthority.beginBasis,{generation:flow.generation,activeVersionId:savedControl.activeVersionId,openVersionId:opened.id,openVersionStatus:opened.status,openVersionRevision:opened.revision},'adopted Begin authority matches current workflow and draft metadata');assert.equal(flow.saved.content.errors[0].name,'Local '+width);assert.equal(flow.saved.content.errors[0].note,width===1440?'retained legacy note':'After explicit discard');
 // Consecutive new errors after legacy adoption and after receipt-only recovery.
 const newError=async name=>{await page.locator('[data-ipqcc-add="error"]').click();await page.locator('input[name="name"]').fill(name);await page.locator('#ipqcc-editor button[type="submit"]').click();};
 for(const name of ['First new '+width,'Second new '+width]){
  mutations.length=0;await newError(name);await page.locator('#ipqcc-editor').waitFor({state:'detached'});assert.equal(mutations.length,0);
  await page.locator('#ipqcc-save').click();await page.waitForFunction(()=>!__localTest.state().busy&&!__localTest.state().localChanges.length);
  assert.equal(await page.evaluate(()=>__localTest.state().unknown),false);
  assert.equal(h.flow(await h.call('ipqc-c','GET',undefined,'editor',200,'?caseMetadata=1')).saved.content.errors.filter(row=>row.name===name).length,1);
 }
 if(width===1440){
  mutations.length=0;await newError('Receipt original');await page.locator('#ipqcc-editor').waitFor({state:'detached'});dropSave=true;receiptMissing=true;
  await page.locator('#ipqcc-save').click();await page.waitForFunction(()=>!__localTest.state().busy&&__localTest.state().unknown);
  const originalMarkers=await page.evaluate(()=>Object.entries(sessionStorage).filter(([key])=>key.startsWith('shared-draft-receipt-only-v1:')));
  const before=h.snapshot();await newError('Blocked local form');
  assert.equal(await page.locator('#ipqcc-editor').count(),1);assert.match(await page.evaluate(()=>__localTest.state().message),/查證操作結果/);assert.equal(mutations.length,1);
  page.once('dialog',dialog=>dialog.accept());await page.locator('#ipqcc-cancel').click();await page.locator('#ipqcc-check-operation').click();await page.waitForFunction(()=>!__localTest.state().busy);
  assert.equal(await page.evaluate(()=>__localTest.state().unknown),true,'404 never unlocks original operation');assert.deepEqual(h.snapshot(),before);assert.equal(mutations.length,1);
  receiptMissing=false;await page.locator('#ipqcc-check-operation').click();await page.waitForFunction(()=>!__localTest.state().busy&&!__localTest.state().unknown);
  assert.equal(await page.evaluate(()=>__localTest.state().localChanges.length),0,'confirmed original local Save must not remain staged for a duplicate Save');
  assert(originalMarkers.length>0);assert.equal(mutations.length,1,'query never resends');
  await newError('After receipt query');await page.locator('#ipqcc-editor').waitFor({state:'detached'});await page.locator('#ipqcc-save').click();await page.waitForFunction(()=>!__localTest.state().busy&&!__localTest.state().localChanges.length);
  assert.equal(mutations.length,2);assert.equal(h.flow(await h.call('ipqc-c','GET',undefined,'editor',200,'?caseMetadata=1')).saved.content.errors.filter(row=>row.name==='Receipt original').length,1);
 }
 // Restore the original parent for the independent item scenarios.
 await page.locator('[data-ipqcc-error="legacy-error"] > div').first().click();
 mutations.length=0;
 await page.locator('[data-ipqcc-add="item"]').click();await page.locator('textarea[name="description"]').fill('Inspection photo and rule');await page.locator('input[name="standard"]').count().then(async count=>{if(count)await page.locator('input[name="standard"]').fill('10');else await page.locator('textarea[name="standard"]').fill('10');});
 await page.locator('input[name="cpkEnabled"]').check();await page.locator('[name="batchKind"]').selectOption('fixed_count');await page.locator('input[name="fixedCount"]').fill('3');
 await page.locator('[name="inspectionMode"][value="equipment"]').check();await page.locator('[data-ipqcc-equipment="'+(width===1440?'eq-one':'eq-two')+'"]').click();
 await page.locator('#ipqcc-photo-input').setInputFiles({name:'fixture.gif',mimeType:'image/gif',buffer:Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7','base64')});
 await page.locator('#ipqcc-editor button[type="submit"]').click();await page.locator('#ipqcc-editor').waitFor({state:'detached'});assert.equal(mutations.length,0,'photos remain local until Save');
 await page.locator('#ipqcc-search').fill('');await page.locator('[data-ipqcc-product="C200"]').click();await page.locator('[data-ipqcc-product="C100"]').click();await page.locator('[data-ipqcc-stage="C-OTHER"]').click();await page.locator('[data-ipqcc-stage="C-CUT"]').click();await page.locator('[data-ipqcc-error="legacy-error"] > div').first().click();await page.locator('#ipqcc-search').fill('C1');assert.equal(await page.evaluate(()=>__localTest.state().localChanges.length),1);
 await page.locator('#ipqcc-save').click();await page.waitForFunction(()=>__localTest.state().localChanges.length===0&&!__localTest.state().busy).catch(async e=>{console.error(await page.evaluate(()=>__localTest.state()),errors);throw e;});
 assert.equal(mutations.filter(m=>m.path.endsWith('/photo')).length,1);assert.equal(mutations.filter(m=>m.path.endsWith('/workflow')).length,1);
 const withPhoto=h.flow(await h.call('ipqc-c','GET',undefined,'editor',200,'?caseMetadata=1'));assert.equal(withPhoto.saved.content.items.at(-1).cpkEnabled,true);assert.equal(withPhoto.saved.content.items.at(-1).mediaItems.length,1);assert.equal(withPhoto.saved.content.items.at(-1).equipmentId,width===1440?'eq-one':'eq-two');assert.deepEqual(withPhoto.saved.content.items.at(-1).rule,{cadence:'batch',batchKind:'fixed_count',fixedCount:'3'});
 if(width===1440){
 mutations.length=0;
 await page.evaluate(()=>__localTest.edit());await page.locator('[name="note"]').fill('Local conflicting note');await page.locator('#ipqcc-editor button[type="submit"]').click();
 const peerBefore=h.flow(await h.read('ipqc-c')),peerError=peerBefore.working.errors[0],notePath=['errors',{id:peerError.id},'note'];
 await h.command('ipqc-c','apply',{patches:[{op:'set',path:notePath,value:'Peer saved note'}],guards:[{path:notePath,value:peerError.note}]},'edit-only');
 await h.command('ipqc-c','save',{},'edit-only');const peerSaved=h.snapshot();
 await page.locator('#ipqcc-save').click();await page.locator('#ipqcc-reload').waitFor();
 assert.equal(await page.evaluate(()=>__localTest.state().unknown),false,'proven conflict is not unknown');
 assert.deepEqual(h.snapshot(),peerSaved,'rejected local batch preserves peer saved state');
 const rejectedCount=mutations.length;
 page.once('dialog',dialog=>dialog.dismiss());await page.locator('#ipqcc-reload').click();
 assert.equal(await page.evaluate(()=>__localTest.state().working.errors[0].note),'Local conflicting note','cancel retains local input');assert.equal(mutations.length,rejectedCount);
 await page.evaluate(()=>{window.__originalConfirm=window.confirm;window.confirm=()=>{window.__delivery++;return true;};});await page.locator('#ipqcc-reload').click();
 assert.equal(await page.evaluate(()=>__localTest.state().working.errors[0].note),'Local conflicting note','delivery changed during confirmation cannot discard');assert.equal(mutations.length,rejectedCount);
 await page.evaluate(()=>{window.confirm=window.__originalConfirm;window.__delivery--;});
 page.once('dialog',dialog=>dialog.accept());await page.locator('#ipqcc-reload').click();
 await page.waitForFunction(()=>!__localTest.state().busy&&__localTest.state().localChanges.length===0);
 assert.equal(await page.evaluate(()=>__localTest.state().working.errors[0].note),'Peer saved note');assert.equal(mutations.length,rejectedCount,'discard is read-only and never replays rejected Save');assert.deepEqual(h.snapshot(),peerSaved);
 await page.evaluate(()=>__localTest.edit());await page.locator('[name="note"]').fill('After explicit discard');await page.locator('#ipqcc-editor button[type="submit"]').click();await page.locator('#ipqcc-save').click();
 await page.waitForFunction(()=>!__localTest.state().busy&&__localTest.state().localChanges.length===0);
 assert.equal(h.flow(await h.call('ipqc-c','GET',undefined,'editor',200,'?caseMetadata=1')).saved.content.errors[0].note,'After explicit discard');assert.equal(mutations.length,rejectedCount+1,'later Save is a new single operation');
 }
 // Real UI stages each action; the actual HTTP route must save one atomic batch.
 const createLocalItem=async description=>{await page.locator('[data-ipqcc-error="legacy-error"] > div').first().click();await page.locator('[data-ipqcc-add="item"]').click();await page.locator('textarea[name="description"]').fill(description);await page.locator('[name="standard"]').fill('batch standard');await page.locator('input[name="aqlValue"]').fill('0.25');await page.locator('#ipqcc-editor button[type="submit"]').click();await page.locator('#ipqcc-editor').waitFor({state:'detached'});};
 const deleteOtherError=async id=>{const accept=dialog=>void dialog.accept();page.on('dialog',accept);try{await page.locator('[data-ipqcc-delete-error="'+id+'"]').click();}finally{page.off('dialog',accept);}};
 for(const order of ['create-first','delete-first']){
  mutations.length=0;const target='delete-'+width+'-'+order,description='Batch '+width+' '+order,before=h.snapshot();
  if(order==='create-first'){await createLocalItem(description);await deleteOtherError(target);}else{await deleteOtherError(target);await createLocalItem(description);}
  assert.equal(mutations.length,0,'local create/delete order sends no workflow writes');assert.deepEqual(h.snapshot(),before);
  assert.equal(await page.evaluate(()=>__localTest.state().localChanges.length),2);
  const saved=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/ipqc-c/workflow'&&response.request().method()==='POST');await page.locator('#ipqcc-save').click();const response=await saved;assert.equal(response.status(),200,await response.text());
  await page.waitForFunction(()=>!__localTest.state().busy&&__localTest.state().localChanges.length===0);
  assert.equal(mutations.length,1,'one atomic Save for either local action order');const command=JSON.parse(mutations[0].body).command;assert.equal(command.action,'save');
  const result=h.flow(await h.call('ipqc-c','GET',undefined,'editor',200,'?caseMetadata=1')),item=result.saved.content.items.find(row=>row.description===description);
  assert(item&&!item.deleted);assert.equal(item.errorId,'legacy-error');assert(!item.id.startsWith('local-'));assert.notEqual(item.code,'尚未存取');assert.notEqual(item.code,'Chưa lưu');assert.equal(result.saved.content.errors.find(row=>row.id===target).deleted,true);assert.equal(result.saved.content.errors.find(row=>row.id==='legacy-error').deleted,false);assert.deepEqual(result.saved.content,result.working);
 }
 if(width===1440){
  mutations.length=0;await createLocalItem('Retain rejected batch item');await deleteOtherError('delete-peer-conflict');const beforeLocal=await page.evaluate(()=>{const {working,localChanges}=__localTest.state();return {working,localChanges};});
  const peerFlow=h.flow(await h.read('ipqc-c')),peerItem=peerFlow.working.items.find(row=>!row.deleted),path=['items',{id:peerItem.id},'standard'];
  await h.command('ipqc-c','apply',{patches:[{op:'set',path,value:'Genuine peer standard'}],guards:[{path,value:peerItem.standard}]},'edit-only');await h.command('ipqc-c','save',{},'edit-only');const peerSaved=h.snapshot();
  const rejected=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/ipqc-c/workflow'&&response.request().method()==='POST');await page.locator('#ipqcc-save').click();const response=await rejected;assert.equal(response.status(),409);assert.equal((await response.json()).error,'DEPENDENCY_CHANGED_RECONFIRM');await page.waitForFunction(()=>!__localTest.state().busy);
  assert.equal(mutations.length,1);assert.deepEqual(h.snapshot(),peerSaved,'real peer conflict must reject entire batch');
  const local=await page.evaluate(()=>__localTest.state());assert.deepEqual({working:local.working,localChanges:local.localChanges},beforeLocal,'rejection retains every staged field and dependency guard');assert.equal(local.unknown,false);assert.equal(local.localChanges.length,2);assert(local.working.items.some(row=>row.description==='Retain rejected batch item'&&row.id.startsWith('local-')));assert.equal(local.working.errors.find(row=>row.id==='delete-peer-conflict').deleted,true);
  page.once('dialog',dialog=>dialog.accept());await page.locator('#ipqcc-reload').click();await page.waitForFunction(()=>!__localTest.state().busy&&__localTest.state().localChanges.length===0);assert.equal(mutations.length,1,'explicit discard performs no retry');assert.deepEqual(h.snapshot(),peerSaved);
 }
 await page.evaluate(()=>{document.documentElement.lang='vi';dispatchEvent(new CustomEvent('process-language-change',{detail:{language:'vi'}}));});assert.equal(await page.locator('#ipqcc-save').innerText(),'Lưu');
 if(width===390){
 mutations.length=0;await page.evaluate(()=>__localTest.edit());await page.locator('input[name="name"]').fill('Recovered receipt');await page.locator('#ipqcc-editor button[type="submit"]').click();dropSave=true;
 const recoveryReadHeld=new Promise(resolve=>{notifyRecoveryRead=resolve;});holdRecoveryRead=true;receiptReads=0;
 let readDeadline;
 await page.locator('#ipqcc-save').click();
 try{await Promise.race([recoveryReadHeld,new Promise((_,reject)=>{readDeadline=setTimeout(()=>reject(Error('Recovery read did not start')),10000);})]);}finally{clearTimeout(readDeadline);}
 const markers=await page.evaluate(()=>Object.entries(sessionStorage).filter(([key])=>key.startsWith('shared-draft-receipt-only-v1:')));
 try{
 assert.equal(await page.locator('#ipqcc-save').isDisabled(),true,'pending operation immediately disables Save');assert.equal(await page.locator('#ipqcc-save').getAttribute('aria-busy'),'true');assert.match(await page.locator('#ipqcc-save').innerText(),/Đang lưu|存取中/);
 assert.equal(receiptReads,1,'malformed ACK is recovered by the original receipt');
 assert.equal(await page.evaluate(()=>__localTest.state().unknown),true,'unfinished readback is not success or failure');
 assert.equal(await page.evaluate(()=>sharedDraftAccountState().queued>0),true,'mutation state stays queued');
 assert.equal(await page.evaluate(()=>sharedDraftNavigationState().queued),0,'C write does not block browsing');
 assert.equal(await page.evaluate(()=>IPQCCUI.navigation.departure.inspect().state),'clean','navigation may leave without settling the write');
 assert(markers.length>0,'original operation has a durable marker');
 assert.equal(await page.evaluate(()=>{const event=new Event('beforeunload',{cancelable:true});window.dispatchEvent(event);return event.defaultPrevented;}),false,'C unknown alone does not prompt on close');
 await page.evaluate(()=>{IPQCCUI.navigation.departure.closeClean();IPQCCUI.navigation.reset();window.__delivery++;document.querySelector('main').innerHTML='<p id="other-data">Other data</p>';});
 assert.equal(await page.locator('#other-data').innerText(),'Other data');
 assert.deepEqual(await page.evaluate(()=>Object.entries(sessionStorage).filter(([key])=>key.startsWith('shared-draft-receipt-only-v1:'))),markers,'navigation retains original operation identity');
 }finally{releaseRecoveryRead();}
 // A fresh destination owner recovers the same receipt. It never replays Save.
 await page.evaluate(()=>IPQCCUI.mount(document.querySelector('main')));await page.locator('#ipqcc-save').waitFor();
 assert.equal(await page.evaluate(()=>__localTest.state().unknown),true);
 assert.equal(mutations.filter(m=>m.path.endsWith('/workflow')).length,1,'returning does not auto-resend');
 await page.locator('#ipqcc-save').click();await page.waitForFunction(()=>!__localTest.state().busy&&!__localTest.state().unknown);
 assert.equal(mutations.filter(m=>m.path.endsWith('/workflow')).length,1,'lost ACK checks receipt without resending');
 }
 await page.evaluate(()=>__localTest.edit());await page.locator('input[name="name"]').fill('Abandoned');assert.equal(await page.evaluate(()=>IPQCCUI.navigation.departure.inspect().state),'clean');await page.evaluate(()=>IPQCCUI.navigation.departure.closeClean());assert.equal(await page.locator('#ipqcc-editor').count(),1,'departure closes model; navigation replaces DOM');
 await page.reload();await page.locator('#ipqcc-save').waitFor();assert.equal(await page.evaluate(()=>__localTest.state().working.errors[0].name),width===390?'Recovered receipt':'Local '+width);
 const layout=await page.evaluate(()=>({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));assert(layout.scroll<=layout.width+1,JSON.stringify(layout));await page.close();
 }
 assert.deepEqual(errors,[]);console.log('PASS Chromium 1440/390: local edit, filter/read preservation, one Save POST, shared saved result, silent departure and reload; both create-item/delete-other-error orders and genuine peer batch conflict');
 }finally{releaseRecoveryRead?.();await browser.close();await new Promise(resolve=>server.close(resolve));h.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
