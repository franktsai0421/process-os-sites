// Compiled Miniflare HTTP only. No browser, native UI, live account or outbound requests.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {setup,waitForChoice} from './iqc-save-choice-fixture.mjs';
import {createRootEntryFixture} from './root-entry-native-fixture.mjs';
void test('compiled IQC handler accepts actual grouped revival caller and preserves checkbox/independent fields',async()=>{
 const h=await setup();let native;
 try{
  await h.stage({nameVi:'Compiled local',isEnabled:false});await h.stage({nameVi:'Independent'},'parts','part');await h.peerSave({isDeleted:true});
  const state=await h.f.core.readState(),values=Object.fromEntries(Object.entries(state.values));
  native=await createRootEntryFixture({syntheticBindings:{PROCESS_IMPORT_ENABLED:'0',PROCESS_SESSION_SECRET:h.f.env.PROCESS_SESSION_SECRET}});
  for(const sql of fs.readFileSync(new URL('../scripts/session-revocation-schema.sql',import.meta.url),'utf8').replace(/^--.*$/gm,'').split(';').map(value=>value.trim()).filter(value=>/^CREATE (?:TABLE|INDEX) /.test(value)))await native.db.prepare(sql).run();
  await native.db.prepare('INSERT INTO shared_state(id,revision,"values",updated_at) VALUES(1,?,?,?)').bind(state.revision,JSON.stringify(values),'synthetic').run();
  const origin=native.url.origin;
  h.c.fetch=async(url,options={})=>{h.requests.push({url:String(url),method:options.method||'GET',body:options.body});return native.mf.dispatchFetch(new URL(url,origin).href,{...options,headers:{...options.headers,origin,cookie:h.f.cookies.editor}});};
  const task=h.probe.post('save');await Promise.race([waitForChoice(h.doc),task.then(()=>{throw Error('EXPECTED_CONFLICT_CHOOSER');})]);h.doc.querySelector('[data-iqc-save-choice="mine"]').click();await task;
  assert.equal(h.posts().length,1);assert.equal(JSON.parse(h.posts()[0].body).command.moduleAction,'save-local-revive-v1');assert.equal(h.probe.transport().hasUnknown(),false);
  const read=await native.mf.dispatchFetch(origin+'/api/iqc/workflow?caseMetadata=1',{headers:{cookie:h.f.cookies.editor}});assert.equal(read.status,200);const saved=(await read.json()).control.workflow.saved.content;
  assert.equal(saved.items[0].nameVi,'Compiled local');assert.equal(saved.items[0].isEnabled,false);assert.equal(saved.items[0].isDeleted,false);assert.equal(saved.parts[0].nameVi,'Independent');assert.equal(saved.items[0].checkNo,'P-IQC-L1-01');
  console.log(JSON.stringify({execution:'compiled-Miniflare-HTTP',programCommit:native.programCommit,buildEntrySha256:native.buildEntrySha256,posts:h.posts().length,browser:false,nativeUI:false}));
 }finally{await native?.close();h.close();}
});
