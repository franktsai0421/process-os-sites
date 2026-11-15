import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {setup} from './canvas-approved-history-fixture.mjs';
async function settle(f){for(const [id,timer]of f.timers)if(timer.ms===0){f.timers.delete(id);timer.fn();}const until=Date.now()+5000;do{await new Promise(r=>setTimeout(r,10));}while(/內容驗證中/.test(f.root.textContent)&&Date.now()<until);}
void test('saved whole-platform inspection survives a category filter with no polling',async t=>{
 const f=await setup();t.after(f.close);f.box.ProcessEditorV2.departure.inspect=()=>({state:'clean',hasDialog:false});
 await f.api.save();await settle(f);assert.equal(f.doc.querySelector('[data-av3="submit"]').disabled,false);
 const result=await f.api.changeCanvasView({kind:'filter',run(){f.box.state.category='OTHER';f.box.render();}});
 assert.equal(result.status,'ready');await settle(f);
 assert.equal(f.doc.querySelector('[data-av3="submit"]').disabled,false,f.root.textContent);
});
void test('an inspection response ahead of the adopted workflow offers explicit safe retry',async t=>{
 let armed=false;
 const f=await setup({intercept:async(url,o,send)=>{const r=await send();if(armed&&url.includes('contentIssues=1')){const b=await r.json();b.revision++;return Response.json(b);}return r;}});t.after(f.close);
 await f.api.save();armed=true;await settle(f);
 assert.equal(f.doc.querySelector('[data-av3="submit"]').disabled,true);
 assert.match(f.root.textContent,/重試|Thử/);armed=false;await f.doc.querySelector('[data-av3="retry"]').click();await settle(f);assert.equal(f.doc.querySelector('[data-av3="submit"]').disabled,false);
});

void test('pinned remote main independently reproduces CANVAS_REVIEW_CHANGED and stranded unchecked saved state',async t=>{
 const source=execFileSync('git',['show','e040a7e838133c0c9870850a49955cf045dbc02b:public/process/process-authoring-v3.js'],{encoding:'utf8'});
 const f=await setup({authoringSource:source});t.after(f.close);f.box.ProcessEditorV2.departure.inspect=()=>({state:'clean',hasDialog:false});await f.api.save();await settle(f);assert.equal(f.doc.querySelector('[data-av3="submit"]').disabled,false);
 await assert.rejects(f.api.changeCanvasView({kind:'filter',run(){f.box.state.category='OTHER';f.box.render();}}),/CANVAS_REVIEW_CHANGED/);await settle(f);assert.equal(f.doc.querySelector('[data-av3="submit"]').disabled,true);assert.match(f.root.textContent,/尚未檢查/);
});
for(const kind of ['line','stage'])void test(kind+' successful guarded navigation schedules fresh inspection without an automatic write',async t=>{
 const f=await setup();t.after(f.close);f.box.ProcessEditorV2.departure.inspect=()=>({state:'clean',hasDialog:false});await f.api.save();await settle(f);const count=f.calls.length;
 f.box.ProcessDeliveryNavigation={guardAction:async spec=>{spec.run();return{status:'ready'};}};
 assert.equal((await f.api.changeCanvasView({kind,run(){if(kind==='line')f.box.state.editorLine='C';f.box.render();}})).status,'ready');await settle(f);assert.equal(f.doc.querySelector('[data-av3="submit"]').disabled,false);assert(f.calls.slice(count).some(c=>c.url.includes('contentIssues')));assert(f.calls.slice(count).every(c=>c.method==='GET'));
});
