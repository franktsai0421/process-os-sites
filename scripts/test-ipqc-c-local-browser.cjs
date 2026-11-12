/* Local HTTP, actual API handlers, Chromium and synthetic DB/R2 only. */
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),{chromium}=require('playwright');
const {fixture}=require('./ipqc-c-operation-fixture.cjs');
const initial={schemaVersion:1,activeVersionId:null,source:null,issues:[],reservedErrorCodes:[],reservedItemCodes:[],versions:[{id:'initial',number:1,status:'draft',snapshot:{errors:[{id:'legacy-error',code:'C100-C-CUT-001',productCode:'C100',stageCode:'C-CUT',name:'Original',note:'retained legacy note',reason:'',deleted:false}],items:[]},baseVersionId:null,revision:1,creatorId:'fixture',creatorName:'fixture',createdAt:'fixture',updatedAt:'fixture',history:[]}]};
// Independent existing groups exercise both local operation orders without peers.
for(const [index,id]of ['delete-1440-create-first','delete-1440-delete-first','delete-390-create-first','delete-390-delete-first','delete-peer-conflict'].entries())initial.versions[0].snapshot.errors.push({...initial.versions[0].snapshot.errors[0],id,code:'C100-C-CUT-'+String(index+2).padStart(3,'0'),name:id});
const profile=process.env.IPQCC_PROFILE==='1',networkProfile=[],browserProfile=[];
const evidence=process.env.IPQCC_EVIDENCE_DIR;if(evidence){assert(require('node:path').isAbsolute(evidence));fs.mkdirSync(evidence,{recursive:true,mode:0o700});}
function syntheticProfilePhoto(){
 const width=480,height=240,raw=Buffer.alloc(height*(1+width*3));
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)for(let c=0;c<3;c++)raw[y*(1+width*3)+1+x*3+c]=(x*13+y*7+c*71)%256;
 const chunk=(name,data)=>{const type=Buffer.from(name),body=Buffer.concat([type,data]);let crc=0xffffffff;for(const byte of body){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}const result=Buffer.alloc(data.length+12);result.writeUInt32BE(data.length);body.copy(result,4);result.writeUInt32BE((crc^0xffffffff)>>>0,result.length-4);return result;};
 const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=2;
 return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',header),chunk('IDAT',require('node:zlib').deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}

if(profile){
 const seed=initial.versions[0].snapshot;
 for(let i=seed.errors.length;i<869;i++)seed.errors.push({...seed.errors[0],id:'synthetic-error-'+i,code:'SYN-E-'+i,name:'Synthetic error '+i});
 for(let i=0;i<866;i++)seed.items.push({id:'synthetic-item-'+i,code:'SYN-I-'+i,errorId:seed.errors[i].id,productCode:'C100',stageCode:'C-CUT',standard:'10 mm',description:'Synthetic inspection '+i,note:'',reason:'',tool:'',method:'',frequency:'',standardEnabled:true,cpkEnabled:false,notApplicable:false,deleted:false,equipmentId:'',equipmentGroupId:'',equipmentSnapshot:null,mediaItems:[],rule:{cadence:'batch',batchKind:'fixed_count',fixedCount:'3'}});
}
(async()=>{
 const h=await fixture({routineEquipmentControl:JSON.stringify({activeVersionId:'eq-active',versions:[{id:'eq-active',status:'approved',categories:[],subcategories:[],groups:[],equipment:[{id:'eq-one',enabled:true,assetCode:'SYN-1',pieceMark:'1',name:'Synthetic one'},{id:'eq-two',enabled:true,assetCode:'SYN-2',pieceMark:'2',name:'Synthetic two'}]}]}),ipqcCMasterControl:JSON.stringify(initial),masterDataControl:JSON.stringify({active:{C:{products:[{code:'C100',name:'Fixture',stages:['C-CUT','C-OTHER']},{code:'C200',name:'Other product',stages:['C-OTHER']}],lines:[{code:'C',stages:[{code:'C-CUT',name:'Cut'},{code:'C-OTHER',name:'Other'}]}]}}})});

 const initialAuthority=await h.read('ipqc-c');assert.equal(initialAuthority.workflow,null);assert.deepEqual(initialAuthority.beginBasis,{generation:null,activeVersionId:null,openVersionId:'initial',openVersionStatus:'draft',openVersionRevision:1},'unadopted Begin authority preserves legacy draft basis');
 let saveRace=null,photoRace=null,holdSaveACK=false,releaseSaveACK,notifySaveACK;
 let dropSave=false,holdRecoveryRead=false,releaseRecoveryRead,notifyRecoveryRead,receiptReads=0,receiptMissing=false;const mutations=[],errors=[];
 const scripts=['local-draft-recovery.js','local-draft-recovery-session.js','shared-draft-client.js','version-draft-ui.js','ipqc-c.js'];
 const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,base);if(url.searchParams.has('operationId'))receiptReads++;
 if(receiptMissing&&url.searchParams.has('operationId')){res.writeHead(404,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'OPERATION_NOT_FOUND'}));return;}
 if(url.pathname==='/favicon.ico'){res.writeHead(204);res.end();return;}
 if(url.pathname==='/fixture'){res.setHeader('Content-Type','text/html');res.end(`<!doctype html><html lang="zh"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/process/styles.css"><link rel="stylesheet" href="/process/ipqc-c.css"><link rel="stylesheet" href="/process/version-draft-ui.css"><main id="data-content" data-active-tab="quality-ipqc-c"></main><script>window.__delivery=1;window.ProcessSync={captureDelivery:()=>window.__delivery,isCurrentDelivery:value=>value===window.__delivery,identity:{id:'preview-editor',name:'Synthetic editor',role:'staff'},identityGeneration:()=>1,platformHeaders:()=>({'Content-Type':'application/json'})};window.hasPermission=()=>true;window.toast=()=>{};window.state={};window.bindDataInner=()=>{};window.ProcessIPQC={mountReferences(){},referenceMarkup:()=>''};</script>${scripts.map(name=>'<script src="/process/'+name+'"></script>').join('')}<script>IPQCCUI.mount(document.querySelector('main'));</script></html>`);return;}
 if(url.pathname.startsWith('/process/')){const name=url.pathname.slice(9);if(!/^[\w.-]+$/.test(name))throw Error('BAD_ASSET');let source=fs.readFileSync('public/process/'+name,'utf8');if(name==='ipqc-c.js')source=source.replace('  window.IPQCCUI={',`  window.__localTest={read:()=>read(false),state:()=>({working,localChanges,message,busy,selectedVersionId,unknown:sharedClient?.hasUnknown()}),client:sharedTransport,edit:()=>startEditor('error',working.errors[0])};\n  window.IPQCCUI={`);if(profile&&name==='ipqc-c.js'){
 const functions={draw:false,stageLocal:false,read:true,upload:true,writeShared:true,submitEditor:true};let wrappers='';
 for(const [fn,async]of Object.entries(functions)){source=source.replace((async?'async ':'')+'function '+fn+'(', (async?'async ':'')+'function measured_'+fn+'(');wrappers+=(async?'async ':'')+'function '+fn+'(...args){const start=performance.now();try{return '+(async?'await ':'')+'measured_'+fn+'(...args);}finally{(window.__ipqccProfile ||= []).push({phase:'+JSON.stringify(fn)+',ms:performance.now()-start});}}\n';}
 source=source.replace('  window.IPQCCUI={',wrappers+'  window.IPQCCUI={');}
 res.setHeader('Content-Type',name.endsWith('.css')?'text/css':'text/javascript');res.end(source);return;}
 if(holdRecoveryRead&&req.method==='GET'&&url.pathname==='/api/ipqc-c/workflow'&&!url.searchParams.has('permissions')&&!url.searchParams.has('operationId')&&receiptReads>0){holdRecoveryRead=false;await new Promise(resolve=>{releaseRecoveryRead=resolve;notifyRecoveryRead();});}
 const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=Buffer.concat(chunks);if(req.method!=='GET')mutations.push({path:url.pathname,body:body.toString()});
 if(req.method==='POST'&&body.length&&JSON.parse(body).command?.action==='save'&&saveRace){const race=saveRace;saveRace=null;await race();}
 if(req.method==='PUT'&&url.pathname==='/api/ipqc-c/photo'&&photoRace){const race=photoRace;photoRace=null;await race();}
 const endpoint=url.pathname.replace('/api/',''),route=h.load('app/api/'+endpoint+'/route.ts');const headers=new Headers(req.headers);headers.set('Cookie',h.sessions.editor.Cookie);headers.set('Origin',base);const serverStarted=performance.now();const response=await route[req.method](new Request(url,{method:req.method,headers,...(body.length?{body}: {})}));if(holdSaveACK&&req.method==='POST'&&response.status===200&&body.length&&JSON.parse(body).command?.action==='save'){holdSaveACK=false;await new Promise(resolve=>{releaseSaveACK=resolve;notifySaveACK();});}if(dropSave&&req.method==='POST'&&response.status===200){dropSave=false;res.writeHead(200,{'Content-Type':'application/json'});res.end('{}');return;}res.writeHead(response.status,Object.fromEntries(response.headers));const bytes=Buffer.from(await response.arrayBuffer());if(profile)networkProfile.push({method:req.method,path:url.pathname,kind:url.searchParams.has('permissions')?'permissions':url.searchParams.has('operationId')?'receipt':'state',serverMs:performance.now()-serverStarted,requestBytes:body.length,responseBytes:bytes.length});res.end(bytes);
 }catch(e){errors.push(e.stack);res.writeHead(500);res.end(String(e));}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':chromium.executablePath()),headless:true});
 try{for(const width of [1440,390]){
 const page=await browser.newPage({viewport:{width,height:844}});page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.stack));await page.goto(base+'/fixture');await page.locator('#ipqcc-save').waitFor();mutations.length=0;
 await page.evaluate(()=>__localTest.edit());await page.locator('input[name="name"]').fill('Local '+width);await page.locator('#ipqcc-editor button[type="submit"]').click();await page.locator('#ipqcc-editor').waitFor({state:'detached'});
 assert.equal(mutations.length,0,'Finish never writes');assert.equal(await page.evaluate(()=>__localTest.state().localChanges.length),1);
 await page.locator('#ipqcc-search').fill('C100');await page.evaluate(()=>__localTest.read());assert.equal(await page.evaluate(()=>__localTest.state().working.errors[0].name),'Local '+width,'read/filter preserves input');
 await page.locator('#ipqcc-save').click();await page.waitForFunction(()=>__localTest.state().localChanges.length===0&&!__localTest.state().busy,{},{timeout:10000}).catch(async e=>{console.error(await page.evaluate(()=>__localTest.state()),mutations,errors);throw e;});
 assert.equal(mutations.filter(m=>m.path.endsWith('/workflow')&&JSON.parse(m.body).command?.action==='save').length,1);const begins=mutations.filter(m=>m.path.endsWith('/workflow')&&JSON.parse(m.body).action==='begin-v1');assert.equal(begins.length,width===1440?1:0,'legacy first Save adopts once with a durable Begin identity');for(const mutation of begins)assert.match(JSON.parse(mutation.body).begin.operationId,/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i);assert.equal(mutations.filter(m=>JSON.parse(m.body).action==='begin').length,0,'no legacy Begin fallback');const savedControl=(await h.call('ipqc-c','GET',undefined,'editor',200,'?caseMetadata=1')).control,flow=savedControl.workflow,currentAuthority=await h.read('ipqc-c'),opened=savedControl.versions.find(v=>v.status==='draft');assert.deepEqual(currentAuthority.beginBasis,{generation:flow.generation,activeVersionId:savedControl.activeVersionId,openVersionId:opened.id,openVersionStatus:opened.status,openVersionRevision:opened.revision},'adopted Begin authority matches current workflow and draft metadata');assert.equal(flow.saved.content.errors[0].name,'Local '+width);assert.equal(flow.saved.content.errors[0].note,width===1440?'retained legacy note':'Late re-entry Save');
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
  await page.locator('#ipqcc-cancel').click();await page.locator('#ipqcc-check-operation').click();await page.waitForFunction(()=>!__localTest.state().busy);
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
 await page.locator('#ipqcc-photo-input').setInputFiles(profile?{name:'synthetic480x240.png',mimeType:'image/png',buffer:syntheticProfilePhoto()}:{name:'fixture.gif',mimeType:'image/gif',buffer:Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7','base64')});
 await page.locator('#ipqcc-editor button[type="submit"]').click();await page.locator('#ipqcc-editor').waitFor({state:'detached'});assert.equal(mutations.length,0,'photos remain local until Save');
 await page.locator('#ipqcc-search').fill('C1');assert.equal(await page.evaluate(()=>__localTest.state().localChanges.length),1,'filter preserves local input');
 if(width===1440)photoRace=async()=>{const f=h.flow(await h.read('ipqc-c')),row=f.working.errors[0],path=['errors',{id:row.id},'note'];await h.command('ipqc-c','apply',{patches:[{op:'set',path,value:'Peer during upload'}],guards:[{path,value:row.note}]},'edit-only');};
 await page.locator('#ipqcc-save').click();await page.waitForFunction(()=>__localTest.state().localChanges.length===0&&!__localTest.state().busy).catch(async e=>{console.error(await page.evaluate(()=>__localTest.state()),errors);throw e;});
 if(width===1440){assert.equal(photoRace,null,'peer wrote during upload');assert.equal(h.flow(await h.call('ipqc-c','GET',undefined,'editor',200,'?caseMetadata=1')).saved.content.errors[0].note,'Peer during upload','post-upload comparison preserves new peer content');}
 assert.equal(mutations.filter(m=>m.path.endsWith('/photo')).length,1);assert.equal(mutations.filter(m=>m.path.endsWith('/workflow')).length,1);
 const withPhoto=h.flow(await h.call('ipqc-c','GET',undefined,'editor',200,'?caseMetadata=1'));assert.equal(withPhoto.saved.content.items.at(-1).cpkEnabled,true);assert.equal(withPhoto.saved.content.items.at(-1).mediaItems.length,1);if(profile){const imageId=withPhoto.saved.content.items.at(-1).mediaItems[0].id;browserProfile.push({width,imageDecode:await page.evaluate(async id=>{const img=new Image(),started=performance.now();img.src='/api/ipqc-c/photo?id='+id;await img.decode();return {ms:performance.now()-started,width:img.naturalWidth,height:img.naturalHeight};},imageId)});}assert.equal(withPhoto.saved.content.items.at(-1).equipmentId,width===1440?'eq-one':'eq-two');assert.deepEqual(withPhoto.saved.content.items.at(-1).rule,{cadence:'batch',batchKind:'fixed_count',fixedCount:'3'});
 if(width===1440){
 mutations.length=0;
 await page.evaluate(()=>__localTest.edit());await page.locator('[name="note"]').fill('Local conflicting note');await page.locator('[name="name"]').fill('Local conflicting name');await page.locator('#ipqcc-editor button[type="submit"]').click();
 const peerBefore=h.flow(await h.read('ipqc-c')),peerError=peerBefore.working.errors[0],notePath=['errors',{id:peerError.id},'note'];
 await h.command('ipqc-c','apply',{patches:[{op:'set',path:notePath,value:'Peer saved note'},{op:'set',path:['errors',{id:peerError.id},'name'],value:'Peer saved name'}],guards:[{path:notePath,value:peerError.note},{path:['errors',{id:peerError.id},'name'],value:peerError.name}]},'edit-only');
 await h.command('ipqc-c','save',{},'edit-only');const peerSaved=h.snapshot();
 await page.locator('#ipqcc-save').click();await page.locator('[data-ipqcc-save-choice]').waitFor();
 assert.equal(await page.locator('[data-ipqcc-save-choice] article').count(),2,'one decision covers two conflicts');assert.equal(await page.locator('[data-ipqcc-save-choice] input').count(),0,'no per-field choices');
 assert.equal(mutations.length,0,'comparison and open choices send no mutation');assert.deepEqual(h.snapshot(),peerSaved);
 await page.locator('[data-cancel]').click();await page.waitForFunction(()=>!__localTest.state().busy);
 assert.equal(await page.evaluate(()=>__localTest.state().working.errors[0].note),'Local conflicting note','cancel retains local input');assert.equal(mutations.length,0);
 await page.locator('#ipqcc-save').click();await page.locator('[data-ipqcc-save-choice]').waitFor();
 const changedFlow=h.flow(await h.read('ipqc-c')),changedError=changedFlow.working.errors[0];
 await h.command('ipqc-c','apply',{patches:[{op:'set',path:notePath,value:'Peer saved note again'}],guards:[{path:notePath,value:changedError.note}]},'edit-only');
 await page.locator('[data-save-choice="theirs"]').click();
 await page.locator('[data-ipqcc-save-choice]').filter({hasText:'Peer saved note again'}).waitFor();assert.equal(mutations.length,0,'post-choice peer revision reopens comparison without Save');
 await page.locator('[data-save-choice="theirs"]').click();await page.waitForFunction(()=>!__localTest.state().busy&&__localTest.state().localChanges.length===0);
 assert.equal(await page.evaluate(()=>__localTest.state().working.errors[0].note),'Peer saved note again');
 const rejectedCount=mutations.length;assert.equal(rejectedCount,1,'only explicit completed choice writes one Save');
 // The opposite whole-group choice preserves independent peer item edits.
 await page.evaluate(()=>__localTest.edit());await page.locator('[name="name"]').fill('Whole mine name');await page.locator('[name="note"]').fill('Whole mine note');await page.locator('#ipqcc-editor button[type="submit"]').click();
 const mineBase=h.flow(await h.read('ipqc-c')),peerRow=mineBase.working.errors[0],independent=mineBase.working.items.find(row=>!row.deleted);
 await h.command('ipqc-c','apply',{patches:[{op:'set',path:['errors',{id:peerRow.id},'name'],value:'Whole peer name'},{op:'set',path:notePath,value:'Whole peer note'},{op:'set',path:['items',{id:independent.id},'note'],value:'Independent peer item'}],guards:[{path:['errors',{id:peerRow.id},'name'],value:peerRow.name},{path:notePath,value:peerRow.note},{path:['items',{id:independent.id},'note'],value:independent.note}]},'edit-only');
 await page.locator('#ipqcc-save').click();await page.locator('[data-save-choice="mine"]').click();await page.waitForFunction(()=>!__localTest.state().busy&&!__localTest.state().localChanges.length);
 const chosen=h.flow(await h.read('ipqc-c')).working;assert.equal(chosen.errors[0].name,'Whole mine name');assert.equal(chosen.errors[0].note,'Whole mine note');assert.equal(chosen.items.find(row=>row.id===independent.id).note,'Independent peer item');
 // The final-CAS race is a proven rejection. Continue the same user Save with a
 // new command only after fresh comparison; never replay an ambiguous command.
 await page.evaluate(()=>__localTest.edit());await page.locator('[name="name"]').fill('After CAS race');await page.locator('#ipqcc-editor button[type="submit"]').click();
 saveRace=async()=>{const f=h.flow(await h.read('ipqc-c')),row=f.working.errors[0];await h.command('ipqc-c','apply',{patches:[{op:'set',path:notePath,value:'CAS peer note'}],guards:[{path:notePath,value:row.note}]},'edit-only');};
 const beforeRace=mutations.length;await page.locator('#ipqcc-save').click();await page.waitForFunction(()=>!__localTest.state().busy&&!__localTest.state().localChanges.length);
 assert.equal(mutations.length,beforeRace+2,'one rejected command plus one newly compared Save');const raced=mutations.slice(beforeRace).map(m=>JSON.parse(m.body).command);assert.notEqual(raced[0].operationId,raced[1].operationId);assert.equal(h.flow(await h.read('ipqc-c')).working.errors[0].note,'CAS peer note');

 await page.evaluate(()=>__localTest.edit());await page.locator('[name="note"]').fill('After explicit discard');await page.locator('[name="name"]').fill('Local '+width);await page.locator('#ipqcc-editor button[type="submit"]').click();await page.locator('#ipqcc-save').click();
 await page.waitForFunction(()=>!__localTest.state().busy&&__localTest.state().localChanges.length===0);
 assert.equal(h.flow(await h.call('ipqc-c','GET',undefined,'editor',200,'?caseMetadata=1')).saved.content.errors[0].note,'After explicit discard');assert.equal(mutations.length,rejectedCount+4,'later Save is a new single operation');
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
  mutations.length=0;await createLocalItem('Retain independent batch item');await deleteOtherError('delete-peer-conflict');
  const peerFlow=h.flow(await h.read('ipqc-c')),peerItem=peerFlow.working.items.find(row=>!row.deleted),path=['items',{id:peerItem.id},'standard'];
  await h.command('ipqc-c','apply',{patches:[{op:'set',path,value:'Genuine peer standard'}],guards:[{path,value:peerItem.standard}]},'edit-only');await h.command('ipqc-c','save',{},'edit-only');
  await page.locator('#ipqcc-save').click();await page.waitForFunction(()=>!__localTest.state().busy&&__localTest.state().localChanges.length===0);
  assert.equal(mutations.length,1);const merged=h.flow(await h.read('ipqc-c')).working;
  assert.equal(merged.items.find(row=>row.id===peerItem.id).standard,'Genuine peer standard','unrelated peer child survives deletion of a different group');
  assert(merged.items.some(row=>row.description==='Retain independent batch item'));assert.equal(merged.errors.find(row=>row.id==='delete-peer-conflict').deleted,true);

 }
 if(width===1440){
  // A successful old Save may finish after scope navigation. Its UI must not
  // replace the destination or leave a stale busy/reload notice there.
  await page.locator('#ipqcc-search').fill('');  mutations.length=0;await page.evaluate(()=>__localTest.edit());await page.locator('[name="note"]').fill('Late original Save');await page.locator('#ipqcc-editor button[type="submit"]').click();
  const held=new Promise(resolve=>{notifySaveACK=resolve;});holdSaveACK=true;await page.locator('#ipqcc-save').click();await held;
  try{await page.locator('[data-ipqcc-product="C200"]').click();await page.locator('[data-ipqcc-product="C100"]').click();}
  finally{releaseSaveACK();}
  await page.waitForFunction(()=>!__localTest.state().busy);
  assert.equal(await page.locator('[data-ipqcc-save-input-notice]').count(),0,'late scope ACK cannot add a reload barrier to a new page');
  assert.equal(await page.locator('#ipqcc-save').isDisabled(),false,'late scope ACK cannot leave destination Save disabled');
  await page.evaluate(()=>__localTest.read());
  mutations.length=0;await page.evaluate(()=>__localTest.edit());await page.locator('[name="note"]').fill('Late re-entry Save');await page.locator('#ipqcc-editor button[type="submit"]').click();
  const reentryHeld=new Promise(resolve=>{notifySaveACK=resolve;});holdSaveACK=true;await page.locator('#ipqcc-save').click();await reentryHeld;
  try{await page.evaluate(()=>IPQCCUI.mount(document.querySelector('main')));assert.equal(await page.evaluate(()=>__localTest.state().unknown),true,'new view retains the exact in-flight marker');}
  finally{releaseSaveACK();}
  await page.waitForFunction(()=>!__localTest.state().unknown);assert.equal(await page.evaluate(()=>__localTest.state().busy),false,'old completion cannot keep re-entry busy');
  assert.equal(await page.locator('#ipqcc-save').isDisabled(),false);assert.equal(await page.locator('[data-ipqcc-save-input-notice]').count(),0);assert.equal(mutations.filter(row=>row.path.endsWith('/workflow')).length,1,'re-entry never replays the old Save');
 }
 mutations.length=0;await page.evaluate(()=>__localTest.edit());await page.locator('input[name="name"]').fill('Unsent scope edit');await page.locator('#ipqcc-editor button[type="submit"]').click();
 const scopeSnapshot=h.snapshot();let navigationDialogs=0;const rejectPrompt=dialog=>{navigationDialogs++;void dialog.dismiss();};page.on('dialog',rejectPrompt);
 await page.locator('#ipqcc-search').fill('');await page.locator('[data-ipqcc-product="C200"]').click();await page.locator('[data-ipqcc-product="C100"]').click();await page.locator('[data-ipqcc-stage="C-OTHER"]').click();await page.locator('[data-ipqcc-stage="C-CUT"]').click();page.off('dialog',rejectPrompt);
 if(evidence)await page.screenshot({path:require('node:path').join(evidence,'c-'+width+'-zh.png'),fullPage:false});
 assert.equal(navigationDialogs,0);assert.equal(await page.evaluate(()=>__localTest.state().localChanges.length),0);assert.equal(mutations.length,0);assert.deepEqual(h.snapshot(),scopeSnapshot);
 await page.evaluate(()=>{document.documentElement.lang='vi';dispatchEvent(new CustomEvent('process-language-change',{detail:{language:'vi'}}));});assert.equal(await page.locator('#ipqcc-save').innerText(),'Lưu');
 if(evidence)await page.screenshot({path:require('node:path').join(evidence,'c-'+width+'-vi.png'),fullPage:false});
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
 if(profile)browserProfile.push({width,document:'before-reload',phases:await page.evaluate(()=>window.__ipqccProfile||[])});await page.reload();await page.locator('#ipqcc-save').waitFor();assert.equal(await page.evaluate(()=>__localTest.state().working.errors[0].name),width===390?'Recovered receipt':'Local '+width);
 const layout=await page.evaluate(()=>({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));assert(layout.scroll<=layout.width+1,JSON.stringify(layout));if(profile)browserProfile.push({width,phases:await page.evaluate(()=>window.__ipqccProfile||[]),resources:await page.evaluate(()=>performance.getEntriesByType('resource').filter(r=>new URL(r.name).pathname.startsWith('/api/')).map(r=>({path:new URL(r.name).pathname,ms:r.duration,transferSize:r.transferSize,encodedBodySize:r.encodedBodySize}))) });await page.close();
 }
 // Two actual approvals create immutable same-page history; a new draft and
 // unsent edits must never be used as that history body's source.
 let historyFlow=h.flow(await h.call('ipqc-c','GET',undefined,'editor',200,'?caseMetadata=1'));
 const firstContent=structuredClone(historyFlow.saved.content),first=await h.command('ipqc-c','submit',{savedId:historyFlow.saved.id,reason:'Synthetic first approval'});
 await h.command('ipqc-c','approve',{caseId:first.receipt.caseId},'reviewer');await h.begin('ipqc-c');
 historyFlow=h.flow(await h.read('ipqc-c'));const historyPath=['errors',{id:historyFlow.working.errors[0].id},'note'];
 await h.command('ipqc-c','apply',{patches:[{op:'set',path:historyPath,value:'Second approved note'}],guards:[{path:historyPath,value:historyFlow.working.errors[0].note}]});
 historyFlow=h.flow(await h.command('ipqc-c','save'));const second=await h.command('ipqc-c','submit',{savedId:historyFlow.saved.id,reason:'Synthetic second approval'});
 await h.command('ipqc-c','approve',{caseId:second.receipt.caseId},'reviewer');await h.begin('ipqc-c');
 const historyPage=await browser.newPage({viewport:{width:390,height:844}});await historyPage.goto(base+'/fixture');await historyPage.locator('#ipqcc-save').waitFor();
 await historyPage.evaluate(()=>__localTest.edit());await historyPage.locator('[name="note"]').fill('Unsent before history');await historyPage.locator('#ipqcc-editor button[type="submit"]').click();
 const beforeHistory=h.snapshot();mutations.length=0;await historyPage.locator('#ipqcc-version').focus();
 await historyPage.locator('option[value="history:'+first.receipt.caseId+'"]').waitFor({state:'attached'});
 await historyPage.locator('#ipqcc-version').selectOption('history:'+first.receipt.caseId);
 await historyPage.waitForFunction(id=>__localTest.state().selectedVersionId===id,first.receipt.caseId);
 if(evidence)await historyPage.screenshot({path:require('node:path').join(evidence,'c-390-approved-history-zh.png'),fullPage:false});
 assert.equal(await historyPage.locator('#ipqcc-save,#ipqcc-submit,[data-ipqcc-add],[data-ipqcc-edit-error],[data-ipqcc-edit-item]').count(),0,'approved history is readonly on the same page');
 assert.equal(await historyPage.evaluate(()=>__localTest.state().working),null);assert.equal(await historyPage.evaluate(()=>__localTest.state().localChanges.length),0);
 assert.equal(await historyPage.locator('[id*="restore"],[data-restore]').count(),0,'no history restore');assert.equal(mutations.length,0);assert.deepEqual(h.snapshot(),beforeHistory);
 const approvedBody=await h.call('ipqc-c/workflow','GET',undefined,'editor',200,'?approvedOnly=1&versionId='+first.receipt.caseId);assert.deepEqual(approvedBody.version.snapshot,firstContent);
 await historyPage.locator('#ipqcc-version').selectOption('shared-'+h.flow(await h.read('ipqc-c')).generation);await historyPage.locator('#ipqcc-save').waitFor();
 assert.equal(mutations.length,0,'return to draft rechecks only');await historyPage.close();
 if(profile)console.log('IPQCC_PROFILE '+JSON.stringify({rowsAtStart:1735,browserProfile,networkProfile,limits:'Synthetic loopback HTTP; function timings overlap and are not additive. Browser requests include controlled fault/delay scenarios, never live latency. Resource entries are from the final document after reload; earlier phases are retained separately.'}));
 assert.deepEqual(errors,[]);console.log('PASS Chromium 1440/390: local edit, filter/read preservation, one Save POST, shared saved result, silent departure and reload; both create-item/delete-other-error orders, group choices/cancel, choice/upload/CAS peer races and immutable same-page approved history');
 }finally{releaseRecoveryRead?.();releaseSaveACK?.();await browser.close();await new Promise(resolve=>server.close(resolve));h.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
