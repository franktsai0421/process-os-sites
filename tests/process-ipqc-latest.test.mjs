import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './process-ipqc-adoption-fixture.mjs';
const plain=v=>JSON.parse(JSON.stringify(v)),tick=()=>new Promise(setImmediate);
const latest=f=>f.panel().querySelector('[data-ipqc-latest]');
for(const line of ['A','B','C'])for(const lang of ['zh','vi'])for(const expanded of [false,true])void test(`${line}/${lang}/${expanded?'expanded':'collapsed'} direct adoption preserves one selection, source, details and saved reload`,async()=>{
 const f=await fixture({line,lang});const item=f.versions[1].snapshot.items[0];item.standard='20.0 ± 0.2 mm';item.equipmentSnapshot={assetCode:'SYN-GAUGE-02',pieceMark:'G',name:'New gauge'};
 await f.open();const quality=plain(f.quality),detail=f.panel().querySelector('.process-ipqc-item-details');detail.open=expanded;if(expanded)detail.dispatchEvent({type:'toggle'});
 assert(latest(f));f.historyStatus(403);const first=latest(f),pending=first.click();await first.click();await pending;await tick();
 assert.equal(f.panel().querySelector('[data-ipqc-choice]').checked,true);assert.equal(f.panel().querySelector('article').dataset.status,'selected');assert.equal(latest(f),null);assert.equal(f.panel().querySelectorAll('[data-ipqc-warning]').length,0);
 assert.equal(detail.open,expanded);if(!expanded){detail.open=true;detail.dispatchEvent({type:'toggle'});}assert.match(detail.textContent,/20.0 ± 0.2 mm/);assert.match(detail.textContent,/SYN-GAUGE-02/);assert.equal(f.record().draft.ipqcAssignments.length,1);assert.equal(f.record().draft.ipqcAssignments[0].sourceVersionId,'new');assert.equal(f.posts().length,0);assert.equal(f.calls.some(c=>c.url.includes('versionId=')),false,'history permission is not used to edit an assignment');
 await f.finish();await f.box.ProcessAuthoringV3.save();assert.equal(f.posts().length,1);assert.equal(f.remote.workflow.saved.content.workspaces[0].stages.CUT[0].ipqcAssignments.length,1);assert.equal(f.remote.workflow.saved.content.workspaces[0].stages.CUT[0].ipqcAssignments[0].sourceVersionId,'new');
 await f.box.ProcessAuthoringV3.load();f.box.ProcessOpenOperation(f.project());f.dialog().querySelector('[data-tab="ipqc"]').click();await tick();assert.equal(latest(f),null);assert.equal(f.panel().querySelector('[data-ipqc-choice]').checked,true);const reloaded=f.panel().querySelector('.process-ipqc-item-details');reloaded.open=true;reloaded.dispatchEvent({type:'toggle'});assert.match(reloaded.textContent,/20.0 ± 0.2 mm/);assert.match(reloaded.textContent,/SYN-GAUGE-02/);assert.deepEqual(plain(f.quality),quality);
});
for(const line of ['A','B','C'])for(const change of ['source','unavailable','edit','view','pending','saved','peer','other-workspace','local-other-workspace','epoch','delivery','duplicate'])void test(`${line} direct adoption refuses ${change} without changing the original tuple`,async()=>{
 const f=await fixture({line});if(change==='local-other-workspace'){const w=structuredClone(f.remote.workflow.working.workspaces[0]);w.id='local-other';w.category=line==='C'?'ANOTHER':'SYN';for(const op of w.stages.CUT)op.ipqcAssignments=[];f.remote.workflow.working.workspaces.push(w);await f.box.ProcessAuthoringV3.load();}await f.open();const before=plain(f.project().ipqcAssignments),button=latest(f);
 if(change==='source')f.versions[1].snapshot.items[0].standard='Raced source';
 if(change==='unavailable')f.quality.scopes['A:SYN'].activeVersionId='missing';
 if(change==='edit')f.permissions.edit=false;if(change==='view')f.permissions.view=false;if(change==='pending')f.remote.workflow.pendingId='peer';if(change==='saved')f.remote.workflow.saved={id:'peer-save'};
 if(change==='peer')f.remote.workflow.working.workspaces[0].stages.CUT[1].ipqcAssignments=plain(before);
 if(change==='other-workspace'){const w=structuredClone(f.remote.workflow.working.workspaces[0]);w.id='other';w.category=line==='C'?'ANOTHER':'SYN';f.remote.workflow.working.workspaces.push(w);}
 if(change==='local-other-workspace')f.box.ProcessCanvasLocal.edit('local-other','CUT',[{id:'two',f:'ipqcAssignments',value:plain(before)}]);
 if(['epoch','delivery'].includes(change))f.change(change);
 if(change==='duplicate'){// A malformed original tuple must not be normalized by adoption.
 const input=f.panel().querySelector('[data-ipqc-choice]');assert(input.checked);f.remote.workflow.working.workspaces[0].stages.CUT[0].ipqcAssignments.push(plain(before[0]));}
 await button.click();await tick();assert.equal(f.posts().length,0);assert.equal(f.record()?.draft.ipqcAssignments[0].sourceVersionId??f.project().ipqcAssignments[0].sourceVersionId,'old');assert(latest(f));assert.match(f.panel().textContent,/未採用/);
});
