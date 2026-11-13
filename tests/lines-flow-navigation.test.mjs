import test from 'node:test';import assert from 'node:assert/strict';
import {setup,until} from './master-page-approved-history-ui-fixture.mjs';
void test('LINES committed departure cancels an unsent conflict dialog; reentry cannot revive old RAM or a pending action',async t=>{
 const x=await setup(t,'LINES');await x.click('開啟草稿');x.fill('線別名稱','Unsent mine');const current=(await x.send('LINES')).body.control,path=['AB','lines',{id:'line-A'},'name'];
 const peer=await x.send('LINES',{command:x.save(current,[{patches:[{op:'set',path,value:'Saved peer'}],guards:[{path,value:current.workflow.working.AB.lines[0].name}]}])},'reviewer');assert.equal(peer.status,200,JSON.stringify(peer.body));const row=x.snapshot().row,posts=x.posts().length;
 x.button('存取草稿').click();await until(()=>x.doc.querySelector('dialog'));x.c.ProcessMasterPages.leave();x.root.dataset.activeTab='users';await until(()=>!x.api.busy());assert.equal(x.doc.querySelector('dialog'),null);assert.equal(x.posts().length,posts);assert.deepEqual(x.snapshot().row,row);
 x.root.dataset.activeTab='line-admin';const next=x.c.ProcessMasterPages.mount(x.root,{page:'LINES'});await until(()=>!next.busy()&&x.field('線別名稱')?.value==='Saved peer');assert.equal(next.dirty(),false);assert.equal(x.posts().length,posts);
});
void test('LINES no-conflict Save performs one comparison read and one CAS without polling or redundant confirmation read',async t=>{
 const x=await setup(t,'LINES');await x.click('開啟草稿');x.fill('線別名稱','One LINES Save');const start=x.calls.length;await x.click('存取草稿');const calls=x.calls.slice(start),post=calls.findIndex(row=>row.method==='POST');assert.equal(calls.slice(0,post).filter(row=>row.method==='GET').length,1);assert.equal(calls.filter(row=>row.method==='POST').length,1);assert(Number.isSafeInteger(calls[post].body.command.expectedRevision));assert.equal((await x.readRoot()).workflowScopes.LINES.saved.content.AB.lines[0].name,'One LINES Save');
});

void test('LINES editing updates discard and submit availability immediately; cancel restores base with zero write',async t=>{
 const x=await setup(t,'LINES');await x.click('開啟草稿');x.fill('線別名稱','Saved baseline');await x.click('存取草稿');const posts=x.posts().length;assert.equal(x.button('送審').disabled,false);assert.equal(x.button('取消本機修改').disabled,true);
 x.fill('線別名稱','Unsent edit');assert.equal(x.button('取消本機修改').disabled,false);assert.equal(x.button('送審').disabled,true);await x.click('取消本機修改');assert.equal(x.field('線別名稱').value,'Saved baseline');assert.equal(x.button('取消本機修改').disabled,true);assert.equal(x.button('送審').disabled,false);assert.equal(x.posts().length,posts);
});
