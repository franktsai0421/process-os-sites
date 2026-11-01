import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const source=fs.readFileSync('public/process/version-draft-ui.js','utf8'),start=source.indexOf('  function submitSnapshotHTML('),end=source.indexOf('  const updateSaved=',start);
const box={document:{documentElement:{lang:'zh'}},host:{ProcessSync:{identity:{id:'writer'}}},h:value=>String(value),date:value=>value,t:value=>value};vm.createContext(box);vm.runInContext(source.slice(start,end),box);
await test('dirty snapshot and implicit Save cannot open a saved-only confirmation',async()=>{
 await assert.rejects(box.confirmSubmit('','AB',{masterSnapshot:{dirty:true,changes:[]}}),/UNSAVED_CHANGES_SAVE_REQUIRED/);
 await assert.rejects(box.confirmSubmit('','AB',{saveBeforeSubmit:true}),/UNSAVED_CHANGES_SAVE_REQUIRED/);
});
await test('exact saved snapshot shows revision and approved-to-saved change count without override checkbox',()=>{
 const html=box.submitSnapshotHTML({id:'save-123',revision:17,savedActor:'Synthetic',changes:[{kind:'products'}]});
 assert(html.includes('save-123'));assert(html.includes('17'));assert(html.includes('Synthetic'));assert(html.includes('相較正式版，共 1 筆變更'));assert(!html.includes('data-submit-snapshot-ack'));
});
const shared=fs.readFileSync('public/process/shared-draft-client.js','utf8'),helper=shared.slice(shared.indexOf('  window.captureSharedDraftSubmission='),shared.indexOf('  // Begin alone'));
function bridgeFixture(){
 let captured,prompts=0;const saved={id:'save',at:'2026-10-30T00:00:00Z',actor:{name:'Synthetic'},content:{products:[{id:'p1'},{id:'p2'}]}},flow={generation:'g',revision:4,saved,working:structuredClone(saved.content)};
 const window={ProcessSync:{identity:{id:'writer'}},VersionDraftUI:{masterChanges:()=>[],reasonFor:()=>'',confirmSubmit:async(reason,scope,options)=>{prompts++;captured=options;return null;}}};
 vm.runInNewContext(helper+'\n'+fs.readFileSync('public/process/master-shared-client.js','utf8'),{window,document:{documentElement:{lang:'zh'},querySelector:()=>null}});
 const bridge=window.createMasterSharedBridge({control:{versions:[],workflowScopes:{AB:flow}}});return{bridge,flow,captured:()=>captured,prompts:()=>prompts};
}
await test('bridge rejects unlisted dirty content before opening confirmation',async()=>{
 const f=bridgeFixture();f.flow.working.products.reverse();await assert.rejects(f.bridge.submit('AB'),/UNSAVED_CHANGES_SAVE_REQUIRED/);assert.equal(f.prompts(),0);
});
await test('bridge passes exact saved version metadata and cancel sends no request',async()=>{
 const f=bridgeFixture();await f.bridge.submit('AB');assert.equal(f.captured().savedVersion.id,'save');assert.equal(f.captured().savedVersion.revision,4);assert.equal(f.captured().masterSnapshot.dirty,false);assert.equal(f.prompts(),1);
});
