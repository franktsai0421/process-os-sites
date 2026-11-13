import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import ts from 'typescript';
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

void test('LINES actual approve button reloads its independent owner and refreshes production canvas routing without PROCESS approval',async t=>{
 const x=await setup(t,'LINES'),original=await x.readRoot(),control={active:{},versions:[]},runtime={routing:{lines:[...original.active.LINES.AB.lines,...original.active.LINES.C.lines],productRoutes:{}},categoryGroups:[]};
 Object.assign(x.c,{control,clone:value=>JSON.parse(JSON.stringify(value)),data:{products:[],categories:[]},routing:{productRoutes:{},lines:[]},lines:[],reconcileEditorMaster(){}});x.c.ProcessSync.catalog=runtime;
 vm.runInContext(fs.readFileSync('public/process/master-shared-client.js','utf8'),x.c);const bridge=x.c.createMasterSharedBridge({control});
 const source=ts.createSourceFile('master-data.js',fs.readFileSync('public/process/master-data.js','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);let actual;const find=node=>{if(ts.isFunctionDeclaration(node)&&node.name?.text==='applyActive')actual=node.getText(source);ts.forEachChild(node,find);};find(source);assert(actual);vm.runInContext(actual,x.c);
 x.c.MasterDataWorkflow={loadScope:scope=>{assert.equal(scope,'LINES');return bridge.load(scope);},applyActive:()=>x.c.applyActive()};
 await x.click('開啟草稿');x.fill('線別名稱','Approved canvas refresh');await x.click('存取草稿');await x.click('送審');await x.click('核准');assert.equal(x.api.inspect().error,'');assert.equal(x.c.routing.lines[0].name,'Approved canvas refresh');assert.equal(control.active.AB.products,undefined,'owner remains independent topology; fallback is read-only composition');assert.equal(control.active.PROCESS,undefined);assert.deepEqual((await x.readRoot()).active.PROCESS,original.active.PROCESS);assert.equal(x.posts().length,4);
});
