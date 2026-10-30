import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync('public/process/process-editor.js','utf8');
const slice=(start,end)=>{const a=source.indexOf(start),b=source.indexOf(end,a);assert(a>=0&&b>a);return source.slice(a,b);};
const commitSource=slice(' async function commit(',' function opPath(');
const departureSource=slice(' function formOwner(){',' function closeRequest(){');
const deferred=()=>{let resolve,reject;const promise=new Promise((r,j)=>{resolve=r;reject=j;});return {promise,resolve,reject};};

function fixture(){
 const calls=[],frames=[],copies=[],state={editorByCategory:{'G:A':{A:[{id:'one',stageCode:'A',name:'saved',x:80,y:90,nextIds:[],productCodes:['P1'],ipqcAssignments:[],mediaItems:[]},{id:'other',stageCode:'A',name:'other user'}]}}};
 let allowed=true,workspaceKey='G:A',generation='g1',epoch=1,delivery=1,syncWork;
 const identity={id:'editor'},button={disabled:false,textContent:''},error={textContent:''};
 const box={state,JSON,Error,Set,structuredClone,copy:value=>{copies.push(value);return structuredClone(value);},key:()=>workspaceKey,flow:()=>({generation}),can:()=>allowed,t:zh=>zh,issueText:e=>e.message,
  requestAnimationFrame:fn=>frames.push(fn),setTimeout:fn=>fn(),render:()=>calls.push('render'),toast:()=>calls.push('toast'),dismissibleDialogs:new Set(),
  ensureCategoryEditor:()=>state.editorByCategory[workspaceKey],operationGuard:o=>({path:['workspaces',{id:'G:A'},'stages','A',{id:o.id}],value:structuredClone(o)}),
  host:{ProcessSync:{identity,identityGeneration:()=>epoch,captureDelivery:()=>delivery,isCurrentDelivery:old=>old===delivery},ProcessNavigationForms:{acknowledge:()=>calls.push('acknowledge')},ProcessAuthoringV3:{async sync(guards){calls.push({guards:structuredClone(guards)});if(syncWork)await syncWork();},cancelUnapplied:()=>calls.push('cancel-rejected')}},modal:null};
 vm.createContext(box);vm.runInContext(commitSource+departureSource+'\nglobalThis.departure=formDeparture;',box);
 const dialog={open:true,isConnected:true,inert:false,querySelector:s=>s==='#apply-operation'?button:error,close(){calls.push('close');this.open=false;this.isConnected=false;box.modal=null;}};
 const original=structuredClone(state.editorByCategory['G:A'].A[0]);
 const m=box.modal={dialog,original,draft:structuredClone(original),isNew:false,tab:'basic',scroll:{basic:235},owner:box.formOwner()};
 return {box,m,dialog,button,error,calls,copies,state,frames,async paint(){assert(frames.length);frames.shift()();await Promise.resolve();},setAllowed:v=>allowed=v,setKey:v=>workspaceKey=v,setGeneration:v=>generation=v,setEpoch:v=>epoch=v,setDelivery:v=>delivery=v,setSync:fn=>syncWork=fn};
}

void test('save-and-leave applies the latest full form once and keeps it open until Save/navigation succeeds',async()=>{
 const f=fixture();f.m.draft.name='latest';f.m.draft.productCodes=['P1','P2'];f.m.draft.ipqcAssignments=[{itemId:'quality-item'}];f.m.draft.mediaItems=[{src:'data:image/png;base64,synthetic'}];
 const release=f.box.departure.freeze();assert.equal(f.dialog.inert,true);
 const pending=f.box.departure.saveApply();await f.paint();assert.equal(await pending,true);
 assert.equal(f.calls.filter(x=>typeof x==='object').length,1);assert.equal(f.dialog.open,true);assert.equal(f.dialog.inert,true);
 assert.equal(f.state.editorByCategory['G:A'].A[0].name,'latest');assert.deepEqual(f.state.editorByCategory['G:A'].A[0].ipqcAssignments,f.m.draft.ipqcAssignments);
 assert.equal(f.state.editorByCategory['G:A'].A[1].name,'other user');assert.deepEqual(f.m.scroll,{basic:235});
 assert.equal(f.box.departure.inspect().state,'clean');assert(f.calls.includes('acknowledge'));assert(!f.calls.includes('close'));
 // A later Save failure releases the lock without closing or dropping input.
 release();release();assert.equal(f.dialog.inert,false);assert.equal(f.m.draft.name,'latest');assert.equal(f.dialog.open,true);
 f.box.departure.closeClean();assert.equal(f.dialog.open,false);
});

void test('Apply failure keeps the full draft and restores only this optimistic workspace',async()=>{
 const f=fixture();f.m.draft.name='keep this input';f.setSync(()=>{throw Error('DEPENDENCY_CHANGED_RECONFIRM');});
 const release=f.box.departure.freeze(),pending=assert.rejects(f.box.departure.saveApply(),/DEPENDENCY_CHANGED_RECONFIRM/);await f.paint();await pending;release();
 assert.equal(f.state.editorByCategory['G:A'].A[0].name,'saved');assert.equal(f.m.draft.name,'keep this input');assert.equal(f.dialog.open,true);assert.equal(f.dialog.inert,false);assert.match(f.error.textContent,/DEPENDENCY_CHANGED/);
});

void test('failure does not replace a newer remote workspace adopted while the request was pending',async()=>{
 const f=fixture(),remote={A:[{id:'one',stageCode:'A',name:'remote authoritative'}]};f.m.draft.name='local rejected';f.setSync(()=>{f.state.editorByCategory['G:A']=remote;throw Error('CONFLICT');});
 const pending=assert.rejects(f.box.departure.saveApply(),/CONFLICT/);await f.paint();await pending;
 assert.equal(f.state.editorByCategory['G:A'],remote);assert.equal(f.m.draft.name,'local rejected');assert.equal(f.dialog.open,true);
});

for(const change of ['identity','generation','delivery','workspace'])void test('form '+change+' change during the paint yield rejects before any write',async()=>{
 const f=fixture();f.m.draft.name='unsent';const pending=assert.rejects(f.box.departure.saveApply(),/EDITOR_CONTEXT_CHANGED/);
 if(change==='identity')f.setEpoch(2);if(change==='generation')f.setGeneration('g2');if(change==='delivery')f.setDelivery(2);if(change==='workspace')f.setKey('other');
 await f.paint();await pending;assert.equal(f.calls.filter(x=>typeof x==='object').length,0);assert.equal(f.dialog.open,true);assert.equal(f.m.draft.name,'unsent');
});

void test('late acknowledged Apply cannot close or paint a different delivery',async()=>{
 const f=fixture(),gate=deferred();f.m.draft.name='in flight';f.setSync(()=>gate.promise);
 const pending=assert.rejects(f.box.departure.saveApply(),/EDITOR_CONTEXT_CHANGED/);await f.paint();f.setDelivery(2);gate.resolve();await pending;
 assert.equal(f.dialog.open,true);assert(!f.calls.includes('render'));assert.equal(f.m.draft.name,'in flight');
});

void test('the form preserves the newest shared canvas coordinates and links when applying content',async()=>{
 const f=fixture();f.state.editorByCategory['G:A'].A[0].x=280;f.state.editorByCategory['G:A'].A[0].nextIds=['other'];f.m.draft.name='new content';
 const pending=f.box.departure.saveApply();await f.paint();await pending;
 assert.equal(f.m.original.x,280);assert.equal(f.m.draft.x,280);assert.deepEqual(f.m.draft.nextIds,['other']);
 assert.equal(f.calls.find(x=>typeof x==='object').guards[0].value.x,280);assert.equal(f.box.departure.inspect().state,'clean');
});

void test('readonly inputs are never applied, and clean readonly dialogs may close without a write',async()=>{
 const f=fixture();f.setAllowed(false);assert.equal(f.box.departure.inspect().state,'clean');assert.equal(await f.box.departure.saveApply(),true);assert.equal(f.calls.length,0);
 f.m.draft.name='not authorized';await assert.rejects(f.box.departure.saveApply(),/EDITOR_FORM_APPLY_REQUIRED/);assert.equal(f.calls.length,0);assert.throws(()=>f.box.departure.closeClean(),/EDITOR_FORM_APPLY_REQUIRED/);
 f.box.departure.discardLocal();assert.equal(f.state.editorByCategory['G:A'].A[0].name,'saved');assert.equal(f.dialog.open,false);
});

void test('uploading and in-flight forms remain blocked without clearing inputs',async()=>{
 for(const flag of ['uploading','saving']){const f=fixture();f.m[flag]=true;f.m.draft.name='retain';assert.equal(f.box.departure.inspect().state,'busy');await assert.rejects(f.box.departure.saveApply(),/EDITOR_FORM_BUSY/);assert.throws(()=>f.box.departure.discardLocal(),/EDITOR_FORM_BUSY/);assert.equal(f.dialog.open,true);}
});

void test('nested form locks release exactly once, preserve preexisting inert, and do not permit a normal Apply',async()=>{
 const f=fixture();f.dialog.inert=true;f.m.draft.name='locked';const a=f.box.departure.freeze(),b=f.box.departure.freeze();assert.equal(await f.box.apply(),false);a();a();assert.equal(f.m.departureLocked,true);b();assert.equal(f.m.departureLocked,false);assert.equal(f.dialog.inert,true);assert.equal(f.calls.length,0);
});

void test('clean navigation closes only exact owned viewers, not unrelated dialogs',()=>{
 const f=fixture(),album={open:true,close(){this.open=false;}},foreign={open:true};f.box.dismissibleDialogs.add(album);assert.equal(f.box.departure.ownsDialog(album),true);assert.equal(f.box.departure.ownsDialog(f.dialog),true);assert.equal(f.box.departure.ownsDialog(foreign),false);f.box.departure.closeClean();assert.equal(album.open,false);assert.equal(foreign.open,true);
});

void test('commit transfers its private next object while retaining rollback protection',async()=>{
 const f=fixture(),next=structuredClone(f.state.editorByCategory['G:A']);next.A[0].name='owned next';const before=f.copies.length;await f.box.commit(next,[]);assert.equal(f.state.editorByCategory['G:A'],next);assert.equal(f.copies.length-before,1,'only the original workspace rollback copy remains');
});

void test('a newly applied block survives a later Save failure and subsequent edits never insert it twice',async()=>{
 const f=fixture();f.m.isNew=true;f.m.original={...f.m.original,id:'new',name:'new block'};f.m.draft={...structuredClone(f.m.original),name:'latest new block'};
 let pending=f.box.departure.saveApply();await f.paint();assert.equal(await pending,true);assert.equal(f.m.isNew,false);assert.equal(f.dialog.open,true);
 assert.equal(f.state.editorByCategory['G:A'].A.filter(o=>o.id==='new').length,1);assert.equal(f.calls.find(x=>typeof x==='object').guards.length,0);
 // Save failed outside this form: retrying its Apply stage must be a no-op.
 assert.equal(await f.box.departure.saveApply(),true);assert.equal(f.calls.filter(x=>typeof x==='object').length,1);
 f.m.draft.name='second edit';pending=f.box.departure.saveApply();await f.paint();assert.equal(await pending,true);
 const writes=f.calls.filter(x=>typeof x==='object');assert.equal(writes.length,2);assert.equal(writes[1].guards[0].value.id,'new');assert.equal(writes[1].guards[0].value.name,'latest new block');
 assert.equal(f.state.editorByCategory['G:A'].A.filter(o=>o.id==='new').length,1);assert.equal(f.state.editorByCategory['G:A'].A.find(o=>o.id==='new').name,'second edit');
});

void test('discard releases the current modal before the browser queues its close event',()=>{
 const f=fixture();f.m.draft.name='discard only local input';let closeQueued=false;
 // Native dialog.close changes open synchronously but dispatches close later.
 f.dialog.close=()=>{f.dialog.open=false;closeQueued=true;};
 f.box.departure.discardLocal();assert.equal(closeQueued,true);assert.equal(f.box.modal,null);
 assert.equal(f.box.departure.inspect().state,'clean');assert.equal(f.state.editorByCategory['G:A'].A[0].name,'saved');
 assert.equal(f.calls.filter(x=>typeof x==='object').length,0);assert.equal(f.dialog.isConnected,true,'DOM cleanup remains owned by the queued native close handler');
});
