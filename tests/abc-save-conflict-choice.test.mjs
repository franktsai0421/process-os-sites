// Actual bridge, transport and handlers; synthetic DOM and in-memory SQLite/R2.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fixture} from './abc-local-bridge-fixture.mjs';
const path=['products',{id:'product-a'},'name'];
const unit=['products',{id:'product-a'},'unit'];
const spec=['products',{id:'product-a'},'specification'];
const line=['lines',{id:'line-a'},'name'];
const stage=['lines',{id:'line-a'},'stages',{id:'stage-a'},'name'];
const copy=value=>JSON.parse(JSON.stringify(value));
const tick=()=>new Promise(resolve=>setTimeout(resolve,5));
function dom(x){
  const nodes=[],listeners=new Map();let opened=0;
  function element(tag){const node={tag,children:[],dataset:{},style:{},attrs:{},isConnected:false,textContent:'',append(...children){this.children.push(...children);for(const child of children)child.isConnected=true;},setAttribute(key,value){this.attrs[key]=value;},addEventListener(key,fn){(this.events||={})[key]=fn;},remove(){this.isConnected=false;},focus(){x.box.document.activeElement=this;},showModal(){opened++;this.open=true;}};nodes.push(node);return node;}
  x.box.document.createElement=element;x.box.document.body=element('body');
  x.box.addEventListener=(key,fn)=>{const set=listeners.get(key)||new Set();set.add(fn);listeners.set(key,set);};x.box.removeEventListener=(key,fn)=>listeners.get(key)?.delete(fn);
  return {nodes,opened:()=>opened,dialog:()=>nodes.findLast(n=>n.tag==='dialog'&&n.isConnected),choose(value){const node=nodes.findLast(n=>n.dataset.masterSaveChoice===value);assert(node,'A real bridge choice button exists');node.onclick();},emit(key){for(const fn of listeners.get(key)||[])fn({preventDefault(){}});},async wait(){for(let i=0;i<600&&!this.dialog();i++)await tick();assert(this.dialog(),'Expected conflict dialog');}};
}
async function stageChanges(x,changes){for(const [parts,value]of changes){let row=x.draft().snapshot;for(const part of parts.slice(0,-1))row=typeof part==='string'?row[part]:row.find(r=>r.id===part.id);row[parts.at(-1)]=value;}await x.bridge.execute(x.scope,'apply');}
async function peer(x,changes){const read=await x.f.request('GET');assert.equal(read.status,200);const latest=read.body.control.workflow.working,patches=[],guards=[];for(const [parts,value]of changes){let prior=latest;for(const part of parts)prior=typeof part==='string'?prior[part]:prior.find(r=>r.id===part.id);patches.push({op:'set',path:parts,value});guards.push({path:parts,value:prior});}const result=await x.f.request('POST',x.f.command('apply',{patches,guards,clientId:'peer-'+randomUUID()}));assert.equal(result.status,200,JSON.stringify(result.body));return result;}
for(const scope of ['AB','C']){
  for(const choice of ['mine','theirs'])void test(`${scope}: one ${choice} choice applies to every conflict, preserving both nonconflicting edits`,async t=>{
    const x=await fixture({scope});t.after(x.f.close);const d=dom(x);
    await stageChanges(x,[[path,'Mine'],[line,'Mine line'],[stage,'Mine stage'],[unit,'kg']]);
    await peer(x,[[path,'Peer'],[line,'Peer line'],[stage,'Peer stage'],[spec,'Peer specification']]);
    const before=x.f.row(),pending=x.bridge.execute(scope,'save');await d.wait();assert.equal(x.posts().length,0);assert.deepEqual(x.f.row(),before);assert.equal(d.opened(),1);
    assert.equal(d.nodes.filter(n=>n.tag==='button').length,3);d.choose(choice);const result=await pending,saved=result.control.workflow.saved.content;
    assert.equal(saved.products[0].name,choice==='mine'?'Mine':'Peer');assert.equal(saved.lines[0].name,choice==='mine'?'Mine line':'Peer line');assert.equal(saved.lines[0].stages[0].name,choice==='mine'?'Mine stage':'Peer stage');assert.equal(saved.products[0].unit,'kg');assert.equal(saved.products[0].specification,'Peer specification');assert.equal(x.posts().length,1);assert.equal(x.disk.size,0);assert.equal(x.bridge.localDirty(scope),false);
    const command=x.posts()[0].body.command;assert.equal(command.moduleAction,'save-local-v1');assert.equal(command.input.batches[0].guards.find(g=>JSON.stringify(g.path)===JSON.stringify(path)).value,'Peer');
  });
  for(const cancel of ['button','escape','pagehide'])void test(`${scope}: ${cancel} cancels without POST and keeps original local intent`,async t=>{
    const x=await fixture({scope});t.after(x.f.close);const d=dom(x);await stageChanges(x,[[path,'Mine']]);await peer(x,[[path,'Peer']]);const before=x.f.row(),local=copy(x.draft().snapshot),pending=x.bridge.execute(scope,'save');await d.wait();
    if(cancel==='button')d.choose('cancel');else if(cancel==='escape')d.dialog().events.cancel({preventDefault(){}});else d.emit('pagehide');
    assert.equal(await pending,null);assert.equal(x.posts().length,0);assert.deepEqual(x.f.row(),before);assert.deepEqual(copy(x.draft().snapshot),local);assert(x.bridge.localDirty(scope));assert.equal(d.dialog(),undefined);
  });
  void test(`${scope}: repeated local edits compare final intent; converged and reverted fields do not prompt`,async t=>{
    const x=await fixture({scope});t.after(x.f.close);const d=dom(x),original=x.draft().snapshot.products[0].name;
    await stageChanges(x,[[path,'Temporary'],[unit,'kg']]);await stageChanges(x,[[path,original]]);await peer(x,[[path,'Peer'],[unit,'kg']]);
    const r=await x.bridge.execute(scope,'save');assert.equal(d.opened(),0);assert.equal(r.control.workflow.saved.content.products[0].name,'Peer');assert.equal(r.control.workflow.saved.content.products[0].unit,'kg');assert.equal(x.posts().length,1);
  });
  for(const choice of ['mine','theirs'])void test(`${scope}: ${choice} does not overwrite a second peer change after the displayed comparison`,async t=>{
    const x=await fixture({scope});t.after(x.f.close);const d=dom(x);await stageChanges(x,[[path,'Mine'],[unit,'kg']]);await peer(x,[[path,'Peer']]);const pending=x.bridge.execute(scope,'save');await d.wait();await peer(x,[[path,'Peer changed again']]);const before=x.f.row();d.choose(choice);await assert.rejects(pending,/DEPENDENCY_CHANGED/);assert.deepEqual(x.f.row(),before);assert.equal(x.draft().snapshot.products[0].name,'Mine');assert(x.bridge.localDirty(scope));assert.equal(x.posts().length,1);assert.equal(x.bridge.client(scope).hasUnknown(),false);
  });
  for(const changed of ['identity','epoch','delivery','generation','input','form','discard','reset'])void test(`${scope}: changed ${changed} while choosing cannot dispatch`,async t=>{
    const x=await fixture({scope});t.after(x.f.close);const d=dom(x);await stageChanges(x,[[path,'Mine']]);await peer(x,[[path,'Peer']]);const pending=x.bridge.execute(scope,'save');await d.wait();const before=x.f.row();
    if(changed==='identity')x.box.ProcessSync.identity={...x.f.user};if(changed==='epoch')x.box.ProcessSync.identityGeneration=()=>2;if(changed==='delivery')x.box.ProcessSync.isCurrentDelivery=()=>false;if(changed==='generation')x.control.workflowScopes[scope].generation='later-generation';if(changed==='input')x.draft().snapshot.products[0].name='Later unsent';if(changed==='form')x.form(true);if(changed==='discard')x.bridge.discardLocal(scope);if(changed==='reset')x.bridge.resetReads();
    if(!['discard','reset'].includes(changed))d.choose('mine');await assert.rejects(pending,/ACCOUNT_CHANGED|STALE_GENERATION|UNAPPLIED_CHANGES/);assert.deepEqual(x.f.row(),before);assert.equal(x.posts().length,0);assert.equal(d.dialog(),undefined);
  });
  for(const gate of ['view','edit'])void test(`${scope}: ${gate} revocation during choice still rejects with no mutation`,async t=>{
    const x=await fixture({scope});t.after(x.f.close);const d=dom(x);await stageChanges(x,[[path,'Mine']]);await peer(x,[[path,'Peer']]);const pending=x.bridge.execute(scope,'save');await d.wait();await x.f.mutateValues(values=>{const users=JSON.parse(values.platformUsers),prefix=scope==='AB'?'ab':'c';users[0].accessOverrides[prefix+'.'+gate]=false;if(gate==='edit')users[0].accessOverrides[prefix+'.save']=false;values.platformUsers=JSON.stringify(users);});const before=x.f.row();d.choose('mine');await assert.rejects(pending,/FORBIDDEN/);assert.deepEqual(x.f.row(),before);assert(x.bridge.localDirty(scope));assert.equal(x.posts().length,1);
  });
  void test(`${scope}: unknown chosen Save preserves exact sent command, never reopens chooser or POSTs again`,async t=>{
    const x=await fixture({scope});t.after(x.f.close);const d=dom(x);await stageChanges(x,[[path,'Mine']]);await peer(x,[[path,'Peer']]);x.mode('lost');const fetch=x.box.fetch;x.box.fetch=(url,opt)=>url.includes('operationId=')?Promise.resolve(Response.json({error:'OPERATION_NOT_FOUND'},{status:404})):fetch(url,opt);const pending=x.bridge.execute(scope,'save');await d.wait();d.choose('mine');await assert.rejects(pending,/RESULT_UNKNOWN/);const marker=[...x.disk];assert.equal(x.posts().length,1);assert.equal(d.opened(),1);assert(x.bridge.client(scope).hasUnknown());await assert.rejects(x.bridge.execute(scope,'save'),/UNKNOWN_OPERATION_CHECK_REQUIRED/);assert.deepEqual([...x.disk],marker);assert.equal(x.posts().length,1);assert.equal(d.opened(),1);
  });
}
void test('structural/category route conflicts remain guarded, not silently converted into display-field choices',async t=>{
 const x=await fixture();t.after(x.f.close);const d=dom(x),category=['categoryGroups',{id:'group-a'},'name'];await stageChanges(x,[[category,'Local group'],[path,'Mine']]);await peer(x,[[path,'Peer']]);const before=x.f.row();await assert.rejects(x.bridge.execute('AB','save'),/DEPENDENCY_CHANGED|CATALOG|GROUP/);assert.equal(d.opened(),0);assert.deepEqual(x.f.row(),before);assert(x.bridge.localDirty('AB'));
});
void test('removed target cannot be recreated by choosing mine',async t=>{
 const x=await fixture();t.after(x.f.close);const d=dom(x);await stageChanges(x,[[path,'Mine']]);await x.f.mutateValues(values=>{const root=JSON.parse(values.masterDataControl);root.workflowScopes.AB.working.products=[];values.masterDataControl=JSON.stringify(root);});const before=x.f.row();await assert.rejects(x.bridge.execute('AB','save'),/ENTITY_REMOVED|DEPENDENCY_CHANGED/);assert.equal(d.opened(),0);assert.deepEqual(x.f.row(),before);assert(x.bridge.localDirty('AB'));
});
for(const scope of ['AB','C']){
 void test(`${scope}: choosing theirs with no local survivors still atomically saves the observed remote working`,async t=>{
  const x=await fixture({scope});t.after(x.f.close);const d=dom(x);await stageChanges(x,[[path,'Mine']]);await peer(x,[[path,'Peer']]);const pending=x.bridge.execute(scope,'save');await d.wait();d.choose('theirs');const result=await pending;assert.equal(result.control.workflow.saved.content.products[0].name,'Peer');assert.equal(x.posts().length,1);assert.equal(x.posts()[0].body.command.input.batches[0].patches.length,0);assert.equal(x.posts()[0].body.command.input.batches[0].guards.length,1);assert.equal(x.bridge.localDirty(scope),false);
 });
 void test(`${scope}: a confirmed raced rejection permits only a new explicit Save and fresh choice`,async t=>{
  const x=await fixture({scope});t.after(x.f.close);const d=dom(x);await stageChanges(x,[[path,'Mine']]);await peer(x,[[path,'Peer']]);const first=x.bridge.execute(scope,'save');await d.wait();await peer(x,[[path,'Newer peer']]);d.choose('mine');await assert.rejects(first,/DEPENDENCY_CHANGED/);assert.equal(x.posts().length,1);assert.equal(x.disk.size,0);
  const second=x.bridge.execute(scope,'save');await d.wait();assert.equal(x.posts().length,1);d.choose('theirs');const result=await second;assert.equal(result.control.workflow.saved.content.products[0].name,'Newer peer');assert.equal(x.posts().length,2);assert.notEqual(x.posts()[0].body.command.operationId,x.posts()[1].body.command.operationId);assert.equal(d.opened(),2);
 });
 void test(`${scope}: pending lock introduced during choice cannot be cleared or bypassed`,async t=>{
  const x=await fixture({scope});t.after(x.f.close);const d=dom(x);await stageChanges(x,[[path,'Mine']]);await peer(x,[[path,'Peer']]);const pending=x.bridge.execute(scope,'save');await d.wait();await x.f.mutateValues(values=>{const root=JSON.parse(values.masterDataControl);root.workflowScopes[scope].pendingId='pending-fixture';values.masterDataControl=JSON.stringify(root);});const before=x.f.row();d.choose('mine');await assert.rejects(pending,/PENDING_LOCKED/);assert.deepEqual(x.f.row(),before);assert(x.bridge.localDirty(scope));assert.equal(x.posts().length,1);
 });
 void test(`${scope}: failed Save-time read leaves local input with zero POST and no sent marker`,async t=>{
  const x=await fixture({scope});t.after(x.f.close);const d=dom(x);await stageChanges(x,[[path,'Mine']]);const before=x.f.row();x.box.fetch=async()=>Response.json({error:'SYNTHETIC_READ_UNAVAILABLE'},{status:503});await assert.rejects(x.bridge.execute(scope,'save'),/SYNTHETIC_READ_UNAVAILABLE/);assert.deepEqual(x.f.row(),before);assert.equal(x.posts().length,0);assert.equal(x.disk.size,0);assert.equal(d.opened(),0);assert(x.bridge.localDirty(scope));
 });
}
void test('Vietnamese choice labels and untrusted values stay plain text in one native dialog',async t=>{
 const x=await fixture();t.after(x.f.close);const d=dom(x);x.box.document.documentElement.lang='vi';await stageChanges(x,[[path,'<img src=x onerror=unsafe>']]);await peer(x,[[path,'Peer']]);const pending=x.bridge.execute('AB','save');await d.wait();assert.deepEqual(d.nodes.filter(n=>n.tag==='button').map(n=>n.textContent),['Dùng của tôi','Dùng của người khác','Hủy']);assert(d.nodes.some(n=>n.textContent.includes('<img src=x onerror=unsafe>')));assert.equal(d.nodes.some(n=>n.tag==='img'),false);assert.equal(d.dialog().attrs['aria-labelledby'],'master-save-choice-title');assert.equal(d.nodes.find(n=>n.dataset.masterSaveChoice==='cancel').autofocus,true);d.choose('cancel');assert.equal(await pending,null);
});
for(const scope of ['AB','C'])void test(`${scope}: snapshot changed while the existing queue flushes is not mistaken for the captured input`,async t=>{
 const x=await fixture({scope});t.after(x.f.close);await stageChanges(x,[[path,'Captured']]);const client=x.bridge.client(scope),flush=client.flush;let release,entered;const gate=new Promise(resolve=>release=resolve),waiting=new Promise(resolve=>entered=resolve);client.flush=async()=>{entered();await gate;return flush();};
 const pending=x.bridge.execute(scope,'save');await waiting;x.draft().snapshot.products[0].name='Later unsent';const before=x.f.row();release();await assert.rejects(pending,/UNAPPLIED_CHANGES/);assert.deepEqual(x.f.row(),before);assert.equal(x.posts().length,0);assert.equal(x.draft().snapshot.products[0].name,'Later unsent');assert(x.bridge.localDirty(scope));
 client.flush=flush;await x.bridge.execute(scope,'apply');const result=await x.bridge.execute(scope,'save');assert.equal(result.control.workflow.saved.content.products[0].name,'Later unsent');assert.equal(x.posts().length,1);
});
