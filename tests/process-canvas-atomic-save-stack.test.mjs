// Actual shared transport + authoring + Canvas + durable store + owned ledger.
// Only DOM, storage/WebLocks and HTTP responses are synthetic; no socket/server.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {createRequire} from 'node:module';
import {DatabaseSync} from 'node:sqlite';
import {accessKeys} from '../public/process/access-policy.mjs';
import {canvasDOM} from '../scripts/login-reentry-dom.mjs';
import {createOwnedDraftLedger} from '../public/process/owned-draft-ledger.mjs';
import {createDepartureCoordinator} from '../public/process/navigation-lifecycle.mjs';
const source=name=>fs.readFileSync('public/process/'+name+'.js','utf8'),copy=structuredClone;
const workspace=JSON.stringify(['Synthetic','A']),stage='S';
const content=()=>({workspaces:[{id:workspace,category:'Synthetic',line:'A',stages:{S:[{id:'one',stageCode:'S',name:'Original',number:'1',editorType:'manual',productCodes:[],nextIds:[],x:0,y:0}],T:[{id:'two',stageCode:'T',name:'Other',number:'2',editorType:'manual',productCodes:[],nextIds:[],x:0,y:0}]}}]});
function disk(){const data=new Map(),reads=[],writes=[];let quota=false;return{data,reads,writes,get length(){return data.size;},key:i=>[...data.keys()][i]??null,getItem:k=>{reads.push(k);return data.get(k)??null;},setItem(k,v){if(quota)throw Error('quota');writes.push(k);data.set(k,String(v));},removeItem:k=>data.delete(k),quota:v=>{quota=v;}};}
function locks(){const held=new Set();let deny=false;return{deny:v=>{deny=v;},held,async request(name,_options,fn){await Promise.resolve();if(deny||held.has(name))return fn(null);held.add(name);try{return await fn({name});}finally{held.delete(name);}}};}
async function fixture({remote,manager=locks(),storage=disk(),session=disk(),privateCloneFailure=false,admitCanvas=()=>true}={}){
 const code=source;
 let enabled=false,epoch=1,delivery=1,selectedStage='S',timer=0;const timers=new Map(),events=new Map(),clients=[],metrics={json:0,paint:0};
 const localGet=storage.getItem;storage.getItem=k=>k==='processAuthoringControl'?(enabled?'enabled':null):localGet(k);
 const state={view:'editor',category:'Synthetic',editorLine:'A',approvalTab:'process',editorByCategory:{}};
 const box={console,structuredClone(value){if(privateCloneFailure&&new Error().stack.includes('canvasObserveResponse')){privateCloneFailure=false;throw Error('optional private shadow clone unavailable');}return copy(value);},performance,crypto:webcrypto,AbortController,URL,URLSearchParams,location:{origin:'https://fixture.invalid',pathname:'/process/'},localStorage:storage,sessionStorage:session,navigator:manager?{locks:manager}:{},state,
  JSON:{...JSON,parse:JSON.parse,stringify(...args){metrics.json++;return JSON.stringify(...args);}},setInterval(){},setTimeout(fn,ms){timers.set(++timer,{fn,ms});return timer;},clearTimeout:id=>timers.delete(id),queueMicrotask,
  addEventListener(name,fn){if(!events.has(name))events.set(name,new Set());events.get(name).add(fn);},removeEventListener(name,fn){events.get(name)?.delete(fn);},
  document:{documentElement:{lang:'zh'},visibilityState:'visible',body:{style:{}},activeElement:{matches:()=>false},querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){},createElement:()=>({dataset:{}})},
  ProcessSync:{identity:{id:'actor-a'},requiresReload:false,identityGeneration:()=>epoch,captureDelivery:()=>delivery,isCurrentDelivery:value=>value===delivery,platformHeaders:()=>({})},
  ProcessEditorV2:{currentCanvas:()=>({workspace,stage:selectedStage}),interacting:()=>false,departure:{inspect:()=>({hasDialog:false,state:'clean',canApply:true})},refreshRecovery(){},updateControls(){},confirm:async()=>true},
  ProcessOwnedDraft:{createOwnedDraftLedger:options=>createOwnedDraftLedger({...options,recoveryStorage:session})},VersionDraftUI:{updateSaved(){}},createMasterSharedBridge:()=>({diff:()=>({patches:[],guards:[]})}),bindView(){},renderInspector(){},render(){metrics.paint++;},toast(){},editorKey:()=>state.category+':'+state.editorLine,
  fetch:(...args)=>remote.fetch(...args)
 };box.window=box;vm.createContext(box);vm.runInContext(code('shared-draft-client'),box);const realCreate=box.createSharedDraftClient;box.createSharedDraftClient=options=>{if(options.externalDurableCanvas){const assertDispatch=options.externalDurableCanvas.assertDispatch;options={...options,externalDurableCanvas:{...options.externalDurableCanvas,assertDispatch:command=>admitCanvas(command)&&assertDispatch(command)}};}const c=realCreate(options);if(!clients.includes(c))clients.push(c);return c;};
 for(const name of ['canvas-recovery-store','canvas-local','process-authoring-v3'])vm.runInContext(code(name),box,{filename:name+'.js'});
 enabled=true;await box.ProcessAuthoringV3.load();box.ProcessCanvasLocal.accept(box.ProcessAuthoringV3.flow());await box.ProcessCanvasLocal.recoveryReady();
 return{box,api:box.ProcessAuthoringV3,local:box.ProcessCanvasLocal,remote,storage,session,manager,clients,metrics,state,timers,epoch:()=>epoch++,delivery:()=>delivery++,stage:s=>{selectedStage=s;},edit:value=>box.ProcessCanvasLocal.edit(workspace,stage,[{id:'one',f:'name',value}]),async tick(ms){const chosen=[...timers].filter(([,t])=>t.ms===ms);for(const [id,t]of chosen){timers.delete(id);t.fn();}for(let i=0;i<20;i++)await Promise.resolve();},emit(name,event={}){for(const fn of events.get(name)||[])fn(event);}};
}
const clear=f=>{f.remote.calls.length=0;},rows=f=>f.local.project(workspace,stage,f.api.flow().working.workspaces[0].stages.S);
const routeHarness=createRequire(import.meta.url)('../scripts/ipqc-ab-import-harness.cjs');
async function routeServer(storage,compact,{activeSaved=false,initialModel=content(),processMaster={}}={}){
 const db=new DatabaseSync(':memory:'),objects=new Map(),calls=[];let interleave=false,writes=0,loss=null,beforeNextSave=null;
 db.exec('CREATE TABLE shared_state(id INTEGER PRIMARY KEY,revision INTEGER NOT NULL,"values" TEXT NOT NULL,updated_at TEXT NOT NULL)');
 const env={PROCESS_SESSION_SECRET:webcrypto.randomUUID(),DB:{prepare(sql){let args=[];return{bind(...v){args=v;return this;},async first(){return db.prepare(sql).get(...args)||null;},async all(){return{results:db.prepare(sql).all(...args)};},async run(){if(interleave&&sql.startsWith('UPDATE shared_state SET revision=')){interleave=false;db.prepare('UPDATE shared_state SET revision=revision+1 WHERE id=1').run();}const changes=Number(db.prepare(sql).run(...args).changes);writes+=changes;return{meta:{changes}};}};}},STATE_ARCHIVE:{async put(k,v){objects.set(k,v);},async head(k){return objects.has(k)?{}:null;},async get(k){return objects.has(k)?{text:async()=>String(objects.get(k))}:null;}}};
 const h=routeHarness(env),core=h('lib/process-state.ts'),users=['actor-a','actor-b'].map(id=>({id,name:id,role:'admin',enabled:true,authMode:'platform',accessOverrides:Object.fromEntries(accessKeys.map(k=>[k,true]))}));
 const model=copy(initialModel),flow=h('lib/shared-draft.ts').createSharedDraft('process:platform',model,null,webcrypto.randomUUID());
 if(activeSaved){flow.active.id='effective';flow.baseId='effective';flow.saved={id:'saved-base',revision:0,content:copy(model),actor:{id:'actor-a',name:'actor-a'},at:'2026-10-31T00:00:00Z',contributors:{}};flow.saves=[flow.saved];}
 const values={platformUsers:JSON.stringify(users),masterDataControl:JSON.stringify({active:{AB:{products:[],lines:[{code:'A',stages:[{code:'S'},{code:'T'}]},{code:'B',stages:[{code:'U'}]}]},C:{products:[],lines:[]},PROCESS:processMaster},versions:[]}),bomOverrides:JSON.stringify({replaceAll:true,data:{}}),processAuthoringControl:JSON.stringify({activeVersionId:activeSaved?'effective':null,versions:[...(activeSaved?[{id:'effective',number:0,status:'approved',snapshot:copy(model),history:[],revision:0}]:[]),{id:'draft',number:1,status:'draft',snapshot:model,history:[],revision:0}],workflow:flow})};
 const raw=storage==='records-v1'?await h('lib/state-records.ts').encodeRecordValues(env.STATE_ARCHIVE,values):JSON.stringify(values);db.prepare('INSERT INTO shared_state VALUES(1,1,?,?)').run(raw,'synthetic');
 const api=h('app/api/process-authoring/workflow/route.ts'),origin='https://fixture.invalid',tokens=Object.fromEntries(await Promise.all(users.map(async u=>[u.id,await core.demoSession(new Request(origin),u.id,false)])));let who='actor-a';
 return{calls,async persisted(){const state=await core.readState();return JSON.parse(state.values.processAuthoringControl);},beforeSave:hook=>{beforeNextSave=hook;},loss:value=>{loss=value;},async revoke(){const state=await core.readState();const users=JSON.parse(state.values.platformUsers);users[0].accessOverrides['editor.edit']=false;const next={...state.values,platformUsers:JSON.stringify(users)},encoded=await core.encodeValues(next,state);db.prepare('UPDATE shared_state SET revision=revision+1,"values"=? WHERE id=1').run(encoded);},close:()=>db.close(),interleave:()=>{interleave=true;},writes:()=>writes,who:id=>{who=id;},stored:()=>db.prepare('SELECT revision,"values" FROM shared_state WHERE id=1').get(),async fetch(relative,options={}){const url=new URL(relative,origin);if(!compact)url.searchParams.delete('compact');const method=options.method||'GET',request=new Request(url,{method,headers:{Origin:origin,'Content-Type':'application/json',Cookie:'process_demo='+(tokens[who]||'invalid')},...(options.body?{body:options.body}:{})});if(method==='POST'&&loss==='before'){calls.push({method,kind:'post',requestBytes:Buffer.byteLength(options.body||''),responseBytes:0});throw Error('lost before dispatch to route');}if(method==='POST'&&beforeNextSave&&JSON.parse(options.body).command?.moduleAction==='save-canvas-v1'){const hook=beforeNextSave;beforeNextSave=null;await hook();}const result=loss==='after'&&url.searchParams.has('operationId')?Response.json({error:'OPERATION_NOT_FOUND'},{status:404}):await api[method](request),raw=await result.clone().text();calls.push({method,kind:method==='POST'?'post':url.searchParams.has('operationId')?'receipt':'state',url:String(url),requestBytes:Buffer.byteLength(options.body||''),responseBytes:Buffer.byteLength(raw),wire:JSON.parse(raw),status:result.status});if(method==='POST'&&loss==='after')throw Error('lost after committed route');return result;}};
}

for(const storage of ['inline','records-v1'])for(const compact of [false,true])void test(`production controller + transport + route ${storage}/${compact}: one Save, one CAS, fixed saved snapshot`,async()=>{
 const remote=await routeServer(storage,compact,{activeSaved:true});try{
  const f=await fixture({remote}),original=copy(f.api.flow().active.content);clear(f);f.edit('Atomic');remote.interleave();assert.equal(await f.api.save(),true);
  assert.equal(remote.writes(),1);assert.equal(remote.calls.filter(c=>c.method==='POST').length,1);assert.equal(f.api.flow().saved.content.workspaces[0].stages.S[0].name,'Atomic');assert.deepEqual(copy(f.api.flow().active.content),original);assert(!f.local.pending());assert(!f.local.dirty());assert.equal(f.api.ownedLedger.inspect().state,'clean');
  clear(f);assert.equal(await f.api.save(),true);assert.equal(remote.calls.filter(c=>c.method==='POST').length,1);assert(!f.local.pending());assert.equal(f.api.ownedLedger.inspect().state,'clean');
 }finally{remote.close();}
});
void test('production Save lost ACK keeps exact receipt pending, then explicitly resolves without new POST',async()=>{
 const remote=await routeServer('records-v1',true,{activeSaved:true});try{const f=await fixture({remote});clear(f);f.edit('Captured');remote.loss('after');assert.notEqual(await f.api.save(),true);assert.equal(remote.writes(),1);assert(f.local.pending());f.edit('Newer');remote.loss(null);clear(f);assert.equal(await f.api.save(),true);assert.equal(remote.calls.filter(c=>c.method==='POST').length,0);assert.equal(f.api.flow().saved.content.workspaces[0].stages.S[0].name,'Captured');assert.equal(rows(f)[0].name,'Newer');assert(f.local.dirty());assert.equal(f.api.ownedLedger.inspect().state,'clean');}finally{remote.close();}
});

for(const storage of ['inline','records-v1'])for(const compact of [false,true])for(const lost of [false,true])void test(`restore prior saved value after legacy Apply ${storage}/${compact}/lost:${lost}: original savedId is legal`,async()=>{
 const remote=await routeServer(storage,compact,{activeSaved:true});try{
  const initial=await fixture({remote}),generation=initial.api.flow().generation,savedId=initial.api.flow().saved.id;
  const path=['workspaces',{id:workspace},'stages',stage,{id:'one'},'x'];
  remote.who('actor-b');const applied=await remote.fetch('/api/process-authoring/workflow?caseMetadata=1',{method:'POST',body:JSON.stringify({command:{action:'apply',generation,clientId:'legacy-peer',sequence:1,operationId:webcrypto.randomUUID(),patches:[{op:'set',path,value:5}],guards:[{path,value:0}]}})});assert.equal(applied.status,200);remote.who('actor-a');
  const f=await fixture({remote});assert.equal(f.api.flow().working.workspaces[0].stages.S[0].x,5);f.local.edit(workspace,stage,[{id:'one',f:'x',value:0}]);clear(f);
  if(lost){remote.loss('after');assert.equal(await f.api.save(),false);assert(f.local.pending());assert(f.box.sharedDraftAccountState().unknown);remote.loss(null);}
  assert.equal(await f.api.save(),true,'legal same-savedId receipt must settle');
  const post=remote.calls.find(c=>c.method==='POST'),receipt=post.wire.receipt;
  assert.equal(receipt.savedId,savedId);assert.equal(receipt.unchanged,false);
  assert.equal(f.api.flow().saved.id,savedId);assert.deepEqual(copy(f.api.flow().saved.content),copy(f.api.flow().working));
  assert.equal(f.api.flow().working.workspaces[0].stages.S[0].x,0);assert(!f.local.pending());assert(!f.local.dirty());assert(!f.box.sharedDraftAccountState().unknown);
  assert.equal(remote.calls.filter(c=>c.method==='POST').length,1,'receipt recovery never resends original Save');
  if(lost)assert(remote.calls.some(c=>c.kind==='receipt'&&c.url.includes(receipt.operationId)));
 }finally{remote.close();}
});

void test('same savedId receipt settles against newer authoritative peer Save without replaying original',async()=>{
 const remote=await routeServer('records-v1',true,{activeSaved:true});try{
  const start=await fixture({remote}),generation=start.api.flow().generation,xPath=['workspaces',{id:workspace},'stages',stage,{id:'one'},'x'];
  await remote.fetch('/api/process-authoring/workflow',{method:'POST',body:JSON.stringify({command:{action:'apply',generation,clientId:'legacy-change',sequence:1,operationId:webcrypto.randomUUID(),patches:[{op:'set',path:xPath,value:5}],guards:[{path:xPath,value:0}]}})});
  const f=await fixture({remote}),read=f.api.readCanvasRecovery,peerId=webcrypto.randomUUID();let inserted=false;
  f.api.readCanvasRecovery=async(...args)=>{if(!inserted&&remote.calls.some(call=>call.method==='POST')){inserted=true;const namePath=[...xPath.slice(0,-1),'name'];remote.who('actor-b');try{const peer=await remote.fetch('/api/process-authoring/workflow',{method:'POST',body:JSON.stringify({command:{action:'apply',moduleAction:'save-canvas-v1',generation,clientId:'peer-newer-save',sequence:1,operationId:peerId,source:'canvas-v2:'+JSON.stringify([workspace,stage]),patches:[{op:'set',path:namePath,value:'Peer newer saved'}],guards:[{path:namePath,value:'Original'}]}})});assert.equal(peer.status,200);}finally{remote.who('actor-a');}}return read(...args);};
  f.local.edit(workspace,stage,[{id:'one',f:'x',value:0}]);clear(f);assert.equal(await f.api.save(),true);assert(inserted);
  const posts=remote.calls.filter(call=>call.method==='POST');assert.equal(posts.length,2,'one original Save and one explicit peer Save');assert.equal(posts[0].wire.receipt.savedId,'saved-base');assert.equal(posts[0].wire.receipt.unchanged,false);assert.equal(posts[1].wire.receipt.operationId,peerId);
  assert(f.api.flow().revision>posts[0].wire.receipt.revision);assert.equal(f.api.flow().saved.content.workspaces[0].stages.S[0].name,'Peer newer saved');assert(!f.local.pending());assert(!f.local.dirty());
 }finally{remote.close();}
});

async function peerName(f,value){
 const path=['workspaces',{id:workspace},'stages',stage,{id:'one'},'name'];f.remote.who('actor-b');
 try{const response=await f.remote.fetch('/api/process-authoring/workflow',{method:'POST',body:JSON.stringify({command:{action:'apply',operationId:webcrypto.randomUUID(),clientId:'peer-choice',sequence:(f.peerSequence=(f.peerSequence||0)+1),generation:f.api.flow().generation,patches:[{op:'set',path,value}],guards:[{path,value:f.peerValue||'Original'}]}})});assert.equal(response.status,200);f.peerValue=value;}finally{f.remote.who('actor-a');}
}
function interceptCanvas(f,hook){
 const wrap=c=>{if(c.choiceWrapped)return c;c.choiceWrapped=true;const send=c.sendPrepared.bind(c);c.sendPrepared=(command,...args)=>hook(send,command,args,c);return c;};
 f.clients.forEach(wrap);const create=f.box.createSharedDraftClient;f.box.createSharedDraftClient=options=>wrap(create(options));
}
for(const choice of ['mine','latest'])for(const disjoint of [false,true])void test(`real route revision rejection ${choice}/disjoint:${disjoint} restores input and permits fresh explicit Save`,async()=>{
 const remote=await routeServer('records-v1',true,{activeSaved:true});try{
  const f=await fixture({remote});f.edit('Mine');if(disjoint)f.local.edit(workspace,stage,[{id:'one',f:'x',value:42}]);await peerName(f,'Peer');let choices=0,command;
  interceptCanvas(f,(send,cmd,args)=>{if(cmd.moduleAction==='save-canvas-v1')command=copy(cmd);return send(cmd,...args);});
  f.box.ProcessEditorV2.resolveSaveConflicts=async()=>{choices++;remote.beforeSave(()=>peerName(f,'New peer'));return choice;};clear(f);
  assert.equal(await f.api.save(),false);assert.equal(f.api.navigation.error()?.message,'DRAFT_REVISION_CHANGED_RECONFIRM');assert(!f.local.pending());assert.equal(rows(f)[0].name,'Mine');assert.equal(rows(f)[0].x,disjoint?42:0);assert(f.local.dirty());
  if(choice==='latest'&&!disjoint)assert.deepEqual(command.patches,[],'empty Save rejection must also clear exact failed flight');
  assert.equal(remote.calls.filter(c=>c.kind==='receipt').length,0);assert.equal(remote.calls.filter(c=>c.status===409).length,1);
  f.box.ProcessEditorV2.resolveSaveConflicts=async()=>{choices++;return choice;};assert.equal(await f.api.save(),true);assert.equal(choices,2);assert(!f.local.pending());assert(!f.box.sharedDraftAccountState().unknown);assert.equal(f.api.flow().saved.content.workspaces[0].stages.S[0].name,choice==='mine'?'Mine':'New peer');
 }finally{remote.close();}
});
for(const late of ['same-field','other-field','form'])void test(`real route rejected choice preserves later ${late} input`,async()=>{
 const remote=await routeServer('inline',true,{activeSaved:true});try{
  const f=await fixture({remote});f.edit('Mine');await peerName(f,'Peer');f.box.ProcessEditorV2.resolveSaveConflicts=async()=>{remote.beforeSave(()=>peerName(f,'New peer'));return 'latest';};
  interceptCanvas(f,async(send,command,args)=>{try{return await send(command,...args);}catch(error){
   if(late==='same-field')f.edit('Later');if(late==='other-field')f.local.edit(workspace,stage,[{id:'one',f:'x',value:77}]);
   if(late==='form'){const original=copy(rows(f)[0]);f.local.storeForm(workspace,stage,'one',{original,draft:{...original,name:'Open form'},isNew:false});}throw error;
  }});
  assert.equal(await f.api.save(),false);assert(!f.local.pending());assert.equal(rows(f)[0].name,late==='same-field'?'Later':'Mine');assert.equal(rows(f)[0].x,late==='other-field'?77:0);
  if(late==='form'){assert.equal(f.local.form(workspace,stage,'one').draft.name,'Open form');assert(![...f.storage.data.values()].some(raw=>raw.includes('Open form')));}
 }finally{remote.close();}
});
void test('real route rejection quota failure retains original receipt, then finalizes without POST or GET',async()=>{
 const remote=await routeServer('records-v1',true,{activeSaved:true});try{
  const f=await fixture({remote});f.edit('Mine');await peerName(f,'Peer');f.box.ProcessEditorV2.resolveSaveConflicts=async()=>{remote.beforeSave(()=>peerName(f,'New peer'));return 'latest';};let operation;
  interceptCanvas(f,async(send,command,args)=>{operation=command.operationId;try{return await send(command,...args);}catch(error){f.storage.quota(true);throw error;}});
  assert.equal(await f.api.save(),false);assert(f.local.pending());assert.equal(rows(f)[0].name,'Mine');const marker=[...f.storage.data.values()].map(v=>{try{return JSON.parse(v);}catch{return null;}}).find(v=>v?.kind==='unknown');assert.equal(marker.reference.operationId,operation);
  f.storage.quota(false);clear(f);const result=await f.local.beforeSave();assert.equal(result.canvasSaved,false);assert(!f.local.pending());assert.equal(rows(f)[0].name,'Mine');assert.equal(remote.calls.length,0,'proven local cancellation never queries 404 or rePOSTs');
 }finally{remote.close();}
});
for(const tamper of ['clone-error','status','message','request-id','details','command','identity','epoch','delivery','pagehide'])void test(`private rejection proof rejects ${tamper}`,async()=>{
 const remote=await routeServer('inline',true,{activeSaved:true});try{
  const f=await fixture({remote});f.edit('Mine');await peerName(f,'Peer');f.box.ProcessEditorV2.resolveSaveConflicts=async()=>{remote.beforeSave(()=>peerName(f,'New peer'));return 'latest';};let originalOperation;
  interceptCanvas(f,async(send,command,args)=>{originalOperation=command.operationId;try{return await send(command,...args);}catch(error){
   if(tamper==='clone-error')throw Object.assign(Error(error.message),{status:error.status,requestId:error.requestId,details:error.details});
   if(tamper==='status')error.status=400;if(tamper==='message')error.message='DEPENDENCY_CHANGED_RECONFIRM';if(tamper==='request-id')error.requestId=webcrypto.randomUUID();if(tamper==='details')error.details={path:['forged']};if(tamper==='command')command.expectedRevision++;
   if(tamper==='identity')f.box.ProcessSync.identity={id:'actor-a'};if(tamper==='epoch')f.epoch();if(tamper==='delivery')f.delivery();if(tamper==='pagehide')f.emit('pagehide');throw error;
  }});
  assert.equal(await f.api.save(),false);assert.equal(remote.calls.filter(c=>c.status===409).length,1);const markers=[...f.storage.data.values()].map(v=>{try{return JSON.parse(v);}catch{return null;}}).filter(v=>v?.kind==='unknown');assert(markers.some(v=>v.reference.operationId===originalOperation),'uncertain/invalid owner keeps original durable receipt');
  if(!['identity','epoch','delivery','pagehide'].includes(tamper)){assert(f.local.pending());const count=remote.calls.filter(c=>c.kind==='post').length;await f.api.save();assert.equal(remote.calls.filter(c=>c.kind==='post').length,count,'invalid proof cannot create replacement command');}
 }finally{remote.close();}
});

for(const lateOther of [false,true])for(const finalValue of ['Original','Peer'])void test(`rejected latest then edit Original → ${finalValue} remains an explicit saved intent, late same-node field:${lateOther}`,async()=>{
 const remote=await routeServer('inline',true,{activeSaved:true});try{
  const f=await fixture({remote});f.edit('Mine');await peerName(f,'Peer');f.box.ProcessEditorV2.resolveSaveConflicts=async()=>{remote.beforeSave(()=>peerName(f,'New peer'));return 'latest';};
  if(lateOther)interceptCanvas(f,async(send,command,args)=>{try{return await send(command,...args);}catch(error){f.local.edit(workspace,stage,[{id:'one',f:'x',value:77}]);throw error;}});
  assert.equal(await f.api.save(),false);assert(!f.local.pending());assert.equal(rows(f)[0].name,'Mine');f.edit('Original');assert.equal(rows(f)[0].name,'Original');assert(f.local.dirty());if(finalValue==='Peer')f.edit('Peer');assert.equal(rows(f)[0].name,finalValue);assert(f.local.dirty());
  f.box.ProcessEditorV2.resolveSaveConflicts=async()=> 'mine';assert.equal(await f.api.save(),true);assert.equal(f.api.flow().saved.content.workspaces[0].stages.S[0].name,finalValue);assert.equal(f.api.flow().saved.content.workspaces[0].stages.S[0].x,lateOther?77:0);
 }finally{remote.close();}
});

void test('rollback preserves the original conflict even when only an unrelated peer field changed after choice',async()=>{
 const remote=await routeServer('inline',true,{activeSaved:true});try{
  const f=await fixture({remote});f.edit('Mine');await peerName(f,'Peer');let choices=0;
  f.box.ProcessEditorV2.resolveSaveConflicts=async()=>{choices++;remote.beforeSave(async()=>{const path=['workspaces',{id:workspace},'stages',stage,{id:'one'},'y'];remote.who('actor-b');try{assert.equal((await remote.fetch('/api/process-authoring/workflow',{method:'POST',body:JSON.stringify({command:{action:'apply',operationId:webcrypto.randomUUID(),clientId:'peer-other',sequence:1,generation:f.api.flow().generation,patches:[{op:'set',path,value:50}],guards:[{path,value:0}]}})})).status,200);}finally{remote.who('actor-a');}});return 'latest';};
  assert.equal(await f.api.save(),false);assert(!f.local.pending());assert.equal(rows(f)[0].name,'Mine');
  f.box.ProcessEditorV2.resolveSaveConflicts=async review=>{choices++;assert(review.changes.some(c=>c.field==='name'&&c.conflict));return 'mine';};assert.equal(await f.api.save(),true);assert.equal(choices,2,'rollback cannot silently rebase original Mine intent onto already reviewed Peer');assert.equal(f.api.flow().saved.content.workspaces[0].stages.S[0].name,'Mine');assert.equal(f.api.flow().saved.content.workspaces[0].stages.S[0].y,50);
 }finally{remote.close();}
});

for(const fault of ['delete-moduleAction','replace-moduleAction','expectedRevision','public-notSent'])void test(`committed POST followed by ${fault} cannot retire original unknown Save`,async()=>{
 const remote=await routeServer('inline',true,{activeSaved:true});try{
  const f=await fixture({remote});f.edit('Captured');let operation;
  interceptCanvas(f,async(send,command,args)=>{operation=command.operationId;await send(command,...args);
   if(fault==='delete-moduleAction')delete command.moduleAction;if(fault==='replace-moduleAction')command.moduleAction='legacy';if(fault==='expectedRevision')command.expectedRevision++;
   if(fault==='public-notSent')throw Object.assign(Error('PUBLIC_NOT_SENT_AFTER_COMMIT'),{notSent:true});
   throw Object.assign(Error('DEPENDENCY_CHANGED_RECONFIRM'),{status:409,requestId:webcrypto.randomUUID(),details:{path:copy(command.guards[0].path)},notSent:true});
  });
  clear(f);assert.equal(await f.api.save(),false);assert(f.local.pending());assert.equal(remote.calls.filter(c=>c.kind==='post').length,1);assert.equal(remote.calls.find(c=>c.kind==='post').status,200);assert.equal(remote.writes(),1);
  const originals=[...f.storage.data.values()].map(raw=>{try{return JSON.parse(raw);}catch{return null;}}).filter(v=>v?.kind==='unknown');assert(originals.some(v=>v.reference.operationId===operation));
  await f.api.save();assert.equal(remote.calls.filter(c=>c.kind==='post').length,1);assert(remote.calls.some(c=>c.kind==='receipt'&&c.url.includes(operation)));assert.equal(f.api.flow().saved.content.workspaces[0].stages.S[0].name,'Captured');
 }finally{remote.close();}
});
for(const empty of [false,true])void test(`real transport pre-fetch durability refusal safely cancels empty:${empty} Save and permits new explicit Save`,async()=>{
 const remote=await routeServer('inline',true,{activeSaved:true});try{
  let admitted=false;const f=await fixture({remote,admitCanvas:()=>admitted});if(!empty)f.edit('Keep');clear(f);
  assert.equal(await f.api.save(),false);assert.equal(f.api.navigation.error()?.message,'CANVAS_DURABLE_DISPATCH_REQUIRED');assert(!f.local.pending());assert.equal(remote.calls.filter(c=>c.kind==='post').length,0);assert.equal(remote.writes(),0);assert.equal(rows(f)[0].name,empty?'Original':'Keep');
  admitted=true;assert.equal(await f.api.save(),true);assert.equal(remote.calls.filter(c=>c.kind==='post').length,1);assert(!f.local.pending());assert.equal(f.api.flow().saved.content.workspaces[0].stages.S[0].name,empty?'Original':'Keep');
 }finally{remote.close();}
});

for(const fault of ['none','moduleAction','operationId','generation','source','all'])void test(`issued Save identity survives ${fault} mutation and still rejects invalid receipt savedId`,async()=>{
 const remote=await routeServer('inline',true,{activeSaved:true});try{
  const f=await fixture({remote});f.edit('Captured');let operation;
  interceptCanvas(f,async(send,command,args)=>{operation=command.operationId;await send(command,...args);
   if(['moduleAction','all'].includes(fault))delete command.moduleAction;if(['operationId','all'].includes(fault))command.operationId=webcrypto.randomUUID();if(['generation','all'].includes(fault))command.generation='forged-generation';if(['source','all'].includes(fault))command.source='canvas-forged';
   throw Object.assign(Error('PUBLIC_NOT_SENT_AFTER_COMMIT'),{notSent:true});
  });
  clear(f);assert.equal(await f.api.save(),false);assert(f.local.pending());const fetch=remote.fetch.bind(remote);let corrupt=true;
  remote.fetch=async(url,options)=>{const response=await fetch(url,options);if(String(url).includes('operationId=')){assert.equal(new URL(url,'https://fixture.invalid').searchParams.get('operationId'),operation);if(corrupt){const body=await response.json();body.receipt.savedId=null;return Response.json(body,{status:response.status});}}return response;};
  assert.equal(await f.api.save(),false);assert.equal(f.api.navigation.error()?.message,'CANVAS_SAVE_ACK_MISMATCH');assert(f.local.pending());assert.equal(remote.calls.filter(c=>c.kind==='post').length,1);
  assert([...f.storage.data.values()].some(raw=>{try{const v=JSON.parse(raw);return v.kind==='unknown'&&v.reference.operationId===operation;}catch{return false;}}));
  corrupt=false;assert.equal(await f.api.save(),true,'valid original Save receipt retains Save success semantics');assert(!f.local.pending());assert.equal(remote.calls.filter(c=>c.kind==='post').length,1);assert.equal(f.api.flow().saved.content.workspaces[0].stages.S[0].name,'Captured');
 }finally{remote.close();}
});

for(const storage of ['inline','records-v1'])for(const scenario of ['media','instructions','missing-stage','missing-workspace','empty'])void test(`first Save ${scenario} preserves original guard wire semantics on ${storage}`,async()=>{
 const model=content();if(scenario==='missing-stage')delete model.workspaces[0].stages.S;if(scenario==='missing-workspace')model.workspaces=[];
 const remote=await routeServer(storage,true,{activeSaved:true,initialModel:model});try{
  const f=await fixture({remote});let issued;
  interceptCanvas(f,(send,command,args)=>{issued=copy(command);return send(command,...args);});
  if(['media','instructions'].includes(scenario))f.local.edit(workspace,stage,[{id:'one',f:scenario,value:scenario==='media'?'data:image/png;base64,c3ludGhldGlj':'First instruction'}]);
  if(scenario.startsWith('missing-'))f.local.operation(workspace,stage,{id:'one',stageCode:stage,name:'First operation',number:'1',editorType:'manual',productCodes:[],nextIds:[],x:0,y:0});
  clear(f);assert.equal(await f.api.save(),true);assert(!f.local.pending());assert.equal(remote.calls.filter(c=>c.kind==='post').length,1);
  const saved=f.api.flow().saved.content.workspaces.find(w=>w.id===workspace).stages[stage][0];
  if(['media','instructions'].includes(scenario))assert.equal(saved[scenario],scenario==='media'?'data:image/png;base64,c3ludGhldGlj':'First instruction');if(scenario.startsWith('missing-'))assert.equal(saved.name,'First operation');
  if(['media','instructions','missing-stage'].includes(scenario)){const guard=issued.guards.find(g=>scenario==='missing-stage'?g.path.length===4:g.path.at(-1)===scenario);assert(guard);assert(!Object.hasOwn(guard,'value'));assert.equal(JSON.stringify(guard),JSON.stringify({...guard,value:undefined}),'only own undefined omission; identical original wire bytes');}
 }finally{remote.close();}
});
for(const field of ['moduleAction','patches','guards','operationId','generation','source'])void test(`issued Save rejects prepareCanvasPost ${field} mutation before POST`,async()=>{
 const remote=await routeServer('inline',true,{activeSaved:true});try{
  const f=await fixture({remote});f.edit('Keep');const prepare=f.api.prepareCanvasPost;let touched=false;
  f.api.prepareCanvasPost=(pin,client,command)=>{touched=true;if(field==='moduleAction')delete command.moduleAction;else if(['patches','guards'].includes(field))command[field][0].value='Mutated';else command[field]='mutated';return prepare(pin,client,command);};
  assert.equal(await f.api.save(),false);assert(touched);assert.equal(remote.calls.filter(c=>c.kind==='post').length,0);assert.equal(remote.writes(),0);assert.equal(rows(f)[0].name,'Keep');
 }finally{remote.close();}
});

for(const storage of ['inline','records-v1'])for(const operation of ['delete-unlink','multiple-inserts'])void test(`real Save ${operation} uses distinct producer paths with unchanged semantics on ${storage}`,async()=>{
 const model=content();if(operation==='delete-unlink'){model.workspaces[0].stages.S.push({...model.workspaces[0].stages.S[0],id:'incoming',name:'Incoming',nextIds:['one']});}
 const remote=await routeServer(storage,true,{activeSaved:true,initialModel:model});try{
  const f=await fixture({remote});let command;interceptCanvas(f,(send,value,args)=>{command=value;return send(value,...args);});
  if(operation==='delete-unlink')f.local.remove(workspace,stage,'one');else for(const id of ['new-1','new-2'])f.local.operation(workspace,stage,{id,stageCode:stage,name:id,number:id,editorType:'manual',productCodes:[],nextIds:[],x:0,y:0});
  assert.equal(await f.api.save(),true);assert(!f.local.pending());assert.equal(remote.calls.filter(c=>c.kind==='post').length,1);
  const saved=f.api.flow().saved.content.workspaces[0].stages.S;if(operation==='delete-unlink'){assert(!saved.some(row=>row.id==='one'));assert.deepEqual(copy(saved.find(row=>row.id==='incoming').nextIds),[]);}else for(const id of ['new-1','new-2'])assert(saved.some(row=>row.id===id));
  const paths=[...command.patches,...command.guards].map(item=>item.path);assert.equal(new Set(paths).size,paths.length,'producer owns a separate path array for each patch/guard');
 }finally{remote.close();}
});

for(const decision of ['mine','latest','cancel'])for(const storage of ['inline','records-v1'])void test(`current-canvas Save DOM choice ${decision}/${storage} preserves peer content and other local workspaces/stages`,async()=>{
 const model=content(),other=JSON.stringify(['Other','B']);model.workspaces.push({id:other,category:'Other',line:'B',stages:{U:[{id:'third',stageCode:'U',name:'Third',editorType:'manual',productCodes:[],nextIds:[],x:0,y:0}]}});
 const remote=await routeServer(storage,true,{activeSaved:true,initialModel:model});try{
  const f=await fixture({remote}),dom=canvasDOM();Object.assign(f.box.document,{createElement:dom.document.createElement,body:dom.document.body});
  const editor=source('process-editor'),start=editor.indexOf(' function resolveSaveConflicts(review)'),end=editor.indexOf(' function ask(',start);f.box.t=(zh,_vi)=>zh;vm.runInContext(editor.slice(start,end)+'\nProcessEditorV2.resolveSaveConflicts=resolveSaveConflicts;',f.box);
  f.edit('Mine one');f.local.edit(workspace,stage,[{id:'one',f:'x',value:71}]);f.local.edit(workspace,'T',[{id:'two',f:'name',value:'Mine two'}]);f.local.edit(other,'U',[{id:'third',f:'name',value:'Mine third'}]);
  const path=(w,s,id,key)=>['workspaces',{id:w},'stages',s,{id},key],paths=[path(workspace,stage,'one','name'),path(other,'U','third','name'),path(workspace,'T','two','y')];
  remote.who('actor-b');const peer=await remote.fetch('/api/process-authoring/workflow',{method:'POST',body:JSON.stringify({command:{action:'apply',generation:f.api.flow().generation,clientId:'peer-global',sequence:1,operationId:webcrypto.randomUUID(),patches:paths.map((path,i)=>({op:'set',path,value:['Peer one','Peer third',92][i]})),guards:paths.map((path,i)=>({path,value:['Original','Third',0][i]}))}})});assert.equal(peer.status,200,await peer.clone().text());remote.who('actor-a');clear(f);
  const saving=f.api.save();for(let i=0;i<100&&!dom.document.querySelector('dialog');i++)await new Promise(resolve=>setTimeout(resolve,2));const dialog=dom.document.querySelector('dialog');assert(dialog);assert.equal(dialog.querySelectorAll('section').length,1);assert.equal(remote.calls.filter(c=>c.kind==='post').length,0);const button=dialog.querySelectorAll('button').find(b=>b.dataset.conflictChoice===decision);assert(button);button.click();
  const ok=await saving;if(decision==='cancel'){assert.equal(ok,false);assert.equal(remote.calls.filter(c=>c.kind==='post').length,0);assert.equal(f.local.counts().fields,4);return;}
  assert.equal(ok,true);assert.equal(remote.calls.filter(c=>c.kind==='post').length,1);assert.equal(remote.writes(),2,'one peer Apply, one atomic current-canvas Save');
  const s=f.api.flow().saved.content;assert.equal(s.workspaces[0].stages.S[0].name,decision==='mine'?'Mine one':'Peer one');assert.equal(s.workspaces[0].stages.S[0].x,71);assert.equal(s.workspaces[0].stages.T[0].name,'Other');assert.equal(s.workspaces[0].stages.T[0].y,92);assert.equal(s.workspaces[1].stages.U[0].name,'Peer third');assert.equal(f.local.project(workspace,'T')[0].name,'Mine two');assert.equal(f.local.project(other,'U')[0].name,'Mine third');assert.equal(f.local.counts().fields,2);assert(f.local.dirty());assert.deepEqual(copy(f.api.flow().active.content),model);
 }finally{remote.close();}
});
void test('current-canvas Save unknown retains original receipt and other-stage input without resending',async()=>{
 const remote=await routeServer('records-v1',true,{activeSaved:true});try{const f=await fixture({remote});f.edit('Captured S');f.local.edit(workspace,'T',[{id:'two',f:'name',value:'Captured T'}]);remote.loss('after');assert.equal(await f.api.save(),false);assert(f.local.pending());remote.loss(null);clear(f);assert.equal(await f.api.save(),true,JSON.stringify(remote.calls));assert.equal(remote.calls.filter(c=>c.kind==='post').length,0);assert.equal(f.api.flow().saved.content.workspaces[0].stages.T[0].name,'Other');assert.equal(f.local.project(workspace,'T')[0].name,'Captured T');assert.equal(f.local.counts().fields,1);assert(!f.local.pending());}finally{remote.close();}
});
for(const choice of ['mine','latest'])void test(`current-canvas Save re-compares after remote change during ${choice} choice before its only POST`,async()=>{
 const remote=await routeServer('records-v1',true,{activeSaved:true});try{
  const f=await fixture({remote}),dom=canvasDOM();Object.assign(f.box.document,{createElement:dom.document.createElement,body:dom.document.body});
  const editor=source('process-editor'),start=editor.indexOf(' function resolveSaveConflicts(review)'),end=editor.indexOf(' function ask(',start);f.box.t=(zh,_vi)=>zh;vm.runInContext(editor.slice(start,end)+'\nProcessEditorV2.resolveSaveConflicts=resolveSaveConflicts;',f.box);
  const peer=async(value)=>{remote.who('actor-b');try{const result=await remote.fetch('/api/process-authoring/workflow',{method:'POST',body:JSON.stringify({command:{action:'apply',generation:f.api.flow().generation,clientId:'peer-global-recheck',sequence:value==='Peer 1'?1:2,operationId:webcrypto.randomUUID(),patches:[{op:'set',path:['workspaces',{id:workspace},'stages',stage,{id:'one'},'name'],value}],guards:[{path:['workspaces',{id:workspace},'stages',stage,{id:'one'},'name'],value:value==='Peer 1'?'Original':'Peer 1'}]}})});assert.equal(result.status,200,await result.clone().text());}finally{remote.who('actor-a');}};
  const dialog=async()=>{for(let i=0;i<100&&!dom.document.querySelector('dialog');i++)await new Promise(resolve=>setTimeout(resolve,2));const d=dom.document.querySelector('dialog');assert(d);return d;};
  f.edit('Local original');f.local.edit(workspace,'T',[{id:'two',f:'x',value:71}]);await peer('Peer 1');clear(f);const saving=f.api.save();let d=await dialog();await peer('Peer 2');d.querySelectorAll('button').find(b=>b.dataset.conflictChoice===choice).click();d=await dialog();assert.match(d.textContent,/Peer 2/);assert.equal(remote.calls.filter(c=>c.kind==='post').length,1,'only explicit peer write; Save has not dispatched');d.querySelectorAll('button').find(b=>b.dataset.conflictChoice===choice).click();assert.equal(await saving,true);assert.equal(remote.calls.filter(c=>c.kind==='post').length,2,'one peer write and one final Save POST');assert.equal(f.api.flow().saved.content.workspaces[0].stages.S[0].name,choice==='mine'?'Local original':'Peer 2');assert.equal(f.api.flow().saved.content.workspaces[0].stages.T[0].x,0);assert.equal(f.local.project(workspace,'T')[0].x,71);assert(f.local.dirty());
 }finally{remote.close();}
});
for(const choice of ['mine','latest'])void test(`current-canvas ${choice} deletion-group choice immediately saves without a second confirmation`,async()=>{
 const model=content();model.workspaces[0].stages.S.push({...copy(model.workspaces[0].stages.S[0]),id:'incoming',name:'Incoming',nextIds:[]});const remote=await routeServer('records-v1',true,{activeSaved:true,initialModel:model});try{
  const f=await fixture({remote}),dom=canvasDOM();Object.assign(f.box.document,{createElement:dom.document.createElement,body:dom.document.body});const editor=source('process-editor'),start=editor.indexOf(' function resolveSaveConflicts(review)'),end=editor.indexOf(' function ask(',start);f.box.t=zh=>zh;vm.runInContext(editor.slice(start,end)+'\nProcessEditorV2.resolveSaveConflicts=resolveSaveConflicts;',f.box);f.box.ProcessEditorV2.confirm=async()=>{throw Error('SECOND_CONFIRMATION_FORBIDDEN');};
  f.local.remove(workspace,stage,'one');f.local.edit(workspace,'T',[{id:'two',f:'x',value:71}]);const path=['workspaces',{id:workspace},'stages',stage,{id:'incoming'},'nextIds'];remote.who('actor-b');const peer=await remote.fetch('/api/process-authoring/workflow',{method:'POST',body:JSON.stringify({command:{action:'apply',generation:f.api.flow().generation,clientId:'peer-delete-edge',sequence:1,operationId:webcrypto.randomUUID(),patches:[{op:'set',path,value:['one']}],guards:[{path,value:[]}]}})});assert.equal(peer.status,200);remote.who('actor-a');clear(f);
  const saving=f.api.save();for(let i=0;i<100&&!dom.document.querySelector('dialog');i++)await new Promise(resolve=>setTimeout(resolve,2));const d=dom.document.querySelector('dialog');assert(d);assert.match(d.textContent,/incoming → one/);d.querySelectorAll('button').find(b=>b.dataset.conflictChoice===choice).click();assert.equal(await saving,true);assert.equal(remote.calls.filter(c=>c.kind==='post').length,1);const saved=f.api.flow().saved.content.workspaces[0];assert.equal(saved.stages.S.some(o=>o.id==='one'),choice==='latest');assert.deepEqual(copy(saved.stages.S.find(o=>o.id==='incoming').nextIds),choice==='latest'?['one']:[]);assert.equal(saved.stages.T[0].x,0);assert.equal(f.local.project(workspace,'T')[0].x,71);
 }finally{remote.close();}
});

function selectionNavigation(f){
 const adapter=f.api.navigation.departure;let prompts=0,abandoned=0;
 f.box.ProcessEditorV2.departure={inspect:()=>({state:'clean',hasDialog:false}),freeze:()=>()=>{},discardLocal(){},closeClean(){}};
 const coordinator=createDepartureCoordinator({owner:()=>({identity:f.box.ProcessSync.identity}),isCurrent:o=>o.identity===f.box.ProcessSync.identity,
  inspect:()=>adapter.inspect(),autoAbandon:()=>adapter.autoAbandon,
  async act(action){assert.equal(action,'abandon');abandoned++;return adapter.abandon();},show(){prompts++;}});
 f.box.ProcessDeliveryNavigation={guardAction:spec=>coordinator.request({...spec,run:ticket=>{adapter.closeClean();const value=spec.run();if(ticket)coordinator.committed(ticket);return {status:'ready',value};}})};
 return()=>({prompts,abandoned});
}
void test('actual category retains one draft while stage and line silently abandon unsent scopes without changing saved data',async()=>{
 const model=content(),other=JSON.stringify(['Other','B']);model.workspaces.push({id:other,category:'Other',line:'B',stages:{U:[{...copy(model.workspaces[0].stages.S[0]),id:'third',stageCode:'U',name:'Third'}]}});const remote=await routeServer('records-v1',true,{activeSaved:true,initialModel:model});try{
  const f=await fixture({remote}),stats=selectionNavigation(f),saved=copy((await remote.persisted()).workflow.saved);f.edit('Local S');f.local.edit(workspace,'T',[{id:'two',f:'x',value:81}]);clear(f);
  Object.assign(f.box,{host:f.box,key:()=>f.state.category+':'+f.state.editorLine,visibleStages:()=>['S','T'],remember(){},clearLink(){},render(){},lines:[{code:'A'},{code:'B'}],currentUser:{role:'admin'},data:{products:[{code:'P-A',category:'Synthetic'},{code:'P-A2',category:'Second'},{code:'P-B',category:'Other'}]},routeFor:code=>({line:code==='P-B'?'B':'A'}),syncProductRoute(){},ensureCategoryEditor:()=>{},MutationObserver:class{observe(){}},editorKey:()=>f.state.category+':'+f.state.editorLine});
  vm.runInContext(fs.readFileSync('public/process/editor-line-selection.js','utf8'),f.box);
  assert.equal((await f.box.changeEditorSelection('A','Second')).status,'ready');assert.equal(f.local.counts().fields,2);assert.equal((await f.box.changeEditorSelection('A','Synthetic')).status,'ready');assert.equal(f.local.counts().fields,2);assert.equal(stats().abandoned,0);
  const stageView={stage:'S'};f.box.view=()=>stageView;
  const editor=source('process-editor'),start=editor.indexOf(' function changeStage('),end=editor.indexOf(' function bind()',start);vm.runInContext(editor.slice(start,end)+'\nglobalThis.stageFilter=changeStage;',f.box);
  assert.equal((await f.box.stageFilter('T')).status,'ready');f.stage(stageView.stage);assert.equal(stageView.stage,'T');assert.equal(f.local.counts().fields,0);assert.equal(f.local.project(workspace,'S')[0].name,'Original');assert.equal(f.local.project(workspace,'T')[0].x,0);
  f.local.edit(workspace,'T',[{id:'two',f:'x',value:99}]);assert.equal((await f.box.changeEditorSelection('B','Other')).status,'ready');assert.equal(f.state.editorLine,'B');assert.equal(f.local.counts().fields,0);assert.deepEqual(stats(),{prompts:0,abandoned:2});assert.equal(remote.calls.length,0,'switches issue no GET or POST');assert.deepEqual(copy((await remote.persisted()).workflow.saved),saved);
 }finally{remote.close();}
});
void test('actual line switch retains UNKNOWN receipt bytes and never resends while abandoning newer unsent input',async()=>{
 const remote=await routeServer('inline',true,{activeSaved:true});try{
  const f=await fixture({remote}),stats=selectionNavigation(f);f.edit('Sent');remote.loss('after');assert.equal(await f.api.save(),false);assert(f.local.pending());f.edit('Newer unsent');
  const before=[...f.storage.data].filter(([k])=>k.includes('receipt')||k.includes('canvas')),pending=f.local.pending();clear(f);
  assert.equal((await f.api.changeCanvasView({kind:'line',key:'line:B',label:'B',run(){f.state.editorLine='B';}})).status,'ready');assert.equal(f.state.editorLine,'B');assert.equal(f.local.pending(),pending);assert.equal(remote.calls.length,0);assert.equal(stats().prompts,0);assert.equal(stats().abandoned,1);
  // The original durable command remains available; only later unsent edits drop.
  for(const [key,value]of before.filter(([k])=>k.includes('receipt')))assert.equal(f.storage.data.get(key),value);
  assert.equal(f.local.project(workspace,stage)[0].name,'Sent');
 }finally{remote.close();}
});
for(const kind of ['actor','actor-object','epoch','delivery','generation','reload','pending-write','raw-dialog'])void test(`same-page Canvas ${kind} gate preserves original journal/forms and makes zero requests`,async()=>{
 const remote=await routeServer('inline',true,{activeSaved:true});try{const f=await fixture({remote});f.edit('Retained input');const raw={original:copy(rows(f)[0]),draft:{...copy(rows(f)[0]),name:'Raw form'},isNew:false};f.local.storeForm(workspace,stage,'one',raw);clear(f);let called=0;
  if(kind==='actor')f.box.ProcessSync.identity={id:'other'};if(kind==='actor-object')f.box.ProcessSync.identity={id:'actor-a'};if(kind==='epoch')f.epoch();if(kind==='delivery')f.delivery();if(kind==='generation')f.api.flow().generation='other-generation';if(kind==='reload')f.box.ProcessSync.requiresReload=true;if(kind==='pending-write')f.box.ProcessCanvasLocal.pending=()=>true;if(kind==='raw-dialog')f.box.ProcessEditorV2.departure.inspect=()=>({hasDialog:true,state:'dirty'});
  if(kind==='raw-dialog'){
   const lineSelect={value:'B'},categorySelect={value:'Other'};f.box.document.querySelector=selector=>selector==='#editor-line-select'?lineSelect:selector==='#category-select'?categorySelect:null;
   Object.assign(f.box,{lines:[{code:'A'},{code:'B'}],currentUser:{role:'admin'},data:{products:[{code:'P-A',category:'Synthetic'},{code:'P-B',category:'Other'}]},routeFor:code=>({line:code==='P-A'?'A':'B'}),syncProductRoute(){called++;},ensureCategoryEditor(){called++;},render(){called++;},MutationObserver:class{observe(){}},editorKey:()=>f.state.category+':'+f.state.editorLine});
   vm.runInContext(fs.readFileSync('public/process/editor-line-selection.js','utf8'),f.box);assert.equal((await f.box.changeEditorSelection('B','Other')).status,'blocked');assert.equal(f.state.editorLine,'A');assert.equal(f.state.category,'Synthetic');assert.equal(lineSelect.value,'A');assert.equal(categorySelect.value,'Synthetic');
  }
  assert.equal((await f.api.changeCanvasView({run:()=>called++})).status,'blocked');assert.equal(called,0);assert.equal(remote.calls.length,0);assert.equal(f.local.counts().fields,1);if(!['actor','actor-object','epoch','delivery','generation','reload'].includes(kind))assert.equal(f.local.form(workspace,stage,'one').draft.name,'Raw form');
 }finally{remote.close();}
});
void test('real module departure still abandons all unsent Canvas scopes without Save or restore writes',async()=>{
 const remote=await routeServer('inline',true,{activeSaved:true});try{const f=await fixture({remote});f.edit('Departing');f.local.edit(workspace,'T',[{id:'two',f:'x',value:81}]);f.box.ProcessEditorV2.departure={inspect:()=>({state:'clean',hasDialog:false}),freeze:()=>()=>{},discardLocal(){},closeClean(){}};clear(f);const adapter=f.api.navigation.departure;assert.equal(adapter.autoAbandon,true);assert.equal(adapter.inspect().canAbandon,true);const lease=await adapter.abandon();assert.equal(f.local.counts().fields,0);assert.equal(remote.calls.length,0);adapter.closeClean();lease.release();
 }finally{remote.close();}
});

void test('current-canvas Save keeps other canvases local and does not publish their edits',async()=>{
 const remote=await routeServer('records-v1',true,{activeSaved:true});try{
  const f=await fixture({remote});f.edit('Current saved');f.local.edit(workspace,'T',[{id:'two',f:'name',value:'Other still local'}]);clear(f);let command;interceptCanvas(f,(send,value,args)=>{command=value;return send(value,...args);});
  assert.equal(await f.api.save(),true);assert.equal(remote.calls.filter(c=>c.kind==='post').length,1);assert.equal(command.source,'canvas-v2:'+JSON.stringify([workspace,stage]));assert(command.patches.every(p=>p.path[3]===stage));
  assert.equal(f.api.flow().saved.content.workspaces[0].stages.S[0].name,'Current saved');assert.equal(f.api.flow().saved.content.workspaces[0].stages.T[0].name,'Other');assert.equal(f.local.project(workspace,'T')[0].name,'Other still local');assert.equal(f.local.counts().fields,1);assert(!f.local.pending());
 }finally{remote.close();}
});
void test('current-canvas Save retains another canvas unfinished form without blocking or persisting it',async()=>{
 const remote=await routeServer('inline',true,{activeSaved:true});try{
  const f=await fixture({remote}),original=copy(f.api.flow().working.workspaces[0].stages.T[0]);f.edit('Current saved');f.local.storeForm(workspace,'T','two',{original,draft:{...original,name:'Unfinished other form'},isNew:false});clear(f);
  assert.equal(await f.api.save(),true);assert.equal(remote.calls.filter(c=>c.kind==='post').length,1);assert.equal(f.api.flow().saved.content.workspaces[0].stages.T[0].name,'Other');assert.equal(f.local.form(workspace,'T','two').draft.name,'Unfinished other form');assert(!f.local.pending());
 }finally{remote.close();}
});

for(const storage of ['inline','records-v1'])void test(`Save comparison reads current edit permission before any POST on ${storage}`,async()=>{
 const remote=await routeServer(storage,true,{activeSaved:true});try{
  const f=await fixture({remote}),saved=copy(f.api.flow().saved);f.edit('Keep after permission changed');await remote.revoke();const before=copy(remote.stored());clear(f);
  assert.equal(await f.api.save(),false);assert.deepEqual(remote.calls.map(call=>call.method),['GET']);assert.equal(remote.writes(),0);assert.deepEqual(copy(remote.stored()),before);
  assert.deepEqual(copy(f.api.flow().saved),saved);assert.equal(rows(f)[0].name,'Keep after permission changed');assert.equal(f.local.counts().fields,1);assert(!f.local.pending());
 }finally{remote.close();}
});
for(const storage of ['inline','records-v1'])void test(`Save comparison revision remains mandatory when peer writes before POST on ${storage}`,async()=>{
 const remote=await routeServer(storage,true,{activeSaved:true});try{
  const f=await fixture({remote}),saved=copy(f.api.flow().saved);f.edit('Mine retained');let command,choices=0;
  interceptCanvas(f,(send,value,args)=>{if(value.moduleAction==='save-canvas-v1')command=copy(value);return send(value,...args);});
  f.box.ProcessEditorV2.resolveSaveConflicts=async()=>{choices++;return 'mine';};remote.beforeSave(()=>peerName(f,'Peer committed after compare'));clear(f);
  assert.equal(await f.api.save(),false);assert.equal(choices,0,'initial comparison was conflict-free');assert.equal(command.expectedRevision,0);assert.equal(remote.calls[0].method,'GET');
  assert.equal(remote.calls.filter(call=>call.method==='POST'&&call.status===409).length,1);assert.equal(remote.calls.filter(call=>call.method==='POST'&&call.status===200).length,1,'only independent peer write succeeds');assert.equal(remote.calls.filter(call=>call.kind==='receipt').length,0);assert.equal(remote.writes(),1);
  assert.deepEqual(copy(f.api.flow().saved),saved);assert.equal(rows(f)[0].name,'Mine retained');assert(f.local.dirty());assert(!f.local.pending());
  const response=await remote.fetch('/api/process-authoring/workflow?caseMetadata=1'),body=await response.json();assert.equal(body.control.workflow.working.workspaces[0].stages.S[0].name,'Peer committed after compare');assert.deepEqual(body.control.workflow.saved,saved);
 }finally{remote.close();}
});

// Equipment Save contract: actual current authoring/transport/journal and signed
// production handlers. No live data, sockets, or native browser assumptions.
const equipmentDetail = (id, version) => ({
  id,
  no: id,
  name: id,
  number: id,
  mediaItems: [
    {
      src: '/synthetic/' + id + '-' + version + '.png',
      name: version,
      type: 'image/png',
    },
  ],
  custom: { retained: version },
});
function equipmentContent() {
  const model = content(),
    op = model.workspaces[0].stages.S[0];
  Object.assign(op, {
    editorType: 'machine',
    mode: 'machine',
    machineId: 'eq-one',
    machineIds: ['eq-one'],
    machineDetails: [equipmentDetail('eq-one', 'old')],
  });
  return model;
}
async function peerEquipment(f, value) {
  const before = copy(
      f.remote.flow
        ? f.remote.flow.working.workspaces[0].stages.S[0].machineDetails
        : f.api.flow().working.workspaces[0].stages.S[0].machineDetails,
    ),
    path = [
      'workspaces',
      { id: workspace },
      'stages',
      'S',
      { id: 'one' },
      'machineDetails',
    ];
  f.remote.who('actor-b');
  try {
    const response = await f.remote.fetch(
      '/api/process-authoring/workflow?channel=canvas-v2',
      {
        method: 'POST',
        body: JSON.stringify({
          command: {
            action: 'apply',
            operationId: webcrypto.randomUUID(),
            clientId: 'equipment-peer',
            sequence: 1,
            generation: f.api.flow().generation,
            source: 'canvas-v2:' + JSON.stringify([workspace, stage]),
            patches: [{ op: 'set', path, value }],
            guards: [{ path, value: before }],
          },
        }),
      },
    );
    assert.equal(response.status, 200, await response.clone().text());
  } finally {
    f.remote.who('actor-a');
  }
}
for (const storage of ['inline', 'records-v1'])
  void test(`equipment ${storage}: one global Save fixes detached selected snapshots and preserves saved/effective history`, async () => {
    const remote = await routeServer(storage, true, {
      activeSaved: true,
      initialModel: equipmentContent(),
      processMaster: {
        S: [
          {
            id: 'machine-template',
            presetKey: 'machine-assembly',
            equipment: [
              equipmentDetail('eq-one', 'old'),
              equipmentDetail('eq-two', 'selected-v1'),
            ],
          },
        ],
      },
    });
    try {
      const f = await fixture({ remote }),
        original = copy(rows(f)[0]),
        saved = copy(f.api.flow().saved),
        effective = copy(f.api.flow().active),
        selected = equipmentDetail('eq-two', 'selected-v1'),
        next = {
          ...copy(original),
          machineIds: ['eq-one', 'eq-two'],
          machineDetails: [...copy(original.machineDetails), selected],
        };
      clear(f);
      f.local.operation(workspace, stage, next, original);
      assert.deepEqual(remote.calls, []);
      selected.mediaItems[0].src = '/synthetic/MUST_NOT_RECAPTURE.png';
      assert.equal(
        rows(f)[0].machineDetails[1].mediaItems[0].src,
        '/synthetic/eq-two-selected-v1.png',
      );
      const writes = remote.writes();
      assert.equal(
        await f.api.save(),
        true,
        JSON.stringify({
          error: f.api.navigation.error()?.message,
          replies: remote.calls
            .filter((c) => c.status >= 400)
            .map((c) => c.wire),
        }),
      );
      assert.equal(remote.calls.filter((c) => c.method === 'POST').length, 1);
      assert.equal(remote.writes() - writes, 1);
      assert.deepEqual(
        f.api.flow().saved.content.workspaces[0].stages.S[0].machineDetails,
        [...original.machineDetails, equipmentDetail('eq-two', 'selected-v1')],
      );
      assert.deepEqual(f.api.flow().active, effective);
      const stored = await remote.persisted();
      assert.deepEqual(
        stored.workflow.saves.find((s) => s.id === saved.id)?.content,
        saved.content,
        'verify immutable old Save body in actual storage, not metadata-only GET',
      );
      assert.deepEqual(
        stored.versions.find((v) => v.id === 'effective').snapshot,
        effective.content,
      );
      assert(!f.local.dirty());
    } finally {
      remote.close();
    }
  });
for (const storage of ['inline', 'records-v1'])
  void test(`equipment ${storage}: Save comparison merges peer equipment snapshot with my different field`, async () => {
    const remote = await routeServer(storage, true, {
      activeSaved: true,
      initialModel: equipmentContent(),
    });
    try {
      const f = await fixture({ remote });
      f.edit('My name');
      await peerEquipment(f, [equipmentDetail('eq-one', 'peer-v2')]);
      let choices = 0;
      f.box.ProcessEditorV2.resolveSaveConflicts = async () => {
        choices++;
        throw Error('DISJOINT_MUST_NOT_PROMPT');
      };
      clear(f);
      assert.equal(await f.api.save(), true);
      assert.equal(choices, 0);
      const saved = f.api.flow().saved.content.workspaces[0].stages.S[0];
      assert.equal(saved.name, 'My name');
      assert.deepEqual(saved.machineDetails, [
        equipmentDetail('eq-one', 'peer-v2'),
      ]);
      assert.equal(remote.calls.filter((c) => c.method === 'POST').length, 1);
      assert.equal(
        remote.calls[0].method,
        'GET',
        'fresh comparison precedes the only Save',
      );
    } finally {
      remote.close();
    }
  });
for (const storage of ['inline', 'records-v1'])
  for (const choice of ['mine', 'latest'])
    void test(`equipment ${storage}: conflicting snapshots require ${choice} decision then one Save`, async () => {
      const remote = await routeServer(storage, true, {
        activeSaved: true,
        initialModel: equipmentContent(),
      });
      try {
        const f = await fixture({ remote });
        f.local.edit(workspace, stage, [
          {
            id: 'one',
            f: 'machineDetails',
            value: [equipmentDetail('eq-one', 'mine-v2')],
          },
        ]);
        await peerEquipment(f, [equipmentDetail('eq-one', 'peer-v2')]);
        let choices = 0;
        f.box.ProcessEditorV2.resolveSaveConflicts = async (review) => {
          choices++;
          assert(
            review.changes.some(
              (c) =>
                (c.conflict && c.f === 'machineDetails') ||
                (c.conflict && c.field === 'machineDetails'),
            ),
          );
          return choice;
        };
        clear(f);
        assert.equal(await f.api.save(), true);
        assert.equal(choices, 1);
        assert.equal(remote.calls.filter((c) => c.method === 'POST').length, 1);
        assert.deepEqual(
          f.api.flow().saved.content.workspaces[0].stages.S[0].machineDetails,
          [
            equipmentDetail(
              'eq-one',
              choice === 'mine' ? 'mine-v2' : 'peer-v2',
            ),
          ],
        );
        assert(!f.local.dirty());
      } finally {
        remote.close();
      }
    });
for (const storage of ['inline', 'records-v1'])
  void test(`equipment ${storage}: edit revoked after comparison rejects Save and retains local snapshot`, async () => {
    const remote = await routeServer(storage, true, {
      activeSaved: true,
      initialModel: equipmentContent(),
    });
    try {
      const f = await fixture({ remote }),
        before = copy(f.api.flow().saved),
        details = [equipmentDetail('eq-one', 'retained-local')];
      f.local.edit(workspace, stage, [
        { id: 'one', f: 'machineDetails', value: details },
      ]);
      remote.beforeSave(() => remote.revoke());
      clear(f);
      assert.equal(await f.api.save(), false);
      assert.equal(remote.calls.filter((c) => c.method === 'POST').length, 1);
      assert(remote.calls.some((c) => c.status === 403));
      assert.deepEqual(copy(f.api.flow().saved), before);
      assert.deepEqual(rows(f)[0].machineDetails, details);
      assert(f.local.dirty());
    } finally {
      remote.close();
    }
  });
for (const storage of ['inline', 'records-v1'])
  void test(`equipment ${storage}: unknown atomic Save recovers only original snapshot; newer equipment needs next explicit Save`, async () => {
    const remote = await routeServer(storage, true, {
      activeSaved: true,
      initialModel: equipmentContent(),
    });
    try {
      const f = await fixture({ remote });
      f.local.edit(workspace, stage, [
        {
          id: 'one',
          f: 'machineDetails',
          value: [equipmentDetail('eq-one', 'sent-v1')],
        },
      ]);
      clear(f);
      remote.loss('after');
      assert.equal(await f.api.save(), false);
      assert(f.local.pending());
      assert.equal(remote.calls.filter((c) => c.method === 'POST').length, 1);
      f.local.edit(workspace, stage, [
        {
          id: 'one',
          f: 'machineDetails',
          value: [equipmentDetail('eq-one', 'next-v2')],
        },
      ]);
      const reference = [...f.storage.data.values()]
        .map((v) => {
          try {
            return JSON.parse(v);
          } catch {
            return {};
          }
        })
        .find((v) => v.kind === 'unknown')?.reference;
      assert(reference?.operationId);
      remote.loss(null);
      clear(f);
      assert.equal(await f.api.save(), true);
      assert(remote.calls.every((c) => c.method === 'GET'));
      assert(
        remote.calls.some(
          (c) =>
            c.kind === 'receipt' &&
            c.url.includes(encodeURIComponent(reference.operationId)),
        ),
      );
      assert.deepEqual(
        f.api.flow().saved.content.workspaces[0].stages.S[0].machineDetails,
        [equipmentDetail('eq-one', 'sent-v1')],
      );
      assert.deepEqual(rows(f)[0].machineDetails, [
        equipmentDetail('eq-one', 'next-v2'),
      ]);
      assert(f.local.dirty());
      clear(f);
      assert.equal(await f.api.save(), true);
      assert.equal(remote.calls.filter((c) => c.method === 'POST').length, 1);
      assert.deepEqual(
        f.api.flow().saved.content.workspaces[0].stages.S[0].machineDetails,
        [equipmentDetail('eq-one', 'next-v2')],
      );
      assert(!f.local.dirty());
    } finally {
      remote.close();
    }
  });
for (const storage of ['inline', 'records-v1'])
  void test(`equipment ${storage}: an invented new machine is rejected even with a client snapshot`, async () => {
    const remote = await routeServer(storage, true, {
      activeSaved: true,
      initialModel: equipmentContent(),
    });
    try {
      const f = await fixture({ remote }),
        original = copy(rows(f)[0]),
        saved = copy(f.api.flow().saved),
        next = {
          ...copy(original),
          machineIds: ['eq-one', 'invented-new'],
          machineDetails: [
            ...copy(original.machineDetails),
            equipmentDetail('invented-new', 'client-only'),
          ],
        };
      f.local.operation(workspace, stage, next, original);
      clear(f);
      assert.equal(await f.api.save(), false);
      assert(
        remote.calls.some(
          (c) =>
            c.status === 409 && c.wire.error === 'EDITOR_INTEGRITY_CONFLICT',
        ),
      );
      assert.deepEqual(copy(f.api.flow().saved), saved);
      assert.deepEqual(rows(f)[0].machineDetails, next.machineDetails);
      assert(f.local.dirty());
      assert.equal(remote.calls.filter((c) => c.method === 'POST').length, 1);
    } finally {
      remote.close();
    }
  });
for (const storage of ['inline', 'records-v1'])
  void test(`equipment ${storage}: cancelling snapshot conflict makes no Save and retains both inputs`, async () => {
    const remote = await routeServer(storage, true, {
      activeSaved: true,
      initialModel: equipmentContent(),
    });
    try {
      const f = await fixture({ remote }),
        saved = copy(f.api.flow().saved);
      f.local.edit(workspace, stage, [
        {
          id: 'one',
          f: 'machineDetails',
          value: [equipmentDetail('eq-one', 'mine-retained')],
        },
      ]);
      await peerEquipment(f, [equipmentDetail('eq-one', 'peer-retained')]);
      let choices = 0;
      f.box.ProcessEditorV2.resolveSaveConflicts = async () => {
        choices++;
        return null;
      };
      clear(f);
      const writes = remote.writes();
      assert.equal(await f.api.save(), false);
      assert.equal(choices, 1);
      assert.equal(remote.calls.filter((c) => c.method === 'POST').length, 0);
      assert.equal(remote.writes(), writes);
      assert.deepEqual(rows(f)[0].machineDetails, [
        equipmentDetail('eq-one', 'mine-retained'),
      ]);
      const stored = await remote.persisted();
      assert.deepEqual(stored.workflow.saved.content, saved.content);
      assert.deepEqual(
        stored.workflow.working.workspaces[0].stages.S[0].machineDetails,
        [equipmentDetail('eq-one', 'peer-retained')],
      );
      assert(f.local.dirty());
    } finally {
      remote.close();
    }
  });
for (const storage of ['inline', 'records-v1'])
  void test(`equipment ${storage}: clean local journal compares newer peer revision before one Save`, async () => {
    const remote = await routeServer(storage, true, {
      activeSaved: true,
      initialModel: equipmentContent(),
    });
    try {
      const f = await fixture({ remote });
      assert(!f.local.dirty());
      await peerEquipment(f, [equipmentDetail('eq-one', 'new-peer-revision')]);
      clear(f);
      assert.equal(await f.api.save(), true);
      assert.equal(
        remote.calls[0].method,
        'GET',
        'the comparison avoids saving with a stale revision',
      );
      assert.equal(remote.calls.filter((c) => c.method === 'POST').length, 1);
      assert.deepEqual(
        f.api.flow().saved.content.workspaces[0].stages.S[0].machineDetails,
        [equipmentDetail('eq-one', 'new-peer-revision')],
      );
      assert(!f.local.dirty());
    } finally {
      remote.close();
    }
  });
