const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url'),{webcrypto}=require('node:crypto');
const source=path.resolve(process.env.REFERENCE_SOURCE||path.join(__dirname,'..')),read=n=>fs.readFileSync(path.join(source,'public/process',n),'utf8'),copy=structuredClone,tick=()=>new Promise(setImmediate);
const actor={id:'synthetic-admin',role:'admin',name:'Synthetic'},at='2026-10-27T00:00:00Z';
const eqs=[{id:'eq',assetCode:'SYN-EQ',pieceMark:'01',name:'Synthetic equipment',groupId:'group',enabled:true},{id:'eq2',assetCode:'SYN-OTHER',pieceMark:'02',name:'Other synthetic',groupId:'group',enabled:true}];
function dto(){const items=Array.from({length:4},(_,i)=>({id:'item'+i,errorId:'error',checkNo:'SYN-'+i,name:'Active check '+i,equipmentId:'eq',equipmentSnapshot:{id:'eq',assetCode:'SNAPSHOT-EQ',pieceMark:'01',name:'Original tool'},rule:{cadence:'batch',batchKind:'fixed_count',fixedCount:7},productCodes:['SYN-P'],mediaItems:[{id:'photo'+i,src:'/synthetic/photo-'+i+'.png',name:'Synthetic photo'}],isEnabled:true}));const snap={errors:[{id:'error',code:'SYN-E',name:'Synthetic defect'}],items};const version=(id,number,status,snapshot)=>({id,number,status,snapshot,history:[]});return{revision:7,permissions:{view:true,history:true},control:{activeVersionId:'active',versions:[version('active',23,'approved',snap),version('old',19,'superseded',{errors:copy(snap.errors),items:[{...copy(items[0]),name:'Historical exact',equipmentSnapshot:{id:'eq',assetCode:'HIST-EQ',pieceMark:'07'},rule:{cadence:'time',timeFrequency:'custom',customTimeText:'Every two hours'},mediaItems:[{id:'oldphoto',src:'/synthetic/historical.png',name:'Historical photo'}]}]}),version('draft',24,'draft',{errors:copy(snap.errors),items:[copy(items[0])]}),version('pending',25,'pending',{errors:copy(snap.errors),items:[copy(items[1])]})]}};}
async function fixture(){
 const{canvasDOM}=await import(pathToFileURL(path.join(source,'scripts/login-reentry-dom.mjs')).href),dom=canvasDOM(),doc=dom.document;doc.documentElement.lang='zh';doc.hidden=false;doc.visibilityState='visible';const main=doc.createElement('main');main.id='data-content';main.dataset.activeTab='quality-routine-equipment';doc.body.append(main);
 let epoch=1,delivery=1;const requests=[],pending=[],writes=[],notices=[];
 const c={...dom,console,crypto:webcrypto,URL,URLSearchParams,Response,AbortController,AbortSignal,structuredClone,Map,Set,Promise,JSON,Date,Math,Intl,Number,Error,CSS:{escape:String},location:{href:'https://synthetic.invalid/process/',pathname:'/process/'},state:{view:'data',dataTab:'quality-routine-equipment'},scrollY:0,scrollTo(){},requestAnimationFrame(){},setTimeout(){},clearTimeout(){},setInterval(){},clearInterval(){},hasPermission:()=>true,confirm:()=>true,alert:m=>notices.push(m),toast:m=>notices.push(m),localStorage:{getItem:()=>null,setItem:(...x)=>writes.push(x),removeItem:(...x)=>writes.push(x)},sessionStorage:{getItem:()=>null,setItem:(...x)=>writes.push(x),removeItem:(...x)=>writes.push(x)},ProcessSync:{identity:copy(actor),identityGeneration:()=>epoch,captureDelivery:()=>({delivery}),isCurrentDelivery:o=>o.delivery===delivery,platformHeaders:()=>({}),requiresReload:false},VersionDraftUI:{mount(){},date:()=>at,t:x=>x,updateSync(){},updateSaved(){}}};
 c.window=c;dom.events(c);c.fetch=(url,options={})=>{assert.equal(options.method||'GET','GET','View must never write');requests.push({url:String(url),method:'GET',timeoutSignal:!!options.signal});return new Promise(resolve=>pending.push(resolve));};vm.createContext(c);vm.runInContext(read('shared-draft-client.js'),c);
 const fqcHook="window.__fqcViewTest={getControl:()=>control,poison(){control={libraries:{fqc:{activeVersionId:'poison',versions:[]}}};equipmentCache={equipment:[{id:'eq',assetCode:'POISON-EQ',pieceMark:'99'}]};equipmentCacheCurrent=()=>true;}};";
 vm.runInContext(read('fqc-master.js').replace('})(window);',fqcHook+'})(window);'),c);c.__fqcViewTest.poison();
 const eqHook="window.__eqViewTest={render,bindList,refreshOpenEquipmentReferences,get view(){return viewDialog;},bump(){revision++;},install(root,model){host=root;control=model;controlActor=identity().id;revision=1;selectedVersionId='equipment-active';selectedCategory='cat';selectedSubcategory='sub';selectedGroup='group';}};";
 vm.runInContext(read('routine-equipment.js').replace(/\}\)\(\);\s*$/,eqHook+'})();'),c);
 c.__eqViewTest.install(main,{activeVersionId:'equipment-active',versions:[{id:'equipment-active',number:11,status:'approved',history:[],equipment:copy(eqs),categories:[{id:'cat',name:'Synthetic'}],subcategories:[{id:'sub',name:'Synthetic sub',categoryId:'cat'}],groups:[{id:'group',name:'Synthetic group',categoryId:'cat',subcategoryId:'sub'}],issues:[]}]});c.__eqViewTest.render();
 return{c,doc,main,requests,pending,writes,notices,open(id='eq'){const button=main.querySelector('[data-equipment-view="'+id+'"]');assert(button,'Actual view button');return button.click();},expand(kind){const details=main.querySelector('[data-view-ref-kind="'+kind+'"]');assert(details);details.open=true;details.dispatchEvent({type:'toggle'});},async respond(data=dto(),status=200,index=0){assert(pending[index]);pending[index]({ok:status>=200&&status<300,status,json:async()=>data});await tick();},async malformed(status=403,index=0){pending[index]({ok:false,status,json:async()=>{throw Error('nonJSON');}});await tick();},rotate(){epoch++;},newDelivery(){delivery++;},close(){main.querySelector('#routine-view-close').click();},tick};
}
function currentDTO(){
 const source='eq',active=dto().control.versions.find(v=>v.id==='active');
 const byModule=['fqc','iqc','ipqc-ab','ipqc-c'].map(moduleId=>{
  const scopes=moduleId==='ipqc-ab'?['A:SYN','B:SYN']:[''];
  return {moduleId,connected:true,referenceVisible:true,items:scopes.flatMap(scope=>active.snapshot.items.map(i=>({
    id:scope?JSON.stringify([scope,i.id]):i.id,itemId:i.id,scopeKey:scope,activeEquipmentId:source,draftEquipmentId:'',
    selectable:true,effectiveReference:{versionId:active.id,versionNumber:active.number,status:'approved',itemId:i.id,scope,checkNo:i.checkNo,itemName:i.name}
  })))};
 });
 return {referenceSourceId:source,revision:7,modules:byModule,pending:[]};
}
const results=[];
async function check(name,fn){await fn();results.push(name);console.log(name,'PASS');}
(async()=>{
 await check('Four closed modules make no requests. Four expanded modules share one pinned preview.',async()=>{
  const f=await fixture();f.open();assert.equal(f.requests.length,0);
  for(const k of ['fqc','iqc','ipqcAB','ipqcC','planned'])f.expand(k);
  await tick();assert.equal(f.requests.length,1);assert.match(f.requests[0].url,/quality-equipment-replacement\?sourceId=eq$/);
  const data=currentDTO();data.modules[0].items[0].selectable=false;data.modules[0].items[0].unavailableReason='待審';
  await f.respond(data);const states=f.c.__eqViewTest.view.references.states;
  assert(Object.values(states).every(r=>r.revision===7&&r.status==='loaded'));
  assert.equal(states.ipqcAB.result.active.length,8);
  assert.match(f.main.querySelector('[data-view-ref-kind="fqc"] summary').textContent,/直接引用 4 筆，可選 3 筆/);
  assert.match(f.main.textContent,/待審已鎖定/);assert.equal(f.writes.length,0);
 });
 await check('History-only standards yield effective zero. Open draft and pending stay separate.',async()=>{
  const f=await fixture();f.open();f.expand('iqc');await tick();const data=currentDTO();
  const items=data.modules.find(m=>m.moduleId==='iqc').items;
  for(const [n,r] of items.entries())Object.assign(r,{activeEquipmentId:'elsewhere',effectiveReference:null,draftEquipmentId:'eq',openStatus:n%2?'draft':'pending',openVersionId:'v-open',code:'DRAFT-'+n,openVersionNumber:4,selectable:!!(n%2)});
  await f.respond(data);
  const node=f.main.querySelector('[data-view-ref-kind="iqc"]');assert.match(node.querySelector('summary').textContent,/直接引用 0 筆，可選 0 筆/);
  const extra=node.querySelector('.routine-ref-extra');assert(extra&&!extra.open);assert.match(extra.textContent,/草稿中 \(2\)/);assert.match(extra.textContent,/主管審核中 \(2\)/);
  assert.equal(node.querySelectorAll('.routine-ref-extra [data-view-exact]').length,4);
 });
 for(const failure of ['aborted','bad DTO','disconnected','permission','wrong piece','HTTP 503']){
  await check(failure+' stays unknown; retry fetches a fresh snapshot',async()=>{
   const f=await fixture();f.open();f.expand('ipqcC');await tick();const data=currentDTO(),m=data.modules.find(m=>m.moduleId==='ipqc-c');
   if(failure==='aborted'){f.pending[0](Promise.reject(new DOMException('Fetch is aborted','AbortError')));await tick();}
   else{
    if(failure==='bad DTO')delete m.items[0].effectiveReference;
    if(failure==='disconnected')m.connected=false;
    if(failure==='permission')m.referenceVisible=false;
    if(failure==='wrong piece')data.referenceSourceId='other-piece';
    await f.respond(data,failure==='HTTP 503'?503:200);
   }
   const summary=()=>f.main.querySelector('[data-view-ref-kind="ipqcC"] summary').textContent;
   assert.match(summary(),/查詢未完成/);assert.doesNotMatch(summary(),/0/);
   f.main.querySelector('[data-view-ref-retry="ipqcC"]').click();await tick();
   const fresh=currentDTO();fresh.revision=8;fresh.modules.find(m=>m.moduleId==='ipqc-c').items=[];
   await f.respond(fresh,200,1);assert.match(summary(),/直接引用 0/);assert.equal(f.c.__eqViewTest.view.references.states.ipqcC.revision,8);
  });
 }
 for(const change of ['actor','close','device','delivery','revision']){
  await check('late common preview ignored after '+change,async()=>{
   const f=await fixture();f.open();f.expand('fqc');await tick();
   if(change==='actor')f.rotate();if(change==='close')f.close();if(change==='device')f.open('eq2');if(change==='delivery')f.newDelivery();if(change==='revision')f.c.__eqViewTest.bump();
   const before=f.main.innerHTML;await f.respond(currentDTO());assert.equal(f.main.innerHTML,before);assert.equal(f.writes.length,0);
  });
 }
 await check('FQC exact effective item opens its approved snapshot; stale locator never falls back',async()=>{
  const f=await fixture();f.open();f.expand('fqc');await tick();await f.respond(currentDTO());
  const link=()=>f.main.querySelector('[data-view-exact="fqc"][data-iid="item0"]');link().click();await tick();
  const q=new URL(f.requests[1].url,'https://synthetic.invalid').searchParams;
  assert.deepEqual([q.get('revision'),q.get('sourceId'),q.get('versionId'),q.get('itemId')],['7','eq','active','item0']);
  const v=copy(dto().control.versions.find(v=>v.id==='active'));v.snapshot.items=[v.snapshot.items[0]];
  await f.respond({revision:7,version:v},200,1);
  const modal=f.doc.querySelector('.fqc-readonly-item-modal');assert(modal);assert.match(modal.textContent,/Active check 0/);assert(!modal.textContent.includes('POISON'));
  f.close();assert(!modal.isConnected);
  f.open();f.expand('iqc');await tick();await f.respond(currentDTO(),200,2);
  f.main.querySelector('[data-view-exact="iqc"]').click();await tick();await f.respond({revision:8,version:v},200,3);
  assert.match(f.main.textContent,/EQUIPMENT_REFERENCE_RESPONSE_INVALID/);assert.equal(f.writes.length,0);
 });
 console.log(JSON.stringify({status:'PASS_EFFECTIVE_REFERENCE_VIEW',groups:results.length}));
})().catch(e=>{console.error(e);process.exitCode=1;});
