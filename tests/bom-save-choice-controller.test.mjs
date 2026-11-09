// Actual BOM closure + primary transport + recovery helpers in the synthetic
// DOM port. These assertions do not stand in for real-server or browser tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,posts,turn} from './bom-navigation-actual-fixture.mjs';

async function dialog(f){
 for(let i=0;i<30;i++){const node=f.document.querySelector('dialog.bw-save-conflicts');if(node)return node;await turn();}
 assert.fail('Expected one whole-save conflict dialog');
}
function conflicting(f){
 f.start();f.edit('itemName','My name');f.edit('specification','My spec');f.edit('unit','my unit');f.finish();
 f.remote.working.bom.ROOT[0].itemName='Their name';
 f.remote.working.bom.ROOT[0].specification='Their spec';
 f.remote.working.bom.ROOT[1].itemName='Their disjoint row';f.remote.revision++;
}
for(const choice of ['mine','theirs'])void test('BOM one '+choice+' choice covers every collision and preserves disjoint edits',async()=>{
 const f=await fixture();try{
  conflicting(f);const task=f.save(),node=await dialog(f);
  assert.equal(f.document.querySelectorAll('dialog.bw-save-conflicts').length,1);
  assert.equal(node.querySelectorAll('tbody tr').length,2);
  assert.equal(posts(f).length,0);node.querySelector('[data-bw-conflict="'+choice+'"]').click();await task;
  const rows=f.remote.saved.content.bom.ROOT;
  assert.equal(rows[0].itemName,choice==='mine'?'My name':'Their name');
  assert.equal(rows[0].specification,choice==='mine'?'My spec':'Their spec');
  assert.equal(rows[0].unit,'my unit');assert.equal(rows[1].itemName,'Their disjoint row');
  assert.equal(posts(f).length,1);assert.equal(f.api.state().pending.length,0);
 }finally{await f.close();}
});
for(const action of ['button','escape','close'])void test('BOM conflict '+action+' cancellation preserves journal and shared data',async()=>{
 const f=await fixture();try{
  conflicting(f);f.tick();const pending=JSON.stringify(f.api.state().pending),editor=JSON.stringify(f.api.editor()),remote=JSON.stringify(f.remote),stored=[...f.data];
  const task=f.save(),node=await dialog(f);
  if(action==='button')node.querySelector('[data-bw-conflict="cancel"]').click();
  else node.dispatchEvent({type:action==='escape'?'cancel':'close',preventDefault(){}});
  assert.equal(await task,false);assert.equal(posts(f).length,0);
  assert.equal(JSON.stringify(f.api.state().pending),pending);assert.equal(JSON.stringify(f.api.editor()),editor);
  assert.equal(JSON.stringify(f.remote),remote);assert.deepEqual([...f.data],stored);
 }finally{await f.close();}
});
void test('BOM conflict double-click shares one save and one chooser',async()=>{
 const f=await fixture();try{conflicting(f);const first=f.save(),second=f.save();assert.strictEqual(first,second);const node=await dialog(f);assert.equal(f.document.querySelectorAll('dialog').length,1);node.querySelector('[data-bw-conflict="mine"]').click();await Promise.all([first,second]);assert.equal(posts(f).length,1);}finally{await f.close();}
});
for(const change of ['local','permission'])void test('BOM changed '+change+' during choice requires reconfirmation without dispatch',async()=>{
 const f=await fixture();try{
  conflicting(f);const task=f.save(),node=await dialog(f);
  if(change==='local'){f.start();f.edit('unit','Newer local');}
  if(change==='remote'){f.remote.working.bom.ROOT[0].itemName='Later remote';f.remote.revision++;}
  if(change==='permission')f.permissions({edit:false,save:false});
  const before=JSON.stringify(f.remote);node.querySelector('[data-bw-conflict="mine"]').click();
  await assert.rejects(task,/RECONFIRM|FORBIDDEN/);assert.equal(posts(f).length,0);assert.equal(JSON.stringify(f.remote),before);assert.equal(f.api.state().pending.length,1);
  if(change==='local')assert.equal(f.api.editor().ROOT[0].unit,'Newer local');
 }finally{await f.close();}
});
void test('BOM large RAM-only conflict still requires choice and Cancel preserves its original basis',async()=>{
 const f=await fixture(),large='manual text '.repeat(3000);try{
  f.start();f.edit('itemName',large);f.finish();f.tick();
  assert.equal(f.session().status().code,'EMPTY','large unsent content has no recovery payload');
  const pending=JSON.stringify(f.api.state().pending);
  f.remote.working.bom.ROOT[0].itemName='Remote same-field change';f.remote.revision++;
  const before=JSON.stringify(f.remote),task=f.save(),node=await dialog(f);
  assert.equal(posts(f).length,0);node.querySelector('[data-bw-conflict="cancel"]').click();assert.equal(await task,false);
  assert.equal(JSON.stringify(f.api.state().pending),pending);assert.equal(f.api.editor().ROOT[0].itemName,large);
  assert.equal(JSON.stringify(f.remote),before);assert.equal(posts(f).length,0);
 }finally{await f.close();}
});

for(const outcome of ['mine','theirs','cancel'])void test('BOM fresh peer revision during choice reopens the whole group from original basis: '+outcome,async()=>{
 const f=await fixture();try{
  conflicting(f);const base=JSON.stringify(f.api.state().pending),task=f.save(),first=await dialog(f);
  f.remote.working.bom.ROOT[0].itemName='Latest peer name';f.remote.working.bom.ROOT[0].unit='Latest peer unit';f.remote.revision++;
  first.querySelector('[data-bw-conflict="mine"]').click();const second=await dialog(f);
  assert.notEqual(second,first);assert.equal(second.querySelectorAll('tbody tr').length,3);assert(second.textContent.includes('Latest peer name'));assert(second.textContent.includes('Latest peer unit'));assert.equal(posts(f).length,0);assert.equal(JSON.stringify(f.api.state().pending),base);
  second.querySelector('[data-bw-conflict="'+outcome+'"]').click();const result=await task;
  if(outcome==='cancel'){assert.equal(result,false);assert.equal(posts(f).length,0);assert.equal(JSON.stringify(f.api.state().pending),base);return;}
  assert.equal(posts(f).length,1);const rows=f.remote.saved.content.bom.ROOT;assert.equal(rows[0].itemName,outcome==='mine'?'My name':'Latest peer name');assert.equal(rows[0].unit,outcome==='mine'?'my unit':'Latest peer unit');assert.equal(rows[1].itemName,'Their disjoint row');
 }finally{await f.close();}
});
void test('BOM fresh converged peer values remove conflicts and finish the same Save without a new click',async()=>{
 const f=await fixture();try{conflicting(f);const task=f.save(),first=await dialog(f);f.remote.working.bom.ROOT[0].itemName='My name';f.remote.working.bom.ROOT[0].specification='My spec';f.remote.revision++;first.querySelector('[data-bw-conflict="theirs"]').click();await task;assert.equal(posts(f).length,1);assert.equal(f.document.querySelector('dialog.bw-save-conflicts'),null);assert.equal(f.remote.saved.content.bom.ROOT[0].unit,'my unit');}finally{await f.close();}
});
