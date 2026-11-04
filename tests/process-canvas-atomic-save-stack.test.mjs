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
import {createOwnedDraftLedger} from '../public/process/owned-draft-ledger.mjs';
const source=name=>fs.readFileSync('public/process/'+name+'.js','utf8'),copy=structuredClone;
const workspace=JSON.stringify(['Synthetic','A']),stage='S';
const content=()=>({workspaces:[{id:workspace,category:'Synthetic',line:'A',stages:{S:[{id:'one',stageCode:'S',name:'Original',number:'1',editorType:'manual',productCodes:[],nextIds:[],x:0,y:0}],T:[{id:'two',stageCode:'T',name:'Other',nextIds:[],x:0,y:0}]}}]});
function disk(){const data=new Map(),reads=[],writes=[];let quota=false;return{data,reads,writes,get length(){return data.size;},key:i=>[...data.keys()][i]??null,getItem:k=>{reads.push(k);return data.get(k)??null;},setItem(k,v){if(quota)throw Error('quota');writes.push(k);data.set(k,String(v));},removeItem:k=>data.delete(k),quota:v=>{quota=v;}};}
function locks(){const held=new Set();let deny=false;return{deny:v=>{deny=v;},held,async request(name,_options,fn){await Promise.resolve();if(deny||held.has(name))return fn(null);held.add(name);try{return await fn({name});}finally{held.delete(name);}}};}
async function fixture({remote,manager=locks(),storage=disk(),session=disk(),privateCloneFailure=false}={}){
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
 };box.window=box;vm.createContext(box);vm.runInContext(code('shared-draft-client'),box);const realCreate=box.createSharedDraftClient;box.createSharedDraftClient=options=>{const c=realCreate(options);if(!clients.includes(c))clients.push(c);return c;};
 for(const name of ['canvas-recovery-store','canvas-local','process-authoring-v3'])vm.runInContext(code(name),box,{filename:name+'.js'});
 enabled=true;await box.ProcessAuthoringV3.load();box.ProcessCanvasLocal.accept(box.ProcessAuthoringV3.flow());await box.ProcessCanvasLocal.recoveryReady();
 return{box,api:box.ProcessAuthoringV3,local:box.ProcessCanvasLocal,remote,storage,session,manager,clients,metrics,state,timers,epoch:()=>epoch++,delivery:()=>delivery++,stage:s=>{selectedStage=s;},edit:value=>box.ProcessCanvasLocal.edit(workspace,stage,[{id:'one',f:'name',value}]),async tick(ms){const chosen=[...timers].filter(([,t])=>t.ms===ms);for(const [id,t]of chosen){timers.delete(id);t.fn();}for(let i=0;i<20;i++)await Promise.resolve();},emit(name,event={}){for(const fn of events.get(name)||[])fn(event);}};
}
const clear=f=>{f.remote.calls.length=0;},rows=f=>f.local.project(workspace,stage,f.api.flow().working.workspaces[0].stages.S);
const routeHarness=createRequire(import.meta.url)('../scripts/ipqc-ab-import-harness.cjs');
async function routeServer(storage,compact,{activeSaved=false}={}){
 const db=new DatabaseSync(':memory:'),objects=new Map(),calls=[];let interleave=false,writes=0,loss=null;
 db.exec('CREATE TABLE shared_state(id INTEGER PRIMARY KEY,revision INTEGER NOT NULL,"values" TEXT NOT NULL,updated_at TEXT NOT NULL)');
 const env={PROCESS_SESSION_SECRET:webcrypto.randomUUID(),DB:{prepare(sql){let args=[];return{bind(...v){args=v;return this;},async first(){return db.prepare(sql).get(...args)||null;},async all(){return{results:db.prepare(sql).all(...args)};},async run(){if(interleave&&sql.startsWith('UPDATE shared_state SET revision=')){interleave=false;db.prepare('UPDATE shared_state SET revision=revision+1 WHERE id=1').run();}const changes=Number(db.prepare(sql).run(...args).changes);writes+=changes;return{meta:{changes}};}};}},STATE_ARCHIVE:{async put(k,v){objects.set(k,v);},async head(k){return objects.has(k)?{}:null;},async get(k){return objects.has(k)?{text:async()=>String(objects.get(k))}:null;}}};
 const h=routeHarness(env),core=h('lib/process-state.ts'),users=['actor-a','actor-b'].map(id=>({id,name:id,role:'admin',enabled:true,authMode:'platform',accessOverrides:Object.fromEntries(accessKeys.map(k=>[k,true]))}));
 const model=content(),flow=h('lib/shared-draft.ts').createSharedDraft('process:platform',model,null,webcrypto.randomUUID());
 if(activeSaved){flow.active.id='effective';flow.baseId='effective';flow.saved={id:'saved-base',revision:0,content:copy(model),actor:{id:'actor-a',name:'actor-a'},at:'2026-10-31T00:00:00Z',contributors:{}};flow.saves=[flow.saved];}
 const values={platformUsers:JSON.stringify(users),masterDataControl:JSON.stringify({active:{AB:{products:[],lines:[{code:'A',stages:[{code:'S'},{code:'T'}]}]},C:{products:[],lines:[]},PROCESS:{}},versions:[]}),bomOverrides:JSON.stringify({replaceAll:true,data:{}}),processAuthoringControl:JSON.stringify({activeVersionId:activeSaved?'effective':null,versions:[...(activeSaved?[{id:'effective',number:0,status:'approved',snapshot:copy(model),history:[],revision:0}]:[]),{id:'draft',number:1,status:'draft',snapshot:model,history:[],revision:0}],workflow:flow})};
 const raw=storage==='records-v1'?await h('lib/state-records.ts').encodeRecordValues(env.STATE_ARCHIVE,values):JSON.stringify(values);db.prepare('INSERT INTO shared_state VALUES(1,1,?,?)').run(raw,'synthetic');
 const api=h('app/api/process-authoring/workflow/route.ts'),origin='https://fixture.invalid',tokens=Object.fromEntries(await Promise.all(users.map(async u=>[u.id,await core.demoSession(new Request(origin),u.id,false)])));let who='actor-a';
 return{calls,loss:value=>{loss=value;},async revoke(){const state=await core.readState();const users=JSON.parse(state.values.platformUsers);users[0].accessOverrides['editor.edit']=false;const next={...state.values,platformUsers:JSON.stringify(users)},encoded=await core.encodeValues(next,state);db.prepare('UPDATE shared_state SET revision=revision+1,"values"=? WHERE id=1').run(encoded);},close:()=>db.close(),interleave:()=>{interleave=true;},writes:()=>writes,who:id=>{who=id;},stored:()=>db.prepare('SELECT revision,"values" FROM shared_state WHERE id=1').get(),async fetch(relative,options={}){const url=new URL(relative,origin);if(!compact)url.searchParams.delete('compact');const method=options.method||'GET',request=new Request(url,{method,headers:{Origin:origin,'Content-Type':'application/json',Cookie:'process_demo='+(tokens[who]||'invalid')},...(options.body?{body:options.body}:{})});if(method==='POST'&&loss==='before'){calls.push({method,kind:'post',requestBytes:Buffer.byteLength(options.body||''),responseBytes:0});throw Error('lost before dispatch to route');}const result=loss==='after'&&url.searchParams.has('operationId')?Response.json({error:'OPERATION_NOT_FOUND'},{status:404}):await api[method](request),raw=await result.clone().text();calls.push({method,kind:method==='POST'?'post':url.searchParams.has('operationId')?'receipt':'state',url:String(url),requestBytes:Buffer.byteLength(options.body||''),responseBytes:Buffer.byteLength(raw),wire:JSON.parse(raw),status:result.status});if(method==='POST'&&loss==='after')throw Error('lost after committed route');return result;}};
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
