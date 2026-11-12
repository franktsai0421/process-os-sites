// CI-only two-context FQC matrix acceptance against the compiled Worker.
// No local launch fallback, employee account, production fixture or live endpoint.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHmac,randomBytes} from 'node:crypto';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {buildFqcDraftLifecycleSeed} from './fqc-draft-lifecycle-route-fixture.mjs';
import {fqcEditorReady,fqcPendingReady,fqcPageDiagnostic} from './fqc-draft-lifecycle-browser.mjs';
import {captureRequests,measureAction,summarizeActions,REQUIRED_SAMPLES} from './draft-action-measurement.mjs';

export const matrixMultiuserActions=Object.freeze(['begin','actor-a-choice','actor-b-choice','actor-a-save','actor-b-save',
  'save','peer-saved-selection','submit-open','submit-confirm','withdraw-open','withdraw-confirm','resolve-original-receipt']);
const clone=value=>JSON.parse(JSON.stringify(value));
export function buildMatrixMultiuserSeed(createSharedDraft,options={}) {
  const seed=buildFqcDraftLifecycleSeed(createSharedDraft,options);
  seed.actors.peer={...clone(seed.actors.editor),id:'fqc-life-peer',name:'Synthetic FQC peer'};
  seed.ids.secondItem=seed.ids.item+'-second';seed.ids.thirdItem=seed.ids.item+'-third';
  const item=seed.initialContent.items[0];item.rule={cadence:'batch',batchKind:'fixed_count',fixedCount:1};
  seed.initialContent.items.push({...clone(item),id:seed.ids.secondItem,checkNo:'LIFE-FQC-L1-02',name:'Synthetic second row'},
    {...clone(item),id:seed.ids.thirdItem,checkNo:'LIFE-FQC-L1-03',name:'Synthetic third row'});
  const quality=JSON.parse(seed.values.qualityMasterControl),c=quality.libraries.fqc;
  c.versions[0].snapshot=clone(seed.initialContent);
  c.workflow=createSharedDraft('fqc',seed.initialContent,seed.ids.active,seed.ids.generation);
  seed.values.platformUsers=JSON.stringify(Object.values(seed.actors));seed.values.qualityMasterControl=JSON.stringify(quality);
  seed.initialControl=clone(c);seed.contentBytes=Buffer.byteLength(JSON.stringify(seed.initialContent));seed.seedBytes=Buffer.byteLength(JSON.stringify(seed.values));
  return seed;
}
export function exactMatrixFailure({method,path,operationId,status,body,bodyText,failed,command},expected) {
  if(!expected||typeof expected.operationId!=='string'||!expected.operationId||operationId!==expected.operationId||path!=='/api/fqc/workflow')return false;
  if(expected.kind==='lost-ack')return method==='POST'&&failed===true&&status===null;
  if(expected.kind==='receipt404')return method==='GET'&&failed===false&&status===404&&bodyText==='{"error":"OPERATION_NOT_FOUND"}';
  // Observation allowance only: this kind never grants a teardown token.
  if(expected.kind==='revision409')return method==='POST'&&failed===false&&status===409&&body?.error==='DRAFT_REVISION_CHANGED_RECONFIRM'&&
    typeof body.requestId==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.requestId)&&
    Number.isSafeInteger(expected.revision)&&expected.revision>=0&&typeof expected.generation==='string'&&!!expected.generation&&
    command?.operationId===operationId&&command.action==='save'&&command.moduleAction==='save-local-v1'&&command.expectedRevision===expected.revision&&command.generation===expected.generation;
  return expected.kind==='guard409'&&typeof expected.itemId==='string'&&expected.itemId.length>0&&method==='POST'&&failed===false&&status===409&&body?.error==='DEPENDENCY_CHANGED_RECONFIRM'&&
    typeof body.requestId==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.requestId)&&
    Array.isArray(body.details?.path)&&body.details.path[0]==='items'&&body.details.path[1]?.id===expected.itemId&&body.details.path[2]==='productCodes'&&body.details.path.length===3;
}
export function matrixSelectionReady({actor,itemId,product,pressed,dirty}) {
  const host=document.querySelector('#data-content'),flow=window.FQCMasterUI?.control?.libraries?.fqc?.workflow;
  const nodes=host?.querySelectorAll('[data-matrix-item="'+itemId+'"][data-matrix-product="'+product+'"]');
  const account=window.sharedDraftAccountState?.();
  return window.ProcessSync?.identity?.id===actor&&host?.dataset.activeTab==='quality-fqc'&&flow?.scope==='fqc'&&nodes?.length===1&&
    nodes[0].getAttribute('aria-pressed')===String(pressed)&&!nodes[0].disabled&&nodes[0].getClientRects().length>0&&
    window.FQCMasterUI.navigation.hasLocalChanges()===dirty&&account?.queued===0&&!account.unknown;
}
// A fresh production page defaults to Vietnamese. Require the exact label for
// its supported locale, not a Chinese-only wait or a substring success hint.
export function matrixReceiptQueryReady({actor}) {
  const host=document.querySelector('#data-content'),flow=window.FQCMasterUI?.control?.libraries?.fqc?.workflow;
  const buttons=host?.querySelectorAll('#fqc-check-result'),account=window.sharedDraftAccountState?.();
  const lang=String(document.documentElement.lang||'').toLowerCase();
  const label=lang==='vi'?'Kiểm tra kết quả':lang==='zh'||lang.startsWith('zh-')?'查詢前次結果':null;
  return typeof actor==='string'&&!!actor&&window.ProcessSync?.identity?.id===actor&&
    host?.isConnected===true&&host.dataset.activeTab==='quality-fqc'&&flow?.scope==='fqc'&&
    account?.queued===0&&account.unknown===true&&buttons?.length===1&&label!==null&&
    buttons[0].textContent===label&&!buttons[0].disabled&&buttons[0].getClientRects().length>0;
}
// Test observation owns its lifecycle. Setup/teardown may end observation only
// after every admitted API body settles and the caller proves no private input,
// queued command or unknown operation. Action failures are never hidden.
export function observeMatrixPage(page,{origin,allowed,unexpected,stage}) {
  const inflight=new Set(),bodies=new Set(),requests=new Map(),confirmedGuards=new Map(),teardownProofs=new WeakMap();let observing=true,lastPost=null,postSequence=0;
  const api=req=>{const url=new URL(req.url());return url.origin===origin&&url.pathname.startsWith('/api/')?url:null;};
  const request=req=>{if(api(req)){if(req.method()==='POST'){lastPost=req;postSequence++;}inflight.add(req);requests.set(req,{stage:stage(),postSequence});}};
  const failure=(req,status,bodyText,body,failed)=>{
    const u=api(req);if(!u)return;
    let operationId,command;try{command=req.method()==='POST'?req.postDataJSON()?.command:undefined;operationId=command?.operationId??u.searchParams.get('operationId');}catch{}
    const rule=allowed.get(req);
    if(!exactMatrixFailure({method:req.method(),path:u.pathname,operationId,status,body,bodyText,failed,command},rule))
      unexpected.push({stage:requests.get(req)?.stage??stage(),kind:failed?'network':'http',path:u.pathname,status});
    else if(rule.kind==='guard409')confirmedGuards.set(req,{operationId,itemId:rule.itemId,rule,postSequence:requests.get(req)?.postSequence});
  };
  const requestfailed=req=>{if(!api(req))return;failure(req,null,undefined,undefined,true);inflight.delete(req);requests.delete(req);};
  const response=res=>{
    const req=res.request();if(!api(req))return;
    const task=(async()=>{const raw=await res.body();if(res.status()>=400){const bodyText=raw.toString('utf8');let body;try{body=JSON.parse(bodyText);}catch{}failure(req,res.status(),bodyText,body,false);}})()
      .catch(()=>unexpected.push({stage:requests.get(req)?.stage??stage(),kind:'unreadable-response'}))
      .finally(()=>{inflight.delete(req);requests.delete(req);bodies.delete(task);});bodies.add(task);
  };
  const pageerror=error=>unexpected.push({stage:stage(),kind:'pageerror',name:error.name});
  const dialog=value=>{unexpected.push({stage:stage(),kind:'dialog',type:value.type()});void value.dismiss();};
  const listeners={request,response,requestfailed,pageerror,dialog};for(const [name,listener]of Object.entries(listeners))page.on(name,listener);
  async function drain(){await deadline((async()=>{for(;;){await Promise.all(bodies);if(!inflight.size&&!bodies.size){await new Promise(resolve=>setTimeout(resolve,0));if(!inflight.size&&!bodies.size)return;}await new Promise(resolve=>setTimeout(resolve,5));}})(),'all observed API requests and bodies');}
  const detach=()=>{for(const [name,listener]of Object.entries(listeners))page.off(name,listener);observing=false;};
  return {inflight,bodies,drain,isObserving:()=>observing,
    rejectedTeardownToken(req){const confirmed=confirmedGuards.get(req);if(!observing||unexpected.length||!confirmed||lastPost!==req||confirmed.postSequence!==postSequence)return null;const token=Object.freeze({});teardownProofs.set(token,{req,confirmed,page});return token;},
    permitsRejectedTeardown(token){const proof=token&&teardownProofs.get(token);return !!(observing&&proof&&proof.page===page&&!unexpected.length&&lastPost===proof.req&&postSequence===proof.confirmed.postSequence&&confirmedGuards.get(proof.req)===proof.confirmed&&allowed.get(proof.req)===proof.confirmed.rule&&proof.confirmed.rule.kind==='guard409'&&proof.confirmed.rule.operationId===proof.confirmed.operationId&&proof.confirmed.rule.itemId===proof.confirmed.itemId);},
    async stop(assertSafe){assert.equal(observing,true);assert.equal(await assertSafe(),true,'Explicit safe setup boundary required');await drain();assert.equal(await assertSafe(),true,'Setup safety changed during drain');assert.equal(unexpected.length,0,'Errors observed before the explicit setup boundary');assert.equal(inflight.size,0);assert.equal(bodies.size,0);detach();},
    forceStopAfterFailure(){const open={requests:inflight.size,bodies:bodies.size};detach();return open;}};
}
const unique=async(page,selector)=>{const node=page.locator(selector);await node.waitFor({state:'visible'});assert.equal(await node.count(),1);assert(await node.isEnabled());return node;};
const cell=(item,product)=>`[data-matrix-item="${item}"][data-matrix-product="${product}"]`;
async function deadline(promise,label) {let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Required native event timed out: '+label)),30000);})]);}finally{clearTimeout(timer);}}
const idle=page=>page.waitForFunction(()=>{const s=window.sharedDraftAccountState?.();return s&&s.queued===0&&!s.unknown&&!s.failed;});
const matrixClean=page=>page.waitForFunction(()=>!window.FQCMasterUI.navigation.hasLocalChanges());
const submitted='#fqc-submit', confirm='.vd-confirm[open] button[type="submit"]';

export async function runMatrixMultiuserBrowser() {
  assert.equal(process.env.CI,'true','Two-context native acceptance requires authorized CI; no restricted local launch');
  const {chromium}=await import('playwright');
  const {createRootEntryFixture}=await import('./root-entry-native-fixture.mjs');
  const secret=randomBytes(32).toString('hex'),report={status:'RUNNING',layer:'CI_SYNTHETIC_BROWSER',module:'fqc-matrix-two-actors',programCommit:process.env.PROCESS_PROGRAM_COMMIT,
    samples:[],summary:[],cycles:[],functionalChecks:[],unexpected:[],realData:false,realCredentials:false,
    limitations:['Two isolated desktop browser contexts and actual compiled Worker, not two live employees or physical phones.',
      'Normal action click-to-ready plus two frames only. Orchestrated overlap/fault waits are functional checks, not performance samples.',
      'One Save merges changed cells and persists the shared snapshot; deleted items and invalid product scope reject.',
      'Fresh shared_state and contexts per cycle; same nonpersistent R2 retains earlier immutable objects.',
      'Between scenarios, controlled fresh pages replace only clean private input/queue/unknown state after all API bodies drain. Shared saved data is verified unchanged; this is not user reload/beforeunload acceptance.',
      'No source timing baseline, Server-Timing guarantee, or claim that all FQC/module buttons are covered.']};
  let fixture,browser,stage='fixture';const sessions=new Set();
  try {
    fixture=await createRootEntryFixture({recordOracle:true,syntheticBindings:{PROCESS_IMPORT_ENABLED:'0',PROCESS_OWNER_BOOTSTRAP_ENABLED:'0',PROCESS_SESSION_SECRET:secret,PROCESS_SESSION_REVOCATION_ENABLED:'1',DEMO_LOGIN_ENABLED:'false'}});
    assert.equal(fixture.url.hostname,'127.0.0.1');const origin=fixture.url.origin,bucket=await fixture.mf.getR2Bucket('STATE_ARCHIVE');
    const load=createRequire(import.meta.url)('../scripts/ipqc-ab-import-harness.cjs')({STATE_ARCHIVE:bucket}),codec=load('lib/state-records.ts');
    browser=await chromium.launch({headless:true});report.buildEntrySha256=fixture.buildEntrySha256;report.recordOracleSha256=fixture.recordOracleSha256;
    for(let cycle=1;cycle<=REQUIRED_SAMPLES;cycle++) {
      stage=`${cycle}:seed`;const seed=buildMatrixMultiuserSeed(load('lib/shared-draft.ts').createSharedDraft,{cycle});
      await fixture.db.prepare('INSERT OR REPLACE INTO shared_state(id,revision,"values",updated_at) VALUES(1,1,?,?)').bind(await codec.encodeRecordValues(bucket,seed.values),'synthetic FQC matrix multiuser').run();
      const values=()=>fixture.readRecordValues();
      const control=async()=>JSON.parse((await values()).qualityMasterControl).libraries.fqc;
      const codes=async(id)=>((await control()).workflow.working.items.find(row=>row.id===id)).productCodes;
      const allowed=new WeakMap();
      async function open(actor) {
        const context=await browser.newContext({viewport:{width:1365,height:900},serviceWorkers:'block'});
        const entry={context,actor,page:null,observer:null,intercept:null,rejectedTeardown:null,usedRejectedTeardown:false,epoch:null};sessions.add(entry);
        const token=Buffer.from(JSON.stringify({version:2,id:actor.id,sessionType:'platform',authEpoch:1,expires:Date.now()+600000,nonce:'fqc-matrix-'+cycle+'-'+actor.id})).toString('base64');
        await context.addCookies([{name:'process_demo',value:token+'.'+createHmac('sha256',secret).update(token).digest('hex'),url:origin,httpOnly:true,sameSite:'Lax'}]);
        await context.route('**/*',route=>{
          const req=route.request(),u=new URL(req.url());
          if(u.origin!==origin||!(['GET','HEAD'].includes(req.method())||req.method()==='POST'&&u.pathname==='/api/fqc/workflow'))return route.abort();
          return entry.intercept?entry.intercept(route,req,u):route.continue();
        });
        await reload(entry);return entry;
      }
      async function safeToReplace(entry) {
        const state=await entry.page.evaluate(({actor,epoch})=>{const s=window.sharedDraftAccountState?.(),sync=window.ProcessSync,host=document.querySelector('#data-content');
          return {safe:!!s&&sync?.identity?.id===actor&&sync.identityGeneration()===epoch&&!sync.requiresReload&&sync.destination?.view==='data'&&host?.isConnected===true&&host.dataset.activeTab==='quality-fqc'&&document.documentElement.dataset.processNavigationStatus==='ready'&&s.queued===0&&!s.unknown&&!window.FQCMasterUI.navigation.hasLocalChanges()&&!document.querySelector('.fqc-modal-overlay,.vd-confirm[open]'),failed:s?.failed};
        },{actor:entry.actor.id,epoch:entry.epoch});
        assert.equal(state.safe,true,'Setup cannot discard private input, changed owner/target, a modal, queued write or unknown operation');
        if(state.failed){assert.equal(entry.observer.permitsRejectedTeardown(entry.rejectedTeardown),true,'Only this page original observed guard409 may end a known-failed negative scenario');entry.usedRejectedTeardown=true;}return true;
      }
      async function reload(entry) {
        stage=`${cycle}:${entry.actor.id}:explicit-fresh-page`;const before=await control();
        if(entry.page){const previous=entry.page;await entry.observer.stop(()=>{assert.equal(entry.page,previous,'Exact prior page must still own setup');return safeToReplace(entry);});if(entry.usedRejectedTeardown)report.functionalChecks.push({cycle,name:'known-guard409-page-ended-with-failed-flag',status:'PASS_NEGATIVE_SCENARIO_ONLY',productRecovery:false,timed:false});await previous.close();}
        // Controlled fixture page replacement, not a user reload/beforeunload test.
        // Shared saved data is preserved and checked below; setup never writes it.
        entry.page=await entry.context.newPage();entry.page.setDefaultTimeout(30000);entry.rejectedTeardown=null;entry.usedRejectedTeardown=false;
        entry.observer=observeMatrixPage(entry.page,{origin,allowed,unexpected:report.unexpected,stage:()=>stage});
        await entry.page.goto(origin+'/process/index.html?view=data&dataTab=quality-fqc',{waitUntil:'domcontentloaded'});
        await entry.page.waitForFunction(fqcEditorReady,{actor:entry.actor.id});await idle(entry.page);entry.epoch=await entry.page.evaluate(()=>window.ProcessSync.identityGeneration());assert(Number.isSafeInteger(entry.epoch)&&entry.epoch>=0);
        await entry.observer.drain();assert.deepEqual(await control(),before,'Fresh page setup cannot mutate shared data');
      }
      async function measure(entry,action,selector,ready,verify,expectedPost) {
        stage=`${cycle}:${action}`;await unique(entry.page,selector);
        return measureAction({page:entry.page,origin,action,cycle,selector,ready,verify,expectedPost,samples:report.samples});
      }
      async function click(entry,selector){await(await unique(entry.page,selector)).click();}
      async function choose(entry,id,product,pressed=true){await click(entry,cell(id,product));await entry.page.waitForFunction(matrixSelectionReady,{actor:entry.actor.id,itemId:id,product,pressed,dirty:true});}
      async function save(entry){await click(entry,'#fqc-save');await matrixClean(entry.page);await idle(entry.page);}
      async function functional(name,entries,body) {
        stage=`${cycle}:${name}`;const stops=entries.map(entry=>captureRequests(entry.page,origin));let error;
        try {await body();}catch(caught){error=caught;}
        const network=[];for(const stop of stops)network.push(await stop());
        await Promise.all(entries.map(entry=>entry.observer.drain()));
        try {
          assert(network.every(row=>row.networkComplete),'Every planned failed request still needs complete accounting');assert.deepEqual(report.unexpected,[]);
          const rows=network.flatMap(row=>row.requests.rows),posted=rows.filter(row=>row.method==='POST');
          if(name==='lost-ack-original-receipt-never-repost') {
            assert.equal(posted.length,1);assert.equal(posted[0].failed,true);assert.equal(rows.filter(row=>row.status===404).length,2,'one automatic plus one explicit receipt lookup');
          } else if(name==='overlapping-flight-refusal-then-explicit-fresh-save') {
            assert.equal(posted.length,3);assert.equal(posted.filter(row=>row.status===409).length,1);assert.equal(posted.filter(row=>row.status===200).length,2);
          } else {
            assert.equal(posted.length,2);assert.equal(posted.filter(row=>row.status===409).length,0);assert.equal(posted.filter(row=>row.status===200).length,2);
          }
        }catch(caught){error??=caught;}
        report.functionalChecks.push({cycle,name,status:error?'FAIL':'PASS',network,layer:'CI_SYNTHETIC_BROWSER',timed:false});if(error)throw error;
      }
      const a=await open(seed.actors.editor);await measure(a,'begin','#fqc-begin',async()=>{await a.page.waitForFunction(fqcEditorReady,{actor:a.actor.id,status:'draft'});await idle(a.page);},async()=>assert.equal((await control()).workflow.pendingId,null),1);
      const b=await open(seed.actors.peer);assert.notEqual(await a.page.evaluate(()=>window.ProcessSync.identity.id),await b.page.evaluate(()=>window.ProcessSync.identity.id));
      const before=await control();
      await measure(a,'actor-a-choice',cell(seed.ids.item,seed.ids.product),()=>a.page.waitForFunction(matrixSelectionReady,{actor:a.actor.id,itemId:seed.ids.item,product:seed.ids.product,pressed:true,dirty:true}),async()=>assert.deepEqual(await control(),before),0);
      await measure(b,'actor-b-choice',cell(seed.ids.secondItem,seed.ids.product),()=>b.page.waitForFunction(matrixSelectionReady,{actor:b.actor.id,itemId:seed.ids.secondItem,product:seed.ids.product,pressed:true,dirty:true}),async()=>assert.deepEqual(await control(),before),0);
      await measure(a,'actor-a-save','#fqc-save',async()=>{await matrixClean(a.page);await idle(a.page);},async()=>{assert.deepEqual(await codes(seed.ids.item),[seed.ids.product]);assert.deepEqual((await control()).workflow.saved.content,(await control()).workflow.working);},1);
      assert.equal(await b.page.locator(cell(seed.ids.secondItem,seed.ids.product)).getAttribute('aria-pressed'),'true');
      await measure(b,'actor-b-save','#fqc-save',async()=>{await matrixClean(b.page);await idle(b.page);},async()=>{assert.deepEqual(await codes(seed.ids.item),[seed.ids.product]);assert.deepEqual(await codes(seed.ids.secondItem),[seed.ids.product]);assert.deepEqual((await control()).workflow.saved.content,(await control()).workflow.working);},1);
      await reload(a);await reload(b);
      await functional('overlapping-flight-refusal-then-explicit-fresh-save',[a,b],async()=>{
        await choose(a,seed.ids.thirdItem,seed.ids.product2);await choose(b,seed.ids.thirdItem,seed.ids.product);
        const localBefore=await a.page.evaluate(()=>window.FQCMasterUI.control.libraries.fqc.versions.find(v=>v.status==='draft').snapshot);
        let release,heldCommand,heldRequest,postAttempts=0,explicitRetry=false,freshReads=0,retryCommand;
        const held=new Promise(resolve=>{a.intercept=async(route,req,u)=>{
          if(req.method()==='GET'&&u.pathname==='/api/fqc/workflow'&&!u.searchParams.has('operationId')&&explicitRetry)freshReads++;
          if(req.method()==='POST'&&u.pathname==='/api/fqc/workflow'){
            postAttempts++;const current=req.postDataJSON().command;
            assert.equal(current.action,'save');assert.equal(current.moduleAction,'save-local-v1');assert.deepEqual(current.input.matrixCells,[{itemId:seed.ids.thirdItem,productCode:seed.ids.product2,base:false,value:true}]);
            if(!heldCommand){
              heldCommand=current;heldRequest=req;assert(Number.isSafeInteger(current.expectedRevision));
              allowed.set(req,{kind:'revision409',operationId:current.operationId,revision:current.expectedRevision,generation:current.generation});
              resolve();await new Promise(done=>{release=done;});
            }else{
              assert.equal(explicitRetry,true,'no automatic retry after a stale comparison');assert.equal(postAttempts,2);assert(freshReads>0,'explicit retry requires a fresh read');
              assert.notEqual(current.operationId,heldCommand.operationId);assert(current.expectedRevision>heldCommand.expectedRevision);retryCommand=current;
            }
          }return route.continue();
        };});
        try{
          await click(a,'#fqc-save');await deadline(held,'first original matrix POST');await save(b);
          assert.deepEqual(await codes(seed.ids.thirdItem),[seed.ids.product]);const peerOnly=await control();
          release();release=null;
          await a.page.waitForFunction(()=>{const account=window.sharedDraftAccountState();return account.queued===0&&account.failed&&!account.unknown&&window.FQCMasterUI.navigation.hasLocalChanges()&&document.querySelector('#fqc-save')?.disabled===false;});
          // Known refusal is intentionally failed, so do not use clean-success idle here.
          await a.observer.drain();assert.deepEqual(report.unexpected,[]);assert.equal(postAttempts,1);
          assert.equal(a.observer.rejectedTeardownToken(heldRequest),null,'revision observation cannot authorize ending a failed page');
          assert.deepEqual(await control(),peerOnly);assert.deepEqual(await a.page.evaluate(()=>window.FQCMasterUI.control.libraries.fqc.versions.find(v=>v.status==='draft').snapshot),localBefore);
          assert.equal(await a.page.locator(cell(seed.ids.thirdItem,seed.ids.product2)).getAttribute('aria-pressed'),'true');
          explicitRetry=true;await save(a);assert.equal(postAttempts,2);assert(retryCommand);assert.equal(retryCommand.expectedRevision,peerOnly.workflow.revision);
          assert.deepEqual(new Set(await codes(seed.ids.thirdItem)),new Set([seed.ids.product,seed.ids.product2]));assert.deepEqual((await control()).workflow.saved.content,(await control()).workflow.working);
          assert.deepEqual(await a.page.evaluate(()=>{const s=window.sharedDraftAccountState();return {unknown:s.unknown,failed:s.failed};}),{unknown:false,failed:false});
        }finally{release?.();a.intercept=null;}
      });
      await reload(a);await reload(b);
      await functional('same-row-independent-add-remove-merge',[a,b],async()=>{
        await choose(a,seed.ids.item,seed.ids.product2);await choose(b,seed.ids.item,seed.ids.product,false);await save(b);assert.deepEqual(await codes(seed.ids.item),[]);await save(a);assert.deepEqual(await codes(seed.ids.item),[seed.ids.product2]);assert.deepEqual((await control()).workflow.saved.content,(await control()).workflow.working);
      });
      await measure(a,'save','#fqc-save',async()=>{await a.page.waitForFunction(()=>!!window.FQCMasterUI.control.libraries.fqc.workflow.saved);await idle(a.page);},async()=>{const f=(await control()).workflow;assert.deepEqual(f.saved.content,f.working);assert.equal(f.saved.actor.id,a.actor.id);},1);
      const saved=clone((await control()).workflow.saved);await reload(b);
      // A real reload is tested only after the fresh peer has read a fully saved,
      // clean model. Unsaved/owned setup pages above are not reloaded through the
      // real beforeunload guard and are not represented as that user interaction.
      stage=`${cycle}:peer-saved-real-reload`;await b.observer.drain();await safeToReplace(b);
      const beforeReload=await control();assert.deepEqual(beforeReload.workflow.working,beforeReload.workflow.saved.content);
      await b.page.reload({waitUntil:'domcontentloaded'});await b.page.waitForFunction(fqcEditorReady,{actor:b.actor.id,status:'draft',savedId:saved.id});await idle(b.page);await b.observer.drain();b.epoch=await b.page.evaluate(()=>window.ProcessSync.identityGeneration());assert(Number.isSafeInteger(b.epoch)&&b.epoch>=0);
      assert.deepEqual(await control(),beforeReload);assert.deepEqual(report.unexpected,[]);report.functionalChecks.push({cycle,name:'peer-saved-real-reload',status:'PASS',timed:false});
      const draft=(await control()).versions.find(v=>v.status==='draft');assert(draft);
      await b.page.locator('#fqc-approved-version').focus();await b.page.locator('#fqc-approved-version option[value="'+seed.ids.active+'"]').waitFor({state:'attached'});await b.page.locator('#fqc-approved-version').selectOption(seed.ids.active);await b.page.waitForFunction(id=>document.querySelector('#fqc-approved-version')?.value===id&&document.querySelector('[data-vd-approved-view]')?.hidden===false,seed.ids.active);
      await measure(b,'peer-saved-selection','#fqc-approved-version',async()=>{await b.page.locator('#fqc-approved-version').selectOption('');await b.page.waitForFunction(fqcEditorReady,{actor:b.actor.id,status:'draft',savedId:saved.id});},async()=>{assert.deepEqual((await control()).workflow.saved,saved);const visible=await b.page.evaluate(()=>window.FQCMasterUI.control.libraries.fqc.workflow.saved);assert.deepEqual(visible,saved);},0);
      await measure(a,'submit-open',submitted,()=>a.page.locator('.vd-confirm[open]').waitFor(),async()=>assert.equal((await control()).workflow.pendingId,null),0);
      await a.page.locator('.vd-confirm[open] textarea').fill('Synthetic two-actor matrix submit');const generation=(await control()).workflow.generation;
      await measure(a,'submit-confirm',confirm,async()=>{await a.page.locator('.vd-confirm').waitFor({state:'detached'});await a.page.waitForFunction(fqcPendingReady,{actor:a.actor.id,generation,savedId:saved.id});await idle(a.page);},async()=>{const f=(await control()).workflow;assert.equal(f.cases.find(c=>c.id===f.pendingId).savedId,saved.id);},1);
      await reload(b);await b.page.waitForFunction(fqcPendingReady,{actor:b.actor.id,generation,savedId:saved.id});assert.equal(await b.page.locator('#fqc-save,#fqc-submit').count(),0);
      assert.equal(await b.page.locator('[data-matrix-item]:not([disabled])').count(),0,'pending peer matrix has no editable cell');report.functionalChecks.push({cycle,name:'peer-pending-lock',status:'PASS',timed:false});
      await measure(a,'withdraw-open','#fqc-withdraw',()=>a.page.locator('.vd-confirm[open]').waitFor(),async()=>assert((await control()).workflow.pendingId),0);
      await a.page.locator('.vd-confirm[open] textarea').fill('Synthetic two-actor withdraw');
      await measure(a,'withdraw-confirm',confirm,async()=>{await a.page.locator('.vd-confirm').waitFor({state:'detached'});await a.page.waitForFunction(fqcEditorReady,{actor:a.actor.id,status:'draft'});await idle(a.page);},async()=>{const f=(await control()).workflow;assert.equal(f.pendingId,null);assert.notEqual(f.generation,generation);assert.deepEqual(f.saved,saved);},1);
      await reload(a);await reload(b);
      let lostOperation=null,receipt404=true,postAttempts=0,savedAfterLost=null;
      await functional('lost-ack-original-receipt-never-repost',[a],async()=>{
        await choose(a,seed.ids.secondItem,seed.ids.product2);
        a.intercept=async(route,req,u)=>{
          if(req.method()==='POST'&&u.pathname==='/api/fqc/workflow'){
            assert.equal(u.pathname+u.search,'/api/fqc/workflow?caseMetadata=1&compact=1');postAttempts++;assert.equal(postAttempts,1,'unknown must not emit a second POST');const c=req.postDataJSON().command;assert.equal(c.action,'save');assert.equal(c.moduleAction,'save-local-v1');assert.deepEqual(c.input.matrixCells,[{itemId:seed.ids.secondItem,productCode:seed.ids.product2,base:false,value:true}]);lostOperation=c.operationId;
            const res=await route.fetch();assert.equal(res.status(),200);const body=await res.json();assert.equal(body.receipt.operationId,lostOperation);assert.equal(body.receipt.generation,c.generation);
            allowed.set(req,{kind:'lost-ack',operationId:lostOperation});return route.abort('failed');
          }
          if(req.method()==='GET'&&u.pathname==='/api/fqc/workflow'&&u.searchParams.has('operationId')){
            assert.equal(u.searchParams.get('operationId'),lostOperation);if(receipt404){allowed.set(req,{kind:'receipt404',operationId:lostOperation});return route.fulfill({status:404,contentType:'application/json',body:'{"error":"OPERATION_NOT_FOUND"}'});}
          }return route.continue();
        };
        await click(a,'#fqc-save');await a.page.waitForFunction(matrixReceiptQueryReady,{actor:a.actor.id});
        await click(a,'#fqc-check-result');await a.page.waitForFunction(matrixReceiptQueryReady,{actor:a.actor.id});
        assert.equal(postAttempts,1);assert.deepEqual(new Set(await codes(seed.ids.secondItem)),new Set([seed.ids.product,seed.ids.product2]));savedAfterLost=clone((await control()).workflow.saved);assert.notEqual(savedAfterLost.id,saved.id);assert.deepEqual(savedAfterLost.content,(await control()).workflow.working);
      });
      receipt404=false;
      await measure(a,'resolve-original-receipt','#fqc-check-result',async()=>{await matrixClean(a.page);await idle(a.page);},async()=>{assert.equal(postAttempts,1);assert.deepEqual(new Set(await codes(seed.ids.secondItem)),new Set([seed.ids.product,seed.ids.product2]));assert.deepEqual((await control()).workflow.saved,savedAfterLost);},0);
      a.intercept=null;await Promise.all([a.observer.drain(),b.observer.drain()]);assert.deepEqual(report.unexpected,[]);
      const final=await values();for(const key of Object.keys(seed.values).filter(k=>k!=='qualityMasterControl'))assert.equal(final[key],seed.values[key]);
      report.cycles.push({cycle,status:'PASS',distinctActors:true,seedBytes:seed.seedBytes,contentBytes:seed.contentBytes,peerSavedReadback:true,unknownSavePosts:postAttempts});
      for(const entry of sessions){await entry.observer.stop(()=>safeToReplace(entry));await entry.context.close();sessions.delete(entry);}assert.deepEqual(report.unexpected,[]);
    }
    assert.deepEqual(report.unexpected,[]);assert.equal(sessions.size,0);report.summary=summarizeActions(report.samples,matrixMultiuserActions);assert(report.summary.every(r=>r.status==='PASS_FUNCTION_MEASURED'));report.status='PASS_CI_SYNTHETIC_FQC_MATRIX_MULTIUSER';
  }catch(error){report.status='FAIL_CI_SYNTHETIC_FQC_MATRIX_MULTIUSER';report.failedStage=stage;report.failure={name:error.name,message:String(error.message).replaceAll(secret,'[redacted]').slice(0,500)};report.summary=summarizeActions(report.samples,matrixMultiuserActions);report.diagnostics=[];
    for(const entry of sessions)if(entry.page&&!entry.page.isClosed()){try{report.diagnostics.push(await entry.page.evaluate(fqcPageDiagnostic,{actor:entry.actor.id,view:'data'}));}catch{report.diagnostics.push({unavailable:true});}}
  }finally{for(const entry of sessions){assert(!report.status.startsWith('PASS_'),'Incomplete observed teardown cannot PASS');report.incompleteTeardown??=[];report.incompleteTeardown.push(entry.observer?.forceStopAfterFailure()??{uninitialized:true});await entry.context.close();}if(browser)await browser.close();if(fixture)await fixture.close();report.disposed=true;}
  fs.mkdirSync('.sites-runtime',{recursive:true});fs.writeFileSync('.sites-runtime/fqc-matrix-multiuser-browser-result.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const result=await runMatrixMultiuserBrowser();process.exitCode=result.status.startsWith('PASS_')?0:1;}
