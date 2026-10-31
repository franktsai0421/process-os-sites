import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const source=fs.readFileSync('public/process/version-draft-ui.js','utf8'),start=source.indexOf('  function submitSnapshotHTML('),end=source.indexOf('  function bindSubmitSnapshot(',start);
const box={document:{documentElement:{lang:'zh'}},h:value=>String(value),date:value=>value,t:value=>value};vm.createContext(box);vm.runInContext(source.slice(start,end),box);
await test('snapshot warning and required acknowledgement survive an unlisted difference',()=>{
 const html=box.submitSnapshotHTML({dirty:true,changes:[],savedActor:'Synthetic'});assert(html.includes('data-submit-snapshot-ack'));assert(html.includes('required'));assert(html.includes('未儲存變更'));assert(!html.includes('目前共用草稿與這份已儲存內容相同'));assert(!html.includes('data-submit-change-list'));
});
await test('identical snapshot has no saved-only acknowledgement',()=>{const html=box.submitSnapshotHTML({dirty:false,changes:[]});assert(!html.includes('data-submit-snapshot-ack'));assert(html.includes('目前共用草稿與這份已儲存內容相同'));});
await test('bridge computes dirty from content independently of an empty display summary',async()=>{
 let captured;const saved={id:'save',content:{products:[{id:'p1'},{id:'p2'}]}},flow={generation:'g',saved,working:{products:[{id:'p2'},{id:'p1'}]}};
 const window={ProcessSync:{identity:{id:'writer'}},VersionDraftUI:{masterChanges:()=>[],reasonFor:()=>'',confirmSubmit:async(reason,scope,options)=>{captured=options.masterSnapshot;return null;}}};
 vm.runInNewContext(fs.readFileSync('public/process/master-shared-client.js','utf8'),{window,document:{documentElement:{lang:'zh'}}});
 const bridge=window.createMasterSharedBridge({control:{versions:[],workflowScopes:{AB:flow}}});await bridge.submit('AB');assert.equal(captured.dirty,true);assert.equal(captured.changes.length,0);
});
