/* oxlint-disable typescript/no-require-imports -- Actual HTTP and isolated SQLite/R2 test. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {DatabaseSync}=require('node:sqlite');const {randomUUID}=require('node:crypto');const {chromium}=require('playwright');
const harness=require('./ipqc-ab-import-harness.cjs');
const db=new DatabaseSync(':memory:');
for(const file of fs.readdirSync('drizzle').filter(n=>n.endsWith('.sql')).sort())db.exec(fs.readFileSync(path.join('drizzle',file),'utf8'));
const password=randomUUID(),objects=new Map();
const env={PROCESS_SESSION_SECRET:randomUUID(),DB:{prepare(sql){let args=[];return{bind(...v){args=v;return this;},async first(){return db.prepare(sql).get(...args)||null;},async run(){return{meta:{changes:Number(db.prepare(sql).run(...args).changes)}};},async all(){return{results:db.prepare(sql).all(...args)};}};}},STATE_ARCHIVE:{async put(k,v){objects.set(k,v);},async head(k){return objects.has(k)?{}:null;},async get(k){return objects.has(k)?{text:async()=>String(objects.get(k))}:null;}}};
const users=['editor-a','editor-b','reviewer-c','admin'].map(id=>({id,name:id,password,enabled:true,role:id==='admin'?'admin':'rd',inheritRole:false,
  lines:['A','B','C'],views:['data','approval'],permissions:['approval.submit','approval.withdraw','approval.approve','approval.reject','approval.compare']}));
const snapshot={errors:[{id:'error-1',code:'C-P1-TIEN-L1',productCode:'P1',stageCode:'C-TIEN',name:'Kích thước',note:'',reason:'',deleted:false}],
  items:[{id:'item-1',code:'C-P1-TIEN-L1-01',errorId:'error-1',productCode:'P1',stageCode:'C-TIEN',standard:'10 mm',standardEnabled:true,cpkEnabled:false,
    description:'Kiểm tra kích thước của sản phẩm theo bản vẽ kỹ thuật đã được phê duyệt',note:'',reason:'',tool:'',method:'',frequency:'',rule:{cadence:'batch',batchKind:'aql',aqlValue:'0.25'},notApplicable:false,deleted:false,mediaItems:[]}]};
const control={schemaVersion:1,activeVersionId:'active-1',versions:[{id:'active-1',number:1,status:'approved',snapshot,baseVersionId:null,revision:1,creatorId:'admin',creatorName:'admin',createdAt:'2026-10-01T00:00:00Z',updatedAt:'2026-10-01T00:00:00Z',history:[]}],source:null,reservedErrorCodes:[],reservedItemCodes:[]};
const initial={platformUsers:JSON.stringify(users),masterDataControl:JSON.stringify({active:{C:{products:[{code:'P1',stages:['C-TIEN']}],lines:[{stages:[{code:'C-TIEN'}]}]}}}),ipqcCMasterControl:JSON.stringify(control)};
db.prepare('INSERT INTO shared_state(id,revision,"values",updated_at) VALUES(1,1,?,?)').run(JSON.stringify(initial),'fixture');
let load=harness(env);
let api=load('app/api/ipqc-c/workflow/route.ts');
const login=load('app/api/platform-login/route.ts');
let dropOperation=null,base,server,browser;const sessions={};let cases=0;
const results=[];
async function check(name,fn){await fn();cases++;results.push({name,result:'PASS'});console.log('PASS '+name);}
async function send(who,body){const response=await sessions[who].request.post(base+'/api/ipqc-c/workflow',{data:body,headers:{Origin:base}});return{status:response.status(),body:await response.json()};}
async function read(who='editor-a'){const r=await sessions[who].request.get(base+'/api/ipqc-c/workflow');assert.equal(r.status(),200);return r.json();}
const sequences={};
async function command(who,action,detail={}){const state=await read(who);return{action,operationId:randomUUID(),clientId:'client-'+who,generation:state.workflow.generation,sequence:(sequences[who]=(sequences[who]||0)+1),...detail};}
const patch=(field,value)=>({op:'set',path:['items',{id:'item-1'},field],value});
// Explicit captured fixture baseline only; never read/rebase a stale command here.
function fixtureSetGuards(before,patches){return{patches,guards:patches.map(p=>({path:p.path,value:p.path.reduce((row,key)=>typeof key==='string'?row?.[key]:Array.isArray(row)?row.find(item=>item.id===key.id):undefined,before)}))};}
async function ok(who,action,detail={}){if(action==='apply'&&!(await read(who)).workflow.editable)assert.equal((await send(who,{action:'begin'})).status,200);const c=await command(who,action,detail),r=await send(who,{command:c});assert.equal(r.status,200,JSON.stringify(r.body));return r.body;}
(async()=>{
  if(process.env.V3_STORAGE==='records'){const core=load('lib/process-state.ts'),state=await core.readState();db.prepare('UPDATE shared_state SET "values"=?').run(await load('lib/state-records.ts').encodeRecordValues(env.STATE_ARCHIVE,state.values));}
  server=http.createServer(async(req,res)=>{try{
    const pathname=new URL(req.url,'http://fixture').pathname;
    const assets=new Map(['/process/styles.css','/process/ipqc-c.css','/process/ipqc-c.js','/process/shared-draft-client.js'].map(url=>[url,path.join('public',url)]));
    if(assets.has(pathname)){res.writeHead(200,{'Content-Type':pathname.endsWith('.css')?'text/css':'text/javascript'});res.end(fs.readFileSync(assets.get(pathname)));return;}
    if(pathname==='/fixture') {
      const core=load('lib/process-state.ts'),state=await core.readState(),actor=await core.identity(new Request(base+req.url,{headers:req.headers}),state);
      if(!actor){res.writeHead(401);res.end();return;}
      const permissions=JSON.parse(state.values.platformUsers).find(u=>u.id===actor.id)?.permissions||[];
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
      res.end(`<!doctype html><html lang="vi"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/process/styles.css"><link rel="stylesheet" href="/process/ipqc-c.css"></head><body><main id="data-content" data-active-tab="quality-ipqc-c"></main><script>window.ProcessSync={identity:${JSON.stringify(actor)},platformHeaders:()=>({'Content-Type':'application/json'})};window.hasPermission=key=>${actor.role==='admin'?'true':JSON.stringify(permissions)+'.includes(key)'};</script><script src="/process/shared-draft-client.js"></script><script src="/process/ipqc-c.js"></script><script>IPQCCUI.mount(document.querySelector('#data-content'))</script></body></html>`);return;
    }
    const chunks=[];for await(const c of req)chunks.push(c);const body=Buffer.concat(chunks);
    const request=new Request(base+req.url,{method:req.method,headers:req.headers,...(body.length?{body}: {})});
    const target=req.url.startsWith('/api/platform-login')?login:pathname==='/api/ipqc-c'?load('app/api/ipqc-c/route.ts'):pathname==='/api/quality-equipment-replacement'?load('app/api/quality-equipment-replacement/route.ts'):api;
    const response=await target[req.method](request);
    if(dropOperation&&body.toString().includes(dropOperation)&&response.status===200){dropOperation=null;req.socket.destroy();return;}
    res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
  }catch(error){res.writeHead(500);res.end(JSON.stringify({error:error.message}));}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{channel:'chrome'}),headless:true});
  for(const user of users){sessions[user.id]=await browser.newContext();const response=await sessions[user.id].request.post(base+'/api/platform-login',{data:{id:user.id,password},headers:{Origin:base}});assert.equal(response.status(),200);}
  const cookies=await Promise.all(Object.values(sessions).map(s=>s.cookies()));assert.equal(new Set(cookies.map(c=>c[0].value)).size,4);
  await check('T01: concurrent begin via independent signed Sessions yields one shared generation',async()=>{
    const replies=await Promise.all(['editor-a','editor-b'].map(who=>send(who,{action:'begin'})));
    assert.ok(replies.every(r=>r.status===200),JSON.stringify(replies));assert.equal(replies[0].body.control.workflow.generation,replies[1].body.control.workflow.generation);
  });
  await check('T02/T08: concurrent distinct fields merge and B saves A+B with correct authors',async()=>{
    const baseline=(await read()).workflow.working;const a=await command('editor-a','apply',fixtureSetGuards(baseline,[patch('description','Nội dung do người A chỉnh sửa')])),b=await command('editor-b','apply',fixtureSetGuards(baseline,[patch('note','Ghi chú của B')]));
    const responses=await Promise.all([send('editor-a',{command:a}),send('editor-b',{command:b})]);assert.ok(responses.every(r=>r.status===200),JSON.stringify(responses));
    const saved=await ok('editor-b','save');const wf=saved.control.workflow;
    assert.equal(wf.saved.content.items[0].description,'Nội dung do người A chỉnh sửa');assert.equal(wf.saved.content.items[0].note,'Ghi chú của B');assert.equal(wf.saved.actor.id,'editor-b');
    assert.equal(new Set(Object.values(wf.saved.contributors).map(v=>v.actor.id)).size,2);
  });
  await check('T12: fresh handler instance and fresh session reload persisted working/save',async()=>{
    load=harness(env);api=load('app/api/ipqc-c/workflow/route.ts');const state=await read();assert.equal(state.workflow.working.items[0].note,'Ghi chú của B');assert.ok(state.workflow.saved.id);
  });
  await check('T14/T16/T18: submit exact saved snapshot; admin cannot edit pending; reviewer C approves',async()=>{
    const saved=(await read()).workflow.saved.id;await ok('editor-a','apply',fixtureSetGuards((await read('editor-a')).workflow.working,[patch('note','Excluded unsaved')]));
    const submit=await ok('editor-a','submit',{savedId:saved,reason:'Cập nhật phương pháp kiểm tra'});const id=submit.receipt.caseId;
    assert.equal(submit.control.workflow.cases.at(-1).content.items[0].note,'Ghi chú của B');
    assert.equal((await send('admin',{command:await command('admin','apply',fixtureSetGuards(submit.control.workflow.working,[patch('note','bad')]))})).status,409);
    assert.equal((await send('editor-a',{command:await command('editor-a','approve',{caseId:id})})).status,403);
    const approved=await ok('reviewer-c','approve',{caseId:id});assert.equal(approved.control.activeVersionId,id);
    assert.equal(approved.control.versions.find(v=>v.id===id).snapshot.items[0].note,'Ghi chú của B');
  });
  await check('T20/T41/T42: withdraw reason, original resubmission, immutable old case and stale review rejection',async()=>{
    await ok('editor-a','apply',fixtureSetGuards((await read('editor-a')).workflow.working,[patch('note','resubmit content')]));await ok('editor-b','save');
    const saved=(await read()).workflow.saved.id;const submitted=await ok('editor-a','submit',{savedId:saved,reason:'First case'});const id=submitted.receipt.caseId;
    assert.equal((await send('editor-b',{command:await command('editor-b','withdraw',{caseId:id})})).status,422);
    const withdrawn=await ok('editor-b','withdraw',{caseId:id,reason:'Xác nhận lại'});assert.equal(withdrawn.control.workflow.pendingId,null);
    assert.equal((await send('reviewer-c',{command:await command('reviewer-c','approve',{caseId:id})})).status,409);
    const again=await ok('editor-a','submit',{savedId:saved,reason:'Gửi lại nội dung đã xác nhận'});assert.notEqual(again.receipt.caseId,id);
    assert.equal(again.control.workflow.cases.find(c=>c.id===id).status,'withdrawn');await ok('reviewer-c','return',{caseId:again.receipt.caseId,reason:'Bổ sung thêm'});
  });
  await check('T18: admin self-review requires explicit confirmation and records audit',async()=>{
    await ok('admin','apply',fixtureSetGuards((await read('admin')).workflow.working,[patch('note','admin change')]));const saved=await ok('admin','save');
    const submitted=await ok('admin','submit',{savedId:saved.control.workflow.saved.id,reason:'Admin self review'});const id=submitted.receipt.caseId;
    assert.equal((await send('admin',{command:await command('admin','approve',{caseId:id})})).status,409);
    const approved=await ok('admin','approve',{caseId:id,selfReviewConfirmed:true});assert.equal(approved.control.workflow.cases.at(-1).result.selfReview,true);
  });
  await check('T33: successful save response lost; receipt resolves unknown without duplicate save',async()=>{
    await ok('editor-a','apply',fixtureSetGuards((await read('editor-a')).workflow.working,[patch('note','response lost')]));const cmd=await command('editor-b','save');dropOperation=cmd.operationId;
    await assert.rejects(()=>send('editor-b',{command:cmd}));
    const receipt=await sessions['editor-b'].request.get(base+'/api/ipqc-c/workflow?operationId='+cmd.operationId);assert.equal(receipt.status(),200);
    const retried=await send('editor-b',{command:cmd});assert.equal(retried.status,200);assert.equal(retried.body.unchanged,true);
    const receiptOther=await sessions['editor-a'].request.get(base+'/api/ipqc-c/workflow?operationId='+cmd.operationId);assert.equal(receiptOther.status(),403);
  });
  await check('T05/T06/T40/T44: actual IPQC-C dialog, two browser Sessions, long Vietnamese, desktop/mobile actions',async()=>{
    const a=await sessions['editor-a'].newPage(),b=await sessions['editor-b'].newPage();
    const errors=[];a.on('pageerror',e=>errors.push(e.message));b.on('pageerror',e=>errors.push(e.message));
    a.on('dialog',d=>d.accept());b.on('dialog',d=>d.accept());
    await a.setViewportSize({width:1366,height:900});await b.setViewportSize({width:390,height:844});
    await Promise.all([a.goto(base+'/fixture'),b.goto(base+'/fixture')]);
    const edit='[data-ipqcc-edit-item="item-1"]';await a.locator(edit).click();await b.locator(edit).click();
    const long='Kiểm tra toàn bộ kích thước, bề mặt và tình trạng của sản phẩm theo bản vẽ kỹ thuật đã được phê duyệt; ghi rõ kết quả và thông báo cho người phụ trách khi phát hiện bất thường. ';
    await a.locator('[name="description"]').fill(long.repeat(3));
    await b.locator('[name="note"]').fill('Nội dung của B không được A ghi đè');
    await b.locator('#ipqcc-editor button[type="submit"]').click();await b.locator('#ipqcc-editor').waitFor({state:'detached'});
    // Wait for A's actual refresh request, not a mocked state callback.
    await a.waitForFunction(()=>document.querySelector('#ipqcc-shared-status')?.textContent.includes('cửa sổ'),{},{timeout:12000});
    assert.equal(await a.locator('[name="description"]').inputValue(),long.repeat(3));
    await a.locator('#ipqcc-editor button[type="submit"]').click();await a.locator('#ipqcc-editor').waitFor({state:'detached'});
    const state=await read();assert.equal(state.workflow.working.items[0].note,'Nội dung của B không được A ghi đè');assert.equal(state.workflow.working.items[0].description,long.repeat(3));
    await b.locator('#ipqcc-save').click();await b.waitForFunction(()=>document.querySelector('.ipqcc-message')?.textContent.includes('Đã lưu bản chụp'));
    await a.reload();await a.locator(edit).click();assert.equal(await a.locator('[name="description"]').inputValue(),long.repeat(3));
    await a.locator('[name="note"]').fill('cancelled');await a.locator('#ipqcc-cancel').click();assert.equal((await read()).workflow.working.items[0].note,'Nội dung của B không được A ghi đè');
    const output=path.resolve('.wrangler/local-only/v3-evidence');fs.mkdirSync(output,{recursive:true});
    for(const [page,label] of [[a,'desktop'],[b,'mobile']]) {
      await page.locator(edit).click();await page.locator('[name="description"]').focus();
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,label+' overflow');
      const footer=await page.locator('#ipqcc-editor footer').boundingBox();const size=page.viewportSize();assert.ok(footer.y>=0&&footer.y+footer.height<=size.height+1,label+' footer access');
      if(label==='desktop') {
        const dialog=await page.locator('#ipqcc-editor').boundingBox(),standard=await page.locator('.ipqcc-field-standard').boundingBox(),equipment=await page.locator('.ipqcc-equipment-picker').boundingBox();
        assert.ok(dialog.width>=1000,'desktop-wide editor');assert.ok(equipment.x>standard.x+standard.width,'desktop adjacent equipment');
        assert.ok(Math.abs(equipment.y-standard.y)<2,'aligned desktop columns');
      }
      await page.screenshot({path:path.join(output,'ipqc-c-v3-'+label+'.png')});
      if(label==='mobile') {await page.setViewportSize({width:390,height:500});const keyboardFooter=await page.locator('#ipqcc-editor footer').boundingBox();assert.ok(keyboardFooter.y+keyboardFooter.height<=501,'virtual keyboard height simulation');await page.setViewportSize({width:390,height:844});}
      await page.keyboard.press('Escape');await page.locator('#ipqcc-editor').waitFor({state:'detached'});
      await page.locator('#ipqcc-case-history').click();await page.locator('[data-ipqcc-case]').first().click();await page.locator('.ipqcc-case-diff').first().waitFor();
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,label+' case overflow');
      const caseFooter=await page.locator('#ipqcc-case-dialog footer').boundingBox();assert.ok(caseFooter.y+caseFooter.height<=page.viewportSize().height+1);
      if(label==='desktop'){const panels=await page.locator('.ipqcc-case-diff').first().locator(':scope > section').all();const left=await panels[0].boundingBox(),right=await panels[1].boundingBox();assert.ok(right.x>left.x+left.width);}
      await page.screenshot({path:path.join(output,'ipqc-c-v3-case-'+label+'.png')});
      await page.keyboard.press('Escape');await page.locator('#ipqcc-case-dialog').waitFor({state:'detached'});
      await page.evaluate(()=>window.dispatchEvent(new CustomEvent('process-language-change',{detail:{language:'zh'}})));
      assert.ok((await page.locator('#ipqcc-shared-status').innerText()).includes('範圍'));
    }
    assert.deepEqual(errors,[]);await a.close();await b.close();
  });
  await check('T15/T19: true HTTP save-submit and approve-withdraw races have one outcome',async()=>{
    await ok('editor-a','apply',fixtureSetGuards((await read('editor-a')).workflow.working,[patch('note','race initial')]));await ok('editor-a','save');
    const saved=(await read()).workflow.saved.id;
    await ok('editor-b','apply',fixtureSetGuards((await read('editor-b')).workflow.working,[patch('note','race next')]));
    const save=await command('editor-b','save'),submit=await command('editor-a','submit',{savedId:saved,reason:'race'});
    const raced=await Promise.all([send('editor-b',{command:save}),send('editor-a',{command:submit})]);
    assert.equal(raced.filter(r=>r.status===200).length,1,JSON.stringify(raced));
    assert.equal(raced.filter(r=>r.status===409).length,1);
    let flow=(await read()).workflow;
    if(!flow.pendingId){await ok('editor-a','submit',{savedId:flow.saved.id,reason:'confirmed new saved version'});flow=(await read()).workflow;}
    const approve=await command('reviewer-c','approve',{caseId:flow.pendingId}),withdraw=await command('editor-b','withdraw',{caseId:flow.pendingId,reason:'race withdrawal'});
    const terminal=await Promise.all([send('reviewer-c',{command:approve}),send('editor-b',{command:withdraw})]);
    assert.equal(terminal.filter(r=>r.status===200).length,1,JSON.stringify(terminal));assert.equal(terminal.filter(r=>r.status===409).length,1);
    assert.equal((await read()).workflow.pendingId,null);
  });
  await check('T33: lost submit and approve responses resolve durable receipts without duplicate cases',async()=>{
    await ok('editor-a','apply',fixtureSetGuards((await read('editor-a')).workflow.working,[patch('note','unknown submit and approval')]));await ok('editor-a','save');
    const submit=await command('editor-a','submit',{savedId:(await read()).workflow.saved.id,reason:'lost submission response'});dropOperation=submit.operationId;
    await assert.rejects(()=>send('editor-a',{command:submit}));
    const receipt=await sessions['editor-a'].request.get(base+'/api/ipqc-c/workflow?operationId='+submit.operationId);assert.equal(receipt.status(),200);
    const id=(await receipt.json()).receipt.caseId;
    const repeat=await send('editor-a',{command:submit});assert.equal(repeat.status,200);assert.equal(repeat.body.unchanged,true);
    const approve=await command('reviewer-c','approve',{caseId:id});dropOperation=approve.operationId;
    await assert.rejects(()=>send('reviewer-c',{command:approve}));
    const confirmed=await sessions['reviewer-c'].request.get(base+'/api/ipqc-c/workflow?operationId='+approve.operationId);assert.equal(confirmed.status(),200);
    const again=await send('reviewer-c',{command:approve});assert.equal(again.status,200);assert.equal(again.body.unchanged,true);
    assert.equal(again.body.control.workflow.cases.filter(c=>c.id===id).length,1);assert.equal(again.body.control.activeVersionId,id);
  });
  await check('T27/T28: V3 replacement preview and atomic guarded working edits preserve saved/active content',async()=>{
    const core=load('lib/process-state.ts'),s=await core.readState();
    s.values.routineEquipmentControl=JSON.stringify({activeVersionId:'equipment-active',versions:[{id:'equipment-active',status:'approved',categories:[],subcategories:[],groups:[],equipment:[
      {id:'eq-source',enabled:true,assetCode:'S'},{id:'eq-target',enabled:true,assetCode:'T'},{id:'eq-other',enabled:true,assetCode:'O'}]}]});
    db.prepare('UPDATE shared_state SET revision=revision+1,"values"=? WHERE id=1').run(await core.encodeValues(s.values));
    await ok('editor-a','apply',{patches:[patch('equipmentId','eq-source')],guards:[{path:patch('equipmentId','').path,value:(await read()).workflow.working.items[0].equipmentId}]});
    await ok('editor-a','save');const before=(await send('editor-a',{command:await command('editor-a','save')})).body.control.workflow;
    const preview=await (await sessions['editor-a'].request.get(base+'/api/quality-equipment-replacement?sourceId=eq-source')).json();
    const c=preview.modules.find(m=>m.moduleId==='ipqc-c');assert.equal(c.items[0].selectable,true);assert.equal(c.workflow.generation,before.generation);
    const replace=await command('editor-a','apply',{patches:[patch('equipmentId','eq-target')],guards:[{path:patch('equipmentId','').path,value:'eq-source'}]});
    await ok('editor-b','apply',{patches:[patch('equipmentId','eq-other')],guards:[{path:patch('equipmentId','').path,value:'eq-source'}]});
    assert.equal((await send('editor-a',{command:replace})).status,409);
    const applied=await ok('editor-a','apply',{patches:[patch('equipmentId','eq-target')],guards:[{path:patch('equipmentId','').path,value:'eq-other'}]});
    assert.deepEqual(applied.control.workflow.saved,before.saved);assert.deepEqual(applied.control.workflow.active,before.active);
    const item={...applied.control.workflow.working.items[0]};delete item.equipmentId;delete item.equipmentSnapshot;
    const original={...before.working.items[0]};delete original.equipmentId;delete original.equipmentSnapshot;assert.deepEqual(item,original);
    const atomic=await command('editor-a','apply',{patches:[patch('equipmentId','eq-source'),{op:'set',path:['items',{id:'missing'},'equipmentId'],value:'eq-source'}],guards:[{path:patch('equipmentId','').path,value:'eq-target'},{path:['items',{id:'missing'},'equipmentId'],value:'eq-target'}]});
    assert.equal((await send('editor-a',{command:atomic})).status,409);assert.equal((await read()).workflow.working.items[0].equipmentId,'eq-target');
  });
  await check('T07/T11: incomplete business data saves, deleted entities reject delayed edits, invalid module actions denied',async()=>{
    const created=await ok('admin','apply',{moduleAction:'create-item',input:{errorId:'error-1',item:{}}});
    const item=created.control.workflow.working.items.at(-1);assert.equal(item.standard,'');
    await ok('admin','save');const failed=await send('admin',{command:await command('admin','submit',{savedId:(await read('admin')).workflow.saved.id,reason:'incomplete'})});
    assert.equal(failed.status,422);assert.equal(failed.body.error,'VALIDATION_FAILED');
    const bad=await send('editor-b',{command:await command('editor-b','apply',{moduleAction:'unknown',input:{id:item.id}})});assert.equal(bad.status,422);
    await ok('admin','apply',{moduleAction:'delete-item',input:{id:item.id}});
    const delayed=await send('editor-b',{command:await command('editor-b','apply',{patches:[{op:'set',path:['items',{id:item.id},'note'],value:'late'}]})});assert.equal(delayed.status,409);
    const state=await read();assert.equal(state.workflow.working.items.find(i=>i.id===item.id).deleted,true);
  });
  await check('T23: restore preview, stale revision rejection, desktop/mobile unsaved apply and immutable case',async()=>{
    const page=await sessions.admin.newPage();page.on('dialog',d=>d.accept());
    for(const width of [1366,390]){
      await ok('admin','apply',fixtureSetGuards((await read('admin')).workflow.working,[patch('note','Before restore '+width)]));
      const before=(await send('admin',{command:await command('admin','save')})).body.control.workflow;
      const source=before.cases[0],immutable=JSON.stringify(source);
      const preview=await (await sessions.admin.request.get(base+'/api/ipqc-c/workflow?restoreSaveId='+source.savedId)).json();
      await ok('admin','apply',fixtureSetGuards((await read('admin')).workflow.working,[patch('note','Intervening edit '+width)]));
      const stale=await send('admin',{command:await command('admin','restore',{restoreSaveId:source.savedId,expectedRevision:preview.expectedRevision})});assert.equal(stale.status,409);assert.equal(stale.body.error,'RESTORE_RECONFIRM');
      await page.setViewportSize({width,height:844});await page.goto(base+'/fixture');await page.locator('#ipqcc-case-history').click();
      await page.locator(`[data-ipqcc-case="${source.id}"]`).click();await page.locator('#ipqcc-case-restore').click();await page.locator('.shared-restore-dialog').waitFor();
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
      const footer=await page.locator('.shared-restore-dialog footer').boundingBox();assert.ok(footer.y+footer.height<=845);
      if(width>1000){const panels=await page.locator('.shared-restore-diff').first().locator(':scope>section').all(),a=await panels[0].boundingBox(),b=await panels[1].boundingBox();assert.ok(b.x>a.x+a.width);}
      await page.locator('[data-apply]').click();await page.locator('.shared-restore-dialog').waitFor({state:'detached'});
      const current=(await (await sessions.admin.request.get(base+'/api/ipqc-c')).json()).control.workflow;
      assert.deepEqual(current.saved,before.saved,'restore must not implicitly save');
      assert.deepEqual(current.active,before.active,'restore must not activate historical content');
      assert.equal(current.working.items[0].note,source.content.items[0].note);
      assert.equal(JSON.stringify(current.cases.find(c=>c.id===source.id)),immutable);
      assert.ok(current.working.items.some(i=>i.deleted),'newer allocated identity retained as tombstone');
    }
    await page.close();
  });
  await check('T17: history revocation redacts cases and recovery commands from all normal reads',async()=>{
    const historyPage=await sessions['editor-b'].newPage();await historyPage.goto(base+'/fixture');
    await historyPage.locator('#ipqcc-case-history').click();await historyPage.locator('[data-ipqcc-case]').first().click();
    await historyPage.locator('.ipqcc-case-diff').first().waitFor();
    const core=load('lib/process-state.ts'),state=await core.readState(),accounts=JSON.parse(state.values.platformUsers);
    accounts.find(u=>u.id==='editor-b').permissions=accounts.find(u=>u.id==='editor-b').permissions.filter(p=>p!=='approval.compare');
    db.prepare('UPDATE shared_state SET revision=revision+1,"values"=? WHERE id=1').run(await core.encodeValues({...state.values,platformUsers:JSON.stringify(accounts)}));
    const get=await sessions['editor-b'].request.get(base+'/api/ipqc-c');assert.equal(get.status(),200);const c=(await get.json()).control;
    assert.equal((await sessions['editor-b'].request.get(base+'/api/ipqc-c/workflow?history=cases')).status(),403);
    assert.equal((await sessions['editor-b'].request.get(base+'/api/ipqc-c/workflow?caseId=anything')).status(),403);
    assert.deepEqual(c.workflow.receipts,{});assert.deepEqual(c.workflow.sequences,{});assert.deepEqual(c.workflow.saves,[]);assert.deepEqual(c.workflow.cases,[]);
    assert.ok(c.versions.every(v=>v.id===c.activeVersionId||v.status==='draft'));
    const saved=await ok('editor-b','save');assert.deepEqual(saved.control.workflow.cases,[]);
    const publicValues=core.publicState(await core.readState()).values,publicControl=JSON.parse(publicValues.ipqcCMasterControl);
    assert.equal(publicControl.workflow,undefined);assert.ok(publicControl.versions.every(v=>v.id===publicControl.activeVersionId));
    await historyPage.locator('#ipqcc-case-dialog').waitFor({state:'detached',timeout:12000});await historyPage.close();
  });
  await check('T43 legacy IPQC-C archive remains read-only at desktop/narrow viewports; reserved refs rejected',async()=>{
    for(const width of [1366,390]){const p=await sessions.admin.newPage();await p.setViewportSize({width,height:844});await p.goto(base+'/fixture');await p.locator('#ipqcc-case-history').click();await p.locator('#ipqcc-case-legacy').click();await p.locator('[data-case="active-1"]').click();await p.locator('[data-back]').waitFor();assert.ok((await p.locator('.shared-restore-dialog').innerText()).includes('10 mm'));assert.equal(await p.locator('[data-restore]').count(),0);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);await p.keyboard.press('Escape');await p.close();}
    const before=await load('lib/process-state.ts').readState(),r=await send('admin',{command:await command('admin','apply',{patches:[{op:'set',path:['items',{id:'item-1'},'note'],value:{__immutableBody:{}}}]})});assert.equal(r.status,422);assert.equal(r.body.error,'RESERVED_STORAGE_REFERENCE');assert.equal((await load('lib/process-state.ts').readState()).values.ipqcCMasterControl,before.values.ipqcCMasterControl);
  });
  await check('T17/T39: live account revocation and legacy bypass fence',async()=>{
    const core=load('lib/process-state.ts'),state=await core.readState();const accounts=JSON.parse(state.values.platformUsers);accounts.find(u=>u.id==='editor-a').enabled=false;
    const values={...state.values,platformUsers:JSON.stringify(accounts)};db.prepare('UPDATE shared_state SET revision=revision+1,"values"=? WHERE id=1').run(await core.encodeValues(values));
    const r=await sessions['editor-a'].request.get(base+'/api/ipqc-c/workflow');assert.equal(r.status(),403);
    const legacy=load('app/api/ipqc-c/route.ts');const cookies=await sessions.admin.cookies();const current=await core.readState();
    const response=await legacy.POST(new Request(base+'/api/ipqc-c',{method:'POST',headers:{Origin:base,Cookie:cookies.map(c=>c.name+'='+c.value).join(';'),'Content-Type':'application/json'},body:JSON.stringify({action:'begin',baseRevision:current.revision})}));assert.equal(response.status,409);
  });
  console.log(JSON.stringify({result:'PASS',cases,separateSessions:4,environment:'ephemeral loopback HTTP + in-memory SQLite/R2; no Local data writes',results}));
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{await browser?.close();await new Promise(resolve=>server?server.close(resolve):resolve());db.close();});
