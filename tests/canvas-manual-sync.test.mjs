import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {webcrypto} from 'node:crypto';
const require=createRequire(import.meta.url),harness=require('../scripts/ipqc-ab-import-harness.cjs');
const source=fs.readFileSync('public/process/canvas-local.js','utf8');
const global={structuredClone};vm.runInNewContext(source,global);const Journal=global.CanvasJournal;
const clone=structuredClone,w=JSON.stringify(['Synthetic','A']);
const content=()=>({workspaces:[{id:w,category:'Synthetic',line:'A',stages:{S:[{id:'a',stageCode:'S',name:'A',editorType:'manual',productCodes:[],x:0,y:0,nextIds:['b']},{id:'b',stageCode:'S',name:'B',editorType:'manual',productCodes:[],x:10,y:0,nextIds:[]}],T:[{id:'c',stageCode:'T',name:'C',editorType:'manual',productCodes:[],x:0,y:0,nextIds:[]}]}}]});
const op=(c,id,s='S')=>c.workspaces[0].stages[s].find(o=>o.id===id);
const object=x=>JSON.parse(JSON.stringify(x));
const load=harness(),{createSharedDraft}=load('lib/shared-draft.ts'),{processAuthoringAdapter,assertCanvasBatch}=load('lib/process-authoring-workflow.ts'),{assertEditorIntegrity}=load('lib/process-editor-integrity.ts');
let serial=0;const context={actor:{id:'a',name:'A',admin:true},at:'2026-10-30',id:()=>webcrypto.randomUUID(),allowed:()=>true,activeId:null,validate:()=>[],semantic:x=>x,structure:(next,previous)=>assertEditorIntegrity(next.workspaces,previous.workspaces,{},()=>[])};
const command=b=>({action:'apply',operationId:webcrypto.randomUUID(),clientId:'canvas-test-client',sequence:++serial,generation:'generation-test',source:'canvas-v2:'+JSON.stringify([b.workspace,b.stage]),patches:b.patches,guards:b.guards});
function server(c=content()){const workflow=createSharedDraft('process:platform',c,null,'generation-test');return{workflow,versions:[],activeVersionId:null};}
function apply(c,b){return processAuthoringAdapter(true).apply(c,command(b),context);}

void test('node form, insertion, connection removal and undo are local; only current canvas freezes',()=>{
 const shared=content(),j=new Journal(shared),before=clone(shared),a=j.project(w,'S')[0];j.operation(w,'S',{...a,name:'Local'},a);j.operation(w,'S',{id:'new',stageCode:'S',name:'New',productCodes:[],nextIds:[]},null);j.edit(w,'T',[{id:'c',f:'x',value:33}]);
 assert.deepEqual(shared,before);assert.equal(j.project(w,'S').length,3);assert.equal(j.project(w,'S')[0].name,'Local');
 const b=j.freeze(w,'S');assert(b.patches.every(p=>p.path[3]==='S'));assert.equal(b.patches.length,2);assert(b.guards.some(g=>g.path.length===5));assert.throws(()=>j.freeze(),/SCOPE_REQUIRED/);
 j.remove(w,'S','b');assert.deepEqual(object(j.project(w,'S')[0].nextIds),[]);j.travel(w,'S');assert(j.project(w,'S').some(o=>o.id==='b'));assert.deepEqual(object(j.project(w,'S')[0].nextIds),['b']);
});

void test('field guards allow unrelated fields; entire-node form guard still rejects changed dependencies',()=>{
 const c=content(),j=new Journal(c);j.edit(w,'S',[{id:'a',f:'x',value:50}]);const fresh=clone(c);op(fresh,'a').name='B edit';j.content=fresh;assert.equal(j.conflicts(w,'S').length,0);const b=j.freeze(w,'S'),s=server(fresh);assert.equal(op(apply(s,b).state.working,'a').name,'B edit');
 const j2=new Journal(c),a=j2.project(w,'S')[0];j2.operation(w,'S',{...a,name:'Form'},a);j2.content=fresh;assert.throws(()=>j2.freeze(w,'S'),/CANVAS_CONFLICT/);
});

void test('two-actor conflict and dangling removal reject the entire batch without business changes',()=>{
 const c=content(),j=new Journal(c);j.edit(w,'S',[{id:'a',f:'x',value:50},{id:'b',f:'name',value:'Local B'}]);const b=j.freeze(w,'S'),fresh=clone(c);op(fresh,'b').name='Other actor';const s=server(fresh),before=clone(s);assert.throws(()=>apply(s,b),/DEPENDENCY_CHANGED/);assert.deepEqual(object(s),object(before));
 const removal=new Journal(c);removal.remove(w,'S','b');const whole=removal.freeze(w,'S');assert.equal(whole.patches.length,2);const bad={...whole,patches:whole.patches.filter(p=>p.op==='remove')};assert.throws(()=>apply(server(),bad),/EDITOR_INTEGRITY/);const result=apply(server(),whole);assert(!op(result.state.working,'b'));assert.deepEqual(object(op(result.state.working,'a').nextIds),[]);
});

void test('server refuses cross-canvas, whole-canvas overwrite and metadata edits; creation stays scoped',()=>{
 const j=new Journal(content());j.edit(w,'S',[{id:'a',f:'x',value:5}]);const b=j.freeze(w,'S'),c=server();assertCanvasBatch(c,command(b));
 for(const patches of [[{op:'set',path:['workspaces',{id:w},'stages','T',{id:'c'},'x'],value:2}],[{op:'set',path:['workspaces',{id:w},'stages','S'],value:[]}],[{op:'set',path:['workspaces',{id:w},'stages','S',{id:'a'},'id'],value:'other'}]])assert.throws(()=>assertCanvasBatch(c,{...command(b),patches}),/CANVAS_/);
 const empty={workspaces:[]},newJournal=new Journal(empty);newJournal.operation(w,'S',{id:'new',stageCode:'S',name:'New',productCodes:[],nextIds:[]},null);const batch=newJournal.freeze(w,'S');assert.equal(batch.patches.length,2);assert.equal(apply(server(empty),batch).state.working.workspaces[0].stages.S[0].id,'new');
});

void test('ACK clears only sent changes, rebases same-node new edits and never accepts unrelated dependencies',()=>{
 const c=content(),j=new Journal(c);j.edit(w,'S',[{id:'a',f:'x',value:5}]);const b=j.freeze(w,'S');j.sent(b);j.edit(w,'S',[{id:'a',f:'x',value:6}]);const tc=j.project(w,'T')[0];j.operation(w,'T',{...tc,name:'local C'},tc);const fresh=clone(c);op(fresh,'a').x=5;op(fresh,'c','T').name='remote C';j.acknowledge(b,fresh);assert.equal(j.project(w,'S')[0].x,6);assert.equal(j.freeze(w,'S').guards[0].value,5);assert.throws(()=>j.freeze(w,'T'),/CANVAS_CONFLICT/);
});

void test('insert edited during POST becomes guarded fields; delete after POST keeps correct baseline',()=>{
 const c=content(),j=new Journal(c);j.operation(w,'S',{id:'new',stageCode:'S',name:'New',productCodes:[],nextIds:[]},null);const b=j.freeze(w,'S');j.sent(b);const current=j.project(w,'S').find(o=>o.id==='new');j.operation(w,'S',{...current,name:'Later'},current);const result=apply(server(),b);j.acknowledge(b,result.state.working);const next=j.freeze(w,'S');assert.equal(next.patches[0].op,'set');assert.equal(next.guards[0].value,'New');
 const k=new Journal(content());k.edit(w,'S',[{id:'a',f:'x',value:99}]);const sent=k.freeze(w,'S');k.sent(sent);k.remove(w,'S','a');const acknowledged=apply(server(),sent);k.acknowledge(sent,acknowledged.state.working);assert.equal(k.freeze(w,'S').guards.find(g=>g.path.length===5).value.x,99);
});

void test('undo cannot undo an acknowledged batch, only new local history',()=>{
 const j=new Journal(content());j.edit(w,'S',[{id:'a',f:'x',value:5}]);const b=j.freeze(w,'S');j.sent(b);const result=apply(server(),b);j.acknowledge(b,result.state.working);j.travel(w,'S');assert.equal(j.counts().fields,0);
 j.edit(w,'S',[{id:'a',f:'x',value:6}]);j.travel(w,'S');assert.equal(j.counts().fields,0);
});

void test('recovery retains legacy unknown command exactly and malformed records block',()=>{
 const c=content(),j=new Journal(c);j.edit(w,'S',[{id:'a',f:'x',value:5}]);const b=j.freeze(w,'S');b.command=command(b);delete b.command.source;b.sent=true;const legacy={entries:j.entries,pending:b};const recovered=new Journal(c,object(legacy));assert.deepEqual(object(recovered.pending.command),object(b.command));assert.throws(()=>recovered.freeze(w,'S'),/RECEIPT_REQUIRED/);
 assert.throws(()=>new Journal(c,{entries:{bad:{w,s:'S',id:'a',f:'id',value:'b'}}}),/INVALID_CANVAS_RECOVERY/);
});

function fixtureLocks(){const held=new Set();return{async request(name,_options,fn){await Promise.resolve();if(held.has(name))return fn(null);held.add(name);try{return await fn({name});}finally{held.delete(name);}}};}
async function browserFixture(seed={}){
 const records=seed.records||new Map(),session=seed.session||new Map(),manager=seed.manager===undefined?fixtureLocks():seed.manager,timers=new Map(),listeners=new Map(),calls=[],writes=[],status={textContent:''},button={},identity={id:'actor-a'};
 let model=clone(seed.model||{generation:'generation-test',revision:0,saved:null,working:content(),pendingId:null}),mode='success',receipt=seed.receipt?clone(seed.receipt):null,resolvePost,timer=0;
 const storage=(map,track=false)=>({get length(){return map.size;},key:i=>[...map.keys()][i]??null,getItem:k=>map.get(k)??null,setItem(k,v){if(mode==='quota'&&track)throw Error('quota');map.set(k,String(v));if(track)writes.push(k);},removeItem:k=>map.delete(k)});
 const ctx={window:null,structuredClone,console,performance,crypto:webcrypto,location:{origin:'https://fixture.invalid',pathname:'/process/'},navigator:manager?{locks:manager}:{},localStorage:storage(records,true),sessionStorage:seed.sessionStorage||storage(session),setTimeout(fn){const id=++timer;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id),addEventListener(name,fn){const list=listeners.get(name)||new Set();list.add(fn);listeners.set(name,list);},removeEventListener:(name,fn)=>listeners.get(name)?.delete(fn),document:{documentElement:{lang:'zh'},querySelector:s=>s==='.pe-local-status'?status:s==='[data-pe="sync"]'?button:null},ProcessSync:{identity,identityGeneration:()=>seed.epoch??1,platformHeaders:()=>({}),requiresReload:false},ProcessEditorV2:{currentCanvas:()=>({workspace:w,stage:'S'}),confirm:()=>{throw Error('UNEXPECTED_CONFIRM');}}};ctx.window=ctx;
 const permissions={view:true,edit:true},payload=()=>({permissions:clone(permissions),control:{versions:[{id:'draft',status:'draft'}],workflow:clone(model)}});
 const commit=cmd=>{const result=processAuthoringAdapter(cmd.source?.startsWith('canvas-v2:')).apply({workflow:createSharedDraft('process:platform',model.working,null,model.generation),versions:[]},cmd,context);model={...model,working:result.state.working,revision:model.revision+1};receipt={receipt:{operationId:cmd.operationId,generation:cmd.generation,revision:model.revision,savedId:model.saved?.id??null,caseId:null,unchanged:false}};return {...payload(),...clone(receipt)};};
 const clients=[];ctx.createSharedDraftClient=({endpoint})=>{const c={endpoint,prepare:(g,action,detail)=>({...detail,generation:g,action,clientId:'client-test-id',sequence:++serial,operationId:webcrypto.randomUUID()}),async sendPrepared(cmd){calls.push({method:'POST',cmd:clone(cmd),endpoint});if(mode==='held')return new Promise(resolve=>{resolvePost=()=>resolve(commit(cmd));});if(mode==='lost'){commit(cmd);throw Error('RESULT_UNKNOWN_CHECK_BEFORE_RETRY');}if(mode==='late-actor'){const r=commit(cmd);ctx.ProcessSync.identity={id:'actor-b'};return r;}return commit(cmd);},async receipt(id,generation){calls.push({method:'GET',receipt:true,id,generation});if(!receipt||receipt.receipt.operationId!==id)throw Object.assign(Error('OPERATION_NOT_FOUND'),{status:404});return clone(receipt);},read:async()=>{calls.push({method:'GET'});return payload();},discardRejected(){},flush:async()=>{}};clients.push(c);return c;};
 const pins=new WeakSet(),reads=new WeakSet(),adopt=r=>{model=clone(r.control.workflow);ctx.ProcessCanvasLocal.accept(model);};
 ctx.ProcessAuthoringV3={flow:()=>model,canEditCanvas:()=>ctx.ProcessSync.identity===identity&&!ctx.ProcessSync.requiresReload&&permissions.edit&&!model.pendingId,canEditLocalCanvas:()=>ctx.ProcessAuthoringV3.canEditCanvas(),recoveryAuthority:()=>({canView:ctx.ProcessSync.identity===identity&&!ctx.ProcessSync.requiresReload&&permissions.view===true,canEdit:ctx.ProcessAuthoringV3.canEditLocalCanvas()===true,pending:!!model.pendingId,hasOpenForm:false,interacting:false}),captureCanvasRecovery(){const pin={identity:ctx.ProcessSync.identity,generation:model.generation};pins.add(pin);return pin;},async readCanvasRecovery(pin){if(pin&&(!pins.has(pin)||pin.identity!==ctx.ProcessSync.identity||pin.generation!==model.generation))throw Error('CANVAS_RECOVERY_CONTEXT_CHANGED');const result=await clients[0].read();reads.add(result);return result;},acceptCanvasRecovery(r){if(!reads.has(r))throw Error('CANVAS_RECOVERY_READ_REQUIRED');reads.delete(r);adopt(r);},updateLocalSaveState(){},acceptCanvas:adopt};
 vm.runInNewContext(fs.readFileSync('public/process/canvas-recovery-store.js','utf8'),ctx);vm.runInNewContext(source,ctx);ctx.ProcessCanvasLocal.accept(model);await ctx.ProcessCanvasLocal.recoveryReady();
 return{ctx,local:ctx.ProcessCanvasLocal,calls,records,session,manager,writes,status,model:()=>model,receipt:()=>clone(receipt),mode:m=>mode=m,release:()=>resolvePost(),async close(){for(const fn of listeners.get('pagehide')||[])fn();await new Promise(setImmediate);},tick(){for(const [id,fn]of timers){timers.delete(id);fn();}},async remote(next){model=next;ctx.ProcessCanvasLocal.accept(model);await ctx.ProcessCanvasLocal.recoveryReady();}};
}

void test('100 local drag edits have zero POST and bounded debounce; Save/lease never synchronizes',async()=>{
 const f=await browserFixture();for(let i=1;i<=100;i++)f.local.edit(w,'S',[{id:'a',f:'x',value:i}]);assert.equal(f.calls.length,0);assert.equal(f.writes.length,0);f.tick();assert.equal(f.writes.length,1);await assert.rejects(f.local.beforeSave(),/UNSYNCHRONIZED/);const lease=f.local.lockForDeparture();await assert.rejects(f.local.saveForDeparture(lease),/UNSYNCHRONIZED/);lease.release();assert.equal(f.calls.length,0);await f.local.sync();assert.equal(f.calls.filter(c=>c.method==='POST').length,1);assert(!f.local.dirty());
});

void test('lost response uses original receipt without a second POST; later editing stays local',async()=>{
 const f=await browserFixture();f.local.edit(w,'S',[{id:'a',f:'x',value:5}]);f.mode('lost');await assert.rejects(f.local.sync(),/UNKNOWN/);assert(f.local.pending());f.local.edit(w,'S',[{id:'a',f:'x',value:6}]);f.mode('success');await f.local.sync();assert.equal(f.calls.filter(c=>c.method==='POST').length,1);assert.equal(f.local.project(w,'S',f.model().working.workspaces[0].stages.S)[0].x,6);assert(f.local.dirty());
});

void test('late actor ACK preserves original persisted batch and cannot clear input',async()=>{
 const f=await browserFixture();f.local.edit(w,'S',[{id:'a',f:'x',value:5}]);f.mode('late-actor');await assert.rejects(f.local.sync(),/ACCOUNT_CHANGED|OWNER_CHANGED/);const stored=[...f.records.values()].map(raw=>JSON.parse(raw)),marker=stored.find(row=>row.kind==='unknown');assert(marker?.reference?.operationId);assert(stored.some(row=>JSON.stringify(row).includes('"value":5')));for(const raw of f.records.values())assert(!/"(?:command|patches|guards|headers|body)"\s*:/.test(raw));
});

void test('pending and new generation retain local recovery; duplicated tab gets independent storage',async()=>{
 const f=await browserFixture();f.local.edit(w,'S',[{id:'a',f:'x',value:5}]);f.tick();const keys=[...f.records.keys()];const raw=f.records.get(keys[0]),duplicate=await browserFixture({records:f.records,session:f.session,manager:f.manager});assert.equal(duplicate.local.counts().fields,0);await assert.rejects(duplicate.local.previewRecovery(keys[0]),/IN_USE/);duplicate.local.edit(w,'S',[{id:'a',f:'x',value:8}]);duplicate.tick();assert.equal(f.records.size,2);assert.equal(f.records.get(keys[0]),raw);
 const next={...f.model(),generation:'generation-next',pendingId:null};await f.remote(next);assert.equal(f.local.project(w,'S',next.working.workspaces[0].stages.S)[0].x,0);assert.equal(f.records.get(keys[0]),raw);await assert.rejects(f.local.restoreRecovery(keys[0],()=>true),/BASE_CHANGED|VERSION_CHANGED/);
});

void test('quota error never reports recovery success and blocks sending the batch',async()=>{
 const f=await browserFixture();f.local.edit(w,'S',[{id:'a',f:'x',value:5}]);f.mode('quota');f.tick();assert.match(f.status.textContent,/存檔失敗|存檔未完成/);await assert.rejects(f.local.sync(),/RECOVERY_STORAGE_UNAVAILABLE/);assert.equal(f.calls.length,0);assert(f.local.dirty());
});

void test('background newer shared value cannot become an unseen overwrite baseline',()=>{
 const first=content(),j=new Journal(first);j.project(w,'S',first.workspaces[0].stages.S);const fresh=clone(first);op(fresh,'a').x=999;j.content=fresh;j.edit(w,'S',[{id:'a',f:'x',value:5}]);assert.throws(()=>j.freeze(w,'S'),/CANVAS_CONFLICT/);assert.equal(j.project(w,'S')[0].x,5);
});

void test('production poll updates authority/shared model without replacing editor or increasing interval',async()=>{
 const server={versions:[{status:'draft'}],workflow:{generation:'g',revision:1,working:content()}};let enabled=false,renders=0,reads=0;const intervals=[];
 const client={read:async()=>{reads++;return {control:clone(server),permissions:{edit:true,view:true}};},contentIssues:async()=>({generation:'g',revision:server.workflow.revision})};
 const c={structuredClone,console,JSON,Error,setInterval:(fn,ms)=>intervals.push(ms),setTimeout:()=>1,clearTimeout(){},localStorage:{getItem:()=>enabled?'enabled':null},state:{view:'editor',category:'Synthetic',editorLine:'A',editorByCategory:{}},document:{documentElement:{lang:'zh'},addEventListener(){},querySelector:()=>null,querySelectorAll:()=>[],createElement:()=>({dataset:{}})},bindView(){},renderInspector(){},render:()=>renders++,toast(){},editorKey:()=> 'Synthetic:A',lineFor:()=>({stages:[{code:'S'},{code:'T'}]}),createMasterSharedBridge:()=>({diff(){}}),createSharedDraftClient:()=>client,ProcessSync:{identity:{id:'synthetic-a'}},ProcessEditorV2:{interacting:()=>false}};
 c.window=c;c.ensureCategoryEditor=()=>c.state.editorByCategory['Synthetic:A'];vm.runInNewContext(fs.readFileSync('public/process/process-authoring-v3.js','utf8'),c);enabled=true;await c.ProcessAuthoringV3.load();const first=renders;server.workflow.revision++;op(server.workflow.working,'a').name='Remote actor';await c.ProcessAuthoringV3.load();assert.equal(c.ensureCategoryEditor().S[0].name,'A');assert.equal(op(c.ProcessAuthoringV3.flow().working,'a').name,'Remote actor');assert.equal(renders,first);assert.equal(reads,2);assert.deepEqual(intervals,[4000]);
});

void test('batch limit never silently splits and corrupt pending commands never replay',()=>{
 const c=content();c.workspaces[0].stages.S=Array.from({length:257},(_,i)=>({id:'op-'+i,stageCode:'S',x:0,nextIds:[]}));const j=new Journal(c);j.edit(w,'S',c.workspaces[0].stages.S.map(o=>({id:o.id,f:'x',value:1})));assert.throws(()=>j.freeze(w,'S'),/BATCH_LIMIT/);assert.equal(j.counts().fields,257);
 const small=new Journal(content());small.edit(w,'S',[{id:'a',f:'x',value:2}]);const b=small.freeze(w,'S');b.command=command(b);b.command={...b.command,patches:[]};assert.throws(()=>new Journal(content(),{entries:small.entries,pending:b}),/INVALID_CANVAS_RECOVERY/);
});

void test('unavailable legacy sessionStorage neither imports old tabs nor blocks independent local persistence',async()=>{
 let touched=0;const f=await browserFixture({sessionStorage:{getItem(){touched++;throw Error('denied');},setItem(){touched++;throw Error('denied');}}});f.local.edit(w,'S',[{id:'a',f:'x',value:3}]);f.local.flushRecovery();assert.equal(touched,0);assert.equal(f.records.size,1);assert.equal(f.calls.length,0);assert.equal(f.local.project(w,'S',f.model().working.workspaces[0].stages.S)[0].x,3);
});

void test('whole-canvas review preserves original/latest/mine, rebases only reviewed values and requires manual Sync',()=>{
 const original=content(),j=new Journal(original),a=j.project(w,'S')[0];j.operation(w,'S',{...a,name:'Mine'},a);j.edit(w,'T',[{id:'c',f:'name',value:'Other local'}]);const latest=clone(original);op(latest,'a').name='Remote';const review=j.review(w,'S',latest);const field=review.changes.find(c=>c.field==='name');assert.deepEqual(object([field.before,field.latest,field.mine]),['A','Remote','Mine']);assert.equal(j.project(w,'S')[0].name,'Mine');j.resolveReview(review,'mine');assert.equal(op(latest,'a').name,'Remote');const batch=j.freeze(w,'S');assert.equal(batch.guards.find(g=>g.path.at(-1)==='name').value,'Remote');assert.equal(op(apply(server(latest),batch).state.working,'a').name,'Mine');assert.equal(j.counts(w,'T').fields,1);
});

void test('review latest drops only selected canvas; removed nodes/new incoming edges remain blocked with local content',()=>{
 const original=content(),j=new Journal(original);j.edit(w,'S',[{id:'a',f:'name',value:'Mine'}]);j.edit(w,'T',[{id:'c',f:'name',value:'Keep T'}]);const latest=clone(original);latest.workspaces[0].stages.S.shift();const review=j.review(w,'S',latest);assert.equal(review.blockers[0].reason,'OPERATION_REMOVED');assert.throws(()=>j.resolveReview(review,'mine'),/REVIEW_UNSAFE/);assert.equal(j.counts(w,'S').fields,1);j.resolveReview(review,'latest');assert.equal(j.counts(w,'S').fields,0);assert.equal(j.counts(w,'T').fields,1);
 const deletion=new Journal(original);deletion.remove(w,'S','b');const changed=clone(original);changed.workspaces[0].stages.S.push({id:'new-source',stageCode:'S',name:'New source',productCodes:[],nextIds:['b']});const incoming=deletion.review(w,'S',changed);assert(incoming.blockers.some(b=>b.reason==='NEW_INCOMING_CONNECTION'));assert.throws(()=>deletion.resolveReview(incoming,'mine'),/REVIEW_UNSAFE/);assert.equal(deletion.project(w,'S').length,1,'review does not replace preview');
});

void test('review cannot clear an unknown batch or rebase edits made after opening comparison',()=>{
 const j=new Journal(content());j.edit(w,'S',[{id:'a',f:'name',value:'Mine'}]);const review=j.review(w,'S',content());j.edit(w,'S',[{id:'a',f:'x',value:3}]);assert.throws(()=>j.resolveReview(review,'mine'),/REVIEW_CHANGED/);const current=j.review(w,'S',content());j.sent(j.freeze(w,'S'));assert.throws(()=>j.resolveReview(current,'latest'),/RECEIPT_REQUIRED/);
});

void test('exact creation receipt replays after workspace now exists; altered replay still rejects',()=>{
 const empty={workspaces:[]},j=new Journal(empty);j.operation(w,'S',{id:'created',stageCode:'S',name:'Created',productCodes:[],nextIds:[]},null);const cmd=command(j.freeze(w,'S')),s=server(empty),adapter=processAuthoringAdapter(true),first=adapter.apply(s,cmd,context);s.workflow=first.state;const replay=adapter.apply(s,cmd,context);assert.deepEqual(object(replay.receipt),object(first.receipt));assert.throws(()=>adapter.apply(s,{...cmd,source:'canvas-v2:'+JSON.stringify([w,'T'])},context),/OPERATION_ID_REUSED/);
});

void test('retained operation form is never exposed under another account or invalidated delivery',async()=>{
 const f=await browserFixture(),original=clone(op(f.model().working,'a'));f.local.storeForm(w,'S','a',{original,draft:{...original,name:'Private input'},isNew:false});assert.equal(f.local.form(w,'S','a').draft.name,'Private input');f.ctx.ProcessSync.identity={id:'actor-b'};assert.equal(f.local.form(w,'S','a'),undefined);assert.deepEqual(object(f.local.forms()),{});f.ctx.ProcessSync.identity={id:'actor-a'};f.ctx.ProcessSync.requiresReload=true;assert.equal(f.local.form(w,'S','a'),undefined);
});

function useActualLocalEditGate(f){
 const authoring=fs.readFileSync('public/process/process-authoring-v3.js','utf8'),match=authoring.match(/canEditLocalCanvas:(\(\)=>.*?),canEditCanvas:/);assert(match,'actual authoring edit gate');
 const permissions={edit:true},control={versions:[{status:'draft'}]},box={host:f.ctx,ownFlow:()=>true,permissions,control,flow:f.model,submitStateUnconfirmed:false};
 f.ctx.ProcessAuthoringV3.canEditLocalCanvas=vm.runInNewContext('('+match[1]+')',box);return{permissions,control,box};
}
void test('confirmed pending blocks further local edits and POST but retains visible dirty buffer',async()=>{
 const f=await browserFixture();useActualLocalEditGate(f);f.local.edit(w,'S',[{id:'a',f:'x',value:5}]);assert(f.local.dirty());
 await f.remote({...f.model(),pendingId:'confirmed-case'});
 assert.throws(()=>f.local.edit(w,'S',[{id:'a',f:'x',value:6}]),/PENDING_OR_PERMISSION_LOCKED/);
 await assert.rejects(f.local.sync(),/PENDING_OR_PERMISSION_LOCKED/);assert.equal(f.calls.length,0);
 assert.equal(f.local.project(w,'S',f.model().working.workspaces[0].stages.S)[0].x,5);assert(f.local.dirty());
});
void test('ordinary dirty draft and in-flight Sync still admit next-batch local edits',async()=>{
 const f=await browserFixture();useActualLocalEditGate(f);f.local.edit(w,'S',[{id:'a',f:'x',value:5}]);f.local.edit(w,'S',[{id:'a',f:'x',value:6}]);
 f.mode('held');const sending=f.local.sync();f.local.edit(w,'S',[{id:'a',f:'x',value:7}]);f.release();await sending;
 assert.equal(f.calls.filter(c=>c.method==='POST').length,1);assert.equal(f.model().working.workspaces[0].stages.S[0].x,6);
 assert.equal(f.local.project(w,'S',f.model().working.workspaces[0].stages.S)[0].x,7);assert(f.local.dirty());
});
void test('dirty buffer never bypasses revoked edit, missing draft, or invalidated delivery',async()=>{
 const f=await browserFixture(),g=useActualLocalEditGate(f);f.local.edit(w,'S',[{id:'a',f:'x',value:5}]);
 g.permissions.edit=false;assert.equal(f.ctx.ProcessAuthoringV3.canEditLocalCanvas(),false);g.permissions.edit=true;
 g.control.versions=[{status:'pending'}];assert.equal(f.ctx.ProcessAuthoringV3.canEditLocalCanvas(),false);g.control.versions=[{status:'draft'}];
 f.ctx.ProcessSync.requiresReload=true;assert.equal(f.ctx.ProcessAuthoringV3.canEditLocalCanvas(),false);assert(f.local.dirty());
});

void test('reloaded unknown has receipt-only marker, never auto-imports, and explicitly recovers only post-send edits',async()=>{
 const source=await browserFixture();source.local.edit(w,'S',[{id:'a',f:'x',value:5}]);source.mode('lost');await assert.rejects(source.local.sync(),/UNKNOWN/);source.local.edit(w,'S',[{id:'a',f:'x',value:6}]);source.tick();
 const [key,raw]=[...source.records].find(([,value])=>JSON.parse(value).kind==='unknown'),marker=JSON.parse(raw);assert.equal(marker.payload,undefined);assert.equal(marker.command,undefined);assert.equal(marker.reference.operationId,source.receipt().receipt.operationId);assert(source.records.has(marker.snapshotKey));await source.close();
 const next=await browserFixture({records:source.records,manager:source.manager,model:source.model(),receipt:source.receipt()});assert.equal(next.local.counts().fields,0);assert.equal(next.local.project(w,'S',next.model().working.workspaces[0].stages.S)[0].x,5);assert.equal(next.calls.length,0);
 await next.local.resolveRecovery(key);assert.equal(next.calls.filter(call=>call.method==='POST').length,0);assert.equal(next.calls.filter(call=>call.receipt).length,1);assert.equal(next.calls.find(call=>call.receipt).id,marker.reference.operationId);assert.equal(next.local.counts().fields,0);assert.equal(JSON.parse(next.records.get(key)).kind,'local');
 await next.local.restoreRecovery(key,()=>true);assert.equal(next.local.project(w,'S',next.model().working.workspaces[0].stages.S)[0].x,6);assert.equal(next.calls.filter(call=>call.method==='POST').length,0);await next.close();
});
void test('missing original receipt after reload stays unknown and never re-POSTs or exposes editable restore',async()=>{
 const source=await browserFixture();source.local.edit(w,'S',[{id:'a',f:'x',value:5}]);source.mode('lost');await assert.rejects(source.local.sync(),/UNKNOWN/);const [key,raw]=[...source.records].find(([,value])=>JSON.parse(value).kind==='unknown');await source.close();
 const next=await browserFixture({records:source.records,manager:source.manager,model:source.model()});await assert.rejects(next.local.resolveRecovery(key),/OPERATION_NOT_FOUND/);assert.equal(next.records.get(key),raw);const preview=await next.local.previewRecovery(key);assert.equal(preview.kind,'unknown');assert.equal(preview.payload,undefined);assert.equal(preview.canRestore,false);assert.equal(next.calls.filter(call=>call.method==='POST').length,0);assert.equal(next.local.counts().fields,0);await next.close();
});
